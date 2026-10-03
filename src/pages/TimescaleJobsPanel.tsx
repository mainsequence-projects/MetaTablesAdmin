import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { RefreshCw } from "lucide-react";
import { metaTablesApi, type SourceRecord, type TimescaleJob } from "../api";
import { detailPath } from "../navigation";
import { jobPolicyLabel, jobStatusTone } from "../timescalePolicies";
import { Badge, Button, DetailSection, display, formatDate, RemoteContent, StatePanel, useRemote } from "../ui";

function hypertable(job: TimescaleJob) {
  return [job.hypertable_schema, job.hypertable_name].filter(Boolean).join(".") || "Not available";
}

export function TimescaleJobsPanel({ source }: { source: SourceRecord }) {
  const [revision, refresh] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const remote = useRemote(`timescale-jobs-${source.uid}-${revision}`, (signal) => metaTablesApi.timescaleJobs(source.uid, signal));
  return <DetailSection title="Timescale jobs" description={`Compression, retention and other background jobs TimescaleDB runs in ${source.display_name}, for tables you can read.`} actions={<>
    <Button size="small" variant={failedOnly ? "secondary" : "ghost"} aria-pressed={failedOnly} onClick={() => setFailedOnly((value) => !value)}>Failed only</Button>
    <Button size="small" pending={remote.status === "loading"} onClick={() => refresh((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
  </>}><RemoteContent state={remote}>{(page) => <>
    <div className="timescale-counts"><Badge>Policies: {page.policy_count}</Badge><Badge tone={page.failed_count ? "danger" : "neutral"}>Failed: {page.failed_count}</Badge><Badge>TimescaleDB {page.timescale_version ?? "version unknown"}</Badge></div>
    {page.jobs.length === 0
      ? <StatePanel embedded title="No jobs">No TimescaleDB jobs run on tables you can read here. Set compression or retention on a table’s Timescale Policies tab.</StatePanel>
      : <DataTable items={failedOnly ? page.jobs.filter((job) => job.status === "Failed") : page.jobs} getId={(job) => job.job_id} presentation="auto" emptyContent="No failed jobs." columns={[
        { id: "table", header: "Table", importance: "primary", renderCell: (job) => job.table_uid ? <Link to={detailPath("time-index-meta-tables", job.table_uid, "policies")}>{job.table_identifier ?? hypertable(job)}</Link> : <span className="mono">{hypertable(job)}</span> },
        { id: "policy", header: "Policy", renderCell: (job) => <>{jobPolicyLabel(job)}<small className="timescale-secondary">Job {job.job_id}</small></> },
        { id: "status", header: "Status", renderCell: (job) => <><Badge tone={jobStatusTone(job.status)}>{job.status}</Badge>{job.last_error && <small className="timescale-secondary mono">{job.last_error}</small>}</> },
        { id: "last-run", header: "Last run", renderCell: (job) => <>{formatDate(job.last_run_started_at)}{job.last_run_status && <small className="timescale-secondary">{job.last_run_status}</small>}</> },
        { id: "next-run", header: "Next run", renderCell: (job) => job.scheduled ? formatDate(job.next_start) : "Not scheduled" },
        { id: "failures", header: "Failures", renderCell: (job) => display(job.total_failures, "Not available") },
      ]} />}
  </>}</RemoteContent></DetailSection>;
}
