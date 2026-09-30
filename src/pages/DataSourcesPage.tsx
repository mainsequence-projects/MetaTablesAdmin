import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApplicationCardGrid, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable, EntitySummary, ResourceDetailShell, ResourceActionConfirmationDialog, ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { ArrowLeft, Calendar, Database, Fingerprint, FolderOpen, Globe, RefreshCw, Server, type LucideIcon } from "lucide-react";
import { metaTablesApi, type SourceConfiguration, type SourceEngine, type SourceRecord, type SourceSummary } from "../api";
import { sourceDetailTabs } from "../detailTabs";
import { DetailTabIcon } from "../detailTabIcons";
import { DataSourceTypeIcon, sourceEnginePickerIcon } from "../DataSourceTypeIcon";
import { sourceDefaults, sourceEngines, switchSourceEngine } from "../sourceConfiguration";
import { useRuntimeContext } from "../runtimeContext";
import { runtimeSourcesResource, sourcesResource } from "../resources";
import { adminPaths } from "../navigation";
import { Badge, Card, DetailSection, PageHeading, StatePanel, Picker, useRemote } from "../ui";

export function DataSourcesPage({ uid, administration = false }: { uid: string | null; administration?: boolean }) {
  const { runtime } = useRuntimeContext();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const runtimeChoice = administration && search.get("scope") !== "catalog";
  if ((administration || uid === "new") && runtime.is_admin !== true) return <StatePanel title="Admin access required">DataSource settings are managed by application admins.</StatePanel>;
  if (uid === "new") return <><PageHeading eyebrow="Connections" title="Register DataSource" />{runtimeChoice
    ? <SourceEditor runtimeChoice onSaved={source => navigate(`${adminPaths.dataSources}/${source.uid}?scope=runtime`)} />
    : runtime.local_mode ? <StatePanel title="Local storage is fixed"><DataSourceTypeIcon engine="sqlite" /> The local catalog uses its workspace SQLite database.</StatePanel>
      : <SourceEditor onSaved={source => navigate(`${adminPaths.dataSources}/${source.uid}?scope=catalog`)} />}</>;
  return uid ? <SourceDetailPage uid={uid} administration={administration} runtimeChoice={runtimeChoice} />
    : administration ? <ApplicationPageStack>
      {runtime.local_mode && <SourceRegistry administration />}
      <ResourceListPage definition={runtimeSourcesResource} pageSize={25}
      tablePresentation="auto" searchable refreshable searchPlaceholder="Search registered connections"
      primaryActions={[{ id: "register", label: "Add DataSource", onSelect: () => navigate(`${adminPaths.dataSources}/new?scope=runtime`) }]}
      onRowActivate={source => navigate(`${adminPaths.dataSources}/${source.uid}?scope=runtime`)} />
      {!runtime.local_mode && <SourceRegistry administration />}</ApplicationPageStack>
      : <SourceRegistry administration={false} />;
}

function SourceRegistry({ administration }: { administration: boolean }) {
  const { runtime } = useRuntimeContext();
  const navigate = useNavigate();
  return <>
    {runtime.local_mode && <StatePanel title="Workspace storage"><DataSourceTypeIcon engine="sqlite" /> The SQLite source is managed by the local runtime. Its storage, default selection and access cannot be changed here.</StatePanel>}
    <ResourceListPage
      definition={sourcesResource}
      pageSize={25}
      tablePresentation="auto"
      searchable
      refreshable
      searchPlaceholder="Search data source name"
      primaryActions={runtime.is_admin !== true ? [] : !administration
        ? [{ id: "manage", label: "Manage sources", onSelect: () => navigate(adminPaths.dataSources) }]
        : runtime.local_mode ? [] : [{ id: "register", label: "Register catalog source", onSelect: () => navigate(`${adminPaths.dataSources}/new?scope=catalog`) }]}
      onRowActivate={source => navigate(`${administration ? adminPaths.dataSources : "/data-sources"}/${source.uid}${administration ? "?scope=catalog" : ""}`)}
    />
  </>;
}

const summaryIcons: Record<string, LucideIcon> = {
  server: Server, database: Database, fingerprint: Fingerprint, calendar: Calendar,
  folder: FolderOpen, globe: Globe,
};

