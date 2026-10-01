import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { RefreshCw } from "lucide-react";
import { metaTablesApi, type DataUpdateDetail } from "../api";
import { updateDetailTabs } from "../detailTabs";
import { DetailTabIcon } from "../detailTabIcons";
import { detailPath } from "../navigation";
import { updatesResource } from "../resources";
import { Button, DetailSection, DetailView, display, Facts, formatDate, JsonBlock, StatePanel, useRemote } from "../ui";


const RunExplorer = lazy(() => import("./RunExplorer").then(module => ({ default: module.RunExplorer })));
const UpdatePipelinePanel = lazy(() => import("./UpdatePipelinePanel").then(module => ({ default: module.UpdatePipelinePanel })));

function statusTone(status?: string | null): "success" | "danger" | "accent" | "neutral" {
  return status === "S" ? "success" : status === "E" ? "danger" : status === "U" ? "accent" : "neutral";
}

export function DataUpdatesPage({ uid, tab }: { uid: string | null; tab: string | null }) {
  return uid ? <DataUpdateDetailPage key={uid} uid={uid} requestedTab={tab} /> : <DataUpdateRegistry />;
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
  const { tabs, activeTab } = resolveResourceDetailTabs(updateDetailTabs, { activeTabId: requestedTab, resource: update });
  const tab = activeTab?.id;
  return <DetailView state={remote} onSummaryLinkSelect={navigate}
    loadingTitle="Loading Time Index Table Update…"
    loadingDescription="Loading the selected update and its sections."
    breadcrumbs={[{ id: "updates", label: "Time Index Table Updates", onSelect: () => navigate("/data-updates") }, { id: uid, label: update?.update_hash ?? "Update" }]}
    renderBreadcrumbLead={({ current }) => current ? <RefreshCw size={16} aria-hidden="true" /> : null}
    summary={detail => ({
      entity: { id: detail.uid, type: "TimeIndexTableUpdate", title: detail.update_hash || `Update ${uid}` },
      badges: [{ key: "status", label: display(detail.status, "Status unknown"), tone: statusTone(detail.status) === "accent" ? "primary" : statusTone(detail.status) }],
      inline_fields: [{ key: "uid", label: "UID", value: detail.uid }],
      highlight_fields: detail.output_table_uid ? [{ key: "output", label: "Output table", value: detail.output_table_identifier ?? detail.output_table_uid, link_url: detailPath("time-index-meta-tables", detail.output_table_uid) }] : [],
      stats: [],
    })}
    tabs={tabs} activeTabId={tab} tabsLabel="Time Index Table Update sections"
    renderTabLead={({ tab }) => <DetailTabIcon id={tab.id} />}
    onTabChange={next => navigate(detailPath("data-updates", uid, next))}>
    {detail => <>
      {tab === "details" && <UpdateFacts detail={detail} />}
      {tab === "graphs" && (detail.output_table_uid
        ? <Suspense fallback={<DetailSection title="Update pipeline">Loading pipeline visualization…</DetailSection>}>
          <UpdatePipelinePanel uid={detail.output_table_uid} updateUid={uid} />
        </Suspense>
        : <StatePanel embedded title="Output table unavailable" tone="danger">The API did not provide this update’s output table, so its pipeline cannot be loaded.</StatePanel>)}
      {tab === "historical-updates" && <RunsTab uid={uid} />}
      {tab === "logs" && <LogsTab uid={uid} />}
    </>}
  </DetailView>;
}

function UpdateFacts({ detail }: { detail: DataUpdateDetail }) {
  return <ApplicationPageStack><DetailSection title="Update details" description="Read-only configuration and current process state."><Facts items={[
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
  ]} /></DetailSection>{detail.configuration && <DetailSection title="Configuration" description="Server-safe process configuration."><JsonBlock value={detail.configuration} /></DetailSection>}</ApplicationPageStack>;
}

function RunsTab({ uid }: { uid: string }) {
  return <Suspense fallback={<StatePanel embedded title="Loading run history…" />}><RunExplorer key={uid} updateUid={uid} /></Suspense>;
}

export function LogsTab({ uid }: { uid: string }) {
  const [level, setLevel] = useState("");
  const [event, setEvent] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [generation, setGeneration] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const query = { level: level || undefined, event: event || undefined, cursor, limit: 50 };
  const remote = useRemote(JSON.stringify(["logs", uid, level, event, cursor, generation]),
    signal => metaTablesApi.updateLogs(uid, query, signal));
  const reset = () => { setCursors([undefined]); setGeneration(value => value + 1); };
  const page = remote.status === "ready" ? remote.data : null;
  return <DetailSection title="Run logs" description="Recent runs in the last seven days. Refresh to include newly written events."
    actions={<Button onClick={reset}>Refresh</Button>}>
    <div className="runtime-form-actions" role="group" aria-label="Log level">
      {["", "debug", "info", "warning", "error", "critical"].map(value => <Button key={value}
        variant={value === level ? "primary" : "secondary"} aria-pressed={value === level}
        onClick={() => { setLevel(value); setCursors([undefined]); }}>{value || "All levels"}</Button>)}
    </div>
    <Field label="Exact event"><Input value={event} placeholder="For example, metatables.update.completed"
      onChange={change => { setEvent(change.target.value); setCursors([undefined]); }} /></Field>
    {remote.status === "loading" && <StatePanel embedded title="Loading logs…" />}
    {remote.status === "error" && <StatePanel embedded tone="danger" title="Could not read logs" action={<Button onClick={reset}>Refresh</Button>}>{remote.error.message}</StatePanel>}
    {page && <>
      {page.availability !== "available" && <StatePanel embedded tone="warning" title={`Log availability: ${page.availability}`}>
        Some runs have no readable capture, have expired files, or their log store is unavailable.
      </StatePanel>}
      {page.truncated && <StatePanel embedded tone="warning" title="Read limit reached">Only a bounded portion of the logs is shown. Select a level or exact event to narrow the results.</StatePanel>}
      <DataTable items={page.rows} getId={log => `${log.run_uid}:${log.uid}`} presentation="auto"
        emptyContent="No matching log records in this page." columns={[
          { id: "message", header: "Message", importance: "primary", renderCell: log => display(log.message) },
          { id: "level", header: "Level", importance: "secondary", renderCell: log => display(log.level) },
          { id: "time", header: "Time", importance: "secondary", renderCell: log => formatDate(log.timestamp) },
          { id: "run", header: "Run", importance: "tertiary", renderCell: log => display(log.run_uid) },
          { id: "context", header: "Context", importance: "tertiary", renderCell: log => <details><summary>Context</summary><JsonBlock value={log.context} /></details> },
        ]} />
      <div className="runtime-form-actions">
        <Button variant="secondary" disabled={cursors.length === 1} onClick={() => setCursors(values => values.slice(0, -1))}>Previous</Button>
        <Button variant="secondary" disabled={!page.next_cursor} onClick={() => setCursors(values => [...values, page.next_cursor!])}>Next</Button>
      </div>
    </>}
  </DetailSection>;
}
