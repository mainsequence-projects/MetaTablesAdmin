import assert from "node:assert/strict";
import test from "node:test";
import { ulmGraphRecord } from "../src/pages/ulm/model.ts";
import { buildMetaTableUmlLayout, buildRelationshipPath, getFitTransform, umlGraphConfig } from "../src/pages/ulm/layout.ts";

const graph = {
  root_uid: "return",
  nodes: [
    { uid: "return", identifier: "daily_return", namespace: "market", time_indexed: true },
    { uid: "close", identifier: "daily_close", time_indexed: true },
    { uid: "instrument", physical_table_name: "instruments" },
  ],
  edges: [
    { name: "return_close", source_uid: "return", target_uid: "close", source_columns: ["symbol", "date"], target_columns: ["symbol", "date"], on_delete: "cascade" },
    { name: "close_instrument", source_uid: "close", target_uid: "instrument", source_columns: ["symbol"], target_columns: ["symbol"], on_delete: "restrict" },
    // A stale/filtered endpoint must never be reconstructed from rich detail metadata.
    { name: "hidden", source_uid: "return", target_uid: "hidden", source_columns: ["secret"], target_columns: ["secret"] },
  ],
};
const root = { uid: "return", identifier: "daily_return", physical_table_name: "return_physical", kind: "time_index", namespace_name: "market",
  columns: [
    { name: "value", data_type: "float", ordinal_position: 2, nullable: true },
    { name: "symbol", logical_name: "instrument_symbol", data_type: "text", backend_type: "VARCHAR", ordinal_position: 0, nullable: false, primary_key: true },
    { name: "date", data_type: "timestamp", ordinal_position: 1, nullable: false },
  ], indexes: [{ name: "return_symbol_date", columns: ["symbol", "date"], unique: true }],
  foreign_keys: [{ name: "hidden", target_table_uid: "hidden" }],
};

test("ULM preserves public graph links and hydrates only visible nodes with real columns and indexes", () => {
  const payload = ulmGraphRecord(graph, "return", new Map([["return", root], ["hidden", { ...root, uid: "hidden" }]]));
  const table = payload.tables.find(table => table.id === payload.root_table_id);
  assert.deepEqual(table.columns.map(column => column.column_name), ["symbol", "date", "value"]);
  assert.equal(table.columns[0].attr_name, "instrument_symbol");
  assert.equal(table.columns[0].db_type, "VARCHAR");
  assert.equal(table.columns[0].is_primary_key, true);
  assert.equal(table.columns[2].nullable, true);
  assert.equal(table.indexes[0].unique, true);
  assert.equal(table.kind, "TimeIndexMetaTable");
  assert.equal(table.physical_table_name, "return_physical");
  assert.equal(payload.tables[1].metadataLoaded, false);
  assert.equal(payload.tables[2].identifier, "instruments");
  assert.equal(payload.tables.length, 3);
  assert.equal(payload.relationships.length, 2);
  assert.deepEqual(payload.relationships[0].source_columns, ["symbol", "date"]);
});

test("expansion moves FK endpoints to column row centers while fitting all cards inside the canvas", () => {
  const payload = ulmGraphRecord(graph, "return", new Map([["return", root]]));
  const rootId = payload.root_table_id;
  const collapsed = buildMetaTableUmlLayout(payload, {});
  const expanded = buildMetaTableUmlLayout(payload, { [rootId]: true });
  const card = expanded.cardsById.get(rootId);
  assert.ok(card.height > collapsed.cardsById.get(rootId).height);
  const fk = buildRelationshipPath(payload.relationships[0], expanded.cardsById);
  assert.equal(fk.startY, card.columnAnchors.get("symbol").y);
  assert.equal(card.columnAnchors.get("date").y - card.columnAnchors.get("symbol").y, umlGraphConfig.rowHeight + umlGraphConfig.columnRowGap);
  assert.equal(fk.startX, card.x + card.width);
  for (const [width, height] of [[1280, 700], [320, 560]]) {
    const fit = getFitTransform(expanded.bounds, { width, height });
    for (const table of expanded.cards) {
      assert.ok(fit.panX + table.x * fit.zoom >= 0);
      assert.ok(fit.panY + table.y * fit.zoom >= 0);
      assert.ok(fit.panX + (table.x + table.width) * fit.zoom <= width);
      assert.ok(fit.panY + (table.y + table.height) * fit.zoom <= height);
    }
  }
});

test("incoming references and cycles retain every table without overlapping cards", () => {
  const cyclic = { ...graph, edges: [...graph.edges, { name: "incoming", source_uid: "instrument", target_uid: "return" }] };
  const payload = ulmGraphRecord(cyclic, "return", new Map([["return", root]]));
  const layout = buildMetaTableUmlLayout(payload, { [payload.root_table_id]: true });
  assert.equal(layout.cards.length, 3);
  assert.ok(layout.cards.find(table => table.uid === "instrument").depth < 0);
  for (const a of layout.cards) for (const b of layout.cards) {
    if (a.id === b.id) continue;
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
  for (const edge of layout.relationships) assert.ok(buildRelationshipPath(edge, layout.cardsById)?.path);
  assert.equal(buildMetaTableUmlLayout(undefined, {}), null);
  assert.deepEqual(buildMetaTableUmlLayout({ root_table_id: 0, tables: [], relationships: [] }, {}).cards, []);
});
