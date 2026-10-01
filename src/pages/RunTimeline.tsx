import { Link } from "react-router-dom";
import { Ban, CircleCheck, CircleDashed, CircleX, LoaderCircle, SkipForward } from "lucide-react";
import type { UpdateLog } from "../api";
import { axisLabel, epoch, formatDuration, formatOffset, type RunTimeline as Timeline } from "../runTimeline";
import { pipelineNodeLabel } from "../updatePipeline";

const STATE_LABELS: Record<string, string> = { succeeded: "Succeeded", failed: "Failed", running: "Running", unfinished: "Unfinished",
  pending: "Pending", blocked: "Blocked", skipped: "Skipped", not_run: "Not run" };
export const stateLabel = (state?: string | null) => STATE_LABELS[state ?? ""] ?? "No state";

export function StateIcon({ state, size = 16 }: { state?: string | null; size?: number }) {
  const Icon = state === "succeeded" ? CircleCheck : state === "failed" ? CircleX : state === "blocked" ? Ban
    : state === "skipped" ? SkipForward : state === "running" ? LoaderCircle : CircleDashed;
  return <Icon size={size} aria-hidden="true" className="mt-state-icon" data-state={state ?? undefined} />;
}

/** Attempts on the invocation clock; log events sit on their attempt's row. */
export function RunTimeline({ timeline, currentRunUid, logs, hoveredLog, onHoverLog, attemptHref }: {
  timeline: Timeline; currentRunUid: string; logs: readonly UpdateLog[]; hoveredLog: string | null;
  onHoverLog: (uid: string | null) => void; attemptHref: (runUid: string, updateUid: string) => string;
}) {
  const share = (seconds: number) => Math.min(100, Math.max(0, seconds / timeline.domain * 100));
  const place = (start: number, end: number | null) => ({ left: `${share(start)}%`, width: `${share(end ?? timeline.extent) - share(start)}%` });
  const events = new Map<string, UpdateLog[]>();
  for (const log of logs) if (log.run_uid) events.set(log.run_uid, [...events.get(log.run_uid) ?? [], log]);
  const grid = timeline.ticks.map(tick => <i key={tick} className="mt-timeline__gridline" style={{ left: `${share(tick)}%` }} />);
  return <div className="mt-timeline">
    <div className="mt-timeline__axis" aria-hidden="true"><span />
      <div className="mt-timeline__track">{timeline.ticks.map((tick, index) => <span key={tick} style={{ left: `${share(tick)}%` }}
        data-edge={index === 0 ? "start" : index === timeline.ticks.length - 1 ? "end" : undefined}>{axisLabel(tick, timeline.step)}</span>)}</div>
      <span />
    </div>
    <ol className="mt-timeline__rows" aria-label="Updater attempts">{timeline.rows.map(row => {
      const { node, attempt, calculation, wait } = row;
      const current = Boolean(node.run_uid && node.run_uid === currentRunUid);
      const label = pipelineNodeLabel(node);
      const meta = [row.output && `→ ${pipelineNodeLabel(row.output)}`, node.reason?.replaceAll("_", " ")].filter(Boolean).join(" · ");
      const elapsed = attempt ? attempt.end === null ? "Unfinished" : formatDuration(attempt.end - attempt.start) : stateLabel(node.state);
      const text = <><span className="mt-timeline__label">{label}</span>{meta && <span className="mt-timeline__meta" title={meta}>{meta}</span>}</>;
      return <li key={node.id} className="mt-timeline__row" data-state={node.state ?? undefined} data-current={current || undefined}>
        <span className="mt-timeline__name">
          <StateIcon state={node.state} />
          {node.run_uid ? <Link className="mt-timeline__text" to={attemptHref(node.run_uid, node.uid)} aria-current={current ? "page" : undefined}
            aria-label={`${label}, ${stateLabel(node.state)}, ${elapsed}`}>{text}</Link> : <span className="mt-timeline__text">{text}</span>}
        </span>
        <span className="mt-timeline__track" aria-hidden="true">
          {grid}
          {attempt && <span className="mt-timeline__attempt" data-open={attempt.end === null || undefined} style={place(attempt.start, attempt.end)} />}
          {wait && <span className="mt-timeline__wait" style={place(wait.start, wait.end)} title={`Started ${formatDuration(wait.end - wait.start)} after its dependencies finished`}>
            {(wait.end - wait.start) / timeline.domain > 0.12 && <span>waited {formatDuration(wait.end - wait.start)}</span>}
          </span>}
          {calculation && <span className="mt-timeline__calculation" data-open={calculation.end === null || undefined} style={place(calculation.start, calculation.end)} />}
          {row.resolved !== null && <span className="mt-timeline__resolved" style={{ left: `${share(row.resolved)}%` }} />}
          {(node.run_uid && events.get(node.run_uid) || []).map(log => {
            const at = epoch(log.timestamp);
            return at === null ? null : <span key={log.uid} className="mt-timeline__event" data-level={log.level ?? undefined} data-hot={log.uid === hoveredLog || undefined}
              style={{ left: `${share((at - timeline.origin) / 1000)}%` }} title={`${formatOffset((at - timeline.origin) / 1000)} · ${log.message ?? log.event ?? ""}`}
              onMouseEnter={() => onHoverLog(log.uid ?? null)} onMouseLeave={() => onHoverLog(null)} />;
          })}
        </span>
        <span className="mt-timeline__duration">{elapsed}</span>
      </li>;
    })}</ol>
    <div className="mt-timeline__legend" aria-hidden="true">
      <span><i data-key="attempt" />Attempt open</span>
      <span><i data-key="calculation" />Calculating</span>
      <span><i data-key="wait" />Waiting on dependencies</span>
      <span><i data-key="event" />Log event</span>
      <span><i data-key="warning" />Warning</span>
      <span><i data-key="error" />Error</span>
    </div>
  </div>;
}
