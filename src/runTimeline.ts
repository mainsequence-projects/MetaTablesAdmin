import type { HistoricalRunGraph, PipelineNode } from "./updatePipeline";

/** Seconds from the invocation start; `end` is null while completion is unrecorded. */
export type TimelineSpan = { start: number; end: number | null };
export type TimelineRow = {
  node: PipelineNode;
  /** The table this updater writes. */
  output?: PipelineNode;
  /** The run record: admission to completion. */
  attempt: TimelineSpan | null;
  /** The calculation the node reported as running. */
  calculation: TimelineSpan | null;
  /** When a node without a calculation was resolved: skipped, blocked, not run or failed in preparation. */
  resolved: number | null;
  /** From the last dependency's completion to this node's next recorded start. */
  wait: { start: number; end: number } | null;
};
export type RunTimeline = { origin: number; extent: number; domain: number; step: number; ticks: number[]; rows: TimelineRow[] };

const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

export const epoch = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Human steps (0.25s, 15s, 5m) give five or six readable ticks for any duration. */
export function timelineStep(extent: number) {
  const raw = Math.max(extent, 0.001) / 5;
  return STEPS.find(step => step >= raw) ?? Math.ceil(raw / 86400) * 86400;
}

/** Durations in the unit that matters: 0.65s, 31.3s, 1m 15s, 2h 05m. */
export function formatDuration(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "Unfinished";
  const value = Math.max(0, seconds);
  if (value < 10) return `${value.toFixed(2)}s`;
  if (value < 60) return `${value.toFixed(1)}s`;
  const whole = Math.round(value);
  if (whole < 3600) return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
  return `${Math.floor(whole / 3600)}h ${String(Math.floor(whole % 3600 / 60)).padStart(2, "0")}m`;
}

export function axisLabel(seconds: number, step: number) {
  if (step >= 60) return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${String(Math.round(seconds % 3600 / 60)).padStart(2, "0")}m` : `${Math.round(seconds / 60)}m`;
  return `${seconds.toFixed(step >= 1 ? 0 : String(step).split(".")[1]?.length ?? 0)}s`;
}

/** A local wall-clock instant to the millisecond: Oct 1, 2026, 11:08:52.880 AM. */
export function formatInstant(value?: string | null) {
  const at = epoch(value);
  return at === null ? value ?? "Not available" : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }).format(at);
}

/** A log line's distance from the invocation start, to the millisecond. */
export function formatOffset(seconds: number) {
  if (seconds < 60) return `+${Math.max(0, seconds).toFixed(3)}s`;
  return `+${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1).padStart(4, "0")}s`;
}

/** One row per updater attempt on the invocation clock, in dependency then time order. */
export function runTimeline(graph: HistoricalRunGraph): RunTimeline {
  const updates = graph.nodes.filter(node => node.kind === "update");
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const stamps = updates.flatMap(node => [node.attempt_started_at, node.attempt_ended_at, node.started_at, node.ended_at])
    .map(epoch).filter((value): value is number => value !== null);
  const origin = epoch(graph.started_at) ?? (stamps.length ? Math.min(...stamps) : 0);
  const latest = Math.max(origin, epoch(graph.ended_at) ?? origin, ...stamps);
  const at = (value?: string | null) => { const parsed = epoch(value); return parsed === null ? null : (parsed - origin) / 1000; };
  const span = (start?: string | null, end?: string | null) => { const from = at(start); return from === null ? null : { start: from, end: at(end) }; };
  const rows = new Map(updates.map(node => {
    const calculation = span(node.started_at, node.ended_at);
    const written = graph.edges.find(edge => edge.kind === "writes" && edge.source === node.id);
    return [node.id, { node, output: written && nodes.get(written.target),
      attempt: node.run_uid ? span(node.attempt_started_at, node.attempt_ended_at) : null, calculation,
      resolved: calculation ? null : at(node.ended_at), wait: null } as TimelineRow];
  }));
  const parents = new Map([...rows.keys()].map(id => [id, new Set(graph.edges
    .filter(edge => edge.kind === "depends_on" && edge.target === id && rows.has(edge.source)).map(edge => edge.source))]));
  const end = (row: TimelineRow) => row.calculation?.end ?? row.attempt?.end ?? row.resolved;
  for (const row of rows.values()) {
    const ready = [...parents.get(row.node.id)!].map(id => end(rows.get(id)!)).filter((value): value is number => value !== null);
    if (!ready.length) continue;
    const from = Math.max(...ready);
    const next = row.attempt && row.attempt.start >= from ? row.attempt.start : row.calculation?.start ?? null;
    if (next !== null && next > from) row.wait = { start: from, end: next };
  }
  const activity = (row: TimelineRow) => row.calculation?.start ?? row.attempt?.start ?? row.resolved ?? Number.POSITIVE_INFINITY;
  const compare = (a: TimelineRow, b: TimelineRow) => activity(a) - activity(b) || a.node.label.localeCompare(b.node.label) || a.node.id.localeCompare(b.node.id);
  const ordered: TimelineRow[] = [];
  const pending = new Map(parents);
  while (pending.size) {
    const ready = [...pending].filter(([, waiting]) => !waiting.size).map(([id]) => rows.get(id)!);
    // A corrupt cycle stays visible instead of stopping the order.
    const next = (ready.length ? ready : [...pending.keys()].map(id => rows.get(id)!)).sort(compare)[0];
    ordered.push(next);
    pending.delete(next.node.id);
    for (const waiting of pending.values()) waiting.delete(next.node.id);
  }
  const extent = Math.max(0, (latest - origin) / 1000);
  const step = timelineStep(extent);
  const domain = Math.max(step, Math.ceil(extent / step - 1e-9) * step);
  const ticks = Array.from({ length: Math.round(domain / step) + 1 }, (_, index) => Number((index * step).toFixed(6)));
  return { origin, extent, domain, step, ticks, rows: ordered };
}
