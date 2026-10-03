/** Translate the MetaTables API's public client schema into view records. */
import type { DataUpdateDetail, ResourceGraph, TableDetail, TableRecord } from "./api";

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

export type SchemaGraphApi = {
  root_uid?: string;
  nodes: {
    uid: string;
    identifier?: string | null;
    physical_table_name?: string | null;
    table_kind?: string;
    time_indexed?: boolean;
    namespace?: string | null;
    physical_schema?: string | null;
  }[];
  edges: {
    source_uid: string;
    target_uid: string;
    name?: string;
    on_delete?: string | null;
    source_columns?: string[];
    target_columns?: string[];
  }[];
};

/** The schema graph uses catalog UIDs and table names, rather than renderer fields. */
export function schemaGraphRecord(graph: SchemaGraphApi): ResourceGraph {
  return {
    nodes: graph.nodes.map(node => ({
      id: node.uid,
      label: node.physical_table_name || node.identifier || node.uid,
      kind: node.time_indexed || node.table_kind === "time_indexed" ? "TimeIndexMetaTable" : "MetaTable",
    })),
    edges: graph.edges.map(edge => ({
      source: edge.source_uid,
      target: edge.target_uid,
      label: edge.name,
      on_delete: edge.on_delete,
    })),
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
/** Preserve API error messages; translate codes only when no message is provided. */
/** Codes the API may send as a bare string detail as well as `{ code }`. */
const codeMessages: Record<string, string> = {
  timescale_not_hypertable: "This table is not a TimescaleDB hypertable, so it cannot have compression or retention policies.",
  timescale_version_unsupported: "Compression and retention policies require TimescaleDB 2.11 or later on this DataSource.",
  timescale_extension_missing: "The TimescaleDB extension is not installed in this DataSource’s database.",
  timescale_invalid_interval: "An interval is not valid. Use PostgreSQL interval text such as 12 hours, 7 days or 1 month.",
  timescale_retention_not_after_compression: "Retention must be longer than compression, or chunks would be dropped before they are compressed.",
  write_access_required: "Writer access to this table is required for this change.",
  timescale_invalid_timezone: "The timezone is not valid. Use an IANA name such as UTC or America/New_York.",
  timescale_invalid_policy: "TimescaleDB rejected a policy value. Check the intervals, start time and timezone.",
  timescale_policy_failed: "TimescaleDB could not apply the policies. Nothing was changed.",
  timescale_policies_unavailable: "Compression and retention policies are only available for time-index tables on TimescaleDB.",
  data_source_write_blocked: "This DataSource is read-only. An admin must set its storage access to read-write before changes can be saved.",
  data_source_runtime_access_disabled: "This DataSource is disabled for reads and writes.",
};

function codeMessage(code: string): string | null {
  return Object.hasOwn(codeMessages, code) ? codeMessages[code] : null;
}

export function apiErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") return codeMessage(detail) ?? detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && "code" in detail) {
    if ("detail" in detail && typeof detail.detail === "string" && detail.detail.trim() && detail.detail !== detail.code) {
      return detail.detail;
    }
    const sqlMessages: Record<string, string> = {
      credential_not_found: "This DataSource’s saved credential is missing from the current runtime. Edit the source and save its password or TLS credential again.",
      unsupported_physical_type: "The relation contains a database type this reader cannot serialize.",
      unsupported_relation_contract: "The physical definition could not be represented as a MetaTable contract.",
      existing_relation_not_editable_or_external: "This object is already registered and requires Writer access or has a different ownership mode.",
      database_identity_unavailable: "The API could not verify the physical database identity. Check source metadata permissions.",
      protected_view_dependency: "The view references protected runtime objects and cannot be imported.",
      unsafe_view_dependency: "The runtime view’s dependencies cannot be safely exposed.",
      foreign_key_target_not_imported: "A foreign-key target was outside the import selection; no catalog edge was added.",
      foreign_key_projection_unavailable: "A foreign key could not be linked to a matching registered key.",
      dependent_relation_refresh_required: "Refresh related foreign-key definitions together before changing this table’s registered keys.",
      source_import_requires_admin: "An administrator must list and import new tables and views.",
      relation_discovery_limit_exceeded: "This schema’s table and view list exceeds the discovery response limit. Choose a smaller schema.",
      relation_access_failed: "The source could not be read. Verify its connection and the registered account’s SELECT and metadata permissions.",
      relation_not_found: "The table or view is missing or is not visible to the source account.",
      relation_deadline_exceeded: "Reading the source took too long. Select fewer relations or rows and retry.",
      import_selection_limit_exceeded: "Select at most 200 relations, including foreign-key targets.",
      relation_shape_changed_refresh_required: "The physical definition changed. A table Writer must refresh its metadata before reading.",
      relation_changed_during_import: "The physical definition changed during import. Refresh the source list and retry.",
      external_source_is_runtime_catalog: "This connection points to a MetaTables runtime catalog. Use its runtime DataSource instead.",
      invalid_relation_filter: "A filter value does not match the registered column type.",
      unknown_relation_column: "A selected column is not registered. Refresh the table definition if the source changed.",
      sql_deadline_exceeded: "The query took too long. Try a smaller query or fewer rows.",
      sql_security_not_initialized: "Database permissions need to be initialized before running queries. An admin can do this in Security.",
      sql_permission_reconciliation_pending: "Database permissions are being updated. Try the query again shortly.",
    };
    return typeof detail.code === "string" ? sqlMessages[detail.code] ?? codeMessage(detail.code) ?? detail.code : null;
  }
  if (!Array.isArray(detail)) return null;
  const errors = detail.flatMap(item => {
    if (!item || typeof item !== "object" || typeof item.msg !== "string") return [];
    const field = Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== "body").join(".") : "";
    return [field ? `${field}: ${item.msg}` : item.msg];
  });
  return errors.length ? errors.join("; ") : null;
}

/** Adapt the catalog's run history without inventing an update-specific route. */
export function updateRunRecord(row: {
  uid: string; update_time_start: string; update_time_end?: string | null;
  error_on_update: boolean; trace_id?: string | null; updated_by_user_uid?: string | null;
  root_run_uid?: string | null; table_update_uid?: string; updater_label?: string;
  graph_availability?: string; outcome?: string; job_run_uid?: string | null;
}) {
  const duration = row.update_time_end ? (Date.parse(row.update_time_end) - Date.parse(row.update_time_start)) / 1000 : null;
  return { uid: row.uid, started_at: row.update_time_start, ended_at: row.update_time_end,
    duration_seconds: duration !== null && Number.isFinite(duration) ? Math.max(0, duration) : null,
    result: !row.update_time_end ? "unfinished" : row.error_on_update ? "error" : "success",
    root_run_uid: row.root_run_uid, table_update_uid: row.table_update_uid, updater_label: row.updater_label,
    graph_availability: row.graph_availability, outcome: row.outcome, job_run_uid: row.job_run_uid,
    trace_id: row.trace_id, actor_uid: row.updated_by_user_uid };
}
