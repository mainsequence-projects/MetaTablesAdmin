import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorDetail, schemaGraphRecord, tableQuery, tableRecord, updateRecord, updateRunRecord } from "../src/apiContract.ts";

test("database validation failures and field errors retain useful API messages", () => {
  assert.equal(apiErrorDetail("Install the mssql driver dependencies on the MetaTables API server."),
    "Install the mssql driver dependencies on the MetaTables API server.");
  assert.equal(apiErrorDetail([{ loc: ["body", "configuration", "port"], msg: "Input should be less than or equal to 65535", input: "private-value" }]),
    "configuration.port: Input should be less than or equal to 65535");
  assert.equal(apiErrorDetail(null), null);
});

test("query errors retain database diagnostics and translate only message-less codes", () => {
  assert.equal(apiErrorDetail({ code: "compiled_sql_database_error", detail: "access to sqlite_master.name is prohibited" }),
    "access to sqlite_master.name is prohibited");
  assert.equal(apiErrorDetail({ code: "compiled_sql_database_error", detail: 'near "SELEC": syntax error' }),
    'near "SELEC": syntax error');
  assert.match(apiErrorDetail({ code: "sql_deadline_exceeded" }), /took too long/);
  assert.equal(apiErrorDetail({ code: "unknown_sql_error", detail: "Specific database failure" }), "Specific database failure");
  assert.equal(apiErrorDetail({ code: "compiled_sql_database_error", detail: "compiled_sql_database_error" }), "compiled_sql_database_error");
});

test("Timescale and access codes read as messages in either detail shape", () => {
  assert.match(apiErrorDetail("timescale_not_hypertable"), /not a TimescaleDB hypertable/);
  assert.match(apiErrorDetail({ code: "timescale_version_unsupported" }), /2\.11 or later/);
  assert.match(apiErrorDetail({ code: "timescale_retention_not_after_compression", detail: "timescale_retention_not_after_compression" }), /longer than compression/);
  assert.match(apiErrorDetail("write_access_required"), /Writer access/);
  assert.match(apiErrorDetail({ code: "data_source_write_blocked" }), /read-only/);
  assert.equal(apiErrorDetail({ code: "timescale_invalid_interval", detail: 'invalid input syntax for type interval: "soon"' }),
    'invalid input syntax for type interval: "soon"');
  assert.equal(apiErrorDetail("constructor"), "constructor");
});

test("table filters and sorting use the Python API contract", () => {
  assert.deepEqual(tableQuery({ search: "prices", kind: "row", ordering: "-created_at", limit: 25 }), {
    q: "prices", time_indexed: false, management_mode: "platform_managed", ordering: "-creation_date", limit: 25,
  });
  assert.equal(tableQuery({ kind: "time_index" }).time_indexed, true);
  assert.equal(tableQuery({ kind: "external" }).management_mode, "external_registered");
});

test("the public MetaTable projection populates the SDK views", () => {
  const row = tableRecord({ uid: "table", physical_table_name: "prices", time_indexed: true,
    namespace: "Market", creation_date: "2026-09-28", data_source: { display_name: "Local", class_type: "sqlite" },
    indexes_meta: [{ name: "price_index" }], incoming_fks: [{ name: "price_fk" }],
  });
  assert.equal(row.kind, "time_index");
  assert.equal(row.namespace_name, "Market");
  assert.equal(row.created_at, "2026-09-28");
  assert.equal(row.data_source_name, "Local");
  assert.equal(row.engine, "sqlite");
  assert.equal(row.indexes[0].name, "price_index");
  assert.equal(row.incoming_foreign_keys[0].name, "price_fk");
});

test("nested update output and execution details populate list and detail views", () => {
  const row = updateRecord({ uid: "update", update_hash: "hash", output_table: { uid: "table", identifier: "prices" },
    build_configuration: { window: 5 }, ogm_dependencies_linked: true, table_updater_source_code_git_hash: "sha",
    update_details: { active_update_status: "E", active_update: false, error_on_last_update: true,
      update_pid: 12, update_priority: 2, last_updated_by_user_uid: "user", last_update: "2026-09-28" },
  });
  assert.equal(row.output_table_uid, "table");
  assert.equal(row.output_table_identifier, "prices");
  assert.equal(row.status, "E");
  assert.equal(row.error_on_last_update, true);
  assert.equal(row.process_id, 12);
  assert.equal(row.priority, 2);
  assert.equal(row.last_actor_uid, "user");
  assert.equal(row.last_update, "2026-09-28");
  assert.equal(row.dependency_links_complete, true);
  assert.deepEqual(row.configuration, { window: 5 });
});

test("schema graph labels remain renderable when optional table names are missing", () => {
  const graph = schemaGraphRecord({
    nodes: [
      { uid: "named", physical_table_name: "daily_prices", identifier: "prices", time_indexed: true },
      { uid: "registered", physical_table_name: null, identifier: "instruments", table_kind: "relational" },
      { uid: "unnamed", physical_table_name: null, identifier: null },
    ],
    edges: [],
  });
  assert.deepEqual(graph.nodes.map(node => node.label), ["daily_prices", "instruments", "unnamed"]);
  assert.deepEqual(graph.nodes.map(node => node.kind), ["TimeIndexMetaTable", "MetaTable", "MetaTable"]);
  for (const node of graph.nodes) assert.ok(node.label.length > 0);
  assert.deepEqual(schemaGraphRecord({ nodes: [], edges: [] }), { nodes: [], edges: [] });
});


test("catalog runs retain lifecycle, duration and actor without confusing execution with trace", () => {
  const row = updateRunRecord({ uid: "run", update_time_start: "2026-09-29T10:00:00Z",
    update_time_end: "2026-09-29T10:00:03Z", error_on_update: false, trace_id: "execution", updated_by_user_uid: "user" });
  assert.equal(row.duration_seconds, 3);
  assert.equal(row.result, "success");
  assert.equal(row.actor_uid, "user");
  assert.equal(updateRunRecord({ uid: "run", update_time_start: "2026-09-29T10:00:00Z", error_on_update: false }).result, "unfinished");
  assert.equal(updateRunRecord({ uid: "run", update_time_start: "2026-09-29T10:00:00Z", error_on_update: true }).result, "unfinished");
  assert.equal(updateRunRecord({ uid: "run", update_time_start: "2026-09-29T10:00:00Z", update_time_end: "2026-09-29T10:00:01Z", error_on_update: true }).result, "error");
});
