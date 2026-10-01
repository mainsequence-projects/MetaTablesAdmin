import type { RelationImportRequest, RelationImportResult } from "./api";

/** Keep discovery unrestricted; submit the exact selection in bounded API batches. */
export async function importSelectedRelations(
  selection: { sourceUid: string; schema: string; namespace: string; names: readonly string[] },
  execute: (command: RelationImportRequest, signal?: AbortSignal) => Promise<RelationImportResult>,
  onBatch: (result: RelationImportResult, completed: number, total: number) => void,
  signal?: AbortSignal,
) {
  const names = [...new Set(selection.names)];
  if (!names.length) throw new Error("Select at least one table or view to import.");
  const results: RelationImportResult[] = [];
  for (let offset = 0; offset < names.length; offset += 200) {
    signal?.throwIfAborted();
    const batch = names.slice(offset, offset + 200);
    const result = await execute({
      data_source_uid: selection.sourceUid,
      physical_schema: selection.schema || null,
      namespace: selection.namespace.trim() || null,
      relation_names: batch,
      follow_foreign_keys: false,
      dry_run: false,
      strict: true,
    }, signal);
    signal?.throwIfAborted();
    results.push(result);
    onBatch(result, result.committed ? offset + batch.length : offset, names.length);
    if (!result.committed || !result.ok) break;
  }
  return results;
}
