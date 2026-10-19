import assert from "node:assert/strict";
import test from "node:test";
import {
  canRevoke, grantableRoles, grantChange, managesCreator, parsePrincipalKey, principalDirectory, principalKey, principalName, revokeChange,
  roleLabel, roleRank, sourceLabel, withFoundPrincipals, workloadName, writesData,
} from "../src/accessRoles.ts";

const texts = { summary: "s", impact: "i", not_included: "n" };
const roles = [
  { role: "metadata_viewer", actions: ["tables.get"], principals: ["user", "workload", "team"], ...texts },
  { role: "data_viewer", actions: ["tables.get", "tables.get_data"], principals: ["user", "workload", "team"], ...texts },
  { role: "data_writer", actions: [], principals: ["user", "workload", "team"], ...texts },
  { role: "editor", actions: [], principals: ["user", "workload", "team"], ...texts },
  { role: "owner", actions: [], principals: ["user", "team"], ...texts },
];

test("roles are nested and named for people", () => {
  assert.ok(roleRank("owner") > roleRank("editor") && roleRank("metadata_viewer") === 0 && roleRank(null) === -1);
  assert.equal(roleLabel("data_writer"), "Data writer");
  assert.equal(roleLabel(null), "No access");
  // Converted history may hold values that are not roles; they are shown as they are.
  assert.equal(roleLabel("writer"), "writer");
  assert.equal(writesData("data_viewer"), false);
  assert.equal(writesData("data_writer"), true);
});

test("the directory keeps bound principals it cannot name and marks the caller", () => {
  const missing = "e2a4f38a-1b5f-40a3-974f-70bc8f065b3f";
  const directory = principalDirectory(
    { users: [{ uid: "alice", name: "Alice" }, { uid: "bob", name: missing, email: "bob@example.test" }], teams: [{ uid: "research", name: "Research" }] },
    [{ principal_kind: "user", principal_uid: missing }, { principal_kind: "team", principal_uid: "research" }, { source: "admin" }], "alice");
  assert.equal(principalName(directory, "user", "alice"), "Alice (you)");
  assert.equal(principalName(directory, "user", "bob"), "bob@example.test");
  assert.equal(directory.get(principalKey("user", missing)).available, false);
  assert.equal(principalName(directory, "user", missing), "Unavailable user");
  assert.equal(principalName(directory, "team", "research"), "Research");
  assert.equal(principalName(directory, "team", "unknown"), "Unavailable team");
  assert.deepEqual(parsePrincipalKey(principalKey("team", "a:b")), { principal_kind: "team", principal_uid: "a:b" });
});

test("search results join the candidates once and keep what was already listed", () => {
  const data = { candidate_users: [{ uid: "alice", name: "Alice" }], candidate_teams: [{ uid: "research", name: "Research" }], revision: "r" };
  const nightly = { uid: "nightly", name: "Job 8b1f (workload)", email: null, identity_type: "workload", managed_by_caller: true };
  const merged = withFoundPrincipals(data, { users: [nightly, nightly, { uid: "alice", name: "Renamed" }], teams: [{ uid: "research", name: "Other" }] });
  assert.deepEqual(merged.candidate_users.map(user => user.uid), ["alice", "nightly"]);
  assert.equal(merged.candidate_users[0].name, "Alice");
  assert.deepEqual(merged.candidate_teams, data.candidate_teams);
  assert.equal(merged.revision, "r");
  assert.equal(data.candidate_users.length, 1);
});

test("a role above the caller's, or owner for a workload, cannot be granted", () => {
  const directory = principalDirectory({ users: [{ uid: "bot", name: "nightly (Job workload)", identity_type: "workload" }, { uid: "ana", name: "Ana", identity_type: "person" }],
    teams: [{ uid: "research", name: "Research" }] });
  const reasons = (own, key) => Object.fromEntries(grantableRoles(roles, own, directory.get(key)).map(item => [item.definition.role, item.reason]));
  assert.deepEqual(reasons("owner", "user:bot"), { metadata_viewer: null, data_viewer: null, data_writer: null, editor: null, owner: "Not for workload Users" });
  assert.equal(reasons("owner", "user:ana").owner, null);
  assert.equal(reasons("owner", "team:research").owner, null);
  assert.deepEqual(reasons("data_viewer", "user:bot"), { metadata_viewer: null, data_viewer: null, data_writer: "Above your own role", editor: "Above your own role", owner: "Above your own role" });
});

