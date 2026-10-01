import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { metaTablesApi, type UpdateLog, type UpdateLogPage } from "../api";
import { epoch, formatInstant, formatOffset } from "../runTimeline";
import { Badge, Button, DetailSection, JsonBlock, LoadingIndicator, Picker, StatePanel, useRemote } from "../ui";

const PAGE_SIZE = 200;
const LEVELS = ["debug", "info", "warning", "error", "critical"];
const levelTone = (level?: string | null) => level === "warning" ? "warning" : level === "error" || level === "critical" ? "danger" : "neutral";

export type LogScope = "invocation" | "attempt";
export type InvocationLogs = ReturnType<typeof useInvocationLogs>;

/** One server-filtered stream; further pages append to the rows the timeline marks. */
export function useInvocationLogs(runUid: string, scope: LogScope, level: string) {
  const [generation, setGeneration] = useState(0);
  const key = JSON.stringify([runUid, scope, level, generation]);
  const query = { limit: PAGE_SIZE, level: level || undefined, run_uid: scope === "attempt" ? runUid : undefined };
  const first = useRemote(`invocation-logs-${key}`, signal => metaTablesApi.invocationLogs(runUid, query, signal));
  const [more, setMore] = useState<{ key: string; pages: UpdateLogPage[]; loading: boolean; error: string | null }>({ key, pages: [], loading: false, error: null });
  const extra = more.key === key ? more : { key, pages: [], loading: false, error: null };
  const pages = first.status === "ready" ? [first.data, ...extra.pages] : [];
  const cursor = pages.at(-1)?.next_cursor;
  const loadMore = () => {
    if (!cursor || extra.loading) return;
    setMore({ ...extra, loading: true, error: null });
    metaTablesApi.invocationLogs(runUid, { ...query, cursor }).then(
      page => setMore(value => value.key === key ? { key, pages: [...extra.pages, page], loading: false, error: null } : value),
      (error: unknown) => setMore(value => value.key === key ? { ...extra, loading: false, error: error instanceof Error ? error.message : "Could not read more logs." } : value));
  };
  return { first, rows: pages.flatMap(page => page.rows), hasMore: Boolean(cursor), loadingMore: extra.loading, moreError: extra.error,
    loadMore, refresh: () => setGeneration(value => value + 1) };
}

export function RunLogStream({ logs, origin, originLabel, attemptLabels, runUid, scope, onScopeChange, level, onLevelChange, hoveredLog, onHoverLog }: {
  logs: InvocationLogs; origin: number | null; originLabel: string; attemptLabels: ReadonlyMap<string, string>; runUid: string;
  /** Absent when the run has no saved invocation: the run is the whole stream. */
  scope?: LogScope; onScopeChange: (scope: LogScope) => void; level: string; onLevelChange: (level: string) => void;
  hoveredLog: string | null; onHoverLog: (uid: string | null) => void;
}) {
  const page = logs.first.status === "ready" ? logs.first.data : null;
  const offset = (log: UpdateLog) => {
    const at = epoch(log.timestamp);
    return at === null || origin === null ? log.timestamp ?? "" : formatOffset((at - origin) / 1000);
  };
  return <DetailSection title="Logs" titleAs="h3" description={`Times count from the ${originLabel} start. Select a line for its context.`}
    actions={<Button size="small" variant="ghost" onClick={logs.refresh}><RefreshCw size={16} aria-hidden="true" />Refresh logs</Button>}>
    <div className="mt-logs__toolbar">
      {scope && <div className="mt-logs__scope" role="group" aria-label="Log scope">
        {([["invocation", "Whole invocation"], ["attempt", "This attempt"]] as const).map(([value, label]) =>
          <Button key={value} size="small" variant={scope === value ? "secondary" : "ghost"} aria-pressed={scope === value}
            onClick={() => onScopeChange(value)}>{label}</Button>)}
      </div>}
      <Picker ariaLabel="Log level" value={level} fitContent onValueChange={onLevelChange}
        options={[{ value: "", label: "All levels" }, ...LEVELS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))]} />
    </div>
    {logs.first.status === "loading" && <LoadingIndicator label="Loading logs…" />}
    {logs.first.status === "error" && <StatePanel embedded tone="danger" title="Could not read logs"
      action={<Button onClick={logs.refresh}>Retry</Button>}>{logs.first.error.message}</StatePanel>}
    {page && page.availability !== "available" && <StatePanel embedded tone="warning" title={`Log availability: ${page.availability}`}>
      Some attempts have no readable capture, expired files, or an unavailable log store.
    </StatePanel>}
    {page && page.truncated && <StatePanel embedded tone="warning" title="Read limit reached">Only a bounded portion of the logs is shown. Select a level to narrow it.</StatePanel>}
    {page && (logs.rows.length ? <ol className="mt-logs" aria-label="Log events" data-attempts={scope === "invocation" || undefined}>{logs.rows.map(log => {
      const { exception, ...context } = log.context ?? {};
      return <li key={`${log.run_uid}:${log.uid}`}>
        <details className="mt-log" data-level={log.level ?? undefined} data-current={scope === "invocation" && log.run_uid === runUid || undefined}
          data-hot={log.uid === hoveredLog || undefined} onMouseEnter={() => onHoverLog(log.uid ?? null)} onMouseLeave={() => onHoverLog(null)}>
          <summary>
            <time className="mt-log__time" dateTime={log.timestamp ?? undefined} title={formatInstant(log.timestamp)}>{offset(log)}</time>
            <span className="mt-log__level"><Badge tone={levelTone(log.level)}>{log.level ?? "info"}</Badge></span>
            {scope === "invocation" && <span className="mt-log__attempt">{log.run_uid ? attemptLabels.get(log.run_uid) ?? log.run_uid : "Unknown attempt"}</span>}
            <span className="mt-log__message" data-code={/^[\w.:-]+$/.test(log.message ?? "") || undefined}>{log.message || log.event || "Log entry"}</span>
          </summary>
          <div className="mt-log__context">
            {typeof exception === "string" && <pre className="mt-log__exception">{exception}</pre>}
            <JsonBlock value={{ timestamp: log.timestamp, event: log.event, source: log.source, run_uid: log.run_uid, ...context,
              ...typeof exception === "string" || exception === undefined ? {} : { exception } }} />
          </div>
        </details>
      </li>;
    })}</ol> : <StatePanel embedded title="No matching log events">Change the scope or level, or refresh to read newly written events.</StatePanel>)}
    {logs.moreError && <StatePanel embedded tone="danger" title="Could not read more logs">{logs.moreError}</StatePanel>}
    {logs.hasMore && <div><Button variant="secondary" pending={logs.loadingMore} onClick={logs.loadMore}>Load more</Button></div>}
  </DetailSection>;
}
