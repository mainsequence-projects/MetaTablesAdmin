import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel, sourceEnginePickerIcon } from "./DataSourceTypeIcon";
import { adminPaths } from "./navigation";
import { useRuntimeContext } from "./runtimeContext";
import { runtimeMigrationStatus } from "./runtimeMigrationStatus";
import { sourceEngines } from "./sourceConfiguration";
import { RuntimeMigrations } from "./runtimeMigrations";
import { Badge, Picker, useRemote } from "./ui";

export function RuntimeHostedSourceSelection({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate();
  const { runtime, refresh } = useRuntimeContext();
  const bootstrap = runtime.local_mode ? runtime.hosted_bootstrap : runtime.bootstrap;
  const [selectedUid, setSelectedUid] = useState(bootstrap?.selected_source_uid ?? "");
  const [revision, setRevision] = useState(0);
  const sources = useRemote(`runtime-source-candidates-${revision}`, signal => metaTablesApi.runtimeSources("", 0, signal, 500));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = pending || disabled;
  const choices = sources.status === "ready" ? sources.data.results.filter(source =>
    sourceEngines.some(engine => engine.value === source.class_type) && source.storage_access_mode === "read_write") : [];
  const selected = choices.find(source => source.uid === selectedUid);
  const status = bootstrap?.active ? "Active" : bootstrap?.status === "ready" ? "Ready" : bootstrap?.status === "migration_required"
    ? "Migrations needed" : bootstrap?.status === "registration_required" ? "Registration needed" : "Selection needed";
  const migrationStatus = bootstrap ? runtimeMigrationStatus(bootstrap) : null;
  async function perform(action: () => Promise<unknown>) {
    setPending(true); setError("");
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "DataSource selection failed."); }
    finally { setPending(false); }
  }
  return <ApplicationPageStack as="section" aria-label="Hosted runtime DataSource">
    <ApplicationPageHeader title="2. DataSource" titleAs="h3"
      description="Register connections in Data Sources, then select one here for the hosted runtime. Selection and runtime switching are separate actions."
      actions={<Badge tone={bootstrap?.active ? "success" : bootstrap?.error ? "danger" : "neutral"}>{status}</Badge>} />
    {sources.status === "error" && <p role="alert">Unable to load registered DataSources: {sources.error.message}</p>}
    {sources.status === "loading" && <p className="muted">Loading registered DataSources…</p>}
    {sources.status === "ready" && choices.length === 0 && <p className="muted">No eligible hosted DataSources are registered yet. Add a hosted connection in Data Sources, then return here to select it.</p>}
    <Field label="Hosted DataSource" description="Registered hosted connections with read/write access are available for this runtime.">
      <Picker fullWidth ariaLabel="Hosted DataSource" disabled={busy || sources.status !== "ready"}
        value={selectedUid} options={[{ value: "", label: "Select a registered DataSource" },
          ...choices.map(source => ({ value: source.uid, label: `${source.display_name} · ${sourceEngineLabel(source.class_type)} · ${source.status}`, icon: sourceEnginePickerIcon(source.class_type) }))]}
        renderValue={selectedOptions => selected
          ? <span className="data-source-picker-value"><DataSourceTypeIcon engine={selected.class_type} />{selectedOptions[0]?.label ?? selected.display_name}</span>
          : selectedOptions[0]?.label ?? "Select a registered DataSource"}
        onValueChange={setSelectedUid} />
    </Field>
    <div className="runtime-form-actions">
      <Button onClick={() => navigate(`${adminPaths.dataSources}/new?scope=runtime`)}>Add DataSource</Button>
      <Button disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh list</Button>
      <Button variant="primary" pending={pending} disabled={busy || !selected}
        onClick={() => void perform(() => metaTablesApi.selectHostedSource(selectedUid, runtime.local_mode))}>Select DataSource</Button>
    </div>
    {error && <p role="alert"><Badge tone="danger">Selection failed</Badge> {error}</p>}
    {bootstrap?.error && <p role="alert">{bootstrap.error}</p>}
    {bootstrap?.candidate && <p><span className="data-source-picker-value"><DataSourceTypeIcon engine={bootstrap.candidate.class_type} />
      <strong>Selected:</strong> {bootstrap.candidate.display_name} · {sourceEngineLabel(bootstrap.candidate.class_type)}</span>
      {runtime.local_mode && <><br />The local runtime remains active until you choose Switch to Hosted.</>}</p>}
    {!runtime.local_mode && bootstrap && !bootstrap.active && bootstrap.status === "ready" &&
      <div><Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.activateRuntimeSource)}>Use this DataSource</Button></div>}
    {!runtime.local_mode && bootstrap && !bootstrap.active && bootstrap.status === "registration_required" && migrationStatus !== "pending" &&
      <div><Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.migrateRuntimeSource)}>Finish DataSource setup</Button></div>}
    {bootstrap?.candidate && <RuntimeMigrations bootstrap={bootstrap} editing={false} disabled={busy} pending={pending}
      onApply={runtime.local_mode ? undefined : () => void perform(metaTablesApi.migrateRuntimeSource)} />}
  </ApplicationPageStack>;
}
