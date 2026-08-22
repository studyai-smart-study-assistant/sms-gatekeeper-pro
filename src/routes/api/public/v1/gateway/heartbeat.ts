import { createFileRoute } from "@tanstack/react-router";
import { handleHeartbeat } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/public/v1/gateway/heartbeat")({
  server: { handlers: { POST: async ({ request }) => handleHeartbeat(request) } },
});
