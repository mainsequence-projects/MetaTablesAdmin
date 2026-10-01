import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/relationImport.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText;
const { importSelectedRelations } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const selection = { sourceUid: "source", schema: "dbo", namespace: "", names: ["Order Details"] };
const success = { committed: true, ok: true, relations: [], counts: {} };

test("importing one table submits only that table with FK expansion disabled", async () => {
  const commands = [], progress = [];
  await importSelectedRelations(selection, async body => { commands.push(body); return success; }, (...args) => progress.push(args));
  assert.deepEqual(commands, [{ data_source_uid: "source", physical_schema: "dbo", namespace: null,
    relation_names: ["Order Details"], follow_foreign_keys: false, dry_run: false, strict: true }]);
  assert.deepEqual(progress[0].slice(1), [1, 1]);
});

test("select all imports every selected name beyond the API batch size", async () => {
  const names = Array.from({ length: 453 }, (_, index) => `table_${index}`);
  const commands = [], progress = [];
  await importSelectedRelations({ ...selection, names }, async body => { commands.push(body); return success; },
    (_, completed, total) => progress.push([completed, total]));
  assert.deepEqual(commands.map(body => body.relation_names.length), [200, 200, 53]);
  assert.deepEqual(commands.flatMap(body => body.relation_names), names);
  assert.deepEqual(progress, [[200, 453], [400, 453], [453, 453]]);
});

test("a rejected batch stops further imports while preserving completed results", async () => {
  const batches = [], names = Array.from({ length: 450 }, (_, index) => `table_${index}`);
  let calls = 0;
  const failure = { ...success, committed: false, ok: false };
  const results = await importSelectedRelations({ ...selection, names }, async () => ++calls === 1 ? success : failure,
    (result, completed) => batches.push([result.committed, completed]));
  assert.equal(calls, 2);
  assert.deepEqual(results, [success, failure]);
  assert.deepEqual(batches, [[true, 200], [false, 200]]);
});

test("empty selection never becomes an import-all request", async () => {
  await assert.rejects(importSelectedRelations({ ...selection, names: [] }, () => assert.fail("Unexpected import"), () => {}), /Select at least one/);
});

test("cancelling after one batch prevents later batches", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(importSelectedRelations({ ...selection, names: Array.from({ length: 201 }, (_, i) => String(i)) },
    async () => { calls++; return success; }, () => controller.abort(), controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
});
