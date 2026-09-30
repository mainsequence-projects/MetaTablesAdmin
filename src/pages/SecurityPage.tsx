import { useState } from "react";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi } from "../api";
import { Button, Card, Picker, RemoteContent, StatePanel, useRemote } from "../ui";
import { PermissionsPanel } from "./PermissionsPanel";
import { DatabasePermissionsPanel } from "./DatabasePermissionsPanel";

export function SecurityPage() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resources = useRemote(`security-${search}-${offset}-${generation}`, signal => metaTablesApi.securityResources(search, offset, signal));
  const [kind, uid] = (selected ?? "").split(":");
  async function createNamespace() {
    setBusy(true); setError(null);
    try { const row = await metaTablesApi.createSecurityNamespace(name); setSelected(`namespace:${row.uid}`); setGeneration(value => value + 1); setName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Namespace creation failed."); }
    finally { setBusy(false); }
  }
  return <ApplicationPageStack>
    <DatabasePermissionsPanel />
    <Card title="Security" description="Manage grants and recover tables without an owner. To operate a table yourself, explicitly grant yourself Writer access.">
      <Field label="Find a table or namespace"><Input value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></Field>
      <RemoteContent state={resources}>{data => <>
        <Picker mode="single" ariaLabel="Security resource" value={selected} options={[
          ...data.tables.map(row => ({ value: `table:${row.uid}`, label: row.name, subtitle: "Table" })),
          ...data.namespaces.map(row => ({ value: `namespace:${row.uid}`, label: row.name, subtitle: "Namespace" })),
        ]} onValueChange={setSelected} searchable fullWidth />
        <Button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 100))}>Previous</Button>
        <Button disabled={data.tables.length < 100 && data.namespaces.length < 100} onClick={() => setOffset(value => value + 100)}>Next</Button>
      </>}</RemoteContent>
    </Card>
    {uid && <PermissionsPanel resourceUid={uid} key={selected} requestKey={`security-${selected}`} namespace={kind === "namespace"}
      load={signal => kind === "namespace" ? metaTablesApi.namespacePermissions(uid, signal) : metaTablesApi.tablePermissions(uid, signal)}
      save={(value, revision) => kind === "namespace" ? metaTablesApi.saveNamespacePermissions(uid, value, revision) : metaTablesApi.saveTablePermissions(uid, value, revision)} />}
    <Card title="Create namespace" description="Namespace grants are administered here and apply to its current tables.">
      <Field label="Namespace name"><Input value={name} onChange={event => setName(event.target.value)} /></Field>
      <Button disabled={!name.trim() || busy} pending={busy} onClick={() => void createNamespace()}>Create namespace</Button>
      {error && <StatePanel embedded title="Creation failed" tone="danger">{error}</StatePanel>}
    </Card>
  </ApplicationPageStack>;
}
