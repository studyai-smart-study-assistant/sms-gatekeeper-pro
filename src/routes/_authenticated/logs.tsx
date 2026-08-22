import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/gatekeeper/AppShell";
import { StatusBadge } from "@/components/gatekeeper/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listSmsJobs } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "SMS logs — SMS Gatekeeper" },
      { name: "description", content: "Full delivery history of every queued, sent and failed SMS job." },
      { property: "og:title", content: "SMS logs — SMS Gatekeeper" },
      { property: "og:description", content: "Audit every SMS job with its status, device and failure reason." },
    ],
  }),
  component: LogsPage,
});

const STATUSES = ["all", "queued", "sending", "sent", "failed", "canceled"] as const;

function LogsPage() {
  const fetchJobs = useServerFn(listSmsJobs);
  const [status, setStatus] = useState<string>("all");

  const { data: jobs, isPending } = useQuery({
    queryKey: ["sms-jobs", status],
    queryFn: () => fetchJobs({ data: { limit: 100, ...(status === "all" ? {} : { status }) } }),
    refetchInterval: 15000,
  });

  return (
    <AppShell
      title="SMS logs"
      description="Every API call becomes a durable job with a full status trail."
      actions={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (jobs ?? []).length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">No SMS jobs match this filter.</div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Message ID</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(jobs ?? []).map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{job.message_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.recipient}</td>
                  <td className="px-4 py-3 text-xs">{job.device ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.attempts}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                    {job.error_message ? (
                      <p className="mt-1 max-w-xs text-xs text-destructive">{job.error_message}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
