import { createFileRoute } from "@tanstack/react-router";
import { handleAppRegisterDevice } from "@/lib/app-api.server";
import { preflight, withCors } from "@/lib/api-cors";

export const Route = createFileRoute("/api/public/v1/app/register-device")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => withCors(await handleAppRegisterDevice(request)),
    },
  },
});
