import type { TableRecord } from "./api";

export function quoteSourceIdentifier(name: string, engine: string): string {
  if (engine === "mysql") return `\`${name.replaceAll("`", "``")}\``;
  if (engine === "mssql") return `[${name.replaceAll("]", "]]")}]`;
  return `"${name.replaceAll('"', '""')}"`;
}

export function buildSourceSelect(table: Pick<TableRecord, "physical_schema" | "physical_table_name">, columns: readonly string[], engine: string): string {
  const quote = (name: string) => quoteSourceIdentifier(name, engine);
  const name = [table.physical_schema, table.physical_table_name].filter((part): part is string => !!part).map(quote).join(".");
  return `SELECT ${columns.length ? columns.map(quote).join(", ") : "*"}\nFROM ${name};`;
}
