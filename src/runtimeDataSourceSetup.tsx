import { useState } from "react";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ResourceActionConfirmationDialog } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel } from "./DataSourceTypeIcon";
import { useRuntimeContext } from "./runtimeContext";
import { runtimeMigrationStatus } from "./runtimeMigrationStatus";
import { RuntimeMigrations } from "./runtimeMigrations";
import { Badge } from "./ui";

/** Local mode: the workspace's SQLite file, configured and initialized from Settings. */
export function RuntimeDataSourceSetup({ disabled = false }: { disabled?: boolean }) {
  const { runtime, refresh } = useRuntimeContext();
  const bootstrap = runtime.bootstrap;
  const candidate = bootstrap?.candidate;
  const [name, setName] = useState(candidate?.display_name ?? runtime.data_source?.display_name ?? "Local MetaTables");
  const [configuration, setConfiguration] = useState<Record<string, string | number | boolean | null>>(candidate?.configuration ?? { path: "" });
  const [pending, setPending] = useState(false);
  const busy = pending || disabled;
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [editing, setEditing] = useState(bootstrap?.can_configure !== false && !candidate && !runtime.data_source);
  const [showDetails, setShowDetails] = useState(bootstrap?.status === "incompatible");
  const selectedPath = candidate?.class_type === "sqlite" && typeof candidate.configuration.path === "string" ? candidate.configuration.path : null;
  const active = bootstrap?.active ?? (!!runtime.data_source && !runtime.data_source_error);
  const canConfigure = bootstrap?.can_configure !== false;
  const needsInitialization = bootstrap?.status === "migration_required" || bootstrap?.status === "registration_required";
  const migrationStatus = bootstrap ? runtimeMigrationStatus(bootstrap) : null;
  const migrationsPending = migrationStatus === "pending";
  const status = active ? "Active" : ({
    unconfigured: "Setup needed", migration_required: "Initialization needed", registration_required: "Registration needed",
    migrating: "Initializing", ready: "Ready to use", incompatible: "Needs attention", unavailable: "Unavailable",
  }[bootstrap?.status ?? "unconfigured"]);
  async function perform(action: () => Promise<unknown>) {
    setPending(true); setError("");
    try { await action(); setDirty(false); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Runtime configuration failed"); }
    finally {
      try { await refresh(); } catch { setError("Unable to refresh runtime status. Check the API connection."); }
      setPending(false);
    }
  }
  return <ApplicationPageStack as="section" aria-label="Runtime DataSource">
      <ApplicationPageHeader title="2. DataSource" titleAs="h3"
        description={editing ? "Enter the database connection, then check it to continue."
          : active ? migrationsPending ? "This database is active. Apply the pending migrations below to bring it up to date."
            : migrationStatus && migrationStatus !== "up_to_date" ? "This DataSource is active. Review the migration comparison below."
            : "This database stores MetaTables' system tables and your table data. Your runtime is ready to use."
          : bootstrap?.status === "registration_required" ? "The migrations are applied. Finish registering this DataSource to activate it."
          : needsInitialization ? "Run MetaTables migrations to initialize this database and finish Runtime setup."
          : bootstrap?.status === "ready" ? "The database is initialized. Activate it to finish Runtime setup."
          : "Review this database's configuration to continue Runtime setup."}
        actions={<Badge tone={active ? "success" : bootstrap?.error ? "danger" : "neutral"}>{status}</Badge>} />
      {bootstrap?.error && <p role="alert"><Badge tone="danger">Database not ready</Badge> {bootstrap.error}</p>}
      {!bootstrap && runtime.data_source_error && <p className="muted">Complete DataSource setup below to enable table and update workflows.</p>}
      {error && <p role="alert"><Badge tone="danger">Configuration failed</Badge> {error}</p>}
      {!editing && <>
        <p><span className="data-source-picker-value"><DataSourceTypeIcon engine="sqlite" />
          <strong>{candidate?.display_name ?? runtime.data_source?.display_name ?? name}</strong> · {sourceEngineLabel("sqlite")}
        </span>
          {candidate && <><br /><span className="mono muted">{selectedPath}</span></>}</p>
        {canConfigure ? <div className="runtime-form-actions">
          {bootstrap && !bootstrap.active && !dirty && bootstrap.status === "registration_required" && !migrationsPending && <>
            <Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.migrateRuntimeSource)}>Finish DataSource setup</Button>
          </>}
          {bootstrap && !bootstrap.active && !dirty && bootstrap.status === "ready" && <>
            <Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.activateRuntimeSource)}>Use this DataSource</Button>
          </>}
          <Button disabled={busy} onClick={() => setEditing(true)}>Edit configuration</Button>
        </div> : <p className="muted">This DataSource is managed by its configuring user.</p>}
      </>}
      {editing && canConfigure && <>
      <p className="data-source-picker-value"><DataSourceTypeIcon engine="sqlite" />{sourceEngineLabel("sqlite")}</p>
      <ApplicationCardGrid>
      <Field label="DataSource name" required><Input aria-label="DataSource name" disabled={busy} value={name}
        onChange={event => { setDirty(true); setName(event.target.value); }} /></Field>
      <Field label="SQLite file" description="One persistent file for this workspace's complete runtime.">
        <Input aria-label="SQLite file" disabled={busy} value={String(configuration.path ?? "")}
          onChange={event => { setDirty(true); setConfiguration(current => ({ ...current, path: event.target.value })); }} />
      </Field>
      </ApplicationCardGrid>
      <div className="runtime-form-actions"><Button variant="primary" pending={pending} disabled={busy} onClick={() => {
        if (!name.trim()) { setError("Enter a DataSource name before checking the connection."); return; }
        void perform(() => metaTablesApi.configureRuntimeSource({ display_name: name, class_type: "sqlite", configuration }));
      }}>
        Check DataSource
      </Button>{candidate && <Button disabled={busy} onClick={() => {
        setName(candidate.display_name); setConfiguration(candidate.configuration);
        setDirty(false); setError(""); setEditing(false);
      }}>Cancel</Button>}</div>
      </>}
      {bootstrap && <RuntimeMigrations bootstrap={bootstrap} editing={editing || dirty} disabled={busy}
        pending={pending} onApply={() => void perform(metaTablesApi.migrateRuntimeSource)} />}
      {canConfigure && selectedPath && <>
        <div><Button variant="ghost" size="small" aria-expanded={showDetails} onClick={() => setShowDetails(value => !value)}>{showDetails ? "Hide advanced options" : "Advanced database options"}</Button></div>
      </>}
      {showDetails && canConfigure && selectedPath && <>
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
