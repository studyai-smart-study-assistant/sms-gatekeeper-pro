import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, KeyRound, Radio, ShieldCheck, Smartphone, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SMS Gatekeeper — Your Android phone as an SMS API" },
      {
        name: "description",
        content:
          "Register your own Android phone as an SMS gateway, then send SMS from any backend with one authenticated API call.",
      },
      { property: "og:title", content: "SMS Gatekeeper — Your Android phone as an SMS API" },
      {
        property: "og:description",
        content: "Self-hosted SMS delivery through your own SIM. Paired devices, hashed API keys, durable job queue.",
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: Smartphone,
    title: "Pair your phone",
    body: "Install the Gateway app, enter a 6-digit pairing code, grant the SMS permission. The phone gets its own credential — your account password never leaves the dashboard.",
  },
  {
    icon: KeyRound,
    title: "Create an API key",
    body: "Scoped to sms:send, hashed at rest, shown once, rotatable and revocable. Bind it to one device or let it follow your default.",
  },
  {
    icon: Terminal,
    title: "Call the endpoint",
    body: "POST a recipient and a message. You get a message_id back immediately; the phone claims the job and sends it over its own SIM.",
  },
];

const FEATURES = [
  { icon: Radio, title: "Durable job queue", body: "Every call becomes a job with attempts, delivery events and retries for transient failures." },
  { icon: ShieldCheck, title: "Real guardrails", body: "Per-key and per-account rate limits, per-device daily caps, idempotency keys and a global pause switch." },
  { icon: Activity, title: "Honest status", body: "Heartbeats report battery, permission state and connectivity, so you know before you send whether delivery is possible." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <span className="font-display text-sm font-bold tracking-tight">SMS GATEKEEPER</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/docs">API docs</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Open dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="grid-glow border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Self-hosted SMS delivery</p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">
            Turn your Android phone into an SMS API your backend can call.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground">
            No carrier contract, no per-message vendor pricing, no shared sender ID. Register a device you own, hand your
            backend an API key, and send SMS through your own SIM with a single authenticated request.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Register a device</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/docs">Read the API docs</Link>
            </Button>
          </div>

          <pre className="mt-12 max-w-2xl overflow-x-auto rounded-lg border border-border bg-card p-5 font-mono text-xs leading-relaxed">
            {`POST /api/public/v1/sms/send
x-api-key: smsgk_live_••••••••

{ "to": "+919876543210", "message": "Your code is 123456" }

→ { "success": true, "message_id": "msg_2f8c1ba9d34e", "status": "queued" }`}
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-2xl font-bold">Three steps to first SMS</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="panel p-5">
              <div className="flex items-center gap-2">
                <step.icon className="size-4 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-2xl font-bold">Built like infrastructure</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="panel p-5">
                <feature.icon className="size-4 text-primary" />
                <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground">
          <span>SMS Gatekeeper — your phone, your SIM, your API.</span>
          <div className="flex gap-4">
            <Link to="/docs" className="hover:text-foreground">
              API docs
            </Link>
            <Link to="/auth" className="hover:text-foreground">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
