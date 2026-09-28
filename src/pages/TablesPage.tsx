import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable, ResourceActionConfirmationDialog, ResourceListPage, ResourcePicker, ResourceSelectionCheckbox } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type ResourceAction, type TableDetail, type TableRecord } from "../api";
import { detailPath } from "../navigation";
import { tablesResource } from "../resources";
import { Badge, Button, Card, display, Facts, formatDate, JsonBlock, PageHeading, Pagination, RemoteContent, Tabs, useRemote } from "../ui";
import { GraphPanel } from "./GraphPanel";
import { PermissionsPanel } from "./PermissionsPanel";
import { PoliciesPanel } from "./PoliciesPanel";

const tableTabs = [
  { id: "details", label: "Details" },
  { id: "stats", label: "Stats" },
  { id: "description", label: "Description" },
  { id: "data-snapshot", label: "Data Snapshot" },
  { id: "ulm-diagram", label: "ULM diagram" },
  { id: "updates", label: "Updates" },
  { id: "policies", label: "TimeScale Policies" },
  { id: "permissions", label: "Permissions" },
];

function kindLabel(table: TableRecord) {
  if (table.kind === "time_index") return "Time-indexed";
  if (table.management_mode === "external_registered") return "External";
  return "Row table";
}

function tableName(table: TableRecord) {
  return table.physical_table_name || table.identifier || table.uid;
}

export function TablesPage({ uid, tab }: { uid: string | null; tab: string | null }) {
  return uid ? <TableDetailPage uid={uid} requestedTab={tab} /> : <TableRegistry />;
}

function TableRegistry() {
  const navigate = useNavigate();
  const [kind, setKind] = useState("");
  const [namespaceUid, setNamespaceUid] = useState("");
  const namespaces = useRemote("namespace-options", (signal) => metaTablesApi.listNamespaces({ limit: 200, offset: 0 }, signal));
  return <ResourceListPage
    definition={tablesResource}
    pageSize={25}
    tablePresentation="auto"
    searchable
    refreshable
    searchPlaceholder="Search name, identifier, namespace, or UID"
    filterDefinitions={[
      { id: "kind", label: "Kind", value: kind, onChange: setKind, options: [
        { label: "All kinds", value: "" },
        { label: "Time-indexed", value: "time_index" },
        { label: "Row", value: "row" },
        { label: "External", value: "external" },
      ] },
      { id: "namespace_uid", label: "Namespace", value: namespaceUid, onChange: setNamespaceUid, options: [
        { label: "All namespaces", value: "" },
        ...(namespaces.status === "ready" ? namespaces.data.results.map((namespace) => ({ label: namespace.name, value: namespace.uid })) : []),
      ] },
    ]}
    onRowActivate={(table) => navigate(detailPath("tables", table.uid))}
  />;
}

function TableDetailPage({ uid, requestedTab }: { uid: string; requestedTab: string | null }) {
  const navigate = useNavigate();
  const remote = useRemote(`table-${uid}`, (signal) => metaTablesApi.table(uid, signal));
  const table = remote.status === "ready" ? remote.data : null;
  const availableTabs = tableTabs.filter((item) => {
    if (item.id === "stats" || item.id === "updates") return table?.kind === "time_index";
    if (item.id === "policies") return table?.kind === "time_index" && table.capabilities?.timescale_policies === true;
    return true;
  });
  const tab = availableTabs.some((item) => item.id === requestedTab) ? requestedTab! : "details";
  return <>
    <Link to="/tables">← Back to tables</Link>
    <PageHeading eyebrow="Table detail" title={table ? tableName(table) : `Table ${uid}`} description={table?.description || "Registered MetaTable contract and operations."} actions={table && <div className="heading-actions"><Badge tone={table.kind === "time_index" ? "accent" : "neutral"}>{kindLabel(table)}</Badge><Badge tone={table.provisioning_status === "active" ? "success" : "warning"}>{display(table.provisioning_status, "Status unknown")}</Badge></div>} />
    <RemoteContent state={remote}>{(detail) => <>
      <div className="detail-identity"><span className="mono">UID {detail.uid}</span><span>{display(detail.physical_schema, "Default schema")}.{detail.physical_table_name}</span><span>{display(detail.namespace_name, "No namespace")}</span></div>
      {detail.actions && detail.actions.length > 0 && <TableActions uid={uid} actions={detail.actions} />}
      <Tabs items={availableTabs} active={tab} onChange={(next) => navigate(detailPath("tables", uid, next))}>
        {tab === "details" && <TableFacts detail={detail} />}
        {tab === "description" && <DescriptionTab uid={uid} />}
        {tab === "data-snapshot" && <SnapshotTab uid={uid} />}
        {tab === "ulm-diagram" && <SchemaGraphTab uid={uid} />}
        {tab === "stats" && <StatsTab uid={uid} />}
        {tab === "updates" && <TableUpdatesTab uid={uid} />}
        {tab === "policies" && <PoliciesPanel uid={uid} />}
        {tab === "permissions" && <PermissionsPanel requestKey={`table-permissions-${uid}`} load={(signal) => metaTablesApi.tablePermissions(uid, signal)} save={(value) => metaTablesApi.saveTablePermissions(uid, value)} />}
      </Tabs>
    </>}</RemoteContent>
  </>;
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
  return <div className="action-strip"><span>Available actions</span>{actions.filter((action) => action.enabled !== false).map((action) => <Button key={action.id} type="button" variant="secondary" disabled={working} onClick={() => void preflight(action)}>{action.label}</Button>)}
    {message && <span role="status"><Badge tone="success">{message}</Badge></span>}{error && <span role="alert"><Badge tone="danger">{error}</Badge></span>}
    {pending && <ResourceActionConfirmationDialog actionLabel={pending.label} title={pending.label} description={summary || pending.confirmation || "Review this action before continuing."} warning={pending.destructive ? "This action may change or delete data. Confirm the impact reported by the MetaTables API." : undefined} tone={pending.destructive ? "danger" : "default"} confirmationValue="" onConfirmationValueChange={() => {}} confirmButtonLabel={`Confirm ${pending.label}`} pending={working} presentation="auto" onClose={() => setPending(null)} onConfirm={execute} />}
  </div>;
}

