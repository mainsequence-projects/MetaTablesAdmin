import type { ResourceDetailTabDefinition } from "@dev-mainsequence/command-center-sdk/resource";
import type { DataUpdateDetail, NamespaceRecord, SourceRecord, TableDetail } from "./api";

export const tableDetailTabs: readonly ResourceDetailTabDefinition<TableDetail>[] = [
  { id: "details", label: "Details" },
  { id: "rows", label: "Rows", isVisible: table => table.kind === "relational" },
  { id: "stats", label: "Stats", isVisible: table => table.kind === "time_index" },
  { id: "description", label: "Description" },
  { id: "ulm-diagram", label: "ULM diagram" },
  { id: "updates", label: "Updates", isVisible: table => table.kind === "time_index" },
  { id: "policies", label: "Timescale Policies", isVisible: table => table.kind === "time_index" && table.capabilities?.timescale_policies === true },
  { id: "permissions", label: "Access" },
];

export const updateDetailTabs: readonly ResourceDetailTabDefinition<DataUpdateDetail>[] = [
  { id: "details", label: "Details" },
  { id: "graphs", label: "Dependencies Graphs" },
  { id: "historical-updates", label: "Historical Updates" },
  { id: "logs", label: "Logs" },
];

export const namespaceDetailTabs: readonly ResourceDetailTabDefinition<NamespaceRecord>[] = [
  { id: "overview", label: "Overview" },
  { id: "tables", label: "Tables" },
  { id: "permissions", label: "Access" },
  { id: "access-map", label: "Access map" },
];

export const sourceDetailTabs: readonly ResourceDetailTabDefinition<SourceRecord>[] = [
  { id: "details", label: "Details" },
  { id: "import", label: "Import", isVisible: source => source.can_import === true },
  { id: "query-builder", label: "Query builder" },
  { id: "timescale-jobs", label: "Jobs", isVisible: source => source.class_type === "timescale_db" },
];
