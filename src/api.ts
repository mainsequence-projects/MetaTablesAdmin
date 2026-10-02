import type { EntitySummary } from "@dev-mainsequence/command-center-sdk/resource";
/** MetaTables API transport. The SDK carries hosted requests to this API only. */
import { StaticSiteFastApiCredentialError } from "@dev-mainsequence/command-center-sdk/embed";
import { apiErrorDetail, schemaGraphRecord, tableQuery, tableRecord, updateRecord, updateRunRecord, type SchemaGraphApi, type TableApiRecord, type UpdateApiRecord } from "./apiContract";
import { InFlightReads } from "./inFlightReads";
import type { PipelineDirection, UpdatePipeline, HistoricalRunGraph } from "./updatePipeline";

export type Page<T> = {
  count: number;
  results: T[];
  next?: string | null;
  previous?: string | null;
};

export type RuntimeSourceInput = {
  display_name: string;
  class_type: "sqlite" | "postgresql" | "timescale_db" | "mysql" | "mssql";
  configuration: Record<string, string | number | boolean | null>;
};
export type RuntimeBootstrap = {
  status: "unconfigured" | "migration_required" | "registration_required" | "migrating" | "ready" | "incompatible" | "unavailable";
  active: boolean;
  can_configure?: boolean;
  selected_source_uid?: string | null;
  candidate: RuntimeSourceInput | null;
  error: string | null;
  current_revisions: string[];
  required_revisions: string[];
  pending_revisions?: string[];
  migration_status?: "unconfigured" | "up_to_date" | "pending" | "incompatible" | "unavailable" | "migrating" | null;
  migration_error?: string | null;
};

export type RuntimeContext = {
  credential_store?: { provider: "unconfigured" | "sdk_secrets" | "local_encrypted";
    status: "uninitialized" | "unavailable" | "ready" | "managed"; error: string | null } | null;
  is_admin: boolean;
  user_uid?: string;
  local_mode: boolean;
  local_mode_available: boolean;
  runtime_switch_available: boolean;
  runtime_instance_id: string | null;
  runtime_switch_error: string | null;
  api_endpoint: string;
  hosted_environment: {
    uid: string | null;
    status: "verified" | "not_found" | "unavailable" | "not_configured";
    name: string | null;
    is_production: boolean | null;
    required_repository_branch: string | null;
  } | null;
  hosted_environment_target?: RuntimeContext["hosted_environment"];
  git_source: Record<string, string> | null;
  data_source_selection: "local_workspace" | "catalog_default" | "runtime_override" | "runtime_binding";
  bootstrap: RuntimeBootstrap | null;
  data_source_error: string | null;
  data_source: {
    uid: string; class_type: string; status: string;
    display_name: string | null; storage_access_mode: string;
  } | null;
  dialect: "sqlite" | "postgresql" | "mysql" | "mssql" | null;
  paramstyle: "named" | "pyformat" | "qmark" | null;
  default_schema: string | null;
};

export type TableKind = "relational" | "time_index";
export type TableRecord = {
  uid: string;
  identifier?: string | null;
  physical_schema?: string | null;
  physical_table_name: string;
  relation_kind?: "table" | "view";
  description?: string | null;
  kind: TableKind;
  management_mode?: "platform_managed" | "external_registered";
  provisioning_status?: "reserved" | "active";
  namespace_uid?: string | null;
  namespace_name?: string | null;
  data_source_uid?: string | null;
  data_source_name?: string | null;
  engine?: string | null;
  cadence?: string | null;
  created_at?: string | null;
  labels?: string[];
};

