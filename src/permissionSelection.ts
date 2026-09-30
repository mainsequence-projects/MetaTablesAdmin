import type { PermissionAssignments, PermissionsDocument, Principal } from "./api";

/** Edit access includes view access; removing view also removes edit access. */
export function selectPermissionPrincipals(current: PermissionAssignments, scope: "view" | "edit", kind: "users" | "teams", values: readonly string[]): PermissionAssignments {
  const next = structuredClone(current);
  next[scope][kind] = [...new Set(values)];
  if (scope === "edit") next.view[kind] = [...new Set([...next.view[kind], ...values])];
  else next.edit[kind] = next.edit[kind].filter(uid => values.includes(uid));
  return next;
}

export type SharingPrincipal = Principal & { available: boolean };

const uuidLabel = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep unresolved assignments visible and removable; a missing directory entry must not drop access. */
export function sharingPrincipals(data: PermissionsDocument, kind: "users" | "teams"): SharingPrincipal[] {
  const candidates = kind === "users" ? data.candidate_users : data.candidate_teams;
  const principals = new Map(candidates.map(person => [person.uid, {
    ...person,
    name: person.name && !uuidLabel.test(person.name) ? person.name : person.email || `Unavailable ${kind === "users" ? "user" : "team"}`,
    available: true,
  }]));
  const assigned = [...data.assignments.view[kind], ...data.assignments.edit[kind],
    ...[...data.inherited, ...data.contributions]
      .filter(grant => grant.principal_kind === (kind === "users" ? "user" : "team"))
      .map(grant => grant.principal_uid)];
  for (const uid of assigned) {
    if (!principals.has(uid)) principals.set(uid, { uid, name: `Unavailable ${kind === "users" ? "user" : "team"}`, available: false });
  }
  return [...principals.values()].sort((left, right) => left.name.localeCompare(right.name) || left.uid.localeCompare(right.uid));
}

export function principalName(data: PermissionsDocument, kind: string, uid: string): string {
  return sharingPrincipals(data, kind === "team" ? "teams" : "users").find(person => person.uid === uid)?.name
    ?? `Unavailable ${kind === "team" ? "team" : "user"}`;
}

export function samePermissionAssignments(left: PermissionAssignments, right: PermissionAssignments): boolean {
  return (["view", "edit"] as const).every(scope => (["users", "teams"] as const).every(kind => {
    const a = new Set(left[scope][kind]);
    const b = new Set(right[scope][kind]);
    return a.size === b.size && [...a].every(uid => b.has(uid));
  }));
}
