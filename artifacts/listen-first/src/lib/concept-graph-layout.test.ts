import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPACT_GRAPH_SIZING, computeGraphLayout, GRAPH_NODE_H, GRAPH_NODE_W, rectEdgePoint, shortConceptLabel } from './concept-graph-layout';

test('branches follow supplied relationships without overlapping nodes', () => {
  const result = computeGraphLayout(['root', 'left', 'right', 'leaf', 'isolated'], [
    { from: 'root', to: 'left' }, { from: 'root', to: 'right' }, { from: 'left', to: 'leaf' },
  ]);
  assert.ok(result.positions.root.y < result.positions.left.y);
  assert.equal(result.positions.left.y, result.positions.right.y);
  assert.ok(result.positions.leaf.y > result.positions.left.y);
  assert.deepEqual(result.isolatedIds, ['isolated']);
  const points = Object.values(result.positions);
  for (let i = 0; i < points.length; i++) {
    assert.ok(points[i].x >= 0 && points[i].y >= 0);
    assert.ok(points[i].x + GRAPH_NODE_W <= result.width);
    assert.ok(points[i].y + GRAPH_NODE_H <= result.height);
    for (let j = i + 1; j < points.length; j++) {
      assert.ok(Math.abs(points[i].x - points[j].x) >= GRAPH_NODE_W || Math.abs(points[i].y - points[j].y) >= GRAPH_NODE_H);
    }
  }
});

test('unknown and self edges never create inferred relationships', () => {
  const result = computeGraphLayout(['one', 'two'], [
    { from: 'one', to: 'missing' }, { from: 'one', to: 'one' },
  ]);
  assert.deepEqual(result.connectedIds, []);
  assert.deepEqual(result.isolatedIds, ['one', 'two']);
});

test('cycles and empty graphs have finite bounded dimensions', () => {
  for (const graph of [
    computeGraphLayout([], []),
    computeGraphLayout(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }]),
  ]) {
    assert.ok(Number.isFinite(graph.width) && Number.isFinite(graph.height));
    for (const point of Object.values(graph.positions)) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }
});

test('the compact layout fits a two-column map in a 375px phone panel without overlapping nodes', () => {
  // The guided sample: one root, two branches, deeper single children.
  const ids = ['scaling', 'load-balancing', 'sharding', 'stateless', 'replication', 'caching'];
  const edges = [
    { from: 'scaling', to: 'load-balancing' }, { from: 'scaling', to: 'sharding' },
    { from: 'load-balancing', to: 'stateless' }, { from: 'sharding', to: 'replication' }, { from: 'stateless', to: 'caching' },
  ];
  const full = computeGraphLayout(ids, edges);
  const compact = computeGraphLayout(ids, edges, COMPACT_GRAPH_SIZING);
  // 375px viewport minus page and panel padding leaves about 300px for the map.
  assert.ok(full.width > 300);
  assert.ok(compact.width <= 300);
  assert.deepEqual(compact.node, { w: COMPACT_GRAPH_SIZING.nodeW, h: COMPACT_GRAPH_SIZING.nodeH });
  const points = Object.values(compact.positions);
  for (let i = 0; i < points.length; i++) {
    assert.ok(points[i].x + compact.node.w <= compact.width && points[i].y + compact.node.h <= compact.height);
    for (let j = i + 1; j < points.length; j++) {
      assert.ok(Math.abs(points[i].x - points[j].x) >= compact.node.w || Math.abs(points[i].y - points[j].y) >= compact.node.h);
    }
  }
  // Arrow endpoints use the node size they are drawn with.
  const down = rectEdgePoint(0, 0, compact.node.w / 2, 300, 3, compact.node);
  assert.deepEqual(down, { x: compact.node.w / 2, y: compact.node.h + 3 });
});

test('arrow endpoints leave node rectangles and degenerate rays remain finite', () => {
  const down = rectEdgePoint(0, 0, GRAPH_NODE_W / 2, 200);
  assert.equal(down.x, GRAPH_NODE_W / 2);
  assert.equal(down.y, GRAPH_NODE_H + 3);
  const same = rectEdgePoint(0, 0, GRAPH_NODE_W / 2, GRAPH_NODE_H / 2);
  assert.ok(Number.isFinite(same.x) && Number.isFinite(same.y));
});

test('short labels preserve Arabic and keep full input unchanged', () => {
  const full = 'توزيع الحمل — شرح طويل إضافي';
  assert.equal(shortConceptLabel(full), 'توزيع الحمل');
  assert.equal(full, 'توزيع الحمل — شرح طويل إضافي');
  assert.ok(shortConceptLabel('A'.repeat(80)).length <= 34);
});
