import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Field, Input, Textarea } from "@dev-mainsequence/command-center-sdk/controls";
import { ResourceActionConfirmationDialog, ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { Layers3 } from "lucide-react";
import { ApiError, metaTablesApi } from "../api";
import { namespaceDetailTabs } from "../detailTabs";
import { DetailTabIcon } from "../detailTabIcons";
import { detailPath } from "../navigation";
import { defineNamespaceTablesResource, namespacesResource } from "../resources";
import { DetailSection, DetailView, display, Facts, formatDate, useRemote } from "../ui";
import { AccessMapTab } from "./AccessMapTab";
import { AccessPanel } from "./AccessPanel";

export function NamespacesPage({ uid, tab }: { uid: string | null; tab: string | null }) {
  return uid ? <NamespaceDetail key={uid} uid={uid} requestedTab={tab} /> : <NamespaceRegistry />;
}

function NamespaceRegistry() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return <>
    <ResourceListPage
      definition={namespacesResource}
      pageSize={25}
      tablePresentation="auto"
      searchable
      refreshable
      searchPlaceholder="Search namespace name or UID"
      primaryActions={[{ id: "create-namespace", label: "Create namespace", tone: "primary", onSelect: () => setCreating(true) }]}
      onRowActivate={(namespace) => navigate(detailPath("namespaces", namespace.uid))}
    />
    {creating && <CreateNamespaceDialog onClose={() => setCreating(false)}
      onCreated={namespace => navigate(detailPath("namespaces", namespace.uid, "permissions"))} />}
  </>;
}

/** Any person creates a namespace whose name is free and becomes its owner (MetaTables ADR 0024). */
function CreateNamespaceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (namespace: { uid: string }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setPending(true); setError(null);
    try { onCreated(await metaTablesApi.createNamespace({ name: name.trim(), description: description.trim() || null })); }
    catch (cause) { setError(namespaceCreationError(cause)); setPending(false); }
  }
  return <ResourceActionConfirmationDialog actionLabel="Create namespace" title="Create namespace"
    description="You become its owner and decide who can use it. Tables created in it get no role of their own: its roles cover them."
    confirmationValue="" onConfirmationValueChange={() => {}} confirmButtonLabel="Create namespace" confirmDisabled={!name.trim()}
    pending={pending} presentation="auto" error={error ?? undefined} onClose={onClose} onConfirm={create}>
    <Field label="Name" required description="Names are stored in lowercase. Use one namespace per application, for example crm.">
      <Input value={name} maxLength={255} disabled={pending} onChange={event => setName(event.target.value)} />
    </Field>
    <Field label="Description" description="Optional. What the namespace holds or which application uses it.">
      <Textarea value={description} disabled={pending} onChange={event => setDescription(event.target.value)} />
    </Field>
  </ResourceActionConfirmationDialog>;
}

/** A taken name is refused and never adopted; the refusal names its owners when the caller may see them. */
function namespaceCreationError(cause: unknown) {
  if (!(cause instanceof Error)) return "Namespace creation failed.";
  const detail = cause instanceof ApiError && cause.detail && typeof cause.detail === "object" ? cause.detail as { code?: string; owners?: { principal_kind: string; principal_uid: string }[] } : null;
  if (detail?.code !== "namespace_name_taken" || !detail.owners?.length) return cause.message;
  const owners = detail.owners.map(owner => `${owner.principal_kind === "team" ? "Team" : "User"} ${owner.principal_uid}`).join(", ");
  return `${cause.message} Its owners: ${owners}.`;
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
      {tab === "permissions" && <AccessPanel kind="namespace" uid={uid} namespaceName={detail.name} />}
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
