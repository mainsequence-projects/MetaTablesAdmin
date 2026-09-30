import assert from "node:assert/strict";
import test from "node:test";
import { principalName, samePermissionAssignments, selectPermissionPrincipals, sharingPrincipals } from "../src/permissionSelection.ts";

test("the multi-picker preserves view access when edit selection changes", () => {
  const original = { view: { users: ["reader", "editor"], teams: ["team"] }, edit: { users: ["editor"], teams: ["team"] } };
  const selected = selectPermissionPrincipals(original, "edit", "users", ["new-editor", "new-editor"]);
  assert.deepEqual(selected.edit.users, ["new-editor"]);
  assert.deepEqual(selected.view.users, ["reader", "editor", "new-editor"]);
  assert.deepEqual(selected.view.teams, ["team"]);
  assert.deepEqual(original.edit.users, ["editor"]);
});

test("removing view access removes edit only for the affected principal group", () => {
  const original = { view: { users: ["user"], teams: ["retained", "removed"] }, edit: { users: ["user"], teams: ["retained", "removed"] } };
  const selected = selectPermissionPrincipals(original, "view", "teams", ["retained"]);
  assert.deepEqual(selected.view.teams, ["retained"]);
  assert.deepEqual(selected.edit.teams, ["retained"]);
  assert.deepEqual(selected.edit.users, ["user"]);
  assert.deepEqual(original.edit.teams, ["retained", "removed"]);
});

test("sharing keeps missing and inherited principals visible without using UUIDs as names", () => {
  const missing = "e2a4f38a-1b5f-40a3-974f-70bc8f065b3f";
  const data = {
    candidate_users: [{ uid: "alice", name: "Alice", email: "alice@example.test" }, { uid: "bob", name: missing, email: "bob@example.test" }],
    candidate_teams: [{ uid: "research", name: "Research" }],
    assignments: { view: { users: ["alice", missing], teams: [] }, edit: { users: [missing], teams: [] } },
    inherited: [{ principal_kind: "team", principal_uid: "research" }], contributions: [],
  };
  const people = sharingPrincipals(data, "users");
  assert.equal(people.find(person => person.uid === missing).name, "Unavailable user");
  assert.equal(people.find(person => person.uid === missing).available, false);
  assert.equal(people.find(person => person.uid === "bob").name, "bob@example.test");
  assert.equal(principalName(data, "team", "research"), "Research");
  assert.equal(principalName(data, "user", "unknown-actor"), "Unavailable user");
  const removed = selectPermissionPrincipals(data.assignments, "view", "users", ["alice"]);
  assert.deepEqual(removed.edit.users, []);
});

test("unsaved sharing changes ignore ordering but detect role changes", () => {
  const a = { view: { users: ["a", "b"], teams: ["team"] }, edit: { users: ["b"], teams: [] } };
  const reordered = { ...a, view: { users: ["b", "a"], teams: ["team"] } };
  assert.equal(samePermissionAssignments(a, reordered), true);
  assert.equal(samePermissionAssignments(a, selectPermissionPrincipals(a, "edit", "users", [])), false);
});
