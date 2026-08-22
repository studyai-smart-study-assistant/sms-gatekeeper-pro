import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "API documentation — SMS Gatekeeper" },
      {
        name: "description",
        content:
          "Authenticate with an API key and POST a recipient and message to queue an SMS through your own Android phone.",
      },
      { property: "og:title", content: "API documentation — SMS Gatekeeper" },
      { property: "og:description", content: "Endpoints, request shapes, error codes and rate limits." },
    ],
  }),
  component: DocsPage,
});

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 border-t border-border pt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <span className="font-display text-sm font-bold">SMS GATEKEEPER</span>
          </Link>
          <Link to="/dashboard" className="text-xs text-primary hover:underline">
            Open dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">API documentation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One endpoint matters: queue an SMS. Your registered Android phone picks the job up and sends it over its own
            SIM.
          </p>
        </div>

        <Section id="auth" title="Authentication">
          <p className="text-sm text-muted-foreground">
            Send your API key in the <code className="font-mono">x-api-key</code> header (or{" "}
            <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>). Keys are hashed at rest, scoped to{" "}
            <code className="font-mono">sms:send</code>, and revocable at any time from the dashboard.
          </p>
        </Section>

        <Section id="send" title="POST /api/public/v1/sms/send">
          <Code>{`curl -X POST https://your-gatekeeper-domain/api/public/v1/sms/send \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: smsgk_live_xxxxxxxxxxxxxxxx" \\
  -d '{
    "to": "+919876543210",
    "message": "Your verification code is 123456",
    "idempotency_key": "signup-otp-8fc21e"
  }'`}</Code>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono">to</code> must be E.164. <code className="font-mono">idempotency_key</code> is
            optional but recommended: repeat calls with the same key return the original job instead of sending twice.
          </p>
          <Code>{`{
  "success": true,
  "message_id": "msg_2f8c1ba9d34e",
  "status": "queued",
  "device_id": "dev_7c1a94",
  "queued_at": "2026-01-01T10:00:00.000Z"
}`}</Code>
        </Section>

        <Section id="status" title="GET /api/public/v1/sms/status/:message_id">
          <p className="text-sm text-muted-foreground">
            Poll a job to see whether the phone actually sent it. Status values:{" "}
            <code className="font-mono">queued</code>, <code className="font-mono">sending</code>,{" "}
            <code className="font-mono">sent</code>, <code className="font-mono">failed</code>,{" "}
            <code className="font-mono">canceled</code>.
          </p>
        </Section>

        <Section id="errors" title="Errors">
          <Code>{`{ "success": false, "error": { "code": "DEVICE_OFFLINE", "message": "No gateway device is online." } }`}</Code>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              <code className="font-mono">401 UNAUTHORIZED</code> — missing, unknown, expired or revoked API key
            </li>
            <li>
              <code className="font-mono">403 SCOPE_DENIED</code> — key lacks <code className="font-mono">sms:send</code>
            </li>
            <li>
              <code className="font-mono">409 DEVICE_OFFLINE</code> — no enabled, online device with SMS permission
            </li>
            <li>
              <code className="font-mono">422 INVALID_REQUEST</code> — bad phone number or empty message
            </li>
            <li>
              <code className="font-mono">423 SENDING_PAUSED</code> — the account pause switch is on
            </li>
            <li>
              <code className="font-mono">429 RATE_LIMITED</code> — per-minute, hourly or daily limit reached
            </li>
          </ul>
        </Section>

        <Section id="limits" title="Rate limits">
          <p className="text-sm text-muted-foreground">
            Limits apply per API key and per account: requests per minute, SMS per hour, SMS per day, plus a per-device
            daily cap. All of them are editable in Settings and Devices.
          </p>
        </Section>

        <Section id="gateway" title="Device protocol (Android app only)">
          <p className="text-sm text-muted-foreground">
            The Android Gateway app uses its own credential — never your API key — against{" "}
            <code className="font-mono">/api/public/v1/gateway/pair</code>,{" "}
            <code className="font-mono">/heartbeat</code>, <code className="font-mono">/jobs/claim</code> and{" "}
            <code className="font-mono">/jobs/ack</code>. Pair by entering a 6-digit code from the Devices page.
          </p>
        </Section>
      </main>
    </div>
  );
}
