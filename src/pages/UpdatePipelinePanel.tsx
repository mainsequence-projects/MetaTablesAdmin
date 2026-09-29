import "@xyflow/react/dist/base.css";
import "./updatePipeline.css";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, Button, Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import {
  Background, BackgroundVariant, getViewportForBounds, Handle, MarkerType, MiniMap,
  Position, ReactFlow, useStore, type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowUpRight, Maximize, RefreshCw, Table2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { metaTablesApi } from "../api";
import { TimeIndexMetaTableIcon } from "../metatablesNavigation";
import { detailPath } from "../navigation";
import { layoutUpdatePipeline, pipelineLineage, pipelineNodeLabel, type PipelineDirection, type PipelineNode, type UpdatePipeline, type PipelineLane } from "../updatePipeline";
import { useChartColors } from "../useChartColors";
import { DetailSection, Facts, formatDate, Picker, RemoteContent, StatePanel, useRemote } from "../ui";

const kindLabel = (node: PipelineNode) => node.kind === "update" ? "Time Index Table Update"
  : node.kind === "time_index_table" ? "Time Index MetaTable" : "MetaTable";
const statusLabel = (status?: string | null) => ({ Q: "Latest: queued", U: "Latest: updating", S: "Latest: success", E: "Latest: error",
  pending: "Pending", running: "Started · unfinished", succeeded: "Succeeded", failed: "Failed", blocked: "Blocked", skipped: "Skipped", not_run: "Not run" })[status ?? ""] ?? status ?? "No run status";
type FlowNode = Node<{ node: PipelineNode; state: "idle" | "dim" | "lit" | "selected"; root: boolean }, "pipeline">;

/** Node geometry and semantic zoom ported from the fixed-income ModelGraph. */
const PipelineFlowNode = memo(function PipelineFlowNode({ data }: NodeProps<FlowNode>) {
  const { node, state, root } = data;
  const Icon = node.kind === "update" ? RefreshCw : node.kind === "time_index_table" ? TimeIndexMetaTableIcon : Table2;
  return <div className="mt-pnode" data-kind={node.kind} data-state={state} data-root={root || undefined} title={`${kindLabel(node)}: ${node.label}`}>
    <Handle className="mt-pnode__handle" isConnectable={false} position={Position.Left} type="target" />
    <Icon aria-hidden="true" size={18} className="mt-pnode__icon" />
    <span className="mt-pnode__text">
      <span className="mt-pnode__label">{pipelineNodeLabel(node)}</span>
      <span className="mt-pnode__meta">{node.kind === "update" ? statusLabel(node.status) : kindLabel(node)}{root ? node.kind === "update" ? " · This update" : " · This table" : ""}</span>
    </span>
    {node.kind === "update" && <i aria-hidden="true" className="mt-pnode__status" data-status={node.status} />}
    <Handle className="mt-pnode__handle" isConnectable={false} position={Position.Right} type="source" />
  </div>;
});
const nodeTypes = { pipeline: PipelineFlowNode };

function LaneHeaders({ lanes }: { lanes: PipelineLane[] }) {
  const [tx, , zoom] = useStore(state => state.transform);
  return <div aria-hidden="true" className="mt-pipeline__lanes">{lanes.map((lane, i) =>
    <span key={i} style={{ left: lane.x * zoom + tx, width: lane.width * zoom }}>{lane.label}<b>{lane.count}</b></span>)}</div>;
}

export function UpdatePipelinePanel({ uid, updateUid }: { uid: string; updateUid?: string }) {
  const [refresh, setRefresh] = useState(0);
  const [direction, setDirection] = useState<PipelineDirection>("both");
  const requestKey = `table-update-pipeline-${uid}-${updateUid ?? "table"}-${direction}-${refresh}`;
  const remote = useRemote(requestKey, signal => metaTablesApi.tableUpdatePipeline(uid, signal, { direction, updateUid }));
  return <DetailSection title="Update pipeline" description={`Follow the registered upstream inputs and downstream consumers of this ${updateUid ? "update" : "table"}.`}
    actions={<Button size="small" variant="ghost" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh pipeline</Button>}>
    <Field label="Dependency direction"><Picker ariaLabel="Dependency direction" value={direction} fitContent
      options={[{ value: "upstream", label: "Upstream", subtitle: "Inputs and dependencies" }, { value: "downstream", label: "Downstream", subtitle: "Outputs and consumers" }, { value: "both", label: "Both", subtitle: "Inputs and consumers" }]}
      onValueChange={value => { if (value === "upstream" || value === "downstream" || value === "both") setDirection(value); }} /></Field>
    <RemoteContent state={remote}>{graph => <UpdatePipelineCanvas key={requestKey} graph={graph} />}</RemoteContent>
  </DetailSection>;
}

export function UpdatePipelineCanvas({ graph, selectedNodeId, onSelectNode, historical = false, renderNodeDetails }: {
  graph: UpdatePipeline; selectedNodeId?: string | null; onSelectNode?: (id: string | null) => void;
  historical?: boolean; renderNodeDetails?: (node: PipelineNode) => ReactNode;
}) {
  const navigate = useNavigate();
  const [readColor, writeColor] = useChartColors();
  const [selectedId, setSelectedId] = useState<string | null>(selectedNodeId ?? null);
  useEffect(() => { if (selectedNodeId !== undefined) setSelectedId(selectedNodeId); }, [selectedNodeId]);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [flow, setFlow] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const group = (node: PipelineNode) => node.kind === "update" ? "updates" : "tables";
  const visibleNodes = useMemo(() => graph.nodes.filter(node => !hidden.has(group(node))), [graph, hidden]);
  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map(node => node.id));
    return graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  }, [graph, visibleNodes]);
  const selected = visibleNodes.find(node => node.id === selectedId);
  const lineage = useMemo(() => selected ? pipelineLineage(selected.id, visibleEdges) : null, [selected, visibleEdges]);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => visibleNodes.filter(node => `${node.label} ${node.uid} ${node.update_hash ?? ""} ${node.namespace ?? ""}`.toLowerCase().includes(needle)), [needle, visibleNodes]);
  const shownIds = lineage && selected ? new Set([selected.id, ...lineage.upstream, ...lineage.downstream]) : null;
  const shownNodes = shownIds ? visibleNodes.filter(node => shownIds.has(node.id)) : visibleNodes;
  const shownEdges = shownIds ? visibleEdges.filter(edge => shownIds.has(edge.source) && shownIds.has(edge.target)) : visibleEdges;
  const layout = useMemo(() => layoutUpdatePipeline(shownNodes, shownEdges, graph.root_id), [graph.root_id, visibleNodes, visibleEdges, selectedId]);
  const matchIds = new Set(matches.map(node => node.id));
  const flowNodes: FlowNode[] = shownNodes.map(node => {
    const box = layout.boxes.get(node.id)!;
    return { id: node.id, type: "pipeline", position: { x: box.x, y: box.y }, width: box.width, height: box.height,
      data: { node, root: node.id === graph.root_id, state: selected ? node.id === selected.id ? "selected" : "lit" : needle && !matchIds.has(node.id) ? "dim" : "idle" },
      draggable: false, connectable: false, ariaLabel: `${kindLabel(node)} ${pipelineNodeLabel(node)}, ${node.kind === "update" ? statusLabel(node.status) : node.id === graph.root_id ? "this table" : "table"}` };
  });
  const flowEdges: Edge[] = shownEdges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${edge.kind}-${index}`, source: edge.source, target: edge.target,
    className: `mt-pedge mt-pedge--${edge.kind}`, animated: Boolean(selected), focusable: false, selectable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.kind === "writes" ? writeColor : edge.kind === "reads" ? readColor : "var(--muted-foreground)" },
    label: edge.kind === "depends_on" ? "depends on" : edge.kind, labelShowBg: true, labelBgPadding: [5, 3], labelBgBorderRadius: 3,
    style: { opacity: !selected && needle && (!matchIds.has(edge.source) || !matchIds.has(edge.target)) ? 0.12 : 1 },
  }));

  const fit = useCallback((duration = 250) => {
    const canvas = canvasRef.current;
    if (!flow || !canvas) return;
    const height = Math.max(80, canvas.clientHeight - 48);
    const viewport = getViewportForBounds(layout.bounds, canvas.clientWidth, height, 0.15, 1.05, 0.13);
    void flow.setViewport({ ...viewport, y: viewport.y + 32 }, { duration });
  }, [flow, layout]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => fit(0));
    return () => cancelAnimationFrame(frame);
  }, [fit]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => fit(0));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fit]);
  const select = (id: string | null) => { setSelectedId(id); onSelectNode?.(id); setQuery(""); };
  const toggle = (kind: string) => {
    select(null);
    setHidden(previous => { const next = new Set(previous); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; });
  };
  const open = (node: PipelineNode) => navigate(detailPath(node.kind === "update" ? "data-updates" : node.kind === "time_index_table" ? "time-index-meta-tables" : "tables", node.uid));
  const incoming = selected ? visibleEdges.filter(edge => edge.target === selected.id) : [];
  const outgoing = selected ? visibleEdges.filter(edge => edge.source === selected.id) : [];
  const neighbours = (ids: string[]) => ids.length ? <div className="mt-pipeline__neighbours">{[...new Set(ids)].map(id => {
    const node = visibleNodes.find(node => node.id === id)!;
    return <Button key={id} size="small" variant="ghost" title={node.label} onClick={() => select(id)}><span className="mt-pipeline__neighbour-label">{pipelineNodeLabel(node)}</span></Button>;
  })}</div> : "None in this pipeline";

  return <ApplicationPageStack>
    <div className="mt-pipeline" data-focus={selected ? "" : undefined} data-zoom={zoom < 0.45 ? "far" : "near"}
      style={{ "--mt-pipeline-read": readColor, "--mt-pipeline-write": writeColor } as CSSProperties}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); select(null); }
        if (event.key === "Enter" || event.key === " ") {
          const id = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id");
          if (id) { event.preventDefault(); select(id === selectedId ? null : id); }
        }
      }}>
      <div className="mt-pipeline__toolbar">
        <div className="mt-pipeline__filters" role="group" aria-label="Pipeline node types">
          {(["tables", "updates"] as const).map(kind => <Button key={kind} size="small" variant={hidden.has(kind) ? "ghost" : "secondary"} aria-pressed={!hidden.has(kind)} onClick={() => toggle(kind)}>
            {kind === "tables" ? <Table2 size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}{kind === "tables" ? "Tables" : "Updates"} {graph.nodes.filter(node => group(node) === kind).length}
          </Button>)}
        </div>
        <div className="mt-pipeline__find"><Field label="Find a node"><Input type="search" placeholder="Name, update hash, or UID" value={query}
          onChange={event => { select(null); setQuery(event.target.value); }} onKeyDown={event => { if (event.key === "Enter" && matches[0]) select(matches[0].id); }} /></Field>
          {needle && <span className="mt-pipeline__matches" role="status">{matches.length} matches</span>}
        </div>
        <div className="mt-pipeline__controls" role="group" aria-label="Pipeline view">
          <Button aria-label="Zoom out pipeline" iconOnly size="small" variant="ghost" onClick={() => void flow?.zoomOut({ duration: 200 })}><ZoomOut size={16} aria-hidden="true" /></Button>
          <Badge>{Math.round(zoom * 100)}%</Badge>
          <Button aria-label="Zoom in pipeline" iconOnly size="small" variant="ghost" onClick={() => void flow?.zoomIn({ duration: 200 })}><ZoomIn size={16} aria-hidden="true" /></Button>
          <Button size="small" variant="ghost" onClick={() => fit()}><Maximize size={16} aria-hidden="true" />Fit</Button>
          {selected && <Button size="small" variant="secondary" onClick={() => select(null)}>Whole pipeline</Button>}
        </div>
      </div>
      {shownNodes.length ? <div className="mt-pipeline__canvas" ref={canvasRef} aria-label={historical ? "Historical run graph" : "Registered update pipeline"}>
        <ReactFlow<FlowNode, Edge> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onInit={setFlow}
          onNodeClick={(_, node) => select(node.id === selectedId ? null : node.id)} onPaneClick={() => select(null)}
          onMove={(_, viewport) => setZoom(viewport.zoom)} minZoom={0.15} maxZoom={1.8}
          nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} elementsSelectable={false}
          panOnDrag panOnScroll zoomOnDoubleClick={false} attributionPosition="bottom-left">
          <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
          <LaneHeaders lanes={layout.lanes} />
          <MiniMap ariaLabel="Pipeline overview" pannable zoomable nodeBorderRadius={3} nodeColor={node => (node as FlowNode).data.node.kind === "update" ? writeColor : readColor}
            position="bottom-right" style={{ width: 104, height: 74 }} />
        </ReactFlow>
      </div> : <StatePanel embedded title="No visible nodes">Enable Tables or Updates to see the pipeline.</StatePanel>}
      <div className="mt-pipeline__footer"><span className="mt-pipeline__legend" aria-label="Pipeline edge legend"><span><i data-edge="reads" />Reads table</span><span><i data-edge="writes" />Writes table</span><span><i data-edge="depends_on" />Update dependency</span></span>
        <span>{selected && lineage ? `${lineage.upstream.size} upstream · ${lineage.downstream.size} downstream · Esc to clear` : "Drag or scroll to pan. Select a node to trace its lineage."}</span>
      </div>
    </div>
    {selected && lineage && <DetailSection title={pipelineNodeLabel(selected)} description={kindLabel(selected)} actions={<><Button size="small" variant="secondary" onClick={() => open(selected)}>Open {selected.kind === "update" ? "update" : "table"}<ArrowUpRight aria-hidden="true" size={16} /></Button><Button aria-label="Close pipeline inspector" iconOnly size="small" variant="ghost" onClick={() => select(null)}><X aria-hidden="true" size={16} /></Button></>}>
      <Facts items={[{ label: "UID", value: selected.uid }, { label: "Namespace", value: selected.namespace || "None" },
        ...(selected.kind !== "update" ? [{ label: "Physical table", value: selected.label }] : []),
        ...(selected.kind === "update" ? [{ label: "Update hash", value: selected.update_hash }, { label: historical ? "State in this run" : "Latest state", value: statusLabel(selected.status) },
          ...(historical ? [{ label: "Calculation started", value: formatDate(selected.started_at) }, { label: "Node finished", value: formatDate(selected.ended_at) },
            { label: "Reason", value: selected.reason?.replaceAll("_", " ") || "—" }]
            : [{ label: "Last update", value: formatDate(selected.last_update) }])] : []),
        { label: "Direct inputs", value: neighbours(incoming.map(edge => edge.source)) }, { label: "Direct outputs / consumers", value: neighbours(outgoing.map(edge => edge.target)) },
      ]} />
      {!historical && selected.latest_run_uid && <Button variant="secondary" onClick={() => navigate(`/runs/${encodeURIComponent(selected.latest_run_uid!)}`)}>Open latest recorded run</Button>}
      {renderNodeDetails?.(selected)}
    </DetailSection>}
  </ApplicationPageStack>;
}
