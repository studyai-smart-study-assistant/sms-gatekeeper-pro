/**
 * In-app (Android) account API.
 *
 * The Android gateway app is self-sufficient: the user signs in, registers this
 * phone, and mints API keys without ever visiting the web dashboard. Every
 * endpoint here is authenticated with the user's Supabase access token
 * (Authorization: Bearer <access_token>) and scoped to that user's rows.
 */
import { z } from "zod";
import { admin, hashSecret, isDeviceOnline, json, jsonError, normalizePhone, randomId } from "./gatekeeper.server";

type User = { id: string; email: string | null };

function authHeaderToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get("authorization") ?? "").trim());
  return match ? (match[1] as string).trim() : null;
}

/** Verify the Supabase access token against the auth server. */
async function currentUser(request: Request): Promise<User | Response> {
  const token = authHeaderToken(request);
  if (!token) return jsonError(401, "MISSING_API_KEY", "Sign in required.");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return jsonError(500, "INTERNAL_ERROR", "Auth is not configured.");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return jsonError(401, "INVALID_API_KEY", "Session expired. Sign in again.");
  const payload = (await response.json()) as { id?: string; email?: string };
  if (!payload.id) return jsonError(401, "INVALID_API_KEY", "Session expired. Sign in again.");
  return { id: payload.id, email: payload.email ?? null };
}

export async function handleAppConfig(): Promise<Response> {
  return json({
    success: true,
    supabase_url: process.env["SUPABASE_URL"] ?? null,
    supabase_key: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? null,
  });
}

const registerSchema = z.object({
  install_id: z.string().min(8).max(128),
  device_name: z.string().min(1).max(80).optional(),
  sender_number: z.string().max(20).optional(),
  android_version: z.string().max(40).optional(),
  app_version: z.string().max(40).optional(),
  sms_permission: z.enum(["granted", "denied", "permanently_denied", "unknown"]).optional(),
  sim_info: z.record(z.string(), z.unknown()).optional(),
  sim_subscription_id: z.number().int().min(-1).max(2147483647).optional(),
  sim_slot: z.number().int().min(0).max(8).optional(),
  sim_label: z.string().max(60).optional(),
});

/** Register (or re-register) the phone running the app. No pairing code needed. */
export async function handleAppRegisterDevice(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (user instanceof Response) return user;
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "INVALID_REQUEST", "Invalid device payload.");
  const input = parsed.data;
  const db = await admin();

  const patch = {
    name: input.device_name ?? "My Android phone",
    sender_number: input.sender_number ? normalizePhone(input.sender_number) : null,
    status: input.sms_permission === "granted" ? "active" : "pending",
    enabled: true,
    android_version: input.android_version ?? null,
    app_version: input.app_version ?? null,
    sms_permission: input.sms_permission ?? "unknown",
    sim_info: (input.sim_info ?? null) as never,
    sim_subscription_id: input.sim_subscription_id ?? null,
    sim_slot: input.sim_slot ?? null,
    sim_label: input.sim_label ?? null,
    install_id: input.install_id,
    paired_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from("gateway_devices")
    .select("id")
    .eq("user_id", user.id)
    .eq("install_id", input.install_id)
    .maybeSingle();

  let deviceRowId: string;
  let gatewayDeviceId: string;

  if (existing) {
    const { data, error } = await db
      .from("gateway_devices")
      .update(patch as never)
      .eq("id", existing.id)
      .select("id, gateway_device_id")
      .single();
    if (error || !data) return jsonError(500, "INTERNAL_ERROR", "Could not update this device.");
    deviceRowId = data.id;
    gatewayDeviceId = data.gateway_device_id;
    // Re-registration invalidates the previous install token.
    await db
      .from("device_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("device_id", deviceRowId)
      .is("revoked_at", null);
  } else {
    const { data, error } = await db
      .from("gateway_devices")
      .insert({ user_id: user.id, gateway_device_id: randomId("gwdev", 20), ...patch })
      .select("id, gateway_device_id")
      .single();
    if (error || !data) return jsonError(500, "INTERNAL_ERROR", "Could not register this device.");
    deviceRowId = data.id;
    gatewayDeviceId = data.gateway_device_id;
    const { count } = await db
      .from("gateway_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) <= 1) await db.from("gateway_devices").update({ is_default: true }).eq("id", deviceRowId);
  }

  const deviceToken = randomId("gwtok", 40);
  await db.from("device_credentials").insert({
    device_id: deviceRowId,
    token_hash: await hashSecret(deviceToken),
    install_id: input.install_id,
  });

  return json({ success: true, gateway_device_id: gatewayDeviceId, device_token: deviceToken });
}

const keysSchema = z.union([
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(60),
    sms_per_day: z.number().int().min(1).max(10000).optional(),
  }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
]);

export async function handleAppApiKeys(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (user instanceof Response) return user;
  const parsed = keysSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "INVALID_REQUEST", "Invalid API key request.");
  const db = await admin();

  if (parsed.data.action === "list") {
    const { data } = await db
      .from("api_keys")
      .select("id, name, key_prefix, key_hint, sms_per_day, requests_per_minute, revoked_at, last_used_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return json({ success: true, keys: data ?? [] });
  }

  if (parsed.data.action === "revoke") {
    await db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("user_id", user.id);
    return json({ success: true });
  }

  const secret = randomId("gk_live", 32);
  const { data, error } = await db
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      key_prefix: "gk_live",
      key_hint: secret.slice(-4),
      key_hash: await hashSecret(secret),
      scopes: ["sms:send"],
      requests_per_minute: 60,
      sms_per_day: parsed.data.sms_per_day ?? 200,
    })
    .select("id, name, key_hint, created_at")
    .single();
  if (error || !data) return jsonError(500, "INTERNAL_ERROR", "Could not create the API key.");
  // Plaintext key is shown exactly once, in the app.
  return json({ success: true, id: data.id, name: data.name, api_key: secret });
}

/** Everything the in-app home screen shows: device health, volume, recent jobs. */
export async function handleAppOverview(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (user instanceof Response) return user;
  const db = await admin();

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [devicesRes, profileRes, jobsRes, keysRes] = await Promise.all([
    db
      .from("gateway_devices")
      .select("gateway_device_id, name, install_id, status, enabled, sms_permission, last_heartbeat_at, sender_number")
      .eq("user_id", user.id),
    db.from("profiles").select("sms_paused").eq("id", user.id).maybeSingle(),
    db
      .from("sms_jobs")
      .select("message_id, recipient, status, created_at, sent_at, error_code")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("revoked_at", null),
  ]);

  const jobs = jobsRes.data ?? [];
  return json({
    success: true,
    email: user.email,
    paused: profileRes.data?.sms_paused ?? false,
    active_keys: keysRes.count ?? 0,
    devices: (devicesRes.data ?? []).map((d) => ({ ...d, online: isDeviceOnline(d.last_heartbeat_at) })),
    sent_today: jobs.filter((j) => j.status === "sent" && j.created_at >= startOfDay.toISOString()).length,
    queued: jobs.filter((j) => j.status === "queued" || j.status === "sending").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    recent: jobs.slice(0, 10).map((j) => ({
      message_id: j.message_id,
      recipient: j.recipient.length > 5 ? `${j.recipient.slice(0, 4)}••••${j.recipient.slice(-3)}` : j.recipient,
      status: j.status,
      created_at: j.created_at,
      error_code: j.error_code,
    })),
  });
}
