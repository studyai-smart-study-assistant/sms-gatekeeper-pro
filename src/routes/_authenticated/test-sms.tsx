import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/gatekeeper/AppShell";
import { StatusBadge } from "@/components/gatekeeper/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listDevices } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/test-sms")({
  head: () => ({
    meta: [
      { title: "Test SMS — SMS Gatekeeper" },
      {
        name: "description",
        content:
          "Send a live test SMS through your paired Android phone using an API key, before wiring Gatekeeper into your app.",
      },
      { property: "og:title", content: "Test SMS — SMS Gatekeeper" },
      { property: "og:description", content: "Verify your device, API key and SIM with one real message." },
    ],
  }),
  component: TestSmsPage,
});

type Step = { at: string; text: string; kind: "info" | "ok" | "error" };

function TestSmsPage() {
  const fetchDevices = useServerFn(listDevices);
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: () => fetchDevices() });

  const [apiKey, setApiKey] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("SMS Gatekeeper test message ✅");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  const online = (devices ?? []).some((d) => d.status === "online");

  const push = (text: string, kind: Step["kind"] = "info") =>
    setSteps((prev) => [{ at: new Date().toLocaleTimeString(), text, kind }, ...prev].slice(0, 40));

  const poll = async (id: string, key: string) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const res = await fetch(`/api/public/v1/sms/status/${id}`, { headers: { "x-api-key": key } });
      const payload = (await res.json()) as { status?: string; error_code?: string | null; error_message?: string | null };
      if (!res.ok) {
        push(`status lookup failed (${res.status})`, "error");
        return;
      }
      setStatus(payload.status ?? null);
      push(`status: ${payload.status}`, payload.status === "sent" ? "ok" : payload.status === "failed" ? "error" : "info");
      if (payload.status === "sent") {
        toast.success("Test SMS delivered to the mobile network.");
        return;
      }
      if (payload.status === "failed") {
        push(`${payload.error_code ?? "FAILED"} — ${payload.error_message ?? "no detail"}`, "error");
        toast.error("The device could not send this message.");
        return;
      }
    }
    push("stopped polling after 60s — check SMS Logs", "info");
  };

  const send = async () => {
    if (!apiKey.trim() || !recipient.trim() || !body.trim()) {
      toast.error("API key, recipient and message are all required.");
      return;
    }
    setBusy(true);
    setStatus(null);
    setMessageId(null);
    setSteps([]);
    push(`queueing SMS to ${recipient.trim()}`);
    try {
      const res = await fetch("/api/public/v1/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey.trim() },
        body: JSON.stringify({ to: recipient.trim(), message: body.trim() }),
      });
      const payload = (await res.json()) as {
        success?: boolean;
        message_id?: string;
        status?: string;
        error?: { code?: string; message?: string };
      };
      if (!res.ok || !payload.success) {
        push(`${payload.error?.code ?? res.status} — ${payload.error?.message ?? "request rejected"}`, "error");
        toast.error(payload.error?.message ?? "Send request failed.");
        return;
      }
      setMessageId(payload.message_id ?? null);
      setStatus(payload.status ?? "queued");
      push(`queued as ${payload.message_id}`, "ok");
      if (payload.message_id) await poll(payload.message_id, apiKey.trim());
    } catch (error) {
      push(error instanceof Error ? error.message : "network error", "error");
      toast.error("Could not reach the send endpoint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Test SMS"
      description="Send one real message through your paired phone before integrating your own backend."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              placeholder="sk_gk_..."
              className="font-mono"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Create one under API Keys. It is sent as <span className="font-mono">x-api-key</span>, exactly like your
              backend would.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipient">Recipient number (E.164)</Label>
            <Input
              id="recipient"
              inputMode="tel"
              placeholder="+919876543210"
              className="font-mono"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <Textarea id="body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">{body.length} characters</p>
          </div>

          <Button className="w-full" disabled={busy} onClick={() => void send()}>
            <Send className="size-4" /> {busy ? "Sending…" : "Send test SMS"}
          </Button>

          {!online ? (
            <p className="text-xs text-warning">
              No device is currently online. Open the gateway app on your phone and start the gateway service, otherwise
              the job stays queued.
            </p>
          ) : null}
        </div>

        <div className="panel space-y-4 p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" /> Result
            </span>
            {status ? <StatusBadge status={status} /> : <span className="text-xs text-muted-foreground">idle</span>}
          </div>
          {messageId ? <p className="font-mono text-xs text-muted-foreground">{messageId}</p> : null}
          <div className="space-y-2">
            {steps.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Steps appear here: queueing, device pickup, and the final delivery result from the SIM.
              </p>
            ) : (
              steps.map((step, index) => (
                <p
                  key={`${step.at}-${index}`}
                  className={
                    step.kind === "ok"
                      ? "font-mono text-xs text-primary"
                      : step.kind === "error"
                        ? "font-mono text-xs text-destructive"
                        : "font-mono text-xs text-muted-foreground"
                  }
                >
                  {step.at} · {step.text}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
