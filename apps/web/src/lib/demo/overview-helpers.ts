import type { PolicyStatus } from "@warden/shared";

export function remainingPercent(remaining: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((remaining / limit) * 100));
}

export function progressBarClass(status: PolicyStatus) {
  if (status === "blocked") return "bg-destructive";
  if (status === "outside_window") return "bg-yellow-500";
  return "bg-primary";
}

export function statusBadgeVariant(status: PolicyStatus) {
  if (status === "allowed") return "success" as const;
  if (status === "blocked") return "destructive" as const;
  return "warning" as const;
}
