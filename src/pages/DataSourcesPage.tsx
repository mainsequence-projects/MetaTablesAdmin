import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type SourceConfiguration, type SourceEngine, type SourceRecord } from "../api";
import { sourceDefaults, sourceEngines, switchSourceEngine } from "../sourceConfiguration";
import { Card, Facts, PageHeading, Pagination, RemoteContent, StatePanel, useDebounced, useRemote } from "../ui";

export function DataSourcesPage({ uid }: { uid: string | null }) {
  const [revision, refresh] = useState(0);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(search);
  const navigate = useNavigate();
  const remote = useRemote(`sources-${uid}-${term}-${offset}-${revision}`, signal => uid && uid !== "new"
    ? metaTablesApi.source(uid, signal).then(source => ({ count: 1, results: [source] }))
    : metaTablesApi.sources(term, offset, signal));
  if (uid === "new") return <><PageHeading eyebrow="Connections" title="Register Data Source" /><SourceEditor onSaved={source => navigate(`/data-sources/${source.uid}`)} /></>;
  return <><PageHeading eyebrow="Connections" title="Data Sources" description="Database registrations owned by this MetaTables API." actions={<Button onClick={() => navigate('/data-sources/new')}>Register source</Button>} />
    {uid && <Link to="/data-sources">All data sources</Link>}
    {actionError && <p role="alert">{actionError}</p>}
    {!uid && <Field label="Search"><Input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} /></Field>}
    <RemoteContent state={remote}>{data => uid ? <SourceDetail key={uid} source={data.results[0]} setError={setActionError} refresh={() => refresh(v => v + 1)} /> : <Card>
      <DataTable items={data.results} getId={source => source.uid} onActivateRow={source => navigate(`/data-sources/${source.uid}`)} columns={[
        { id: 'name', header: 'Name', renderCell: source => source.display_name },
        { id: 'engine', header: 'Engine', renderCell: source => source.class_type },
        { id: 'status', header: 'Status', renderCell: source => source.status },
        { id: 'access', header: 'Access', renderCell: source => source.storage_access_mode },
        { id: 'default', header: 'Default', renderCell: source => source.is_default ? 'Yes' : 'No' },
      ]} />
      <Pagination count={data.count} limit={25} offset={offset} onChange={setOffset} noun="data sources" />
    </Card>}</RemoteContent>
  </>;
}

function SourceDetail({ source, refresh, setError }: { source: SourceRecord; refresh: () => void; setError: (message: string) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setBusy(false); refresh(); }
  }
  const supportsTables = source.capabilities.includes("supports_schema_migrations");
  return <><Card title={source.display_name}><Facts items={[
    { label: 'UID', value: source.uid }, { label: 'Engine', value: source.class_type },
    { label: 'Status', value: source.status }, { label: 'Access', value: source.storage_access_mode },
    { label: 'Default', value: source.is_default ? 'Yes' : 'No' },
  ]} />{source.can_manage && <div className="toolbar">
    <Button disabled={busy || source.storage_access_mode === 'disabled'} onClick={() => void act(() => metaTablesApi.validateSource(source.uid))}>Validate connection</Button>
    <Button disabled={busy} onClick={() => void act(() => metaTablesApi.updateSource(source.uid, { storage_access_mode: source.storage_access_mode === 'disabled' ? 'read_write' : 'disabled' }))}>{source.storage_access_mode === 'disabled' ? 'Enable' : 'Disable'}</Button>
    <Button disabled={busy || !supportsTables} onClick={() => void act(() => metaTablesApi.updateSource(source.uid, { is_default: !source.is_default }))}>{source.is_default ? 'Clear default' : 'Use as default'}</Button>
    <Button disabled={busy || source.is_default} onClick={() => setConfirmDelete(true)}>Remove registration</Button>
  </div>}{confirmDelete && <StatePanel title="Remove this registration?" action={<Button disabled={busy} onClick={() => void act(async () => { await metaTablesApi.deleteSource(source.uid); navigate('/data-sources'); })}>Confirm removal</Button>}>Referenced sources cannot be removed. Database contents and platform Secrets are preserved.</StatePanel>}
  </Card>
  {source.can_manage && source.configuration && <SourceEditor key={JSON.stringify(source.configuration)} source={source} onSaved={refresh} />}
  {!supportsTables && <StatePanel title="Connection management">Registration, configuration and connection validation are supported. Table reads, writes and migrations are not yet available for this engine, so it cannot be selected as the table-workflow default.</StatePanel>}
  <Card title="Table capabilities"><ul>{source.capabilities.map(value => <li key={value}>{value.replace(/^supports_/, '').replaceAll('_', ' ')}</li>)}</ul></Card></>;
}

