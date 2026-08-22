import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ShieldCheck, Signal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/gatekeeper/StatusBadge";
import { SmsGateway, isNativeGateway, type DeviceInfoResult, type SmsPermissionState } from "@/lib/sms-gateway-plugin";

export const Route = createFileRoute("/gateway")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Device gateway — SMS Gatekeeper" },
      { name: "description", content: "Pair this Android phone with your SMS Gatekeeper account and run the gateway service." },
      { property: "og:title", content: "Device gateway — SMS Gatekeeper" },
      { property: "og:description", content: "The on-device screen for pairing and permissions." },
    ],
  }),
  component: GatewayPage,
});

const STORAGE_KEY = "gatekeeper.device";

type Credential = { gateway_device_id: string; device_token: string };

function GatewayPage() {
  const native = isNativeGateway();
  const [permission, setPermission] = useState<SmsPermissionState>("unknown");
  const [info, setInfo] = useState<DeviceInfoResult | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [running, setRunning] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setCredential(JSON.parse(stored) as Credential);
    if (!native) return;
    void SmsGateway.checkPermissions().then((r) => setPermission(r.sms));
    void SmsGateway.getDeviceInfo().then(setInfo);
    void SmsGateway.getGatewayState().then((s) => setRunning(s.running));
  }, [native]);

  const pair = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const response = await fetch("/api/public/v1/gateway/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairing_code: code,
          install_id: info.installId,
          android_version: info.androidVersion,
          app_version: info.appVersion,
          device_name: info.model,
          sms_permission: permission,
          sim_info: { model: info.model, sim_ready: info.simReady, network: info.network },
        }),
      });
      const payload = (await response.json()) as { success?: boolean; error?: { message: string } } & Credential;
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Pairing failed");
      const next = { gateway_device_id: payload.gateway_device_id, device_token: payload.device_token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setCredential(next);
      toast.success("Device paired.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleGateway = async () => {
    if (!credential) return;
    if (running) {
      const state = await SmsGateway.stopGateway();
      setRunning(state.running);
      return;
    }
    const state = await SmsGateway.startGateway({
      baseUrl: window.location.origin,
      deviceId: credential.gateway_device_id,
      deviceToken: credential.device_token,
    });
    setRunning(state.running);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <span className="font-display text-sm font-bold">GATEWAY DEVICE</span>
        </div>

        {!native ? (
          <div className="panel p-5 text-sm text-muted-foreground">
            This screen is meant to run inside the SMS Gatekeeper Android app. Install the APK on the phone that owns the
            SIM, then open this screen there to pair it.
          </div>
        ) : null}

        <div className="panel space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-primary" /> SMS permission
            </span>
            <StatusBadge status={permission} />
          </div>
          {permission !== "granted" ? (
            <Button
              className="w-full"
              disabled={!native}
              onClick={async () => setPermission((await SmsGateway.requestPermissions()).sms)}
            >
              Grant SEND_SMS permission
            </Button>
          ) : null}
          {permission === "permanently_denied" ? (
            <p className="text-xs text-destructive">
              Permission was permanently denied. Enable it from Android settings, then reopen the app.
            </p>
          ) : null}
        </div>

        {credential ? (
          <div className="panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Signal className="size-4 text-primary" /> Gateway service
              </span>
              <StatusBadge status={running ? "online" : "offline"} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{credential.gateway_device_id}</p>
            <Button className="w-full" variant={running ? "secondary" : "default"} disabled={!native} onClick={() => void toggleGateway()}>
              {running ? "Stop gateway service" : "Start gateway service"}
            </Button>
            <Button variant="ghost" className="w-full" disabled={!native} onClick={() => void SmsGateway.openBatterySettings()}>
              Disable battery optimisation
            </Button>
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setCredential(null);
              }}
            >
              Unpair this device
            </Button>
          </div>
        ) : (
          <div className="panel space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="code">Pairing code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="text-center font-mono text-2xl tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Generate the code in the dashboard under Devices. It expires in 5 minutes.
              </p>
            </div>
            <Button className="w-full" disabled={busy || code.length !== 6 || !native} onClick={() => void pair()}>
              Pair this device
            </Button>
          </div>
        )}

        {info ? (
          <div className="panel p-5 text-xs text-muted-foreground">
            <p className="font-mono">{info.model}</p>
            <p className="mt-1 font-mono">
              Android {info.androidVersion} · app {info.appVersion} · battery {info.batteryLevel}%
              {info.charging ? " (charging)" : ""} · {info.network}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
