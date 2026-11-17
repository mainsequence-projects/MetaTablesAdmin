import { useState } from "react";
import { Link } from "react-router-dom";
import { Field } from "@dev-mainsequence/command-center-sdk/controls";
import { DataTable, ResourceActionConfirmationDialog } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type TableNamespace } from "../api";
import { detailPath } from "../navigation";
import { Badge, Button, DetailSection, Picker, useRemote } from "../ui";

type Pending = { type: "add" | "remove"; namespace: Pick<TableNamespace, "name" | "source"> };

/**
 * The namespaces a table is in, with adding and removing (MetaTables ADR 0028). A table can be in
 * several; a role on any of them applies to it. The API decides who may change them: adding needs
 * `tables.update` on the table and `tables.create` on the namespace, removing `tables.create` on
 * the namespace.
 */
export function TableNamespaces({ uid, namespaces, canAdd, onChanged }: {
  uid: string; namespaces: TableNamespace[]; canAdd: boolean;
  onChanged: (namespaces: TableNamespace[], message: string) => void;
}) {
  const candidates = useRemote("table-namespace-candidates", signal => metaTablesApi.listNamespaces({ limit: 200 }, signal));
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = new Set(namespaces.map(namespace => namespace.name));
  const options = candidates.status === "ready" ? candidates.data.results.filter(namespace => !current.has(namespace.name)) : [];

  async function confirm() {
    if (!pending) return;
    const { name } = pending.namespace;
    setWorking(true); setError(null);
    try {
      const result = await metaTablesApi.changeTableNamespaces(uid, pending.type === "add" ? { add: [name] } : { remove: [name] });
      setPending(null); setChosen(null);
      onChanged(result.namespaces, pending.type === "add" ? `This table is now in ${name}.` : `This table is no longer in ${name}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The namespace change failed."); }
    finally { setWorking(false); }
  }

  return <DetailSection title="Namespaces" titleAs="h3"
    description="A table can be in several namespaces. A role on any of them applies to this table, and the strongest one wins.">
    <DataTable items={namespaces} getId={namespace => namespace.uid} presentation="auto"
      emptyContent="This table is in no namespace. Only direct roles apply to it." columns={[
        { id: "namespace", header: "Namespace", importance: "primary", renderCell: namespace =>
          <Link to={detailPath("namespaces", namespace.uid, "permissions")}>{namespace.name}</Link> },
        { id: "source", header: "Put there by", importance: "secondary", renderCell: namespace => namespace.source === "declared"
          ? <Badge>The application's code</Badge> : <Badge tone="accent">A person</Badge> },
        { id: "actions", header: "Actions", importance: "secondary", renderCell: namespace =>
          <Button size="small" variant="secondary" disabled={working} onClick={() => { setError(null); setPending({ type: "remove", namespace }); }}>Remove</Button> },
      ]} />
    {canAdd && <div className="access-grant">
      <Field label="Add to a namespace" description="Every role on that namespace will apply to this table.">
        <Picker mode="single" ariaLabel="Namespace to add this table to" value={chosen} searchable fullWidth disabled={working}
          emptyMessage={candidates.status === "loading" ? "Loading namespaces…" : "No other namespace you can see."}
          options={options.map(namespace => ({ value: namespace.name, label: namespace.name, subtitle: namespace.description ?? undefined }))}
          onValueChange={setChosen} />
      </Field>
      <div className="sharing-status">
        <Button variant="primary" disabled={working || !chosen}
          onClick={() => { if (chosen) { setError(null); setPending({ type: "add", namespace: { name: chosen, source: "manual" } }); } }}>Review</Button>
      </div>
    </div>}
    {pending && <ResourceActionConfirmationDialog
      actionLabel={pending.type === "add" ? `Add this table to ${pending.namespace.name}` : `Remove this table from ${pending.namespace.name}`}
      title={pending.type === "add" ? `Add to ${pending.namespace.name}` : `Remove from ${pending.namespace.name}`}
      description={pending.type === "add"
        ? `Everyone with a role on ${pending.namespace.name} gets that role on this table, and its owners become owners of this table. The table stays in its other namespaces.`
        : `Roles granted on ${pending.namespace.name} stop applying to this table. Direct roles and its other namespaces still apply.`}
      warning={pending.type === "remove" && pending.namespace.source === "declared"
        ? "The application's code declares this namespace. Its next migration adds the table back unless the code changes too."
        : pending.type === "add" ? "You need editor or owner on that namespace. No migration removes a namespace added here." : undefined}
      tone={pending.type === "remove" ? "danger" : "default"} confirmationValue="" onConfirmationValueChange={() => {}}
      confirmButtonLabel={pending.type === "add" ? "Add to namespace" : "Remove from namespace"} pending={working} presentation="auto"
      error={error ?? undefined} onClose={() => { setPending(null); setError(null); }} onConfirm={confirm} />}
  </DetailSection>;
}