function SourceEditor({ source, onSaved }: { source?: SourceRecord; onSaved: (source: SourceRecord) => void }) {
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
      onSaved(source ? await metaTablesApi.updateSource(source.uid, body) : await metaTablesApi.createSource({ ...body, class_type: engine }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save source'); }
    finally { setBusy(false); }
  }
  return <Card title="Connection configuration" description="Credentials are references to platform Secrets. Secret values are never displayed here."><form onSubmit={submit}>
    <Field label="Name"><Input required value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="Engine"><select className="cc-control" aria-label="Engine" value={engine} disabled={!!source} onChange={e => {
      const next = e.target.value as SourceEngine;
      setEngine(next); setConfiguration(current => switchSourceEngine(current, next));
    }}>{sourceEngines.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
    {(engine === 'mysql' || engine === 'mssql') && <p role="note">This engine supports connection management and validation. Table operations are not yet available.</p>}
    {(['host', 'database_name', 'database_user'] as const).map(key => <Field key={key} label={key.replaceAll('_', ' ')}><Input required value={configuration[key]} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value, ...(key === 'database_name' && engine === 'mysql' ? { default_schema: e.target.value } : {}) }))} /></Field>)}
    <Field label="Default schema" description={engine === 'mysql' ? 'MySQL uses the database name as its schema.' : undefined}><Input required readOnly={engine === 'mysql'} value={configuration.default_schema} onChange={e => setConfiguration(c => ({ ...c, default_schema: e.target.value }))} /></Field>
    <Field label="Password Secret UID" description="UID of a platform Secret accessible to the MetaTables API."><Input value={configuration.password_secret_uid ?? ''} onChange={e => setConfiguration(c => ({ ...c, password_secret_uid: e.target.value || null }))} /></Field>
    <Field label="Port"><Input type="number" min={1} max={65535} required value={configuration.port} onChange={e => setConfiguration(c => ({ ...c, port: Number(e.target.value) }))} /></Field>
    {engine === 'mssql' ? <>
      <Field label="Encryption"><select className="cc-control" aria-label="Encryption" value={String(configuration.encrypt)} onChange={e => setConfiguration(c => ({ ...c, encrypt: e.target.value === 'true' }))}><option value="true">Required</option><option value="false">Optional</option></select></Field>
      <Field label="Server certificate" description="Verification uses the API server's certificate trust store."><select className="cc-control" aria-label="Server certificate" value={String(configuration.trust_server_certificate)} onChange={e => setConfiguration(c => ({ ...c, trust_server_certificate: e.target.value === 'true' }))}><option value="false">Verify certificate</option><option value="true">Trust without verification</option></select></Field>
      <p>The API server needs the MSSQL extra and Microsoft ODBC Driver 18 for SQL Server.</p>
    </> : <>
      <Field label="TLS mode"><select className="cc-control" aria-label="TLS mode" value={configuration.ssl_mode} onChange={e => setConfiguration(c => ({ ...c, ssl_mode: e.target.value }))}>{(engine === 'mysql' ? ['verify-full', 'verify-ca', 'require', 'disable'] : ['require', 'verify-ca', 'verify-full', 'prefer', 'allow', 'disable']).map(mode => <option key={mode}>{mode}</option>)}</select></Field>
      {(['tls_ca_secret_uid', 'tls_certificate_secret_uid', 'tls_key_secret_uid'] as const).map(key => <Field key={key} label={key.replaceAll('_', ' ')}><Input value={configuration[key] ?? ''} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value || null }))} /></Field>)}
      {engine === 'mysql' && <Field label="Character set"><select className="cc-control" aria-label="Character set" value={configuration.default_charset} onChange={e => setConfiguration(c => ({ ...c, default_charset: e.target.value }))}>{['utf8mb4', 'utf8', 'latin1', 'ascii'].map(charset => <option key={charset}>{charset}</option>)}</select></Field>}
    </>}
    <Field label="Storage access"><select className="cc-control" aria-label="Storage access" value={access} onChange={e => setAccess(e.target.value)}>{['read_write', 'read_only', 'disabled'].map(mode => <option key={mode}>{mode}</option>)}</select></Field>
    {error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save source'}</Button>
  </form></Card>;
}
