import type { RuntimeContext } from "./api";

/** A selected connection can exist before its catalog is initialized. */
export function runtimeDataSourceProblem(runtime: RuntimeContext): { title: string; message: string } | null {
  if (runtime.data_source && !runtime.data_source_error) return null;
  const bootstrap = runtime.bootstrap;
  if (bootstrap && !bootstrap.active) {
    switch (bootstrap.status) {
      case "migration_required":
        return { title: "DataSource requires migrations", message: "The runtime DataSource is configured. Open Settings to run the pending MetaTables migrations before using tables and updates." };
      case "registration_required":
        return { title: "DataSource setup incomplete", message: "The database is configured and its migrations are applied. Open Settings to finish registering the runtime DataSource." };
      case "migrating":
        return { title: "DataSource initialization in progress", message: "MetaTables migrations are running for the configured database. Refresh the runtime in Settings when they finish." };
      case "ready":
        return { title: "DataSource activation required", message: "The configured database is initialized. Open Settings and select Use this DataSource to activate it." };
      case "incompatible":
      case "unavailable":
        return { title: "DataSource unavailable", message: bootstrap.error ?? "The API could not verify the configured database. Review its connection and migration status in Settings." };
    }
  }
  if (runtime.data_source_error === "data_source_workflows_unavailable") {
    return { title: "DataSource unavailable", message: "The selected DataSource does not support table workflows. Select a supported database in Settings." };
  }
  if (runtime.data_source || bootstrap?.candidate) {
    return { title: "DataSource unavailable", message: "A DataSource is configured. Review its connection and complete its setup in Settings to enable table and update workflows." };
  }
  return { title: "No DataSource configured", message: "Select a usable DataSource in Settings to enable table and update workflows." };
}
