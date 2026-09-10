import { createFileRoute } from "@tanstack/react-router";
import { handleAppApiKeys } from "@/lib/app-api.server";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/app/api-keys")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => withCors(await handleAppApiKeys(request)),
    },
  },
});
