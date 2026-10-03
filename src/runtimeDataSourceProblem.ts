import type { RuntimeContext } from "./api";

/** A selected connection can exist before its catalog is initialized. */
export function runtimeDataSourceProblem(runtime: RuntimeContext): { title: string; message: string } | null {
  if (runtime.data_source && !runtime.data_source_error) return null;
  const bootstrap = runtime.bootstrap;
  if (bootstrap && !bootstrap.active && bootstrap.managed_by === "deployment") {
    // The deployment migrates and registers the hosted runtime database; Settings only reports it.
    const deploy = "A deployment applies MetaTables migrations and registers the database. Review its status in Settings.";
    const titles = { unconfigured: "No runtime database", migration_required: "DataSource requires migrations",
      registration_required: "DataSource setup incomplete", ready: "DataSource activation required",
      migrating: "DataSource initialization in progress", incompatible: "DataSource unavailable", unavailable: "DataSource unavailable" };
    const fallback = bootstrap.status === "migrating"
      ? "MetaTables migrations are running for the runtime database. Refresh the runtime in Settings when they finish."
      : bootstrap.status === "incompatible" || bootstrap.status === "unavailable"
        ? "The API could not verify the runtime database. Review its status in Settings." : deploy;
    return { title: titles[bootstrap.status], message: bootstrap.error ?? fallback };
  }
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
