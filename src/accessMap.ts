/**
 * Model, layout and tracing for a namespace's access map
 * (MetaTables `GET /namespaces/{uid}/access-map/`). Pure, so Node tests run it directly.
 */
export type AccessLevel = "reader" | "writer";

export type AccessMapPayload = {
  namespace: { uid: string; name: string };
  viewer: { user_uid: string; team_uids: string[] };
  table_count: number;
  tables_truncated: boolean;
  tables: { uid: string; name: string; kind: string; namespace_uid: string | null; namespace_name: string | null;
    related: boolean; viewer_access: AccessLevel }[];
  principals: { kind: "user" | "team"; uid: string; name: string | null; identity_type: "person" | "workload" | null }[];
  grants: { uid: string; target_kind: "namespace" | "table"; target_uid: string; principal_kind: "user" | "team";
    principal_uid: string; access_level: AccessLevel }[];
  memberships: { team_uid: string; user_uid: string }[];
  unreadable_team_uids: string[];
  relationships: { kind: "foreign_key" | "update_input"; source_table_uid: string; target_table_uid: string; name: string | null }[];
};

export type AccessNodeKind = "user" | "team" | "namespace" | "table" | "related";
export type AccessNode = {
  id: string; uid: string; kind: AccessNodeKind; label: string; meta: string; viewer: boolean;
  identity?: "person" | "workload" | null; tableKind?: string; access?: AccessLevel;
};
export type AccessEdgeKind = "member" | AccessLevel | "contains" | "foreign_key" | "update_input";
/** Relationship edges always leave a namespace table; `reversed` says the real direction points back at it. */
export type AccessEdge = { id: string; source: string; target: string; kind: AccessEdgeKind; reversed?: boolean };
export type AccessMap = { nodes: AccessNode[]; edges: AccessEdge[] };

const LEVEL: Record<AccessLevel, string> = { reader: "Reader", writer: "Writer" };
export const accessLevelName = (level: AccessLevel) => LEVEL[level];
export const principalId = (kind: "user" | "team", uid: string) => `${kind}:${uid}`;

export function principalLabel(principal: { kind: "user" | "team"; uid: string; name: string | null }) {
  if (principal.name) return principal.name;
  return principal.kind === "team" ? "Team you can't see" : `User ${principal.uid.slice(0, 8)}`;
}

export function buildAccessMap(payload: AccessMapPayload): AccessMap {
  const viewerTeams = new Set(payload.viewer.team_uids);
  const unreadable = new Set(payload.unreadable_team_uids);
  const members = new Map<string, number>();
  for (const { team_uid } of payload.memberships) members.set(team_uid, (members.get(team_uid) ?? 0) + 1);
  const nodes: AccessNode[] = payload.principals.map(principal => {
    const viewer = principal.kind === "user" ? principal.uid === payload.viewer.user_uid : viewerTeams.has(principal.uid);
    const meta = principal.kind === "team"
      ? unreadable.has(principal.uid) ? "Team · members hidden from you" : `Team · ${members.get(principal.uid) ?? 0} members you can see`
      : principal.identity_type === "workload" ? "Workload" : principal.identity_type === "person" ? "Person" : "Not in your directory";
    return { id: principalId(principal.kind, principal.uid), uid: principal.uid, kind: principal.kind,
      label: principalLabel(principal), meta: viewer ? `${meta} · ${principal.kind === "team" ? "your Team" : "you"}` : meta,
      viewer, identity: principal.identity_type };
  });
  const namespaceId = `namespace:${payload.namespace.uid}`;
  nodes.push({ id: namespaceId, uid: payload.namespace.uid, kind: "namespace", label: payload.namespace.name,
    meta: `Namespace · ${payload.table_count} tables you can see`, viewer: false });
  const focus = new Set<string>();
  for (const table of payload.tables) {
    if (!table.related) focus.add(table.uid);
    const kind = table.kind === "time_index" ? "Time-indexed" : "Relational";
    nodes.push({ id: `table:${table.uid}`, uid: table.uid, kind: table.related ? "related" : "table", label: table.name,
      meta: `${table.related ? table.namespace_name ?? "No namespace" : kind} · you: ${LEVEL[table.viewer_access]}`,
      viewer: false, tableKind: table.kind, access: table.viewer_access });
  }
  const ids = new Set(nodes.map(node => node.id));
  const edges: AccessEdge[] = [];
  for (const { team_uid, user_uid } of payload.memberships) {
    const source = principalId("user", user_uid), target = principalId("team", team_uid);
    if (ids.has(source) && ids.has(target)) edges.push({ id: `member:${team_uid}:${user_uid}`, source, target, kind: "member" });
  }
  for (const grant of payload.grants) {
    const source = principalId(grant.principal_kind, grant.principal_uid);
    const target = grant.target_kind === "namespace" ? namespaceId : `table:${grant.target_uid}`;
    if (ids.has(source) && ids.has(target)) edges.push({ id: `grant:${grant.uid}`, source, target, kind: grant.access_level });
  }
  for (const uid of focus) edges.push({ id: `contains:${uid}`, source: namespaceId, target: `table:${uid}`, kind: "contains" });
  payload.relationships.forEach((relation, index) => {
    const reversed = !focus.has(relation.source_table_uid);
    const [from, to] = reversed ? [relation.target_table_uid, relation.source_table_uid] : [relation.source_table_uid, relation.target_table_uid];
    if (ids.has(`table:${from}`) && ids.has(`table:${to}`))
      edges.push({ id: `${relation.kind}:${index}`, source: `table:${from}`, target: `table:${to}`, kind: relation.kind, reversed });
  });
  return { nodes, edges };
}

