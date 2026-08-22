import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, PauseCircle, PlayCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/gatekeeper/AppShell";
import { StatusBadge } from "@/components/gatekeeper/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getOverview, updateSettings } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Gateway dashboard — SMS Gatekeeper" },
      { name: "description", content: "Live gateway status, registered device, SMS volume and failed jobs." },
      { property: "og:title", content: "Gateway dashboard — SMS Gatekeeper" },
      { property: "og:description", content: "Is my gateway online and can it send SMS right now?" },
    ],
  }),
  component: DashboardPage,
});

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DashboardPage() {
  const fetchOverview = useServerFn(getOverview);
  const saveSettings = useServerFn(updateSettings);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 20000,
  });

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) => saveSettings({ data: { sms_paused: paused } }),
    onSuccess: (_r, paused) => {
      toast.success(paused ? "All SMS sending paused." : "SMS sending resumed.");
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast.error("Could not update the pause switch."),
  });

  return (
    <AppShell
      title="Gateway dashboard"
      description="Everything that decides whether an API call turns into a real SMS."
      actions={
        data ? (
          <Button
            variant={data.smsPaused ? "default" : "destructive"}
            onClick={() => pauseMutation.mutate(!data.smsPaused)}
            disabled={pauseMutation.isPending}
          >
            {data.smsPaused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
            {data.smsPaused ? "Resume sending" : "Pause all SMS"}
          </Button>
        ) : null
      }
    >
      {isPending || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <Smartphone className="size-5 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={data.gatewayOnline ? "online" : "offline"} />
                  {data.smsPaused ? <StatusBadge status="disabled" /> : null}
                </div>
                <p className="mt-2 text-sm">
                  {data.activeDevice ? (
                    <>
                      <span className="font-medium">{data.activeDevice.name}</span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {data.activeDevice.gateway_device_id}
                      </span>
                      {data.activeDevice.sender_number ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          sender {data.activeDevice.sender_number}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No device registered yet.</span>
                  )}
                </p>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link to="/devices">Manage devices</Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Registered devices" value={data.deviceCount} />
            <Metric label="SMS sent today" value={data.sentToday} />
            <Metric label="SMS sent this month" value={data.sentThisMonth} />
            <Metric label="Failed SMS" value={data.failed} hint="last 30 days" />
            <Metric label="In flight" value={data.queued} hint="queued + sending" />
            <Metric label="API requests today" value={data.apiRequestsToday} />
            <Metric
              label="Can it send SMS?"
              value={data.gatewayOnline && !data.smsPaused && data.activeDevice ? "Yes" : "No"}
            />
            <Metric label="Sending state" value={data.smsPaused ? "Paused" : "Live"} />
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Recent SMS jobs</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/logs">View all</Link>
              </Button>
            </div>
            {data.recentJobs.length === 0 ? (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <AlertTriangle className="size-4" /> No SMS jobs yet. Create an API key and call the send endpoint.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentJobs.map((job) => (
                  <li key={job.message_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{job.message_id}</p>
                      <p className="text-sm">
                        {job.recipient}
                        {job.device ? <span className="ml-2 text-xs text-muted-foreground">via {job.device}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.created_at).toLocaleString()}
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