function SourceDetailPage({ uid, administration, runtimeChoice = false }: { uid: string; administration: boolean; runtimeChoice?: boolean }) {
  const { runtime } = useRuntimeContext();
  const navigate = useNavigate();
  const listPath = administration ? adminPaths.dataSources : "/data-sources";
  const [search, setSearch] = useSearchParams();
  const [revision, refresh] = useState(0);
  const [actionError, setActionError] = useState("");
  const remote = useRemote(`source-detail-${uid}-${revision}`, async signal => {
    const [source, summary] = await Promise.all([runtimeChoice ? metaTablesApi.runtimeSource(uid, signal) : metaTablesApi.source(uid, signal),
      runtimeChoice ? metaTablesApi.runtimeSourceSummary(uid, signal) : metaTablesApi.sourceSummary(uid, signal)]);
    return { source, summary };
  });
  const detail = remote.status === "ready" ? remote.data : null;
  const { tabs, activeTab } = resolveResourceDetailTabs(sourceDetailTabs, { activeTabId: search.get("tab"), resource: detail?.source });
  return <ResourceDetailShell<SourceRecord>
    breadcrumbs={[{ id: "data-sources", label: "Data Sources", onSelect: () => navigate(listPath) },
      { id: uid, label: detail?.summary.entity.title ?? "Data Source" }]}
    renderBreadcrumbLead={({ current }) => current ? <DataSourceTypeIcon engine={detail?.source.class_type ?? ""} /> : null}
    headerActions={<>
      <Button variant="outline" onClick={() => navigate(listPath)}><ArrowLeft size={16} aria-hidden="true" />Back to list</Button>
      {!administration && runtime.is_admin === true && detail?.source.can_manage && <Button onClick={() => navigate(`${adminPaths.dataSources}/${uid}`)}>Manage source</Button>}
      <Button variant="outline" disabled={remote.status === "loading"} onClick={() => refresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
    </>}
    loading={remote.status === "loading"} loadingTitle="Loading Data Source…" loadingDescription="Loading the selected Data Source."
    error={remote.status === "error" ? <ApplicationPageStack><p>{remote.error.message}</p>
      <Button onClick={() => refresh(value => value + 1)}>Retry</Button></ApplicationPageStack> : undefined}
    summary={detail && <EntitySummary summary={detail.summary} renderFieldLead={field => {
      if (field.key === "class_type") return <DataSourceTypeIcon engine={detail.source.class_type} />;
      const Icon = field.icon ? summaryIcons[field.icon] : undefined;
      return Icon ? <Icon size={14} aria-hidden="true" /> : null;
    }} />}
    tabs={tabs} activeTabId={activeTab?.id} tabsLabel="Data Source sections"
    renderTabLead={({ tab }) => <DetailTabIcon id={tab.id} />}
    onTabChange={tab => setSearch(current => { const next = new URLSearchParams(current); next.set("tab", tab); return next; })}
    >
    {detail && activeTab?.id === "details" && <ApplicationPageStack>
      {actionError && <StatePanel embedded title="Action failed" tone="danger">{actionError}</StatePanel>}
      <SourceDetail source={detail.source} summary={detail.summary} administration={administration} runtimeChoice={runtimeChoice} setError={setActionError} refresh={() => refresh(value => value + 1)} />
    </ApplicationPageStack>}
  </ResourceDetailShell>;
}

function SourceDetail({ source, summary, administration, runtimeChoice, refresh, setError }: { source: SourceRecord; summary: SourceSummary; administration: boolean; runtimeChoice: boolean; refresh: () => void; setError: (message: string) => void }) {
  const { runtime } = useRuntimeContext();
  const canManage = administration && runtime.is_admin === true && source.can_manage === true;
  const selectedForHosted = runtimeChoice && (runtime.hosted_bootstrap?.selected_source_uid === source.uid || runtime.bootstrap?.selected_source_uid === source.uid);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "Operation failed"); }
    finally { setBusy(false); refresh(); }
  }
  const supportsTables = source.capabilities.includes("supports_schema_migrations");
  const management = canManage && <>
    <Button disabled={busy || source.storage_access_mode === "disabled"} onClick={() => void act(() => runtimeChoice ? metaTablesApi.validateRuntimeSource(source.uid) : metaTablesApi.validateSource(source.uid))}>Validate connection</Button>
    <Button disabled={busy} onClick={() => void act(() => runtimeChoice ? metaTablesApi.updateRuntimeSource(source.uid, { storage_access_mode: source.storage_access_mode === "disabled" ? "read_write" : "disabled" }) : metaTablesApi.updateSource(source.uid, { storage_access_mode: source.storage_access_mode === "disabled" ? "read_write" : "disabled" }))}>{source.storage_access_mode === "disabled" ? "Enable" : "Disable"}</Button>
    <Button disabled={busy || source.is_default} onClick={() => setConfirmDelete(true)}>Remove registration</Button>
  </>;
  return <>
    {canManage && source.configuration
      ? <SourceEditor embedded runtimeChoice={runtimeChoice} key={JSON.stringify(source.configuration)} source={source} onSaved={refresh} actions={management} />
      : <DetailSection title="Data Source details" description={selectedForHosted
        ? "This DataSource is selected for the hosted runtime. Select another one in Settings before editing or removing it."
        : summary.extensions?.runtime_managed ? "This DataSource is managed with the API runtime."
          : "Connection settings are managed by application admins."}>
        <ApplicationCardGrid>
          <Field label="Name"><Input readOnly value={source.display_name} /></Field>
          <Field label="Engine"><Input readOnly value={String(summary.inline_fields.find(field => field.key === "class_type")?.value ?? source.class_type)} /></Field>
          {summary.highlight_fields.map(field => <Field key={field.key} label={field.label}><Input readOnly value={String(field.value ?? "")} /></Field>)}
        </ApplicationCardGrid>
      </DetailSection>}
    {!supportsTables && <StatePanel embedded title="Connection management">Registration, configuration and connection validation are supported. Table reads, writes and migrations are not yet available for this engine.</StatePanel>}
    <DetailSection title="Table capabilities"><DataTable items={source.capabilities} getId={value => value} presentation="auto"
      emptyContent="No table operations supported."
      columns={[{ id: "capability", header: "Capability", importance: "primary", renderCell: value => value.replace(/^supports_/, "").replaceAll("_", " ") }]} /></DetailSection>
    {canManage && confirmDelete && <ResourceActionConfirmationDialog title="Remove DataSource registration" actionLabel="Remove registration"
      description={`Remove ${source.display_name}? Database contents and platform Secrets are preserved. Referenced sources cannot be removed.`}
      tone="danger" confirmationValue="" onConfirmationValueChange={() => {}} confirmButtonLabel="Remove registration"
      pending={busy} presentation="auto" onClose={() => setConfirmDelete(false)} onConfirm={() => act(async () => {
        await (runtimeChoice ? metaTablesApi.deleteRuntimeSource(source.uid) : metaTablesApi.deleteSource(source.uid)); navigate(adminPaths.dataSources);
      })} />}
  </>;
}

