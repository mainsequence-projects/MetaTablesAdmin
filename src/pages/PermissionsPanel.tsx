import { useEffect, useState } from "react";
import { ResourceSelectionCheckbox } from "@dev-mainsequence/command-center-sdk/views";
import type { PermissionAssignments, PermissionsDocument, Principal } from "../api";
import { Button, Card, RemoteContent, StatePanel, useRemote } from "../ui";

const blank: PermissionAssignments = { view: { users: [], teams: [] }, edit: { users: [], teams: [] } };

export function PermissionsPanel({ requestKey, load, save, propagate, namespace = false }: {
  requestKey: string;
  load: (signal: AbortSignal) => Promise<PermissionsDocument>;
  save: (value: PermissionAssignments) => Promise<PermissionsDocument>;
  propagate?: () => Promise<{ affected_count: number }>;
  namespace?: boolean;
}) {
  const remote = useRemote(requestKey, load);
  const [assignments, setAssignments] = useState<PermissionAssignments>(blank);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (remote.status === "ready") setAssignments(remote.data.assignments);
  }, [remote]);

  function toggle(scope: "view" | "edit", kind: "users" | "teams", uid: string) {
    setAssignments((current) => {
      const next = structuredClone(current);
      const values = next[scope][kind];
      next[scope][kind] = values.includes(uid) ? values.filter((item) => item !== uid) : [...values, uid];
      if (scope === "edit" && next.edit[kind].includes(uid) && !next.view[kind].includes(uid)) next.view[kind].push(uid);
      if (scope === "view" && !next.view[kind].includes(uid)) next.edit[kind] = next.edit[kind].filter((item) => item !== uid);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await save(assignments);
      setAssignments(result.assignments);
      setMessage("Permissions saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); }
    finally { setSaving(false); }
  }

  async function handlePropagate() {
    if (!propagate) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await propagate();
      setMessage(`Permissions propagated to ${result.affected_count} table${result.affected_count === 1 ? "" : "s"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Propagation failed."); }
    finally { setSaving(false); }
  }

  function principalChoices(scope: "view" | "edit", kind: "users" | "teams", people: Principal[]) {
    return <div className="principal-list">{people.length === 0 ? <div className="muted">No candidates returned.</div> : people.map((person) => <div key={`${scope}-${kind}-${person.uid}`} className="principal"><ResourceSelectionCheckbox checked={assignments[scope][kind].includes(person.uid)} ariaLabel={`${scope === "view" ? "View" : "Edit"} permission for ${person.name}`} disabled={remote.status !== "ready" || !remote.data.can_edit || saving} onChange={() => toggle(scope, kind, person.uid)} /><span><strong>{person.name}</strong>{person.email && <small>{person.email}</small>}</span></div>)}</div>;
  }

  return <Card title="Permissions" description="Control who can view and edit this resource.">
    <RemoteContent state={remote}>{(data) => <>
      {namespace && <StatePanel title="Namespace propagation is additive" tone="warning">Removing a namespace assignment does not automatically remove grants previously copied to its tables.</StatePanel>}
      <div className="permission-grid">{(["view", "edit"] as const).map((scope) => <div className="permission-column" key={scope}><h3>Can {scope}</h3><div className="field-label">Users</div>{principalChoices(scope, "users", data.candidate_users)}<div className="field-label">Teams</div>{principalChoices(scope, "teams", data.candidate_teams)}</div>)}</div>
      {error && <StatePanel title="Permission change failed" tone="danger">{error}</StatePanel>}
      {message && <div role="status"><StatePanel title="Saved" tone="success">{message}</StatePanel></div>}
      {data.can_edit && <div className="button-row end"><Button variant="primary" pending={saving} onClick={() => void handleSave()}>{saving ? "Working…" : "Save permissions"}</Button>{propagate && <Button variant="secondary" disabled={saving} onClick={() => void handlePropagate()}>Propagate to tables</Button>}</div>}
    </>}</RemoteContent>
  </Card>;
}
