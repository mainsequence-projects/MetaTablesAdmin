import { defineResourceApplication, type ResourceListResult } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceIconLabelCell, ResourceStatusCell } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type DataUpdateRecord, type NamespaceRecord, type Page, type SourceRecord, type TableRecord, type UpdateRun } from "./api";
import { display, formatDate, JsonBlock } from "./ui";
import { resourceLabels } from "./navigation";
import { DataSourceTypeIcon, sourceEngineLabel } from "./DataSourceTypeIcon";

function result<T>(page: Page<T>, pageIndex: number, pageSize: number): ResourceListResult<T> {
  return {
    items: page.results,
    pageInfo: {
      pageIndex,
      pageSize,
      totalItems: page.count,
      hasNextPage: (pageIndex + 1) * pageSize < page.count,
      hasPreviousPage: pageIndex > 0,
    },
  };
}

function defineTablesResource(timeIndexOnly = false, deep = false) {
  return defineResourceApplication<TableRecord, string>({
    id: timeIndexOnly ? "metatables-time-index-meta-tables" : "metatables-tables",
    label: resourceLabels[timeIndexOnly ? "time-index-meta-tables" : "tables"],
    description: timeIndexOnly ? "Registered MetaTables indexed by time." : "All registered MetaTables, including relational and time-indexed tables.",
    itemLabel: timeIndexOnly ? "Time Index MetaTables" : "MetaTables",
    getId: (table) => table.uid,
    adapter: {
      async list({ pageIndex, pageSize, search, filters, sort, signal }) {
        if (deep && search?.trim()) {
          // Deep search returns one ranked page; an empty box keeps the ordinary list.
          const found = await metaTablesApi.searchTables({
            search,
            limit: pageSize,
            kind: typeof filters?.kind === "string" ? filters.kind : undefined,
            namespace_uid: typeof filters?.namespace_uid === "string" ? filters.namespace_uid : undefined,
          }, timeIndexOnly, signal);
          return result({ count: found.items.length, next: null, previous: null, results: found.items }, 0, pageSize);
        }
        const listTables = timeIndexOnly ? metaTablesApi.listTimeIndexTables : metaTablesApi.listTables;
        const page = await listTables({
          limit: pageSize,
          offset: pageIndex * pageSize,
          search,
          kind: typeof filters?.kind === "string" ? filters.kind : undefined,
          namespace_uid: typeof filters?.namespace_uid === "string" ? filters.namespace_uid : undefined,
          ordering: sort?.[0] ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}` : "physical_table_name",
        }, signal);
        return result(page, pageIndex, pageSize);
      },
    },
    columns: [
      { id: "name", header: "Table", sortableKey: "physical_table_name", importance: "primary", renderCell: (table) => <ResourceIconLabelCell label={table.physical_table_name || table.identifier || table.uid} meta={table.uid} /> },
      { id: "identifier", header: "Identifier", sortableKey: "identifier", importance: "secondary", renderCell: (table) => display(table.identifier, "No identifier") },
      { id: "kind", header: "Kind", importance: "secondary", renderCell: (table) => <ResourceStatusCell label={table.kind === "time_index" ? "Time-indexed" : table.management_mode === "external_registered" ? "External" : "Row table"} tone={table.kind === "time_index" ? "primary" : "neutral"} /> },
      { id: "source", header: "Data source", importance: "tertiary", renderCell: (table) => display(table.data_source_name ?? table.data_source_uid) },
      { id: "namespace", header: "Namespace", importance: "tertiary", renderCell: (table) => display(table.namespace_name) },
      deep
        ? { id: "matched", header: "Matched columns", importance: "secondary", renderCell: (table) => display(table.matched_columns?.join(", "), "Matched by description") }
        : { id: "created", header: "Created", sortableKey: "created_at", importance: "tertiary", renderCell: (table) => formatDate(table.created_at) },
    ],
  });
}

export const tablesResource = defineTablesResource();
export const timeIndexTablesResource = defineTablesResource(true);
export const tablesDeepSearchResource = defineTablesResource(false, true);
export const timeIndexTablesDeepSearchResource = defineTablesResource(true, true);

export const updatesResource = defineResourceApplication<DataUpdateRecord, string>({
  id: "metatables-updates",
  label: resourceLabels["data-updates"],
  description: "Processes that produce time-indexed tables.",
  itemLabel: "updates",
  getId: (update) => update.uid,
  adapter: {
    async list({ pageIndex, pageSize, search, signal }) {
      const page = await metaTablesApi.listUpdates({ limit: pageSize, offset: pageIndex * pageSize, search }, signal);
      return result(page, pageIndex, pageSize);
    },
  },
  columns: [
    { id: "process", header: "Update process", importance: "primary", renderCell: (update) => <ResourceIconLabelCell label={update.update_hash} meta={update.uid} /> },
    { id: "output", header: "Output table", importance: "secondary", renderCell: (update) => display(update.output_table_identifier ?? update.output_table_uid) },
    { id: "status", header: "Status", importance: "secondary", renderCell: (update) => <ResourceStatusCell label={display(update.status)} tone={update.status === "S" ? "success" : update.status === "E" ? "danger" : "neutral"} /> },
    { id: "last", header: "Last update", importance: "tertiary", renderCell: (update) => formatDate(update.last_update) },
    { id: "next", header: "Next update", importance: "tertiary", renderCell: (update) => formatDate(update.next_update) },
  ],
});

export const namespacesResource = defineResourceApplication<NamespaceRecord, string>({
  id: "metatables-namespaces",
  label: "Namespaces",
  description: "Logical groups of registered MetaTables and their permissions.",
  itemLabel: "namespaces",
  getId: (namespace) => namespace.uid,
  adapter: {
    async list({ pageIndex, pageSize, search, signal }) {
      const page = await metaTablesApi.listNamespaces({ limit: pageSize, offset: pageIndex * pageSize, search }, signal);
      return result(page, pageIndex, pageSize);
    },
  },
  columns: [
    { id: "name", header: "Namespace", importance: "primary", renderCell: (namespace) => <ResourceIconLabelCell label={namespace.name} meta={namespace.uid} /> },
    { id: "relational", header: "Relational tables", importance: "secondary", renderCell: (namespace) => namespace.relational_table_count ?? 0 },
    { id: "time-index", header: "Time-indexed tables", importance: "secondary", renderCell: (namespace) => namespace.time_index_table_count ?? 0 },
  ],
});

export const sourcesResource = defineResourceApplication<SourceRecord, string>({
  id: "metatables-data-sources",
  label: resourceLabels["data-sources"],
  description: "Registered databases available to this MetaTables API.",
  itemLabel: "data sources",
  getId: source => source.uid,
  adapter: {
    async list({ pageIndex, pageSize, search, signal }) {
      return result(await metaTablesApi.sources(search ?? "", pageIndex * pageSize, signal, pageSize), pageIndex, pageSize);
    },
  },
  columns: [
    { id: "name", header: "Name", importance: "primary", renderCell: source => <ResourceIconLabelCell icon={<DataSourceTypeIcon engine={source.class_type} />} label={source.display_name} meta={source.uid} /> },
    { id: "engine", header: "Engine", importance: "secondary", renderCell: source => sourceEngineLabel(source.class_type) },
    { id: "status", header: "Status", importance: "secondary", renderCell: source => <ResourceStatusCell label={source.status} tone={source.status === "AVAILABLE" ? "success" : source.status === "FAILED" ? "danger" : "neutral"} /> },
    { id: "access", header: "Access", importance: "secondary", renderCell: source => source.storage_access_mode },
    { id: "default", header: "Default", importance: "tertiary", renderCell: source => source.is_default ? "Yes" : "No" },
  ],
});

export function defineNamespaceTablesResource(uid: string) {
  return defineResourceApplication<TableRecord, string>({
    id: `metatables-namespace-tables-${uid}`,
    label: "MetaTables",
    description: "Registered tables across relational and time-indexed kinds.",
    itemLabel: "tables",
    getId: table => table.uid,
    adapter: {
      async list({ pageIndex, pageSize, search, filters, signal }) {
        return result(await metaTablesApi.namespaceTables(uid, {
          search, kind: typeof filters?.kind === "string" ? filters.kind : undefined,
          limit: pageSize, offset: pageIndex * pageSize,
        }, signal), pageIndex, pageSize);
      },
    },
    columns: tablesResource.columns.map(column => ({ ...column, sortableKey: undefined })),
  });
}

export function defineTableUpdatesResource(uid: string) {
  return defineResourceApplication<DataUpdateRecord, string>({
    id: `metatables-table-updates-${uid}`,
    label: resourceLabels["data-updates"],
    description: "Processes that write to this time-indexed table.",
    itemLabel: "updates",
    getId: update => update.uid,
    adapter: {
      async list({ pageIndex, pageSize, signal }) {
        return result(await metaTablesApi.tableUpdates(uid, pageIndex * pageSize, signal, pageSize), pageIndex, pageSize);
      },
    },
    columns: updatesResource.columns,
  });
}

export function defineUpdateRunsResource(uid: string) {
  return defineResourceApplication<UpdateRun, string>({
    id: `metatables-update-runs-${uid}`,
    label: "Historical Updates",
    description: "Completed and failed executions, newest first.",
    itemLabel: "runs",
    getId: run => run.uid,
    adapter: {
      async list({ pageIndex, pageSize, signal }) {
        return result(await metaTablesApi.updateRuns(uid, pageIndex * pageSize, signal, pageSize), pageIndex, pageSize);
      },
    },
    columns: [
      { id: "started", header: "Started", importance: "primary", renderCell: run => <ResourceIconLabelCell label={formatDate(run.started_at)} meta={run.uid} /> },
      { id: "ended", header: "Ended", importance: "secondary", renderCell: run => formatDate(run.ended_at) },
      { id: "duration", header: "Duration", importance: "secondary", renderCell: run => run.duration_seconds == null ? "Not available" : `${run.duration_seconds.toFixed(1)}s` },
      { id: "result", header: "Result", importance: "secondary", renderCell: run => <ResourceStatusCell label={display(run.result)} tone={run.result?.toLowerCase() === "success" ? "success" : run.result?.toLowerCase() === "error" ? "danger" : "neutral"} /> },
      { id: "trace", header: "Trace", importance: "tertiary", renderCell: run => display(run.trace_id) },
      { id: "actor", header: "Actor", importance: "tertiary", renderCell: run => display(run.actor_uid) },
    ],
  });
}

export const runsResource = defineResourceApplication<UpdateRun, string>({
  id: "metatables-runs",
  label: "Runs",
  description: "Recorded attempts, execution graphs, results and logs.",
  itemLabel: "runs",
  getId: run => run.uid,
  adapter: {
    async list({ pageIndex, pageSize, filters, signal }) {
      const query = Object.fromEntries(["table_update_uid", "outcome", "start_time", "end_time", "root_only"]
        .map(key => [key, typeof filters?.[key] === "string" ? filters[key] : undefined]));
      return result(await metaTablesApi.listRuns({ ...query, limit: pageSize, offset: pageIndex * pageSize }, signal), pageIndex, pageSize);
    },
  },
  columns: [
    { id: "updater", header: "Updater", importance: "primary", renderCell: run => <ResourceIconLabelCell label={display(run.updater_label || run.table_update_uid)} meta={run.uid} /> },
    { id: "started", header: "Started", importance: "primary", renderCell: run => formatDate(run.started_at) },
    { id: "outcome", header: "Outcome", importance: "secondary", renderCell: run => <ResourceStatusCell label={display(run.outcome || run.result)} tone={run.outcome === "succeeded" ? "success" : run.outcome === "failed" ? "danger" : "warning"} /> },
    { id: "ended", header: "Ended", importance: "secondary", renderCell: run => formatDate(run.ended_at) },
    { id: "duration", header: "Duration", importance: "secondary", renderCell: run => run.duration_seconds == null ? "Not available" : `${run.duration_seconds.toFixed(1)}s` },
  ],
});
