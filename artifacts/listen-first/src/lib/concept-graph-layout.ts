export const GRAPH_NODE_W = 168;
// Tall enough for a two-line label plus its status line without clipping either.
export const GRAPH_NODE_H = 72;

export type GraphSizing = { nodeW: number; nodeH: number; gapX: number; gapY: number; pad: number };
export const DEFAULT_GRAPH_SIZING: GraphSizing = { nodeW: GRAPH_NODE_W, nodeH: GRAPH_NODE_H, gapX: 40, gapY: 76, pad: 16 };
/** Narrower nodes and gaps for small containers (phones); labels wrap onto two lines instead of being cut off. */
export const COMPACT_GRAPH_SIZING: GraphSizing = { nodeW: 128, nodeH: 76, gapX: 16, gapY: 64, pad: 12 };

export type GraphLayout = {
  positions: Record<string, { x: number; y: number }>;
  node: { w: number; h: number };
  width: number;
  height: number;
  connectedIds: string[];
  isolatedIds: string[];
};

/** Layered top-down layout. Uses only the supplied edges; isolated nodes get their own column on the right. */
export function computeGraphLayout(nodeIds: string[], edges: Array<{ from: string; to: string }>, sizing: GraphSizing = DEFAULT_GRAPH_SIZING): GraphLayout {
  const { nodeW, nodeH, gapX, gapY, pad } = sizing;
  const known = new Set(nodeIds);
  const list = edges.filter(edge => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to);
  const touched = new Set(list.flatMap(edge => [edge.from, edge.to]));
  const connectedIds = nodeIds.filter(id => touched.has(id));
  const isolatedIds = nodeIds.filter(id => !touched.has(id));

  const depth: Record<string, number> = {};
  connectedIds.forEach(id => { depth[id] = 0; });
  // Longest-path layering, bounded so cycles cannot loop forever.
  for (let pass = 0; pass < connectedIds.length; pass++) {
    let changed = false;
    for (const edge of list) {
      const next = depth[edge.from] + 1;
      if (next < connectedIds.length && depth[edge.to] < next) { depth[edge.to] = next; changed = true; }
    }
    if (!changed) break;
  }

  const sparseLayers: string[][] = [];
  connectedIds.forEach(id => { (sparseLayers[depth[id]] ||= []).push(id); });
  // Cycles can leave empty ranks. Compact them before computing dimensions.
  const layers = sparseLayers.filter(Boolean);
  layers.forEach((layer, row) => layer.forEach(id => { depth[id] = row; }));
  const order: Record<string, number> = {};
  layers.forEach((layer, row) => {
    if (!layer) return;
    if (row > 0) {
      const score = (id: string) => {
        const parents = list.filter(edge => edge.to === id && depth[edge.from] < row).map(edge => order[edge.from]);
        return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : Infinity;
      };
      layer.sort((a, b) => score(a) - score(b));
    }
    layer.forEach((id, index) => { order[id] = index; });
  });

  const widest = Math.max(1, ...layers.map(layer => layer?.length ?? 0));
  const treeWidth = widest * nodeW + (widest - 1) * gapX;
  const positions: GraphLayout['positions'] = {};
  layers.forEach((layer, row) => {
    if (!layer) return;
    const rowWidth = layer.length * nodeW + (layer.length - 1) * gapX;
    const start = pad + (treeWidth - rowWidth) / 2;
    layer.forEach((id, index) => { positions[id] = { x: start + index * (nodeW + gapX), y: pad + row * (nodeH + gapY) }; });
  });

  const rows = Math.max(layers.length, 1);
  const treeHeight = rows * nodeH + (rows - 1) * gapY;
  let width = connectedIds.length ? treeWidth : 0;
  if (isolatedIds.length) {
    const colX = pad + (connectedIds.length ? treeWidth + gapX * 1.6 : 0);
    // Disconnected ideas sit in a deliberate side column, offset so they do not read as tree leaves.
    isolatedIds.forEach((id, index) => { positions[id] = { x: colX, y: pad + index * (nodeH + gapY * .45) }; });
    width = colX - pad + nodeW;
  }
  const isoHeight = isolatedIds.length ? isolatedIds.length * nodeH + (isolatedIds.length - 1) * gapY * .45 : 0;
  return {
    positions, connectedIds, isolatedIds, node: { w: nodeW, h: nodeH },
    width: width + pad * 2,
    height: Math.max(connectedIds.length ? treeHeight : 0, isoHeight) + pad * 2,
  };
}

export function shortConceptLabel(label: string, max = 34) {
  const head = label.split(/\s[—–:-]\s|:\s/)[0].trim() || label;
  return head.length > max ? `${head.slice(0, max - 1).trimEnd()}…` : head;
}

/** Point where a ray from the node centre toward (tx,ty) leaves the node rectangle. */
export function rectEdgePoint(x: number, y: number, tx: number, ty: number, gap = 3, node = { w: GRAPH_NODE_W, h: GRAPH_NODE_H }) {
  const { w, h } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (Math.abs(dx) < .001 && Math.abs(dy) < .001) return { x: cx, y: cy };
  const sx = Math.abs(dx) < .001 ? Infinity : (w / 2 + gap) / Math.abs(dx);
  const sy = Math.abs(dy) < .001 ? Infinity : (h / 2 + gap) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}
