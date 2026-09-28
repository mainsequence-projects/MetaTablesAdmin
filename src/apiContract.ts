/** Translate the MetaTables API's public client schema into view records. */
import type { DataUpdateDetail, TableDetail, TableRecord } from "./api";

export type TableApiRecord = Omit<TableDetail, "kind"> & {
  kind?: TableRecord["kind"];
  time_indexed?: boolean;
  table_kind?: string;
  namespace?: string | null;
  creation_date?: string | null;
  data_source?: { display_name?: string | null; class_type?: string | null };
  indexes_meta?: TableDetail["indexes"];
  incoming_fks?: TableDetail["incoming_foreign_keys"];
};

export function tableRecord(row: TableApiRecord): TableDetail {
  return {
    ...row,
    kind: row.kind ?? (row.time_indexed || row.table_kind === "time_indexed" ? "time_index" : "relational"),
    namespace_name: row.namespace_name ?? row.namespace,
    created_at: row.created_at ?? row.creation_date,
    data_source_name: row.data_source_name ?? row.data_source?.display_name,
    engine: row.engine ?? row.data_source?.class_type,
    indexes: row.indexes ?? row.indexes_meta,
    incoming_foreign_keys: row.incoming_foreign_keys ?? row.incoming_fks,
  };
}

export function tableQuery(query: Record<string, string | number | undefined>): Record<string, string | number | boolean | undefined> {
  const { search, kind, ordering, ...filters } = query;
  return {
    ...filters,
    q: search,
    ...(kind === "time_index" ? { time_indexed: true }
      : kind === "row" ? { time_indexed: false, management_mode: "platform_managed" }
        : kind === "external" ? { management_mode: "external_registered" } : {}),
    ordering: typeof ordering === "string" ? ordering.replace(/created_at/g, "creation_date") : ordering,
  };
}

export type UpdateApiRecord = DataUpdateDetail & {
  output_table?: TableApiRecord;
  build_configuration?: Record<string, unknown> | null;
  table_updater_source_code_git_hash?: string | null;
  ogm_dependencies_linked?: boolean;
  update_details?: {
    active_update_status?: string | null;
    active_update?: boolean;
    error_on_last_update?: boolean;
    last_update?: string | null;
    update_pid?: number | null;
    update_priority?: number | null;
    last_updated_by_user_uid?: string | null;
  } | null;
};

export function updateRecord(row: UpdateApiRecord): DataUpdateDetail {
  const details = row.update_details;
  return {
    ...row,
    output_table_uid: row.output_table_uid ?? row.output_table?.uid,
    output_table_identifier: row.output_table_identifier ?? row.output_table?.identifier ?? row.output_table?.physical_table_name,
    status: row.status ?? details?.active_update_status,
    last_update: row.last_update ?? details?.last_update,
    active_update: row.active_update ?? details?.active_update,
    error_on_last_update: row.error_on_last_update ?? details?.error_on_last_update,
    process_id: row.process_id ?? details?.update_pid,
    priority: row.priority ?? details?.update_priority,
    last_actor_uid: row.last_actor_uid ?? details?.last_updated_by_user_uid,
    source_code_hash: row.source_code_hash ?? row.table_updater_source_code_git_hash,
    dependency_links_complete: row.dependency_links_complete ?? row.ogm_dependencies_linked,
    configuration: row.configuration ?? row.build_configuration,
  };
}