export type TableColumn = {
  name: string;
  logical_name?: string | null;
  ordinal_position?: number;
  ordinal?: number;
  label?: string | null;
  data_type?: string | null;
  backend_type?: string | null;
  nullable?: boolean;
  primary_key?: boolean;
  unique?: boolean;
  description?: string | null;
};
export type TableIndex = {
  name: string;
  columns?: string[];
  unique?: boolean;
  method?: string | null;
  expression?: string | null;
};
export type TableForeignKey = {
  name: string;
  source_columns?: string[];
  target_table_uid?: string | null;
  target_columns?: string[];
  on_delete?: string | null;
};
export type TableDetail = TableRecord & {
  permissions?: { read: boolean; write: boolean; manage_access: boolean };
  columns?: TableColumn[];
  indexes?: TableIndex[];
  foreign_keys?: TableForeignKey[];
  incoming_foreign_keys?: TableForeignKey[];
  protect_from_deletion?: boolean;
  contract_version?: string | null;
  generated_search_document?: boolean;
  capabilities?: {
    stats?: boolean;
    updates?: boolean;
    timescale_policies?: boolean;
    schema_graph?: boolean;
    permissions?: boolean;
  };
  actions?: ResourceAction[];
};

export type ResourceAction = {
  id: string;
  label: string;
  enabled?: boolean;
  destructive?: boolean;
  confirmation?: string | null;
};

export type DataUpdateRecord = {
  uid: string;
  update_hash: string;
  output_table_uid?: string | null;
  output_table_identifier?: string | null;
  status?: string | null;
  last_update?: string | null;
  next_update?: string | null;
  scheduler?: string | null;
  source_code_hash?: string | null;
  created_at?: string | null;
};
export type DataUpdateDetail = DataUpdateRecord & {
  dependency_links_complete?: boolean;
  active_update?: boolean;
  error_on_last_update?: boolean;
  process_id?: number | null;
  priority?: number | null;
  last_actor_uid?: string | null;
  configuration?: Record<string, unknown> | null;
};
export type UpdateRun = {
  uid: string;
  root_run_uid?: string | null;
  table_update_uid?: string;
  updater_label?: string;
  graph_availability?: string;
  outcome?: string;
  job_run_uid?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  result?: string | null;
  trace_id?: string | null;
  actor_uid?: string | null;
};
export type UpdateLogPage = {
  rows: UpdateLog[]; next_cursor: string | null; availability: string; truncated: boolean;
  run_statuses: Record<string, string>; start_time: string; end_time: string;
};
export type UpdateLog = {
  run_uid?: string;
  event?: string;
  uid?: string;
  timestamp?: string | null;
  level?: string | null;
  message?: string | null;
  source?: string | null;
  context?: Record<string, unknown> | null;
};

export type NamespaceRecord = {
  uid: string;
  name: string;
  description?: string | null;
  relational_table_count?: number;
  time_index_table_count?: number;
  created_at?: string | null;
  visibility?: "public" | "private";
};
export type NamespaceTable = {
  uid: string;
  identifier?: string | null;
  physical_table_name?: string | null;
  kind: TableKind;
  created_at?: string | null;
};

export type GraphNode = { id: string; label: string; kind?: string; href?: string | null };
export type GraphEdge = { source: string; target: string; label?: string | null; on_delete?: string | null };
export type ResourceGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type Principal = { uid: string; name: string; email?: string | null };
export type PermissionAssignments = {
  view: { users: string[]; teams: string[] };
  edit: { users: string[]; teams: string[] };
};
export type GrantContribution = { grant_uid: string; source: "direct" | "namespace"; namespace_uid: string | null; principal_kind: "user" | "team"; principal_uid: string; access_level: "reader" | "writer" };
export type AccessPreview = { user_uid: string; effective_access: "reader" | "writer" | null; remaining_access: "reader" | "writer" | null; contributions: GrantContribution[]; remaining_contributions: GrantContribution[] };
export type AccessEvent = { uid: string; actor_user_uid: string | null; principal_kind: string; principal_uid: string; previous_access: string | null; new_access: string | null; created_at: string; reason: string };
export type PermissionsDocument = {
  revision: string;
  grants: { uid: string; principal_kind: string; principal_uid: string; access_level: string }[];
  effective_access: "reader" | "writer" | null;
  contributions: GrantContribution[];
  inherited: GrantContribution[];
  assignments: PermissionAssignments;
  candidate_users: Principal[];
  candidate_teams: Principal[];
  can_edit: boolean;
};

