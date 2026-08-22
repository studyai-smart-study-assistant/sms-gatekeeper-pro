import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/gatekeeper/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings, updateSettings } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — SMS Gatekeeper" },
      { name: "description", content: "Global pause switch, rate limits and backup device routing for your gateway." },
      { property: "og:title", content: "Account settings — SMS Gatekeeper" },
      { property: "og:description", content: "Control limits and the emergency stop for all outgoing SMS." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(updateSettings);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });

  const [form, setForm] = useState({
    sms_paused: false,
    requests_per_minute: 60,
    sms_per_hour: 100,
    sms_per_day: 500,
    allow_backup_routing: false,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      sms_paused: data.sms_paused,
      requests_per_minute: data.requests_per_minute,
      sms_per_hour: data.sms_per_hour,
      sms_per_day: data.sms_per_day,
      allow_backup_routing: data.allow_backup_routing,
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => toast.error("Could not save settings."),
  });

  if (isPending) {
    return (
      <AppShell title="Settings">
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" description="Account-wide guardrails applied before any SMS leaves your phone.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel space-y-5 p-5">
          <h2 className="text-sm font-semibold">Safety</h2>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="text-sm font-medium">Pause all SMS sending</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Emergency stop. The API keeps accepting calls only after you resume.
              </span>
            </span>
            <Switch
              checked={form.sms_paused}
              onCheckedChange={(sms_paused) => setForm((f) => ({ ...f, sms_paused }))}
            />
          </label>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="text-sm font-medium">Allow backup device routing</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                If the default device is offline, route the job to a backup device.
              </span>
            </span>
            <Switch
              checked={form.allow_backup_routing}
              onCheckedChange={(allow_backup_routing) => setForm((f) => ({ ...f, allow_backup_routing }))}
            />
          </label>
        </div>

        <div className="panel space-y-5 p-5">
          <h2 className="text-sm font-semibold">Rate limits</h2>
          {(
            [
              ["requests_per_minute", "API requests per minute"],
              ["sms_per_hour", "SMS per hour"],
              ["sms_per_day", "SMS per day"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="number"
                min={0}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          Save settings
        </Button>
      </div>
    </AppShell>
  );
}
