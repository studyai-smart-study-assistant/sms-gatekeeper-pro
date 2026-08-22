import { createFileRoute } from "@tanstack/react-router";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/health")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () =>
        withCors(Response.json({ status: "ok", service: "sms-gatekeeper", time: new Date().toISOString() })),
    },
  },
});
