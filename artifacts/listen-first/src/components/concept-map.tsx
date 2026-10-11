import { useId, useMemo, useState } from 'react';
import type { StudyEvaluation, StudyMap } from '@workspace/api-client-react';
import { BookOpen } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  GRAPH_NODE_H, GRAPH_NODE_W, computeGraphLayout, rectEdgePoint, shortConceptLabel,
} from '@/lib/concept-graph-layout';

export const statusMeta = {
  understood: { label: 'Supported' },
  incorrect: { label: 'Contradicted' },
  partial: { label: 'Partial' },
  uncertain: { label: 'Uncertain' },
  skipped: { label: 'Not demonstrated' },
  unassessed: { label: 'Not assessed yet' },
} as const;
type VisualStatus = keyof typeof statusMeta;

export function ConceptMap({ map, compact = false, assessments, assessed = Boolean(assessments) }: {
  map: StudyMap; compact?: boolean; assessments?: StudyEvaluation['assessments']; assessed?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const markerId = `concept-arrow-${useId().replace(/:/g, '')}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const validEdges = useMemo(() => {
    const ids = new Set(map.nodes.map(node => node.id));
    return map.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  }, [map.nodes, map.edges]);
  const layout = useMemo(() => computeGraphLayout(map.nodes.map(node => node.id), validEdges), [map.nodes, validEdges]);
  const selectedNode = map.nodes.find(node => node.id === selectedId) ?? null;

  const statusFor = (nodeId: string, nodeStatus: StudyMap['nodes'][number]['status']): { status: VisualStatus; uncertain: boolean } => {
    const item = assessments?.find(value => value.conceptId === nodeId);
    const verdict = item?.verdict;
    const low = String(item?.confidence) === 'low';
    if (low && (verdict === 'supported' || verdict === 'contradicted' || verdict === 'partially_understood')) {
      return { status: 'uncertain', uncertain: true };
    }
    if (verdict === 'supported' || verdict === 'contradicted') {
      return { status: verdict === 'supported' ? 'understood' : 'incorrect', uncertain: false };
    }
    if (verdict === 'partially_understood') return { status: 'partial', uncertain: false };
    if (verdict === 'not_demonstrated') return { status: 'skipped', uncertain: false };
    return { status: nodeStatus === 'skipped' ? assessed ? 'skipped' : 'unassessed' : nodeStatus, uncertain: false };
  };

  if (!map.nodes.length) return <div className="empty-map"><span className="empty-map-icon"><BookOpen size={20} /></span><p>Your concept map will take shape here.</p></div>;

  const labelOf = (id: string) => map.nodes.find(node => node.id === id)?.label;
  const arrows = validEdges.flatMap((edge, index) => {
    const a = layout.positions[edge.from];
    const b = layout.positions[edge.to];
    if (!a || !b) return [];
    const start = rectEdgePoint(a.x, a.y, b.x + GRAPH_NODE_W / 2, b.y + GRAPH_NODE_H / 2);
    const end = rectEdgePoint(b.x, b.y, a.x + GRAPH_NODE_W / 2, a.y + GRAPH_NODE_H / 2, 6);
    // A gentle quadratic bow keeps relationships readable without changing the layout.
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const bow = Math.min(24, length * 0.12);
    const cx = (start.x + end.x) / 2 - dy / length * bow;
    const cy = (start.y + end.y) / 2 + dx / length * bow;
    return [{
      key: `${edge.from}-${edge.to}-${index}`, d: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`, label: edge.label,
      x: 0.25 * start.x + 0.5 * cx + 0.25 * end.x, y: 0.25 * start.y + 0.5 * cy + 0.25 * end.y,
    }];
  });

  return <section className={`concept-map ${compact ? 'concept-map-compact' : ''}`} aria-label="Interactive concept map">
    <div className="concept-map-scroll" tabIndex={0} aria-label="Concept graph, scroll sideways on small screens">
      <div className={`concept-map-canvas ${validEdges.length ? 'has-edges' : 'no-edges'}`} style={{ width: layout.width, height: layout.height }} data-testid="concept-map-graph">
        {arrows.length > 0 && <svg className="concept-map-links" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
          <defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 9 4.5 L 0 9 z" /></marker></defs>
          {arrows.map((arrow, index) => <g key={arrow.key}>
            <motion.path d={arrow.d} markerEnd={`url(#${markerId})`} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .5, delay: reducedMotion ? 0 : index * .06 }} />
            {arrow.label && <text x={arrow.x + 6} y={arrow.y - 4} textAnchor="start">{arrow.label}</text>}
          </g>)}
        </svg>}
        {map.nodes.map((node, index) => {
          const { status, uncertain } = statusFor(node.id, node.status);
          const text = uncertain ? 'Uncertain' : statusMeta[status].label;
          const pos = layout.positions[node.id];
          const selected = selectedId === node.id;
          return <motion.button
            key={node.id}
            className={`concept-node status-${status} ${selected ? 'is-selected' : ''}`}
            style={{ left: pos.x, top: pos.y, width: GRAPH_NODE_W, height: GRAPH_NODE_H }}
            type="button"
            aria-expanded={selected}
            aria-controls={`${markerId}-details`}
            aria-label={`${node.label}. ${text}. Open concept details.`}
            title={node.label}
            onClick={() => setSelectedId(selected ? null : node.id)}
            data-testid={`concept-${node.id}`}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : .96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reducedMotion ? 0 : .3, delay: reducedMotion ? 0 : index * .04 }}>
            <strong dir="auto">{shortConceptLabel(node.label)}</strong>
            <small>{text}</small>
          </motion.button>;
        })}
      </div>
    </div>
    {validEdges.length > 0 && <ul className="visually-hidden" aria-label="Directed concept relationships">
      {validEdges.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}>{labelOf(edge.from)} — {edge.label} → {labelOf(edge.to)}</li>)}
    </ul>}
    <div className="concept-details-slot" id={`${markerId}-details`} aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait" initial={false}>
        {selectedNode ? <motion.article key={selectedNode.id} className="concept-detail-card"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -5 }}
          transition={{ duration: reducedMotion ? 0 : .22 }} data-testid={`concept-details-${selectedNode.id}`}>
          <div className="concept-detail-heading"><h3>{selectedNode.label}</h3><button type="button" onClick={() => setSelectedId(null)} aria-label={`Close ${selectedNode.label} details`} data-testid={`button-close-concept-${selectedNode.id}`}>Close</button></div>
          <p dir="auto">{selectedNode.description}</p>
          <div className="concept-detail-evidence"><span>Evidence · exact provided text</span><p dir="auto">{selectedNode.evidence || 'No evidence attached to this concept yet.'}</p></div>
        </motion.article> : <div className="concept-detail-prompt">Select a concept to open its description and evidence.</div>}
      </AnimatePresence>
    </div>
  </section>;
}
