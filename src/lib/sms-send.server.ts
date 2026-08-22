/**
 * Core SMS job creation pipeline used by the public send endpoint.
 * An HTTP 200 here means "job durably queued", never "SMS delivered".
 */
import { z } from "zod";
import {
  admin,
  bearer,
  exceedsLimit,
  hashSecret,
  isDeviceOnline,
  json,
  jsonError,
  logApiRequest,
  normalizePhone,
  randomId,
  type Admin,
} from "./gatekeeper.server";

const sendSchema = z.object({
  to: z.string().min(5).max(20),
  message: z.string().min(1).max(1600),
  device_id: z.string().max(64).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
});

type ApiKeyRow = {
  id: string;
  user_id: string;
  device_id: string | null;
  scopes: string[];
  revoked_at: string | null;
  expires_at: string | null;
  requests_per_minute: number;
  sms_per_day: number;
};

type DeviceRow = {
  id: string;
  gateway_device_id: string;
  status: string;
  enabled: boolean;
  is_default: boolean;
  is_backup: boolean;
  sms_permission: string;
  last_heartbeat_at: string | null;
  daily_sms_limit: number;
};

const DEVICE_FIELDS =
  "id, gateway_device_id, status, enabled, is_default, is_backup, sms_permission, last_heartbeat_at, daily_sms_limit";

async function pickDevice(
  db: Admin,
  userId: string,
  requested: string | null,
  keyDeviceId: string | null,
  allowBackup: boolean,
): Promise<{ device?: DeviceRow; error?: Response }> {
  const { data } = await db
    .from("gateway_devices")
    .select(DEVICE_FIELDS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false });
  const devices = (data ?? []) as DeviceRow[];
  if (devices.length === 0)
    return { error: jsonError(404, "DEVICE_NOT_FOUND", "No gateway device is registered on this account.") };

  const explicit = requested ?? keyDeviceId;
  let target: DeviceRow | undefined;
  if (explicit) {
    target = devices.find((d) => d.gateway_device_id === explicit || d.id === explicit);
    if (!target) return { error: jsonError(404, "DEVICE_NOT_FOUND", `Unknown device ${explicit}.`) };
  } else {
    target = devices.find((d) => d.is_default && d.status === "active") ?? devices.find((d) => d.status === "active");
  }
  if (!target) return { error: jsonError(404, "DEVICE_NOT_FOUND", "No active gateway device available.") };

  if (!target.enabled || target.status === "disabled")
    return { error: jsonError(403, "DEVICE_DISABLED", `Device ${target.gateway_device_id} is disabled.`) };
  if (target.status !== "active")
    return { error: jsonError(403, "DEVICE_DISABLED", `Device ${target.gateway_device_id} is not verified yet.`) };

  if (!isDeviceOnline(target.last_heartbeat_at)) {
    if (allowBackup) {
      const backup = devices.find(
        (d) => d.id !== target?.id && d.is_backup && d.enabled && d.status === "active" && isDeviceOnline(d.last_heartbeat_at),
      );
      if (backup) return { device: backup };
    }
    return { error: jsonError(503, "DEVICE_OFFLINE", `Device ${target.gateway_device_id} has not reported a heartbeat.`) };
  }
  return { device: target };
}

