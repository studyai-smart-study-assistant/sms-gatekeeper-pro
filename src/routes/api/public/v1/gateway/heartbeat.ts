import { createFileRoute } from "@tanstack/react-router";
import { handleHeartbeat } from "@/lib/gateway.server";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/gateway/heartbeat")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => withCors(await handleHeartbeat(request)),
    },
  },
});
