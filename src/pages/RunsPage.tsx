import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { metaTablesApi, type DataUpdateDetail } from "../api";
import { Button, Picker, useRemote } from "../ui";
import { RunExplorer } from "./RunExplorer";

const OUTCOMES = [["", "All"], ["succeeded", "Succeeded"], ["failed", "Failed"], ["unfinished", "Unfinished"]] as const;
const RELATIVE: Record<string, number> = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3 };
const FILTER_KEYS = ["updater", "outcome", "since", "start", "end", "root_only"];

/** Updaters read by their class name, as runs label them; the output table explains which one. */
function updaterOption(row: DataUpdateDetail) {
  const path = row.configuration?.table_updater_class_import_path;
  const name = path && typeof path === "object" && "qualname" in path && typeof path.qualname === "string" ? path.qualname : null;
  return { value: row.uid, label: name || row.output_table_identifier || row.update_hash, subtitle: name ? row.output_table_identifier || row.update_hash : row.update_hash };
}

export function RunsPage({ uid }: { uid: string | null }) {
  const [search, setSearch] = useSearchParams();
  const [producerSearch, setProducerSearch] = useState("");
  // Links from before relative ranges carry explicit bounds; they open as a custom range.
  const since = search.get("since") || (search.get("start") || search.get("end") ? "custom" : "");
  const relativeStart = useMemo(() => RELATIVE[since] ? new Date(Date.now() - RELATIVE[since]).toISOString() : undefined, [since]);
  const query = { table_update_uid: search.get("updater") || undefined, outcome: search.get("outcome") || undefined,
    start_time: since === "custom" ? search.get("start") || undefined : relativeStart,
    end_time: since === "custom" ? search.get("end") || undefined : undefined,
    root_only: search.get("root_only") === "true" ? "true" : undefined };
  const producers = useRemote(`run-producers-${producerSearch}`, signal => metaTablesApi.listUpdates({ search: producerSearch, limit: 100 }, signal));
  const update = (values: Record<string, string>) => setSearch(previous => {
    const next = new URLSearchParams(previous);
    next.delete("offset");
    for (const [key, value] of Object.entries(values)) if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const dateValue = (key: string) => {
    const value = search.get(key);
    if (!value || !Number.isFinite(Date.parse(value))) return "";
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const producerOptions = [{ value: "", label: "All updaters" }, ...(producers.status === "ready" ? producers.data.results.map(updaterOption) : [])];
  if (query.table_update_uid && !producerOptions.some(item => item.value === query.table_update_uid)) {
    producerOptions.push({ value: query.table_update_uid, label: query.table_update_uid });
  }
  const active = [search.get("updater"), search.get("outcome"), since, query.root_only].filter(Boolean).length;
  const filters = <>
    <Picker ariaLabel="Updater" value={query.table_update_uid || ""} options={producerOptions} fullWidth
      searchable searchPlaceholder="Search updater, table or hash" searchValue={producerSearch} onSearchValueChange={setProducerSearch}
      loading={producers.status === "loading"} onValueChange={value => update({ updater: value })} />
    <div className="mt-runs__toggles" role="group" aria-label="Outcome">
      {OUTCOMES.map(([value, label]) => <Button key={label} size="small" variant={(query.outcome || "") === value ? "secondary" : "ghost"}
        aria-pressed={(query.outcome || "") === value} onClick={() => update({ outcome: value })}>
        {value && <span className="mt-runs__status" data-outcome={value} aria-hidden="true" />}{label}
      </Button>)}
    </div>
    <div className="mt-runs__toggles">
      <Picker ariaLabel="Started" value={since} fitContent onValueChange={value => update(value === "custom" ? { since: value } : { since: value, start: "", end: "" })}
        options={[{ value: "", label: "Any time" }, { value: "1h", label: "Last hour" }, { value: "24h", label: "Last 24 hours" },
          { value: "7d", label: "Last 7 days" }, { value: "custom", label: "Custom range" }]} />
      <Button size="small" variant={query.root_only ? "secondary" : "ghost"} aria-pressed={Boolean(query.root_only)}
        onClick={() => update({ root_only: query.root_only ? "" : "true" })}>Root invocations only</Button>
    </div>
    {since === "custom" && <div className="mt-runs__range">
      {(["start", "end"] as const).map(key => <Field key={key} label={key === "start" ? "From (local time)" : "Before (local time)"}>
        <Input type="datetime-local" value={dateValue(key)} onChange={event => update({ [key]: event.target.value ? new Date(event.target.value).toISOString() : "" })} />
      </Field>)}
    </div>}
    {active > 0 && <div><Button size="small" variant="ghost" onClick={() => update(Object.fromEntries(FILTER_KEYS.map(key => [key, ""])))}>
      Clear {active} {active === 1 ? "filter" : "filters"}
    </Button></div>}
  </>;
  return <RunExplorer title="Runs" description="Recorded attempts, newest first. Select one to inspect its invocation and logs."
    toolbar={filters} filters={query} runUid={uid} runPath={run => {
      const next = new URLSearchParams(search); next.delete("node"); next.delete("run");
      return `/runs/${encodeURIComponent(run)}${next.size ? `?${next}` : ""}`;
    }} />;
}
