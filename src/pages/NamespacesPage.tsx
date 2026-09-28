import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable, ResourceListPage, ResourcePicker } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi } from "../api";
import { detailPath } from "../navigation";
import { namespacesResource } from "../resources";
import { Badge, Card, display, Facts, formatDate, PageHeading, Pagination, RemoteContent, StatePanel, Tabs, useDebounced, useRemote } from "../ui";
import { PermissionsPanel } from "./PermissionsPanel";

const pageSize = 25;
const detailTabs = [{ id: "overview", label: "Overview" }, { id: "tables", label: "Tables" }, { id: "permissions", label: "Permissions" }];

export function NamespacesPage({ uid, tab }: { uid: string | null; tab: string | null }) {
  return uid ? <NamespaceDetail uid={uid} requestedTab={tab} /> : <NamespaceRegistry />;
}

function NamespaceRegistry() {
  const navigate = useNavigate();
  return <ResourceListPage
    definition={namespacesResource}
    pageSize={25}
    tablePresentation="auto"
    searchable
    refreshable
    searchPlaceholder="Search namespace name or UID"
    onRowActivate={(namespace) => navigate(detailPath("namespaces", namespace.uid))}
  />;
}

function NamespaceDetail({ uid, requestedTab }: { uid: string; requestedTab: string | null }) {
  const navigate = useNavigate();
  const remote = useRemote(`namespace-${uid}`, (signal) => metaTablesApi.namespace(uid, signal));
  const namespace = remote.status === "ready" ? remote.data : null;
  const tab = detailTabs.some((item) => item.id === requestedTab) ? requestedTab! : "overview";
  return <>
    <Link to="/namespaces">← Back to namespaces</Link>
    <PageHeading eyebrow="Namespace detail" title={namespace?.name ?? `Namespace ${uid}`} description={namespace?.description ?? "Tables and permissions registered under this namespace."} actions={namespace && <Badge tone={namespace.visibility === "public" ? "success" : "neutral"}>{display(namespace.visibility, "Visibility unknown")}</Badge>} />
    <RemoteContent state={remote}>{(detail) => <><div className="detail-identity"><span className="mono">UID {detail.uid}</span><span>{(detail.relational_table_count ?? 0) + (detail.time_index_table_count ?? 0)} registered tables</span></div><Tabs items={detailTabs} active={tab} onChange={(next) => navigate(detailPath("namespaces", uid, next))}>
      {tab === "overview" && <Card title="Overview"><Facts items={[{ label: "Name", value: detail.name }, { label: "Description", value: display(detail.description) }, { label: "Namespace UID", value: detail.uid }, { label: "Relational tables", value: detail.relational_table_count ?? 0 }, { label: "Time-indexed tables", value: detail.time_index_table_count ?? 0 }, { label: "Created", value: formatDate(detail.created_at) }, { label: "Visibility", value: display(detail.visibility) }]} /></Card>}
      {tab === "tables" && <NamespaceTables uid={uid} />}
      {tab === "permissions" && <PermissionsPanel requestKey={`namespace-permissions-${uid}`} load={(signal) => metaTablesApi.namespacePermissions(uid, signal)} save={(value) => metaTablesApi.saveNamespacePermissions(uid, value)} propagate={() => metaTablesApi.propagateNamespacePermissions(uid)} namespace />}
    </Tabs></>}</RemoteContent>
  </>;
}

function NamespaceTables({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(search);
  const remote = useRemote(`namespace-tables-${uid}-${term}-${kind}-${offset}`, (signal) => metaTablesApi.namespaceTables(uid, { search: term, kind, limit: pageSize, offset }, signal));
  return <Card title="Tables" description="Registered tables across relational and time-indexed kinds."><div className="toolbar"><Field label="Search namespace tables"><Input placeholder="Search namespace tables" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} /></Field><Field label="Type" controlId="namespace-table-kind"><ResourcePicker id="namespace-table-kind" value={kind} ariaLabel="Table type" options={[{ value: "", label: "All kinds" }, { value: "relational", label: "Relational" }, { value: "time_index", label: "Time-indexed" }]} onValueChange={(value) => { setKind(value); setOffset(0); }} /></Field></div><RemoteContent state={remote} empty={(data) => data.count === 0}>{(data) => <><DataTable items={data.results} getId={(table) => table.uid} presentation="auto" onActivateRow={(table) => navigate(detailPath("tables", table.uid))} columns={[{ id: "kind", header: "Type", renderCell: (table) => <Badge tone={table.kind === "time_index" ? "accent" : "neutral"}>{table.kind === "time_index" ? "Time-indexed" : "Relational"}</Badge> }, { id: "name", header: "Table", renderCell: (table) => <strong>{display(table.identifier ?? table.physical_table_name, table.uid)}</strong> }, { id: "uid", header: "UID", renderCell: (table) => <span className="mono">{table.uid}</span> }, { id: "created", header: "Created", renderCell: (table) => formatDate(table.created_at) }]} /><Pagination count={data.count} offset={offset} limit={pageSize} onChange={setOffset} noun="tables" /></>}</RemoteContent></Card>;
}
