import assert from "node:assert/strict";
import test from "node:test";
import { runtimeMigrationStatus } from "../src/runtimeMigrationStatus.ts";

const initialized = { status: "ready", active: true, current_revisions: ["initial"], required_revisions: ["initial"] };

test("an active DataSource can still have pending system migrations", () => {
  assert.equal(runtimeMigrationStatus({ ...initialized, required_revisions: ["security"], migration_status: "pending" }), "pending");
});

test("database/file heads compare as sets on older APIs", () => {
  assert.equal(runtimeMigrationStatus({ ...initialized, current_revisions: ["branch_a", "branch_b"], required_revisions: ["branch_b", "branch_a"] }), "up_to_date");
  assert.equal(runtimeMigrationStatus({ ...initialized, status: "migration_required", current_revisions: [], required_revisions: ["initial"] }), "pending");
});

test("unreadable and incompatible histories never appear up to date", () => {
  assert.equal(runtimeMigrationStatus({ ...initialized, migration_status: "unavailable" }), "unavailable");
  assert.equal(runtimeMigrationStatus({ ...initialized, status: "incompatible" }), "incompatible");
  assert.equal(runtimeMigrationStatus({ ...initialized, current_revisions: ["future"] }), "incompatible");
  assert.equal(runtimeMigrationStatus({ ...initialized, current_revisions: [], required_revisions: [] }), "incompatible");
});
