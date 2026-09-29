import { useState } from "react";
import { Database } from "lucide-react";
import { Button, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { RuntimeDataSourceSetup } from "../runtimeDataSourceSetup";
import { RuntimeHostedSourceSelection } from "../RuntimeHostedSourceSelection";
import { DataSourceTypeIcon, sourceEnginePickerIcon } from "../DataSourceTypeIcon";
import { useRuntimeContext } from "../runtimeContext";
import { Badge, Card, PageHeading, Picker } from "../ui";

export function SettingsPage() {
  const { runtime, refresh, switchMode, switchError } = useRuntimeContext();
  const [mode, setMode] = useState<"local" | "hosted">(runtime.local_mode ? "local" : "hosted");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const environment = runtime.local_mode ? runtime.hosted_environment_target : runtime.hosted_environment;
  const hostedEngine = runtime.hosted_bootstrap?.candidate?.class_type ?? (!runtime.local_mode ? runtime.data_source?.class_type : null);
  const activeMode = runtime.local_mode ? "local" : "hosted";
  const modeChanged = mode !== activeMode;
  const canSwitch = runtime.local_mode_available && runtime.runtime_switch_available;
  const hostedSourceSelected = Boolean(runtime.hosted_bootstrap?.selected_source_uid);
  const switchNeedsSource = modeChanged && mode === "hosted" && !hostedSourceSelected;
  async function check() {
    setBusy(true); setError("");
    try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Runtime check failed"); }
    finally { setBusy(false); }
  }
  return <ApplicationPageStack>
    <PageHeading eyebrow="Application" title="Settings" description="Configure how MetaTables runs and where it stores data."
      actions={<Button pending={busy} disabled={busy} onClick={() => void check()}>Refresh runtime</Button>} />
    <Card title="Runtime" description="Choose the API runtime mode, then set up the DataSource it will use.">
      {error && <p role="alert"><Badge tone="danger">Runtime check failed</Badge> {error}</p>}
      <ApplicationPageStack as="section" aria-label="API runtime mode">
        <ApplicationPageHeader title="1. API runtime mode" titleAs="h3"
          description="Local uses the workspace database. Hosted connects to a registered DataSource."
          actions={<Badge tone="success">{runtime.local_mode ? "Local" : "Hosted"} active</Badge>} />
        <ApplicationCardGrid>
          {canSwitch && <Field label="Runtime mode" description={modeChanged ? "Selecting a mode prepares its settings. Switching later restarts the API." : "Already active. Continue with the DataSource below."} error={switchError || undefined}>
          <Picker fullWidth ariaLabel="Runtime mode" value={mode} disabled={busy}
            options={[{ value: "local", label: "Local — workspace SQLite", icon: sourceEnginePickerIcon("sqlite") },
              { value: "hosted", label: `Hosted — ${environment?.name ?? environment?.uid ?? "configured databases"}`, icon: hostedEngine ? sourceEnginePickerIcon(hostedEngine) : Database }]}
            renderValue={selected => <span className="data-source-picker-value">
              <DataSourceTypeIcon engine={mode === "local" ? "sqlite" : hostedEngine ?? ""} />{selected[0]?.label}
            </span>}
            onValueChange={value => setMode(value as "local" | "hosted")} />
          </Field>}
          <ApplicationPageStack>
            <p className="muted">API endpoint<br /><span className="mono">{runtime.api_endpoint}</span>
              {mode === "hosted" && <><br />Environment: <strong>{environment?.name ?? environment?.uid ?? "Not configured"}</strong>
                {environment?.is_production && <> · <Badge tone="warning">Production</Badge></>}
                {environment?.required_repository_branch && <><br />Branch: <span className="mono">{environment.required_repository_branch}</span></>}
              </>}
            </p>
            {mode === "hosted" && <>
              {environment?.status !== "verified" && <p role="alert">{environment?.status === "not_found" ? "The configured hosted Environment does not exist."
          : environment?.status === "not_configured" ? "No Environment is assigned to this API's repository branch."
          : runtime.local_mode && runtime.hosted_environment_target === undefined ? "Restart the developer API, then refresh runtime to load its hosted Environment."
          : "The API could not verify its hosted Environment. Check its platform connection and deployment configuration."}</p>}
            </>}
          </ApplicationPageStack>
        </ApplicationCardGrid>
        {!canSwitch && <p className="muted">This mode is active. Runtime switching is managed by the API launch configuration.</p>}
      </ApplicationPageStack>
      {mode === "hosted" ? <RuntimeHostedSourceSelection disabled={busy} /> : modeChanged
        ? <ApplicationPageHeader title="2. DataSource" titleAs="h3" description="Switch to Local to manage its workspace database." />
        : <RuntimeDataSourceSetup key={mode} mode="local" disabled={busy} />}
      {modeChanged && canSwitch && <div>{switchNeedsSource && <p className="muted">Select a hosted DataSource above before switching the API runtime.</p>}
        <Button variant="primary" pending={busy} disabled={busy || switchNeedsSource}
        onClick={() => { setBusy(true); void switchMode(mode).finally(() => setBusy(false)); }}>
        Switch to {mode === "local" ? "Local" : "Hosted"}
      </Button></div>}
    </Card>
  </ApplicationPageStack>;
}