export type AccessBox = { x: number; y: number; width: number; height: number };
export type AccessLane = { x: number; width: number; label: string; count: number };
export type AccessLayout = { boxes: Map<string, AccessBox>; bounds: AccessBox; lanes: AccessLane[] };

const COLUMNS: { kind: AccessNodeKind; label: string; width: number }[] = [
  { kind: "user", label: "Users and workloads", width: 250 },
  { kind: "team", label: "Teams", width: 240 },
  { kind: "namespace", label: "Namespace", width: 230 },
  { kind: "table", label: "Tables", width: 260 },
  { kind: "related", label: "Related tables", width: 260 },
];
export const ACCESS_NODE_HEIGHT = 56;
const ROW_GAP = 14, COLUMN_GAP = 96, TOP = 44;

/** Columns follow the path of access, left to right; each column is centred on the tallest. */
export function layoutAccessMap(map: AccessMap): AccessLayout {
  const byKind = new Map<AccessNodeKind, AccessNode[]>(COLUMNS.map(column => [column.kind, []]));
  for (const node of map.nodes) byKind.get(node.kind)?.push(node);
  const teams = byKind.get("team")!.sort((a, b) => a.label.localeCompare(b.label) || a.uid.localeCompare(b.uid));
  const teamRank = new Map(teams.map((team, index) => [team.id, index]));
  const firstTeam = new Map<string, number>();
  for (const edge of map.edges) if (edge.kind === "member")
    firstTeam.set(edge.source, Math.min(firstTeam.get(edge.source) ?? Infinity, teamRank.get(edge.target) ?? Infinity));
  byKind.get("user")!.sort((a, b) => (firstTeam.get(a.id) ?? Infinity) - (firstTeam.get(b.id) ?? Infinity)
    || a.label.localeCompare(b.label) || a.uid.localeCompare(b.uid));
  const columnHeight = (count: number) => count ? count * ACCESS_NODE_HEIGHT + (count - 1) * ROW_GAP : 0;
  const tallest = Math.max(ACCESS_NODE_HEIGHT, ...COLUMNS.map(column => columnHeight(byKind.get(column.kind)!.length)));
  const boxes = new Map<string, AccessBox>();
  const lanes: AccessLane[] = [];
  let x = 0;
  for (const column of COLUMNS) {
    const nodes = byKind.get(column.kind)!;
    if (!nodes.length) continue;
    const top = TOP + (tallest - columnHeight(nodes.length)) / 2;
    nodes.forEach((node, index) => boxes.set(node.id, { x, y: top + index * (ACCESS_NODE_HEIGHT + ROW_GAP), width: column.width, height: ACCESS_NODE_HEIGHT }));
    lanes.push({ x, width: column.width, label: column.label, count: nodes.length });
    x += column.width + COLUMN_GAP;
  }
  return { boxes, lanes, bounds: { x: 0, y: 0, width: Math.max(0, x - COLUMN_GAP), height: TOP + tallest } };
}

