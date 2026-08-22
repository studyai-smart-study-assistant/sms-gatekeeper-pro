/** Server-only dashboard logic. Called exclusively from dashboard.functions.ts. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hashSecret, isDeviceOnline, normalizePhone, randomId, randomNumericCode } from "./gatekeeper.server";

type Db = SupabaseClient<Database>;

export const PAIRING_TTL_MS = 5 * 60 * 1000;

export type Overview = {
  gatewayOnline: boolean;
  smsPaused: boolean;
  deviceCount: number;
  activeDevice: { name: string; gateway_device_id: string; sender_number: string | null; online: boolean } | null;
  sentToday: number;
  sentThisMonth: number;
  failed: number;
  queued: number;
  apiRequestsToday: number;
  recentJobs: Array<{
    message_id: string;
    recipient: string;
    status: string;
    created_at: string;
    sent_at: string | null;
    device: string | null;
  }>;
};

function maskRecipient(value: string): string {
  return value.length <= 5 ? value : `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

export async function overview(db: Db, userId: string): Promise<Overview> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));

  const [devicesRes, profileRes, jobsRes, apiRes] = await Promise.all([
    db
      .from("gateway_devices")
      .select("id, name, gateway_device_id, sender_number, status, enabled, is_default, last_heartbeat_at")
      .eq("user_id", userId),
    db.from("profiles").select("sms_paused").eq("id", userId).maybeSingle(),
    db
      .from("sms_jobs")
      .select("message_id, recipient, status, created_at, sent_at, device_id")
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("api_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfDay.toISOString()),
  ]);

  const devices = devicesRes.data ?? [];
  const jobs = jobsRes.data ?? [];
  const deviceName = new Map(devices.map((d) => [d.id, d.gateway_device_id]));
  const activeDevice =
    devices.find((d) => d.is_default && d.status === "active") ?? devices.find((d) => d.status === "active") ?? null;

  return {
    gatewayOnline: devices.some((d) => d.enabled && isDeviceOnline(d.last_heartbeat_at)),
    smsPaused: profileRes.data?.sms_paused ?? false,
    deviceCount: devices.length,
    activeDevice: activeDevice
      ? {
          name: activeDevice.name,
          gateway_device_id: activeDevice.gateway_device_id,
          sender_number: activeDevice.sender_number,
          online: isDeviceOnline(activeDevice.last_heartbeat_at),
        }
      : null,
    sentToday: jobs.filter((j) => j.status === "sent" && j.created_at >= startOfDay.toISOString()).length,
    sentThisMonth: jobs.filter((j) => j.status === "sent").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    queued: jobs.filter((j) => j.status === "queued" || j.status === "sending").length,
    apiRequestsToday: apiRes.count ?? 0,
    recentJobs: jobs.slice(0, 8).map((j) => ({
      message_id: j.message_id,
      recipient: maskRecipient(j.recipient),
      status: j.status,
      created_at: j.created_at,
      sent_at: j.sent_at,
      device: j.device_id ? (deviceName.get(j.device_id) ?? null) : null,
    })),
  };
}

export async function listDevices(db: Db, userId: string) {
  const { data: devices } = await db
    .from("gateway_devices")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const ids = (devices ?? []).map((d) => d.id);
  const stats = new Map<string, { sent: number; failed: number }>();
  if (ids.length) {
    const { data: jobs } = await db.from("sms_jobs").select("device_id, status").eq("user_id", userId);
    for (const job of jobs ?? []) {
      if (!job.device_id) continue;
      const entry = stats.get(job.device_id) ?? { sent: 0, failed: 0 };
      if (job.status === "sent") entry.sent += 1;
      if (job.status === "failed") entry.failed += 1;
      stats.set(job.device_id, entry);
    }
  }
  return (devices ?? []).map((d) => ({
    ...d,
    online: isDeviceOnline(d.last_heartbeat_at),
    stats: stats.get(d.id) ?? { sent: 0, failed: 0 },
  }));
}

export async function createPairingCode(
  db: Db,
  userId: string,
  input: { device_name: string; sender_number?: string },
) {
  const code = randomNumericCode(6);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const { error } = await db.from("device_pairing_codes").insert({
    user_id: userId,
    code_hash: await hashSecret(code),
    device_name: input.device_name,
    sender_number: input.sender_number ? normalizePhone(input.sender_number) : null,
    expires_at: expiresAt,
  });
  if (error) throw new Error("Could not create a pairing code.");
  // Full code returned exactly once, never persisted in plain text.
  return { pairing_code: code, expires_at: expiresAt };
}

export async function updateDevice(
  db: Db,
  userId: string,
  input: {
    id: string;
    name?: string;
    sender_number?: string | null;
    enabled?: boolean;
    is_default?: boolean;
    is_backup?: boolean;
    daily_sms_limit?: number;
  },
) {
  if (input.is_default) await db.from("gateway_devices").update({ is_default: false }).eq("user_id", userId);
  const patch: Record<string, string | boolean | number | null> = {};
  if (input.name !== undefined) patch["name"] = input.name;
  if (input.sender_number !== undefined)
    patch["sender_number"] = input.sender_number ? normalizePhone(input.sender_number) : null;
  if (input.enabled !== undefined) {
    patch["enabled"] = input.enabled;
    patch["status"] = input.enabled ? "active" : "disabled";
  }
  if (input.is_default !== undefined) patch["is_default"] = input.is_default;
  if (input.is_backup !== undefined) patch["is_backup"] = input.is_backup;
  if (input.daily_sms_limit !== undefined) patch["daily_sms_limit"] = input.daily_sms_limit;
  const { error } = await db.from("gateway_devices").update(patch as never).eq("id", input.id).eq("user_id", userId);
  if (error) throw new Error("Could not update the device.");
  return { ok: true };
}

export async function deleteDevice(db: Db, userId: string, id: string) {
  await db.from("gateway_devices").delete().eq("id", id).eq("user_id", userId);
  return { ok: true };
}

export async function listApiKeys(db: Db, userId: string) {
  const { data } = await db
    .from("api_keys")
    .select(
      "id, name, key_prefix, key_hint, device_id, scopes, requests_per_minute, sms_per_day, expires_at, revoked_at, last_used_at, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function mintKey(
  db: Db,
  userId: string,
  input: {
    name: string;
    device_id?: string | null;
    expires_in_days?: number | null;
    requests_per_minute?: number;
    sms_per_day?: number;
  },
) {
  const secret = randomId("gk_live", 32);
  const { data, error } = await db
    .from("api_keys")
    .insert({
      user_id: userId,
      name: input.name,
      key_prefix: "gk_live",
      key_hint: secret.slice(-4),
      key_hash: await hashSecret(secret),
      device_id: input.device_id ?? null,
      scopes: ["sms:send"],
      requests_per_minute: input.requests_per_minute ?? 60,
      sms_per_day: input.sms_per_day ?? 200,
      expires_at: input.expires_in_days
        ? new Date(Date.now() + input.expires_in_days * 86400000).toISOString()
        : null,
    })
    .select("id, name, key_hint, created_at")
    .single();
  if (error || !data) throw new Error("Could not create the API key.");
  // Plaintext key is returned once and never stored.
  return { id: data.id, name: data.name, api_key: secret };
}

export const createApiKey = mintKey;

export async function revokeApiKey(db: Db, userId: string, id: string) {
  await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  return { ok: true };
}

export async function rotateApiKey(db: Db, userId: string, id: string) {
  const { data: existing } = await db
    .from("api_keys")
    .select("name, device_id, requests_per_minute, sms_per_day, expires_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) throw new Error("API key not found.");
  const created = await mintKey(db, userId, {
    name: existing.name,
    device_id: existing.device_id,
    requests_per_minute: existing.requests_per_minute,
    sms_per_day: existing.sms_per_day,
  });
  await revokeApiKey(db, userId, id);
  return created;
}

export async function listSmsJobs(db: Db, userId: string, input: { limit?: number; status?: string }) {
  let query = db
    .from("sms_jobs")
    .select("id, message_id, recipient, status, created_at, sent_at, failed_at, error_code, error_message, device_id, attempts")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(input.limit ?? 100, 200));
  if (input.status && input.status !== "all") query = query.eq("status", input.status);
  const [{ data: jobs }, { data: devices }] = await Promise.all([
    query,
    db.from("gateway_devices").select("id, gateway_device_id, name").eq("user_id", userId),
  ]);
  const map = new Map((devices ?? []).map((d) => [d.id, d]));
  return (jobs ?? []).map((j) => ({
    ...j,
    // Message bodies are intentionally not returned to the dashboard.
    recipient: maskRecipient(j.recipient),
    device: j.device_id ? (map.get(j.device_id)?.name ?? null) : null,
  }));
}

export async function getSettings(db: Db, userId: string) {
  const { data } = await db
    .from("profiles")
    .select("display_name, sms_paused, requests_per_minute, sms_per_hour, sms_per_day, allow_backup_routing")
    .eq("id", userId)
    .maybeSingle();
  return (
    data ?? {
      display_name: null,
      sms_paused: false,
      requests_per_minute: 60,
      sms_per_hour: 60,
      sms_per_day: 200,
      allow_backup_routing: false,
    }
  );
}

export async function updateSettings(
  db: Db,
  userId: string,
  input: {
    sms_paused?: boolean;
    requests_per_minute?: number;
    sms_per_hour?: number;
    sms_per_day?: number;
    allow_backup_routing?: boolean;
  },
) {
  const { error } = await db.from("profiles").update(input as never).eq("id", userId);
  if (error) throw new Error("Could not update settings.");
  return { ok: true };
}
