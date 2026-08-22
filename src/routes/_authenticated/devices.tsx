import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/gatekeeper/AppShell";
import { StatusBadge } from "@/components/gatekeeper/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { createPairingCode, deleteDevice, listDevices, updateDevice } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({
    meta: [
      { title: "Registered devices — SMS Gatekeeper" },
      {
        name: "description",
        content: "Pair Android phones, verify SMS permission and choose the default sender device.",
      },
      { property: "og:title", content: "Registered devices — SMS Gatekeeper" },
      { property: "og:description", content: "Manage the Android phones allowed to send SMS for your account." },
    ],
  }),
  component: DevicesPage,
});

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const total = Math.floor(left / 1000);
  return (
    <span className="font-mono">
      {String(Math.floor(total / 60)).padStart(2, "0")}:{String(total % 60).padStart(2, "0")}
    </span>
  );
}

function DevicesPage() {
  const fetchDevices = useServerFn(listDevices);
  const mintCode = useServerFn(createPairingCode);
  const patchDevice = useServerFn(updateDevice);
  const dropDevice = useServerFn(deleteDevice);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("My Android Phone");
  const [senderNumber, setSenderNumber] = useState("");
  const [pairing, setPairing] = useState<{ pairing_code: string; expires_at: string } | null>(null);

  const { data: devices, isPending } = useQuery({
    queryKey: ["devices"],
    queryFn: () => fetchDevices(),
    refetchInterval: 15000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const pairMutation = useMutation({
    mutationFn: () =>
      mintCode({ data: { device_name: deviceName, sender_number: senderNumber || null } }),
    onSuccess: (result) => setPairing(result),
    onError: () => toast.error("Could not create a pairing code."),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; enabled?: boolean; is_default?: boolean; is_backup?: boolean }) =>
      patchDevice({ data: input }),
    onSuccess: refresh,
    onError: () => toast.error("Could not update the device."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dropDevice({ data: { id } }),
    onSuccess: () => {
      toast.success("Device removed.");
      refresh();
    },
  });

  return (
    <AppShell
      title="Devices"
      description="Each Android phone gets its own gateway device ID and its own credential."
      actions={
        <Button
          onClick={() => {
            setPairing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Pair new device
        </Button>
      }
    >
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (devices ?? []).length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No devices yet. Generate a pairing code and enter it in the Android Gateway app.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(devices ?? []).map((device) => (
            <div key={device.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{device.name}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{device.gateway_device_id}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={device.status} />
                  <StatusBadge status={device.online ? "online" : "offline"} />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Sender number</dt>
                  <dd className="font-mono">{device.sender_number ?? "not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">SMS permission</dt>
                  <dd>
                    <StatusBadge status={device.sms_permission} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last heartbeat</dt>
                  <dd className="font-mono">
                    {device.last_heartbeat_at ? new Date(device.last_heartbeat_at).toLocaleString() : "never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Android / app</dt>
                  <dd className="font-mono">
                    {device.android_version ?? "?"} / {device.app_version ?? "?"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sent / failed</dt>
                  <dd className="font-mono">
                    {device.sent_count} / {device.failed_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Daily SMS limit</dt>
                  <dd className="font-mono">{device.daily_sms_limit}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-border pt-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={device.enabled}
                    onCheckedChange={(enabled) => updateMutation.mutate({ id: device.id, enabled })}
                  />
                  Enabled
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={device.is_default}
                    onCheckedChange={(is_default) => updateMutation.mutate({ id: device.id, is_default })}
                  />
                  Default device
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={device.is_backup}
                    onCheckedChange={(is_backup) => updateMutation.mutate({ id: device.id, is_backup })}
                  />
                  Backup device
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  onClick={() => deleteMutation.mutate(device.id)}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pair a new Android device</DialogTitle>
            <DialogDescription>
              The code is single-use, expires in 5 minutes and never exposes your account credentials.
            </DialogDescription>
          </DialogHeader>

          {pairing ? (
            <div className="space-y-4 text-center">
              <p className="font-display text-4xl font-bold tracking-[0.35em]">{pairing.pairing_code}</p>
              <p className="text-sm text-muted-foreground">
                Expires in <Countdown expiresAt={pairing.expires_at} />
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(pairing.pairing_code);
                  toast.success("Pairing code copied.");
                }}
              >
                <Copy className="size-4" /> Copy code
              </Button>
              <p className="text-xs text-muted-foreground">
                Open the Android Gateway app, enter this code, then grant the SMS permission. The device appears here
                once it sends its first heartbeat.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  refresh();
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="device-name">Device name</Label>
                <Input id="device-name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sender">Sender number (E.164, optional)</Label>
                <Input
                  id="sender"
                  placeholder="+919876543210"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Android cannot always read the SIM&apos;s own number, so record it here.
                </p>
              </div>
              <Button className="w-full" disabled={pairMutation.isPending} onClick={() => pairMutation.mutate()}>
                Generate pairing code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
