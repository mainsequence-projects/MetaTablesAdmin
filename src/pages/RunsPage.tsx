import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi } from "../api";
import { Button, DetailSection, Facts, formatDate, Picker, RemoteContent, StatePanel, useRemote } from "../ui";
import { LogsTab } from "./DataUpdatesPage";
import type { HistoricalRunGraph } from "../updatePipeline";

const RunGraph = lazy(() => import("./UpdatePipelinePanel").then(module => ({ default: module.UpdatePipelineCanvas })));

export function RunsPage({ uid }: { uid: string | null }) {
  return uid ? <RunDetails uid={uid} /> : <RunHistory />;
}

function RunHistory() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [generation, setGeneration] = useState(0);
  const [producerSearch, setProducerSearch] = useState("");
  const offset = Math.max(0, Number(search.get("offset")) || 0);
  const query = { table_update_uid: search.get("updater") || undefined, outcome: search.get("outcome") || undefined,
    start_time: search.get("start") || undefined, end_time: search.get("end") || undefined, limit: 25, offset };
  const remote = useRemote(JSON.stringify(["root-runs", query, generation]), signal => metaTablesApi.rootRuns(query, signal));
  const producers = useRemote(`run-producers-${producerSearch}`, signal => metaTablesApi.listUpdates({ search: producerSearch, limit: 100 }, signal));
  const change = (key: string, value: string) => {
    setSearch(previous => { const next = new URLSearchParams(previous); next.delete("offset");
      if (value) next.set(key, value); else next.delete(key); return next; });
  };
  const dateValue = (key: string) => {
    const value = search.get(key);
    if (!value || !Number.isFinite(Date.parse(value))) return "";
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const selectPage = (value: number) => setSearch(previous => {
    const next = new URLSearchParams(previous); next.set("offset", String(value)); return next;
  });
  const producerOptions = [{ value: "", label: "All root updaters" },
    ...(producers.status === "ready" ? producers.data.results.map(row => ({ value: row.uid, label: row.output_table_identifier || row.update_hash, subtitle: row.update_hash })) : [])];
  if (query.table_update_uid && !producerOptions.some(item => item.value === query.table_update_uid)) {
    producerOptions.push({ value: query.table_update_uid, label: query.table_update_uid });
  }
  return <DetailSection title="Runs" description="Each invocation has its own dependency graph, results and logs."
    actions={<Button onClick={() => setGeneration(value => value + 1)}>Refresh runs</Button>}>
    <div className="runtime-form-actions">
      <Field label="Find a root updater"><Input value={producerSearch} placeholder="Search table name or update hash" onChange={event => setProducerSearch(event.target.value)} /></Field>
      <Field label="Root updater"><Picker ariaLabel="Root updater" value={query.table_update_uid || ""} options={producerOptions} onValueChange={value => change("updater", value)} /></Field>
      <Field label="Outcome"><Picker ariaLabel="Outcome" value={query.outcome || ""}
        options={[{ value: "", label: "All outcomes" }, { value: "succeeded", label: "Succeeded" }, { value: "failed", label: "Failed" }, { value: "unfinished", label: "Unfinished" }]}
        onValueChange={value => change("outcome", value)} /></Field>
      {(["start", "end"] as const).map(key => <Field key={key} label={key === "start" ? "Started from (local time)" : "Started before (local time)"}>
        <Input type="datetime-local" value={dateValue(key)} onChange={event => change(key, event.target.value ? new Date(event.target.value).toISOString() : "")} />
      </Field>)}
    </div>
    <RemoteContent state={remote}>{page => <>
      <DataTable items={page.results} getId={run => run.uid} presentation="auto" emptyContent="No runs match these filters. Older records remain in each updater's Historical Updates tab."
        columns={[
          { id: "updater", header: "Root updater", importance: "primary", renderCell: run => <Link to={`/runs/${encodeURIComponent(run.uid)}`}>{run.updater_label || run.table_update_uid}</Link> },
          { id: "started", header: "Started", importance: "primary", renderCell: run => <Button variant="ghost" onClick={() => navigate(`/runs/${encodeURIComponent(run.uid)}`)}>{formatDate(run.started_at)}</Button> },
          { id: "outcome", header: "Outcome", importance: "secondary", renderCell: run => run.outcome || run.result },
          { id: "ended", header: "Ended", importance: "secondary", renderCell: run => formatDate(run.ended_at) },
          { id: "duration", header: "Duration", importance: "secondary", renderCell: run => run.duration_seconds == null ? "—" : `${run.duration_seconds.toFixed(1)}s` },
          { id: "uid", header: "Run", importance: "tertiary", renderCell: run => run.uid },
        ]} />
      <div className="runtime-form-actions"><Button disabled={offset === 0} onClick={() => selectPage(Math.max(0, offset - 25))}>Previous</Button>
        <span>{page.count} runs</span><Button disabled={!page.next} onClick={() => selectPage(offset + 25)}>Next</Button></div>
    </>}</RemoteContent>
  </DetailSection>;
}

function RunDetails({ uid }: { uid: string }) {
  const [generation, setGeneration] = useState(0);
  const remote = useRemote(`run-graph-${uid}-${generation}`, signal => metaTablesApi.runGraph(uid, signal));
  return <ApplicationPageStack>
    <DetailSection title="Run" description={uid} actions={<><Link to="/runs">All runs</Link><Button onClick={() => setGeneration(value => value + 1)}>Refresh this run</Button></>}>
      <RemoteContent state={remote}>{graph => graph.availability === "available"
        ? <ExecutionGraph graph={graph} />
        : <><StatePanel embedded title="Historical graph unavailable">This record predates graph capture. Its original run logs remain accessible.</StatePanel><LogsTab key={uid} runUid={uid} /></>}
      </RemoteContent>
    </DetailSection>
  </ApplicationPageStack>;
}

function ExecutionGraph({ graph }: { graph: HistoricalRunGraph }) {
  const [search, setSearch] = useSearchParams();
  const selected = search.has("node") ? search.get("node") : graph.selected_node_id || graph.root_id;
  const select = (id: string | null) => setSearch(previous => { const next = new URLSearchParams(previous); next.set("node", id || ""); return next; }, { replace: true });
  return <ApplicationPageStack>
    <Facts items={[{ label: "Root run", value: graph.root_run_uid }, { label: "Outcome", value: graph.outcome },
      { label: "Started", value: formatDate(graph.started_at) }, { label: "Ended", value: formatDate(graph.ended_at) },
      { label: "Total duration", value: graph.duration_seconds == null ? "—" : `${graph.duration_seconds.toFixed(1)}s` },
      ...(graph.job_run_uid ? [{ label: "Main Sequence job run", value: graph.job_run_uid }] : [])]} />
    <Link to={`/runs?updater=${encodeURIComponent(graph.root_update_uid || "")}`}>Other runs of this updater</Link>
    {graph.outcome === "unfinished" && <StatePanel embedded title="Completion not recorded">States show the last reported progress. They do not confirm that the client is still running.</StatePanel>}
    {graph.partial && <StatePanel embedded title="Partial graph">Some nodes are unavailable under your current table access.</StatePanel>}
    <Suspense fallback={<StatePanel embedded title="Loading run graph…" />}>
      <RunGraph graph={graph} historical selectedNodeId={selected} onSelectNode={select} renderNodeDetails={node => node.kind !== "update" ? null
        : node.run_uid ? <LogsTab key={node.run_uid} runUid={node.run_uid} />
          : <StatePanel embedded title="No attempt logs">This node did not start in the selected invocation.</StatePanel>} />
    </Suspense>
  </ApplicationPageStack>;
}
