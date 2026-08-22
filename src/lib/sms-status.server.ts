/**
 * Public status lookup for a queued SMS job. Read-only and scoped to the
 * account that owns the API key.
 */
import { admin, bearer, hashSecret, json, jsonError, logApiRequest } from "./gatekeeper.server";

type ApiKeyRow = { id: string; user_id: string; scopes: string[]; revoked_at: string | null; expires_at: string | null };

export async function handleSmsStatus(request: Request, messageId: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  const db = await admin();

  const token = bearer(request);
  if (!token) return jsonError(401, "MISSING_API_KEY", "Provide an API key via Authorization: Bearer <key>.");

  const { data: keyRow } = await db
    .from("api_keys")
    .select("id, user_id, scopes, revoked_at, expires_at")
    .eq("key_hash", await hashSecret(token))
    .maybeSingle();
  const apiKey = keyRow as ApiKeyRow | null;
  if (!apiKey || apiKey.revoked_at || (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()))
    return jsonError(401, "INVALID_API_KEY", "API key is invalid, revoked or expired.");
  if (!apiKey.scopes.includes("sms:send"))
    return jsonError(403, "FORBIDDEN_SCOPE", "API key lacks the sms:send scope.");

  const { data: jobRow } = await db
    .from("sms_jobs")
    .select("message_id, status, attempts, error_code, error_message, created_at, sent_at, gateway_device_id")
    .eq("user_id", apiKey.user_id)
    .eq("message_id", messageId)
    .maybeSingle();

  await logApiRequest(db, {
    user_id: apiKey.user_id,
    api_key_id: apiKey.id,
    method: "GET",
    path,
    status_code: jobRow ? 200 : 404,
    ...(jobRow ? {} : { error_code: "NOT_FOUND" }),
  });

  if (!jobRow) return jsonError(404, "NOT_FOUND", `No SMS job with message_id ${messageId}.`);

  const job = jobRow as Record<string, unknown>;
  return json({
    success: true,
    message_id: job['message_id'],
    status: job['status'],
    attempts: job['attempts'],
    error_code: job['error_code'] ?? null,
    error_message: job['error_message'] ?? null,
    created_at: job['created_at'],
    sent_at: job['sent_at'] ?? null,
  });
}
