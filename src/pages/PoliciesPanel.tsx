import { useState, type ReactNode } from "react";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ResourceActionConfirmationDialog } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type TimescaleJob, type TimescaleTablePolicies } from "../api";
import { draftAfter, draftError, eligibilityMessage, formatBytes, intervalUnits, isoFromLocalDateTime, jobStatusTone, localDateTimeValue, policyDraft, policyRequest, retentionCutoff, retentionNeedsConfirmation, retentionOrderError, type IntervalUnit, type PolicyDraft, type PolicyKind } from "../timescalePolicies";
import { Badge, Button, Card, DetailSection, Facts, formatDate, Picker, RemoteContent, StatePanel, useRemote } from "../ui";

const copy: Record<PolicyKind, { title: string; after: string; on: string; off: string }> = {
  compression: { title: "Compression", after: "Compress after", on: "Compresses chunks older than", off: "Off: chunks stay uncompressed." },
  retention: { title: "Retention", after: "Drop after", on: "Permanently drops chunks older than", off: "Off: data is kept indefinitely." },
};

export function PoliciesPanel({ uid }: { uid: string }) {
  const remote = useRemote(`timescale-policies-${uid}`, (signal) => metaTablesApi.timescalePolicies(uid, signal));
  return <RemoteContent state={remote}>{(data) => <PolicyEditor uid={uid} initial={data} />}</RemoteContent>;
}

function drafts(value: TimescaleTablePolicies) {
  return { compression: policyDraft(value.compression, "compression"), retention: policyDraft(value.retention, "retention") };
}

function requestBody(value: ReturnType<typeof drafts>) {
  return { compression: policyRequest(value.compression), retention: policyRequest(value.retention) };
}

function PolicyEditor({ uid, initial }: { uid: string; initial: TimescaleTablePolicies }) {
  const [loaded, setLoaded] = useState(initial);
  const [draft, setDraft] = useState(() => drafts(initial));
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!loaded.eligibility.eligible) {
    const reason = eligibilityMessage(loaded.eligibility.reason, loaded.eligibility.timescale_version);
    return <DetailSection title="Timescale policies"><StatePanel embedded title={reason.title} tone="warning">{reason.message}</StatePanel></DetailSection>;
  }
  const editable = loaded.can_edit;
  const orderError = retentionOrderError(draft.compression, draft.retention);
  const body = requestBody(draft);
  const blocked = Boolean(orderError || draftError(draft.compression) || draftError(draft.retention));
  const dirty = JSON.stringify(body) !== JSON.stringify(requestBody(drafts(loaded)));
  const job = (kind: PolicyKind) => loaded.jobs.find((item) => item.kind === kind);
  const stats = loaded.compression_stats;
  const retentionAfter = draftAfter(draft.retention) ?? "";
  const cutoff = confirming ? retentionCutoff(retentionAfter, new Date()) : null;

  function change(kind: PolicyKind, patch: Partial<PolicyDraft>) {
    setDraft((current) => ({ ...current, [kind]: { ...current[kind], ...patch } })); setMessage(null);
  }

  async function save() {
    setSaving(true); setError(null); setMessage(null);
    try { const next = await metaTablesApi.saveTimescalePolicies(uid, body); setLoaded(next); setDraft(drafts(next)); setConfirming(false); setMessage("Policies saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save policies."); }
    finally { setSaving(false); }
  }

  return <DetailSection title="Timescale policies" description="TimescaleDB runs these as background jobs on the hypertable: compression shrinks older chunks, retention permanently drops expired ones."
    actions={editable ? <Button variant="primary" pending={saving} disabled={blocked || !dirty} onClick={() => retentionNeedsConfirmation(draft.retention, loaded.retention) ? setConfirming(true) : void save()}>Save policies</Button> : undefined}>
    {!editable && <StatePanel embedded title="Read-only">Only Writers on a read-write DataSource can change policies.</StatePanel>}
    <ApplicationCardGrid minimumCardWidth="22rem">
      <PolicyCard kind="compression" draft={draft.compression} job={job("compression")} editable={editable} onChange={(patch) => change("compression", patch)} facts={[
        { label: "Segment by", value: <span className="mono">{loaded.compression_settings.segmentby.join(", ") || "None"}</span> },
        { label: "Order by", value: <span className="mono">{loaded.compression_settings.orderby || "Not set"}</span> },
        ...(stats && stats.before_bytes !== null && stats.after_bytes !== null ? [{ label: "Size", value: `${formatBytes(stats.before_bytes)} → ${formatBytes(stats.after_bytes)}` }] : []),
        ...(stats && stats.total_chunks !== null ? [{ label: "Chunks", value: `${stats.compressed_chunks ?? 0} of ${stats.total_chunks} chunks compressed` }] : []),
      ]} />
      <PolicyCard kind="retention" draft={draft.retention} job={job("retention")} editable={editable} error={orderError} onChange={(patch) => change("retention", patch)} />
    </ApplicationCardGrid>
    {error && !confirming && <StatePanel embedded title="Save failed" tone="danger">{error}</StatePanel>}
    {message && <StatePanel embedded title="Saved" tone="success">{message}</StatePanel>}
    {confirming && <ResourceActionConfirmationDialog title="Drop old chunks?" actionLabel={`Save retention of ${retentionAfter}`} tone="danger"
      description={`Chunks older than ${cutoff ? formatDate(cutoff.toISOString()) : retentionAfter} will be permanently dropped now and on every run, including data backfilled later that is older than this.`}
      confirmationValue="" onConfirmationValueChange={() => {}} confirmButtonLabel="Save and drop chunks" pending={saving} error={error ?? undefined}
      presentation="auto" onClose={() => setConfirming(false)} onConfirm={save} />}
  </DetailSection>;
}

