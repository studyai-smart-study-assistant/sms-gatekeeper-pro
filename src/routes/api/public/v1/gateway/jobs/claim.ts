import { createFileRoute } from "@tanstack/react-router";
import { handleClaim } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/public/v1/gateway/jobs/claim")({
  server: { handlers: { POST: async ({ request }) => handleClaim(request) } },
});
