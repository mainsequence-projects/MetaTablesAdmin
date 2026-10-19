import type { SecurityCheck } from "./api";

/** A hosted check runs as a Main Sequence Job; the panel polls until it records its outcome. */
export const SECURITY_CHECK_POLL_MS = 5000;
/** The Job's own limit: after it, the run cannot still be going. */
export const SECURITY_CHECK_POLL_LIMIT_MS = 30 * 60 * 1000;

/** Whether `check` is a finished run that started at or after `since` (both API timestamps). */
export function checkFinishedSince(check: SecurityCheck | null | undefined, since: string): boolean {
  return !!check && check.outcome !== "running" && check.started_at >= since;
}

export function describeCheck(check: SecurityCheck | null | undefined, formatDate: (value?: string | null) => string): string {
  if (!check) return "Not run yet";
  const by = check.trigger === "admin" ? "run by an admin" : "daily";
  if (check.outcome === "running") return `Running since ${formatDate(check.started_at)} (${by})`;
  const when = `${formatDate(check.finished_at)} (${by})`;
  if (check.outcome === "failed") return `Failed: ${check.error ?? "unknown error"} · ${when}`;
  if (check.outcome === "repaired") {
    const count = check.statements ?? 0;
    return `Repaired ${count} ${count === 1 ? "difference" : "differences"} · ${when}`;
  }
  return `Passed · ${when}`;
}