function TableFacts({ detail }: { detail: TableDetail }) {
  return <div className="content-stack">
    <Card title="Overview" description="Registered identity, physical binding, and contract metadata."><Facts items={[
      { label: "Identifier", value: display(detail.identifier) },
      { label: "Namespace", value: display(detail.namespace_name) },
      { label: "Data source", value: display(detail.data_source_name ?? detail.data_source_uid) },
      { label: "Engine", value: display(detail.engine) },
      { label: "Management", value: display(detail.management_mode) },
      { label: "Contract version", value: display(detail.contract_version) },
      { label: "Protected from deletion", value: display(detail.protect_from_deletion) },
      { label: "Cadence", value: display(detail.cadence) },
    ]} /></Card>
    {detail.labels && detail.labels.length > 0 && <Card title="Labels"><div className="chip-row">{detail.labels.map((label) => <Badge key={label} tone="accent">{label}</Badge>)}</div></Card>}
    <Card title={`Columns (${detail.columns?.length ?? 0})`}><DataTable items={detail.columns ?? []} getId={(column) => column.name} presentation="auto" emptyContent="No column metadata returned." columns={[{ id: "ordinal", header: "#", renderCell: (column) => column.ordinal ?? (detail.columns ?? []).indexOf(column) + 1 }, { id: "name", header: "Column", renderCell: (column) => <strong>{column.name}</strong> }, { id: "label", header: "Label", renderCell: (column) => display(column.label) }, { id: "type", header: "Type", renderCell: (column) => <>{display(column.data_type)}<small>{display(column.backend_type, "")}</small></> }, { id: "flags", header: "Flags", renderCell: (column) => <div className="chip-row">{column.primary_key && <Badge>PK</Badge>}{column.unique && <Badge>Unique</Badge>}{column.nullable ? <Badge>Nullable</Badge> : <Badge>Required</Badge>}</div> }, { id: "description", header: "Description", renderCell: (column) => display(column.description) }]} /></Card>
    <Card title={`Indexes (${detail.indexes?.length ?? 0})`}><DataTable items={detail.indexes ?? []} getId={(index) => index.name} presentation="auto" emptyContent="No indexes returned." columns={[{ id: "name", header: "Name", renderCell: (index) => index.name }, { id: "columns", header: "Columns", renderCell: (index) => display(index.columns?.join(", ")) }, { id: "unique", header: "Unique", renderCell: (index) => display(index.unique) }, { id: "method", header: "Method", renderCell: (index) => display(index.method) }, { id: "expression", header: "Expression", renderCell: (index) => display(index.expression) }]} /></Card>
    <ForeignKeys title="Foreign keys" rows={detail.foreign_keys ?? []} /><ForeignKeys title="Incoming references" rows={detail.incoming_foreign_keys ?? []} />
  </div>;
}

