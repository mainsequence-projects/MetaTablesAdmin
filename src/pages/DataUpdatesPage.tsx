import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable, ResourceListPage, ResourcePicker } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type DataUpdateDetail } from "../api";
import { detailPath } from "../navigation";
import { updatesResource } from "../resources";
import { Badge, Card, display, Facts, formatDate, JsonBlock, PageHeading, Pagination, RemoteContent, Tabs, useDebounced, useRemote } from "../ui";
import { GraphPanel } from "./GraphPanel";

const detailTabs = [
  { id: "details", label: "Details" },
  { id: "graphs", label: "Dependencies Graphs" },
  { id: "historical-updates", label: "Historical Updates" },
  { id: "logs", label: "Logs" },
];

function statusTone(status?: string | null): "success" | "danger" | "accent" | "neutral" {
  return status === "S" ? "success" : status === "E" ? "danger" : status === "U" ? "accent" : "neutral";
}

export function DataUpdatesPage({ uid, tab }: { uid: string | null; tab: string | null }) {
  return uid ? <DataUpdateDetailPage uid={uid} requestedTab={tab} /> : <DataUpdateRegistry />;
}

function DataUpdateRegistry() {
  const navigate = useNavigate();
  return <ResourceListPage
    definition={updatesResource}
    pageSize={25}
    tablePresentation="auto"
    searchable
    refreshable
    searchPlaceholder="Search hash, source code, or output table"
    onRowActivate={(update) => navigate(detailPath("data-updates", update.uid))}
  />;
}

function DataUpdateDetailPage({ uid, requestedTab }: { uid: string; requestedTab: string | null }) {
  const navigate = useNavigate();
  const remote = useRemote(`update-${uid}`, (signal) => metaTablesApi.update(uid, signal));
  const update = remote.status === "ready" ? remote.data : null;
  const tab = detailTabs.some((item) => item.id === requestedTab) ? requestedTab! : "details";
  return <>
    <Link to="/data-updates">← Back to data updates</Link>
    <PageHeading eyebrow="Update process" title={update?.update_hash || `Update ${uid}`} description="Execution state, dependencies, history, and logs." actions={update && <Badge tone={statusTone(update.status)}>{display(update.status, "Status unknown")}</Badge>} />
    <RemoteContent state={remote}>{(detail) => <>
      <div className="detail-identity"><span className="mono">UID {detail.uid}</span>{detail.output_table_uid && <Link to={detailPath("tables", detail.output_table_uid)}>Open output table ↗</Link>}</div>
      <Tabs items={detailTabs} active={tab} onChange={(next) => navigate(detailPath("data-updates", uid, next))}>
        {tab === "details" && <UpdateFacts detail={detail} />}
        {tab === "graphs" && <UpdateGraph uid={uid} />}
        {tab === "historical-updates" && <RunsTab uid={uid} />}
        {tab === "logs" && <LogsTab uid={uid} />}
      </Tabs>
    </>}</RemoteContent>
  </>;
}

function UpdateFacts({ detail }: { detail: DataUpdateDetail }) {
  return <div className="content-stack"><Card title="Update details" description="Read-only configuration and current process state."><Facts items={[
    { label: "Update hash", value: detail.update_hash },
    { label: "Output table", value: detail.output_table_uid ? <Link to={detailPath("tables", detail.output_table_uid)}>{display(detail.output_table_identifier ?? detail.output_table_uid)}</Link> : "Not set" },
    { label: "Dependencies linked", value: display(detail.dependency_links_complete) },
    { label: "Active update", value: display(detail.active_update) },
    { label: "Status", value: display(detail.status) },
    { label: "Last update error", value: display(detail.error_on_last_update) },
    { label: "Process ID", value: display(detail.process_id) },
    { label: "Priority", value: display(detail.priority) },
    { label: "Scheduler", value: display(detail.scheduler) },
    { label: "Last update", value: formatDate(detail.last_update) },
    { label: "Next update", value: formatDate(detail.next_update) },
    { label: "Last actor", value: display(detail.last_actor_uid) },
    { label: "Source code hash", value: display(detail.source_code_hash) },
  ]} /></Card>{detail.configuration && <Card title="Configuration" description="Server-safe process configuration."><JsonBlock value={detail.configuration} /></Card>}</div>;
}

