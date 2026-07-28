import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { snap, type SnapScene } from '../../components/line-engineering/snap-engine';
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from './entity-runtime';
import { CadNativeSelectionIndex } from './native-selection-index';

const entities: CadNativeEntity[] = Array.from({ length: 100_000 }, (_, index) => ({
  id: `snap-arc-${index}`,
  type: 'arc',
  center: { x: (index % 1_000) * 20, y: Math.floor(index / 1_000) * 20, z: 0 },
  radius: 8,
  startAngle: 0,
  endAngle: 180,
  layer: 'BENCHMARK',
}));
const index = new CadNativeSelectionIndex(100);
index.replace(entities);

const samples: number[] = [];
for (let query = 0; query < 200; query += 1) {
  const cursor = {
    x: ((query * 97) % 1_000) * 20 + 8,
    y: ((query * 31) % 100) * 20,
  };
  const started = performance.now();
  const candidates = index.search({
    minX: cursor.x - 50, minY: cursor.y - 50,
    maxX: cursor.x + 50, maxY: cursor.y + 50,
  }, 48);
  const scene: SnapScene = { segments: [], endpoints: [], centers: [], quadrants: [], tangents: [] };
  for (const entity of candidates) {
    const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
    for (const path of adapter.renderer.paths(entity, 24)) {
      for (let point = 1; point < path.points.length; point++)
        scene.segments!.push({ a: path.points[point - 1], b: path.points[point] });
    }
    for (const candidate of adapter.snaps.snaps(entity, cursor)) {
      if (candidate.kind === 'center') scene.centers!.push(candidate.point);
      else if (candidate.kind === 'quadrant') scene.quadrants!.push(candidate.point);
      else if (candidate.kind === 'tangent') scene.tangents!.push(candidate.point);
      else scene.endpoints!.push(candidate.point);
    }
  }
  const result = snap(cursor, scene, { tolerance: 12, maxSegments: 96, from: { x: cursor.x - 100, y: cursor.y } });
  assert.ok(result, `query ${query} returns a snap`);
  samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);
const p50 = samples[Math.floor(samples.length * 0.5)];
const p95 = samples[Math.floor(samples.length * 0.95)];
assert.ok(p95 < 12, `100k indexed professional snap p95 must stay below 12ms; actual ${p95.toFixed(2)}ms`);
console.log(JSON.stringify({ benchmark: 'cad-professional-snap-query', entities: index.size, p50Ms: p50, p95Ms: p95 }));
