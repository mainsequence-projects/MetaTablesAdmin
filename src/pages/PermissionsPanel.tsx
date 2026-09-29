import { useEffect, useState } from "react";
import { Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable } from "@dev-mainsequence/command-center-sdk/views";
import { metaTablesApi, type AccessPreview, type AccessEvent, type PermissionAssignments, type PermissionsDocument } from "../api";
import { principalName, samePermissionAssignments, selectPermissionPrincipals } from "../permissionSelection";
import { Badge, Button, Card, DetailSection, formatDate, RemoteContent, Picker, useRemote } from "../ui";
import { SharingAssignmentMatrix } from "./SharingAssignmentMatrix";

const blank: PermissionAssignments = { view: { users: [], teams: [] }, edit: { users: [], teams: [] } };
const accessName = (value: string | null) => value === "writer" ? "Writer" : value === "reader" ? "Reader" : "No access";

export function PermissionsPanel({ requestKey, resourceUid, load, save, namespace = false, embedded = false }: {
  requestKey: string;
  resourceUid: string;
  load: (signal: AbortSignal) => Promise<PermissionsDocument>;
  save: (value: PermissionAssignments, revision: string) => Promise<PermissionsDocument>;
  namespace?: boolean;
  embedded?: boolean;
}) {
  const remote = useRemote(requestKey, load);
  const [document, setDocument] = useState<PermissionsDocument | null>(null);
  const [assignments, setAssignments] = useState<PermissionAssignments>(blank);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [events, setEvents] = useState<AccessEvent[] | null>(null);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    setMessage(null); setError(null); setPreview(null); setEvents(null); setSubject(null);
    if (remote.status === "ready") { setAssignments(remote.data.assignments); setDocument(remote.data); }
    else { setDocument(null); setAssignments(blank); }
  }, [remote]);

  const data = document ?? (remote.status === "ready" ? remote.data : null);
  const dirty = Boolean(data && !samePermissionAssignments(assignments, data.assignments));

  function select(scope: "view" | "edit", kind: "users" | "teams", values: readonly string[]) {
    setAssignments(current => selectPermissionPrincipals(current, scope, kind, values));
    setMessage(null); setError(null);
  }

  async function inspectAccess(history = false) {
    setInspecting(true); setError(null);
    try {
      if (history) setEvents(await metaTablesApi.accessHistory(resourceUid, namespace));
      else if (subject) setPreview(await metaTablesApi.effectiveAccess(resourceUid, subject));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Access lookup failed."); }
    finally { setInspecting(false); }
  }

  async function handleSave() {
    if (!data?.can_edit || !dirty || saving) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await save(assignments, data.revision);
      setPreview(null); setEvents(null);
      setDocument(result); setAssignments(result.assignments);
      setMessage("Access saved. Team membership and namespace sharing still apply.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); }
    finally { setSaving(false); }
  }

  const Panel = embedded ? DetailSection : Card;
  return <ApplicationPageStack data-security-access><Panel title="Sharing"
    description={data?.can_edit ? "Select users or teams, then use the arrows to add or remove their access. Save to apply your changes." : "Users and teams with access to this resource."}
    actions={data?.can_edit ? <>
      {dirty && <Button disabled={saving} onClick={() => { setAssignments(data.assignments); setError(null); }}>Discard changes</Button>}
      <Button variant="primary" pending={saving} disabled={!dirty || saving} onClick={() => void handleSave()}>Save access</Button>
    </> : undefined}>
    <RemoteContent state={remote}>{loaded => { const data = document ?? loaded; return <>
      <div className="sharing-status" role="status">
        <Badge tone={data.effective_access === "writer" ? "accent" : "neutral"}>{namespace ? "Namespace access" : `Your table access: ${accessName(data.effective_access)}`}</Badge>
        {dirty ? <Badge tone="warning">Unsaved changes</Badge> : <span className="muted">{data.can_edit ? "Changes are applied when you save." : namespace ? "Only administrators can change namespace sharing." : "Only Writers or an administrator can change sharing."}</span>}
      </div>
      {namespace && <div role="note"><Badge tone="warning">Namespace sharing</Badge><p>Access applies to all current tables in this namespace. Changing it updates their inherited access. Only administrators can manage these assignments.</p></div>}
      {error && <div role="alert"><Badge tone="danger">Could not update sharing</Badge><p>{error}</p></div>}
      {message && <div role="status"><Badge tone="success">Saved</Badge><p>{message}</p></div>}
      <SharingAssignmentMatrix data={data} value={assignments} disabled={saving} namespace={namespace} onChange={select} />
      {data.inherited.length > 0 && <DetailSection title="Access from namespaces" titleAs="h3" description="These assignments are managed on the namespace. Removing direct access here does not remove namespace access.">
        <DataTable items={data.inherited} getId={grant => grant.grant_uid} presentation="auto" columns={[
          { id: "principal", header: "User or team", importance: "primary", renderCell: grant => principalName(data, grant.principal_kind, grant.principal_uid) },
          { id: "access", header: "Access", importance: "secondary", renderCell: grant => <Badge>{accessName(grant.access_level)}</Badge> },
          { id: "source", header: "Shared through", importance: "secondary", renderCell: () => "Namespace sharing" },
        ]} />
      </DetailSection>}
      {data.contributions.length > 0 && <DetailSection title="How you have access" titleAs="h3">
        <DataTable items={data.contributions} getId={grant => grant.grant_uid} presentation="auto" columns={[
          { id: "principal", header: "Shared with", importance: "primary", renderCell: grant => principalName(data, grant.principal_kind, grant.principal_uid) },
          { id: "source", header: "Shared through", importance: "secondary", renderCell: grant => grant.source === "namespace" ? "Namespace sharing" : "Direct table sharing" },
          { id: "access", header: "Access", importance: "secondary", renderCell: grant => <Badge>{accessName(grant.access_level)}</Badge> },
        ]} />
      </DetailSection>}
      {data.can_edit && !namespace && <details><summary>Check a user's access</summary><ApplicationPageStack className="sharing-access-check">
        <p className="muted">Check saved access, including team membership and namespace sharing.</p>
        <Field label="User"><Picker mode="single" ariaLabel="Access preview user" value={subject}
          options={data.candidate_users.map(user => ({ value: user.uid, label: principalName(data, "user", user.uid), subtitle: user.email ?? undefined }))}
          onValueChange={value => { setSubject(value); setPreview(null); }} searchable fullWidth disabled={inspecting || saving} /></Field>
        <div className="sharing-status"><Button disabled={!subject || inspecting || saving} pending={inspecting} onClick={() => void inspectAccess()}>Check access</Button></div>
        {preview && <div role="status"><Badge>{`Effective access: ${accessName(preview.effective_access)}`}</Badge>
          {(preview.contributions ?? []).map(grant => <p key={grant.grant_uid}>{accessName(grant.access_level)} through {principalName(data, grant.principal_kind, grant.principal_uid)}{grant.source === "namespace" ? " from namespace sharing" : " from direct table sharing"}.</p>)}
        </div>}
      </ApplicationPageStack></details>}
      {data.can_edit && <details><summary>Access history</summary><ApplicationPageStack>
        <div className="sharing-status"><Button disabled={inspecting || saving} pending={inspecting} onClick={() => void inspectAccess(true)}>Load access history</Button></div>
        {events && <DataTable items={events} getId={event => event.uid} presentation="auto" emptyContent="No grant changes recorded." columns={[
          { id: "principal", header: "User or team", importance: "primary", renderCell: event => principalName(data, event.principal_kind, event.principal_uid) },
          { id: "change", header: "Change", importance: "secondary", renderCell: event => `${accessName(event.previous_access)} → ${accessName(event.new_access)}` },
          { id: "actor", header: "Changed by", importance: "secondary", renderCell: event => event.actor_user_uid ? principalName(data, "user", event.actor_user_uid) : "System" },
          { id: "date", header: "When", importance: "secondary", renderCell: event => formatDate(event.created_at) },
        ]} />}
      </ApplicationPageStack></details>}
    </>; }}</RemoteContent>
  </Panel></ApplicationPageStack>;
}
