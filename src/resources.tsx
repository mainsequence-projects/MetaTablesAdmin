import { defineResourceApplication, type ResourceListResult } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceIconLabelCell, ResourceStatusCell } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type DataUpdateRecord, type NamespaceRecord, type Page, type TableRecord } from "./api";
import { display, formatDate } from "./ui";

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

export const tablesResource = defineResourceApplication<TableRecord, string>({
  id: "metatables-tables",
  label: "Tables",
  description: "Registered row, external, and time-indexed tables from the MetaTables API.",
  itemLabel: "tables",
  getId: (table) => table.uid,
  adapter: {
    async list({ pageIndex, pageSize, search, filters, sort, signal }) {
      const page = await metaTablesApi.listTables({
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
    { id: "created", header: "Created", sortableKey: "created_at", importance: "tertiary", renderCell: (table) => formatDate(table.created_at) },
  ],
});

export const updatesResource = defineResourceApplication<DataUpdateRecord, string>({
  id: "metatables-updates",
  label: "Data Updates",
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