function PolicyCard({ kind, draft, job, editable, error, facts = [], onChange }: {
  kind: PolicyKind; draft: PolicyDraft; job?: TimescaleJob; editable: boolean; error?: string | null;
  facts?: { label: string; value: ReactNode }[]; onChange: (patch: Partial<PolicyDraft>) => void;
}) {
  const text = copy[kind];
  const fieldError = draftError(draft) ?? error ?? undefined;
  const toggle = editable
    ? <div className="timescale-toggle" role="group" aria-label={`${text.title} policy`}>{([false, true] as const).map((on) => <Button key={String(on)} size="small" variant={draft.enabled === on ? "secondary" : "ghost"} aria-pressed={draft.enabled === on} onClick={() => onChange({ enabled: on })}>{on ? "On" : "Off"}</Button>)}</div>
    : <Badge tone={draft.enabled ? "success" : "neutral"}>{draft.enabled ? "On" : "Off"}</Badge>;
  const items = [...(job ? jobFacts(job) : []), ...facts];
  return <Card titleAs="h3" title={text.title} description={draft.enabled ? `${text.on} ${draftAfter(draft)}.` : text.off} actions={toggle}>
    {draft.enabled && <>
      {draft.raw !== null
        ? <Field label={text.after} description="PostgreSQL interval text." error={fieldError} disabled={!editable}><Input value={draft.raw} onChange={(event) => onChange({ raw: event.target.value })} /></Field>
        : <div className="timescale-interval">
          <Field label={text.after} error={fieldError} disabled={!editable}><Input type="number" min={1} step={1} inputMode="numeric" value={draft.amount} onChange={(event) => onChange({ amount: event.target.value })} /></Field>
          <Field label="Unit" disabled={!editable}><Picker ariaLabel={`${text.title} unit`} value={draft.unit} options={intervalUnits} disabled={!editable} onValueChange={(value) => onChange({ unit: value as IntervalUnit })} /></Field>
        </div>}
      <details className="timescale-advanced"><summary>Advanced</summary><ApplicationPageStack>
        <Field label="Schedule interval" description="How often TimescaleDB runs this job." disabled={!editable}><Input value={draft.schedule_interval} placeholder="Timescale default" onChange={(event) => onChange({ schedule_interval: event.target.value })} /></Field>
        <Field label="Initial start (local time)" disabled={!editable}><Input type="datetime-local" value={localDateTimeValue(draft.initial_start)} onChange={(event) => onChange({ initial_start: isoFromLocalDateTime(event.target.value) })} /></Field>
        <Field label="Timezone" description="Aligns the schedule, for example Europe/London." disabled={!editable}><Input value={draft.timezone} placeholder="Timescale default" onChange={(event) => onChange({ timezone: event.target.value })} /></Field>
      </ApplicationPageStack></details>
    </>}
    {items.length > 0 && <Facts items={items} />}
    {job?.last_error && <StatePanel embedded title="Last error" tone={job.status === "Failed" ? "danger" : "warning"}><span className="mono">{job.last_error}</span></StatePanel>}
  </Card>;
}

function jobFacts(job: TimescaleJob) {
  return [
    { label: "Status", value: <span className="timescale-status"><Badge tone={jobStatusTone(job.status)}>{job.status}</Badge><span className="muted">Job {job.job_id}</span></span> },
    { label: "Last success", value: formatDate(job.last_successful_finish) },
    { label: "Next run", value: formatDate(job.next_start) },
    { label: "Failures", value: job.total_failures === null ? "Not available" : `${job.total_failures}${job.total_runs === null ? "" : ` of ${job.total_runs} runs`}` },
  ];
}
