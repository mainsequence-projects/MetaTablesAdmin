import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourceTransferList } from "@dev-mainsequence/command-center-sdk/views";
import { RefreshCw } from "lucide-react";
import { metaTablesApi, type RelationDiscovery, type RelationImportResult, type SourceRecord } from "../api";
import { apiErrorDetail } from "../apiContract";
import { importSelectedRelations } from "../relationImport";
import { DetailSection, StatePanel } from "../ui";

export function RelationImport({ source }: { source: SourceRecord }) {
  const [schema, setSchema] = useState(source.configuration?.default_schema ?? "");
  const [schemaInput, setSchemaInput] = useState(schema);
  const [namespace, setNamespace] = useState("");
  const [revision, refresh] = useState(0);
  const [discovery, setDiscovery] = useState<RelationDiscovery | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [results, setResults] = useState<RelationImportResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const disabled = source.storage_access_mode === "disabled";
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (disabled) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    metaTablesApi.discoverSourceRelations(source.uid, schema, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setDiscovery(data);
      const available = new Set(data.relations.filter(row => row.importable).map(row => row.name));
      setSelected(current => current.filter(name => available.has(name)));
      setLoading(false);
    }, cause => {
      if (controller.signal.aborted) return;
      setLoadError(cause instanceof Error ? cause.message : "Could not read the source database.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [source.uid, schema, revision, disabled]);

  async function run() {
    if (!discovery || !selected.length || busy || loading || loadError) return;
    const controller = new AbortController(); request.current = controller;
    const names = [...selected];
    setBusy(true); setError(""); setResults([]);
    setProgress({ completed: 0, total: names.length });
    try {
      await importSelectedRelations({ sourceUid: source.uid, schema: discovery.physical_schema, namespace, names },
        metaTablesApi.importRelations, (result, completed, total) => {
          setResults(current => [...current, result]);
          setProgress({ completed, total });
          if (result.committed) {
            const saved = new Set(result.relations.filter(row => row.status !== "failed").map(row => row.name));
            setSelected(current => current.filter(name => !saved.has(name)));
          }
        }, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); refresh(value => value + 1); }
    }
  }
  const rows = results.flatMap(result => result.relations);
  const counts = results.reduce((total, result) => ({
    created: total.created + (result.counts.created ?? 0),
    updated: total.updated + (result.counts.updated ?? 0),
    unchanged: total.unchanged + (result.counts.unchanged ?? 0),
  }), { created: 0, updated: 0, unchanged: 0 });
  const complete = progress.total > 0 && progress.completed === progress.total && results.every(result => result.ok);
  return <DetailSection title="Import tables and views"
    description={`Choose from the tables and views available in ${source.display_name}. The source database is only read.`}
    actions={<Button disabled={busy || loading || disabled} onClick={() => refresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh tables</Button>}>
    <form onSubmit={event => {
      event.preventDefault();
      if (busy || loading) return;
      setSelected([]); setResults([]); setError(""); setDiscovery(null);
      setSchema(schemaInput.trim()); refresh(value => value + 1);
    }}>
      <Field label="Schema" description={discovery ? `Showing ${discovery.relations.length} tables and views in ${discovery.physical_schema || "the default schema"}.` : "Leave empty to use the DataSource’s default schema."}>
        <Input value={schemaInput} maxLength={128} disabled={busy || loading || disabled} onChange={event => setSchemaInput(event.target.value)} />
      </Field>
      <Button type="submit" disabled={busy || loading || disabled || schemaInput.trim() === schema}>Load schema</Button>
    </form>
    {disabled ? <StatePanel embedded title="DataSource disabled">Enable this DataSource to list its tables and views.</StatePanel>
      : loading ? <ApplicationStatusScreen variant="contained" state="loading" title="Loading tables and views" message="Reading available names from the source database…" />
      : loadError ? <StatePanel embedded tone="danger" title="Could not list tables and views" action={<Button onClick={() => refresh(value => value + 1)}>Retry</Button>}>{loadError}</StatePanel>
      : discovery && <>
        <ResourceTransferList itemLabel="tables and views" availableLabel="Available in source" selectedLabel="Selected for import"
          value={selected} onValueChange={value => { setSelected(value); setResults([]); setError(""); }} pending={busy}
          options={discovery.relations.map(row => ({ value: row.name, label: row.name,
            subtitle: row.relation_kind === "view" ? "View" : "Table",
            meta: row.blocked_reason ? apiErrorDetail({ code: row.blocked_reason }) ?? "Cannot import" : row.meta_table_uid ? "Already imported · refresh definition" : "Not imported",
            disabled: !row.importable,
          }))}
          description="Choose individual items or add all shown items. Only your selection is imported; related tables are not added automatically."
          emptyAvailableMessage={discovery.relations.length ? "All available tables and views are selected." : "No visible tables or views in this schema."}
          emptySelectedMessage="Choose the tables and views you want to import." />
        <Field label="Namespace (optional)" description="Leave empty to use this DataSource’s external namespace.">
          <Input value={namespace} maxLength={255} disabled={busy} onChange={event => setNamespace(event.target.value)} />
        </Field>
        <div><Button variant="primary" pending={busy} disabled={busy || !selected.length} onClick={() => void run()}>
          {busy ? `Importing ${progress.completed} of ${progress.total}…` : `Import selected (${selected.length})`}
        </Button></div>
      </>}
    {error && <StatePanel embedded tone="danger" title="Import stopped">{error} Completed imports listed below have been kept.</StatePanel>}
    {results.length > 0 && <ApplicationPageStack>
      <StatePanel embedded title={busy ? "Import progress" : complete ? "Import completed" : "Import stopped"} tone={busy ? "neutral" : complete ? "success" : "warning"}>
        {counts.created} created, {counts.updated} updated, {counts.unchanged} unchanged.
        {!busy && !complete && " Review the errors below. Remaining items stay selected."}
      </StatePanel>
      <DataTable items={rows} getId={row => row.name} presentation="auto" columns={[
        { id: "name", header: "Table or view", importance: "primary", renderCell: row => row.meta_table_uid ? <Link to={`/tables/${row.meta_table_uid}?tab=rows`}>{row.name}</Link> : row.name },
        { id: "kind", header: "Kind", importance: "secondary", renderCell: row => row.relation_kind === "view" ? "View" : "Table" },
        { id: "status", header: "Result", importance: "secondary", renderCell: row => row.error ? apiErrorDetail({ code: row.error }) : row.status.replaceAll("_", " ") },
      ]} />
      {results.flatMap(result => result.warnings).map((warning, index) => <StatePanel embedded tone="warning" title={apiErrorDetail({ code: warning.code }) ?? warning.code.replaceAll("_", " ")} key={index}>{warning.name}</StatePanel>)}
    </ApplicationPageStack>}
  </DetailSection>;
}