function SourceEditor({ source, onSaved, actions, embedded = false, runtimeChoice = false }: { source?: SourceRecord; onSaved: (source: SourceRecord) => void; actions?: ReactNode; embedded?: boolean; runtimeChoice?: boolean }) {
  const formId = useId();
  const [name, setName] = useState(source?.display_name ?? '');
  const [engine, setEngine] = useState<SourceEngine>((source?.class_type as SourceEngine) ?? 'postgresql');
  const [access, setAccess] = useState(source?.storage_access_mode ?? 'read_write');
  const [configuration, setConfiguration] = useState<SourceConfiguration>(source?.configuration ?? sourceDefaults('postgresql'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { display_name: name, configuration, storage_access_mode: access };
      onSaved(source ? await (runtimeChoice ? metaTablesApi.updateRuntimeSource(source.uid, body) : metaTablesApi.updateSource(source.uid, body))
        : await (runtimeChoice ? metaTablesApi.createRuntimeSource({ ...body, class_type: engine }) : metaTablesApi.createSource({ ...body, class_type: engine })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save source'); }
    finally { setBusy(false); }
  }
  const Panel = embedded ? DetailSection : Card;
  return <Panel title={source ? "Data Source editor" : "Connection configuration"} description="Configure the database connection using platform Secret references."
    actions={<>{actions}<Button type="submit" form={formId} variant="primary" pending={busy} disabled={busy}>{source ? "Save changes" : "Create DataSource"}</Button></>}>
    <form id={formId} onSubmit={submit}><ApplicationPageStack><ApplicationCardGrid>
    <Field label="Name"><Input required value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="Engine"><Picker ariaLabel="Engine" value={engine} disabled={!!source}
      options={sourceEngines.map(option => ({ ...option, icon: sourceEnginePickerIcon(option.value) }))}
      renderValue={selected => selected[0] && <span className="data-source-picker-value"><DataSourceTypeIcon engine={selected[0].value} />{selected[0].label}</span>}
      onValueChange={value => {
      const next = value as SourceEngine;
      setEngine(next); setConfiguration(current => switchSourceEngine(current, next));
    }} /></Field>
    {(['host', 'database_name', 'database_user'] as const).map(key => <Field key={key} label={key.replaceAll('_', ' ')}><Input required value={configuration[key]} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value, ...(key === 'database_name' && engine === 'mysql' ? { default_schema: e.target.value } : {}) }))} /></Field>)}
    <Field label="Default schema" description={engine === 'mysql' ? 'MySQL uses the database name as its schema.' : undefined}><Input required readOnly={engine === 'mysql'} value={configuration.default_schema} onChange={e => setConfiguration(c => ({ ...c, default_schema: e.target.value }))} /></Field>
    <Field label="Password Secret UID" description="UID of a platform Secret accessible to the MetaTables API."><Input value={configuration.password_secret_uid ?? ''} onChange={e => setConfiguration(c => ({ ...c, password_secret_uid: e.target.value || null }))} /></Field>
    <Field label="Port"><Input type="number" min={1} max={65535} required value={configuration.port} onChange={e => setConfiguration(c => ({ ...c, port: Number(e.target.value) }))} /></Field>
    {engine === 'mssql' ? <>
      <Field label="Encryption"><Picker ariaLabel="Encryption" value={String(configuration.encrypt)} options={[{ value: "true", label: "Required" }, { value: "false", label: "Optional" }]} onValueChange={value => setConfiguration(c => ({ ...c, encrypt: value === 'true' }))} /></Field>
      <Field label="Server certificate" description="Verification uses the API server's certificate trust store."><Picker ariaLabel="Server certificate" value={String(configuration.trust_server_certificate)} options={[{ value: "false", label: "Verify certificate" }, { value: "true", label: "Trust without verification" }]} onValueChange={value => setConfiguration(c => ({ ...c, trust_server_certificate: value === 'true' }))} /></Field>
    </> : <>
      <Field label="TLS mode"><Picker ariaLabel="TLS mode" value={configuration.ssl_mode ?? null} options={(engine === 'mysql' ? ['verify-full', 'verify-ca', 'require', 'disable'] : ['require', 'verify-ca', 'verify-full', 'prefer', 'allow', 'disable']).map(value => ({ value, label: value }))} onValueChange={value => setConfiguration(c => ({ ...c, ssl_mode: value }))} /></Field>
      {(['tls_ca_secret_uid', 'tls_certificate_secret_uid', 'tls_key_secret_uid'] as const).map(key => <Field key={key} label={key.replaceAll('_', ' ')}><Input value={configuration[key] ?? ''} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value || null }))} /></Field>)}
      {engine === 'mysql' && <Field label="Character set"><Picker ariaLabel="Character set" value={configuration.default_charset ?? null} options={['utf8mb4', 'utf8', 'latin1', 'ascii'].map(value => ({ value, label: value }))} onValueChange={value => setConfiguration(c => ({ ...c, default_charset: value }))} /></Field>}
    </>}
    <Field label="Storage access"><Picker ariaLabel="Storage access" value={access} options={['read_write', 'read_only', 'disabled'].map(value => ({ value, label: value.replaceAll('_', ' ') }))} onValueChange={setAccess} /></Field>
    </ApplicationCardGrid>
    {error && <StatePanel embedded tone="danger" title="Unable to save source">{error}</StatePanel>}
    </ApplicationPageStack></form></Panel>;
}
