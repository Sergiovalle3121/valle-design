/** Tests de geom-measure (Fase 67/72). npx tsx src/components/line-engineering/geom-measure.spec.ts */
import {
  polygonArea, polygonPerimeter, polygonCentroid, pointInPolygon, boundingBox, convexHull,
} from './geom-measure';
import { Point } from './precision-input';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const nearP = (p: Point, x: number, y: number, t = 1e-6) => near(p.x, x, t) && near(p.y, y, t);

const SQUARE: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

// ── área ──
ok(near(polygonArea(SQUARE), 100), 'área del cuadrado 10×10 = 100');
ok(near(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]), 6), 'área triángulo 3-4 = 6');
ok(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === 0, '<3 puntos → área 0');
// orientación horaria da el mismo valor absoluto
ok(near(polygonArea([...SQUARE].reverse()), 100), 'área invariante a la orientación');

// ── perímetro ──
ok(near(polygonPerimeter(SQUARE), 40), 'perímetro del cuadrado = 40');

// ── centroide ──
ok(nearP(polygonCentroid(SQUARE), 5, 5), 'centroide del cuadrado = (5,5)');
ok(nearP(polygonCentroid([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }]), 2, 2), 'centroide del triángulo');

// ── punto en polígono ──
ok(pointInPolygon({ x: 5, y: 5 }, SQUARE), '(5,5) dentro del cuadrado');
ok(!pointInPolygon({ x: 15, y: 5 }, SQUARE), '(15,5) fuera');
ok(!pointInPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), 'polígono degenerado → fuera');
// polígono cóncavo (L)
{ const L: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  ok(pointInPolygon({ x: 2, y: 8 }, L), 'cóncavo: (2,8) dentro del brazo');
  ok(!pointInPolygon({ x: 8, y: 8 }, L), 'cóncavo: (8,8) en la muesca, fuera'); }

// ── bounding box ──
{ const b = boundingBox([{ x: 1, y: 2 }, { x: 9, y: 3 }, { x: 4, y: 8 }]);
  ok(b.minX === 1 && b.maxX === 9 && b.minY === 2 && b.maxY === 8 && b.w === 8 && b.h === 6, 'bbox correcto'); }

// ── convex hull ──
{ const hull = convexHull([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }, // interior
  ]);
  ok(hull.length === 4, 'hull de 5 puntos (1 interior) → 4 vértices');
  ok(near(polygonArea(hull), 100), 'hull envuelve el cuadrado (área 100)'); }
{ const hull = convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  ok(hull.length === 2, 'hull con <3 puntos devuelve los puntos'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} geom-measure`);
