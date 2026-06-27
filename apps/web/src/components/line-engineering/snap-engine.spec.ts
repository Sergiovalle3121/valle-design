/** Tests de snap-engine (Fase 66). npx tsx src/components/line-engineering/snap-engine.spec.ts */
import {
  snap, rectGeometry, segmentIntersection, perpendicularFoot, nearestOnSegment, SnapScene, Point,
} from './snap-engine';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const nearP = (p: Point, x: number, y: number, t = 1e-6) => near(p.x, x, t) && near(p.y, y, t);

// ── rectGeometry sin rotación ──
{ const g = rectGeometry({ x: 0, y: 0, w: 10, h: 4 });
  ok(g.corners.length === 4 && nearP(g.center, 5, 2), 'rect center (5,2)');
  ok(g.corners.some((c) => nearP(c, 0, 0)) && g.corners.some((c) => nearP(c, 10, 4)), 'esquinas en (0,0) y (10,4)'); }

// ── rectGeometry rotado 90° (sobre su centro) ──
{ const g = rectGeometry({ x: 0, y: 0, w: 10, h: 4, rotation: 90 });
  ok(nearP(g.center, 5, 2), 'centro invariante a rotación');
  // una esquina original (0,0) → gira a (7, -3) alrededor de (5,2)
  ok(g.corners.some((c) => nearP(c, 7, -3)), 'esquina rotada 90° correcta'); }

// ── intersección de segmentos ──
{ const x = segmentIntersection({ a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, { a: { x: 0, y: 10 }, b: { x: 10, y: 0 } });
  ok(x !== null && nearP(x, 5, 5), 'intersección en (5,5)'); }
{ const x = segmentIntersection({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, { a: { x: 0, y: 1 }, b: { x: 1, y: 2 } });
  ok(x === null, 'paralelos no se cruzan'); }
{ const x = segmentIntersection({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, { a: { x: 5, y: 5 }, b: { x: 5, y: 6 } });
  ok(x === null, 'cruce fuera del tramo → null'); }

// ── perpendicular / nearest ──
{ const f = perpendicularFoot({ x: 5, y: 5 }, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  ok(nearP(f, 5, 0), 'pie perpendicular sobre eje X'); }
{ const f = nearestOnSegment({ x: -5, y: 5 }, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  ok(nearP(f, 0, 0), 'nearest hace clamp al extremo'); }

// ── snap: prioridad endpoint sobre grid ──
{ const scene: SnapScene = { endpoints: [{ x: 100, y: 100 }], gridSize: 50 };
  const r = snap({ x: 102, y: 103 }, scene, { tolerance: 10 });
  ok(r !== null && r.type === 'endpoint' && nearP(r.point, 100, 100), 'endpoint gana a grid'); }

// ── snap: fuera de tolerancia → null ──
{ const scene: SnapScene = { endpoints: [{ x: 100, y: 100 }] };
  const r = snap({ x: 200, y: 200 }, scene, { tolerance: 5 });
  ok(r === null, 'nada dentro de tolerancia → null'); }

// ── snap: midpoint de una arista ──
{ const scene: SnapScene = { segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }] };
  const r = snap({ x: 5, y: 1 }, scene, { tolerance: 3, modes: { midpoint: true, nearest: false } });
  ok(r !== null && r.type === 'midpoint' && nearP(r.point, 5, 0), 'midpoint detectado'); }

// ── snap: modo deshabilitado se ignora ──
{ const scene: SnapScene = { endpoints: [{ x: 0, y: 0 }], gridSize: 10 };
  const r = snap({ x: 1, y: 1 }, scene, { tolerance: 3, modes: { endpoint: false } });
  ok(r !== null && r.type === 'grid', 'con endpoint off cae a grid'); }

// ── snap: perpendicular requiere 'from' ──
{ const scene: SnapScene = { segments: [{ a: { x: 0, y: 0 }, b: { x: 0, y: 10 } }] };
  const r = snap({ x: 1, y: 5 }, scene, { tolerance: 3, from: { x: 5, y: 5 }, modes: { perpendicular: true, nearest: false, midpoint: false } });
  ok(r !== null && r.type === 'perpendicular' && nearP(r.point, 0, 5), 'perpendicular desde from'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} snap-engine`);
