import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Run the real transport module in Node without requiring a browser or server.
const source = await readFile(new URL("../src/api.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText.replaceAll('"./apiContract"', JSON.stringify(new URL("../src/apiContract.ts", import.meta.url).href))
  .replaceAll('"./inFlightReads"', JSON.stringify(new URL("../src/inFlightReads.ts", import.meta.url).href))
  .replaceAll('"@dev-mainsequence/command-center-sdk/embed"', JSON.stringify(import.meta.resolve("@dev-mainsequence/command-center-sdk/embed")));
const { metaTablesApi: api, setHostedMetaTablesTransport: setTransport } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
globalThis.window = { location: { origin: "http://localhost:19473" } };

function transport() {
  const calls = [];
  setTransport((path, init) => new Promise(resolve => calls.push({ path, init,
    respond: value => resolve(Response.json(value)),
  })));
  return calls;
}

test("the Description tab requests the mounted table document endpoint", async () => {
  const calls = transport();
  const pending = api.tableDescription("daily-close");
  await Promise.resolve();
  assert.equal(calls[0].path, "/meta-tables/daily-close/search-document/");
  const document = { content: "# Overview\nDescription: Recorded daily closes" };
  calls[0].respond(document);
  assert.deepEqual(await pending, document);
});

test("the Admin shares concurrent runtime-context reads and re-fetches after completion", async () => {
  const calls = transport();
  const first = api.runtimeContext(), second = api.runtimeContext();
  await Promise.resolve();
  assert.equal(calls.length, 1);
  calls[0].respond({ runtime_instance_id: "worker-1" });
  assert.deepEqual(await first, await second);
  const fresh = api.runtimeContext();
  await Promise.resolve();
  assert.equal(calls.length, 2);
  calls[1].respond({ runtime_instance_id: "worker-1", bootstrap: { active: true } });
  assert.equal((await fresh).bootstrap.active, true);
});

test("reads after mutations cannot join a pending read of older state", async () => {
  const calls = transport();
  const old = api.sources("", 0);
  await Promise.resolve();
  const mutation = api.createSource({ display_name: "New", class_type: "postgresql", configuration: {} });
  const during = api.sources("", 0);
  await Promise.resolve();
  assert.equal(calls.length, 3);
  calls[1].respond({ uid: "new" });
  await mutation;
  const after = api.sources("", 0);
  await Promise.resolve();
  assert.equal(calls.length, 4);
  calls[0].respond({ results: [], count: 0 });
  calls[2].respond({ results: [], count: 0 });
  calls[3].respond({ results: [{ uid: "new" }], count: 1 });
  await Promise.all([old, during]);
  assert.equal((await after).count, 1);
});

test("transport changes isolate requests and ignore old runtime context responses", async () => {
  const oldCalls = transport();
  const old = api.runtimeContext();
  const newCalls = transport();
  const current = api.runtimeContext();
  await Promise.resolve();
  assert.equal(oldCalls.length, 1);
  assert.equal(newCalls.length, 1);
  newCalls[0].respond({ runtime_instance_id: "current" });
  await current;
  oldCalls[0].respond({ runtime_instance_id: "previous" });
  await old;
  const tables = api.sources("", 0);
  await Promise.resolve();
  assert.equal(newCalls[1].init.headers["X-MetaTables-Runtime-Instance"], "current");
  newCalls[1].respond({ count: 0, results: [] });
  await tables;
});

test("the schema graph request translates the public API payload before rendering", async () => {
  const calls = transport();
  const pending = api.tableGraph("daily-return", 2, true);
  await Promise.resolve();
  assert.equal(calls[0].path, "/meta-tables/daily-return/schema-graph?depth=2&include_incoming=true");
  calls[0].respond({
    root_uid: "daily-return", depth: 2, include_incoming: true,
    nodes: [
      { type: "meta_table", uid: "daily-return", physical_table_name: "daily_return", table_kind: "time_indexed", time_indexed: true },
      { type: "meta_table", uid: "instruments", physical_table_name: "instruments", table_kind: "relational", time_indexed: false },
    ],
    edges: [{ name: "fk_daily_return_symbol", source_uid: "daily-return", target_uid: "instruments", source_columns: ["symbol"], target_columns: ["symbol"], on_delete: "restrict", relationship_type: "meta_table_to_meta_table" }],
  });
  const graph = await pending;
  assert.deepEqual(graph.nodes, [
    { id: "daily-return", label: "daily_return", kind: "TimeIndexMetaTable" },
    { id: "instruments", label: "instruments", kind: "MetaTable" },
  ]);
  assert.deepEqual(graph.edges, [{ source: "daily-return", target: "instruments", label: "fk_daily_return_symbol", on_delete: "restrict" }]);
  const ids = new Set(graph.nodes.map(node => node.id));
  assert.equal(ids.size, 2);
  for (const edge of graph.edges) assert.ok(ids.has(edge.source) && ids.has(edge.target));
});

test("table updates use the published output-table filter and pipeline endpoint", async () => {
  const calls = transport();
  const updates = api.tableUpdates("daily-return", 25, undefined, 25);
  await Promise.resolve();
  assert.equal(calls[0].path, "/time-index-table-updates/?output_table__uid=daily-return&limit=25&offset=25");
  calls[0].respond({ count: 26, results: [{ uid: "producer", update_hash: "hash", output_table: { uid: "daily-return", physical_table_name: "daily_return" } }] });
  assert.equal((await updates).results[0].output_table_uid, "daily-return");
  const pending = api.tableUpdatePipeline("daily-return");
  await Promise.resolve();
  assert.equal(calls[1].path, "/meta-tables/daily-return/update-graph/");
  const graph = { root_id: "table:daily-return", nodes: [{ id: "table:daily-return", uid: "daily-return", label: "daily_return", kind: "time_index_table" }], edges: [] };
  calls[1].respond(graph);
  assert.deepEqual(await pending, graph);
});

test("the ULM request retains column endpoints and identity needed by the schema explorer", async () => {
  const calls = transport();
  const pending = api.tableSchemaGraph("daily-return", 3, true);
  await Promise.resolve();
  assert.equal(calls[0].path, "/meta-tables/daily-return/schema-graph?depth=3&include_incoming=true");
  const payload = { root_uid: "daily-return", nodes: [{ uid: "daily-return", namespace: "market" }, { uid: "asset" }],
    edges: [{ name: "return_asset", source_uid: "daily-return", target_uid: "asset", source_columns: ["symbol"], target_columns: ["symbol"], on_delete: "restrict" }] };
  calls[0].respond(payload);
  assert.deepEqual(await pending, payload);
});

test("an update's detail resolves the output table used by the shared pipeline endpoint", async () => {
  const calls = transport();
  const updateUid = "5082263d-b8c6-41df-b5c0-f454e2ac4d0e";
  const tableUid = "9f7f65f5-2938-493e-b488-6e87c41bebaf";
  const pendingUpdate = api.update(updateUid);
  await Promise.resolve();
  assert.equal(calls[0].path, `/time-index-table-updates/${updateUid}/`);
  calls[0].respond({ uid: updateUid, update_hash: "producer", output_table: { uid: tableUid } });
  const update = await pendingUpdate;
  assert.equal(update.output_table_uid, tableUid);

  const updateView = api.tableUpdatePipeline(update.output_table_uid);
  const tableView = api.tableUpdatePipeline(tableUid);
  await Promise.resolve();
  assert.equal(calls.length, 2, "both views share the pending pipeline request");
  assert.equal(calls[1].path, `/meta-tables/${tableUid}/update-graph/`);
  const graph = { root_id: `table:${tableUid}`, nodes: [
    { id: `table:${tableUid}`, uid: tableUid, label: "output", kind: "time_index_table" },
    { id: `update:${updateUid}`, uid: updateUid, label: "producer", kind: "update" },
  ], edges: [{ source: `update:${updateUid}`, target: `table:${tableUid}`, kind: "writes" }] };
  calls[1].respond(graph);
  assert.deepEqual(await updateView, graph);
  assert.deepEqual(await tableView, graph);
});

test("pipeline directions request distinct backend graphs rooted at the current update", async () => {
  const calls = transport();
  for (const [index, direction] of ["upstream", "downstream", "both"].entries()) {
    const pending = api.tableUpdatePipeline("output", undefined, { direction, updateUid: "producer" });
    await Promise.resolve();
    assert.equal(calls.length, index + 1);
    assert.equal(calls[index].path, `/meta-tables/output/update-graph/?direction=${direction}&update_uid=producer`);
    const graph = { root_id: "update:producer", nodes: [{ id: "update:producer", uid: "producer", label: "Producer", kind: "update" }], edges: [] };
    calls[index].respond(graph);
    assert.deepEqual(await pending, graph);
  }
});

test("the table Updates tab requests its backend page and maps producer details", async () => {
  const calls = transport();
  const uid = "bb3eccdc-5bab-4562-b922-4785a8293c28";
  const pending = api.tableUpdates(uid, 25, undefined, 25);
  await Promise.resolve();
  assert.equal(calls[0].path, `/time-index-table-updates/?output_table__uid=${uid}&limit=25&offset=25`);
  calls[0].respond({ count: 26, next: null, previous: "previous-page", results: [{
    uid: "producer", update_hash: "daily-return", output_table: { uid, identifier: "tutorial.daily_return" },
    build_configuration: { configuration_schema_version: 2 },
    update_details: { active_update_status: "E", error_on_last_update: true, last_update: "2026-09-29T12:00:00Z" },
  }] });
  const page = await pending;
  assert.equal(page.count, 26);
  assert.equal(page.previous, "previous-page");
  assert.equal(page.results[0].output_table_uid, uid);
  assert.equal(page.results[0].output_table_identifier, "tutorial.daily_return");
  assert.equal(page.results[0].status, "E");
  assert.equal(page.results[0].error_on_last_update, true);
  assert.equal(page.results[0].last_update, "2026-09-29T12:00:00Z");
});


test("run history and log cursors use the implemented MetaTables routes", async () => {
  const calls = transport();
  const history = api.updateRuns("update", 25);
  await Promise.resolve();
  assert.equal(calls[0].path, "/table-update-runs/?table_update_uid=update&limit=25&offset=25");
  calls[0].respond({ count: 1, results: [{ uid: "run", update_time_start: "2026-09-29T10:00:00Z", error_on_update: false }] });
  assert.equal((await history).results[0].result, "unfinished");
  const logs = api.updateLogs("update", { cursor: "opaque:50", level: "error" });
  await Promise.resolve();
  const url = new URL(calls[1].path, "https://example.test");
  assert.equal(url.pathname, "/time-index-table-updates/update/logs/");
  assert.equal(url.searchParams.get("cursor"), "opaque:50");
  assert.equal(url.searchParams.has("offset"), false);
  calls[1].respond({ rows: [], next_cursor: null, availability: "expired", truncated: false });
  assert.equal((await logs).availability, "expired");
});

test("Runs selects a root invocation and retrieves only its saved graph and exact attempt logs", async () => {
  const calls = transport();
  const history = api.rootRuns({ table_update_uid: "producer", outcome: "failed", limit: 25, offset: 0 });
  await Promise.resolve();
  const url = new URL(calls[0].path, "https://example.test");
  assert.equal(url.searchParams.get("root_only"), "true");
  assert.equal(url.searchParams.get("table_update_uid"), "producer");
  assert.equal(url.searchParams.get("outcome"), "failed");
  calls[0].respond({ count: 1, results: [{ uid: "old-root", root_run_uid: "old-root", updater_label: "Producer",
    table_update_uid: "producer", update_time_start: "2026-09-28T10:00:00Z", update_time_end: "2026-09-28T10:00:03Z",
    error_on_update: true, graph_availability: "available", outcome: "failed" }] });
  const run = (await history).results[0];
  assert.equal(run.root_run_uid, "old-root");
  assert.equal(run.updater_label, "Producer");
  const oldGraph = api.runGraph(run.uid), newGraph = api.runGraph("new-root");
  await Promise.resolve();
  assert.equal(calls[1].path, "/table-update-runs/old-root/graph/");
  assert.equal(calls[2].path, "/table-update-runs/new-root/graph/");
  calls[1].respond({ root_run_uid: "old-root", nodes: [{ uid: "producer", state: "blocked", run_uid: "old-attempt" }] });
  calls[2].respond({ root_run_uid: "new-root", nodes: [{ uid: "producer", state: "succeeded", run_uid: "new-attempt" }] });
  assert.equal((await newGraph).nodes[0].state, "succeeded");
  const selected = (await oldGraph).nodes[0];
  assert.equal(selected.state, "blocked");
  const logs = api.runLogs(selected.run_uid, { cursor: "saved:50", level: "error" });
  await Promise.resolve();
  const logUrl = new URL(calls[3].path, "https://example.test");
  assert.equal(logUrl.pathname, "/table-update-runs/old-attempt/logs/");
  assert.equal(logUrl.searchParams.get("cursor"), "saved:50");
  calls[3].respond({ rows: [], availability: "expired", next_cursor: null, truncated: false });
  assert.equal((await logs).availability, "expired");
  assert.equal(selected.state, "blocked");
});
