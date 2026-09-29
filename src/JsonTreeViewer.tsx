import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import { ChevronDown, ChevronRight } from "lucide-react";

// Port of Command Center's components/ui/json-tree-viewer.tsx. SDK 0.5.8 does
// not export the viewer; SDK controls own its disclosure buttons here.
type JsonPathSegment = string | number;

export interface JsonTreeViewerHandle {
  collapseAll: () => void;
  expandAll: () => void;
}

interface JsonTreeViewerProps {
  ariaLabel?: string;
  defaultExpandedDepth?: number;
  resetKey?: string | number | null;
  value: unknown;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCollapsibleValue(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : isJsonObject(value) && Object.keys(value).length > 0;
}

function encodePath(path: JsonPathSegment[]) {
  return JSON.stringify(path);
}

function collectExpandablePaths(value: unknown, depth = Infinity, path: JsonPathSegment[] = [], paths: string[] = []) {
  if (!isCollapsibleValue(value)) return paths;
  if (path.length > 0 && path.length < depth) paths.push(encodePath(path));
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [index, entry] as const)
    : Object.entries(value as Record<string, unknown>);
  for (const [key, entry] of entries) collectExpandablePaths(entry, depth, [...path, key], paths);
  return paths;
}

function formatCollapsedSummary(value: unknown) {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? "" : "s"}]`;
  const count = Object.keys(value as Record<string, unknown>).length;
  return `{${count} key${count === 1 ? "" : "s"}}`;
}

function PrimitiveValue({ value }: { value: unknown }) {
  const kind = typeof value === "string" ? "string"
    : typeof value === "number" || typeof value === "boolean" || value === null ? "literal" : "muted";
  return <span className={`json-tree-${kind}`}>{value === undefined ? "undefined" : JSON.stringify(value)}</span>;
}

function KeyLabel({ value }: { value: JsonPathSegment }) {
  return <span className={typeof value === "number" ? "json-tree-muted" : "json-tree-key"}>
    {typeof value === "number" ? value : JSON.stringify(value)}
  </span>;
}

export const JsonTreeViewer = forwardRef<JsonTreeViewerHandle, JsonTreeViewerProps>(function JsonTreeViewer({
  ariaLabel = "JSON tree viewer", defaultExpandedDepth = 1, resetKey, value,
}, ref) {
  const viewerId = useId();
  const allExpandablePaths = useMemo(() => collectExpandablePaths(value), [value]);
  const initialExpandedPaths = useMemo(() => new Set(collectExpandablePaths(value, defaultExpandedDepth)), [value, defaultExpandedDepth]);
  const [expandedPaths, setExpandedPaths] = useState(initialExpandedPaths);

  useEffect(() => { setExpandedPaths(new Set(initialExpandedPaths)); }, [initialExpandedPaths, resetKey]);
  useImperativeHandle(ref, () => ({
    collapseAll: () => setExpandedPaths(new Set()),
    expandAll: () => setExpandedPaths(new Set(allExpandablePaths)),
  }), [allExpandablePaths]);

  function togglePath(pathId: string) {
    setExpandedPaths(current => {
      const next = new Set(current);
      if (next.has(pathId)) next.delete(pathId); else next.add(pathId);
      return next;
    });
  }

  function renderNode(node: unknown, path: JsonPathSegment[], depth: number, isLast: boolean, keyLabel?: JsonPathSegment): ReactNode {
    const pathId = encodePath(path);
    const isRoot = path.length === 0;
    const isExpanded = isRoot || expandedPaths.has(pathId);
    const indent = { paddingInlineStart: `${depth}rem` };
    const comma = isLast ? null : <span className="json-tree-muted">,</span>;
    const label = keyLabel === undefined ? null : <><KeyLabel value={keyLabel} /><span className="json-tree-muted">: </span></>;

    if (!isCollapsibleValue(node)) return <div key={pathId} className="json-tree-row" style={indent}>
      {!isRoot && <span className="json-tree-spacer" />}
      <span className="json-tree-value">{label}<PrimitiveValue value={node} />{comma}</span>
    </div>;

    const entries = Array.isArray(node) ? node.map((entry, index) => [index, entry] as const) : Object.entries(node as Record<string, unknown>);
    const opener = Array.isArray(node) ? "[" : "{";
    const closer = Array.isArray(node) ? "]" : "}";
    const pathLabel = path.map(String).join(".");
    const disclosure = !isRoot && <Button type="button" variant="ghost" size="small" iconOnly
      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${pathLabel}`} aria-expanded={isExpanded}
      aria-controls={isExpanded ? `json-children-${viewerId}-${encodeURIComponent(pathId)}` : undefined} onClick={() => togglePath(pathId)}>
      {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
    </Button>;

    if (!isExpanded) return <div key={pathId} className="json-tree-row" style={indent}>
      {disclosure}<span className="json-tree-value">{label}<span className="json-tree-muted">{formatCollapsedSummary(node)}</span>{comma}</span>
    </div>;

    return <div key={pathId}>
      <div className="json-tree-row" style={indent}>{disclosure}<span className="json-tree-value">{label}<span className="json-tree-muted">{opener}</span></span></div>
      <div id={`json-children-${viewerId}-${encodeURIComponent(pathId)}`}>
        {entries.map(([key, entry], index) => renderNode(entry, [...path, key], depth + 1, index === entries.length - 1, key))}
      </div>
      <div className="json-tree-row" style={indent}>{!isRoot && <span className="json-tree-spacer" />}<span className="json-tree-muted">{closer}{comma}</span></div>
    </div>;
  }

  return <div role="region" aria-label={ariaLabel} className="json-tree-viewer">{renderNode(value, [], 0, true)}</div>;
});
