import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceSelect } from "../src/sourceQuery.ts";

test("SELECT builder quotes schema, table and columns for each database dialect", () => {
  assert.equal(buildSourceSelect({ physical_schema: "public", physical_table_name: 'odd"name' }, ['order', 'column"name'], "postgresql"),
    'SELECT "order", "column""name"\nFROM "public"."odd""name";');
  assert.equal(buildSourceSelect({ physical_schema: "db", physical_table_name: 'odd`name' }, ['a`b'], "mysql"),
    'SELECT `a``b`\nFROM `db`.`odd``name`;');
  assert.equal(buildSourceSelect({ physical_schema: "dbo", physical_table_name: 'odd]name' }, ['a]b'], "mssql"),
    'SELECT [a]]b]\nFROM [dbo].[odd]]name];');
});

test("SQLite can select all columns without a schema and identifier text cannot escape quoting", () => {
  assert.equal(buildSourceSelect({ physical_table_name: 'items"; DROP TABLE items; --' }, [], "sqlite"),
    'SELECT *\nFROM "items""; DROP TABLE items; --";');
  assert.equal(buildSourceSelect({ physical_schema: "public", physical_table_name: "prices" }, [], "timescale_db"),
    'SELECT *\nFROM "public"."prices";');
});
