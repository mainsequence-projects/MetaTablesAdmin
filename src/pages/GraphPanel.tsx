import { useState } from "react";
import type { ResourceGraph } from "../api";
import { Badge, Button, Card, RemoteContent, useRemote } from "../ui";

export function GraphPanel({ requestKey, load, description }: { requestKey: string; load: (signal: AbortSignal) => Promise<ResourceGraph>; description: string }) {
  const graph = useRemote(requestKey, load);
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  return <Card title="Relationship graph" description={description} actions={<div className="button-row"><Button variant="ghost" aria-label="Zoom out" onClick={() => setScale((v) => Math.max(0.6, v - 0.15))}>−</Button><span className="zoom-label">{Math.round(scale * 100)}%</span><Button variant="ghost" aria-label="Zoom in" onClick={() => setScale((v) => Math.min(1.6, v + 0.15))}>+</Button><Button variant="secondary" onClick={() => { setScale(1); setSelected(null); }}>Fit</Button></div>}>
    <RemoteContent state={graph} empty={(value) => value.nodes.length === 0}>
      {(value) => {
        const cx = 400;
        const cy = 215;
        const radius = Math.min(155, 58 + value.nodes.length * 12);
        const positions = new Map(value.nodes.map((node, i) => [node.id, {
          x: cx + Math.cos((i * 2 * Math.PI) / value.nodes.length - Math.PI / 2) * radius,
          y: cy + Math.sin((i * 2 * Math.PI) / value.nodes.length - Math.PI / 2) * radius,
        }]));
        return <>
          <div className="graph-frame"><svg viewBox="0 0 800 430" role="img" aria-label="Resource relationship graph">
            <g transform={`translate(${cx * (1 - scale)} ${cy * (1 - scale)}) scale(${scale})`}>
              {value.edges.map((edge, i) => {
                const a = positions.get(edge.source); const b = positions.get(edge.target);
                if (!a || !b) return null;
                const active = selected === null || selected === edge.source || selected === edge.target;
                return <g key={`${edge.source}-${edge.target}-${i}`} opacity={active ? 1 : 0.18}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={edge.label === "writes" ? "var(--warning)" : "var(--primary)"} strokeWidth="2" markerEnd="url(#arrow)" /></g>;
              })}
              <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="var(--primary)" /></marker></defs>
              {value.nodes.map((node) => {
                const point = positions.get(node.id)!;
                return <g key={node.id} onClick={() => setSelected((v) => v === node.id ? null : node.id)} className="graph-node" role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelected(node.id); }} opacity={selected === null || selected === node.id ? 1 : 0.45}>
                  <rect x={point.x - 86} y={point.y - 28} rx="10" width="172" height="56" fill={selected === node.id ? "var(--primary)" : "var(--card)"} stroke={selected === node.id ? "var(--primary)" : "var(--border)"} />
                  <text x={point.x} y={point.y - 4} textAnchor="middle" fill={selected === node.id ? "var(--primary-foreground)" : "var(--muted-foreground)"} fontSize="10" fontWeight="700">{node.kind || "Resource"}</text>
                  <text x={point.x} y={point.y + 13} textAnchor="middle" fill={selected === node.id ? "var(--primary-foreground)" : "var(--foreground)"} fontSize="11">{node.label.length > 25 ? `${node.label.slice(0, 24)}…` : node.label}</text>
                </g>;
              })}
            </g>
          </svg></div>
          <div className="graph-legend"><Badge tone="accent">Reads or feeds</Badge><Badge tone="warning">Writes</Badge><span>{value.nodes.length} nodes · {value.edges.length} relations</span></div>
          {selected && <div className="selection-note">Selected: {value.nodes.find((node) => node.id === selected)?.label ?? selected} <Button variant="ghost" onClick={() => setSelected(null)}>Clear</Button></div>}
        </>;
      }}
    </RemoteContent>
  </Card>;
}
