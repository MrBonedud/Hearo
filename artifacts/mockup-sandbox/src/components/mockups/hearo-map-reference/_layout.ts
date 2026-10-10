export const GRAPH_NODE_W = 168;
export const GRAPH_NODE_H = 64;
const GAP_X = 40;
const GAP_Y = 76;
const PAD = 16;

export type GraphLayout = {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  connectedIds: string[];
  isolatedIds: string[];
};

/** Layered top-down layout. Uses only the supplied edges; isolated nodes get their own column on the right. */
export function computeGraphLayout(nodeIds: string[], edges: Array<{ from: string; to: string }>): GraphLayout {
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
  const treeWidth = widest * GRAPH_NODE_W + (widest - 1) * GAP_X;
  const positions: GraphLayout['positions'] = {};
  layers.forEach((layer, row) => {
    if (!layer) return;
    const rowWidth = layer.length * GRAPH_NODE_W + (layer.length - 1) * GAP_X;
    const start = PAD + (treeWidth - rowWidth) / 2;
    layer.forEach((id, index) => { positions[id] = { x: start + index * (GRAPH_NODE_W + GAP_X), y: PAD + row * (GRAPH_NODE_H + GAP_Y) }; });
  });

  const rows = Math.max(layers.length, 1);
  const treeHeight = rows * GRAPH_NODE_H + (rows - 1) * GAP_Y;
  let width = connectedIds.length ? treeWidth : 0;
  if (isolatedIds.length) {
    const colX = PAD + (connectedIds.length ? treeWidth + GAP_X * 1.6 : 0);
    // Disconnected ideas sit in a deliberate side column, offset so they do not read as tree leaves.
    isolatedIds.forEach((id, index) => { positions[id] = { x: colX, y: PAD + index * (GRAPH_NODE_H + GAP_Y * .45) }; });
    width = colX - PAD + GRAPH_NODE_W;
  }
  const isoHeight = isolatedIds.length ? isolatedIds.length * GRAPH_NODE_H + (isolatedIds.length - 1) * GAP_Y * .45 : 0;
  return {
    positions, connectedIds, isolatedIds,
    width: width + PAD * 2,
    height: Math.max(connectedIds.length ? treeHeight : 0, isoHeight) + PAD * 2,
  };
}

export function shortConceptLabel(label: string, max = 34) {
  const head = label.split(/\s[—–:-]\s|:\s/)[0].trim() || label;
  return head.length > max ? `${head.slice(0, max - 1).trimEnd()}…` : head;
}

/** Point where a ray from the node centre toward (tx,ty) leaves the node rectangle. */
export function rectEdgePoint(x: number, y: number, tx: number, ty: number, gap = 3) {
  const cx = x + GRAPH_NODE_W / 2;
  const cy = y + GRAPH_NODE_H / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (Math.abs(dx) < .001 && Math.abs(dy) < .001) return { x: cx, y: cy };
  const sx = Math.abs(dx) < .001 ? Infinity : (GRAPH_NODE_W / 2 + gap) / Math.abs(dx);
  const sy = Math.abs(dy) < .001 ? Infinity : (GRAPH_NODE_H / 2 + gap) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}
