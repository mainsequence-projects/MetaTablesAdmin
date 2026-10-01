import { useState } from "react";
import { Button, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourcePagination } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type SourceRecord } from "../api";
import { DetailSection, display, Picker, RemoteContent, StatePanel, useDebounced, useRemote } from "../ui";

export function RelationRows({ uid }: { uid: string }) {
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setRefreshing(true); setError("");
    try {
      await metaTablesApi.refreshRelation(uid);
      setColumns([]); setSort(null); setOffset(0); setVersion(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Metadata refresh failed."); }
    finally { setRefreshing(false); }
  }
  const [offset, setOffset] = useState(0);
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<string | null>(null);
  const [direction, setDirection] = useState("asc");
  const detail = useRemote(`row-columns-${uid}-${version}`, signal => metaTablesApi.table(uid, signal));
  const remote = useRemote(`relation-rows-${uid}-${version}-${offset}-${JSON.stringify(columns)}-${sort}-${direction}`, signal =>
    metaTablesApi.readRelation(uid, { columns: columns.length ? [...columns] : undefined, offset, limit: 100,
      order_by: sort ? [{ column: sort, direction: direction as "asc" | "desc" }] : [] }, signal));
  const names = detail.status === "ready" ? detail.data.columns?.map(column => column.name) ?? [] : [];
  return <DetailSection title="Rows" description="Read-only preview. Choose an ordering for pagination; changing data or non-unique values can move between pages.">
    {detail.status === "ready" && detail.data.management_mode === "external_registered" && detail.data.permissions?.write &&
      <div><Button pending={refreshing} disabled={refreshing} onClick={() => void refresh()}>Refresh definition from source</Button></div>}
    {error && <StatePanel embedded tone="danger" title="Refresh failed">{error}</StatePanel>}
    <Field label="Columns"><Picker mode="multiple" ariaLabel="Columns" value={columns} options={names.map(name => ({ value: name, label: name }))}
      onValueChange={(value: readonly string[]) => { setColumns(value); setOffset(0); }} placeholder="All registered columns" /></Field>
    <Field label="Order by"><Picker ariaLabel="Order by" value={sort} options={names.map(name => ({ value: name, label: name }))}
      onValueChange={value => { setSort(value); setOffset(0); }} placeholder="Unordered preview" /></Field>
    <Field label="Direction"><Picker ariaLabel="Direction" value={direction} options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]}
      onValueChange={value => { setDirection(value ?? "asc"); setOffset(0); }} /></Field>
    <RemoteContent state={remote}>{page => <>
      <DataTable items={page.rows.map((row, index) => ({ row, index }))} getId={item => item.index} presentation="auto"
        columns={page.columns.map(name => ({ id: name, header: name, renderCell: (item: { row: Record<string, unknown> }) => display(item.row[name], "null") }))}
        emptyContent="No rows returned." />
      <ResourcePagination count={offset + page.rows.length + (page.has_more ? 1 : 0)} pageIndex={Math.floor(offset / 100)} pageSize={100}
        itemLabel="rows" presentation="auto" hasPreviousPage={offset > 0} hasNextPage={page.has_more} onPageChange={pageIndex => setOffset(pageIndex * 100)} />
    </>}</RemoteContent>
  </DetailSection>;
}

export function SourceRelationBrowser({ source }: { source: SourceRecord }) {
  const [search, setSearch] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const query = useDebounced(search);
  const tables = useRemote(`external-relations-${source.uid}-${query}`, signal => metaTablesApi.listTables({
    data_source_uid: source.uid, search: query, limit: 200, offset: 0,
  }, signal));
  return <ApplicationPageStack>
    <Field label="Table or view" description="Read a registered relation using your MetaTable access grants.">
      <Picker ariaLabel="Table or view" value={uid} searchable searchValue={search} onSearchValueChange={setSearch} onValueChange={setUid}
        loading={tables.status === "loading"} options={tables.status === "ready" ? tables.data.results.map(table => ({ value: table.uid, label: table.physical_table_name })) : []}
        emptyMessage="No accessible relations. An administrator can import tables and views from this DataSource." />
    </Field>
    {tables.status === "error" && <p role="alert">{tables.error.message}</p>}
    {uid && <RelationRows key={uid} uid={uid} />}
  </ApplicationPageStack>;
}
