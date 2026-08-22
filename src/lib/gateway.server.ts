/**
 * Device-facing gateway protocol (pairing, heartbeat, job claim, acknowledgement).
 * Every call is authenticated with a per-installation device credential token,
 * so a random device can never impersonate a registered gateway.
 */
import { z } from "zod";
import {
  admin,
  bearer,
  hashSecret,
  json,
  jsonError,
  normalizePhone,
  randomId,
  type Admin,
} from "./gatekeeper.server";

const pairSchema = z.object({
  pairing_code: z.string().regex(/^\d{6}$/),
  install_id: z.string().min(8).max(128),
  device_name: z.string().max(80).optional(),
  sender_number: z.string().max(20).optional(),
  android_version: z.string().max(40).optional(),
  app_version: z.string().max(40).optional(),
  sms_permission: z.enum(["granted", "denied", "permanently_denied", "unknown"]).optional(),
  sim_info: z.record(z.string(), z.unknown()).optional(),
});

const heartbeatSchema = z.object({
  sms_permission: z.enum(["granted", "denied", "permanently_denied", "unknown"]).optional(),
  app_version: z.string().max(40).optional(),
  android_version: z.string().max(40).optional(),
  battery_level: z.number().int().min(0).max(100).optional(),
  pending_jobs: z.number().int().min(0).max(10000).optional(),
});

const claimSchema = z.object({ max: z.number().int().min(1).max(20).optional() });

const ackSchema = z.object({
  message_id: z.string().min(4).max(64),
  status: z.enum(["sent", "failed"]),
  error_code: z.string().max(64).optional(),
  error_message: z.string().max(500).optional(),
});

type DeviceContext = { db: Admin; deviceId: string; userId: string; credentialId: string };

async function authenticateDevice(request: Request): Promise<DeviceContext | Response> {
  const db = await admin();
  const token = bearer(request);
  if (!token) return jsonError(401, "MISSING_API_KEY", "Device credential required.");
  const { data } = await db
    .from("device_credentials")
    .select("id, device_id, revoked_at, gateway_devices!inner(user_id, enabled, status)")
    .eq("token_hash", await hashSecret(token))
    .maybeSingle();
  if (!data || data.revoked_at) return jsonError(401, "INVALID_API_KEY", "Device credential is invalid or revoked.");
  const device = data.gateway_devices as unknown as { user_id: string; enabled: boolean; status: string };
  if (!device.enabled || device.status === "disabled")
    return jsonError(403, "DEVICE_DISABLED", "This device has been disabled by its owner.");
  return { db, deviceId: data.device_id as string, userId: device.user_id, credentialId: data.id as string };
}

