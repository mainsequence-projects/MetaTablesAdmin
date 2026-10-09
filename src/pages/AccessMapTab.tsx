import "@xyflow/react/dist/base.css";
import "./accessMap.css";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import {
  Background, BackgroundVariant, getViewportForBounds, Handle, MarkerType, Panel, Position, ReactFlow, useStore,
  type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowUpRight, Bot, Layers3, Link2, Maximize, RefreshCw, Table2, User, Users, ZoomIn, ZoomOut } from "lucide-react";
import { Link } from "react-router-dom";
import {
  buildAccessMap, explainAccess, layoutAccessMap, traceAccess,
  type AccessEdge, type AccessLane, type AccessMapPayload, type AccessNode,
} from "../accessMap";
import { metaTablesApi } from "../api";
import { TimeIndexMetaTableIcon } from "../metatablesNavigation";
import { detailPath } from "../navigation";
import { useChartColors } from "../useChartColors";
import { Badge, Button, DetailSection, RemoteContent, StatePanel, useRemote } from "../ui";

type FlowNode = Node<{ node: AccessNode; state: "idle" | "dim" | "lit" | "selected"; onSelect: (id: string) => void }, "access">;

const tablePath = (node: AccessNode) => detailPath(node.tableKind === "time_index" ? "time-index-meta-tables" : "tables", node.uid);

function NodeIcon({ node }: { node: AccessNode }) {
  const Icon = node.kind === "team" ? Users : node.kind === "namespace" ? Layers3
    : node.kind === "user" ? node.identity === "workload" ? Bot : User
    : node.tableKind === "time_index" ? TimeIndexMetaTableIcon : node.kind === "related" ? Link2 : Table2;
  return <Icon aria-hidden="true" size={18} className="mt-anode__icon" />;
}

const AccessFlowNode = memo(function AccessFlowNode({ data }: NodeProps<FlowNode>) {
  const { node, state, onSelect } = data;
  const table = node.kind === "table" || node.kind === "related";
  // The box handles its own click (its node keeps pointer events): React Flow reports no node click while nodes can't be selected or dragged.
  return <div className="mt-anode" onClick={() => onSelect(node.id)} data-kind={node.kind} data-state={state} data-viewer={node.viewer || undefined} data-access={node.access} title={`${node.label}: ${node.meta}`}>
    {node.kind !== "user" && <Handle id="in" className="mt-anode__handle" isConnectable={false} position={Position.Left} type="target" />}
    <NodeIcon node={node} />
    <span className="mt-anode__text">
      <span className="mt-anode__label">{node.label}</span>
      <span className="mt-anode__meta">{node.meta}</span>
    </span>
    {table && <Link className="mt-anode__open nodrag nopan" to={tablePath(node)} aria-label={`Open table ${node.label}`} onClick={event => event.stopPropagation()}><ArrowUpRight size={15} aria-hidden="true" /></Link>}
    {node.kind !== "related" && <Handle id="out" className="mt-anode__handle" isConnectable={false} position={Position.Right} type="source" />}
    {node.kind === "table" && <Handle id="rel-in" className="mt-anode__handle" isConnectable={false} position={Position.Right} type="target" />}
  </div>;
});
const nodeTypes = { access: AccessFlowNode };

function LaneHeaders({ lanes }: { lanes: AccessLane[] }) {
  const [tx, , zoom] = useStore(state => state.transform);
  return <div aria-hidden="true" className="mt-amap__lanes">{lanes.map(lane =>
    <span key={lane.label} style={{ left: lane.x * zoom + tx, width: lane.width * zoom }}>{lane.label}<b>{lane.count}</b></span>)}</div>;
}

const edgeLabel = (edge: AccessEdge) => ({ reader: "Reader", writer: "Writer", member: "member", contains: "", foreign_key: "references", update_input: "feeds" })[edge.kind];

