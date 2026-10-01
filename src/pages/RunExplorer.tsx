import "./runExplorer.css";

import { lazy, Suspense, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { Copy, Network, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import { metaTablesApi, type UpdateLog, type UpdateRun } from "../api";
import { detailPath } from "../navigation";
import { epoch, formatDuration, formatInstant, runTimeline, type RunTimeline as Timeline } from "../runTimeline";
import { pipelineNodeLabel, type HistoricalRunGraph } from "../updatePipeline";
import { Badge, Button, DetailSection, formatDate, RemoteContent, StatePanel, useRemote } from "../ui";
import { RunLogStream, useInvocationLogs, type LogScope } from "./RunLogStream";
import { RunTimeline, StateIcon, stateLabel } from "./RunTimeline";

const RunGraph = lazy(() => import("./UpdatePipelinePanel").then(module => ({ default: module.UpdatePipelineCanvas })));
const PAGE_SIZE = 25;
const outcome = (run: UpdateRun) => run.outcome || (run.result === "success" ? "succeeded" : run.result === "error" ? "failed" : "unfinished");
const tone = (value?: string) => value === "succeeded" ? "success" : value === "failed" ? "danger" : "warning";
type AttemptHref = (runUid: string, updateUid: string) => string;

function shortRunTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return formatDate(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

/** Attempts of one invocation stay together: its root, then its dependencies in start order. */
function invocationRows(runs: readonly UpdateRun[]) {
  const groups = new Map<string, UpdateRun[]>();
  for (const run of runs) groups.set(run.root_run_uid || run.uid, [...groups.get(run.root_run_uid || run.uid) ?? [], run]);
  return [...groups].flatMap(([root, members]) => {
    const head = members.find(run => run.uid === root);
    const rest = members.filter(run => run !== head).sort((a, b) => (epoch(a.started_at) ?? 0) - (epoch(b.started_at) ?? 0));
    return [...head ? [{ run: head, child: false }] : [], ...rest.map(run => ({ run, child: Boolean(head) }))];
  });
}

/** One selection drives the run summary, its invocation timeline and the invocation's logs. */
export function RunExplorer({ tableUid, updateUid, runUid, filters = {}, runPath, toolbar,
  title = "Run history", description = "Select a recorded attempt to inspect its invocation and logs." }: {
  tableUid?: string; updateUid?: string; runUid?: string | null;
  filters?: Record<string, string | number | undefined>;
  /** The selected run's location; defaults to the current page with `?run=`. */
  runPath?: (uid: string) => string;
  /** Filter controls; they head the history they narrow. */
  toolbar?: ReactNode;
  title?: string; description?: string;
}) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
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
      : metaTablesApi.listRuns({ ...filters, limit: PAGE_SIZE, offset }, signal));
  const href = (uid: string) => {
    if (runPath) return runPath(uid);
    const next = new URLSearchParams(search);
    next.set("run", uid);
    next.delete("node");
    return `?${next}`;
  };
  // Another updater's attempt is outside an updater-scoped history; open it in Runs.
  const attemptHref: AttemptHref = (run, update) => updateUid && update !== updateUid ? `/runs/${encodeURIComponent(run)}` : href(run);
  const select = (uid: string, replace = false) => navigate(href(uid), { replace });
  const firstUid = history.status === "ready" ? history.data.results[0]?.uid : undefined;
  useEffect(() => {
    if (!selectedUid && firstUid) select(firstUid, true);
  }, [selectedUid, firstUid]);
  const filtered = Object.values(filters).some(Boolean);
  return <DetailSection title={title} description={description}
    actions={<><Button size="small" variant="secondary" aria-expanded={historyExpanded} aria-controls={historyId} onClick={() => setHistoryExpanded(value => !value)}>
      {historyExpanded ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeftOpen size={16} aria-hidden="true" />}{historyExpanded ? "Hide history" : "Show history"}
    </Button><Button size="small" onClick={() => setGeneration(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh runs</Button></>}>
    <div className="mt-runs" data-run-explorer data-history-collapsed={!historyExpanded || undefined}>
      <div id={historyId} className="mt-runs__history-panel" hidden={!historyExpanded}><ApplicationPageStack as="section" className="mt-runs__history" aria-label="Run history">
        {toolbar && <div className="mt-runs__filters" role="group" aria-label="Run filters">{toolbar}</div>}
        <RemoteContent state={history} loading="Loading runs…">{page => <>
          <div className="mt-runs__count">{page.count} {page.count === 1 ? "run attempt" : "run attempts"} · Newest first</div>
          {page.results.length ? <ol className="mt-runs__list" aria-label="Run attempts">{invocationRows(page.results).map(({ run, child }) =>
            <li key={run.uid} data-child={child || undefined}><Button size="small" variant={run.uid === selectedUid ? "secondary" : "ghost"} className="mt-runs__item"
              title={`${formatInstant(run.started_at)} · ${outcome(run)} · ${run.updater_label || run.table_update_uid || "Update"} · ${run.uid}`} aria-current={run.uid === selectedUid ? "true" : undefined}
              onClick={() => select(run.uid)} aria-label={`Run ${formatInstant(run.started_at)}, ${outcome(run)}, ${run.uid}`}><span className="mt-runs__item-content">
              <span className="mt-runs__status" data-outcome={outcome(run)} aria-hidden="true" />
              <time dateTime={run.started_at || undefined}>{shortRunTime(run.started_at)}</time>
              <span className="mt-runs__source">{run.updater_label || run.table_update_uid || "Update"}</span>
              <span className="mt-runs__duration">{formatDuration(run.duration_seconds)}</span>
            </span></Button></li>)}</ol>
            : filtered ? <StatePanel embedded title="No matching runs">Change or clear the filters.</StatePanel>
              : <StatePanel embedded title="No runs yet">No executions match this view.</StatePanel>}
          {page.count > PAGE_SIZE && <div className="mt-runs__pagination" role="group" aria-label="Run history pages">
            <Button size="small" variant="ghost" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Previous</Button>
            <span>{page.count ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, page.count)}` : "0"}</span>
            <Button size="small" variant="ghost" disabled={offset + PAGE_SIZE >= page.count} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next</Button>
          </div>}
        </>}</RemoteContent>
      </ApplicationPageStack></div>
      <section className="mt-runs__detail" aria-label="Selected run">
        {selectedUid ? <SelectedRun key={`${selectedUid}-${generation}`} uid={selectedUid} tableUid={tableUid} updateUid={updateUid} attemptHref={attemptHref}
          historyRecord={history.status === "ready" ? history.data.results.find(run => run.uid === selectedUid) : undefined} />
          : <StatePanel embedded title="Select a run">Its invocation timeline will appear here.</StatePanel>}
      </section>
    </div>
  </DetailSection>;
}

function SelectedRun({ uid, tableUid, updateUid, historyRecord, attemptHref }: {
  uid: string; tableUid?: string; updateUid?: string; historyRecord?: UpdateRun; attemptHref: AttemptHref;
}) {
  const remote = useRemote(`run-detail-${uid}`, signal => metaTablesApi.run(uid, signal));
  const context = useRemote(`run-graph-${uid}`, signal => metaTablesApi.runGraph(uid, signal));
  const graph = context.status === "ready" && context.data.availability === "available" ? context.data : undefined;
  const timeline = useMemo(() => graph && runTimeline(graph), [graph]);
  const [scope, setScope] = useState<LogScope>("invocation");
  const [level, setLevel] = useState("");
  const [hoveredLog, setHoveredLog] = useState<string | null>(null);
  const logs = useInvocationLogs(uid, graph ? scope : "attempt", level);
  return <RemoteContent state={remote} loading="Loading the selected run…">{run => {
    const updater = graph?.nodes.find(node => node.kind === "update" && node.uid === run.table_update_uid);
    const updaterLabel = run.updater_label || (updater && pipelineNodeLabel(updater)) || historyRecord?.updater_label;
    const scopedNode = tableUid ? `table:${tableUid}` : updateUid ? `update:${updateUid}` : null;
    if ((updateUid && run.table_update_uid !== updateUid) || (scopedNode && graph && !graph.nodes.some(node => node.id === scopedNode))) {
      return <StatePanel embedded title="Run unavailable in this view">The selected run does not contain this resource under your current access. Select another run.</StatePanel>;
    }
    const attemptLabels = new Map(graph?.nodes.filter(node => node.kind === "update" && node.run_uid).map(node => [node.run_uid!, pipelineNodeLabel(node)]));
    if (!attemptLabels.has(run.uid)) attemptLabels.set(run.uid, updaterLabel || run.table_update_uid || run.uid);
    return <ApplicationPageStack>
      <RunSummary run={run} updaterLabel={updaterLabel} graph={graph} scoped={Boolean(tableUid || updateUid)} />
      {outcome(run) === "unfinished" && <StatePanel embedded title="Completion not recorded">States show the last reported progress; they do not confirm the client is still running.</StatePanel>}
      <RemoteContent state={context} loading="Loading execution context…">{saved => saved.availability === "available" && timeline
        ? <InvocationSection graph={saved} timeline={timeline} runUid={run.uid} logs={logs.rows} hoveredLog={hoveredLog} onHoverLog={setHoveredLog} attemptHref={attemptHref} />
        : <StatePanel embedded title="Historical graph unavailable">This run has no captured invocation graph. Its details and logs remain accessible.</StatePanel>}
      </RemoteContent>
      <RunLogStream logs={logs} origin={timeline?.origin ?? epoch(run.started_at)} originLabel={timeline ? "invocation" : "run"} attemptLabels={attemptLabels}
        runUid={run.uid} scope={graph ? scope : undefined} onScopeChange={setScope} level={level} onLevelChange={setLevel} hoveredLog={hoveredLog} onHoverLog={setHoveredLog} />
    </ApplicationPageStack>;
  }}</RemoteContent>;
}

/** The selected record's identity, outcome and role; the invocation section supplies the context. */
function RunSummary({ run, updaterLabel, graph, scoped }: { run: UpdateRun; updaterLabel?: string; graph?: HistoricalRunGraph; scoped: boolean }) {
  const navigate = useNavigate();
  const updater = graph?.nodes.find(node => node.kind === "update" && node.uid === run.table_update_uid);
  const output = graph?.nodes.find(node => node.uid === updater?.output_table_uid && node.kind !== "update");
  const root = graph?.nodes.find(node => node.id === graph.root_id);
  const result = outcome(run);
  const parent = run.root_run_uid && run.root_run_uid !== run.uid ? run.root_run_uid : null;
  const role = !graph ? "Run attempt" : parent ? `Dependency attempt · ${root ? pipelineNodeLabel(root) : "Parent"} invocation` : "Root attempt of its invocation";
  const action = (label: string, path: string) => <Button variant="secondary" size="small" title={path} onClick={() => navigate(path)}>{label}</Button>;
  return <ApplicationPageHeader className="mt-run-header" aria-label="Selected run summary" titleAs="h3" eyebrow={role}
    title={<span className="mt-run-header__title"><StateIcon state={result} size={20} />{updaterLabel || run.table_update_uid || "Run"}</span>}
    description={<span className="mt-run-header__facts">
      <Badge tone={tone(result)}>{stateLabel(result)}</Badge>
      <span className="mt-run-header__duration">{formatDuration(run.duration_seconds)}</span>
      <span>Started {formatInstant(run.started_at)}</span>
      <span className="mt-run-header__uid">Run {run.uid}<Button iconOnly size="small" variant="ghost" aria-label="Copy run UID" title="Copy run UID"
        onClick={() => void navigator.clipboard?.writeText(run.uid)}><Copy size={14} aria-hidden="true" /></Button></span>
    </span>}
    actions={<div className="mt-runs__links" role="group" aria-label="Run resources">
      {run.table_update_uid && action("Open updater", detailPath("data-updates", run.table_update_uid))}
      {output && action(`Output: ${pipelineNodeLabel(output)}`, detailPath(output.kind === "time_index_table" ? "time-index-meta-tables" : "tables", output.uid))}
      {run.table_update_uid && action("All runs of this updater", `/runs?updater=${encodeURIComponent(run.table_update_uid)}`)}
      {parent && action("Parent execution", `/runs/${encodeURIComponent(parent)}`)}
      {scoped && action("Run permalink", `/runs/${encodeURIComponent(run.uid)}`)}
    </div>} />;
}

function InvocationSection({ graph, timeline, runUid, logs, hoveredLog, onHoverLog, attemptHref }: {
  graph: HistoricalRunGraph; timeline: Timeline; runUid: string; logs: readonly UpdateLog[];
  hoveredLog: string | null; onHoverLog: (uid: string | null) => void; attemptHref: AttemptHref;
}) {
  const [lineage, setLineage] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const lineageId = useId();
  const root = graph.nodes.find(node => node.id === graph.root_id);
  const attempts = timeline.rows.filter(row => row.node.run_uid).length;
  return <DetailSection title="Invocation" titleAs="h3"
    description={[`${root ? pipelineNodeLabel(root) : "Root"} invocation`, stateLabel(graph.outcome), formatDuration(graph.duration_seconds),
      `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`, `started ${formatInstant(graph.started_at)}`].join(" · ")}
    actions={<Button size="small" variant={lineage ? "secondary" : "ghost"} aria-expanded={lineage} aria-controls={lineageId}
      onClick={() => setLineage(value => !value)}><Network size={16} aria-hidden="true" />Lineage graph</Button>}>
    {graph.partial && <StatePanel embedded title="Partial invocation">Some attempts and tables are hidden by your current table access.</StatePanel>}
    <RunTimeline timeline={timeline} currentRunUid={runUid} logs={logs} hoveredLog={hoveredLog} onHoverLog={onHoverLog} attemptHref={attemptHref} />
    <div id={lineageId} className="mt-run-lineage" hidden={!lineage}>{lineage && <Suspense fallback={<StatePanel embedded title="Loading lineage graph…" />}>
      {/* Lanes and "This update" follow the selected record, not the invocation root. */}
      <RunGraph graph={{ ...graph, root_id: graph.selected_node_id || graph.root_id }} historical selectedNodeId={selectedNode} onSelectNode={setSelectedNode} />
    </Suspense>}</div>
  </DetailSection>;
}
