import { Link } from "react-router-dom";
import { ApplicationCard, ApplicationPageHeader } from "@dev-mainsequence/command-center-sdk/layout";
import { ArrowUpRight, X } from "lucide-react";
import { Badge, Button, formatDate } from "../ui";
import { pipelineNodeLabel, type PipelineNode, type UpdatePipeline } from "../updatePipeline";

/** The selected node stays alongside its connections, inside the graph canvas. */
export function PipelineInspector({ node, graph, historical, status, kind, nodePath, onSelect }: {
  node: PipelineNode; graph: UpdatePipeline; historical: boolean; status: string; kind: string;
  nodePath: (node: PipelineNode) => string; onSelect: (id: string | null) => void;
}) {
  const incoming = graph.edges.filter(edge => edge.target === node.id);
  const outgoing = graph.edges.filter(edge => edge.source === node.id);
  const relations = [
    { label: "Dependencies", ids: incoming.filter(edge => edge.kind === "depends_on").map(edge => edge.source) },
    { label: "Input tables", ids: incoming.filter(edge => edge.kind === "reads").map(edge => edge.source) },
    { label: "Output tables", ids: outgoing.filter(edge => edge.kind === "writes").map(edge => edge.target) },
    { label: "Written by", ids: incoming.filter(edge => edge.kind === "writes").map(edge => edge.source) },
    { label: "Consumers", ids: outgoing.filter(edge => edge.kind !== "writes").map(edge => edge.target) },
  ].map(relation => ({ ...relation, nodes: graph.nodes.filter(item => relation.ids.includes(item.id)) }))
    .filter(relation => relation.nodes.length);
  const statusTone = node.status === "succeeded" || node.status === "S" ? "success"
    : ["failed", "blocked", "E"].includes(node.status || "") ? "danger" : "neutral";
  return <ApplicationCard as="section" contentPadding="none" aria-label="Selected node details">
    <div className="mt-pipeline__inspector-content">
      <div className="mt-pipeline__inspector-heading">
        <ApplicationPageHeader title={<span className="mt-pipeline__inspector-title">{pipelineNodeLabel(node)}</span>} titleAs="h3" />
        <Button aria-label="Close node details" iconOnly size="small" variant="ghost" onClick={() => onSelect(null)}><X size={16} aria-hidden="true" /></Button>
      </div>
      <span className="mt-pipeline__inspector-kind">{kind}</span>
      <div className="mt-pipeline__inspector-actions">
        <Link to={nodePath(node)}>Open {node.kind === "update" ? "updater" : "table"}<ArrowUpRight size={14} aria-hidden="true" /></Link>
        {node.kind === "update" && <Badge tone={statusTone}>{status}</Badge>}
      </div>
        <dl className="mt-pipeline__inspector-facts">
          {node.namespace && <div><dt>Namespace</dt><dd>{node.namespace}</dd></div>}
          {node.kind !== "update" && <div><dt>Physical table</dt><dd>{node.label}</dd></div>}
          {node.kind === "update" && (historical ? <>
            <div><dt>Started</dt><dd>{formatDate(node.started_at)}</dd></div>
            <div><dt>Finished</dt><dd>{formatDate(node.ended_at)}</dd></div>
            {node.reason && <div><dt>Reason</dt><dd>{node.reason.replaceAll("_", " ")}</dd></div>}
          </> : <div><dt>Last update</dt><dd>{formatDate(node.last_update)}</dd></div>)}
          {relations.map(relation => <div key={relation.label}><dt>{relation.label}</dt><dd className="mt-pipeline__inspector-relations">{relation.nodes.map(related =>
            <span key={related.id}><Button size="small" variant="ghost" title={`Select ${pipelineNodeLabel(related)} in the graph`} onClick={() => onSelect(related.id)}>{pipelineNodeLabel(related)}</Button>
              <Link to={nodePath(related)} aria-label={`Open ${related.kind === "update" ? "updater" : "table"} ${pipelineNodeLabel(related)}`}><ArrowUpRight size={14} aria-hidden="true" /></Link></span>)}</dd></div>)}
        </dl>
        <details className="mt-pipeline__inspector-identity"><summary>Identifiers</summary><dl className="mt-pipeline__inspector-facts">
          <div><dt>UID</dt><dd>{node.uid}</dd></div>
          {node.update_hash && <div><dt>Update hash</dt><dd>{node.update_hash}</dd></div>}
          {node.run_uid && <div><dt>Attempt</dt><dd>{node.run_uid}</dd></div>}
        </dl></details>
        {!historical && node.latest_run_uid && <Link to={`/runs/${encodeURIComponent(node.latest_run_uid)}`}>Open latest recorded run</Link>}
    </div>
  </ApplicationCard>;
}