function UpdateGraph({ uid }: { uid: string }) {
  const [direction, setDirection] = useState("both");
  return <div className="content-stack"><Field label="Dependency direction"><ResourcePicker ariaLabel="Dependency direction" value={direction} options={[{ value: "inputs", label: "Inputs" }, { value: "both", label: "Both" }, { value: "consumers", label: "Consumers" }]} onValueChange={setDirection} /></Field><GraphPanel requestKey={`update-graph-${uid}-${direction}`} load={(signal) => metaTablesApi.updateGraph(uid, direction, signal)} description="Inputs, consumers, and table reads or writes for this process." /></div>;
}

function RunsTab({ uid }: { uid: string }) {
  const [offset, setOffset] = useState(0);
  const remote = useRemote(`update-runs-${uid}-${offset}`, (signal) => metaTablesApi.updateRuns(uid, offset, signal));
  return <Card title="Historical Updates" description="Completed and failed executions, newest first."><RemoteContent state={remote} empty={(data) => data.count === 0}>{(data) => {
    const complete = data.results.filter((run) => run.result?.toLowerCase() === "success").length;
    const failures = data.results.filter((run) => run.result?.toLowerCase() === "error").length;
    const durations = data.results.map((run) => run.duration_seconds ?? 0).filter((value) => value > 0);
    const average = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const max = Math.max(...durations, 1);
    return <><div className="metric-row"><div><strong>{complete}</strong><span>Completed on this page</span></div><div><strong>{failures}</strong><span>Errors on this page</span></div><div><strong>{average}s</strong><span>Average duration on this page</span></div></div><div className="duration-chart" aria-label="Run duration chart">{data.results.slice(0, 20).reverse().map((run) => <div key={run.uid} title={`${formatDate(run.started_at)} · ${display(run.duration_seconds, "0")}s`} style={{ height: `${Math.max(8, ((run.duration_seconds ?? 0) / max) * 100)}%` }} />)}</div><DataTable items={data.results} getId={(run) => run.uid} presentation="auto" columns={[{ id: "started", header: "Started", renderCell: (run) => formatDate(run.started_at) }, { id: "ended", header: "Ended", renderCell: (run) => formatDate(run.ended_at) }, { id: "duration", header: "Duration", renderCell: (run) => run.duration_seconds == null ? "Not available" : `${run.duration_seconds.toFixed(1)}s` }, { id: "result", header: "Result", renderCell: (run) => <Badge tone={run.result?.toLowerCase() === "success" ? "success" : run.result?.toLowerCase() === "error" ? "danger" : "neutral"}>{display(run.result)}</Badge> }, { id: "trace", header: "Trace", renderCell: (run) => <span className="mono">{display(run.trace_id)}</span> }, { id: "actor", header: "Actor", renderCell: (run) => display(run.actor_uid) }]} /><Pagination count={data.count} offset={offset} limit={25} onChange={setOffset} noun="runs" /></>;
  }}</RemoteContent></Card>;
}

function LogsTab({ uid }: { uid: string }) {
  const [level, setLevel] = useState("");
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(filter);
  const remote = useRemote(`update-logs-${uid}-${level}-${term}-${offset}`, (signal) => metaTablesApi.updateLogs(uid, { level, search: term, offset }, signal));
  return <Card title="Update logs" description="Resource-scoped, bounded log entries from the MetaTables API."><div className="toolbar"><Field label="Search logs"><Input value={filter} placeholder="Filter logs" onChange={(event) => { setFilter(event.target.value); setOffset(0); }} /></Field><Field label="Log level"><ResourcePicker ariaLabel="Log level" value={level} options={[{ value: "", label: "All" }, { value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "error", label: "Error" }, { value: "debug", label: "Debug" }]} onValueChange={(value) => { setLevel(value); setOffset(0); }} /></Field></div><RemoteContent state={remote} empty={(data) => data.count === 0}>{(data) => <><div className="log-list">{data.results.map((log, i) => <article className="log-entry" key={log.uid ?? `${log.timestamp}-${i}`}><div><Badge tone={log.level?.toLowerCase() === "error" ? "danger" : log.level?.toLowerCase() === "warning" ? "warning" : "neutral"}>{display(log.level, "Info")}</Badge><span>{formatDate(log.timestamp)}</span><span>{display(log.source, "")}</span></div><p>{display(log.message, "Log entry")}</p>{log.context && <details><summary>Context</summary><JsonBlock value={log.context} /></details>}</article>)}</div><Pagination count={data.count} offset={offset} limit={50} onChange={setOffset} noun="logs" /></>}</RemoteContent></Card>;
}
