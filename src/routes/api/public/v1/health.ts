import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/health")({
  server: {
    handlers: {
      GET: async () => Response.json({ status: "ok", service: "sms-gatekeeper", time: new Date().toISOString() }),
    },
  },
});
