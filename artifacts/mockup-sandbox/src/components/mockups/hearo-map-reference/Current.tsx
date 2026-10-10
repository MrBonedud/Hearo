import './_group.css';
import {useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {BookOpen} from 'lucide-react';
type StudyMap={topic:string;nodes:{id:string;label:string;description:string;status:'understood'|'incorrect'|'skipped';evidence:string|null}[];edges:{from:string;to:string;label:string}[]};
type StudyEvaluation={assessments?:{conceptId:string;verdict:string}[]};
const statusMeta = {
  understood: { label: 'Supported', color: 'var(--green)', tint: 'var(--green-pale)' },
  incorrect: { label: 'Contradicted', color: 'var(--red)', tint: 'var(--red-pale)' },
  partial: { label: 'Partially understood', color: 'var(--gold)', tint: 'var(--gray-pale)' },
  skipped: { label: 'Not demonstrated', color: 'var(--gray)', tint: 'var(--gray-pale)' },
  unassessed: { label: 'Not assessed yet', color: '#cbc6da', tint: 'var(--gray-pale)' },
} as const;

function ConceptMap({ map, compact = false, assessments, assessed = Boolean(assessments) }: {
  map: StudyMap; compact?: boolean; assessments?: StudyEvaluation['assessments']; assessed?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const markerId = `concept-arrow-${useId().replace(/:/g, '')}`;
  const graphRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const [paths, setPaths] = useState<Array<{ key: string; d: string; label: string; x: number; y: number }>>([]);
  const validEdges = useMemo(() => {
    const nodeIds = new Set(map.nodes.map(node => node.id));
    return map.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  }, [map.nodes, map.edges]);
  const selectedNode = map.nodes.find(node => node.id === selectedId) ?? null;
  const statusFor = (nodeId: string, nodeStatus: StudyMap['nodes'][number]['status']) => {
    const verdict = assessments?.find(item => item.conceptId === nodeId)?.verdict;
    if (verdict === 'supported') return 'understood';
    if (verdict === 'contradicted') return 'incorrect';
    if (verdict === 'partially_understood') return 'partial';
    if (verdict === 'not_demonstrated') return 'skipped';
    return nodeStatus === 'skipped' ? assessed ? 'skipped' : 'unassessed' : nodeStatus;
  };
  const statusClass = (status: keyof typeof statusMeta) => status === 'understood' ? 'understood-dot'
    : status === 'incorrect' ? 'incorrect-dot'
      : status === 'partial' ? 'partial-dot'
        : status === 'skipped' ? 'skipped-dot' : 'unassessed-dot';

  useLayoutEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const update = () => {
      const bounds = graph.getBoundingClientRect();
      const width = bounds.width;
      const height = bounds.height;
      setGraphSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      const next = validEdges.flatMap((edge, index) => {
        const from = nodeRefs.current[edge.from];
        const to = nodeRefs.current[edge.to];
        if (!from || !to) return [];
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const ax = a.left + a.width / 2 - bounds.left;
        const ay = a.top + a.height / 2 - bounds.top;
        const bx = b.left + b.width / 2 - bounds.left;
        const by = b.top + b.height / 2 - bounds.top;
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / length;
        const uy = dy / length;
        const boundaryPoint = (x: number, y: number, rect: DOMRect, vx: number, vy: number) => {
          const tx = Math.abs(vx) < .001 ? Infinity : (rect.width / 2 - 8) / Math.abs(vx);
          const ty = Math.abs(vy) < .001 ? Infinity : (rect.height / 2 - 8) / Math.abs(vy);
          const distance = Math.min(tx, ty);
          return { x: x + vx * distance, y: y + vy * distance };
        };
        const start = boundaryPoint(ax, ay, a, ux, uy);
        const end = boundaryPoint(bx, by, b, -ux, -uy);
        const curve = (index % 2 ? 1 : -1) * Math.min(28, length * .08);
        const cx = (start.x + end.x) / 2 - uy * curve;
        const cy = (start.y + end.y) / 2 + ux * curve;
        return [{
          key: `${edge.from}-${edge.to}-${index}`,
          d: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
          label: edge.label,
          x: .25 * start.x + .5 * cx + .25 * end.x,
          y: .25 * start.y + .5 * cy + .25 * end.y - 7,
        }];
      });
      setPaths(previous => previous.length === next.length && previous.every((path, index) => path.d === next[index].d && path.label === next[index].label)
        ? previous : next);
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(graph);
    Object.values(nodeRefs.current).forEach(node => { if (node) observer?.observe(node); });
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [map.nodes, validEdges]);

  if (!map.nodes.length) return <div className="empty-map"><span className="empty-map-icon"><BookOpen size={20} /></span><p>Your concept map will take shape here.</p></div>;

  return <section className={`concept-map ${compact ? 'concept-map-compact' : ''}`} aria-label="Interactive concept map">
    <div className={`concept-map-canvas ${validEdges.length ? 'has-edges' : 'no-edges'}`} ref={graphRef} data-testid="concept-map-graph">
      {graphSize.width > 0 && graphSize.height > 0 && validEdges.length > 0 && <svg className="concept-map-links" viewBox={`0 0 ${graphSize.width} ${graphSize.height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
        {paths.map((path, index) => <g key={path.key}>
          <motion.path d={path.d} markerEnd={`url(#${markerId})`} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .7, delay: reducedMotion ? 0 : index * .09 }} />
          {path.label && <text x={path.x} y={path.y} textAnchor="middle">{path.label}</text>}
        </g>)}
      </svg>}
      <div className="concept-map-nodes">
        {map.nodes.map((node, index) => {
          const visualStatus = statusFor(node.id, node.status) as keyof typeof statusMeta;
          const selected = selectedId === node.id;
          return <motion.button
            key={node.id}
            ref={element => { nodeRefs.current[node.id] = element; }}
            className={`concept-node status-${visualStatus} ${selected ? 'is-selected' : ''}`}
            type="button"
            aria-expanded={selected}
            aria-controls={`${markerId}-details`}
            aria-label={`${node.label}. ${statusMeta[visualStatus].label}. Open concept details.`}
            onClick={() => setSelectedId(selected ? null : node.id)}
            data-testid={`concept-${node.id}`}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 9, scale: reducedMotion ? 1 : .985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reducedMotion ? 0 : .36, delay: reducedMotion ? 0 : index * .055 }}>
            <span className="concept-node-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="concept-node-copy"><strong>{node.label}</strong><small>{statusMeta[visualStatus].label}</small></span>
            <i className={`concept-node-dot ${statusClass(visualStatus)}`} aria-hidden="true" />
          </motion.button>;
        })}
      </div>
      {validEdges.length > 0 && <ul className="visually-hidden" aria-label="Directed concept relationships">
        {validEdges.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}>
          {map.nodes.find(node => node.id === edge.from)?.label} — {edge.label} → {map.nodes.find(node => node.id === edge.to)?.label}
        </li>)}
      </ul>}
    </div>
    {validEdges.length > 0 && <div className="concept-edge-list" aria-label="Concept map connections">
      <strong>Connections</strong>
      <ul>{validEdges.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}>
        <span>{map.nodes.find(node => node.id === edge.from)?.label}</span><i>{edge.label}</i><span>{map.nodes.find(node => node.id === edge.to)?.label}</span>
      </li>)}</ul>
    </div>}
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

