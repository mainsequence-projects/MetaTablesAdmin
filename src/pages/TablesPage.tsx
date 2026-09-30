import { lazy, Suspense, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourceActionConfirmationDialog, ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { Table2 } from "lucide-react";
import { metaTablesApi, type ResourceAction, type TableDetail, type TableRecord } from "../api";
import { tableDetailTabs } from "../detailTabs";
import { DetailTabIcon } from "../detailTabIcons";
import { JsonTreeViewer, type JsonTreeViewerHandle } from "../JsonTreeViewer";
import { TimeIndexMetaTableIcon } from "../metatablesNavigation";
import { detailPath, resourceLabels, type TableResource } from "../navigation";
import { tablesResource, timeIndexTablesResource } from "../resources";
import { Badge, Button, DetailSection, DetailView, display, Facts, formatDate, LoadingIndicator, RemoteContent, useRemote } from "../ui";
import { UlmDiagramTab } from "./ulm/UlmDiagramTab";
import { PermissionsPanel } from "./PermissionsPanel";
import { PoliciesPanel } from "./PoliciesPanel";

const RunExplorer = lazy(() => import("./RunExplorer").then(module => ({ default: module.RunExplorer })));
const MarkdownDocument = lazy(() => import("../MarkdownDocument").then(module => ({ default: module.MarkdownDocument })));

function kindLabel(table: TableRecord) {
  if (table.kind === "time_index") return "Time-indexed";
  if (table.management_mode === "external_registered") return "External";
  return "Row table";
}

function tableName(table: TableRecord) {
  const name = table.physical_table_name || table.identifier || table.uid;
  const prefix = table.namespace_name ? `${table.namespace_name}__` : null;
  // The summary fields preserve the namespace and full physical binding.
  return prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function TablesPage({ uid, tab, resource = "tables" }: { uid: string | null; tab: string | null; resource?: TableResource }) {
  return uid ? <TableDetailPage key={uid} uid={uid} requestedTab={tab} resource={resource} /> : <TableRegistry resource={resource} />;
}

function TableRegistry({ resource }: { resource: TableResource }) {
  const navigate = useNavigate();
  const timeIndexOnly = resource === "time-index-meta-tables";
  const [kind, setKind] = useState("");
  const [namespaceUid, setNamespaceUid] = useState("");
  const namespaces = useRemote("namespace-options", (signal) => metaTablesApi.listNamespaces({ limit: 200, offset: 0 }, signal));
  return <ResourceListPage
    definition={timeIndexOnly ? timeIndexTablesResource : tablesResource}
    pageSize={25}
    tablePresentation="auto"
    searchable
    refreshable
    searchPlaceholder="Search name, identifier, namespace, or UID"
    filterDefinitions={[
      ...(!timeIndexOnly ? [{ id: "kind", label: "Kind", value: kind, onChange: setKind, options: [
        { label: "All kinds", value: "" },
        { label: "Time-indexed", value: "time_index" },
        { label: "Row", value: "row" },
        { label: "External", value: "external" },
      ] }] : []),
      { id: "namespace_uid", label: "Namespace", value: namespaceUid, onChange: setNamespaceUid, options: [
        { label: "All namespaces", value: "" },
        ...(namespaces.status === "ready" ? namespaces.data.results.map((namespace) => ({ label: namespace.name, value: namespace.uid })) : []),
      ] },
    ]}
    onRowActivate={(table) => navigate(detailPath(resource, table.uid))}
  />;
}

function TableDetailPage({ uid, requestedTab, resource }: { uid: string; requestedTab: string | null; resource: TableResource }) {
  const navigate = useNavigate();
  const remote = useRemote(`${resource}-${uid}`, (signal) => resource === "time-index-meta-tables"
    ? metaTablesApi.timeIndexTable(uid, signal) : metaTablesApi.table(uid, signal));
  const table = remote.status === "ready" ? remote.data : null;
  const { tabs, activeTab } = resolveResourceDetailTabs(tableDetailTabs, { activeTabId: requestedTab, resource: table });
  const tab = activeTab?.id;
  const TableIcon = table?.kind === "time_index" || resource === "time-index-meta-tables" ? TimeIndexMetaTableIcon : Table2;
  return <DetailView state={remote}
    loadingTitle="Loading MetaTable…"
    loadingDescription="Loading the selected table and available sections."
    breadcrumbs={[{ id: resource, label: resourceLabels[resource], onSelect: () => navigate(`/${resource}`) }, { id: uid, label: table ? tableName(table) : "MetaTable" }]}
    renderBreadcrumbLead={({ current }) => current ? <TableIcon size={16} aria-hidden="true" /> : null}
    summary={detail => ({
      entity: { id: detail.uid, type: detail.kind === "time_index" ? "TimeIndexMetaTable" : "MetaTable", title: tableName(detail) },
      badges: [{ key: "kind", label: kindLabel(detail), tone: detail.kind === "time_index" ? "primary" : "secondary" },
        { key: "status", label: display(detail.provisioning_status, "Status unknown"), tone: detail.provisioning_status === "active" ? "success" : "warning" }],
      inline_fields: [{ key: "uid", label: "UID", value: detail.uid, kind: "code" }, { key: "namespace", label: "Namespace", value: display(detail.namespace_name) }, { key: "physical-table", label: "Physical table", value: detail.physical_table_name, kind: "code" }],
      highlight_fields: detail.description ? [{ key: "description", label: "Description", value: detail.description }] : [],
      stats: [], labels: detail.labels,
    })}
    headerActions={table?.actions?.length ? <TableActions uid={uid} actions={table.actions} /> : undefined}
    tabs={tabs} activeTabId={tab} tabsLabel={`${resourceLabels[resource]} sections`}
    renderTabLead={({ tab }) => <DetailTabIcon id={tab.id} />}
    onTabChange={next => navigate(detailPath(resource, uid, next))}>
    {detail => <>
      {tab === "details" && <TableFacts detail={detail} />}
      {tab === "description" && <DescriptionTab uid={uid} />}
      {tab === "ulm-diagram" && <UlmDiagramTab table={detail} />}
      {tab === "stats" && <StatsTab uid={uid} />}
      {tab === "updates" && <TableUpdatesTab uid={uid} />}
      {tab === "policies" && <PoliciesPanel uid={uid} />}
      {tab === "permissions" && <PermissionsPanel embedded resourceUid={uid} requestKey={`table-permissions-${uid}`} load={signal => metaTablesApi.tablePermissions(uid, signal)} save={(value, revision) => metaTablesApi.saveTablePermissions(uid, value, revision)} />}
    </>}
  </DetailView>;
}

function TableActions({ uid, actions }: { uid: string; actions: ResourceAction[] }) {
  const [pending, setPending] = useState<ResourceAction | null>(null);
  const [summary, setSummary] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function preflight(action: ResourceAction) {
    setWorking(true); setError(null); setMessage(null);
    try { const result = await metaTablesApi.preflightTableAction(uid, action.id); setSummary(result.summary); setPending(action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action preflight failed."); }
    finally { setWorking(false); }
  }
  async function execute() {
    if (!pending) return;
    setWorking(true); setError(null);
    try { const result = await metaTablesApi.executeTableAction(uid, pending.id); setMessage(result.message || `${pending.label} completed.`); setPending(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setWorking(false); }
  }
  return <>{actions.filter((action) => action.enabled !== false).map((action) => <Button key={action.id} type="button" variant="secondary" disabled={working} onClick={() => void preflight(action)}>{action.label}</Button>)}
    {message && <span role="status"><Badge tone="success">{message}</Badge></span>}{error && <span role="alert"><Badge tone="danger">{error}</Badge></span>}
    {pending && <ResourceActionConfirmationDialog actionLabel={pending.label} title={pending.label} description={summary || pending.confirmation || "Review this action before continuing."} warning={pending.destructive ? "This action may change or delete data. Confirm the impact reported by the MetaTables API." : undefined} tone={pending.destructive ? "danger" : "default"} confirmationValue="" onConfirmationValueChange={() => {}} confirmButtonLabel={`Confirm ${pending.label}`} pending={working} presentation="auto" onClose={() => setPending(null)} onConfirm={execute} />}
  </>;
}

function TableFacts({ detail }: { detail: TableDetail }) {
  return <ApplicationPageStack>
    <DetailSection title="Overview" description="Registered identity, physical binding, and contract metadata."><Facts items={[
      { label: "Identifier", value: display(detail.identifier) },
      { label: "Namespace", value: display(detail.namespace_name) },
      { label: "Data source", value: display(detail.data_source_name ?? detail.data_source_uid) },
      { label: "Engine", value: display(detail.engine) },
      { label: "Management", value: display(detail.management_mode) },
      { label: "Contract version", value: display(detail.contract_version) },
      { label: "Protected from deletion", value: display(detail.protect_from_deletion) },
      { label: "Cadence", value: display(detail.cadence) },
    ]} /></DetailSection>
    <DetailSection title={`Columns (${detail.columns?.length ?? 0})`}><DataTable items={detail.columns ?? []} getId={(column) => column.name} presentation="auto" emptyContent="No column metadata returned." columns={[{ id: "ordinal", header: "#", renderCell: (column) => column.ordinal ?? (detail.columns ?? []).indexOf(column) + 1 }, { id: "name", header: "Column", renderCell: (column) => <strong>{column.name}</strong> }, { id: "label", header: "Label", renderCell: (column) => display(column.label) }, { id: "type", header: "Type", renderCell: (column) => <>{display(column.data_type)}<small>{display(column.backend_type, "")}</small></> }, { id: "flags", header: "Flags", renderCell: (column) => <div className="chip-row">{column.primary_key && <Badge>PK</Badge>}{column.unique && <Badge>Unique</Badge>}{column.nullable ? <Badge>Nullable</Badge> : <Badge>Required</Badge>}</div> }, { id: "description", header: "Description", renderCell: (column) => display(column.description) }]} /></DetailSection>
    <DetailSection title={`Indexes (${detail.indexes?.length ?? 0})`}><DataTable items={detail.indexes ?? []} getId={(index) => index.name} presentation="auto" emptyContent="No indexes returned." columns={[{ id: "name", header: "Name", renderCell: (index) => index.name }, { id: "columns", header: "Columns", renderCell: (index) => display(index.columns?.join(", ")) }, { id: "unique", header: "Unique", renderCell: (index) => display(index.unique) }, { id: "method", header: "Method", renderCell: (index) => display(index.method) }, { id: "expression", header: "Expression", renderCell: (index) => display(index.expression) }]} /></DetailSection>
    <ForeignKeys title="Foreign keys" rows={detail.foreign_keys ?? []} /><ForeignKeys title="Incoming references" rows={detail.incoming_foreign_keys ?? []} />
  </ApplicationPageStack>;
}

function ForeignKeys({ title, rows }: { title: string; rows: NonNullable<TableDetail["foreign_keys"]> }) {
  return <DetailSection title={`${title} (${rows.length})`}><DataTable items={rows} getId={(row) => row.name} presentation="auto" emptyContent="No relationships returned." columns={[{ id: "name", header: "Name", renderCell: (row) => row.name }, { id: "source", header: "Source columns", renderCell: (row) => display(row.source_columns?.join(", ")) }, { id: "target", header: "Target table", renderCell: (row) => row.target_table_uid ? <Link to={detailPath("tables", row.target_table_uid)}>{row.target_table_uid}</Link> : "Not set" }, { id: "target_columns", header: "Target columns", renderCell: (row) => display(row.target_columns?.join(", ")) }, { id: "on_delete", header: "On delete", renderCell: (row) => display(row.on_delete) }]} /></DetailSection>;
}

function DescriptionTab({ uid }: { uid: string }) {
  const remote = useRemote(`table-description-${uid}`, (signal) => metaTablesApi.tableDescription(uid, signal));
  return <DetailSection title="Generated description" description="Search document derived from the registered table contract."><RemoteContent state={remote}>{(value) => <Suspense fallback={<LoadingIndicator label="Loading description…" />}><MarkdownDocument content={value.content || "No description generated."} /></Suspense>}</RemoteContent></DetailSection>;
}

function StatsTab({ uid }: { uid: string }) {
  const [refresh, setRefresh] = useState(0);
  const viewerRef = useRef<JsonTreeViewerHandle>(null);
  const remote = useRemote(`table-stats-${uid}-${refresh}`, (signal) => metaTablesApi.tableStats(uid, signal));
  return <DetailSection title="Time-index statistics" description="Explore multi-index and column statistics. These calculated values are read-only." actions={<>
    <Button size="small" disabled={remote.status !== "ready"} onClick={() => viewerRef.current?.collapseAll()}>Collapse all</Button>
    <Button size="small" disabled={remote.status !== "ready"} onClick={() => viewerRef.current?.expandAll()}>Expand all</Button>
    <Button size="small" pending={remote.status === "loading"} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
  </>}><RemoteContent state={remote}>{data => <JsonTreeViewer ref={viewerRef} ariaLabel="Time-index statistics JSON" defaultExpandedDepth={2} value={data} />}</RemoteContent></DetailSection>;
}

function TableUpdatesTab({ uid }: { uid: string }) {
  return <Suspense fallback={<LoadingIndicator label="Loading run history…" />}><RunExplorer key={uid} tableUid={uid} /></Suspense>;
}
