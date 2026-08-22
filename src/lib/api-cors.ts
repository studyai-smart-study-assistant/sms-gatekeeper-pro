/**
 * Shared CORS headers for the public v1 API.
 *
 * The Android gateway app runs inside a WebView whose origin is
 * `https://localhost`, so every endpoint it calls (pair, heartbeat, claim, ack,
 * health) must answer preflights and echo the allow headers — otherwise the app
 * silently fails with a network error.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key, x-api-key, x-device-token",
  "Access-Control-Max-Age": "86400",
};

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}
