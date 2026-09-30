import type { RuntimeBootstrap } from "./api";

/** Older APIs still expose the database/file heads, but not a graph comparison. */
export function runtimeMigrationStatus(bootstrap: RuntimeBootstrap): NonNullable<RuntimeBootstrap["migration_status"]> {
  if (bootstrap.migration_status) return bootstrap.migration_status;
  if (bootstrap.status === "unavailable" || bootstrap.status === "incompatible" || bootstrap.status === "migrating" || bootstrap.status === "unconfigured") return bootstrap.status;
  const current = new Set(bootstrap.current_revisions);
  const required = new Set(bootstrap.required_revisions);
  if (required.size && current.size === required.size && [...required].every(revision => current.has(revision))) return "up_to_date";
  return bootstrap.status === "migration_required" ? "pending" : "incompatible";
}
