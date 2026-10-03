/** Timescale policy drafts: PostgreSQL interval text in, one amount and unit out, and back. */
import type { TimescaleJob, TimescalePolicy } from "./api";

export type IntervalUnit = "hours" | "days" | "weeks" | "months" | "years";
export type Interval = { amount: number; unit: IntervalUnit };
export type PolicyKind = "compression" | "retention";

export const intervalUnits: readonly { value: IntervalUnit; label: string }[] = [
  { value: "hours", label: "Hours" }, { value: "days", label: "Days" }, { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" }, { value: "years", label: "Years" },
];

const unitNames: Record<string, IntervalUnit> = {
  hour: "hours", hours: "hours", day: "days", days: "days", week: "weeks", weeks: "weeks",
  mon: "months", mons: "months", month: "months", months: "months", year: "years", years: "years",
};

// Approximate lengths, as PostgreSQL compares intervals: a month is 30 days, a year 365 days.
const unitHours: Record<string, number> = {
  year: 8760, years: 8760, mon: 720, mons: 720, month: 720, months: 720, week: 168, weeks: 168,
  day: 24, days: 24, hour: 1, hours: 1, min: 1 / 60, mins: 1 / 60, minute: 1 / 60, minutes: 1 / 60,
  sec: 1 / 3600, secs: 1 / 3600, second: 1 / 3600, seconds: 1 / 3600,
};

/** Read interval output that names one whole unit (`30 days`, `2 mons`, `12:00:00`); null otherwise. */
export function parseInterval(text: string | null | undefined): Interval | null {
  const value = text?.trim().toLowerCase() ?? "";
  const clock = /^(\d+):00(?::00)?$/.exec(value);
  if (clock) return { amount: Number(clock[1]), unit: "hours" };
  const single = /^(\d+)\s+([a-z]+)$/.exec(value);
  return single && Object.hasOwn(unitNames, single[2]) ? { amount: Number(single[1]), unit: unitNames[single[2]] } : null;
}

export function formatInterval({ amount, unit }: Interval): string {
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

/** Approximate length in hours of any plain interval output, such as `1 day 12:00:00`; null when unreadable. */
export function intervalHours(text: string | null | undefined): number | null {
  const tokens = text?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (!tokens.length) return null;
  let hours = 0;
  const clock = /^(-?)(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(tokens[tokens.length - 1]);
  if (clock) {
    tokens.pop();
    hours += (clock[1] ? -1 : 1) * (Number(clock[2]) + Number(clock[3]) / 60 + Number(clock[4] ?? 0) / 3600);
  }
  if (tokens.length % 2) return null;
  for (let index = 0; index < tokens.length; index += 2) {
    if (!/^-?\d+(?:\.\d+)?$/.test(tokens[index]) || !Object.hasOwn(unitHours, tokens[index + 1])) return null;
    hours += Number(tokens[index]) * unitHours[tokens[index + 1]];
  }
  return hours;
}

function canonicalInterval(text: string | null | undefined): string | null {
  const interval = parseInterval(text);
  return interval ? formatInterval(interval) : text?.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

export type PolicyDraft = {
  enabled: boolean;
  amount: string;
  unit: IntervalUnit;
  /** Loaded interval text that names more than one unit; edited as plain text so nothing is lost. */
  raw: string | null;
  schedule_interval: string;
  /** ISO timestamp; the form shows it in local time. */
  initial_start: string | null;
  timezone: string;
};

const defaultAfter: Record<PolicyKind, Interval> = { compression: { amount: 7, unit: "days" }, retention: { amount: 1, unit: "years" } };

export function policyDraft(policy: TimescalePolicy, kind: PolicyKind): PolicyDraft {
  const interval = policy.after ? parseInterval(policy.after) : defaultAfter[kind];
  return {
    enabled: Boolean(policy.after),
    amount: interval ? String(interval.amount) : "",
    unit: interval?.unit ?? "days",
    raw: policy.after && !interval ? policy.after : null,
    schedule_interval: policy.schedule_interval ?? "",
    initial_start: policy.initial_start ?? null,
    timezone: policy.timezone ?? "",
  };
}

export function draftAfter(draft: PolicyDraft): string | null {
  if (!draft.enabled) return null;
  return draft.raw !== null ? draft.raw.trim() : formatInterval({ amount: Number(draft.amount), unit: draft.unit });
}

export function draftError(draft: PolicyDraft): string | null {
  if (!draft.enabled) return null;
  if (draft.raw !== null) return draft.raw.trim() ? null : "Enter an interval such as 30 days.";
  return /^\d+$/.test(draft.amount.trim()) && Number(draft.amount) > 0 ? null : "Enter a whole number greater than 0.";
}

/** The PUT body for one policy; a disabled policy is removed. */
export function policyRequest(draft: PolicyDraft): TimescalePolicy {
  const after = draftAfter(draft);
  if (after === null) return { after: null, schedule_interval: null, initial_start: null, timezone: null };
  return { after, schedule_interval: draft.schedule_interval.trim() || null, initial_start: draft.initial_start || null, timezone: draft.timezone.trim() || null };
}

/** Both policies on: retention must be longer than compression. Unreadable text is left to the API. */
export function retentionOrderError(compression: PolicyDraft, retention: PolicyDraft): string | null {
  const compressAfter = intervalHours(draftAfter(compression)), dropAfter = intervalHours(draftAfter(retention));
  if (compressAfter === null || dropAfter === null || dropAfter > compressAfter) return null;
  return "Retention must be longer than compression, or chunks are dropped before they are compressed.";
}

/** Saving retention drops data: confirm whenever it is turned on or its interval changes. */
export function retentionNeedsConfirmation(draft: PolicyDraft, loaded: TimescalePolicy): boolean {
  const after = draftAfter(draft);
  return after !== null && canonicalInterval(after) !== canonicalInterval(loaded.after);
}

/** The oldest time retention keeps if it ran at `now`. */
export function retentionCutoff(after: string, now: Date): Date | null {
  const interval = parseInterval(after), cutoff = new Date(now);
  if (interval?.unit === "years") cutoff.setUTCFullYear(cutoff.getUTCFullYear() - interval.amount);
  else if (interval?.unit === "months") cutoff.setUTCMonth(cutoff.getUTCMonth() - interval.amount);
  else if (interval?.unit === "weeks" || interval?.unit === "days") cutoff.setUTCDate(cutoff.getUTCDate() - interval.amount * (interval.unit === "weeks" ? 7 : 1));
  else {
    const hours = intervalHours(after);
    if (hours === null) return null;
    cutoff.setTime(cutoff.getTime() - hours * 3_600_000);
  }
  return cutoff;
}

export function eligibilityMessage(reason: string | null, version: string | null): { title: string; message: string } {
  if (reason === "timescale_not_hypertable") return { title: "Not a hypertable", message: "This table is not a TimescaleDB hypertable, so it cannot have compression or retention policies." };
  if (reason === "timescale_version_unsupported") return { title: "TimescaleDB 2.11+ required", message: `Compression and retention policies require TimescaleDB 2.11 or later${version ? `; this DataSource runs ${version}` : ""}.` };
  if (reason === "timescale_extension_missing") return { title: "TimescaleDB not installed", message: "The TimescaleDB extension is not installed in this DataSource’s database." };
  return { title: "Policies unavailable", message: "This table cannot have Timescale policies." };
}

export function jobStatusTone(status: TimescaleJob["status"]): "accent" | "success" | "warning" | "danger" {
  return status === "Failed" ? "danger" : status === "Paused" ? "warning" : status === "Running" ? "accent" : "success";
}

export function jobPolicyLabel(job: Pick<TimescaleJob, "kind" | "proc_name">): string {
  return job.kind === "compression" ? "Compression" : job.kind === "retention" ? "Retention" : job.proc_name;
}

export function formatBytes(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const units = ["B", "kB", "MB", "GB", "TB", "PB"];
  let size = value, index = 0;
  while (Math.abs(size) >= 1024 && index < units.length - 1) { size /= 1024; index++; }
  return `${index === 0 || size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export function localDateTimeValue(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
}

export function isoFromLocalDateTime(value: string): string | null {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}