function ForeignKeys({ title, rows }: { title: string; rows: NonNullable<TableDetail["foreign_keys"]> }) {
  return <Card title={`${title} (${rows.length})`}><DataTable items={rows} getId={(row) => row.name} presentation="auto" emptyContent="No relationships returned." columns={[{ id: "name", header: "Name", renderCell: (row) => row.name }, { id: "source", header: "Source columns", renderCell: (row) => display(row.source_columns?.join(", ")) }, { id: "target", header: "Target table", renderCell: (row) => row.target_table_uid ? <Link to={detailPath("tables", row.target_table_uid)}>{row.target_table_uid}</Link> : "Not set" }, { id: "target_columns", header: "Target columns", renderCell: (row) => display(row.target_columns?.join(", ")) }, { id: "on_delete", header: "On delete", renderCell: (row) => display(row.on_delete) }]} /></Card>;
}

function DescriptionTab({ uid }: { uid: string }) {
  const remote = useRemote(`table-description-${uid}`, (signal) => metaTablesApi.tableDescription(uid, signal));
  return <Card title="Generated description" description="Search document derived from the registered table contract."><RemoteContent state={remote}>{(value) => <div className="document-body">{value.content || "No description generated."}</div>}</RemoteContent></Card>;
}

function SnapshotTab({ uid }: { uid: string }) {
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const remote = useRemote(`table-snapshot-${uid}-${offset}`, (signal) => metaTablesApi.tableSnapshot(uid, offset, signal));
  return <Card title="Data Snapshot" description="A bounded, permission-checked preview of physical rows."><RemoteContent state={remote}>{(data) => {
    const columns = data.columns ?? [];
    const rows = data.rows.filter((row) => !filter || JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()));
    return <><div className="toolbar"><Field label="Filter loaded rows"><Input placeholder="Filter loaded rows" value={filter} onChange={(event) => setFilter(event.target.value)} /></Field><span className="muted">{data.rows.length} rows loaded</span></div><DataTable items={rows.map((row, index) => ({ row, index }))} getId={(item) => item.index} presentation="auto" emptyContent="No matching rows in this page." columns={columns.map((column) => ({ id: column, header: column, renderCell: (item: { row: Record<string, unknown>; index: number }) => display(item.row[column], "null") }))} /><Pagination count={data.count ?? data.rows.length + offset} offset={offset} limit={50} onChange={setOffset} noun="rows" /></>;
  }}</RemoteContent></Card>;
}

function SchemaGraphTab({ uid }: { uid: string }) {
  const [depth, setDepth] = useState(2);
  const [incoming, setIncoming] = useState(false);
  return <div className="content-stack"><div className="toolbar"><Field label="Depth"><ResourcePicker ariaLabel="Graph depth" value={String(depth)} options={[1, 2, 3].map((value) => ({ value: String(value), label: String(value) }))} onValueChange={(value) => setDepth(Number(value))} /></Field><ResourceSelectionCheckbox label="Include incoming references" checked={incoming} onChange={() => setIncoming((value) => !value)} /></div><GraphPanel requestKey={`table-graph-${uid}-${depth}-${incoming}`} load={(signal) => metaTablesApi.tableGraph(uid, depth, incoming, signal)} description="Foreign-key links within the selected traversal depth." /></div>;
}

function StatsTab({ uid }: { uid: string }) {
  const [refresh, setRefresh] = useState(0);
  const remote = useRemote(`table-stats-${uid}-${refresh}`, (signal) => metaTablesApi.tableStats(uid, signal));
  return <Card title="Time-index statistics" description="Multi-index and column statistics returned by MetaTables." actions={<Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>Refresh</Button>}><RemoteContent state={remote}>{(data) => <JsonBlock value={data} />}</RemoteContent></Card>;
}

function TableUpdatesTab({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const remote = useRemote(`table-updates-${uid}-${offset}`, (signal) => metaTablesApi.tableUpdates(uid, offset, signal));
  return <Card title="Data Updates" description="Processes that write to this time-indexed table."><RemoteContent state={remote} empty={(data) => data.count === 0}>{(data) => <><DataTable items={data.results} getId={(update) => update.uid} presentation="auto" onActivateRow={(update) => navigate(detailPath("data-updates", update.uid))} columns={[{ id: "process", header: "Process", renderCell: (update) => <><strong>{update.update_hash}</strong><small className="mono">UID {update.uid}</small></> }, { id: "status", header: "Status", renderCell: (update) => <Badge tone={update.status === "S" ? "success" : update.status === "E" ? "danger" : "neutral"}>{display(update.status)}</Badge> }, { id: "last_update", header: "Last update", renderCell: (update) => formatDate(update.last_update) }]} /><Pagination count={data.count} offset={offset} limit={25} onChange={setOffset} noun="updates" /></>}</RemoteContent></Card>;
}
