/**
 * Roles, principals and access changes for the Access panels (MetaTables ADR 0024).
 * Pure, so Node tests run it directly.
 */
import type {
  AccessBinding, AccessChanges, AccessDocument, AccessObjectKind, AccessRole, AccessRoleCatalog, AccessRoleDefinition,
  AccessSource, Principal, PrincipalKind, PrincipalRef, PrincipalSearch,
} from "./api";

const ORDER: readonly AccessRole[] = ["metadata_viewer", "data_viewer", "data_writer", "editor", "owner"];
const LABELS: Record<AccessRole, string> = {
  metadata_viewer: "Metadata viewer", data_viewer: "Data viewer", data_writer: "Data writer", editor: "Editor", owner: "Owner",
};

export const roleRank = (role: AccessRole | null | undefined) => role ? ORDER.indexOf(role) : -1;
export const roleLabel = (role: AccessRole | null | undefined) => role ? LABELS[role] ?? role : "No access";
/** Roles that read rows or less are shown as reads; the others change something. */
export const writesData = (role: AccessRole | null | undefined) => roleRank(role) >= roleRank("data_writer");

export const can = (allowed: readonly string[] | undefined, action: string) => Boolean(allowed?.includes(action));
export const accessAction = (kind: AccessObjectKind, verb: "get_access" | "set_access") =>
  `${kind === "table" ? "tables" : "namespaces"}.${verb}`;

export function catalogFor(catalog: AccessRoleCatalog, kind: AccessObjectKind) {
  return kind === "table" ? catalog.tables : catalog.namespaces;
}

export function roleDefinition(catalog: AccessRoleCatalog, kind: AccessObjectKind, role: AccessRole | null | undefined): AccessRoleDefinition | null {
  return catalogFor(catalog, kind).roles.find(item => item.role === role) ?? null;
}

export type DirectoryEntry = Principal & { kind: PrincipalKind; available: boolean };
export const principalKey = (kind: PrincipalKind, uid: string) => `${kind}:${uid}`;
export function parsePrincipalKey(key: string): PrincipalRef {
  const split = key.indexOf(":");
  return { principal_kind: key.slice(0, split) as PrincipalKind, principal_uid: key.slice(split + 1) };
}

const uuidLabel = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Add directory search results to the candidates; nothing listed is dropped or repeated. */
export function withFoundPrincipals<T extends Pick<AccessDocument, "candidate_users" | "candidate_teams">>(data: T, found: PrincipalSearch): T {
  const merge = (listed: Principal[], extra: readonly Principal[]) => {
    const known = new Set(listed.map(principal => principal.uid));
    const added = extra.filter(principal => {
      if (known.has(principal.uid)) return false;
      known.add(principal.uid);
      return true;
    });
    return [...listed, ...added];
  };
  return { ...data, candidate_users: merge(data.candidate_users, found.users), candidate_teams: merge(data.candidate_teams, found.teams) };
}

/**
 * Everyone the panel can name: the candidates, then every principal a binding names. A principal
 * missing from the caller's directory stays listed, so its binding stays visible and revocable.
 */
export function principalDirectory(candidates: { users: readonly Principal[]; teams: readonly Principal[] },
  bound: readonly { principal_kind?: PrincipalKind; principal_uid?: string }[] = [], selfUid?: string): Map<string, DirectoryEntry> {
  const entries = new Map<string, DirectoryEntry>();
  for (const [kind, list] of [["user", candidates.users], ["team", candidates.teams]] as const) for (const person of list) {
    entries.set(principalKey(kind, person.uid), { ...person, kind, available: true,
      name: person.name && !uuidLabel.test(person.name) ? person.name : person.email || unavailable(kind) });
  }
  for (const { principal_kind, principal_uid } of bound) {
    if (!principal_kind || !principal_uid) continue;
    const key = principalKey(principal_kind, principal_uid);
    if (!entries.has(key)) entries.set(key, { uid: principal_uid, kind: principal_kind, name: unavailable(principal_kind), available: false });
  }
  const self = selfUid ? entries.get(principalKey("user", selfUid)) : undefined;
  if (self) self.name = self.available ? `${self.name} (you)` : "You";
  return entries;
}

