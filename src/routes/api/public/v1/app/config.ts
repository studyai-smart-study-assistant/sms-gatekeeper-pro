import { createFileRoute } from "@tanstack/react-router";
import { handleAppConfig } from "@/lib/app-api.server";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/app/config")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () => withCors(await handleAppConfig()),
    },
  },
});
