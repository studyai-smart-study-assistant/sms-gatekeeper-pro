import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Ban, Copy, KeyRound, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/gatekeeper/AppShell";
import { StatusBadge } from "@/components/gatekeeper/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiKey, listApiKeys, listDevices, revokeApiKey, rotateApiKey } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/api-keys")({
  head: () => ({
    meta: [
      { title: "API keys — SMS Gatekeeper" },
      {
        name: "description",
        content: "Create, rotate and revoke scoped API keys for the SMS Gatekeeper send endpoint.",
      },
      { property: "og:title", content: "API keys — SMS Gatekeeper" },
      { property: "og:description", content: "Hashed, scoped, revocable API keys for external backends." },
    ],
  }),
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const fetchKeys = useServerFn(listApiKeys);
  const fetchDevices = useServerFn(listDevices);
  const mintKey = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const rotate = useServerFn(rotateApiKey);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Production backend");
  const [deviceId, setDeviceId] = useState("default");
  const [expiryDays, setExpiryDays] = useState("never");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const { data: keys, isPending } = useQuery({ queryKey: ["api-keys"], queryFn: () => fetchKeys() });
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: () => fetchDevices() });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["api-keys"] });

  const createMutation = useMutation({
    mutationFn: () =>
      mintKey({
        data: {
          name,
          device_id: deviceId === "default" ? null : deviceId,
          expires_in_days: expiryDays === "never" ? null : Number(expiryDays),
        },
      }),
    onSuccess: (result) => {
      setFreshKey(result.api_key);
      refresh();
    },
    onError: () => toast.error("Could not create the API key."),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("API key revoked.");
      refresh();
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotate({ data: { id } }),
    onSuccess: (result) => {
      setFreshKey(result.api_key);
      setOpen(true);
      refresh();
    },
  });

  const deviceLabel = (id: string | null) =>
    id ? ((devices ?? []).find((d) => d.id === id)?.name ?? "unknown device") : "Account default device";

  return (
    <AppShell
      title="API keys"
      description="Keys are hashed at rest and shown in full exactly once."
      actions={
        <Button
          onClick={() => {
            setFreshKey(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Create API key
        </Button>
      }
    >
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (keys ?? []).length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          No API keys yet. Create one to let an external backend queue SMS jobs.
        </div>
      ) : (
        <div className="panel divide-y divide-border">
          {(keys ?? []).map((key) => {
            const expired = !!key.expires_at && new Date(key.expires_at) < new Date();
            const status = key.revoked_at ? "revoked" : expired ? "disabled" : "active";
            return (
              <div key={key.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-primary" />
                    <p className="font-medium">{key.name}</p>
                    <StatusBadge status={status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {key.key_prefix}••••••••{key.key_hint}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deviceLabel(key.device_id)} · scopes {key.scopes.join(", ")} · {key.requests_per_minute} req/min ·{" "}
                    {key.sms_per_day} SMS/day
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    created {new Date(key.created_at).toLocaleDateString()} · last used{" "}
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}
                    {key.expires_at ? ` · expires ${new Date(key.expires_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => rotateMutation.mutate(key.id)}>
                    <RefreshCw className="size-4" /> Rotate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={!!key.revoked_at}
                    onClick={() => revokeMutation.mutate(key.id)}
                  >
                    <Ban className="size-4" /> Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{freshKey ? "Copy your API key now" : "Create API key"}</DialogTitle>
            <DialogDescription>
              {freshKey
                ? "This is the only time the full key is shown. Store it in your backend's secret storage."
                : "Scope: sms:send. Bind the key to a device or let it use your default device."}
            </DialogDescription>
          </DialogHeader>

          {freshKey ? (
            <div className="space-y-4">
              <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                {freshKey}
              </pre>
              <Button
                className="w-full"
                onClick={() => {
                  void navigator.clipboard.writeText(freshKey);
                  toast.success("API key copied.");
                }}
              >
                <Copy className="size-4" /> Copy key
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
                I stored it safely
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Associated device</Label>
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Account default device</SelectItem>
                    {(devices ?? []).map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expiration</Label>
                <Select value={expiryDays} onValueChange={setExpiryDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">No expiry</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                Create key
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
