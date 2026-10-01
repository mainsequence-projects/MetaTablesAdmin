import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, Textarea } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourcePagination } from "@dev-mainsequence/command-center-sdk/views";
import { Play } from "lucide-react";
import { metaTablesApi, type SourceQueryResult, type SourceRecord, type TableRecord } from "../api";
import { adminPaths } from "../navigation";
import { useRuntimeContext } from "../runtimeContext";
import { buildSourceSelect } from "../sourceQuery";
import { DetailSection, display, Picker, StatePanel, useDebounced, useRemote } from "../ui";

type QueryPage = { result: SourceQueryResult; sql: string; maxRows: number; offset: number };

export function SourceQueryBuilder({ source }: { source: SourceRecord }) {
  const { runtime } = useRuntimeContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [table, setTable] = useState<TableRecord | null>(null);
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [sql, setSql] = useState("SELECT 1 AS value;");
  const [maxRows, setMaxRows] = useState(100);
  const [page, setPage] = useState<QueryPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const active = runtime.data_source?.uid === source.uid && !runtime.data_source_error;
  const disabled = source.storage_access_mode === "disabled";
  useEffect(() => () => request.current?.abort(), []);
  // A change of runtime also invalidates results and any unfinished query.
  useEffect(() => {
    request.current?.abort(); setBusy(false); setPage(null); setError("");
  }, [runtime.runtime_instance_id, runtime.data_source?.uid]);

  const tables = useRemote(`query-tables-${source.uid}-${debouncedSearch}`, signal => metaTablesApi.listTables({
    data_source_uid: source.uid, search: debouncedSearch, limit: 200, offset: 0, ordering: "physical_table_name",
  }, signal));
  const selected = useRemote(`query-columns-${source.uid}-${table?.uid ?? "none"}`, async signal =>
    table ? metaTablesApi.table(table.uid, signal) : null);
  const options = tables.status === "ready" ? tables.data.results : [];
  const visibleTables = table && !options.some(option => option.uid === table.uid) ? [table, ...options] : options;

  async function run(query: string, limit: number, offset: number) {
    if (!active || disabled || !query.trim()) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setPage(null);
    try {
      const result = await metaTablesApi.runSourceQuery(source.uid, query, limit, offset, controller.signal);
      if (!controller.signal.aborted) setPage({ result, sql: query, maxRows: limit, offset });
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to run query");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void run(sql, maxRows, 0); }

  return <ApplicationPageStack>
    <DetailSection title="Query builder" description="Choose a table and columns to build a SELECT query, or write your own SQL.">
      {(!active || disabled) && <StatePanel embedded title={disabled ? "DataSource disabled" : "Select this DataSource to run queries"}
        action={runtime.is_admin ? <Button onClick={() => navigate(adminPaths.settings)}>Open Settings</Button> : undefined}>
        {disabled ? "Enable this DataSource before running a query." : "Choose this DataSource in Settings before running a query."}
      </StatePanel>}
      <ApplicationCardGrid minimumCardWidth="20rem">
        <Field label="Table" description={tables.status === "ready" && tables.data.count > 200 ? "Search to narrow the available tables." : "Tables you can access in this DataSource."}>
          <Picker ariaLabel="Table" value={table?.uid ?? null} placeholder="Choose a table" searchable
            emptyMessage={search ? "No tables match your search." : "No accessible tables in this DataSource."}
            loading={tables.status === "loading"} searchValue={search} onSearchValueChange={setSearch}
            options={visibleTables.map(item => ({ value: item.uid, label: item.physical_table_name,
              subtitle: item.physical_schema ?? undefined, disabled: item.provisioning_status === "reserved" }))}
            onValueChange={uid => { setTable(visibleTables.find(item => item.uid === uid) ?? null); setColumns([]); }} />
        </Field>
        <Field label="Columns" description="Leave empty to select all columns.">
          <Picker ariaLabel="Columns" mode="multiple" value={columns} onValueChange={setColumns} placeholder="All columns"
            disabled={!table || selected.status !== "ready" || selected.data?.uid !== table.uid} loading={!!table && selected.status === "loading"} searchable
            options={(selected.status === "ready" && selected.data?.uid === table?.uid ? selected.data?.columns ?? [] : []).map(column => ({ value: column.name, label: column.name, subtitle: column.data_type ?? undefined }))} />
        </Field>
      </ApplicationCardGrid>
      {tables.status === "error" && <StatePanel embedded tone="danger" title="Unable to load tables">{tables.error.message}</StatePanel>}
      {table && selected.status === "error" && <StatePanel embedded tone="danger" title="Unable to load columns">{selected.error.message}</StatePanel>}
      <div className="runtime-form-actions"><Button disabled={!table || busy} onClick={() => table && setSql(buildSourceSelect(table, columns, source.class_type))}>Build SELECT query</Button></div>
      <form aria-label="DataSource query" onSubmit={submit}>
        <ApplicationPageStack>
          <Field label="SQL" required disabled={busy} description="Read-only queries run with your table permissions.">
            <Textarea className="mono" rows={8} required spellCheck={false} value={sql} onChange={event => setSql(event.target.value)} />
          </Field>
          <div className="source-query-actions">
            <Field label="Rows per page"><Picker ariaLabel="Rows per page" value={String(maxRows)} disabled={busy}
              options={[25, 100, 500, 1000].map(value => ({ value: String(value), label: String(value) }))} onValueChange={value => setMaxRows(Number(value))} /></Field>
            <Button type="submit" variant="primary" pending={busy} disabled={busy || !active || disabled || !sql.trim()}><Play size={16} aria-hidden="true" />Run query</Button>
          </div>
        </ApplicationPageStack>
      </form>
      {error && <StatePanel embedded tone="danger" title="Query failed">{error}</StatePanel>}
      {busy && <p role="status">Running query…</p>}
    </DetailSection>
    {page && <DetailSection title={`Results · ${page.result.row_count} ${page.result.row_count === 1 ? "row" : "rows"}`} description={page.result.truncated ? "Page limit reached. Use Next to check for more rows." : undefined}>
      <DataTable items={page.result.results.map((row, index) => ({ row, index }))} getId={item => item.index} presentation="auto"
        emptyContent="Query completed. No rows returned."
        columns={[...new Set(page.result.results.flatMap(row => Object.keys(row)))].map(name => ({ id: name, header: name,
          renderCell: (item: { row: Record<string, unknown>; index: number }) => display(item.row[name], "null") }))} />
      <ResourcePagination count={page.offset + page.result.row_count + (page.result.truncated ? 1 : 0)} pageIndex={Math.floor(page.offset / page.maxRows)}
        pageSize={page.maxRows} itemLabel="rows" presentation="auto" hasPreviousPage={page.offset > 0} hasNextPage={page.result.truncated}
        onPageChange={index => void run(page.sql, page.maxRows, index * page.maxRows)} />
    </DetailSection>}
  </ApplicationPageStack>;
}
