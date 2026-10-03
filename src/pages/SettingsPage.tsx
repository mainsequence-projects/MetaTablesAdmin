import { useState } from "react";
import { Database } from "lucide-react";
import { Button, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { RuntimeDataSourceSetup } from "../runtimeDataSourceSetup";
import { RuntimeDeploymentDatabase } from "../runtimeDeploymentDatabase";
import { DataSourceTypeIcon, sourceEnginePickerIcon } from "../DataSourceTypeIcon";
import { useRuntimeContext } from "../runtimeContext";
import { Badge, Card, PageHeading, Picker, StatePanel } from "../ui";

export function SettingsPage() {
  const { runtime, refresh, switchMode, switchError } = useRuntimeContext();
  const [mode, setMode] = useState<"local" | "hosted">(runtime.local_mode ? "local" : "hosted");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const environment = runtime.local_mode ? runtime.hosted_environment_target : runtime.hosted_environment;
  const hostedEngine = !runtime.local_mode ? runtime.bootstrap?.declaration?.engine ?? runtime.bootstrap?.candidate?.class_type ?? runtime.data_source?.class_type : null;
  const activeMode = runtime.local_mode ? "local" : "hosted";
  const modeChanged = mode !== activeMode;
  const canSwitch = runtime.local_mode_available && runtime.runtime_switch_available;
  async function check() {
    setBusy(true); setError("");
    try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Runtime check failed"); }
    finally { setBusy(false); }
  }
  return <ApplicationPageStack>
    <PageHeading eyebrow="Application" title="Settings" description="Configure how MetaTables runs and where it stores data."
      actions={<Button pending={busy} disabled={busy} onClick={() => void check()}>Refresh runtime</Button>} />
    <Card title="Runtime" description="Choose the API runtime mode, then review the database it uses.">
      {error && <p role="alert"><Badge tone="danger">Runtime check failed</Badge> {error}</p>}
      <ApplicationPageStack as="section" aria-label="API runtime mode">
        <ApplicationPageHeader title="1. API runtime mode" titleAs="h3"
          description="Local uses the workspace database. Hosted uses the database the deployment declares."
          actions={<Badge tone="success">{runtime.local_mode ? "Local" : "Hosted"} active</Badge>} />
        <ApplicationCardGrid>
          {canSwitch && <Field label="Runtime mode" description={modeChanged ? "Selecting a mode prepares its settings. Switching later restarts the API." : "Already active. Its database is shown below."} error={switchError || undefined}>
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
      {modeChanged
        ? <ApplicationPageHeader title="2. DataSource" titleAs="h3" description={mode === "hosted"
          ? "Hosted uses the database the deployment declares. Switch to Hosted to review it here."
          : "Switch to Local to manage its workspace database."} />
        : runtime.local_mode && runtime.bootstrap?.managed_by !== "deployment" ? <RuntimeDataSourceSetup disabled={busy} />
        : <RuntimeDeploymentDatabase />}
      {modeChanged && canSwitch && <div>
        <Button variant="primary" pending={busy} disabled={busy}
        onClick={() => { setBusy(true); void switchMode(mode).finally(() => setBusy(false)); }}>
        Switch to {mode === "local" ? "Local" : "Hosted"}
      </Button></div>}
    </Card>
    <Card title="Credential storage" description={!runtime.local_mode
      ? "Hosted database passwords and TLS material use managed Main Sequence Secrets."
      : "Local database passwords and TLS material are encrypted in this catalog. The key stays in the API account's native keyring or protected key files."}>
      <Badge tone={runtime.credential_store?.status === "ready" || runtime.credential_store?.status === "managed" ? "success" : "danger"}>
        {runtime.credential_store?.status ?? "Unavailable"}
      </Badge>
      {runtime.credential_store?.error && <StatePanel embedded tone="danger" title="Credential storage unavailable">
        {runtime.credential_store.error}
      </StatePanel>}
      {!runtime.credential_store && <StatePanel embedded tone="danger" title="Credential storage status unavailable">
        Restart the updated API, then refresh runtime to load its credential storage status.
      </StatePanel>}
    </Card>
  </ApplicationPageStack>;
}
