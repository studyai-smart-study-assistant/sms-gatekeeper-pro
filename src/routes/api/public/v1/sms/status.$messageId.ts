import { createFileRoute } from "@tanstack/react-router";
import { handleSmsStatus } from "@/lib/sms-status.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
};

export const Route = createFileRoute("/api/public/v1/sms/status/$messageId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request, params }) => {
        const response = await handleSmsStatus(request, params.messageId);
        for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
        return response;
      },
    },
  },
});
