import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorDetail, tableQuery, tableRecord, updateRecord } from "../src/apiContract.ts";

test("database validation failures and field errors retain useful API messages", () => {
  assert.equal(apiErrorDetail("Install the mssql driver dependencies on the MetaTables API server."),
    "Install the mssql driver dependencies on the MetaTables API server.");
  assert.equal(apiErrorDetail([{ loc: ["body", "configuration", "port"], msg: "Input should be less than or equal to 65535", input: "private-value" }]),
    "configuration.port: Input should be less than or equal to 65535");
  assert.equal(apiErrorDetail(null), null);
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
