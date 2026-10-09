import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { Layers3 } from "lucide-react";
import { metaTablesApi } from "../api";
import { namespaceDetailTabs } from "../detailTabs";
import { DetailTabIcon } from "../detailTabIcons";
import { detailPath } from "../navigation";
import { defineNamespaceTablesResource, namespacesResource } from "../resources";
import { DetailSection, DetailView, display, Facts, formatDate, useRemote } from "../ui";
import { AccessMapTab } from "./AccessMapTab";
import { PermissionsPanel } from "./PermissionsPanel";

export function NamespacesPage({ uid, tab }: { uid: string | null; tab: string | null }) {
  return uid ? <NamespaceDetail key={uid} uid={uid} requestedTab={tab} /> : <NamespaceRegistry />;
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
  const { tabs, activeTab } = resolveResourceDetailTabs(namespaceDetailTabs, { activeTabId: requestedTab, resource: namespace });
  const tab = activeTab?.id;
  return <DetailView state={remote}
    loadingTitle="Loading Namespace…"
    loadingDescription="Loading the selected namespace and its sections."
    breadcrumbs={[{ id: "namespaces", label: "Namespaces", onSelect: () => navigate("/namespaces") }, { id: uid, label: namespace?.name ?? "Namespace" }]}
    renderBreadcrumbLead={({ current }) => current ? <Layers3 size={16} aria-hidden="true" /> : null}
    summary={detail => ({
      entity: { id: detail.uid, type: "Namespace", title: detail.name },
      badges: [{ key: "visibility", label: display(detail.visibility, "Visibility unknown"), tone: detail.visibility === "public" ? "success" : "secondary" }],
      inline_fields: [{ key: "uid", label: "UID", value: detail.uid }],
      highlight_fields: detail.description ? [{ key: "description", label: "Description", value: detail.description }] : [],
      stats: [{ key: "tables", label: "Registered tables", display: String((detail.relational_table_count ?? 0) + (detail.time_index_table_count ?? 0)), value: (detail.relational_table_count ?? 0) + (detail.time_index_table_count ?? 0) }],
    })}
    tabs={tabs} activeTabId={tab} tabsLabel="Namespace sections"
    renderTabLead={({ tab }) => <DetailTabIcon id={tab.id} />}
    onTabChange={next => navigate(detailPath("namespaces", uid, next))}>
    {detail => <>
      {tab === "overview" && <DetailSection title="Overview"><Facts items={[{ label: "Name", value: detail.name }, { label: "Description", value: display(detail.description) }, { label: "Namespace UID", value: detail.uid }, { label: "Relational tables", value: detail.relational_table_count ?? 0 }, { label: "Time-indexed tables", value: detail.time_index_table_count ?? 0 }, { label: "Created", value: formatDate(detail.created_at) }, { label: "Visibility", value: display(detail.visibility) }]} /></DetailSection>}
      {tab === "tables" && <NamespaceTables uid={uid} />}
      {tab === "permissions" && <PermissionsPanel embedded resourceUid={uid} requestKey={`namespace-permissions-${uid}`} load={signal => metaTablesApi.namespacePermissions(uid, signal)} save={(value, revision) => metaTablesApi.saveNamespacePermissions(uid, value, revision)} namespace />}
      {tab === "access-map" && <AccessMapTab uid={uid} />}
    </>}
  </DetailView>;
}

function NamespaceTables({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState("");
  const definition = useMemo(() => defineNamespaceTablesResource(uid), [uid]);
  return <ResourceListPage
    definition={definition}
    embedded
    pageSize={25}
    tablePresentation="auto"
    searchable
    refreshable
    searchPlaceholder="Search namespace tables"
    filterDefinitions={[{ id: "kind", label: "Type", value: kind, onChange: setKind, options: [
      { value: "", label: "All kinds" }, { value: "relational", label: "Relational" }, { value: "time_index", label: "Time-indexed" },
    ] }]}
    onRowActivate={table => navigate(detailPath(table.kind === "time_index" ? "time-index-meta-tables" : "tables", table.uid))}
  />;
}
