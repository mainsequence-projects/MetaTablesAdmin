import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApplicationCard, ApplicationCardGrid, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { EntitySummary, ResourceDetailShell, ResourceActionConfirmationDialog, ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { ArrowLeft, Calendar, Database, Eye, EyeOff, Fingerprint, FolderOpen, Globe, RefreshCw, Server, type LucideIcon } from "lucide-react";
import { metaTablesApi, type SourceConfiguration, type SourceEngine, type SourceRecord, type SourceSummary } from "../api";
import { sourceDetailTabs } from "../detailTabs";
import { DetailTabIcon } from "../detailTabIcons";
import { DataSourceTypeIcon, sourceEnginePickerIcon } from "../DataSourceTypeIcon";
import { sourceDefaults, sourceEngines, switchSourceEngine } from "../sourceConfiguration";
import { DataSourceConfigurationError, useRuntimeContext } from "../runtimeContext";
import { sourcesResource } from "../resources";
import { adminPaths, detailPath } from "../navigation";
import { DetailSection, Facts, StatePanel, Picker, display, useRemote } from "../ui";
import { SourceQueryBuilder } from "./SourceQueryBuilder";

export function DataSourcesPage({ uid }: { uid: string | null }) {
  const { runtime } = useRuntimeContext();
  const navigate = useNavigate();
  if (uid === "new" && runtime.is_admin !== true) return <StatePanel title="Admin access required">DataSource settings are managed by application admins.</StatePanel>;
  if (uid === "new") return <ApplicationPageStack>
    <ApplicationPageHeader eyebrow="Data Sources" title="Register DataSource"
      actions={<Button onClick={() => navigate("/data-sources")}><ArrowLeft size={16} aria-hidden="true" />Back to list</Button>} />
    <SourceEditor onSaved={source => navigate(detailPath("data-sources", source.uid))} />
  </ApplicationPageStack>;
  return uid ? <SourceDetailPage uid={uid} /> : <ApplicationPageStack>
    {runtime.bootstrap?.active === false && <DataSourceConfigurationError onSettings={() => navigate(adminPaths.settings)} />}
    <ResourceListPage
    definition={sourcesResource} pageSize={25} tablePresentation="auto" searchable refreshable
    searchPlaceholder="Search data source name"
    emptyContent={runtime.local_mode && runtime.bootstrap?.candidate && runtime.bootstrap.active === false
      ? <StatePanel embedded title="No additional DataSources registered">Add a DataSource to connect another database.</StatePanel>
      : undefined}
    primaryActions={runtime.is_admin !== true ? []
      : [{ id: "register", label: "Add DataSource", onSelect: () => navigate("/data-sources/new") }]}
    onRowActivate={source => navigate(detailPath("data-sources", source.uid))} />
  </ApplicationPageStack>;
}

const summaryIcons: Record<string, LucideIcon> = {
  server: Server, database: Database, fingerprint: Fingerprint, calendar: Calendar,
  folder: FolderOpen, globe: Globe,
};

function SourceDetailPage({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const listPath = "/data-sources";
  const [search, setSearch] = useSearchParams();
  const [revision, refresh] = useState(0);
  const [actionError, setActionError] = useState("");
  const remote = useRemote(`source-detail-${uid}-${revision}`, async signal => {
    const [source, summary] = await Promise.all([metaTablesApi.source(uid, signal),
      metaTablesApi.sourceSummary(uid, signal)]);
    return { source, summary: {
      ...summary,
      badges: summary.badges?.filter(badge => badge.key !== "runtime"),
      stats: summary.stats.filter(stat => stat.key !== "current_used_storage" || stat.value != null),
    } };
  });
  const detail = remote.status === "ready" ? remote.data : null;
  const { tabs, activeTab } = resolveResourceDetailTabs(sourceDetailTabs, { activeTabId: search.get("tab"), resource: detail?.source });
  return <ResourceDetailShell<SourceRecord>
    breadcrumbs={[{ id: "data-sources", label: "Data Sources", onSelect: () => navigate(listPath) },
      { id: uid, label: detail?.summary.entity.title ?? "Data Source" }]}
    renderBreadcrumbLead={({ current }) => current ? <DataSourceTypeIcon engine={detail?.source.class_type ?? ""} /> : null}
    headerActions={<>
      <Button variant="outline" onClick={() => navigate(listPath)}><ArrowLeft size={16} aria-hidden="true" />Back to list</Button>
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
      <SourceDetail source={detail.source} summary={detail.summary} setError={setActionError} refresh={() => refresh(value => value + 1)} />
    </ApplicationPageStack>}
    {detail && activeTab?.id === "query-builder" && <SourceQueryBuilder key={uid} source={detail.source} />}
  </ResourceDetailShell>;
}

function SourceDetail({ source, summary, refresh, setError }: { source: SourceRecord; summary: SourceSummary; refresh: () => void; setError: (message: string) => void }) {
  const { runtime } = useRuntimeContext();
  const canManage = runtime.is_admin === true && source.can_manage === true;
  const selectedForHosted = source.class_type !== "sqlite" &&
    (runtime.hosted_bootstrap?.selected_source_uid === source.uid || runtime.bootstrap?.selected_source_uid === source.uid);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "Operation failed"); }
    finally { setBusy(false); refresh(); }
  }
  const management = canManage && <>
    <Button disabled={busy || source.storage_access_mode === "disabled"} onClick={() => void act(() => metaTablesApi.validateSource(source.uid))}>Test connection</Button>
    <Button disabled={busy} onClick={() => void act(() => metaTablesApi.updateSource(source.uid, { storage_access_mode: source.storage_access_mode === "disabled" ? "read_write" : "disabled" }))}>{source.storage_access_mode === "disabled" ? "Enable" : "Disable"}</Button>
    <Button disabled={busy || source.is_default} onClick={() => setConfirmDelete(true)}>Remove registration</Button>
  </>;
  return <>
    {canManage && source.configuration
      ? <SourceEditor embedded key={JSON.stringify(source.configuration)} source={source} onSaved={refresh} actions={management} />
      : <DetailSection title="Data Source details" description={selectedForHosted
        ? "To edit or remove this DataSource, first choose another in Settings."
        : undefined}>
        <Facts items={[
          { label: "Name", value: source.display_name },
          { label: "Engine", value: <span className="data-source-picker-value"><DataSourceTypeIcon engine={source.class_type} />{display(summary.inline_fields.find(field => field.key === "class_type")?.value ?? source.class_type)}</span> },
          ...summary.highlight_fields.map(field => ({ label: field.label, value: display(field.value) })),
        ]} />
      </DetailSection>}
    {canManage && confirmDelete && <ResourceActionConfirmationDialog title="Remove DataSource registration" actionLabel="Remove registration"
      description={`Remove ${source.display_name}? Database contents and platform Secrets are preserved. Referenced sources cannot be removed.`}
      tone="danger" confirmationValue="" onConfirmationValueChange={() => {}} confirmButtonLabel="Remove registration"
      pending={busy} presentation="auto" onClose={() => setConfirmDelete(false)} onConfirm={() => act(async () => {
        await (metaTablesApi.deleteSource(source.uid)); navigate("/data-sources");
      })} />}
  </>;
}

