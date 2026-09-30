import type { ResourceDetailTabDefinition } from "@dev-mainsequence/command-center-sdk/resource";
import type { DataUpdateDetail, NamespaceRecord, SourceRecord, TableDetail } from "./api";

export const tableDetailTabs: readonly ResourceDetailTabDefinition<TableDetail>[] = [
  { id: "details", label: "Details" },
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
];

export const sourceDetailTabs: readonly ResourceDetailTabDefinition<SourceRecord>[] = [
  { id: "details", label: "Details" },
  { id: "query-builder", label: "Query builder" },
];
