import { createFileRoute } from "@tanstack/react-router";
import { handleAppOverview } from "@/lib/app-api.server";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/app/overview")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => withCors(await handleAppOverview(request)),
      POST: async ({ request }) => withCors(await handleAppOverview(request)),
    },
  },
});
