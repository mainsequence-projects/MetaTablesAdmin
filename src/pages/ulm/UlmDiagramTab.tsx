import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, Field } from "@dev-mainsequence/command-center-sdk/controls";
import { ActivityIndicator } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ChevronDown, ChevronRight, Focus, Move, PanelRightClose, PanelRightOpen, Table2, ZoomIn, ZoomOut } from "lucide-react";
import { metaTablesApi, type TableDetail } from "../../api";
import type { SchemaGraphApi } from "../../apiContract";
import { TimeIndexMetaTableIcon } from "../../metatablesNavigation";
import { DetailSection, Picker, RemoteContent, useRemote } from "../../ui";
import { buildMetaTableUmlLayout, buildRelationshipLabel, buildRelationshipPath, clamp, estimateRelationshipLabelWidth, getFitTransform, umlGraphConfig } from "./layout";
import { ulmGraphRecord, type UlmColumn, type UlmTable } from "./model";

export function UlmDiagramTab({ table }: { table: TableDetail }) {
  const [depth, setDepth] = useState(2);
  const [incoming, setIncoming] = useState(false);
  const requestKey = `ulm-${table.uid}-${depth}-${incoming}`;
  const remote = useRemote(requestKey, signal => metaTablesApi.tableSchemaGraph(table.uid, depth, incoming, signal));
  return <ApplicationPageStack>
    <div className="ulm-filters">
      <Field label="Traversal depth" description="Number of foreign-key steps from this table.">
        <Picker ariaLabel="Graph depth" value={String(depth)} options={[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: String(value) }))} onValueChange={value => setDepth(Number(value))} />
      </Field>
      <Field label="Reference direction" description="Include tables that reference this table.">
        <Picker ariaLabel="Reference direction" value={incoming ? "incoming" : "outgoing"}
          options={[{ value: "outgoing", label: "Outgoing only" }, { value: "incoming", label: "Include incoming references" }]}
          onValueChange={value => setIncoming(value === "incoming")} />
      </Field>
    </div>
    <RemoteContent state={remote} loading="Loading the table schema and foreign-key relationships…">
      {graph => <UlmExplorer key={requestKey} graph={graph} root={table} />}
    </RemoteContent>
  </ApplicationPageStack>;
}

type PanState = { originPanX: number; originPanY: number; pointerId: number; startClientX: number; startClientY: number };
type Transform = { zoom: number; panX: number; panY: number };

