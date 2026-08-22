import { createFileRoute } from "@tanstack/react-router";
import { handleSmsSend } from "@/lib/sms-send.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
};

export const Route = createFileRoute("/api/public/v1/sms/send")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const response = await handleSmsSend(request);
        for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
        return response;
      },
    },
  },
});
