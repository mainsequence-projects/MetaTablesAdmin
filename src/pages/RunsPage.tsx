import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi } from "../api";
import { DetailSection, Picker, useRemote } from "../ui";
import { RunExplorer } from "./RunExplorer";

export function RunsPage({ uid }: { uid: string | null }) {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [producerSearch, setProducerSearch] = useState("");
  const query = { table_update_uid: search.get("updater") || undefined, outcome: search.get("outcome") || undefined,
    start_time: search.get("start") || undefined, end_time: search.get("end") || undefined };
  const producers = useRemote(`run-producers-${producerSearch}`, signal => metaTablesApi.listUpdates({ search: producerSearch, limit: 100 }, signal));
  const change = (key: string, value: string) => {
    setSearch(previous => { const next = new URLSearchParams(previous); next.delete("offset");
      if (value) next.set(key, value); else next.delete(key); return next; });
  };
  const dateValue = (key: string) => {
    const value = search.get(key);
    if (!value || !Number.isFinite(Date.parse(value))) return "";
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const producerOptions = [{ value: "", label: "All root updaters" },
    ...(producers.status === "ready" ? producers.data.results.map(row => ({ value: row.uid, label: row.output_table_identifier || row.update_hash, subtitle: row.update_hash })) : [])];
  if (query.table_update_uid && !producerOptions.some(item => item.value === query.table_update_uid)) {
    producerOptions.push({ value: query.table_update_uid, label: query.table_update_uid });
  }
  return <DetailSection title="Runs"><ApplicationCardGrid className="runs-filters" minimumCardWidth="12rem" aria-label="Run filters">
      <Field label="Outcome"><Picker ariaLabel="Outcome" value={query.outcome || ""}
        options={[{ value: "", label: "All outcomes" }, { value: "succeeded", label: "Succeeded" }, { value: "failed", label: "Failed" }, { value: "unfinished", label: "Unfinished" }]}
        onValueChange={value => change("outcome", value)} /></Field>
      <Field label="Root updater"><Picker ariaLabel="Root updater" value={query.table_update_uid || ""} options={producerOptions}
        searchable searchPlaceholder="Search table name or update hash" searchValue={producerSearch} onSearchValueChange={setProducerSearch}
        loading={producers.status === "loading"} onValueChange={value => change("updater", value)} /></Field>
      {(["start", "end"] as const).map(key => <Field key={key} label={key === "start" ? "Started from (local time)" : "Started before (local time)"}>
        <Input type="datetime-local" value={dateValue(key)} onChange={event => change(key, event.target.value ? new Date(event.target.value).toISOString() : "")} />
      </Field>)}
    </ApplicationCardGrid>
    <RunExplorer filters={query} runUid={uid} onSelectRun={(run, replace) => {
      const next = new URLSearchParams(search); next.delete("node"); next.delete("run");
      navigate(`/runs/${encodeURIComponent(run)}${next.size ? `?${next}` : ""}`, { replace });
    }} />
  </DetailSection>;
}
