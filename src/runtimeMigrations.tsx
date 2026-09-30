import { Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import type { RuntimeBootstrap } from "./api";
import { runtimeMigrationStatus } from "./runtimeMigrationStatus";
import { Badge } from "./ui";

export function RuntimeMigrations({ bootstrap, editing, disabled, pending, onApply }: {
  bootstrap: RuntimeBootstrap; editing: boolean; disabled: boolean; pending: boolean; onApply?: () => void;
}) {
  const status = runtimeMigrationStatus(bootstrap);
  const label = { unconfigured: "Select a DataSource", up_to_date: "Up to date", pending: "Migrations pending",
    incompatible: "Needs review", unavailable: "Unable to compare", migrating: "Applying migrations" }[status];
  const canApply = status === "pending" && bootstrap.can_configure !== false && !editing
    && bootstrap.status !== "incompatible" && bootstrap.status !== "unavailable";
  const unreadable = status === "unavailable" || status === "unconfigured" || status === "migrating";
  return <ApplicationPageStack as="section" aria-label="Runtime migrations">
    <ApplicationPageHeader title="Migrations" titleAs="h3"
      description="Compare the selected database with the API's migration files."
      actions={<Badge tone={status === "up_to_date" ? "success" : status === "pending" ? "warning"
        : status === "incompatible" || status === "unavailable" ? "danger" : "neutral"}>{label}</Badge>} />
    <ApplicationCardGrid>
      <Field label="Applied in database" description="Current revision recorded by the selected database.">
        <Input readOnly className="mono" value={bootstrap.current_revisions.join(", ")
          || (unreadable ? status === "unconfigured" ? "No DataSource selected" : "Not verified" : "No migrations applied")} />
      </Field>
      <Field label="Latest in migration files" description="Head revision available in the API's migration files.">
        <Input readOnly className="mono" value={bootstrap.required_revisions.join(", ") || "Not available"} />
      </Field>
    </ApplicationCardGrid>
    {bootstrap.migration_error && <p role="alert">{bootstrap.migration_error}</p>}
    {editing && <p className="muted">This comparison is for the checked DataSource. Check or cancel your edited configuration before applying migrations.</p>}
    {status === "up_to_date" && <p className="muted">The database matches the migration files. Nothing needs applying.</p>}
    {status === "pending" && <p>{bootstrap.pending_revisions?.length
      ? <>Pending revisions: <span className="mono">{bootstrap.pending_revisions.join(" → ")}</span></>
      : "Apply the migration files to bring this database up to date."}</p>}
    {canApply && onApply && <div><Button variant="primary" pending={pending} disabled={disabled} onClick={onApply}>Run MetaTables migrations</Button></div>}
  </ApplicationPageStack>;
}
