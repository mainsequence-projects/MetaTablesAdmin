import type { ReactNode } from "react";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import type { RuntimeBootstrap } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel } from "./DataSourceTypeIcon";
import { useRuntimeContext } from "./runtimeContext";
import { runtimeMigrationStatus } from "./runtimeMigrationStatus";
import { RuntimeMigrations } from "./runtimeMigrations";
import { Badge, Facts, display } from "./ui";

const statusLabels: Record<RuntimeBootstrap["status"], string> = {
  unconfigured: "Not connected", migration_required: "Migrations needed", registration_required: "Registration needed",
  migrating: "Migrating", ready: "Ready", incompatible: "Needs attention", unavailable: "Unavailable",
};

const mono = (value: unknown) => <span className="mono">{display(value)}</span>;

/** Hosted mode: the deployment declares the runtime database, so Settings only shows it. */
export function RuntimeDeploymentDatabase() {
  const { runtime } = useRuntimeContext();
  const bootstrap = runtime.bootstrap;
  const declaration = bootstrap?.declaration ?? null;
  const connection = bootstrap?.candidate?.configuration ?? null;
  const engine = declaration?.engine ?? bootstrap?.candidate?.class_type ?? runtime.data_source?.class_type ?? null;
  const active = bootstrap?.active === true;
  const status = active ? "Active" : statusLabels[bootstrap?.status ?? "unavailable"];
  const awaitingDeployment = !!bootstrap && (bootstrap.status === "migration_required" || bootstrap.status === "registration_required"
    || (bootstrap.status === "ready" && !active) || runtimeMigrationStatus(bootstrap) === "pending");
  const facts: { label: string; value: ReactNode }[] = [];
  if (engine) facts.push({ label: "Engine", value: <span className="data-source-picker-value"><DataSourceTypeIcon engine={engine} />{sourceEngineLabel(engine)}</span> });
  if (declaration) {
    facts.push({ label: "Environment Secret", value: mono(declaration.uri_secret) },
      { label: "Default schema", value: mono(declaration.default_schema) },
      { label: "TLS mode", value: declaration.tls.mode });
    for (const [label, name] of [["CA certificate Secret", declaration.tls.ca_secret],
      ["Client certificate Secret", declaration.tls.client_certificate_secret],
      ["Client key Secret", declaration.tls.client_key_secret]] as const) {
      if (name) facts.push({ label, value: mono(name) });
    }
  }
  if (connection) {
    facts.push({ label: "Host", value: mono(connection.host) }, { label: "Port", value: mono(connection.port) },
      { label: "Database", value: mono(connection.database_name) }, { label: "Login", value: mono(connection.database_user) });
  }
  return <ApplicationPageStack as="section" aria-label="Hosted runtime database">
    <ApplicationPageHeader title="2. Runtime database" titleAs="h3"
      description="The deployment manages this database. It stores MetaTables' system tables and your table data."
      actions={<Badge tone={active ? "success" : bootstrap?.error ? "danger" : awaitingDeployment ? "warning" : "neutral"}>{status}</Badge>} />
    {bootstrap?.error && <p role="alert"><Badge tone="danger">{bootstrap.status === "incompatible" ? "Needs attention" : "Database not ready"}</Badge> {bootstrap.error}</p>}
    {!bootstrap && <p role="alert">The API did not report its runtime database. Use Refresh runtime, or check the API deployment.</p>}
    {awaitingDeployment && <p>A deployment applies the pending migrations and registers the database; nothing runs from Settings.</p>}
    {facts.length > 0 && <Facts items={facts} />}
    <p className="muted">To change it, edit <span className="mono">runtime_database</span> in the API's <span className="mono">configuration.yaml</span> or
      the Environment Secret {declaration ? <span className="mono">{declaration.uri_secret}</span> : "it names"}, then deploy. The deployment's
      MetaTables system migrations Job verifies the database, applies migrations and registers it before the API rolls out.</p>
    {bootstrap && <RuntimeMigrations bootstrap={bootstrap} />}
  </ApplicationPageStack>;
}
