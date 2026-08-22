/**
 * Server-only primitives for SMS Gatekeeper.
 * Never import this from client code (blocked by *.server.* import guard).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Admin = SupabaseClient<Database>;

export async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Cryptographically random, URL-safe, prefixed identifier. */
export function randomId(prefix: string, length = 22): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b % CROCKFORD.length];
  return `${prefix}_${out}`;
}

/** Cryptographically random numeric pairing code. */
export function randomNumericCode(digits = 6): string {
  const bytes = new Uint32Array(digits);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += String(b % 10);
  return out;
}

function pepper(): string {
  return (
    process.env["API_KEY_HASH_SECRET"] ??
    process.env["JWT_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    "gatekeeper-dev-pepper"
  );
}

/** HMAC-SHA256 of a secret value. Only hashes are ever persisted. */
export async function hashSecret(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.replace(/[\s()-]/g, "");
  return E164.test(trimmed) ? trimmed : null;
}

export const DEVICE_ONLINE_WINDOW_MS = 3 * 60 * 1000;

export function isDeviceOnline(lastHeartbeatAt: string | null | undefined): boolean {
  if (!lastHeartbeatAt) return false;
  return Date.now() - new Date(lastHeartbeatAt).getTime() < DEVICE_ONLINE_WINDOW_MS;
}

export type ApiErrorCode =
  | "INVALID_API_KEY"
  | "MISSING_API_KEY"
  | "FORBIDDEN_SCOPE"
  | "SMS_PAUSED"
  | "DEVICE_DISABLED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_OFFLINE"
  | "DUPLICATE_REQUEST"
  | "INVALID_PHONE_NUMBER"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function jsonError(status: number, code: ApiErrorCode, message: string, extra?: Record<string, unknown>) {
  return Response.json({ success: false, error: { code, message, ...extra } }, { status });
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] as string).trim() : null;
}

export function windowKey(kind: "minute" | "hour" | "day", now = new Date()): string {
  const iso = now.toISOString();
  if (kind === "minute") return iso.slice(0, 16);
  if (kind === "hour") return iso.slice(0, 13);
  return iso.slice(0, 10);
}

/** Atomic counter bump; returns true when the limit has been exceeded. */
export async function exceedsLimit(
  db: Admin,
  scopeType: string,
  scopeId: string,
  kind: "minute" | "hour" | "day",
  limit: number,
): Promise<boolean> {
  if (limit <= 0) return true;
  const { data, error } = await db.rpc("bump_rate_limit", {
    _scope_type: `${scopeType}:${kind}`,
    _scope_id: scopeId,
    _window_key: windowKey(kind),
  });
  if (error) return false; // fail-open on counter errors, never block on infra noise
  return (data as unknown as number) > limit;
}

export async function logApiRequest(
  db: Admin,
  entry: {
    user_id?: string | null;
    api_key_id?: string | null;
    method: string;
    path: string;
    status_code: number;
    error_code?: string | null;
  },
) {
  await db.from("api_request_logs").insert(entry);
}