export function AccessMapTab({ uid }: { uid: string }) {
  const [relationships, setRelationships] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const requestKey = `namespace-access-map-${uid}-${relationships}-${refresh}`;
  const remote = useRemote(requestKey, signal => metaTablesApi.namespaceAccessMap(uid, relationships, signal));
  return <DetailSection title="Access map" description="Who reaches this namespace's tables, and through which Team and grant. It shows only what you can see."
    actions={<>
      <Button size="small" variant={relationships ? "secondary" : "ghost"} aria-pressed={relationships} onClick={() => setRelationships(value => !value)}><Link2 size={16} aria-hidden="true" />Relationships</Button>
      <Button size="small" variant="ghost" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
    </>}>
    <RemoteContent state={remote}>{payload => <AccessMapCanvas key={requestKey} payload={payload} />}</RemoteContent>
  </DetailSection>;
}

export function AccessMapCanvas({ payload }: { payload: AccessMapPayload }) {
  const [readColor, writeColor] = useChartColors();
  const map = useMemo(() => buildAccessMap(payload), [payload]);
  const layout = useMemo(() => layoutAccessMap(map), [map]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = map.nodes.find(node => node.id === selectedId) ?? null;
  const trace = useMemo(() => selectedId ? traceAccess(map, selectedId) : null, [map, selectedId]);
  const explanation = useMemo(() => selectedId ? explainAccess(payload, selectedId) : [], [payload, selectedId]);
  const kinds = new Map(map.nodes.map(node => [node.id, node.kind]));
  const select = useCallback((id: string) => setSelectedId(current => current === id ? null : id), []);

  const flowNodes: FlowNode[] = map.nodes.map(node => {
    const box = layout.boxes.get(node.id)!;
    return { id: node.id, type: "access", position: { x: box.x, y: box.y }, width: box.width, height: box.height,
      data: { node, onSelect: select, state: !trace ? "idle" : node.id === selectedId ? "selected" : trace.nodes.has(node.id) ? "lit" : "dim" },
      draggable: false, connectable: false, style: { pointerEvents: "all" }, ariaLabel: `${node.label}, ${node.meta}` };
  });
  const flowEdges: Edge[] = map.edges.map(edge => {
    const color = edge.kind === "writer" ? writeColor : edge.kind === "reader" ? readColor : "var(--muted-foreground)";
    const relation = edge.kind === "foreign_key" || edge.kind === "update_input";
    const marker = { type: MarkerType.ArrowClosed, color };
    return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: "out",
      targetHandle: relation && kinds.get(edge.target) === "table" ? "rel-in" : "in",
      className: `mt-aedge mt-aedge--${edge.kind}`, focusable: false, selectable: false,
      markerEnd: edge.reversed ? undefined : marker, markerStart: edge.reversed ? marker : undefined,
      label: edgeLabel(edge) || undefined, labelShowBg: true, labelBgPadding: [5, 3], labelBgBorderRadius: 3,
      style: { opacity: trace && !trace.edges.has(edge.id) ? 0.1 : 1 } };
  });

  const fit = useCallback((duration = 250) => {
    const canvas = canvasRef.current;
    if (!flow || !canvas) return;
    // Never fit below a readable zoom: on a narrow screen the map pans instead of shrinking away its labels.
    const viewport = getViewportForBounds(layout.bounds, canvas.clientWidth, Math.max(80, canvas.clientHeight - 16), 0.5, 1.05, 0.08);
    // Short maps start at the top of the canvas instead of floating in its middle.
    void flow.setViewport({ ...viewport, y: Math.min(viewport.y, 8) }, { duration });
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

  const counts = { principals: payload.principals.length, grants: payload.grants.length };
  return <ApplicationPageStack>
    <div className="mt-amap" data-zoom={zoom < 0.45 ? "far" : "near"}
      style={{ "--mt-amap-read": readColor, "--mt-amap-write": writeColor } as CSSProperties}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setSelectedId(null); }
        if ((event.key === "Enter" || event.key === " ") && !(event.target as HTMLElement).closest("a, button, input")) {
          const id = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id");
          if (id) { event.preventDefault(); setSelectedId(id === selectedId ? null : id); }
        }
      }}>
      <div className="mt-amap__toolbar">
        <span className="mt-amap__summary" role="status">
          {`${payload.table_count} tables · ${counts.principals} users and Teams · ${counts.grants} grants`}
          {payload.tables_truncated && ` · showing the first ${payload.tables.filter(table => !table.related).length}`}
        </span>
        <div className="mt-amap__controls" role="group" aria-label="Access map view">
          <Button aria-label="Zoom out access map" iconOnly size="small" variant="ghost" onClick={() => void flow?.zoomOut({ duration: 200 })}><ZoomOut size={16} aria-hidden="true" /></Button>
          <Badge>{`${Math.round(zoom * 100)}%`}</Badge>
          <Button aria-label="Zoom in access map" iconOnly size="small" variant="ghost" onClick={() => void flow?.zoomIn({ duration: 200 })}><ZoomIn size={16} aria-hidden="true" /></Button>
          <Button size="small" variant="ghost" onClick={() => fit()}><Maximize size={16} aria-hidden="true" />Fit</Button>
          {selected && <Button size="small" variant="secondary" onClick={() => setSelectedId(null)}>Clear selection</Button>}
        </div>
      </div>
      {payload.grants.length || payload.tables.length ? <div className="mt-amap__canvas" ref={canvasRef} aria-label="Namespace access map">
        <ReactFlow<FlowNode, Edge> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onInit={setFlow}
          onPaneClick={() => setSelectedId(null)}
          onMove={(_, viewport) => setZoom(viewport.zoom)} minZoom={0.15} maxZoom={1.8}
          nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} elementsSelectable={false}
          panOnDrag panOnScroll zoomOnDoubleClick={false} attributionPosition="top-right">
          <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
          <LaneHeaders lanes={layout.lanes} />
          {selected && <Panel position="bottom-left" className="mt-amap__inspector nodrag nopan nowheel">
            <div className="mt-amap__inspector-scroll" onWheel={event => event.stopPropagation()}>
              <div className="mt-amap__inspector-content">
                <span className="mt-amap__inspector-title">{selected.label}</span>
                <span className="mt-amap__inspector-kind">{selected.meta}</span>
                <ul className="mt-amap__inspector-lines">{explanation.map(line => <li key={line}>{line}</li>)}</ul>
                {(selected.kind === "table" || selected.kind === "related") && <Link className="mt-amap__inspector-link" to={tablePath(selected)}><ArrowUpRight size={15} aria-hidden="true" />Open table</Link>}
              </div>
            </div>
          </Panel>}
        </ReactFlow>
      </div> : <StatePanel embedded title="Nothing to show">No grant on this namespace or its tables is visible to you, and it has no tables you can see.</StatePanel>}
      <div className="mt-amap__footer">
        <span className="mt-amap__legend" aria-label="Access map legend">
          <span><i data-edge="writer" />Writer</span><span><i data-edge="reader" />Reader</span>
          <span><i data-edge="member" />Team member</span><span><i data-edge="contains" />In the namespace</span>
          <span><i data-edge="relation" />Relationship</span>
        </span>
        <span>{selected ? "Highlighted: everything it reaches and everything that reaches it · Esc to clear" : "Select a user, Team, namespace or table to trace its access."}</span>
      </div>
      <div className="mt-amap__rules" aria-label="How access works">
        <span><Badge tone="success">Enforced</Badge>Registering a table here needs Writer on the namespace, directly or through a Team.</span>
        <span><Badge tone="success">Enforced</Badge>Reading or writing a table needs a grant on it or on its namespace, in the API and in the database.</span>
        <span><Badge tone="warning">Not enforced</Badge>Which project uses this namespace. One namespace per application is a recommendation.</span>
      </div>
    </div>
  </ApplicationPageStack>;
}