/** TimescaleDB stores each policy as a background job; `after: null` removes it. */
export type TimescalePolicy = {
  after: string | null;
  schedule_interval?: string | null;
  initial_start?: string | null;
  timezone?: string | null;
};
export type TimescalePolicyState = TimescalePolicy & { job_id: number | null };
export type TimescaleJob = {
  job_id: number;
  kind: "compression" | "retention" | "other";
  proc_name: string;
  table_uid: string | null;
  table_identifier: string | null;
  hypertable_schema: string | null;
  hypertable_name: string | null;
  scheduled: boolean;
  status: "Scheduled" | "Running" | "Paused" | "Failed";
  schedule_interval: string | null;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_successful_finish: string | null;
  next_start: string | null;
  total_runs: number | null;
  total_failures: number | null;
  last_error: string | null;
};
export type TimescaleTablePolicies = {
  table_uid: string;
  can_edit: boolean;
  /** `reason`: timescale_extension_missing, timescale_version_unsupported or timescale_not_hypertable. */
  eligibility: { eligible: boolean; reason: string | null; timescale_version: string | null };
  compression: TimescalePolicyState;
  retention: TimescalePolicyState;
  compression_settings: { segmentby: string[]; orderby: string };
  compression_stats: { total_chunks: number | null; compressed_chunks: number | null; before_bytes: number | null; after_bytes: number | null } | null;
  jobs: TimescaleJob[];
};
export type TimescalePoliciesUpdate = { compression: TimescalePolicy; retention: TimescalePolicy };
export type TimescaleJobsPage = {
  data_source_uid: string;
  timescale_version: string | null;
  policy_count: number;
  failed_count: number;
  jobs: TimescaleJob[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly missingRoute = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type HostedTransport = (path: string, init: RequestInit) => Promise<Response>;
let hostedTransport: HostedTransport | null = null;
let runtimeInstance: string | null = null;
// The API rejects requests stamped with a runtime instance it has replaced,
// for example after another tab activated a DataSource.
const RUNTIME_CHANGED = "API runtime changed; reload its context before continuing.";
const runtimeChangeListeners = new Set<() => void>();

/** Called when the API now serves a newer runtime than this page has loaded. */
export function onRuntimeChanged(listener: () => void) {
  runtimeChangeListeners.add(listener);
  return () => { runtimeChangeListeners.delete(listener); };
}
const inFlightReads = new InFlightReads();
let transportGeneration = 0;

/** Set only after the SDK validates a Command Center iframe handshake. */
export function setHostedMetaTablesTransport(transport: HostedTransport | null) {
  inFlightReads.invalidate();
  transportGeneration++;
  runtimeInstance = null;
  hostedTransport = transport;
}

function apiPath(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`/api/${path.replace(/^\//, "")}`, window.location.origin);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }
  return url.pathname + url.search;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const transport = hostedTransport;
  const instance = runtimeInstance;
  if (method === "GET") {
    const key = JSON.stringify([transportGeneration, instance, apiPath(path, options.query)]);
    return inFlightReads.run(key,
      signal => sendRequest<T>(method, path, { ...options, signal }, transport, instance), options.signal);
  }
  inFlightReads.invalidate();
  try {
    return await sendRequest<T>(method, path, options, transport, instance);
  } finally {
    inFlightReads.invalidate();
  }
}

