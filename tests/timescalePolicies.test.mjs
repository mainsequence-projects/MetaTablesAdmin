import assert from "node:assert/strict";
import test from "node:test";
import { draftAfter, draftError, formatBytes, formatInterval, intervalHours, parseInterval, policyDraft, policyRequest, retentionCutoff, retentionNeedsConfirmation, retentionOrderError } from "../src/timescalePolicies.ts";

const draft = (after, kind = "compression") => policyDraft({ after }, kind);

test("PostgreSQL interval output becomes one amount and unit", () => {
  assert.deepEqual(parseInterval("30 days"), { amount: 30, unit: "days" });
  assert.deepEqual(parseInterval("1 day"), { amount: 1, unit: "days" });
  assert.deepEqual(parseInterval("14 days"), { amount: 14, unit: "days" });
  assert.deepEqual(parseInterval("1 mon"), { amount: 1, unit: "months" });
  assert.deepEqual(parseInterval("2 mons"), { amount: 2, unit: "months" });
  assert.deepEqual(parseInterval("1 year"), { amount: 1, unit: "years" });
  assert.deepEqual(parseInterval("12:00:00"), { amount: 12, unit: "hours" });
  assert.deepEqual(parseInterval("36:00:00"), { amount: 36, unit: "hours" });
  assert.deepEqual(parseInterval(" 2 Weeks "), { amount: 2, unit: "weeks" });
});

test("intervals with several parts or unknown units are not reduced to one unit", () => {
  for (const text of ["1 day 12:00:00", "1 year 2 mons", "00:30:00", "12:30:00", "5 minutes", "1 constructor", "days", "", null, undefined]) {
    assert.equal(parseInterval(text), null, String(text));
  }
});

test("an amount and unit format as interval text PostgreSQL accepts", () => {
  assert.equal(formatInterval({ amount: 1, unit: "days" }), "1 day");
  assert.equal(formatInterval({ amount: 30, unit: "days" }), "30 days");
  assert.equal(formatInterval({ amount: 2, unit: "weeks" }), "2 weeks");
  assert.equal(formatInterval({ amount: 1, unit: "months" }), "1 month");
  assert.equal(formatInterval({ amount: 12, unit: "hours" }), "12 hours");
});

test("durations compare approximately, as PostgreSQL compares intervals", () => {
  assert.equal(intervalHours("12 hours"), 12);
  assert.equal(intervalHours("12:00:00"), 12);
  assert.equal(intervalHours("1 day 12:00:00"), 36);
  assert.equal(intervalHours("2 weeks"), 336);
  assert.equal(intervalHours("1 mon"), 720);
  assert.equal(intervalHours("1 year 2 mons"), 8760 + 1440);
  assert.equal(intervalHours("00:30:00"), 0.5);
  assert.equal(intervalHours("soon"), null);
  assert.equal(intervalHours("3 fortnights"), null);
  assert.equal(intervalHours(null), null);
});

test("loaded policies become drafts and round-trip unchanged", () => {
  const compression = policyDraft({ after: "7 days", schedule_interval: "12:00:00", initial_start: "2026-10-01T00:00:00+00:00", timezone: "UTC", job_id: 1000 }, "compression");
  assert.deepEqual(compression, { enabled: true, amount: "7", unit: "days", raw: null, schedule_interval: "12:00:00", initial_start: "2026-10-01T00:00:00+00:00", timezone: "UTC" });
  assert.deepEqual(policyRequest(compression), { after: "7 days", schedule_interval: "12:00:00", initial_start: "2026-10-01T00:00:00+00:00", timezone: "UTC" });
  assert.equal(draftAfter(draft("1 mon")), "1 month");
});

test("a policy without an interval starts off with a suggested value and saves as removed", () => {
  const off = policyDraft({ after: null, schedule_interval: "1 day", job_id: null }, "retention");
  assert.equal(off.enabled, false);
  assert.deepEqual([off.amount, off.unit], ["1", "years"]);
  assert.deepEqual(policyRequest(off), { after: null, schedule_interval: null, initial_start: null, timezone: null });
  assert.equal(draftAfter({ ...off, enabled: true }), "1 year");
});

test("unparseable intervals are kept as plain text", () => {
  const value = draft("1 day 12:00:00");
  assert.equal(value.raw, "1 day 12:00:00");
  assert.equal(draftAfter(value), "1 day 12:00:00");
  assert.equal(draftError({ ...value, raw: " " }), "Enter an interval such as 30 days.");
});

test("the amount must be a positive whole number", () => {
  for (const amount of ["0", "-1", "1.5", "", "abc"]) assert.match(draftError({ ...draft("7 days"), amount }), /whole number/);
  assert.equal(draftError({ ...draft("7 days"), amount: "3" }), null);
  assert.equal(draftError({ ...draft("7 days"), amount: "0", enabled: false }), null);
});

test("retention must be longer than compression when both are on", () => {
  assert.equal(retentionOrderError(draft("7 days"), draft("30 days", "retention")), null);
  assert.match(retentionOrderError(draft("30 days"), draft("7 days", "retention")), /longer than compression/);
  assert.match(retentionOrderError(draft("30 days"), draft("1 mon", "retention")), /longer than compression/);
  assert.match(retentionOrderError(draft("1 week"), draft("1 day 12:00:00", "retention")), /longer than compression/);
  assert.equal(retentionOrderError(draft("2 years"), { ...draft("7 days", "retention"), enabled: false }), null);
  assert.equal(retentionOrderError(draft("7 days"), { ...draft("7 days", "retention"), raw: "whenever" }), null, "unreadable text is left to the API");
});

test("retention asks for confirmation when turned on or changed", () => {
  assert.equal(retentionNeedsConfirmation(draft("30 days", "retention"), { after: "30 days" }), false);
  assert.equal(retentionNeedsConfirmation(draft("1 mon", "retention"), { after: "1 mon" }), false);
  assert.equal(retentionNeedsConfirmation({ ...draft("1 mon", "retention"), unit: "years" }, { after: "1 mon" }), true);
  assert.equal(retentionNeedsConfirmation({ ...draft(null, "retention"), enabled: true }, { after: null }), true);
  assert.equal(retentionNeedsConfirmation({ ...draft("30 days", "retention"), enabled: false }, { after: "30 days" }), false);
  assert.equal(retentionNeedsConfirmation(draft("1 day 12:00:00", "retention"), { after: "1 day 12:00:00" }), false);
});

test("the retention cutoff subtracts calendar units from now", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  assert.equal(retentionCutoff("30 days", now).toISOString(), "2026-09-02T12:00:00.000Z");
  assert.equal(retentionCutoff("2 weeks", now).toISOString(), "2026-09-18T12:00:00.000Z");
  assert.equal(retentionCutoff("1 mon", now).toISOString(), "2026-09-02T12:00:00.000Z");
  assert.equal(retentionCutoff("1 year", now).toISOString(), "2025-10-02T12:00:00.000Z");
  assert.equal(retentionCutoff("12:00:00", now).toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(retentionCutoff("1 day 12:00:00", now).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(retentionCutoff("whenever", now), null);
});

test("compressed sizes read as human bytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 kB");
  assert.equal(formatBytes(12 * 1024 ** 3), "12 GB");
  assert.equal(formatBytes(null), null);
});
