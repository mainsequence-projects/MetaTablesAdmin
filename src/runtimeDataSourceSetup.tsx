import { useState } from "react";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ResourceActionConfirmationDialog } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type RuntimeSourceInput } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel, sourceEnginePickerIcon } from "./DataSourceTypeIcon";
import { useRuntimeContext } from "./runtimeContext";
import { runtimeMigrationStatus } from "./runtimeMigrationStatus";
import { RuntimeMigrations } from "./runtimeMigrations";
import { Badge, Picker } from "./ui";
import { sourceEngines, switchSourceEngine, type SourceEngine, type SourceConfiguration } from "./sourceConfiguration";

export function RuntimeDataSourceSetup({ disabled = false, mode }: { disabled?: boolean; mode: "local" | "hosted" }) {
  const { runtime, refresh } = useRuntimeContext();
  const preparingHosted = mode === "hosted" && runtime.local_mode;
  const localTarget = mode === "local";
  const bootstrap = preparingHosted ? runtime.hosted_bootstrap : runtime.bootstrap;
  const candidate = bootstrap?.candidate;
  const [name, setName] = useState(candidate?.display_name ?? (preparingHosted ? null : runtime.data_source?.display_name) ?? (localTarget ? "Local MetaTables" : "MetaTables"));
  const [kind, setKind] = useState<RuntimeSourceInput["class_type"]>(candidate?.class_type ?? (localTarget ? "sqlite" : "postgresql"));
  const [configuration, setConfiguration] = useState<Record<string, string | number | boolean | null>>(candidate?.configuration ?? {
    host: "", port: 5432, database_name: "", database_user: "", default_schema: "public", ssl_mode: "require", password_secret_uid: null,
  });
  const [pending, setPending] = useState(false);
  const busy = pending || disabled;
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [editing, setEditing] = useState(bootstrap?.can_configure !== false && !candidate && (preparingHosted || !runtime.data_source));
  const [showTls, setShowTls] = useState(false);
  const [showDetails, setShowDetails] = useState(bootstrap?.status === "incompatible");
  const selectedPath = candidate?.class_type === "sqlite" && typeof candidate.configuration.path === "string" ? candidate.configuration.path : null;
  const displayedKind = localTarget ? "sqlite" : candidate?.class_type ?? (preparingHosted ? null : runtime.data_source?.class_type) ?? kind;
  const active = !preparingHosted && (bootstrap?.active ?? (!!runtime.data_source && !runtime.data_source_error));
  const canConfigure = bootstrap?.can_configure !== false;
  const needsInitialization = bootstrap?.status === "migration_required" || bootstrap?.status === "registration_required";
  const migrationStatus = bootstrap ? runtimeMigrationStatus(bootstrap) : null;
  const migrationsPending = migrationStatus === "pending";
  const status = active ? "Active" : preparingHosted && candidate && bootstrap?.status === "ready" ? "Ready to switch" : ({
    unconfigured: "Setup needed", migration_required: "Initialization needed", registration_required: "Registration needed",
    migrating: "Initializing", ready: "Ready to use", incompatible: "Needs attention", unavailable: "Unavailable",
  }[bootstrap?.status ?? "unconfigured"]);
  const change = (key: string, value: string) => {
    setDirty(true);
    setConfiguration(current => ({ ...current, ...(key === "database_name" && kind === "mysql" ? { default_schema: value } : {}), [key]: key === "port" ? Number(value) : key === "encrypt" || key === "trust_server_certificate" ? value === "true" : key.endsWith("_uid") ? value || null : value }));
  };
  async function perform(action: () => Promise<unknown>) {
    setPending(true); setError("");
    try { await action(); setDirty(false); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Runtime configuration failed"); }
    finally {
      try { await refresh(); } catch { setError("Unable to refresh runtime status. Check the API connection."); }
      setPending(false);
    }
  }
  function input(key: string, label: string, description?: string) {
    return <Field key={key} label={label} description={description}>
      <Input aria-label={label} disabled={busy} value={String(configuration[key] ?? "")}
        type={key === "port" ? "number" : "text"} onChange={event => change(key, event.target.value)} />
    </Field>;
  }
  return <ApplicationPageStack as="section" aria-label="Runtime DataSource">
      <ApplicationPageHeader title="2. DataSource" titleAs="h3"
        description={preparingHosted
          ? editing ? "Enter a hosted database connection, then check and save it without switching the API."
            : "Hosted DataSource configuration is separate from the runtime switch. Switch modes when you are ready."
          : editing ? "Enter the database connection, then check it to continue."
          : active ? migrationsPending ? "This database is active. Apply the pending migrations below to bring it up to date."
            : migrationStatus && migrationStatus !== "up_to_date" ? "This DataSource is active. Review the migration comparison below."
            : "This database stores MetaTables' system tables and your table data. Your runtime is ready to use."
          : bootstrap?.status === "registration_required" ? "The migrations are applied. Finish registering this DataSource to activate it."
          : needsInitialization ? "Run MetaTables migrations to initialize this database and finish Runtime setup."
          : bootstrap?.status === "ready" ? "The database is initialized. Activate it to finish Runtime setup."
          : "Review this database's configuration to continue Runtime setup."}
        actions={<Badge tone={active ? "success" : bootstrap?.error ? "danger" : "neutral"}>{status}</Badge>} />
      {bootstrap?.error && <p role="alert"><Badge tone="danger">Database not ready</Badge> {bootstrap.error}</p>}
      {!bootstrap && !preparingHosted && runtime.data_source_error && <p className="muted">Complete DataSource setup below to enable table and update workflows.</p>}
      {error && <p role="alert"><Badge tone="danger">Configuration failed</Badge> {error}</p>}
      {!editing && <>
        <p><span className="data-source-picker-value"><DataSourceTypeIcon engine={displayedKind} />
          <strong>{candidate?.display_name ?? (preparingHosted ? null : runtime.data_source?.display_name) ?? name}</strong> · {sourceEngineLabel(displayedKind)}
        </span>
          {candidate && <><br /><span className="mono muted">{localTarget ? selectedPath : `${candidate.configuration.host}:${candidate.configuration.port} / ${candidate.configuration.database_name}`}</span></>}</p>
        {canConfigure ? <div className="runtime-form-actions">
          {!preparingHosted && bootstrap && !bootstrap.active && !dirty && bootstrap.status === "registration_required" && !migrationsPending && <>
            <Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.migrateRuntimeSource)}>Finish DataSource setup</Button>
          </>}
          {!preparingHosted && bootstrap && !bootstrap.active && !dirty && bootstrap.status === "ready" && <>
            <Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.activateRuntimeSource)}>Use this DataSource</Button>
          </>}
          <Button disabled={busy} onClick={() => setEditing(true)}>Edit configuration</Button>
        </div> : <p className="muted">This DataSource is managed by its configuring user.</p>}
      </>}
      {editing && canConfigure && <>
      <p className="data-source-picker-value"><DataSourceTypeIcon engine={kind} />{sourceEngineLabel(kind)}</p>
      <ApplicationCardGrid>
      <Field label="DataSource name" required><Input aria-label="DataSource name" disabled={busy} value={name}
        onChange={event => { setDirty(true); setName(event.target.value); }} /></Field>
      {!localTarget && <Field label="Database engine"><Picker fullWidth ariaLabel="Database engine" disabled={busy} value={kind}
        onValueChange={value => { setDirty(true); setKind(value as SourceEngine); setConfiguration(switchSourceEngine(configuration as SourceConfiguration, value as SourceEngine)); }}
        options={sourceEngines.map(item => ({ ...item, icon: sourceEnginePickerIcon(item.value) }))}
        renderValue={selected => <span className="data-source-picker-value"><DataSourceTypeIcon engine={kind} />{selected[0]?.label}</span>} /></Field>}
      {localTarget ? input("path", "SQLite file", "One persistent file for this workspace's complete runtime.") : <>
        {input("host", "Host")}{input("port", "Port")}{input("database_name", "Database")}{input("database_user", "Database user")}
        {input("password_secret_uid", "Password Secret UID", "Reference an existing platform Secret; do not enter its password.")}
        {kind === "mssql" ? <>
          <Field label="Encrypt connection"><Picker ariaLabel="Encrypt connection" value={String(configuration.encrypt ?? true)}
            options={[{value:"true",label:"Yes"},{value:"false",label:"No"}]} onValueChange={value => change("encrypt", value)} /></Field>
          <Field label="Trust server certificate"><Picker ariaLabel="Trust server certificate" value={String(configuration.trust_server_certificate ?? false)}
            options={[{value:"false",label:"Verify certificate"},{value:"true",label:"Trust certificate"}]} onValueChange={value => change("trust_server_certificate", value)} /></Field>
        </> : <Field label="TLS mode"><Picker fullWidth ariaLabel="TLS mode" disabled={busy} value={String(configuration.ssl_mode ?? "require")}
          onValueChange={value => change("ssl_mode", value)}
          options={["require", "verify-ca", "verify-full", "disable"].map(mode => ({ value: mode, label: mode }))} /></Field>}
      </>}
      </ApplicationCardGrid>
      {!localTarget && kind !== "mssql" && <>
        <div><Button variant="ghost" size="small" aria-expanded={showTls} disabled={busy} onClick={() => setShowTls(value => !value)}>{showTls ? "Hide" : "Show"} TLS certificates</Button></div>
        {showTls && <ApplicationCardGrid>
          {input("tls_ca_secret_uid", "CA certificate Secret UID")}
          {input("tls_certificate_secret_uid", "Client certificate Secret UID")}
          {input("tls_key_secret_uid", "Client key Secret UID")}
        </ApplicationCardGrid>}
      </>}
      <div className="runtime-form-actions"><Button variant="primary" pending={pending} disabled={busy} onClick={() => {
        if (!name.trim()) { setError("Enter a DataSource name before checking the connection."); return; }
        void perform(() => metaTablesApi.configureRuntimeSource({ display_name: name, class_type: kind, configuration }));
      }}>
        {preparingHosted ? "Check and save hosted DataSource" : "Check DataSource"}
      </Button>{candidate && <Button disabled={busy} onClick={() => {
        setName(candidate.display_name); setKind(candidate.class_type); setConfiguration(candidate.configuration);
        setDirty(false); setError(""); setEditing(false);
      }}>Cancel</Button>}</div>
      </>}
      {bootstrap && <RuntimeMigrations bootstrap={bootstrap} editing={editing || dirty} disabled={busy}
        pending={pending} onApply={preparingHosted ? undefined : () => void perform(metaTablesApi.migrateRuntimeSource)} />}
      {canConfigure && localTarget && selectedPath && <>
        <div><Button variant="ghost" size="small" aria-expanded={showDetails} onClick={() => setShowDetails(value => !value)}>{showDetails ? "Hide advanced options" : "Advanced database options"}</Button></div>
      </>}
      {showDetails && canConfigure && localTarget && selectedPath && <>
        <ApplicationPageHeader title="Reset local database" titleAs="h3"
          description={dirty ? "Check your edited configuration before resetting the database." : "Permanently delete this workspace's database. Initialization is required afterwards."}
          actions={<Button variant="outline" size="small" disabled={busy || dirty} onClick={() => {
          setError(""); setConfirmation(""); setDestroying(true);
        }}>Destroy local database</Button>} />
        {destroying && <ResourceActionConfirmationDialog
          title="Destroy local database" actionLabel="Destroy local database" tone="danger" presentation="auto"
          description={<>Delete the database at <strong>{selectedPath}</strong> and any older local database files belonging to this workspace.</>}
          warning="All system records and table data in these local files will be permanently deleted."
          confirmationWord="DESTROY" confirmationValue={confirmation} onConfirmationValueChange={setConfirmation}
          confirmButtonLabel="Destroy local database" pending={busy} error={error || undefined}
          onClose={() => { if (!busy) setDestroying(false); }}
          onConfirm={() => perform(async () => {
            await metaTablesApi.destroyLocalRuntime(selectedPath, confirmation);
            setDestroying(false);
          })} />}
      </>}
  </ApplicationPageStack>;
}