export default function Current(){return <main style={{padding:24,minHeight:"100vh"}}><p>Extracted current map · illustrative states, not a live assessment</p><ConceptMap map={{"topic":"Large-Scale Web Applications","nodes":[{"id":"scaling","label":"Scale out vs. scale up","description":"Distinguish adding instances from using a bigger instance, including the work-distribution challenge.","status":"understood","evidence":null},{"id":"load-balancing","label":"Load balancing","description":"Explain distributing incoming requests across web servers and handling a failed server.","status":"incorrect","evidence":null},{"id":"stateless-servers","label":"Stateless servers","description":"Explain why requests from one user can reach different servers and why a shared database matters.","status":"skipped","evidence":null},{"id":"sharding","label":"Data sharding","description":"Explain partitioning data across database instances and the added application complexity.","status":"skipped","evidence":null},{"id":"replication","label":"Replication","description":"Explain keeping more than one copy of data to tolerate failures. Advanced replication and backups are outside this source scope.","status":"skipped","evidence":null},{"id":"caching","label":"Caching and consistency","description":"Explain caching query results, cache misses, writes to the database, and software-managed consistency.","status":"skipped","evidence":null}],"edges":[{"from":"scaling","to":"load-balancing","label":"distribute work"},{"from":"load-balancing","to":"stateless-servers","label":"simpler routing"},{"from":"scaling","to":"sharding","label":"scale storage"},{"from":"sharding","to":"replication","label":"tolerate failures"},{"from":"stateless-servers","to":"caching","label":"shared data access"}]}} assessed /></main>}