const ACCESS_EDGES = new Set<AccessEdgeKind>(["member", "reader", "writer", "contains"]);

/**
 * Everything a selected node reaches (following member, grant and namespace edges forward),
 * everything that reaches it (following them backward), and its direct relationships.
 */
export function traceAccess(map: AccessMap, selectedId: string) {
  const nodes = new Set([selectedId]);
  const edges = new Set<string>();
  const walk = (forward: boolean) => {
    const queue = [selectedId];
    const seen = new Set(queue);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of map.edges) {
        if (!ACCESS_EDGES.has(edge.kind) || (forward ? edge.source : edge.target) !== current) continue;
        const next = forward ? edge.target : edge.source;
        edges.add(edge.id);
        nodes.add(next);
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
  };
  walk(true);
  walk(false);
  for (const edge of map.edges) if (!ACCESS_EDGES.has(edge.kind) && (edge.source === selectedId || edge.target === selectedId)) {
    edges.add(edge.id);
    nodes.add(edge.source);
    nodes.add(edge.target);
  }
  return { nodes, edges };
}

/** Plain sentences explaining why the selected node has, or gives, access. */
export function explainAccess(payload: AccessMapPayload, selectedId: string): string[] {
  const label = new Map<string, string>(payload.principals.map(p => [principalId(p.kind, p.uid), principalLabel(p)]));
  const tables = new Map(payload.tables.map(table => [table.uid, table]));
  const target = (grant: AccessMapPayload["grants"][number]) => grant.target_kind === "namespace"
    ? `namespace ${payload.namespace.name}` : tables.get(grant.target_uid)?.name ?? "a table";
  const [kind, uid] = [selectedId.slice(0, selectedId.indexOf(":")), selectedId.slice(selectedId.indexOf(":") + 1)];
  if (kind === "user" || kind === "team") {
    const teams = kind === "user" ? payload.memberships.filter(m => m.user_uid === uid).map(m => m.team_uid) : [];
    const lines = payload.grants
      .filter(grant => grant.principal_kind === kind && grant.principal_uid === uid || grant.principal_kind === "team" && teams.includes(grant.principal_uid))
      .map(grant => `${LEVEL[grant.access_level]} on ${target(grant)}${grant.principal_uid === uid ? "" : ` through ${label.get(principalId("team", grant.principal_uid))}`}`);
    if (kind === "team" && payload.unreadable_team_uids.includes(uid)) lines.push("You can't see this Team's members.");
    return lines.length ? lines : ["No grant here."];
  }
  if (kind === "namespace") {
    const lines = payload.grants.filter(grant => grant.target_kind === "namespace")
      .map(grant => `${LEVEL[grant.access_level]}: ${label.get(principalId(grant.principal_kind, grant.principal_uid))} on every table`);
    return lines.length ? lines : ["No one has a grant on the namespace itself."];
  }
  const table = tables.get(uid);
  if (!table) return [];
  const lines = table.related ? [] : payload.grants
    .filter(grant => grant.target_kind === "namespace" || grant.target_uid === uid)
    .map(grant => `${LEVEL[grant.access_level]}: ${label.get(principalId(grant.principal_kind, grant.principal_uid))} (${grant.target_kind === "namespace" ? "namespace grant" : "direct grant"})`);
  for (const relation of payload.relationships) {
    if (relation.source_table_uid !== uid && relation.target_table_uid !== uid) continue;
    const outgoing = relation.source_table_uid === uid;
    const other = tables.get(outgoing ? relation.target_table_uid : relation.source_table_uid)?.name ?? "a table";
    lines.push(relation.kind === "foreign_key"
      ? outgoing ? `References ${other}` : `Referenced by ${other}`
      : outgoing ? `Feeds the updater of ${other}` : `Updated from ${other}`);
  }
  return lines.length ? lines : ["No grant gives access to this table here."];
}
