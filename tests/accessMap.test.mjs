import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessMap, explainAccess, layoutAccessMap, traceAccess } from "../src/accessMap.ts";

// Two applications: prices owns its namespace, trading reads it and owns orders elsewhere.
const payload = {
  namespace: { uid: "ns", name: "prices" },
  viewer: { user_uid: "api", team_uids: ["trading"] },
  table_count: 2, tables_truncated: false,
  tables: [
    { uid: "daily", name: "prices.daily_close", kind: "relational", namespace_uid: "ns", namespace_name: "prices", related: false, viewer_role: "data_viewer" },
    { uid: "intraday", name: "prices.intraday", kind: "time_index", namespace_uid: "ns", namespace_name: "prices", related: false, viewer_role: "data_viewer" },
    { uid: "orders", name: "trading.orders", kind: "relational", namespace_uid: "tns", namespace_name: "trading", related: true, viewer_role: "data_writer" },
  ],
  principals: [
    { kind: "user", uid: "job", name: "prices migrations (Job workload)", identity_type: "workload" },
    { kind: "user", uid: "api", name: "trading API (Release workload)", identity_type: "workload" },
    { kind: "user", uid: "retired-workload", name: null, identity_type: null },
    { kind: "team", uid: "prices", name: "prices-development", identity_type: null },
    { kind: "team", uid: "trading", name: "trading-development", identity_type: null },
    { kind: "team", uid: "hidden", name: null, identity_type: null },
  ],
  grants: [
    { uid: "g1", target_kind: "namespace", target_uid: "ns", principal_kind: "team", principal_uid: "prices", role: "editor" },
    { uid: "g2", target_kind: "namespace", target_uid: "ns", principal_kind: "team", principal_uid: "trading", role: "data_viewer" },
    { uid: "g3", target_kind: "namespace", target_uid: "ns", principal_kind: "team", principal_uid: "hidden", role: "metadata_viewer" },
    { uid: "g4", target_kind: "table", target_uid: "daily", principal_kind: "user", principal_uid: "retired-workload", role: "owner" },
  ],
  memberships: [{ team_uid: "prices", user_uid: "job" }, { team_uid: "trading", user_uid: "api" }],
  unreadable_team_uids: ["hidden"],
  relationships: [
    { kind: "foreign_key", source_table_uid: "orders", target_table_uid: "daily", name: "orders_close_fk" },
    { kind: "update_input", source_table_uid: "intraday", target_table_uid: "orders", name: null },
  ],
};

test("the access map labels principals the caller cannot resolve and marks the viewer", () => {
  const map = buildAccessMap(payload);
  const node = id => map.nodes.find(item => item.id === id);
  assert.equal(node("user:retired-workload").label, "User retired-");
  assert.equal(node("team:hidden").label, "Team you can't see");
  assert.match(node("team:hidden").meta, /members hidden/);
  assert.equal(node("user:api").viewer, true);
  assert.equal(node("team:trading").viewer, true);
  assert.equal(node("table:orders").kind, "related");
  // The viewer's role colours a table; a grant edge is a read or a write and keeps its role.
  assert.equal(node("table:daily").access, "read");
  assert.match(node("table:daily").meta, /you: Data viewer$/);
  assert.equal(node("table:orders").access, "write");
  assert.deepEqual(map.edges.filter(edge => edge.role).map(edge => [edge.id, edge.kind, edge.role]), [
    ["grant:g1", "write", "editor"], ["grant:g2", "read", "data_viewer"], ["grant:g3", "read", "metadata_viewer"], ["grant:g4", "write", "owner"]]);
  // A relationship always leaves a namespace table; the foreign key from orders points back at it.
  const fk = map.edges.find(edge => edge.kind === "foreign_key");
  assert.deepEqual([fk.source, fk.target, fk.reversed], ["table:daily", "table:orders", true]);
  const feeds = map.edges.find(edge => edge.kind === "update_input");
  assert.deepEqual([feeds.source, feeds.target, feeds.reversed], ["table:intraday", "table:orders", false]);
});

test("columns follow the path of access without overlapping", () => {
  const map = buildAccessMap(payload);
  const layout = layoutAccessMap(map);
  const box = id => layout.boxes.get(id);
  assert.deepEqual(layout.lanes.map(lane => lane.label), ["Users and workloads", "Teams", "Namespace", "Tables", "Related tables"]);
  for (const edge of map.edges.filter(item => item.kind !== "foreign_key" && item.kind !== "update_input"))
    assert.ok(box(edge.source).x < box(edge.target).x, edge.id);
  const columns = new Map();
  for (const value of layout.boxes.values()) columns.set(value.x, [...(columns.get(value.x) ?? []), value]);
  for (const boxes of columns.values()) {
    boxes.sort((a, b) => a.y - b.y);
    for (let index = 1; index < boxes.length; index += 1) assert.ok(boxes[index - 1].y + boxes[index - 1].height <= boxes[index].y);
  }
  for (const value of layout.boxes.values()) assert.ok(value.x + value.width <= layout.bounds.width && value.y + value.height <= layout.bounds.height);
  assert.equal(layoutAccessMap({ nodes: [], edges: [] }).boxes.size, 0);
});

test("tracing a table lights who reaches it; tracing a workload lights what it reaches", () => {
  const map = buildAccessMap(payload);
  const table = traceAccess(map, "table:daily");
  for (const id of ["namespace:ns", "team:prices", "team:trading", "team:hidden", "user:job", "user:api", "user:retired-workload", "table:orders"])
    assert.ok(table.nodes.has(id), id);
  assert.ok(!table.nodes.has("table:intraday"));
  const workload = traceAccess(map, "user:api");
  for (const id of ["team:trading", "namespace:ns", "table:daily", "table:intraday"]) assert.ok(workload.nodes.has(id), id);
  assert.ok(!workload.nodes.has("team:prices") && !workload.nodes.has("user:job"));
});

test("explanations name the role and the Team it comes through", () => {
  assert.deepEqual(explainAccess(payload, "user:api"), ["Data viewer on namespace prices through trading-development"]);
  assert.deepEqual(explainAccess(payload, "table:daily"), [
    "Editor: prices-development (namespace role)", "Data viewer: trading-development (namespace role)",
    "Metadata viewer: Team you can't see (namespace role)", "Owner: User retired- (direct role)", "Referenced by trading.orders"]);
  assert.deepEqual(explainAccess(payload, "team:hidden"), ["Metadata viewer on namespace prices", "You can't see this Team's members."]);
  assert.deepEqual(explainAccess(payload, "table:orders"), ["References prices.daily_close", "Updated from prices.intraday"]);
});