/** Command Center's ULM canvas, adapted to SDK controls and on-demand catalog metadata. */
function UlmExplorer({ graph, root }: { graph: SchemaGraphApi; root: TableDetail }) {
  const [details, setDetails] = useState(() => new Map([[root.uid, root]]));
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});
  const [metadataLoading, setMetadataLoading] = useState<Record<string, boolean>>({});
  const requests = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const payload = useMemo(() => ulmGraphRecord(graph, root.uid, details), [graph, root.uid, details]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => ({ [payload.root_table_id]: true }));
  const [selectedId, setSelectedId] = useState(payload.root_table_id);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const selected = payload.tables.find(table => table.id === selectedId) ?? payload.tables[0];
  const layout = useMemo(() => buildMetaTableUmlLayout(payload, expanded), [payload, expanded]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<Transform>({ zoom: 1, panX: 0, panY: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const [pointerPan, setPointerPan] = useState<PanState | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requests.current.forEach(controller => controller.abort()); requests.current.clear(); };
  }, []);

  function loadMetadata(table: UlmTable) {
    if (table.metadataLoaded || requests.current.has(table.uid)) return;
    const controller = new AbortController();
    requests.current.set(table.uid, controller);
    setMetadataLoading(value => ({ ...value, [table.uid]: true }));
    setMetadataErrors(value => { const next = { ...value }; delete next[table.uid]; return next; });
    metaTablesApi.table(table.uid, controller.signal).then(detail => {
      if (mounted.current && !controller.signal.aborted) setDetails(value => new Map(value).set(table.uid, detail));
    }, cause => {
      if (mounted.current && !controller.signal.aborted) setMetadataErrors(value => ({ ...value, [table.uid]: cause instanceof Error ? cause.message : "Could not load table metadata." }));
    }).finally(() => {
      if (requests.current.get(table.uid) === controller) requests.current.delete(table.uid);
      if (mounted.current && !controller.signal.aborted) setMetadataLoading(value => ({ ...value, [table.uid]: false }));
    });
  }

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Re-fit when expansion or hydrated columns change the actual layout bounds.
  useEffect(() => {
    if (layout && viewport.width && viewport.height) setTransform(getFitTransform(layout.bounds, viewport));
  }, [layout, viewport]);

  useEffect(() => {
    if (!pointerPan) return;
    const pan = pointerPan;
    function move(event: PointerEvent) {
      if (event.pointerId === pan.pointerId) setTransform(value => ({ ...value, panX: pan.originPanX + event.clientX - pan.startClientX, panY: pan.originPanY + event.clientY - pan.startClientY }));
    }
    function end(event: PointerEvent) { if (event.pointerId === pan.pointerId) setPointerPan(null); }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, [pointerPan]);

  function zoomAt(nextZoom: number, x = viewport.width / 2, y = viewport.height / 2) {
    setTransform(value => {
      const zoom = clamp(nextZoom, umlGraphConfig.minZoom, umlGraphConfig.maxZoom);
      return { zoom, panX: x - (x - value.panX) / value.zoom * zoom, panY: y - (y - value.panY) / value.zoom * zoom };
    });
  }

  // Native non-passive wheel subscription lets the canvas zoom without scrolling the page.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      if (!element) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(transformRef.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08), event.clientX - rect.left, event.clientY - rect.top);
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [viewport]);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("[data-uml-card]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointerPan({ pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, originPanX: transform.panX, originPanY: transform.panY });
  }

  function inspect(table: UlmTable) { setSelectedId(table.id); setInspectorOpen(true); loadMetadata(table); }
  function toggleColumns(table: UlmTable) {
    setExpanded(value => ({ ...value, [table.id]: !value[table.id] }));
    if (!expanded[table.id]) loadMetadata(table);
  }
  function metadataState(table: UlmTable) {
    if (metadataLoading[table.uid]) return <ActivityIndicator label={`Loading columns for ${table.identifier}`} />;
    if (metadataErrors[table.uid]) return <div role="alert"><p>{metadataErrors[table.uid]}</p><Button size="small" onClick={() => loadMetadata(table)}>Retry columns</Button></div>;
    if (!table.metadataLoaded) return <p className="muted">Expand or inspect this table to load its columns.</p>;
    if (!table.columns.length) return <p className="muted">No registered columns.</p>;
    return null;
  }

  const relations = selected ? payload.relationships.filter(edge => edge.source_table_id === selected.id || edge.target_table_id === selected.id) : [];
  if (!layout?.cards.length) return <DetailSection title="No schema graph data"><p>No schema graph data is available for this MetaTable.</p></DetailSection>;

  return <ApplicationPageStack>
    <ApplicationPageHeader title="Schema explorer" titleAs="h2" description="Expand tables to follow foreign keys between columns. Drag the canvas to pan; scroll to zoom."
      actions={<>
        <Badge>{payload.tables.length} {payload.tables.length === 1 ? "table" : "tables"}</Badge><Badge>{payload.relationships.length} {payload.relationships.length === 1 ? "relationship" : "relationships"}</Badge>
        <Button iconOnly size="small" aria-label="Zoom out" onClick={() => zoomAt(transform.zoom / 1.12)}><ZoomOut size={16} /></Button>
        <Badge>{Math.round(transform.zoom * 100)}%</Badge>
        <Button iconOnly size="small" aria-label="Zoom in" onClick={() => zoomAt(transform.zoom * 1.12)}><ZoomIn size={16} /></Button>
        <Button size="small" onClick={() => setTransform(getFitTransform(layout.bounds, viewport))}><Focus size={16} />Fit</Button>
        <Button size="small" aria-expanded={inspectorOpen} aria-controls="ulm-inspector" onClick={() => { setInspectorOpen(value => !value); if (selected) loadMetadata(selected); }}>
          {inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}Inspector
        </Button>
      </>} />
    <div className="ulm-legend"><span><i className="ulm-root-line" />Touches root</span><span><i className="ulm-indirect-line" />Indirect relationship</span><span><i className="ulm-cascade-line" />Cascade delete</span><span><i className="ulm-other-line" />Other delete policy</span></div>
    <div className={`ulm-workspace${inspectorOpen ? " ulm-workspace-inspecting" : ""}`}>
      <div ref={viewportRef} className="ulm-viewport" style={{ cursor: pointerPan ? "grabbing" : "grab" }} onPointerDown={pointerDown} role="region" aria-label="ULM schema canvas"
        tabIndex={0} onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const deltas: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
          const delta = deltas[event.key];
          if (delta) { event.preventDefault(); setTransform(value => ({ ...value, panX: value.panX + delta[0], panY: value.panY + delta[1] })); }
        }}>
        <div className="ulm-world" data-ulm-world style={{ width: layout.bounds.width, height: layout.bounds.height, transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})` }}>
          <svg className="ulm-edges" width={layout.bounds.width} height={layout.bounds.height} viewBox={`0 0 ${layout.bounds.width} ${layout.bounds.height}`} aria-label="Foreign-key relationships">
            {layout.relationships.map(edge => {
              const geometry = buildRelationshipPath(edge, layout.cardsById);
              if (!geometry) return null;
              const rootRelation = edge.source_table_id === payload.root_table_id || edge.target_table_id === payload.root_table_id;
              const width = estimateRelationshipLabelWidth(edge);
              return <g key={edge.id} className={rootRelation ? "ulm-root-edge" : "ulm-indirect-edge"} data-ulm-relationship={edge.name}>
                <title>{edge.name}: {buildRelationshipLabel(edge)}; on delete {edge.on_delete || "not set"}</title>
                <path d={geometry.path} className="ulm-edge-glow" />
                <path d={geometry.path} className="ulm-edge-stroke" strokeDasharray={edge.on_delete?.toLowerCase() === "cascade" ? undefined : "7 5"} />
                <circle cx={geometry.startX} cy={geometry.startY} r={4} /><circle cx={geometry.endX} cy={geometry.endY} r={4} />
                <rect className="ulm-edge-label-background" x={geometry.labelX - width / 2} y={geometry.labelY - 13} width={width} height={26} rx={13} />
                <text className="ulm-edge-label" x={geometry.labelX} y={geometry.labelY + 4} textAnchor="middle">{buildRelationshipLabel(edge)}</text>
              </g>;
            })}
          </svg>
          {layout.cards.map(table => {
            const rootTable = table.id === payload.root_table_id;
            const Icon = table.kind === "TimeIndexMetaTable" ? TimeIndexMetaTableIcon : Table2;
            return <article key={table.uid} data-uml-card={table.uid} aria-label={table.identifier} className={`ulm-card${rootTable ? " ulm-root-card" : ""}${selectedId === table.id ? " ulm-selected-card" : ""}`} style={{ left: table.x, top: table.y, width: table.width, height: table.height }}>
              <div className="ulm-card-header">
                <div className="ulm-card-title"><Icon size={18} aria-hidden="true" /><strong title={table.identifier}>{table.identifier}</strong>{rootTable && <Badge variant="primary">Root</Badge>}</div>
                <div className="ulm-card-identity" title={table.uid}>{table.uid}</div>
                <div className="ulm-card-identity" title={`${table.namespace || "No namespace"} · ${table.physical_table_name}`}>{table.namespace || "No namespace"} · {table.physical_table_name}</div>
                <div className="ulm-card-actions">
                  <Button size="small" variant="ghost" aria-label={`Inspect ${table.identifier}`} aria-pressed={selectedId === table.id && inspectorOpen} onClick={() => inspect(table)}>Inspect</Button>
                  <Button size="small" aria-label={`${table.columnsExpanded ? "Collapse" : "Expand"} columns for ${table.identifier}`} aria-expanded={table.columnsExpanded} onClick={() => toggleColumns(table)}>
                    {table.columnsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{table.metadataLoaded ? `${table.columns.length} columns` : "Columns"}
                  </Button>
                </div>
              </div>
              <div className="ulm-card-body">
                {table.columnsExpanded ? <>
                  {metadataState(table)}
                  <div className="ulm-columns">{table.columns.map(column => <ColumnRow key={column.column_name} column={column} />)}</div>
                  {!!table.indexes.length && <div className="ulm-indexes"><strong>Indexes</strong><div>{table.indexes.map(index => <span className="ulm-index-pill" key={index.name} title={`${index.name}: ${index.columns.join(", ")}${index.unique ? " · unique" : ""}`}>{index.name} · {index.columns.join(", ")}</span>)}</div></div>}
                </> : <span className="muted">Expand columns to inspect the table shape.</span>}
              </div>
            </article>;
          })}
        </div>
      </div>
      {inspectorOpen && selected && <div id="ulm-inspector" className="ulm-inspector" role="region" aria-label="Table inspector">
        <ApplicationPageStack>
          <ApplicationPageHeader title={selected.identifier} titleAs="h3" description={selected.kind}
          actions={<Button iconOnly size="small" aria-label="Close inspector" onClick={() => setInspectorOpen(false)}><PanelRightClose size={16} /></Button>} />
          <ApplicationPageStack>
            <dl className="ulm-inspector-facts"><dt>UID</dt><dd>{selected.uid}</dd><dt>Namespace</dt><dd>{selected.namespace || "Not set"}</dd><dt>Physical table</dt><dd>{selected.physical_table_name}</dd></dl>
            <ApplicationPageHeader title={`Columns${selected.metadataLoaded ? ` (${selected.columns.length})` : ""}`} titleAs="h3" />
            {metadataState(selected)}
            {selected.columns.map(column => <div key={column.column_name} className="ulm-inspector-column"><strong>{column.column_name}</strong><span className="ulm-inspector-description">{column.attr_name} · {column.db_type}</span><div className="ulm-flags"><ColumnFlags column={column} /></div></div>)}
            {!!selected.indexes.length && <><ApplicationPageHeader title="Indexes" titleAs="h3" />{selected.indexes.map(index => <div className="ulm-inspector-column" key={index.name}><strong>{index.name}</strong><span className="ulm-inspector-description">{index.columns.join(", ") || "Expression index"}{index.unique ? " · unique" : ""}</span></div>)}</>}
            <ApplicationPageHeader title={`Relationships (${relations.length})`} titleAs="h3" />
            {relations.map(edge => {
              const outgoing = edge.source_table_id === selected.id;
              const related = payload.tables.find(table => table.id === (outgoing ? edge.target_table_id : edge.source_table_id));
              return <div key={edge.id} className="ulm-inspector-column"><Badge>{outgoing ? "Outgoing" : "Incoming"}</Badge><strong>{edge.name}</strong><span className="ulm-inspector-description">{buildRelationshipLabel(edge)}</span><span className="ulm-inspector-description">On delete: {edge.on_delete || "Not set"}</span>{related && <Button size="small" onClick={() => inspect(related)}>Inspect {related.identifier}</Button>}</div>;
            })}
            {!relations.length && <p className="muted">No relationships within the selected depth.</p>}
          </ApplicationPageStack>
        </ApplicationPageStack>
      </div>}
    </div>
    <div className="ulm-help"><Move size={14} aria-hidden="true" />Drag to pan · Scroll to zoom · Arrow keys pan the focused canvas · Inspect a table for column and foreign-key details</div>
  </ApplicationPageStack>;
}

function ColumnFlags({ column }: { column: UlmColumn }) {
  return <>{column.is_primary_key && <Badge variant="primary">PK</Badge>}{column.is_unique && <Badge>UQ</Badge>}<Badge>{column.nullable === undefined ? "Nullability unknown" : column.nullable ? "NULL" : "NOT NULL"}</Badge></>;
}
function ColumnRow({ column }: { column: UlmColumn }) {
  return <div className={`ulm-column${column.is_primary_key ? " ulm-primary-column" : ""}`} data-ulm-column={column.column_name}>
    <div className="ulm-column-name"><strong title={column.column_name}>{column.column_name}</strong><span title={column.db_type}>{column.db_type}</span></div>
    <div className="ulm-flags"><ColumnFlags column={column} /></div>
  </div>;
}
