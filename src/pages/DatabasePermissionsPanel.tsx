import { useState } from "react";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi } from "../api";
import { DataSourceTypeIcon, sourceEngineLabel } from "../DataSourceTypeIcon";
import { useRuntimeContext } from "../runtimeContext";
import { Badge, Button, Card, RemoteContent, StatePanel, useRemote } from "../ui";

export function DatabasePermissionsPanel() {
  const { runtime } = useRuntimeContext();
  const [revision, setRevision] = useState(0);
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairCompleted, setRepairCompleted] = useState(false);
  const state = useRemote(`database-permissions-${runtime.runtime_instance_id}-${revision}`,
    signal => metaTablesApi.databasePermissionStatus(signal));
  const current = state.status === "ready" ? state.data : null;
  const label = repairing ? "Repairing" : current?.status === "ready" ? "Ready"
    : current?.status === "pending" ? "Changes pending" : current ? "Repair required" : "";
  async function repair() {
    setRepairing(true); setRepairError(null); setRepairCompleted(false);
    try { await metaTablesApi.reconcilePermissions(); setRepairCompleted(true); }
    catch (cause) { setRepairError(cause instanceof Error ? cause.message : "Permission repair failed."); }
    finally { setRepairing(false); setRevision(value => value + 1); }
  }
  return <Card title="Database permissions" description="Current SQL admission and permission synchronization state, read from the runtime database."
    actions={<>
      {label && <Badge tone={repairing || current?.status === "pending" ? "warning" : current?.status === "ready" ? "success" : "danger"}>{label}</Badge>}
      <Button disabled={repairing || state.status === "loading"} onClick={() => setRevision(value => value + 1)}>Refresh state</Button>
    </>}>
    <RemoteContent state={state} loading="Reading database permission state…">{data => <>
      <p><span className="data-source-picker-value"><DataSourceTypeIcon engine={data.engine} />
        <strong>{data.data_source_name}</strong> · {sourceEngineLabel(data.engine)}</span></p>
      <ApplicationCardGrid>
        <Field label="Caller SQL"><Input readOnly value={repairing ? "Paused during repair" : data.sql_enabled ? "Enabled" : "Paused — repair required"} /></Field>
        <Field label="Permission synchronization"><Input readOnly value={repairing ? "Repair in progress" : data.synchronization_pending ? "Changes pending" : data.status === "ready" ? "Up to date" : "Repair required"} /></Field>
        <Field label="Table policy coverage"><Input readOnly value={`${data.covered_tables} of ${data.active_tables}`} /></Field>
      </ApplicationCardGrid>
      <p className="muted">{data.enforcement === "sqlite_authorizer"
        ? "SQLite enforces table grants through a connection authorizer. It does not use database roles."
        : "Database roles enforce table and namespace grants. This is the recorded state; repair permissions after changes made directly in the database."}</p>
      {data.missing_policies > 0 && <StatePanel embedded tone="warning" title="Table policies missing">
        {data.missing_policies} active {data.missing_policies === 1 ? "table needs" : "tables need"} permission repair.
      </StatePanel>}
      {!data.sql_enabled && <p role="status">Caller queries are paused until database permissions are repaired.</p>}
      {data.synchronization_pending && data.sql_enabled && <p role="status">Pending permission changes must be synchronized before caller queries execute.</p>}
      <DataTable items={data.tables} getId={table => table.uid} presentation="auto"
        emptyContent="No active tables require permission policies yet."
        columns={[
          { id: "table", header: "Table", importance: "primary", renderCell: table => data.engine !== "sqlite" && table.schema ? `${table.schema}.${table.name}` : table.name },
          { id: "policy", header: "Policy", importance: "secondary", renderCell: table => <Badge tone={table.policy_present ? "success" : "warning"}>{table.policy_present ? "Configured" : "Missing"}</Badge> },
          { id: "writes", header: "Write policy", importance: "secondary", renderCell: table => !table.policy_present ? "Unavailable" : table.writes_supported ? "Writer grants allowed" : "Read only" },
        ]} />
    </>}</RemoteContent>
    <div className="runtime-form-actions"><Button disabled={repairing || !current} pending={repairing} onClick={() => void repair()}>Repair database permissions</Button></div>
    {repairCompleted && state.status === "ready" && <p role="status">Repair completed. The state above has been reloaded from the database.</p>}
    {repairError && <StatePanel embedded title="Permission repair failed" tone="danger">{repairError}</StatePanel>}
  </Card>;
}
