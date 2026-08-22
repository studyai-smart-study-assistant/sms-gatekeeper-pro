import { createFileRoute } from "@tanstack/react-router";
import { handleAck } from "@/lib/gateway.server";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/gateway/jobs/ack")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => withCors(await handleAck(request)),
    },
  },
});