export async function handlePair(request: Request): Promise<Response> {
  const db = await admin();
  const parsed = pairSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "INVALID_REQUEST", "Invalid pairing payload.");

  const codeHash = await hashSecret(parsed.data.pairing_code);
  const { data: pairing } = await db
    .from("device_pairing_codes")
    .select("id, user_id, device_name, sender_number, expires_at, used_at")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (!pairing || pairing.used_at || new Date(pairing.expires_at) < new Date())
    return jsonError(401, "INVALID_API_KEY", "Pairing code is invalid, expired, or already used.");

  // Single-use: claim the code atomically before creating anything.
  const { data: claimed } = await db
    .from("device_pairing_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", pairing.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return jsonError(409, "DUPLICATE_REQUEST", "Pairing code was already used.");

  const gatewayDeviceId = randomId("gwdev", 20);
  const senderNumber = parsed.data.sender_number
    ? normalizePhone(parsed.data.sender_number)
    : (pairing.sender_number as string | null);

  const { data: device, error } = await db
    .from("gateway_devices")
    .insert({
      user_id: pairing.user_id,
      gateway_device_id: gatewayDeviceId,
      name: parsed.data.device_name ?? pairing.device_name,
      sender_number: senderNumber,
      status: parsed.data.sms_permission === "granted" ? "active" : "pending",
      android_version: parsed.data.android_version ?? null,
      app_version: parsed.data.app_version ?? null,
      sms_permission: parsed.data.sms_permission ?? "unknown",
      sim_info: parsed.data.sim_info ?? null,
      install_id: parsed.data.install_id,
      paired_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .select("id, gateway_device_id, status")
    .single();
  if (error || !device) return jsonError(500, "INTERNAL_ERROR", "Could not register the device.");

  const { count } = await db
    .from("gateway_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", pairing.user_id);
  if ((count ?? 0) <= 1) await db.from("gateway_devices").update({ is_default: true }).eq("id", device.id);

  const deviceToken = randomId("gwtok", 40);
  await db.from("device_credentials").insert({
    device_id: device.id,
    token_hash: await hashSecret(deviceToken),
    install_id: parsed.data.install_id,
  });
  await db.from("device_pairing_codes").update({ device_id: device.id }).eq("id", pairing.id);

  return json({
    success: true,
    gateway_device_id: device.gateway_device_id,
    device_token: deviceToken,
    status: device.status,
  });
}

export async function handleHeartbeat(request: Request): Promise<Response> {
  const ctx = await authenticateDevice(request);
  if (ctx instanceof Response) return ctx;
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(422, "INVALID_REQUEST", "Invalid heartbeat payload.");
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { last_heartbeat_at: now };
  if (parsed.data.sms_permission) {
    patch["sms_permission"] = parsed.data.sms_permission;
    patch["status"] = parsed.data.sms_permission === "granted" ? "active" : "permission_required";
  }
  if (parsed.data.app_version) patch["app_version"] = parsed.data.app_version;
  if (parsed.data.android_version) patch["android_version"] = parsed.data.android_version;

  const { data: device } = await ctx.db
    .from("gateway_devices")
    .update(patch)
    .eq("id", ctx.deviceId)
    .select("gateway_device_id, status, enabled")
    .single();

  await ctx.db.from("device_heartbeats").insert({
    device_id: ctx.deviceId,
    user_id: ctx.userId,
    sms_permission: parsed.data.sms_permission ?? null,
    app_version: parsed.data.app_version ?? null,
    android_version: parsed.data.android_version ?? null,
    battery_level: parsed.data.battery_level ?? null,
    pending_jobs: parsed.data.pending_jobs ?? null,
  });
  await ctx.db.from("device_credentials").update({ last_used_at: now }).eq("id", ctx.credentialId);

  const { data: profile } = await ctx.db.from("profiles").select("sms_paused").eq("id", ctx.userId).maybeSingle();
  const { count } = await ctx.db
    .from("sms_jobs")
    .select("id", { count: "exact", head: true })
    .eq("device_id", ctx.deviceId)
    .eq("status", "queued");

  return json({
    success: true,
    status: device?.status ?? "unknown",
    enabled: device?.enabled ?? false,
    paused: profile?.sms_paused ?? false,
    queued_jobs: count ?? 0,
    // Suggested next poll: keeps the Android worker off a battery-heavy tight loop.
    next_poll_seconds: (count ?? 0) > 0 ? 5 : 60,
  });
}

export async function handleClaim(request: Request): Promise<Response> {
  const ctx = await authenticateDevice(request);
  if (ctx instanceof Response) return ctx;
  const parsed = claimSchema.safeParse(await request.json().catch(() => ({})));
  const max = parsed.success ? (parsed.data.max ?? 5) : 5;

  const { data: profile } = await ctx.db.from("profiles").select("sms_paused").eq("id", ctx.userId).maybeSingle();
  if (profile?.sms_paused) return json({ success: true, jobs: [], paused: true });

  const { data: queued } = await ctx.db
    .from("sms_jobs")
    .select("id, message_id, recipient, body, attempts")
    .eq("device_id", ctx.deviceId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(max);

  const jobs: Array<{ message_id: string; to: string; message: string; attempt: number }> = [];
  for (const job of queued ?? []) {
    const { data: claimed } = await ctx.db
      .from("sms_jobs")
      .update({ status: "sending", claimed_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    await ctx.db
      .from("sms_delivery_events")
      .insert({ job_id: job.id, user_id: ctx.userId, status: "sending", detail: "claimed by gateway device" });
    jobs.push({
      message_id: job.message_id as string,
      to: job.recipient as string,
      message: job.body as string,
      attempt: (job.attempts ?? 0) + 1,
    });
  }
  await ctx.db.from("gateway_devices").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", ctx.deviceId);
  return json({ success: true, jobs });
}

export async function handleAck(request: Request): Promise<Response> {
  const ctx = await authenticateDevice(request);
  if (ctx instanceof Response) return ctx;
  const parsed = ackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "INVALID_REQUEST", "Invalid acknowledgement payload.");

  const { data: job } = await ctx.db
    .from("sms_jobs")
    .select("id, status, attempts")
    .eq("message_id", parsed.data.message_id)
    .eq("device_id", ctx.deviceId)
    .maybeSingle();
  if (!job) return jsonError(404, "DEVICE_NOT_FOUND", "Unknown message for this device.");

  const now = new Date().toISOString();
  const sent = parsed.data.status === "sent";
  // Transient failures go back to the queue (bounded retries); hard failures stay failed.
  const retryable = !sent && (job.attempts ?? 1) < 3 && parsed.data.error_code !== "PERMISSION_DENIED";
  const nextStatus = sent ? "sent" : retryable ? "queued" : "failed";

  await ctx.db
    .from("sms_jobs")
    .update({
      status: nextStatus,
      sent_at: sent ? now : null,
      failed_at: nextStatus === "failed" ? now : null,
      error_code: sent ? null : (parsed.data.error_code ?? "SEND_FAILED"),
      error_message: sent ? null : (parsed.data.error_message ?? null),
    })
    .eq("id", job.id);

  await ctx.db.from("sms_delivery_events").insert({
    job_id: job.id,
    user_id: ctx.userId,
    status: nextStatus,
    detail: sent ? "native SMS API reported success" : (parsed.data.error_message ?? parsed.data.error_code ?? null),
  });

  return json({ success: true, status: nextStatus });
}
