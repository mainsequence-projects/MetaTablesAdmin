import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { InFlightReads } from "../src/inFlightReads.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("concurrent reads share only pending work, not completed responses", async () => {
  const reads = new InFlightReads(), next = deferred();
  let calls = 0;
  const load = () => { calls++; return next.promise; };
  const first = reads.run("table", load), second = reads.run("table", load);
  await Promise.resolve();
  assert.equal(calls, 1);
  next.resolve({ uid: "table" });
  assert.deepEqual(await first, await second);
  await reads.run("table", load);
  assert.equal(calls, 2);
});

test("development cleanup/remount reuses a pending read", async () => {
  const reads = new InFlightReads(), next = deferred();
  const first = new AbortController(), second = new AbortController();
  let calls = 0, transportSignal;
  const load = signal => { calls++; transportSignal = signal; return next.promise; };
  const old = reads.run("runtime", load, first.signal);
  const cancelled = assert.rejects(old, { name: "AbortError" });
  first.abort();
  const remounted = reads.run("runtime", load, second.signal);
  await delay(5);
  assert.equal(calls, 1);
  assert.equal(transportSignal.aborted, false);
  next.resolve("ready");
  assert.equal(await remounted, "ready");
  await cancelled;
});

test("one subscriber abort does not cancel another subscriber", async () => {
  const reads = new InFlightReads(), next = deferred(), first = new AbortController();
  let transportSignal;
  const load = signal => { transportSignal = signal; return next.promise; };
  const cancelled = assert.rejects(reads.run("same", load, first.signal), { name: "AbortError" });
  const active = reads.run("same", load);
  first.abort();
  await delay(5);
  assert.equal(transportSignal.aborted, false);
  next.resolve("ok");
  assert.equal(await active, "ok");
  await cancelled;
});

test("abandoning the last subscriber cancels the transport and allows a new read", async () => {
  const reads = new InFlightReads(), controller = new AbortController();
  let transportSignal;
  const result = reads.run("same", signal => {
    transportSignal = signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  }, controller.signal);
  const cancelled = assert.rejects(result, { name: "AbortError" });
  await Promise.resolve();
  controller.abort();
  await delay(5);
  assert.equal(transportSignal.aborted, true);
  assert.equal(await reads.run("same", async () => "new"), "new");
  await cancelled;
});

test("invalidating for a mutation or context change separates subsequent reads", async () => {
  const reads = new InFlightReads(), old = deferred();
  const previous = reads.run("same", () => old.promise);
  reads.invalidate();
  assert.equal(await reads.run("same", async () => "current"), "current");
  old.resolve("previous");
  assert.equal(await previous, "previous");
});

test("failures are shared and a later read can retry", async () => {
  const reads = new InFlightReads(), next = deferred();
  let calls = 0;
  const load = () => { calls++; return next.promise; };
  const first = assert.rejects(reads.run("same", load), /unavailable/);
  const second = assert.rejects(reads.run("same", load), /unavailable/);
  next.reject(new Error("unavailable"));
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(await reads.run("same", async () => "recovered"), "recovered");
});

test("an already aborted caller never dispatches a request", async () => {
  const reads = new InFlightReads(), controller = new AbortController();
  controller.abort();
  await assert.rejects(reads.run("same", () => assert.fail("Unexpected request"), controller.signal),
    { name: "AbortError" });
});
