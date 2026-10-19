import assert from "node:assert/strict";
import test from "node:test";
import { checkFinishedSince, describeCheck } from "../src/securityCheck.ts";

const at = (value) => `at ${value}`;

test("a hosted run counts as finished only once a check that started after the request ends", () => {
  const requested = "2026-10-15T09:00:00.000000+00:00";
  assert.equal(checkFinishedSince(null, requested), false);
  assert.equal(checkFinishedSince({ trigger: "schedule", outcome: "passed", started_at: "2026-10-15T03:00:00.000000+00:00" }, requested), false);
  assert.equal(checkFinishedSince({ trigger: "admin", outcome: "running", started_at: "2026-10-15T09:01:00.000000+00:00" }, requested), false);
  assert.equal(checkFinishedSince({ trigger: "admin", outcome: "failed", started_at: "2026-10-15T09:01:00.000000+00:00" }, requested), true);
});

test("the last check reads as its outcome, trigger and time", () => {
  assert.equal(describeCheck(undefined, at), "Not run yet");
  assert.equal(describeCheck({ trigger: "schedule", outcome: "passed", started_at: "s", finished_at: "f", statements: 0 }, at), "Passed · at f (daily)");
  assert.equal(describeCheck({ trigger: "admin", outcome: "repaired", started_at: "s", finished_at: "f", statements: 1 }, at), "Repaired 1 difference · at f (run by an admin)");
  assert.equal(describeCheck({ trigger: "admin", outcome: "repaired", started_at: "s", finished_at: "f", statements: 3 }, at), "Repaired 3 differences · at f (run by an admin)");
  assert.equal(describeCheck({ trigger: "schedule", outcome: "failed", started_at: "s", finished_at: "f", error: "sql_principal_permission_drift" }, at), "Failed: sql_principal_permission_drift · at f (daily)");
  assert.equal(describeCheck({ trigger: "admin", outcome: "running", started_at: "s" }, at), "Running since at s (run by an admin)");
});
