// Ported from Command Center's MainSequenceTableUmlExplorer.tsx.
// SDK controls and the MetaTables API adapter live outside the domain layout.
import type { UlmGraph, UlmRelationship, UlmTable } from "./model";

export interface MetaTableUmlLayoutCard extends UlmTable {
  columnAnchors: Map<string, { leftX: number; rightX: number; y: number }>;
  columnsExpanded: boolean;
  depth: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface MetaTableUmlLayoutResult {
  bounds: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  cards: MetaTableUmlLayoutCard[];
  cardsById: Map<number, MetaTableUmlLayoutCard>;
  maxDepth: number;
  minDepth: number;
  relationships: UlmRelationship[];
}

export const umlGraphConfig = {
  bodyBottomSafety: 20,
  bodyPaddingY: 24,
  cardWidth: 360,
  collapsedBodyHeight: 12,
  columnGap: 144,
  columnRowGap: 8,
  collapsedCardHeight: 164,
  fitPadding: 52,
  headerHeight: 128,
  indexBlockGapTop: 16,
  indexHeaderHeight: 18,
  indexPillGap: 8,
  indexPillHeight: 26,
  indexSectionTopPadding: 12,
  innerHorizontalPadding: 32,
  minCardHeight: 186,
  minZoom: 0.1,
  paddingX: 64,
  paddingY: 56,
  relationshipLabelCardClearance: 20,
  rowGap: 34,
  rowHeight: 44,
  maxZoom: 1.8,
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateIndexPillWidth(index: UlmTable["indexes"][number]) {
  const content = [index.name, index.columns.join(", ")].filter(Boolean).join(" · ");

  return Math.max(96, Math.min(308, 28 + content.length * 6.8));
}

function estimateIndexRows(table: UlmTable) {
  if (table.indexes.length === 0) {
    return 0;
  }

  const availableWidth = umlGraphConfig.cardWidth - umlGraphConfig.innerHorizontalPadding;
  let rows = 1;
  let currentRowWidth = 0;

  table.indexes.forEach((index) => {
    const pillWidth = estimateIndexPillWidth(index);

    if (currentRowWidth === 0) {
      currentRowWidth = pillWidth;
      return;
    }

    if (currentRowWidth + umlGraphConfig.indexPillGap + pillWidth <= availableWidth) {
      currentRowWidth += umlGraphConfig.indexPillGap + pillWidth;
      return;
    }

    rows += 1;
    currentRowWidth = pillWidth;
  });

  return rows;
}

function getCardHeight(table: UlmTable, columnsExpanded: boolean) {
  if (!columnsExpanded) {
    return Math.max(
      umlGraphConfig.collapsedCardHeight,
      umlGraphConfig.headerHeight +
        umlGraphConfig.bodyPaddingY +
        umlGraphConfig.collapsedBodyHeight +
        umlGraphConfig.bodyBottomSafety,
    );
  }

  // Leave room for SDK loading feedback and a retry action before hydration.
  if (!table.metadataLoaded) return umlGraphConfig.headerHeight + 160;

  const columnCount = Math.max(1, table.columns.length);
  const columnHeight =
    columnCount * umlGraphConfig.rowHeight +
    Math.max(0, columnCount - 1) * umlGraphConfig.columnRowGap;
  const indexRows = estimateIndexRows(table);
  const indexesHeight =
    indexRows > 0
      ? umlGraphConfig.indexBlockGapTop +
        umlGraphConfig.indexSectionTopPadding +
        umlGraphConfig.indexHeaderHeight +
        8 +
        indexRows * umlGraphConfig.indexPillHeight +
        Math.max(0, indexRows - 1) * umlGraphConfig.indexPillGap
      : 0;

  return Math.max(
    umlGraphConfig.minCardHeight,
    umlGraphConfig.headerHeight +
      umlGraphConfig.bodyPaddingY +
      columnHeight +
      indexesHeight +
      umlGraphConfig.bodyBottomSafety,
  );
}

export function getFitTransform(
  bounds: MetaTableUmlLayoutResult["bounds"],
  viewport: { height: number; width: number },
) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const availableWidth = Math.max(1, width - umlGraphConfig.fitPadding * 2);
  const availableHeight = Math.max(1, height - umlGraphConfig.fitPadding * 2);
  const zoom = clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    umlGraphConfig.minZoom,
    umlGraphConfig.maxZoom,
  );

