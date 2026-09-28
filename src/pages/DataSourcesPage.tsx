import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type SourceConfiguration, type SourceRecord } from "../api";
import { Card, Facts, PageHeading, Pagination, RemoteContent, StatePanel, useDebounced, useRemote } from "../ui";

export function DataSourcesPage({ uid }: { uid: string | null }) {
  const [revision, refresh] = useState(0);
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
    {!uid && <Field label="Search"><Input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} /></Field>}
    <RemoteContent state={remote}>{data => uid ? <SourceDetail key={`${uid}-${revision}`} source={data.results[0]} refresh={() => refresh(v => v + 1)} /> : <Card>
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

function SourceDetail({ source, refresh }: { source: SourceRecord; refresh: () => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setBusy(false); }
  }
  return <><Card title={source.display_name}><Facts items={[
    { label: 'UID', value: source.uid }, { label: 'Engine', value: source.class_type },
    { label: 'Status', value: source.status }, { label: 'Access', value: source.storage_access_mode },
    { label: 'Default', value: source.is_default ? 'Yes' : 'No' },
  ]} />{source.can_manage && <div className="toolbar">
    <Button disabled={busy || source.storage_access_mode === 'disabled'} onClick={() => void act(() => metaTablesApi.validateSource(source.uid))}>Validate connection</Button>
    <Button disabled={busy} onClick={() => void act(() => metaTablesApi.updateSource(source.uid, { storage_access_mode: source.storage_access_mode === 'disabled' ? 'read_write' : 'disabled' }))}>{source.storage_access_mode === 'disabled' ? 'Enable' : 'Disable'}</Button>
    <Button disabled={busy} onClick={() => void act(() => metaTablesApi.updateSource(source.uid, { is_default: !source.is_default }))}>{source.is_default ? 'Clear default' : 'Use as default'}</Button>
    <Button disabled={busy || source.is_default} onClick={() => setConfirmDelete(true)}>Remove registration</Button>
  </div>}{confirmDelete && <StatePanel title="Remove this registration?" action={<Button disabled={busy} onClick={() => void act(async () => { await metaTablesApi.deleteSource(source.uid); navigate('/data-sources'); })}>Confirm removal</Button>}>Referenced sources cannot be removed. Database contents and platform Secrets are preserved.</StatePanel>}
  {error && <p role="alert">{error}</p>}</Card>
  {source.can_manage && source.configuration && <SourceEditor source={source} onSaved={refresh} />}
  <Card title="Capabilities"><ul>{source.capabilities.map(value => <li key={value}>{value.replace(/^supports_/, '').replaceAll('_', ' ')}</li>)}</ul></Card></>;
}

function SourceEditor({ source, onSaved }: { source?: SourceRecord; onSaved: (source: SourceRecord) => void }) {
  const [name, setName] = useState(source?.display_name ?? '');
  const [engine, setEngine] = useState(source?.class_type ?? 'postgresql');
  const [access, setAccess] = useState(source?.storage_access_mode ?? 'read_write');
  const [configuration, setConfiguration] = useState<SourceConfiguration>(source?.configuration ?? {
    host: '', port: 5432, database_name: '', database_user: '', default_schema: 'public', ssl_mode: 'require', password_secret_uid: null,
  });
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
    <Field label="Engine"><select aria-label="Engine" value={engine} disabled={!!source} onChange={e => setEngine(e.target.value)}><option value="postgresql">PostgreSQL</option><option value="timescale_db">TimescaleDB</option></select></Field>
    {(['host', 'database_name', 'database_user', 'default_schema', 'password_secret_uid', 'tls_ca_secret_uid', 'tls_certificate_secret_uid', 'tls_key_secret_uid'] as const).map(key => <Field key={key} label={key.replaceAll('_', ' ')}><Input required={!key.endsWith('_uid')} value={configuration[key] ?? ''} onChange={e => setConfiguration(c => ({ ...c, [key]: e.target.value || null }))} /></Field>)}
    <Field label="Port"><Input type="number" min={1} max={65535} required value={configuration.port} onChange={e => setConfiguration(c => ({ ...c, port: Number(e.target.value) }))} /></Field>
    <Field label="TLS mode"><select aria-label="TLS mode" value={configuration.ssl_mode} onChange={e => setConfiguration(c => ({ ...c, ssl_mode: e.target.value }))}>{['require', 'verify-ca', 'verify-full', 'prefer', 'allow', 'disable'].map(mode => <option key={mode}>{mode}</option>)}</select></Field>
    <Field label="Storage access"><select aria-label="Storage access" value={access} onChange={e => setAccess(e.target.value)}>{['read_write', 'read_only', 'disabled'].map(mode => <option key={mode}>{mode}</option>)}</select></Field>
    {error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save source'}</Button>
  </form></Card>;
}