async function sendRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    signal?: AbortSignal;
  },
  transport: HostedTransport | null,
  instance: string | null,
): Promise<T> {
  let response: Response;
  try {
    const resolvedPath = apiPath(path, options.query);
    const init: RequestInit = {
      method,
      headers: { Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(instance && path !== "runtime-context/" ? { "X-MetaTables-Runtime-Instance": instance } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    };
    response = transport
      ? await transport(resolvedPath.replace(/^\/api(?=\/|$)/, ""), init)
      : await fetch(resolvedPath, { ...init, credentials: "include" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof StaticSiteFastApiCredentialError) {
      const messages = {
        access_denied: "The hosted session cannot access the MetaTables API.",
        origin_not_allowed: "This site origin is not allowed to access the MetaTables API release.",
        release_unavailable: "The MetaTables API release is unavailable.",
        runtime_starting: "The MetaTables API runtime is starting. Retry in a moment.",
        temporarily_unavailable: "The MetaTables API is temporarily unavailable. Retry in a moment.",
        invalid_request: "The MetaTables API release configuration is invalid.",
        unsupported: "The Command Center host does not support delegated MetaTables API access.",
      };
      throw new ApiError(messages[error.code], 0);
    }
    throw new ApiError(transport
      ? "Could not reach the delegated MetaTables API release."
      : "Could not reach the MetaTables API. Check that the local API is running.", 0);
  }

  const raw = await response.text();
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new ApiError("The MetaTables API returned a response that is not JSON.", response.status);
  }
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? (payload as { detail: unknown }).detail
      : null;
    if (response.status === 409 && detail === RUNTIME_CHANGED) {
      // Adopt the API's current runtime instead of asking the user to reload.
      inFlightReads.invalidate();
      runtimeChangeListeners.forEach(listener => listener());
      throw new ApiError("The API runtime changed; reloading its context.", response.status);
    }
    const missingRoute = response.status === 404 && detail === "Not Found";
    const apiMessage = apiErrorDetail(detail);
    const message = missingRoute
      ? "The MetaTables API endpoint for this view is unavailable."
      : apiMessage !== null
        ? apiMessage
      : response.status === 502 || response.status === 503 || response.status === 504
        ? transport ? "The MetaTables API release is unavailable." : "The MetaTables API is unavailable. Check that the local service is running."
        : response.status === 401
          ? "The MetaTables API did not admit this request. Check its local or hosted authentication setup."
          : response.status === 403
            ? "You do not have permission to view this resource."
            : `MetaTables API request failed (${response.status}).`;
    throw new ApiError(message, response.status, missingRoute);
  }
  return payload as T;
}

function page<T>(value: unknown): Page<T> {
  if (!value || typeof value !== "object") throw new ApiError("Invalid page response from MetaTables API.", 200);
  const result = value as Partial<Page<T>>;
  if (!Array.isArray(result.results) || typeof result.count !== "number") {
    throw new ApiError("Invalid page response from MetaTables API.", 200);
  }
  return result as Page<T>;
}

function mapPage<T, U>(value: Page<T>, project: (row: T) => U): Page<U> {
  return { ...value, results: value.results.map(project) };
}

export type { SourceConfiguration, SourceEngine } from "./sourceConfiguration";
import type { SourceConfiguration, SourceEngine } from "./sourceConfiguration";
export type SourcePatch = {
  display_name?: string; configuration?: SourceConfiguration;
  storage_access_mode?: string; is_default?: boolean;
  password?: string;
};
export type SourceCreate = SourcePatch & {
  display_name: string; class_type: SourceEngine; configuration: SourceConfiguration;
};
export type SourceSummary = EntitySummary & { extensions?: { runtime_managed?: boolean } };
export type DatabasePermissionStatus = {
  status: "ready" | "pending" | "repair_required";
  sql_enabled: boolean;
  synchronization_pending: boolean;
  data_source_uid: string;
  data_source_name: string;
  engine: string;
  enforcement: "sqlite_authorizer" | "database_roles";
  active_tables: number;
  covered_tables: number;
  missing_policies: number;
  tables: { uid: string; name: string; schema: string | null; policy_present: boolean; writes_supported: boolean }[];
};
export type SourceQueryResult = {
  ok: boolean; results: Record<string, unknown>[]; row_count: number;
  truncated: boolean; max_rows: number; error: string | null;
};
export type SourceRecord = {
  uid: string; display_name: string; class_type: string; status: string;
  storage_access_mode: string; is_default: boolean; can_manage: boolean; can_import?: boolean;
  configuration: SourceConfiguration | null;
};
export type RelationImportRequest = {
  data_source_uid: string; physical_schema?: string | null; namespace?: string | null;
  relation_names?: string[]; exclude_relation_names?: string[]; include_views?: boolean;
  follow_foreign_keys?: boolean; refresh_existing?: boolean; dry_run?: boolean; strict?: boolean;
};
export type DiscoveredRelation = {
  name: string; relation_kind: "table" | "view"; meta_table_uid: string | null;
  importable: boolean; blocked_reason: string | null;
};
export type RelationDiscovery = { data_source_uid: string; physical_schema: string; relations: DiscoveredRelation[] };
export type RelationImportResult = {
  ok: boolean; committed: boolean; dry_run: boolean; counts: Record<string, number>;
  relations: { name: string; relation_kind: string | null; status: string; error?: string; meta_table_uid: string | null }[];
  warnings: { code: string; name: string }[]; stale: { name: string; meta_table_uid: string; reason: string }[];
};
export type RelationReadRequest = {
  columns?: string[]; filters?: { column: string; operator?: "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "in" | "is_null"; value: unknown }[];
  order_by?: { column: string; direction: "asc" | "desc" }[]; limit?: number; offset?: number;
};
export type RelationRowsResult = { rows: Record<string, unknown>[]; columns: string[]; has_more: boolean; limit: number; offset: number };
export const metaTablesApi = {
  discoverSourceRelations: (uid: string, physicalSchema?: string, signal?: AbortSignal) => request<RelationDiscovery>("GET", `data-sources/${encodeURIComponent(uid)}/relations/`, { query: { physical_schema: physicalSchema || undefined }, signal }),
  importRelations: (body: RelationImportRequest, signal?: AbortSignal) => request<RelationImportResult>("POST", "meta-tables/import-from-data-source/", { body, signal }),
  refreshRelation: (uid: string) => request<{ ok: boolean }>("POST", `meta-tables/${encodeURIComponent(uid)}/introspect/`, { body: {} }),
  readRelation: (uid: string, body: RelationReadRequest, signal?: AbortSignal) => request<RelationRowsResult>("POST", `meta-tables/${encodeURIComponent(uid)}/read/`, { body, signal }),
  configureRuntimeSource: (body: RuntimeSourceInput) => request<RuntimeBootstrap>("POST", "runtime-bootstrap/configure/", { body }),
  selectHostedSource: (uid: string) => request<RuntimeBootstrap>("POST", "runtime-bootstrap/select/", { body: { source_uid: uid } }),
  migrateRuntimeSource: () => request<RuntimeBootstrap>("POST", "runtime-bootstrap/migrate/"),
  activateRuntimeSource: () => request<RuntimeBootstrap>("POST", "runtime-bootstrap/activate/"),
  destroyLocalRuntime: (path: string, confirmation: string) => request<RuntimeBootstrap>("POST", "runtime-bootstrap/destroy-local/", { body: { path, confirmation } }),
  runtimeContext: async (signal?: AbortSignal) => {
    const generation = transportGeneration;
    const context = await request<RuntimeContext>("GET", "runtime-context/", { signal });
    if (!signal?.aborted && generation === transportGeneration && runtimeInstance !== context.runtime_instance_id) {
      inFlightReads.invalidate();
      runtimeInstance = context.runtime_instance_id;
    }
    return context;
  },
  selectRuntime: (mode: "local" | "hosted", signal?: AbortSignal) =>
    request<{ mode: "local" | "hosted"; restarting: boolean }>("POST", "runtime-mode/", { body: { mode }, signal }),
  sources: (search: string, offset: number, signal?: AbortSignal, limit = 25) => request<Page<SourceRecord>>("GET", "data-sources/", { query: { search, limit, offset }, signal }),
  sourceSummary: (uid: string, signal?: AbortSignal) => request<SourceSummary>("GET", `data-sources/${encodeURIComponent(uid)}/summary/`, { signal }),
  source: (uid: string, signal?: AbortSignal) => request<SourceRecord>("GET", `data-sources/${encodeURIComponent(uid)}/`, { signal }),
  createSource: (body: SourceCreate) => request<SourceRecord>("POST", "data-sources/", { body }),
  testSourceConnection: async (body: SourceCreate) => {
    try {
      return await request<{ ok: boolean; message: string }>("POST", "data-sources/test-connection/", { body });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
        throw new ApiError("The running MetaTables API does not support this connection test. Restart or update the API, then retry.", error.status);
      }
      throw error;
    }
  },
  updateSource: (uid: string, body: SourcePatch) => request<SourceRecord>("PATCH", `data-sources/${encodeURIComponent(uid)}/`, { body }),
  validateSource: (uid: string) => request<SourceRecord>("POST", `data-sources/${encodeURIComponent(uid)}/validate/`, { body: {} }),
  deleteSource: (uid: string) => request<null>("DELETE", `data-sources/${encodeURIComponent(uid)}/`),
  timescaleJobs: (uid: string, signal?: AbortSignal) => request<TimescaleJobsPage>("GET", `data-sources/${encodeURIComponent(uid)}/timescale-jobs/`, { signal }),
  runSourceQuery: (uid: string, sql: string, maxRows: number, offset = 0, signal?: AbortSignal) =>
    request<SourceQueryResult>("POST", "meta-tables/run-query/", {
      body: { data_source_uid: uid, sql, limits: { max_rows: maxRows, offset, statement_timeout_ms: 15000 } }, signal,
    }),
  listTables: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    mapPage(page<TableApiRecord>(await request("GET", "meta-tables/", { query: tableQuery(query), signal })), tableRecord),
  table: async (uid: string, signal?: AbortSignal) => tableRecord(await request<TableApiRecord>("GET", `meta-tables/${encodeURIComponent(uid)}/`, { signal })),
  listTimeIndexTables: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    mapPage(page<TableApiRecord>(await request("GET", "time-index-meta-tables/", { query: tableQuery(query), signal })), tableRecord),
  timeIndexTable: async (uid: string, signal?: AbortSignal) => tableRecord(await request<TableApiRecord>("GET", `time-index-meta-tables/${encodeURIComponent(uid)}/`, { signal })),
  tableDescription: (uid: string, signal?: AbortSignal) => request<{ content: string }>("GET", `meta-tables/${encodeURIComponent(uid)}/search-document/`, { signal }),
  tableGraph: async (uid: string, depth: number, incoming: boolean, signal?: AbortSignal) => schemaGraphRecord(await request<SchemaGraphApi>("GET", `meta-tables/${encodeURIComponent(uid)}/schema-graph`, { query: { depth, include_incoming: incoming }, signal })),
  tableSchemaGraph: (uid: string, depth: number, incoming: boolean, signal?: AbortSignal) => request<SchemaGraphApi>("GET", `meta-tables/${encodeURIComponent(uid)}/schema-graph`, { query: { depth, include_incoming: incoming }, signal }),
  tableStats: (uid: string, signal?: AbortSignal) => request<Record<string, unknown>>("GET", `meta-tables/${encodeURIComponent(uid)}/stats`, { signal }),
  tableUpdates: async (uid: string, offset: number, signal?: AbortSignal, limit = 25) => mapPage(page<UpdateApiRecord>(await request("GET", "time-index-table-updates/", { query: { output_table__uid: uid, limit, offset }, signal })), updateRecord),
  tableUpdatePipeline: (uid: string, signal?: AbortSignal, options: { direction?: PipelineDirection; updateUid?: string } = {}) => request<UpdatePipeline>("GET", `meta-tables/${encodeURIComponent(uid)}/update-graph/`, { query: { direction: options.direction, update_uid: options.updateUid }, signal }),
  timescalePolicies: (uid: string, signal?: AbortSignal) => request<TimescaleTablePolicies>("GET", `meta-tables/${encodeURIComponent(uid)}/timescale-policies/`, { signal }),
  saveTimescalePolicies: (uid: string, body: TimescalePoliciesUpdate) => request<TimescaleTablePolicies>("PUT", `meta-tables/${encodeURIComponent(uid)}/timescale-policies/`, { body }),
  securityResources: (search: string, offset: number, signal?: AbortSignal) => request<{ tables: Principal[]; namespaces: Principal[] }>("GET", "security/resources/", { query: { search, offset }, signal }),
  createSecurityNamespace: (name: string) => request<Principal>("POST", "security/namespaces/", { body: { name } }),
  databasePermissionStatus: (signal?: AbortSignal) => request<DatabasePermissionStatus>("GET", "security/database-permissions/", { signal }),
  reconcilePermissions: () => request<{ ok: boolean; data_source_uid: string }>("POST", "security/reconcile/"),
  effectiveAccess: (uid: string, userUid: string, withoutGrantUid?: string) => request<AccessPreview>("GET", `meta-tables/${encodeURIComponent(uid)}/effective-access/`, { query: { user_uid: userUid, without_grant_uid: withoutGrantUid } }),
  accessHistory: (uid: string, namespace = false) => request<AccessEvent[]>("GET", namespace ? "security/access-history/" : `meta-tables/${encodeURIComponent(uid)}/access-history/`, { query: namespace ? { kind: "namespace", uid } : undefined }),
  tablePermissions: (uid: string, signal?: AbortSignal) => request<PermissionsDocument>("GET", `meta-tables/${encodeURIComponent(uid)}/permissions`, { signal }),
  saveTablePermissions: (uid: string, assignments: PermissionAssignments, revision: string) => request<PermissionsDocument>("PUT", `meta-tables/${encodeURIComponent(uid)}/permissions`, { body: { assignments, revision } }),
  preflightTableAction: (uid: string, action: string) => request<{ summary: string; affected_count?: number }>("POST", `meta-tables/${encodeURIComponent(uid)}/actions/${encodeURIComponent(action)}/preflight`),
  executeTableAction: (uid: string, action: string) => request<{ message?: string }>("POST", `meta-tables/${encodeURIComponent(uid)}/actions/${encodeURIComponent(action)}/execute`),
  listUpdates: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) => mapPage(page<UpdateApiRecord>(await request("GET", "time-index-table-updates/", { query, signal })), updateRecord),
  update: async (uid: string, signal?: AbortSignal) => updateRecord(await request<UpdateApiRecord>("GET", `time-index-table-updates/${encodeURIComponent(uid)}/`, { signal })),
  updateRuns: async (uid: string, offset: number, signal?: AbortSignal, limit = 25) => mapPage(page<Parameters<typeof updateRunRecord>[0]>(await request("GET", "table-update-runs/", { query: { table_update_uid: uid, limit, offset }, signal })), updateRunRecord),
  tableRuns: async (uid: string, offset: number, signal?: AbortSignal, limit = 25) => mapPage(page<Parameters<typeof updateRunRecord>[0]>(await request("GET", "table-update-runs/", { query: { output_table_uid: uid, limit, offset }, signal })), updateRunRecord),
  listRuns: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) => mapPage(page<Parameters<typeof updateRunRecord>[0]>(await request("GET", "table-update-runs/", { query, signal })), updateRunRecord),
  run: async (uid: string, signal?: AbortSignal) => updateRunRecord(await request<Parameters<typeof updateRunRecord>[0]>("GET", `table-update-runs/${encodeURIComponent(uid)}/`, { signal })),
  runGraph: (uid: string, signal?: AbortSignal) => request<HistoricalRunGraph>("GET", `table-update-runs/${encodeURIComponent(uid)}/graph/`, { signal }),
  invocationLogs: (uid: string, query: Record<string, string | number | undefined>, signal?: AbortSignal) => request<UpdateLogPage>("GET", `table-update-runs/${encodeURIComponent(uid)}/invocation-logs/`, { query, signal }),
  updateLogs: async (uid: string, query: Record<string, string | number | undefined>, signal?: AbortSignal) => request<UpdateLogPage>("GET", `time-index-table-updates/${encodeURIComponent(uid)}/logs/`, { query: { limit: 50, ...query }, signal }),
  listNamespaces: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) => page<NamespaceRecord>(await request("GET", "namespaces/", { query, signal })),
  namespace: (uid: string, signal?: AbortSignal) => request<NamespaceRecord>("GET", `namespaces/${encodeURIComponent(uid)}/`, { signal }),
  namespaceTables: async (uid: string, query: Record<string, string | number | undefined>, signal?: AbortSignal) => mapPage(page<TableApiRecord>(await request("GET", `namespaces/${encodeURIComponent(uid)}/tables/`, { query, signal })), tableRecord),
  namespacePermissions: (uid: string, signal?: AbortSignal) => request<PermissionsDocument>("GET", `namespaces/${encodeURIComponent(uid)}/permissions`, { signal }),
  saveNamespacePermissions: (uid: string, assignments: PermissionAssignments, revision: string) => request<PermissionsDocument>("PUT", `namespaces/${encodeURIComponent(uid)}/permissions`, { body: { assignments, revision } }),
};
