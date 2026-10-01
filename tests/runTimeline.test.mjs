import assert from "node:assert/strict";
import test from "node:test";
import { axisLabel, formatDuration, formatOffset, runTimeline, timelineStep } from "../src/runTimeline.ts";

const at = seconds => new Date(Date.UTC(2026, 9, 1, 9, 8, 52) + Math.round(seconds * 1000)).toISOString();
const table = (id, label) => ({ id: `table:${id}`, uid: id, kind: "time_index_table", label: `tutorial__${label}`, namespace: "tutorial" });
const update = (id, label, fields) => ({ id: `update:${id}`, uid: id, kind: "update", label, namespace: "tutorial", output_table_uid: id, ...fields });
// The recorded tutorial invocation: DailyReturns ran RecordedPrices first.
const graph = (overrides = {}) => ({
  availability: "available", run_uid: "prices-run", root_run_uid: "returns-run", root_id: "update:returns", partial: false,
  started_at: at(0), ended_at: at(1.986),
  nodes: [
    table("prices", "daily_close"), table("returns", "daily_return"),
    update("prices", "RecordedPrices", { state: "succeeded", run_uid: "prices-run", attempt_started_at: at(0.261), attempt_ended_at: at(0.912), started_at: at(0.517), ended_at: at(0.912) }),
    update("returns", "DailyReturns", { state: "succeeded", run_uid: "returns-run", attempt_started_at: at(0), attempt_ended_at: at(1.986), started_at: at(1.33), ended_at: at(1.986) }),
  ],
  edges: [
    { source: "update:prices", target: "table:prices", kind: "writes" },
    { source: "update:returns", target: "table:returns", kind: "writes" },
    { source: "update:prices", target: "update:returns", kind: "depends_on" },
  ],
  ...overrides,
});

test("an invocation reads as dependency attempts first, on one clock with the dependency hand-off", () => {
  const timeline = runTimeline(graph());
  assert.deepEqual(timeline.rows.map(row => row.node.label), ["RecordedPrices", "DailyReturns"]);
  assert.deepEqual(timeline.rows.map(row => row.output?.label), ["tutorial__daily_close", "tutorial__daily_return"]);
  const [prices, returns] = timeline.rows;
  assert.deepEqual(prices.attempt, { start: 0.261, end: 0.912 });
  assert.deepEqual(prices.calculation, { start: 0.517, end: 0.912 });
  assert.equal(prices.wait, null);
  // The root attempt opened first and calculated after RecordedPrices finished.
  assert.deepEqual(returns.attempt, { start: 0, end: 1.986 });
  assert.deepEqual(returns.wait, { start: 0.912, end: 1.33 });
  assert.equal(timeline.extent, 1.986);
  assert.equal(timeline.step, 0.5);
  assert.deepEqual(timeline.ticks, [0, 0.5, 1, 1.5, 2]);
  assert.equal(timeline.domain, 2);
});

test("failed and blocked nodes keep their place, and a missing completion stays open", () => {
  const failed = graph({ ended_at: null, nodes: [
    ...graph().nodes.slice(0, 2),
    update("prices", "RecordedPrices", { state: "failed", reason: "calculation_failed", run_uid: "prices-run", attempt_started_at: at(0.2), attempt_ended_at: null, started_at: at(0.4), ended_at: at(3.5) }),
    update("returns", "DailyReturns", { state: "blocked", reason: "dependency_failed", run_uid: null, started_at: null, ended_at: at(4) }),
  ] });
  const timeline = runTimeline(failed);
  assert.deepEqual(timeline.rows.map(row => [row.node.label, row.node.state]), [["RecordedPrices", "failed"], ["DailyReturns", "blocked"]]);
  assert.deepEqual(timeline.rows[0].attempt, { start: 0.2, end: null });
  assert.equal(timeline.rows[1].attempt, null);
  assert.equal(timeline.rows[1].calculation, null);
  assert.equal(timeline.rows[1].resolved, 4);
  assert.equal(timeline.rows[1].wait, null);
  assert.equal(timeline.extent, 4);
  assert.deepEqual(timeline.ticks, [0, 1, 2, 3, 4]);
});

test("durations, offsets and axis labels use the unit that matters", () => {
  assert.equal(formatDuration(0.651573), "0.65s");
  assert.equal(formatDuration(31.299869), "31.3s");
  assert.equal(formatDuration(75.518176), "1m 16s");
  assert.equal(formatDuration(119.6), "2m 00s");
  assert.equal(formatDuration(7385), "2h 03m");
  assert.equal(formatDuration(null), "Unfinished");
  assert.equal(formatOffset(0.526), "+0.526s");
  assert.equal(formatOffset(62.25), "+1m 02.3s");
  assert.equal(timelineStep(75.5), 30);
  assert.equal(axisLabel(0.25, 0.25), "0.25s");
  assert.equal(axisLabel(1, 0.5), "1.0s");
  assert.equal(axisLabel(30, 15), "30s");
  assert.equal(axisLabel(120, 60), "2m");
});
