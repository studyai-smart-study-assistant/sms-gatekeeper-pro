import { createFileRoute } from "@tanstack/react-router";
import { handlePair } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/public/v1/gateway/pair")({
  server: { handlers: { POST: async ({ request }) => handlePair(request) } },
});