const unavailable = (kind: PrincipalKind) => `Unavailable ${kind === "team" ? "team" : "user"}`;

export function principalName(directory: ReadonlyMap<string, DirectoryEntry>, kind: string, uid: string): string {
  const principalKind: PrincipalKind = kind === "team" ? "team" : "user";
  return directory.get(principalKey(principalKind, uid))?.name ?? unavailable(principalKind);
}

export const isWorkload = (entry: Pick<DirectoryEntry, "identity_type"> | undefined) => entry?.identity_type === "workload";

/**
 * A workload User as the directory names it ("nightly (Job workload)"); one the caller cannot see is
 * named by its UID, as the API names a workload whose kind it cannot read.
 */
export function workloadName(directory: ReadonlyMap<string, DirectoryEntry>, uid: string) {
  const entry = directory.get(principalKey("user", uid));
  return entry?.available ? entry.name : `Workload ${uid}`;
}

/** Whether the caller manages the workload that created the namespace: they manage its access with no role. */
export const managesCreator = (sources: readonly Pick<AccessSource, "source">[]) => sources.some(source => source.source === "manager");

/**
 * The roles the caller may grant to a principal: never above the caller's own role, unless they manage
 * the namespace's creating workload, and owner only to people and Teams. `reason` says why a role is
 * unavailable.
 */
export function grantableRoles(roles: readonly AccessRoleDefinition[], ownRole: AccessRole | null, principal: DirectoryEntry | undefined,
  creatorManager = false) {
  const principalType = principal?.kind === "team" ? "team" : isWorkload(principal) ? "workload" : "user";
  return roles.map(definition => ({
    definition,
    reason: !creatorManager && roleRank(definition.role) > roleRank(ownRole) ? "Above your own role"
      : principal && !definition.principals.includes(principalType) ? "Not for workload Users" : null,
  }));
}

/** Who may revoke a binding: a manager; anyone for their own binding; a workload's manager for that workload. */
export function canRevoke(binding: Pick<AccessBinding, "principal_kind" | "principal_uid" | "source">, input: {
  canManage: boolean; callerUid?: string; directory: ReadonlyMap<string, DirectoryEntry>;
}) {
  if (binding.source !== "direct") return false;
  if (input.canManage) return true;
  if (binding.principal_kind !== "user") return false;
  return binding.principal_uid === input.callerUid
    || input.directory.get(principalKey("user", binding.principal_uid))?.managed_by_caller === true;
}

export function grantChange(revision: string, principal: PrincipalRef, role: AccessRole): AccessChanges {
  return { revision, grant: [{ ...principal, role }], revoke: [] };
}

export function revokeChange(revision: string, principal: PrincipalRef): AccessChanges {
  return { revision, grant: [], revoke: [{ principal_kind: principal.principal_kind, principal_uid: principal.principal_uid }] };
}

/**
 * How a source gives access, in a short phrase: "Direct", "Team Research", "Namespace prices", "Organization admin",
 * "Manages the creating workload, nightly (Job workload)".
 */
export function sourceLabel(source: Pick<AccessSource, "source" | "principal_kind" | "principal_uid" | "workload_user_uid">, input: {
  directory: ReadonlyMap<string, DirectoryEntry>; namespaceName?: string | null;
}) {
  if (source.source === "admin") return "Organization admin";
  if (source.source === "manager") return `Manages the creating workload${source.workload_user_uid ? `, ${workloadName(input.directory, source.workload_user_uid)}` : ""}`;
  const through = source.principal_kind === "team" && source.principal_uid
    ? ` through Team ${principalName(input.directory, "team", source.principal_uid)}` : "";
  if (source.source === "namespace") return `Namespace${input.namespaceName ? ` ${input.namespaceName}` : ""}${through}`;
  return through ? `Team ${principalName(input.directory, "team", source.principal_uid!)}` : "Direct";
}
