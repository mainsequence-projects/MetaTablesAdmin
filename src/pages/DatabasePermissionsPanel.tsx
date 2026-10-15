import { useEffect, useState } from "react";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi } from "../api";
import { DataSourceTypeIcon, sourceEngineLabel } from "../DataSourceTypeIcon";
import { useRuntimeContext } from "../runtimeContext";
import { SECURITY_CHECK_POLL_LIMIT_MS, SECURITY_CHECK_POLL_MS, checkFinishedSince, describeCheck } from "../securityCheck";
import { Badge, Button, Card, RemoteContent, StatePanel, formatDate, useRemote } from "../ui";

type Notice = "started" | "finished" | "unreported";

export function DatabasePermissionsPanel() {
  const { runtime } = useRuntimeContext();
  const [revision, setRevision] = useState(0);
  const [running, setRunning] = useState(false);
  // A hosted check runs as a Job: wait for a check that started after this API time.
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const state = useRemote(`database-permissions-${runtime.runtime_instance_id}-${revision}`,
    signal => metaTablesApi.databasePermissionStatus(signal));
  const current = state.status === "ready" ? state.data : null;
  const checking = running || requestedAt !== null || current?.last_check?.outcome === "running";
  const label = checking ? "Checking" : current?.status === "ready" ? "Ready"
    : current?.status === "pending" ? "Changes pending" : current ? "Check required" : "";

  useEffect(() => {
    if (!requestedAt) return;
    // Poll quietly; reload the panel once, when the Job has recorded its outcome.
    const controller = new AbortController();
    const started = Date.now();
    let timer = 0;
    const poll = async () => {
      try {
        const status = await metaTablesApi.databasePermissionStatus(controller.signal);
        if (checkFinishedSince(status.last_check, requestedAt)) {
          setRequestedAt(null); setNotice("finished"); setRevision(value => value + 1);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (Date.now() - started > SECURITY_CHECK_POLL_LIMIT_MS) {
        setRequestedAt(null); setNotice("unreported");
        return;
      }
      timer = window.setTimeout(() => void poll(), SECURITY_CHECK_POLL_MS);
    };
    timer = window.setTimeout(() => void poll(), SECURITY_CHECK_POLL_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [requestedAt]);

  async function runCheck() {
    setRunning(true); setCheckError(null); setNotice(null);
    try {
      const result = await metaTablesApi.runSecurityCheck();
      if (result.status === "started") { setRequestedAt(result.requested_at); setNotice("started"); }
      else { setNotice("finished"); setRevision(value => value + 1); }
    } catch (cause) {
      setCheckError(cause instanceof Error ? cause.message : "The security check could not run.");
      setRevision(value => value + 1);
    } finally { setRunning(false); }
  }

  return <Card title="Database permissions" description="SQL admission, permission synchronization and the last security check, read from the runtime database."
    actions={<>
      {label && <Badge tone={checking || current?.status === "pending" ? "warning" : current?.status === "ready" ? "success" : "danger"}>{label}</Badge>}
      <Button disabled={running || state.status === "loading"} onClick={() => setRevision(value => value + 1)}>Refresh state</Button>
    </>}>
    <RemoteContent state={state} loading="Reading database permission state…">{data => <>
      <p><span className="data-source-picker-value"><DataSourceTypeIcon engine={data.engine} />
        <strong>{data.data_source_name}</strong> · {sourceEngineLabel(data.engine)}</span></p>
      <ApplicationCardGrid>
        <Field label="Caller SQL"><Input readOnly value={data.sql_enabled ? "Enabled" : "Paused — run the security check"} /></Field>
        <Field label="Permission synchronization"><Input readOnly value={data.synchronization_pending ? "Changes pending" : data.status === "ready" ? "Up to date" : "Check required"} /></Field>
        <Field label="Table policy coverage"><Input readOnly value={`${data.covered_tables} of ${data.active_tables}`} /></Field>
        <Field label="Last security check"><Input readOnly value={describeCheck(data.last_check, formatDate)} /></Field>
      </ApplicationCardGrid>
      <p className="muted">{data.enforcement === "sqlite_authorizer"
        ? "SQLite enforces table grants through a connection authorizer. It does not use database roles."
        : "Database roles enforce table and namespace grants. MetaTables checks the database against these grants daily at 03:00 UTC. Run the check now after deploying a release that changes access rules, or after changing grants directly in the database."}</p>
      {data.missing_policies > 0 && <StatePanel embedded tone="warning" title="Table policies missing">
        {data.missing_policies} active {data.missing_policies === 1 ? "table has" : "tables have"} no permission policy yet. Run the security check.
      </StatePanel>}
      {!data.sql_enabled && <p role="status">Caller queries are paused until the security check sets up database permissions.</p>}
      {data.synchronization_pending && data.sql_enabled && <p role="status">Pending permission changes must be synchronized before caller queries execute.</p>}
      <DataTable items={data.tables} getId={table => table.uid} presentation="auto"
        emptyContent="No active tables require permission policies yet."
        columns={[
          { id: "table", header: "Table", importance: "primary", renderCell: table => data.engine !== "sqlite" && table.schema ? `${table.schema}.${table.name}` : table.name },
          { id: "policy", header: "Policy", importance: "secondary", renderCell: table => <Badge tone={table.policy_present ? "success" : "warning"}>{table.policy_present ? "Configured" : "Missing"}</Badge> },
          { id: "writes", header: "Write policy", importance: "secondary", renderCell: table => !table.policy_present ? "Unavailable" : table.writes_supported ? "Writer grants allowed" : "Read only" },
        ]} />
    </>}</RemoteContent>
    <div className="runtime-form-actions"><Button disabled={checking || !current} pending={running} onClick={() => void runCheck()}>Run security check now</Button></div>
    {notice === "started" && <p role="status">Security check started. It runs as a Main Sequence Job and caller queries keep running; this panel updates when it finishes.</p>}
    {notice === "finished" && state.status === "ready" && <p role="status">Security check finished. The state above has been reloaded from the database.</p>}
    {notice === "unreported" && <StatePanel embedded tone="warning" title="No result yet">The security check has not reported back. Read the MetaTables security check Job run.</StatePanel>}
    {checkError && <StatePanel embedded title="Security check failed" tone="danger">{checkError}</StatePanel>}
  </Card>;
}
