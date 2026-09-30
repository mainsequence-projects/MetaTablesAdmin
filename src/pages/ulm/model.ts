import type { TableDetail } from "../../api";
import type { SchemaGraphApi } from "../../apiContract";

export type UlmColumn = {
  column_name: string;
  attr_name: string;
  db_type: string;
  nullable: boolean | undefined;
  is_primary_key: boolean;
  is_unique: boolean;
};
export type UlmTable = {
  id: number;
  uid: string;
  identifier: string;
  namespace: string | null;
  physical_table_name: string;
  kind: "MetaTable" | "TimeIndexMetaTable";
  metadataLoaded: boolean;
  columns: UlmColumn[];
  indexes: { name: string; columns: string[]; unique?: boolean }[];
};
export type UlmRelationship = {
  id: number;
  name: string;
  source_table_id: number;
  target_table_id: number;
  source_columns: string[];
  target_columns: string[];
  source_column: string;
  target_column: string;
  on_delete: string | null;
};
export type UlmGraph = {
  root_table_id: number;
  tables: UlmTable[];
  relationships: UlmRelationship[];
};

/** Hydrate only graph-authorized nodes; metadata cannot add nodes or relationships. */
export function ulmGraphRecord(graph: SchemaGraphApi, rootUid: string, details: ReadonlyMap<string, TableDetail>): UlmGraph {
  const tables = graph.nodes.map((node, index): UlmTable => {
    const detail = details.get(node.uid);
    return {
      id: index + 1,
      uid: node.uid,
      identifier: detail?.identifier || node.identifier || node.physical_table_name || node.uid,
      namespace: detail?.namespace_name ?? node.namespace ?? null,
      physical_table_name: detail?.physical_table_name || node.physical_table_name || node.uid,
      kind: detail?.kind === "time_index" || node.time_indexed || node.table_kind === "time_indexed" ? "TimeIndexMetaTable" : "MetaTable",
      metadataLoaded: !!detail,
      columns: [...(detail?.columns ?? [])].sort((a, b) => (a.ordinal_position ?? a.ordinal ?? 0) - (b.ordinal_position ?? b.ordinal ?? 0)).map(column => ({
        column_name: column.name,
        attr_name: column.logical_name || column.label || column.name,
        db_type: column.backend_type || column.data_type || "Unknown type",
        nullable: column.nullable,
        is_primary_key: !!column.primary_key,
        is_unique: !!column.unique,
      })),
      indexes: (detail?.indexes ?? []).map(index => ({ name: index.name, columns: index.columns ?? [], unique: index.unique })),
    };
  });
  const ids = new Map(tables.map(table => [table.uid, table.id]));
  const relationships = graph.edges.flatMap((edge, index): UlmRelationship[] => {
    const source = ids.get(edge.source_uid), target = ids.get(edge.target_uid);
    if (source === undefined || target === undefined) return [];
    return [{
      id: index + 1, name: edge.name || "Foreign key",
      source_table_id: source, target_table_id: target,
      source_columns: edge.source_columns ?? [], target_columns: edge.target_columns ?? [],
      source_column: edge.source_columns?.[0] ?? "", target_column: edge.target_columns?.[0] ?? "",
      on_delete: edge.on_delete ?? null,
    }];
  });
  return { root_table_id: ids.get(graph.root_uid || rootUid) ?? ids.get(rootUid) ?? tables[0]?.id ?? 0, tables, relationships };
}
