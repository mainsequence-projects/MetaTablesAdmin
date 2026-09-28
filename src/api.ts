/** MetaTables API transport. The SDK carries hosted requests to this API only. */
import { StaticSiteFastApiCredentialError } from "@dev-mainsequence/command-center-sdk/embed";
import { tableQuery, tableRecord, updateRecord, type TableApiRecord, type UpdateApiRecord } from "./apiContract";

export type Page<T> = {
  count: number;
  results: T[];
  next?: string | null;
  previous?: string | null;
};

export type TableKind = "relational" | "time_index";
export type TableRecord = {
  uid: string;
  identifier?: string | null;
  physical_schema?: string | null;
  physical_table_name: string;
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
    snapshot?: boolean;
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
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  result?: string | null;
  trace_id?: string | null;
  actor_uid?: string | null;
};
export type UpdateLog = {
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
export type PermissionsDocument = {
  assignments: PermissionAssignments;
  candidate_users: Principal[];
  candidate_teams: Principal[];
  can_edit: boolean;
};

export type PolicyConfiguration = {
  enabled?: boolean;
  supported?: boolean;
  after?: string | null;
  schedule_interval?: string | null;
  initial_start?: string | null;
  timezone?: string | null;
  last_modified?: string | null;
};
export type TablePolicies = { compression: PolicyConfiguration; retention: PolicyConfiguration };

export type TableSnapshot = {
  columns: string[];
  rows: Record<string, unknown>[];
  count?: number;
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

/** Set only after the SDK validates a Command Center iframe handshake. */
export function setHostedMetaTablesTransport(transport: HostedTransport | null) {
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
  let response: Response;
  try {
    const resolvedPath = apiPath(path, options.query);
    const init: RequestInit = {
      method,
      headers: { Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    };
    response = hostedTransport
      ? await hostedTransport(resolvedPath.replace(/^\/api(?=\/|$)/, ""), init)
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
    throw new ApiError(hostedTransport
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
    const missingRoute = response.status === 404 && detail === "Not Found";
    const message = missingRoute
      ? "This capability is not exposed by the MetaTables API yet."
      : response.status === 502 || response.status === 503 || response.status === 504
        ? hostedTransport ? "The MetaTables API release is unavailable." : "The MetaTables API is unavailable. Check that the local service is running."
      : typeof detail === "string"
        ? detail
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

export type SourceConfiguration = {
  host: string; port: number; database_name: string; database_user: string;
  default_schema: string; ssl_mode: string; password_secret_uid: string | null;
  tls_ca_secret_uid?: string | null; tls_certificate_secret_uid?: string | null; tls_key_secret_uid?: string | null;
};
export type SourceRecord = {
  uid: string; display_name: string; class_type: string; status: string;
  storage_access_mode: string; is_default: boolean; can_manage: boolean;
  configuration: SourceConfiguration | null; capabilities: string[];
};
export const metaTablesApi = {
  sources: (search: string, offset: number, signal?: AbortSignal) => request<Page<SourceRecord>>("GET", "data-sources/", { query: { search, limit: 25, offset }, signal }),
  source: (uid: string, signal?: AbortSignal) => request<SourceRecord>("GET", `data-sources/${encodeURIComponent(uid)}/`, { signal }),
  createSource: (body: unknown) => request<SourceRecord>("POST", "data-sources/", { body }),
  updateSource: (uid: string, body: unknown) => request<SourceRecord>("PATCH", `data-sources/${encodeURIComponent(uid)}/`, { body }),
  validateSource: (uid: string) => request<SourceRecord>("POST", `data-sources/${encodeURIComponent(uid)}/validate/`, { body: {} }),
  deleteSource: (uid: string) => request<null>("DELETE", `data-sources/${encodeURIComponent(uid)}/`),
  listTables: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    mapPage(page<TableApiRecord>(await request("GET", "meta-tables/", { query: tableQuery(query), signal })), tableRecord),
  table: async (uid: string, signal?: AbortSignal) => tableRecord(await request<TableApiRecord>("GET", `meta-tables/${encodeURIComponent(uid)}/`, { signal })),
  tableDescription: (uid: string, signal?: AbortSignal) => request<{ content: string }>("GET", `meta-tables/${encodeURIComponent(uid)}/search-document`, { signal }),
  tableSnapshot: (uid: string, offset: number, signal?: AbortSignal) => request<TableSnapshot>("GET", `meta-tables/${encodeURIComponent(uid)}/snapshot`, { query: { limit: 50, offset }, signal }),
  tableGraph: (uid: string, depth: number, incoming: boolean, signal?: AbortSignal) => request<ResourceGraph>("GET", `meta-tables/${encodeURIComponent(uid)}/schema-graph`, { query: { depth, include_incoming: incoming }, signal }),
  tableStats: (uid: string, signal?: AbortSignal) => request<Record<string, unknown>>("GET", `meta-tables/${encodeURIComponent(uid)}/stats`, { signal }),
  tableUpdates: async (uid: string, offset: number, signal?: AbortSignal) => page<DataUpdateRecord>(await request("GET", `meta-tables/${encodeURIComponent(uid)}/updates`, { query: { limit: 25, offset }, signal })),
  tablePolicies: (uid: string, signal?: AbortSignal) => request<TablePolicies>("GET", `meta-tables/${encodeURIComponent(uid)}/policies`, { signal }),
  saveTablePolicies: (uid: string, value: TablePolicies) => request<TablePolicies>("PATCH", `meta-tables/${encodeURIComponent(uid)}/policies`, { body: value }),
  tablePermissions: (uid: string, signal?: AbortSignal) => request<PermissionsDocument>("GET", `meta-tables/${encodeURIComponent(uid)}/permissions`, { signal }),
  saveTablePermissions: (uid: string, assignments: PermissionAssignments) => request<PermissionsDocument>("PUT", `meta-tables/${encodeURIComponent(uid)}/permissions`, { body: { assignments } }),
  preflightTableAction: (uid: string, action: string) => request<{ summary: string; affected_count?: number }>("POST", `meta-tables/${encodeURIComponent(uid)}/actions/${encodeURIComponent(action)}/preflight`),
  executeTableAction: (uid: string, action: string) => request<{ message?: string }>("POST", `meta-tables/${encodeURIComponent(uid)}/actions/${encodeURIComponent(action)}/execute`),
  listUpdates: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) => mapPage(page<UpdateApiRecord>(await request("GET", "time-index-table-updates/", { query, signal })), updateRecord),
  update: async (uid: string, signal?: AbortSignal) => updateRecord(await request<UpdateApiRecord>("GET", `time-index-table-updates/${encodeURIComponent(uid)}/`, { signal })),
  updateGraph: (uid: string, direction: string, signal?: AbortSignal) => request<ResourceGraph>("GET", `time-index-table-updates/${encodeURIComponent(uid)}/infra-graph`, { query: { direction }, signal }),
  updateRuns: async (uid: string, offset: number, signal?: AbortSignal) => page<UpdateRun>(await request("GET", `time-index-table-updates/${encodeURIComponent(uid)}/runs`, { query: { limit: 25, offset }, signal })),
  updateLogs: async (uid: string, query: Record<string, string | number | undefined>, signal?: AbortSignal) => page<UpdateLog>(await request("GET", `time-index-table-updates/${encodeURIComponent(uid)}/logs`, { query: { limit: 50, ...query }, signal })),
  listNamespaces: async (query: Record<string, string | number | undefined>, signal?: AbortSignal) => page<NamespaceRecord>(await request("GET", "namespaces/", { query, signal })),
  namespace: (uid: string, signal?: AbortSignal) => request<NamespaceRecord>("GET", `namespaces/${encodeURIComponent(uid)}/`, { signal }),
  namespaceTables: async (uid: string, query: Record<string, string | number | undefined>, signal?: AbortSignal) => mapPage(page<TableApiRecord>(await request("GET", `namespaces/${encodeURIComponent(uid)}/tables/`, { query, signal })), tableRecord),
  namespacePermissions: (uid: string, signal?: AbortSignal) => request<PermissionsDocument>("GET", `namespaces/${encodeURIComponent(uid)}/permissions`, { signal }),
  saveNamespacePermissions: (uid: string, assignments: PermissionAssignments) => request<PermissionsDocument>("PUT", `namespaces/${encodeURIComponent(uid)}/permissions`, { body: { assignments } }),
  propagateNamespacePermissions: (uid: string) => request<{ affected_count: number }>("POST", `namespaces/${encodeURIComponent(uid)}/permissions/propagate`),
};