  return {
    panX: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    panY: (height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

function buildDepthMap(payload: UlmGraph) {
  const outgoing = new Map<number, Set<number>>();
  const incoming = new Map<number, Set<number>>();

  payload.relationships.forEach((relationship) => {
    const currentOutgoing = outgoing.get(relationship.source_table_id) ?? new Set<number>();
    currentOutgoing.add(relationship.target_table_id);
    outgoing.set(relationship.source_table_id, currentOutgoing);

    const currentIncoming = incoming.get(relationship.target_table_id) ?? new Set<number>();
    currentIncoming.add(relationship.source_table_id);
    incoming.set(relationship.target_table_id, currentIncoming);
  });

  const depths = new Map<number, number>();
  const queue: number[] = [payload.root_table_id];
  depths.set(payload.root_table_id, 0);

  while (queue.length > 0) {
    const currentTableId = queue.shift();

    if (currentTableId === undefined) {
      continue;
    }

    const currentDepth = depths.get(currentTableId) ?? 0;

    (outgoing.get(currentTableId) ?? []).forEach((tableId) => {
      if (!depths.has(tableId)) {
        depths.set(tableId, currentDepth + 1);
        queue.push(tableId);
      }
    });

    (incoming.get(currentTableId) ?? []).forEach((tableId) => {
      if (!depths.has(tableId)) {
        depths.set(tableId, currentDepth - 1);
        queue.push(tableId);
      }
    });
  }

  let fallbackDepth =
    Math.max(
      0,
      ...Array.from(depths.values()).filter((value) => Number.isFinite(value) && value >= 0),
    ) + 1;

  payload.tables.forEach((table) => {
    if (!depths.has(table.id)) {
      depths.set(table.id, fallbackDepth);
      fallbackDepth += 1;
    }
  });

  return depths;
}

function buildColumnAnchors(card: {
  height: number;
  width: number;
  x: number;
  y: number;
  columns: UlmTable["columns"];
  columnsExpanded: boolean;
}) {
  const anchors = new Map<string, { leftX: number; rightX: number; y: number }>();

  if (!card.columnsExpanded) {
    return anchors;
  }

  const startY = card.y + umlGraphConfig.headerHeight + umlGraphConfig.bodyPaddingY / 2;

  card.columns.forEach((column, index) => {
    anchors.set(column.column_name, {
      leftX: card.x,
      rightX: card.x + card.width,
      y: startY + index * (umlGraphConfig.rowHeight + umlGraphConfig.columnRowGap) + umlGraphConfig.rowHeight / 2,
    });
  });

  return anchors;
}

export function buildMetaTableUmlLayout(
  payload: UlmGraph | undefined,
  expandedTables: Record<number, boolean>,
): MetaTableUmlLayoutResult | null {
  if (!payload) {
    return null;
  }

  if (!payload.tables.length) {
    return {
      bounds: {
        x: 0,
        y: 0,
        width: umlGraphConfig.cardWidth,
        height: umlGraphConfig.minCardHeight,
      },
      cards: [],
      cardsById: new Map(),
      minDepth: 0,
      maxDepth: 0,
      relationships: [],
    };
  }

  const depths = buildDepthMap(payload);
  const relationCounts = new Map<number, number>();

  payload.relationships.forEach((relationship) => {
    relationCounts.set(
      relationship.source_table_id,
      (relationCounts.get(relationship.source_table_id) ?? 0) + 1,
    );
    relationCounts.set(
      relationship.target_table_id,
      (relationCounts.get(relationship.target_table_id) ?? 0) + 1,
    );
  });

  const groups = new Map<number, UlmTable[]>();
  payload.tables.forEach((table) => {
    const depth = depths.get(table.id) ?? 0;
    const current = groups.get(depth) ?? [];
    current.push(table);
    groups.set(depth, current);
  });

  const orderedDepths = Array.from(groups.keys()).sort((left, right) => left - right);
  const minDepth = orderedDepths[0] ?? 0;
  const maxDepth = orderedDepths[orderedDepths.length - 1] ?? 0;
  const depthGapByColumn = new Map<number, number>();

  for (let depth = minDepth; depth < maxDepth; depth += 1) {
    depthGapByColumn.set(depth, umlGraphConfig.columnGap);
  }

  payload.relationships.forEach((relationship) => {
    const sourceDepth = depths.get(relationship.source_table_id);
    const targetDepth = depths.get(relationship.target_table_id);

    if (
      sourceDepth === undefined ||
      targetDepth === undefined ||
      sourceDepth === targetDepth ||
      Math.abs(sourceDepth - targetDepth) !== 1
    ) {
      return;
    }

    const columnDepth = Math.min(sourceDepth, targetDepth);
    const requiredGap =
      estimateRelationshipLabelWidth(relationship) +
      umlGraphConfig.relationshipLabelCardClearance * 2;
    depthGapByColumn.set(
      columnDepth,
      Math.max(depthGapByColumn.get(columnDepth) ?? umlGraphConfig.columnGap, requiredGap),
    );
  });

  const groupHeights = new Map<number, number>();
  orderedDepths.forEach((depth) => {
    const tables = [...(groups.get(depth) ?? [])].sort((left, right) => {
      if (left.id === payload.root_table_id) {
        return -1;
      }

      if (right.id === payload.root_table_id) {
        return 1;
      }

      const relationDelta = (relationCounts.get(right.id) ?? 0) - (relationCounts.get(left.id) ?? 0);

      if (relationDelta !== 0) {
        return relationDelta;
      }

      return (left.identifier || `Table ${left.id}`).localeCompare(
        right.identifier || `Table ${right.id}`,
      );
    });

    groups.set(depth, tables);

    const totalHeight =
      tables.reduce(
        (sum, table) => sum + getCardHeight(table, expandedTables[table.id] === true),
        0,
      ) +
      Math.max(0, tables.length - 1) * umlGraphConfig.rowGap;
    groupHeights.set(depth, totalHeight);
  });

  const maxGroupHeight = Math.max(...Array.from(groupHeights.values()), umlGraphConfig.minCardHeight);
  const cards: MetaTableUmlLayoutCard[] = [];

  orderedDepths.forEach((depth) => {
    const tables = groups.get(depth) ?? [];
    const groupHeight = groupHeights.get(depth) ?? 0;
    let currentY = umlGraphConfig.paddingY + (maxGroupHeight - groupHeight) / 2;
    let x = umlGraphConfig.paddingX;

    for (let currentDepth = minDepth; currentDepth < depth; currentDepth += 1) {
      x += umlGraphConfig.cardWidth + (depthGapByColumn.get(currentDepth) ?? umlGraphConfig.columnGap);
    }

    tables.forEach((table) => {
      const columnsExpanded = expandedTables[table.id] === true;
      const height = getCardHeight(table, columnsExpanded);
      const card: MetaTableUmlLayoutCard = {
        ...table,
        columnsExpanded,
        depth,
        height,
        width: umlGraphConfig.cardWidth,
        x,
        y: currentY,
        columnAnchors: new Map(),
      };
      card.columnAnchors = buildColumnAnchors(card);
      cards.push(card);
      currentY += height + umlGraphConfig.rowGap;
    });
  });

  const left = Math.min(...cards.map((card) => card.x), 0);
  const top = Math.min(...cards.map((card) => card.y), 0);
  const right = Math.max(...cards.map((card) => card.x + card.width), umlGraphConfig.cardWidth);
  const bottom = Math.max(
    ...cards.map((card) => card.y + card.height),
    umlGraphConfig.minCardHeight,
  );
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  return {
    bounds: {
      x: left,
      y: top,
      width: right - left + umlGraphConfig.paddingX,
      height: bottom - top + umlGraphConfig.paddingY,
    },
    cards,
    cardsById,
    minDepth,
    maxDepth,
    relationships: payload.relationships,
  };
}

export function buildRelationshipPath(
  relationship: UlmRelationship,
  cardsById: Map<number, MetaTableUmlLayoutCard>,
) {
  const sourceCard = cardsById.get(relationship.source_table_id);
  const targetCard = cardsById.get(relationship.target_table_id);

  if (!sourceCard || !targetCard) {
    return null;
  }

  const sourceAnchor = sourceCard.columnAnchors.get(relationship.source_column) ?? {
    leftX: sourceCard.x,
    rightX: sourceCard.x + sourceCard.width,
    y: sourceCard.y + sourceCard.height / 2,
  };
  const targetAnchor = targetCard.columnAnchors.get(relationship.target_column) ?? {
    leftX: targetCard.x,
    rightX: targetCard.x + targetCard.width,
    y: targetCard.y + targetCard.height / 2,
  };
  const leftToRight = sourceCard.x <= targetCard.x;
  const startX = leftToRight ? sourceAnchor.rightX : sourceAnchor.leftX;
  const endX = leftToRight ? targetAnchor.leftX : targetAnchor.rightX;
  const startY = sourceAnchor.y;
  const endY = targetAnchor.y;
  const curve = Math.max(56, Math.abs(endX - startX) * 0.34);
  const controlOneX = startX + (leftToRight ? curve : -curve);
  const controlTwoX = endX - (leftToRight ? curve : -curve);
  const labelX = (startX + endX) / 2;
  const labelY = (startY + endY) / 2;

  return {
    endX,
    endY,
    labelX,
    labelY,
    leftToRight,
    path: `M ${startX} ${startY} C ${controlOneX} ${startY}, ${controlTwoX} ${endY}, ${endX} ${endY}`,
    startX,
    startY,
  };
}

function formatRelationshipColumns(columns: string[]) {
  return columns.length > 0 ? columns.join(", ") : "?";
}

export function buildRelationshipLabel(relationship: UlmRelationship) {
  return `${formatRelationshipColumns(relationship.source_columns)} -> ${formatRelationshipColumns(
    relationship.target_columns,
  )}`;
}

export function estimateRelationshipLabelWidth(relationship: UlmRelationship) {
  return Math.max(112, buildRelationshipLabel(relationship).length * 6.6);
}