export async function handleSmsSend(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const db = await admin();

  const token = bearer(request);
  if (!token) return jsonError(401, "MISSING_API_KEY", "Provide an API key via Authorization: Bearer <key>.");

  const { data: keyRow } = await db
    .from("api_keys")
    .select("id, user_id, device_id, scopes, revoked_at, expires_at, requests_per_minute, sms_per_day")
    .eq("key_hash", await hashSecret(token))
    .maybeSingle();
  const apiKey = keyRow as ApiKeyRow | null;
  if (!apiKey) {
    await logApiRequest(db, { method: "POST", path, status_code: 401, error_code: "INVALID_API_KEY" });
    return jsonError(401, "INVALID_API_KEY", "API key is invalid.");
  }
  if (apiKey.revoked_at || (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()))
    return jsonError(401, "INVALID_API_KEY", "API key is revoked or expired.");
  if (!apiKey.scopes.includes("sms:send"))
    return jsonError(403, "FORBIDDEN_SCOPE", "API key lacks the sms:send scope.");

  const fail = async (res: Response, code: string) => {
    await logApiRequest(db, {
      user_id: apiKey.user_id,
      api_key_id: apiKey.id,
      method: "POST",
      path,
      status_code: res.status,
      error_code: code,
    });
    return res;
  };

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(jsonError(422, "INVALID_REQUEST", "Body must be valid JSON."), "INVALID_REQUEST");
  }
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success)
    return fail(
      jsonError(422, "INVALID_REQUEST", "Invalid payload.", { details: parsed.error.flatten().fieldErrors }),
      "INVALID_REQUEST",
    );

  const recipient = normalizePhone(parsed.data.to);
  if (!recipient)
    return fail(
      jsonError(422, "INVALID_PHONE_NUMBER", "Recipient must be a valid E.164 number, e.g. +919876543210."),
      "INVALID_PHONE_NUMBER",
    );

  const idempotencyKey = parsed.data.idempotency_key ?? request.headers.get("idempotency-key") ?? null;

  const { data: profile } = await db
    .from("profiles")
    .select("sms_paused, requests_per_minute, sms_per_hour, sms_per_day, allow_backup_routing")
    .eq("id", apiKey.user_id)
    .maybeSingle();
  if (profile?.sms_paused)
    return fail(jsonError(403, "SMS_PAUSED", "All SMS sending is paused for this account."), "SMS_PAUSED");

  if (idempotencyKey) {
    const { data: existing } = await db
      .from("sms_jobs")
      .select("message_id, status, recipient, body")
      .eq("user_id", apiKey.user_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      if (existing.recipient !== recipient || existing.body !== parsed.data.message)
        return fail(
          jsonError(409, "DUPLICATE_REQUEST", "Idempotency key was already used with a different payload."),
          "DUPLICATE_REQUEST",
        );
      await logApiRequest(db, {
        user_id: apiKey.user_id,
        api_key_id: apiKey.id,
        method: "POST",
        path,
        status_code: 200,
      });
      return json({ success: true, message_id: existing.message_id, status: existing.status, duplicate: true });
    }
  }

  if (await exceedsLimit(db, "api_key", apiKey.id, "minute", apiKey.requests_per_minute))
    return fail(jsonError(429, "RATE_LIMITED", "Per-minute request limit for this API key exceeded."), "RATE_LIMITED");
  if (await exceedsLimit(db, "account", apiKey.user_id, "hour", profile?.sms_per_hour ?? 60))
    return fail(jsonError(429, "RATE_LIMITED", "Hourly account SMS limit exceeded."), "RATE_LIMITED");
  if (await exceedsLimit(db, "account", apiKey.user_id, "day", profile?.sms_per_day ?? 200))
    return fail(jsonError(429, "RATE_LIMITED", "Daily account SMS limit exceeded."), "RATE_LIMITED");
  if (await exceedsLimit(db, "api_key_sms", apiKey.id, "day", apiKey.sms_per_day))
    return fail(jsonError(429, "RATE_LIMITED", "Daily SMS limit for this API key exceeded."), "RATE_LIMITED");

  const picked = await pickDevice(
    db,
    apiKey.user_id,
    parsed.data.device_id ?? null,
    apiKey.device_id,
    profile?.allow_backup_routing ?? false,
  );
  if (picked.error || !picked.device) return fail(picked.error!, "DEVICE_UNAVAILABLE");
  const device = picked.device;

  if (await exceedsLimit(db, "device", device.id, "day", device.daily_sms_limit))
    return fail(jsonError(429, "RATE_LIMITED", "Daily SMS limit for this device exceeded."), "RATE_LIMITED");

  const messageId = randomId("msg");
  const { error: insertError } = await db.from("sms_jobs").insert({
    message_id: messageId,
    user_id: apiKey.user_id,
    device_id: device.id,
    api_key_id: apiKey.id,
    recipient,
    body: parsed.data.message,
    status: "queued",
    idempotency_key: idempotencyKey,
  });
  if (insertError) {
    if (insertError.code === "23505" || insertError.code === "23405" || insertError.code === "23305")
      return fail(jsonError(409, "DUPLICATE_REQUEST", "Duplicate request."), "DUPLICATE_REQUEST");
    if (insertError.code === "23505" || insertError.message.includes("duplicate"))
      return fail(jsonError(409, "DUPLICATE_REQUEST", "Duplicate request."), "DUPLICATE_REQUEST");
    return fail(jsonError(500, "INTERNAL_ERROR", "Could not queue the SMS job."), "INTERNAL_ERROR");
  }

  const { data: job } = await db.from("sms_jobs").select("id").eq("message_id", messageId).maybeSingle();
  if (job)
    await db
      .from("sms_delivery_events")
      .insert({ job_id: job.id, user_id: apiKey.user_id, status: "queued", detail: `assigned to ${device.gateway_device_id}` });

  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);
  await logApiRequest(db, {
    user_id: apiKey.user_id,
    api_key_id: apiKey.id,
    method: "POST",
    path,
    status_code: 202,
  });

  return json({ success: true, message_id: messageId, status: "queued", device_id: device.gateway_device_id }, 202);
}
