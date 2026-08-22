import { createFileRoute } from "@tanstack/react-router";
import { handleAck } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/public/v1/gateway/jobs/ack")({
  server: { handlers: { POST: async ({ request }) => handleAck(request) } },
});
