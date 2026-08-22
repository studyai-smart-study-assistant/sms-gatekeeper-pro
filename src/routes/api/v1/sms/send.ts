import { createFileRoute } from "@tanstack/react-router";
import { handleSmsSend } from "@/lib/sms-send.server";

/**
 * Convenience alias for /api/public/v1/sms/send.
 * External integrations should prefer the /api/public/... path: that prefix is
 * guaranteed to bypass Lovable's published-site gate for machine callers.
 */
export const Route = createFileRoute("/api/v1/sms/send")({
  server: {
    handlers: {
      POST: async ({ request }) => handleSmsSend(request),
    },
  },
});