function SourceEditor({ source, onSaved, actions, embedded = false }: { source?: SourceRecord; onSaved: (source: SourceRecord) => void; actions?: ReactNode; embedded?: boolean }) {
  const { runtime } = useRuntimeContext();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(source?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [engine, setEngine] = useState<SourceEngine>((source?.class_type as SourceEngine) ?? 'postgresql');
  const [access, setAccess] = useState(source?.storage_access_mode ?? 'read_write');
  const [configuration, setConfiguration] = useState<SourceConfiguration>(source?.configuration ?? sourceDefaults('postgresql'));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionTest, setConnectionTest] = useState<{ ok: boolean; message: string } | null>(null);
  const busy = saving || testing;
  const [error, setError] = useState('');
  useEffect(() => { setConnectionTest(null); }, [engine, configuration, password]);
  async function testConnection() {
    if (!formRef.current?.reportValidity()) return;
    setTesting(true); setConnectionTest(null); setError('');
    try {
      const result = await metaTablesApi.testSourceConnection({ display_name: name, class_type: engine,
        configuration, storage_access_mode: access, ...(password ? { password } : {}) });
      setConnectionTest(result);
    } catch (cause) {
      setConnectionTest({ ok: false, message: cause instanceof Error ? cause.message : 'Connection test failed.' });
    } finally { setTesting(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const body = { display_name: name, configuration, storage_access_mode: access, ...(password ? { password } : {}) };
      onSaved(source ? await (metaTablesApi.updateSource(source.uid, body))
        : await (metaTablesApi.createSource({ ...body, class_type: engine })));
      setPassword('');
      setPasswordVisible(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save source'); }
    finally { setSaving(false); }
  }
  const header = <ApplicationPageHeader title={source ? "Data Source editor" : "DataSource configuration"} titleAs="h2"
    description="Enter the database details and choose its storage access."
    actions={actions} />;
  const form = <form ref={formRef} id={formId} aria-label={source ? "Edit DataSource" : "Register DataSource"} autoComplete="off" onSubmit={submit}>
    <ApplicationPageStack><div className="source-form-fields"><ApplicationCardGrid minimumCardWidth="22rem">
    <Field label="Name" required disabled={busy}><Input required name="display_name" value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="Engine" required disabled={busy}><Picker ariaLabel="Engine" value={engine} disabled={busy || !!source}
      options={sourceEngines.map(option => ({ ...option, icon: sourceEnginePickerIcon(option.value) }))}
      renderValue={selected => selected[0] && <span className="data-source-picker-value"><DataSourceTypeIcon engine={selected[0].value} />{selected[0].label}</span>}
      onValueChange={value => {
      const next = value as SourceEngine;
      setEngine(next); setConfiguration(current => switchSourceEngine(current, next));
    }} /></Field>
    {(['host', 'database_name', 'database_user'] as const).map(key => <Field key={key} label={{ host: "Host", database_name: "Database name", database_user: "Database user" }[key]} required disabled={busy}><Input required name={key} value={configuration[key]} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value, ...(key === 'database_name' && engine === 'mysql' ? { default_schema: e.target.value } : {}) }))} /></Field>)}
    <Field label="Default schema" required disabled={busy} description={engine === 'mysql' ? 'MySQL uses the database name as its schema.' : undefined}><Input required name="default_schema" readOnly={engine === 'mysql'} value={configuration.default_schema} onChange={e => setConfiguration(c => ({ ...c, default_schema: e.target.value }))} /></Field>
    <Field label="Password" required={!source} disabled={busy} description={source ? "Leave blank to keep the existing password." : "Saved securely when you create the DataSource."}>
      <div className="source-password-control">
        <Input type={passwordVisible ? "text" : "password"} name="password" autoComplete="new-password" required={!source} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingInlineEnd: 'calc(var(--application-control-min-size) + 0.75rem)' }} />
        <span className="source-password-action"><Button type="button" variant="ghost" size="small" iconOnly disabled={busy} aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible(visible => !visible)}>
          {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button></span>
      </div>
    </Field>
    <Field label="Port" required disabled={busy}><Input name="port" type="number" min={1} max={65535} required value={configuration.port} onChange={e => setConfiguration(c => ({ ...c, port: Number(e.target.value) }))} /></Field>
    {engine === 'mssql' ? <>
      <Field label="Encryption" disabled={busy}><Picker ariaLabel="Encryption" value={String(configuration.encrypt)} options={[{ value: "true", label: "Required" }, { value: "false", label: "Optional" }]} onValueChange={value => setConfiguration(c => ({ ...c, encrypt: value === 'true' }))} /></Field>
      <Field label="Server certificate" disabled={busy} description="Verification uses the API server's certificate trust store."><Picker ariaLabel="Server certificate" value={String(configuration.trust_server_certificate)} options={[{ value: "false", label: "Verify certificate" }, { value: "true", label: "Trust without verification" }]} onValueChange={value => setConfiguration(c => ({ ...c, trust_server_certificate: value === 'true' }))} /></Field>
    </> : <>
      <Field label="TLS mode" disabled={busy}><Picker ariaLabel="TLS mode" value={configuration.ssl_mode ?? null} options={(engine === 'mysql' ? ['verify-full', 'verify-ca', 'require', 'disable'] : ['require', 'verify-ca', 'verify-full', 'prefer', 'allow', 'disable']).map(value => ({ value, label: value }))} onValueChange={value => setConfiguration(c => ({ ...c, ssl_mode: value }))} /></Field>
      {(['tls_ca_secret_uid', 'tls_certificate_secret_uid', 'tls_key_secret_uid'] as const).map(key => <Field key={key} label={{ tls_ca_secret_uid: 'TLS CA Secret UID', tls_certificate_secret_uid: 'TLS certificate Secret UID', tls_key_secret_uid: 'TLS key Secret UID' }[key]} disabled={busy}><Input name={key} value={configuration[key] ?? ''} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value || null }))} /></Field>)}
      {engine === 'mysql' && <Field label="Character set" disabled={busy}><Picker ariaLabel="Character set" value={configuration.default_charset ?? null} options={['utf8mb4', 'utf8', 'latin1', 'ascii'].map(value => ({ value, label: value }))} onValueChange={value => setConfiguration(c => ({ ...c, default_charset: value }))} /></Field>}
    </>}
    <Field label="Storage access" required disabled={busy}><Picker ariaLabel="Storage access" value={access} options={['read_write', 'read_only', 'disabled'].map(value => ({ value, label: value.replaceAll('_', ' ') }))} onValueChange={setAccess} /></Field>
    </ApplicationCardGrid></div>
    {runtime.credential_store?.error && <StatePanel embedded tone="danger" title="Credential storage unavailable">
      {runtime.credential_store.error}
    </StatePanel>}
    {error && <StatePanel embedded tone="danger" title="Unable to save source">{error}</StatePanel>}
    {!source && connectionTest && <StatePanel embedded tone={connectionTest.ok ? "success" : "danger"}
      title={connectionTest.ok ? "Connection successful" : "Connection test failed"}>
      {connectionTest.message}{connectionTest.ok && " Credentials are stored only when you save."}
    </StatePanel>}
    <div className="runtime-form-actions">
      {!source && <Button type="button" variant="outline" pending={testing} disabled={busy} onClick={() => void testConnection()}>Test connection</Button>}
      <Button type="submit" variant="primary" pending={saving} disabled={busy}>{source ? "Save changes" : "Create DataSource"}</Button>
    </div>
    </ApplicationPageStack></form>;
  return embedded
    ? <ApplicationPageStack as="section">{header}{form}</ApplicationPageStack>
    : <ApplicationCard className="source-registration-form" header={header}>{form}</ApplicationCard>;
}
