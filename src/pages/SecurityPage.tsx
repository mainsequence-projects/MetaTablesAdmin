import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi, type AccessObjectKind } from "../api";
import { detailPath } from "../navigation";
import { Button, Card, PageHeading, Picker, RemoteContent, useRemote } from "../ui";
import { AccessEventTable } from "./AccessPanel";
import { DatabasePermissionsPanel } from "./DatabasePermissionsPanel";

/**
 * Application security administration: database permission state, the security check, and
 * catalog-wide access history. Roles are granted on each object's own Access panel, where
 * Organization admins hold every action.
 */
export function SecurityPage() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const resources = useRemote(`security-${search}-${offset}`, signal => metaTablesApi.securityResources(search, offset, signal));
  const [kind, uid] = (selected ?? "").split(":") as [AccessObjectKind, string];
  return <ApplicationPageStack>
    <PageHeading eyebrow="Application" title="Security"
      description="Database permission state, the security check and access history across the catalog. Roles are granted on each table's and namespace's Access panel." />
    <DatabasePermissionsPanel />
    <Card title="Access history" description="Find any table or namespace, including one you hold no role on, and review its role changes. Grant and revoke roles on its Access panel.">
      <Field label="Find a table or namespace"><Input value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></Field>
      <RemoteContent state={resources}>{data => <>
        <Picker mode="single" ariaLabel="Security resource" value={selected} options={[
          ...data.tables.map(row => ({ value: `table:${row.uid}`, label: row.name, subtitle: "Table" })),
          ...data.namespaces.map(row => ({ value: `namespace:${row.uid}`, label: row.name, subtitle: "Namespace" })),
        ]} onValueChange={setSelected} searchable fullWidth />
        <Button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 100))}>Previous</Button>
        <Button disabled={data.tables.length < 100 && data.namespaces.length < 100} onClick={() => setOffset(value => value + 100)}>Next</Button>
      </>}</RemoteContent>
      {uid && <ResourceHistory key={selected} kind={kind} uid={uid} />}
    </Card>
  </ApplicationPageStack>;
}

function ResourceHistory({ kind, uid }: { kind: AccessObjectKind; uid: string }) {
  const navigate = useNavigate();
  const history = useRemote(`security-history-${kind}-${uid}`, signal => metaTablesApi.securityAccessHistory(kind, uid, signal));
  return <ApplicationPageStack>
    <div><Button onClick={() => navigate(detailPath(kind === "table" ? "tables" : "namespaces", uid, "permissions"))}>Open its Access panel</Button></div>
    <RemoteContent state={history}>{events => <AccessEventTable events={events} />}</RemoteContent>
  </ApplicationPageStack>;
}
