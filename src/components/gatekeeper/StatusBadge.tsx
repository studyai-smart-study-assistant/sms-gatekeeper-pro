import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "muted" | "info";

const TONES: Record<Tone, string> = {
  success: "border-success/40 bg-success/12 text-success",
  warning: "border-warning/40 bg-warning/12 text-warning",
  danger: "border-destructive/40 bg-destructive/12 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
  info: "border-primary/40 bg-primary/12 text-primary",
};

const STATUS_TONES: Record<string, Tone> = {
  sent: "success",
  active: "success",
  online: "success",
  verified: "success",
  granted: "success",
  queued: "info",
  sending: "info",
  pending: "warning",
  permission_required: "warning",
  denied: "warning",
  unknown: "muted",
  offline: "muted",
  failed: "danger",
  disabled: "danger",
  permanently_denied: "danger",
  revoked: "danger",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONES[status] ?? "muted";
  return (
    <Badge variant="outline" className={cn("font-mono text-[11px] uppercase tracking-wide", TONES[tone], className)}>
      <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