test("a manager of the creating workload holds no role yet grants any, owner only to people and Teams", () => {
  const directory = principalDirectory({ users: [{ uid: "bot", name: "nightly (Job workload)", identity_type: "workload" }, { uid: "ana", name: "Ana", identity_type: "person" }],
    teams: [{ uid: "research", name: "Research" }] });
  const reasons = key => Object.fromEntries(grantableRoles(roles, null, directory.get(key), true).map(item => [item.definition.role, item.reason]));
  assert.deepEqual(reasons("user:ana"), { metadata_viewer: null, data_viewer: null, data_writer: null, editor: null, owner: null });
  assert.equal(reasons("team:research").owner, null);
  assert.deepEqual(reasons("user:bot"), { metadata_viewer: null, data_viewer: null, data_writer: null, editor: null, owner: "Not for workload Users" });
  // Without the manager source, no role caps every choice.
  assert.ok(grantableRoles(roles, null, directory.get("user:ana")).every(item => item.reason === "Above your own role"));
  const manager = { source: "manager", role: null, actions: ["namespaces.get", "namespaces.get_access", "namespaces.set_access"], workload_user_uid: "bot" };
  assert.equal(managesCreator([{ source: "direct", role: "editor" }, manager]), true);
  assert.equal(managesCreator([{ source: "admin", role: "owner" }]), false);
});

test("revoking: managers revoke direct bindings; anyone their own; a manager their workload's", () => {
  const directory = principalDirectory({ users: [{ uid: "bot", name: "bot", identity_type: "workload", managed_by_caller: true }, { uid: "bob", name: "Bob" }], teams: [] });
  const binding = (principal_uid, source = "direct", principal_kind = "user") => ({ principal_kind, principal_uid, source });
  assert.equal(canRevoke(binding("bob"), { canManage: true, directory }), true);
  assert.equal(canRevoke(binding("bob", "namespace"), { canManage: true, directory }), false);
  assert.equal(canRevoke(binding("bob"), { canManage: false, callerUid: "ana", directory }), false);
  assert.equal(canRevoke(binding("ana"), { canManage: false, callerUid: "ana", directory }), true);
  assert.equal(canRevoke(binding("bot"), { canManage: false, callerUid: "ana", directory }), true);
  assert.equal(canRevoke(binding("bot", "direct", "team"), { canManage: false, callerUid: "ana", directory }), false);
});

test("changes carry the revision the caller read", () => {
  assert.deepEqual(grantChange("rev-1", { principal_kind: "team", principal_uid: "research" }, "editor"),
    { revision: "rev-1", grant: [{ principal_kind: "team", principal_uid: "research", role: "editor" }], revoke: [] });
  assert.deepEqual(revokeChange("rev-2", { principal_kind: "user", principal_uid: "bob", role: "owner" }),
    { revision: "rev-2", grant: [], revoke: [{ principal_kind: "user", principal_uid: "bob" }] });
});

test("sources say where access comes from", () => {
  const directory = principalDirectory({ users: [], teams: [{ uid: "research", name: "Research" }] });
  assert.equal(sourceLabel({ source: "admin" }, { directory }), "Organization admin");
  assert.equal(sourceLabel({ source: "direct", principal_kind: "user", principal_uid: "ana" }, { directory }), "Direct");
  assert.equal(sourceLabel({ source: "direct", principal_kind: "team", principal_uid: "research" }, { directory }), "Team Research");
  assert.equal(sourceLabel({ source: "namespace", principal_kind: "team", principal_uid: "research" }, { directory, namespaceName: "prices" }),
    "Namespace prices through Team Research");
  assert.equal(sourceLabel({ source: "namespace", principal_kind: "user", principal_uid: "ana" }, { directory, namespaceName: "prices" }), "Namespace prices");
});

test("the creating workload is named from the directory, or by its UID when the caller cannot see it", () => {
  const hidden = "5d3c9e1a-0b7f-4a52-9d1e-2f8a6c4b7e90";
  const directory = principalDirectory({ users: [{ uid: "bot", name: "nightly (Job workload)", identity_type: "workload" }], teams: [] },
    [{ principal_kind: "user", principal_uid: hidden }]);
  assert.equal(workloadName(directory, "bot"), "nightly (Job workload)");
  assert.equal(workloadName(directory, hidden), `Workload ${hidden}`);
  assert.equal(sourceLabel({ source: "manager", role: null, workload_user_uid: "bot" }, { directory }), "Manages the creating workload, nightly (Job workload)");
  assert.equal(sourceLabel({ source: "manager", role: null, workload_user_uid: hidden }, { directory }), `Manages the creating workload, Workload ${hidden}`);
});
