import "./runExplorer.css";

import { lazy, Suspense, useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import { metaTablesApi, type UpdateRun } from "../api";
import { detailPath } from "../navigation";
import { pipelineNodeLabel, type HistoricalRunGraph } from "../updatePipeline";
import { Badge, Button, DetailSection, formatDate, RemoteContent, StatePanel, useRemote } from "../ui";
import { LogsTab } from "./DataUpdatesPage";

const RunGraph = lazy(() => import("./UpdatePipelinePanel").then(module => ({ default: module.UpdatePipelineCanvas })));
const PAGE_SIZE = 25;
const outcome = (run: UpdateRun) => run.outcome || (run.result === "success" ? "succeeded" : run.result === "error" ? "failed" : "unfinished");
const tone = (value?: string) => value === "succeeded" ? "success" : value === "failed" ? "danger" : "warning";
const duration = (seconds?: number | null) => seconds == null ? "Unfinished" : `${seconds.toFixed(1)}s`;

function shortRunTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return formatDate(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function runTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return formatDate(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

/** One selection drives the saved topology, node states and exact attempt logs. */
export function RunExplorer({ tableUid, updateUid, runUid, filters = {}, onSelectRun }: {
  tableUid?: string; updateUid?: string; runUid?: string | null;
  filters?: Record<string, string | number | undefined>;
  onSelectRun?: (uid: string, replace: boolean) => void;
}) {
  const [search, setSearch] = useSearchParams();
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const historyId = useId();
  const [offset, setOffset] = useState(0);
  const [generation, setGeneration] = useState(0);
  const selectedUid = runUid || search.get("run");
  const scope = JSON.stringify([tableUid, updateUid, filters]);
  useEffect(() => setOffset(0), [scope]);
  const history = useRemote(`run-history-${scope}-${offset}-${generation}`, signal => tableUid
    ? metaTablesApi.tableRuns(tableUid, offset, signal, PAGE_SIZE)
    : updateUid ? metaTablesApi.updateRuns(updateUid, offset, signal, PAGE_SIZE)
      : metaTablesApi.rootRuns({ ...filters, limit: PAGE_SIZE, offset }, signal));
  const select = (uid: string, replace = false) => {
    if (onSelectRun) onSelectRun(uid, replace);
    else setSearch(previous => { const next = new URLSearchParams(previous); next.set("run", uid); next.delete("node"); return next; }, { replace });
  };
  const firstUid = history.status === "ready" ? history.data.results[0]?.uid : undefined;
  useEffect(() => {
    if (!selectedUid && firstUid) select(firstUid, true);
  }, [selectedUid, firstUid]);
  return <DetailSection title="Run history" description="Select an execution to see its saved graph, table connections, and node results."
    actions={<><Button size="small" variant="secondary" aria-expanded={historyExpanded} aria-controls={historyId} onClick={() => setHistoryExpanded(value => !value)}>
      {historyExpanded ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeftOpen size={16} aria-hidden="true" />}{historyExpanded ? "Hide history" : "Show history"}
    </Button><Button size="small" onClick={() => setGeneration(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh runs</Button></>}>
    <div className="mt-runs" data-run-explorer data-history-collapsed={!historyExpanded || undefined}>
      <div id={historyId} className="mt-runs__history-panel" hidden={!historyExpanded}><ApplicationPageStack as="section" className="mt-runs__history" aria-label="Run history">
        <RemoteContent state={history} loading="Loading runs…">{page => <>
          <div className="mt-runs__count">{page.count} {page.count === 1 ? "run" : "runs"} · Newest first</div>
          {page.results.length ? <ol className="mt-runs__list" aria-label="Executions">{page.results.map(run =>
            <li key={run.uid}><Button size="small" variant={run.uid === selectedUid ? "secondary" : "ghost"} className="mt-runs__item"
              title={`${runTime(run.started_at)} · ${outcome(run)} · ${run.updater_label || run.table_update_uid || "Update"} · ${run.uid}`} aria-current={run.uid === selectedUid ? "true" : undefined}
              onClick={() => select(run.uid)} aria-label={`Run ${runTime(run.started_at)}, ${outcome(run)}, ${run.uid}`}><span className="mt-runs__item-content">
              <span className="mt-runs__status" data-outcome={outcome(run)} aria-hidden="true" />
              <time dateTime={run.started_at || undefined}>{shortRunTime(run.started_at)}</time>
              <span className="mt-runs__source">{run.updater_label || run.table_update_uid || "Update"}</span>
              <span className="mt-runs__duration">{duration(run.duration_seconds)}</span>
            </span></Button></li>)}</ol>
            : <StatePanel embedded title="No runs yet">No executions match this view.</StatePanel>}
          {page.count > PAGE_SIZE && <div className="mt-runs__pagination" role="group" aria-label="Run history pages">
            <Button size="small" variant="ghost" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Previous</Button>
            <span>{page.count ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, page.count)}` : "0"}</span>
            <Button size="small" variant="ghost" disabled={offset + PAGE_SIZE >= page.count} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next</Button>
          </div>}
        </>}</RemoteContent>
      </ApplicationPageStack></div>
      <section className="mt-runs__detail" aria-label="Selected run">
        {selectedUid ? <SelectedRun key={`${selectedUid}-${generation}`} uid={selectedUid} tableUid={tableUid} updateUid={updateUid} />
          : <StatePanel embedded title="Select a run">Its execution graph will appear here.</StatePanel>}
      </section>
    </div>
  </DetailSection>;
}

function SelectedRun({ uid, tableUid, updateUid }: { uid: string; tableUid?: string; updateUid?: string }) {
  const remote = useRemote(`run-graph-${uid}`, signal => metaTablesApi.runGraph(uid, signal));
  return <RemoteContent state={remote} loading="Loading the selected run graph…">{graph => {
    if (graph.availability !== "available") return <><StatePanel embedded title="Historical graph unavailable">This run has no captured graph. Its exact attempt logs remain accessible.</StatePanel><LogsTab key={uid} runUid={uid} /></>;
    const scopedNode = tableUid ? `table:${tableUid}` : updateUid ? `update:${updateUid}` : null;
    if (scopedNode && !graph.nodes.some(node => node.id === scopedNode)) return <StatePanel embedded title="Run unavailable in this view">The selected run does not contain this resource under your current access. Select another run.</StatePanel>;
    return <ExecutionGraph graph={graph} />;
  }}</RemoteContent>;
}

function ExecutionGraph({ graph }: { graph: HistoricalRunGraph }) {
  const [search, setSearch] = useSearchParams();
  const requested = search.has("node") ? search.get("node") : graph.selected_node_id || graph.root_id;
  const selected = graph.nodes.some(node => node.id === requested) ? requested : null;
  const select = (id: string | null) => setSearch(previous => { const next = new URLSearchParams(previous); next.set("node", id || ""); return next; }, { replace: true });
  const root = graph.nodes.find(node => node.id === graph.root_id);
  const selectedUpdater = graph.nodes.find(node => node.id === selected && node.kind === "update");
  const logsNode = selectedUpdater || root;
  const output = graph.nodes.find(node => node.uid === root?.output_table_uid && node.kind !== "update");
  return <div className="mt-runs__execution">
    <header className="mt-runs__heading">
      <ApplicationPageHeader title={root ? pipelineNodeLabel(root) : "Execution"} titleAs="h3" actions={<Badge tone={tone(graph.outcome)}>{graph.outcome || "unfinished"}</Badge>} />
      <div className="mt-runs__timing"><time dateTime={graph.started_at}>{runTime(graph.started_at)}</time><span>Duration: {duration(graph.duration_seconds)}</span>{graph.ended_at && <span>Ended: {runTime(graph.ended_at)}</span>}</div>
      <div className="mt-runs__links" role="group" aria-label="Run resources">
        {root && <Link to={detailPath("data-updates", root.uid)}>Open root updater</Link>}
        {output && <Link to={detailPath(output.kind === "time_index_table" ? "time-index-meta-tables" : "tables", output.uid)}>Output: {pipelineNodeLabel(output)}</Link>}
        {graph.root_update_uid && <Link to={`/runs?updater=${encodeURIComponent(graph.root_update_uid)}`}>All runs of this updater</Link>}
        <Link to={`/runs/${encodeURIComponent(graph.root_run_uid || graph.run_uid)}`}>Run permalink</Link>
      </div>
      <span className="mt-runs__identity">Run {graph.root_run_uid}{graph.job_run_uid ? ` · Job run ${graph.job_run_uid}` : ""}</span>
    </header>
    {graph.outcome === "unfinished" && <StatePanel embedded title="Completion not recorded">States show the last reported progress; they do not confirm the client is still running.</StatePanel>}
    {graph.partial && <StatePanel embedded title="Partial graph">Some nodes are unavailable under your current table access.</StatePanel>}
    <Suspense fallback={<StatePanel embedded title="Loading run graph…" />}>
      <RunGraph graph={graph} historical selectedNodeId={selected} onSelectNode={select} />
    </Suspense>
    <section aria-label="Run logs">
      {logsNode?.run_uid ? <LogsTab key={logsNode.run_uid} runUid={logsNode.run_uid} updaterLabel={pipelineNodeLabel(logsNode)} />
        : <DetailSection title="Run logs" description={logsNode ? pipelineNodeLabel(logsNode) : undefined}>
          <StatePanel embedded title="No attempt logs">This node did not start in the selected invocation.</StatePanel>
        </DetailSection>}
    </section>
  </div>;
}
