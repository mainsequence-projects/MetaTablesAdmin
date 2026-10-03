import { useState } from "react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { RuntimeDataSourceSetup } from "../runtimeDataSourceSetup";
import { RuntimeDeploymentDatabase } from "../runtimeDeploymentDatabase";
import { useRuntimeContext } from "../runtimeContext";
import { Badge, Card, PageHeading, StatePanel } from "../ui";

export function SettingsPage() {
  const { runtime, refresh } = useRuntimeContext();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const environment = runtime.hosted_environment;
  async function check() {
    setBusy(true); setError("");
    try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Runtime check failed"); }
    finally { setBusy(false); }
  }
  return <ApplicationPageStack>
    <PageHeading eyebrow="Application" title="Settings" description="Configure how MetaTables runs and where it stores data."
      actions={<Button pending={busy} disabled={busy} onClick={() => void check()}>Refresh runtime</Button>} />
    <Card title="Runtime" description="Review the API runtime mode and the database it uses.">
      {error && <p role="alert"><Badge tone="danger">Runtime check failed</Badge> {error}</p>}
      <ApplicationPageStack as="section" aria-label="API runtime mode">
        <ApplicationPageHeader title="1. API runtime mode" titleAs="h3"
          description="Local uses the workspace database. Hosted uses the database the deployment declares."
          actions={<Badge tone="success">{runtime.local_mode ? "Local" : "Hosted"} active</Badge>} />
        <p className="muted">API endpoint<br /><span className="mono">{runtime.api_endpoint}</span>
          {!runtime.local_mode && <><br />Environment: <strong>{environment?.name ?? environment?.uid ?? "Not configured"}</strong>
            {environment?.is_production && <> · <Badge tone="warning">Production</Badge></>}
            {environment?.required_repository_branch && <><br />Branch: <span className="mono">{environment.required_repository_branch}</span></>}
          </>}
        </p>
        {!runtime.local_mode && environment?.status !== "verified" && <p role="alert">{environment?.status === "not_found" ? "The configured hosted Environment does not exist."
          : environment?.status === "not_configured" ? "No Environment is assigned to this API's repository branch."
          : "The API could not verify its hosted Environment. Check its platform connection and deployment configuration."}</p>}
      </ApplicationPageStack>
      {runtime.local_mode && runtime.bootstrap?.managed_by !== "deployment" ? <RuntimeDataSourceSetup disabled={busy} />
        : <RuntimeDeploymentDatabase />}
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
