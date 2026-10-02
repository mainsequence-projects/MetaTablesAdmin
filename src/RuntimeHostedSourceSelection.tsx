import { useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi, type RuntimeContext } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel, sourceEnginePickerIcon } from "./DataSourceTypeIcon";
import { useRuntimeContext } from "./runtimeContext";
import { runtimeMigrationStatus } from "./runtimeMigrationStatus";
import { sourceEngines } from "./sourceConfiguration";
import { RuntimeMigrations } from "./runtimeMigrations";
import { Badge, Picker, useRemote } from "./ui";

// Activation gives the API a new instance, and the runtime context remounts
// every view when that changes. An action's progress and outcome therefore live
// outside the component so they survive that remount.
type Outcome = { working: string; notice: string; error: { label: string; message: string } | null };
let outcome: Outcome = { working: "", notice: "", error: null };
const listeners = new Set<() => void>();
function setOutcome(next: Partial<Outcome>) {
  outcome = { ...outcome, ...next };
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function RuntimeHostedSourceSelection({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate();
  const { runtime, refresh } = useRuntimeContext();
  const bootstrap = runtime.bootstrap;
  const [selectedUid, setSelectedUid] = useState(bootstrap?.selected_source_uid ?? "");
  const [revision, setRevision] = useState(0);
  const sources = useRemote(`data-sources-${revision}`, signal => metaTablesApi.sources("", 0, signal, 500));
  const { working, notice, error } = useSyncExternalStore(subscribe, () => outcome);
  const pending = Boolean(working);
  const busy = pending || disabled;
  const choices = sources.status === "ready" ? sources.data.results.filter(source =>
    sourceEngines.some(engine => engine.value === source.class_type) && source.storage_access_mode === "read_write") : [];
  const selected = choices.find(source => source.uid === selectedUid);
  const status = bootstrap?.active ? "Active" : bootstrap?.status === "ready" ? "Ready" : bootstrap?.status === "migration_required"
    ? "Migrations needed" : bootstrap?.status === "registration_required" ? "Registration needed"
    : bootstrap?.status === "incompatible" ? "Needs attention" : bootstrap?.status === "unavailable" ? "Unavailable"
    : bootstrap?.status === "migrating" ? "Migrating" : "Selection needed";
  const migrationStatus = bootstrap ? runtimeMigrationStatus(bootstrap) : null;
  // A gateway can end a long request while the API finishes it, so a failed
  // request is judged by the runtime's state once any migration has settled.
  async function settle(): Promise<RuntimeContext | null> {
    const deadline = Date.now() + 15 * 60 * 1000;
    for (;;) {
      const current = await refresh().catch(() => null);
      if ((current && current.bootstrap?.status !== "migrating") || Date.now() > deadline) return current;
      await new Promise(resolve => window.setTimeout(resolve, 5000));
    }
  }
  // Every action shows that it is running and then its outcome.
  async function perform(action: () => Promise<unknown>, labels: { working: string; failed: string; done: string },
    succeeded: (current: RuntimeContext) => boolean) {
    setOutcome({ working: labels.working, notice: "", error: null });
    try { await action(); setOutcome({ working: "", notice: labels.done }); await refresh(); }
    catch (cause) {
      const current = await settle();
      if (current && succeeded(current)) setOutcome({ working: "", notice: labels.done });
      else setOutcome({ working: "", error: { label: labels.failed, message: cause instanceof Error ? cause.message : `${labels.failed}.` } });
    }
  }
  const activated = (current: RuntimeContext) => current.bootstrap?.active === true;
  const remote = "Over a remote database connection this can take several minutes; keep this page open.";
  return <ApplicationPageStack as="section" aria-label="Hosted runtime DataSource">
    <ApplicationPageHeader title="2. DataSource" titleAs="h3"
      description="Register a hosted database in Data Sources, then select it here for this runtime."
      actions={<Badge tone={bootstrap?.active ? "success" : bootstrap?.error ? "danger" : "neutral"}>{status}</Badge>} />
    {sources.status === "error" && <p role="alert">Unable to load registered DataSources: {sources.error.message}</p>}
    {sources.status === "loading" && <p className="muted">Loading registered DataSources…</p>}
    {sources.status === "ready" && choices.length === 0 && <p className="muted">No eligible hosted DataSources are registered yet. Add a DataSource in Data Sources, then return here to select it.</p>}
    <Field label="Hosted DataSource" description="Registered DataSources with read/write access are available for this runtime.">
      <Picker fullWidth ariaLabel="Hosted DataSource" disabled={busy || sources.status !== "ready"}
        value={selectedUid} options={[{ value: "", label: "Select a registered DataSource" },
          ...choices.map(source => ({ value: source.uid, label: `${source.display_name} · ${sourceEngineLabel(source.class_type)} · ${source.status}`, icon: sourceEnginePickerIcon(source.class_type) }))]}
        renderValue={selectedOptions => selected
          ? <span className="data-source-picker-value"><DataSourceTypeIcon engine={selected.class_type} />{selectedOptions[0]?.label ?? selected.display_name}</span>
          : selectedOptions[0]?.label ?? "Select a registered DataSource"}
        onValueChange={setSelectedUid} />
    </Field>
    <div className="runtime-form-actions">
      <Button onClick={() => navigate("/data-sources/new")}>Add DataSource</Button>
      <Button disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh list</Button>
      <Button variant="primary" pending={pending} disabled={busy || !selected}
        onClick={() => void perform(() => metaTablesApi.selectHostedSource(selectedUid), {
          working: "Selecting the DataSource and checking its database…", failed: "Selection failed",
          done: `${selected?.display_name ?? "The DataSource"} is selected for this runtime. Complete its setup below.` },
          current => current.bootstrap?.selected_source_uid === selectedUid)}>Select DataSource</Button>
    </div>
    {working && <p role="status"><Badge tone="warning">In progress</Badge> {working}</p>}
    {notice && <p role="status"><Badge tone="success">Done</Badge> {notice}</p>}
    {error && <p role="alert"><Badge tone="danger">{error.label}</Badge> {error.message}</p>}
    {bootstrap?.error && bootstrap.error !== error?.message && <p role="alert"><Badge tone="danger">{bootstrap.status === "incompatible" ? "Needs attention" : "Setup failed"}</Badge> {bootstrap.error}</p>}
    {bootstrap?.candidate && <p><span className="data-source-picker-value"><DataSourceTypeIcon engine={bootstrap.candidate.class_type} />
      <strong>Selected:</strong> {bootstrap.candidate.display_name} · {sourceEngineLabel(bootstrap.candidate.class_type)}</span></p>}
    {bootstrap && !bootstrap.active && bootstrap.status === "ready" &&
      <div><Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.activateRuntimeSource, {
        working: "Activating the runtime DataSource…", failed: "Activation failed", done: "The runtime DataSource is active." },
        activated)}>Use this DataSource</Button></div>}
    {bootstrap && !bootstrap.active && bootstrap.status === "registration_required" && migrationStatus !== "pending" &&
      <div><Button variant="primary" pending={pending} disabled={busy} onClick={() => void perform(metaTablesApi.migrateRuntimeSource, {
        working: `Finishing DataSource setup. ${remote}`, failed: "Setup failed",
        done: "DataSource setup finished; the runtime is active." }, activated)}>Finish DataSource setup</Button></div>}
    {bootstrap?.candidate && <RuntimeMigrations bootstrap={bootstrap} editing={false} disabled={busy} pending={pending}
      onApply={() => void perform(metaTablesApi.migrateRuntimeSource, {
        working: `Running MetaTables migrations. ${remote}`, failed: "Migrations failed",
        done: "MetaTables migrations applied; the runtime is active." }, activated)} />}
  </ApplicationPageStack>;
}
