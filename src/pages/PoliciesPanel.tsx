import { useEffect, useState } from "react";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { metaTablesApi, type TablePolicies } from "../api";
import { Button, Card, RemoteContent, StatePanel, useRemote } from "../ui";

export function PoliciesPanel({ uid }: { uid: string }) {
  const remote = useRemote(`table-policies-${uid}`, (signal) => metaTablesApi.tablePolicies(uid, signal));
  const [value, setValue] = useState<TablePolicies | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (remote.status === "ready") setValue(remote.data); }, [remote]);

  function change(type: "compression" | "retention", field: "after" | "schedule_interval" | "initial_start" | "timezone", input: string) {
    setValue((current) => current ? { ...current, [type]: { ...current[type], [field]: input } } : current);
  }

  async function save() {
    if (!value) return;
    setSaving(true); setError(null); setMessage(null);
    try { setValue(await metaTablesApi.saveTablePolicies(uid, value)); setMessage("Policies saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save policies."); }
    finally { setSaving(false); }
  }

  return <RemoteContent state={remote}>{() => value && <Card title="TimeScale policies" description="Compression and retention rules for this time-indexed table.">
    <div className="policy-grid">{(["compression", "retention"] as const).map((type) => <div className="policy-section" key={type}><h3>{type === "compression" ? "Compression" : "Retention"}</h3>{value[type].supported === false ? <StatePanel title="Unsupported">This policy is unavailable for this table.</StatePanel> : <>
      <Field label={type === "compression" ? "Compress after" : "Drop after"}><Input value={value[type].after ?? ""} placeholder="7 days" onChange={(event) => change(type, "after", event.target.value)} /></Field>
      <Field label="Schedule interval"><Input value={value[type].schedule_interval ?? ""} placeholder="12 hours" onChange={(event) => change(type, "schedule_interval", event.target.value)} /></Field>
      <Field label="Initial start"><Input type="datetime-local" value={value[type].initial_start?.slice(0, 16) ?? ""} onChange={(event) => change(type, "initial_start", event.target.value)} /></Field>
      <Field label="Timezone"><Input value={value[type].timezone ?? "UTC"} onChange={(event) => change(type, "timezone", event.target.value)} /></Field>
    </>}</div>)}</div>
    {error && <StatePanel title="Save failed" tone="danger">{error}</StatePanel>}{message && <div role="status"><StatePanel title="Saved" tone="success">{message}</StatePanel></div>}
    <div className="button-row end"><Button variant="primary" pending={saving} disabled={value.compression.supported === false && value.retention.supported === false} onClick={() => void save()}>{saving ? "Saving…" : "Save policies"}</Button></div>
  </Card>}</RemoteContent>;
}
