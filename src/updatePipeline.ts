/** Compact registered update/table data flow returned by the MetaTables API. */
export type PipelineNode = {
  id: string;
  uid: string;
  label: string;
  kind: "update" | "time_index_table" | "table";
  namespace?: string | null;
  update_hash?: string;
  output_table_uid?: string;
  status?: string | null;
  last_update?: string | null;
  latest_run_uid?: string | null;
  state?: string;
  run_uid?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  attempt_started_at?: string | null;
  attempt_ended_at?: string | null;
  reason?: string | null;
};
export type PipelineEdge = { source: string; target: string; kind: "reads" | "writes" | "depends_on" };
export type UpdatePipeline = { root_id: string; nodes: PipelineNode[]; edges: PipelineEdge[] };
export type HistoricalRunGraph = UpdatePipeline & {
  availability: "available" | "unavailable"; root_run_uid: string | null; run_uid: string;
  root_update_uid?: string; selected_node_id?: string; partial: boolean;
  started_at?: string; ended_at?: string | null; duration_seconds?: number | null;
  outcome?: string; job_run_uid?: string | null; version?: number;
};
export type PipelineDirection = "upstream" | "downstream" | "both";
export type NodeBox = { x: number; y: number; width: number; height: number };
export type PipelineLane = { x: number; width: number; label: string; count: number };

/** Match the table detail's title; namespace and physical name remain in the inspector. */
export function pipelineNodeLabel(node: PipelineNode) {
  const prefix = node.kind !== "update" && node.namespace ? `${node.namespace}__` : null;
  return prefix && node.label.startsWith(prefix) ? node.label.slice(prefix.length) : node.label;
}

export function pipelineLineage(id: string, edges: readonly PipelineEdge[]) {
  const walk = (backward: boolean) => {
    const seen = new Set([id]);
    const frontier = [id];
    while (frontier.length) {
      const current = frontier.pop()!;
      for (const edge of edges) {
        if ((backward ? edge.target : edge.source) !== current) continue;
        const next = backward ? edge.source : edge.target;
        if (!seen.has(next)) { seen.add(next); frontier.push(next); }
      }
    }
    seen.delete(id);
    return seen;
  };
  return { upstream: walk(true), downstream: walk(false) };
}

/** Pool-adjacent-violators placement from the fixed-income mock's modelGraphLayout. */
function spread(ideal: number[], pitch: number): number[] {
  const blocks: { sum: number; count: number }[] = [];
  ideal.forEach((value, i) => {
    blocks.push({ sum: value - i * pitch, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1], prev = blocks[blocks.length - 2];
      if (prev.sum / prev.count <= last.sum / last.count) break;
      blocks.splice(blocks.length - 2, 2, { sum: prev.sum + last.sum, count: prev.count + last.count });
    }
  });
  const fitted = blocks.flatMap(block => Array.from({ length: block.count }, () => block.sum / block.count));
  const shift = Math.max(0, -(fitted[0] ?? 0));
  return fitted.map((value, i) => value + shift + i * pitch);
}

/** Layer real data-flow edges rather than placing resources around a circle. */
export function layoutUpdatePipeline(nodes: readonly PipelineNode[], inputEdges: readonly PipelineEdge[], rootId: string) {
  const ids = new Set(nodes.map(node => node.id));
  const edges = inputEdges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  const ranks = new Map<string, number>();
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) indegree.set(edge.target, indegree.get(edge.target)! + 1);
  const ready = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id).sort();
  ready.forEach(id => ranks.set(id, 0));
  while (ready.length) {
    const id = ready.shift()!;
    for (const edge of edges.filter(edge => edge.source === id)) {
      ranks.set(edge.target, Math.max(ranks.get(edge.target) ?? 0, ranks.get(id)! + 1));
      indegree.set(edge.target, indegree.get(edge.target)! - 1);
      if (indegree.get(edge.target) === 0) ready.push(edge.target);
    }
  }
  // Corrupt legacy cycles remain visible and never make layout loop indefinitely.
  const processed = new Set(nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id));
  const fallbackRank = Math.max(-1, ...[...ranks].filter(([id]) => processed.has(id)).map(([, rank]) => rank)) + 1;
  nodes.filter(node => !processed.has(node.id)).forEach(node => ranks.set(node.id, fallbackRank));
  const columns = [...new Set(ranks.values())].sort((a, b) => a - b);
  const boxes = new Map<string, NodeBox>();
  const lanes: PipelineLane[] = [];
  const rootRank = ranks.get(rootId) ?? 0;
  const hasRoot = ranks.has(rootId);
  columns.forEach((rank, lane) => {
    const members = nodes.filter(node => ranks.get(node.id) === rank)
      .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)).map((node, i) => {
      const parents = edges.filter(edge => edge.target === node.id).map(edge => boxes.get(edge.source)).filter((box): box is NodeBox => Boolean(box));
      const ideal = parents.length ? parents.reduce((sum, box) => sum + box.y, 0) / parents.length : i * 84;
      return { node, ideal };
    }).sort((a, b) => a.ideal - b.ideal || a.node.label.localeCompare(b.node.label) || a.node.id.localeCompare(b.node.id));
    const positions = spread(members.map(member => member.ideal), 84);
    members.forEach(({ node }, i) => boxes.set(node.id, { x: lane * 330, y: positions[i], width: 240, height: 62 }));
    const onlyUpdates = members.every(member => member.node.kind === "update");
    const onlyTables = members.every(member => member.node.kind !== "update");
    const label = onlyUpdates ? (hasRoot ? rank < rootRank ? "Upstream updates" : rank === rootRank ? "Updates" : "Consumer updates" : "Updates")
      : onlyTables ? (hasRoot ? rank < rootRank ? "Input tables" : rank === rootRank ? "Output tables" : "Downstream tables" : "Tables") : "Tables · Updates";
    lanes.push({ x: lane * 330, width: 240, label, count: members.length });
  });
  const bounds = { x: 0, y: 0, width: Math.max(240, (columns.length - 1) * 330 + 240),
    height: Math.max(62, ...[...boxes.values()].map(box => box.y + box.height)) };
  return { boxes, lanes, bounds };
}
