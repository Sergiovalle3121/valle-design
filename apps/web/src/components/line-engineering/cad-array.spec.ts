/** Tests de cad-array (Fase 73). npx tsx src/components/line-engineering/cad-array.spec.ts */
import { rectangularArray, polarArray, pathArray } from './cad-array';
import { Point } from './precision-input';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const nearP = (p: Point, x: number, y: number, t = 1e-6) => near(p.x, x, t) && near(p.y, y, t);

// ── rectangular ──
{ const a = rectangularArray({ x: 0, y: 0 }, { cols: 3, rows: 2, dx: 10, dy: 5 });
  ok(a.length === 6, 'rectangular 3×2 = 6 items');
  ok(nearP(a[0].point, 0, 0) && nearP(a[5].point, 20, 5), 'esquinas del arreglo rectangular'); }
{ const a = rectangularArray({ x: 1, y: 1 }, { cols: 1, rows: 1, dx: 10, dy: 10 });
  ok(a.length === 1 && nearP(a[0].point, 1, 1), '1×1 = el propio base'); }

// ── polar 360° (no duplica en 360) ──
{ const a = polarArray({ x: 0, y: 0 }, { x: 10, y: 0 }, { count: 4, angleSpanDeg: 360 });
  ok(a.length === 4, 'polar 360° count=4');
  ok(nearP(a[0].point, 10, 0), 'item 0 en (10,0)');
  ok(nearP(a[1].point, 0, 10), 'item 1 a 90° → (0,10)');
  ok(nearP(a[2].point, -10, 0), 'item 2 a 180° → (-10,0)');
  ok(near(a[1].rotationDeg, 90), 'rotación de copia sigue el ángulo'); }

// ── polar span parcial (inclusivo) ──
{ const a = polarArray({ x: 0, y: 0 }, { x: 10, y: 0 }, { count: 3, angleSpanDeg: 90 });
  ok(a.length === 3, 'polar 90° count=3');
  ok(nearP(a[0].point, 10, 0) && nearP(a[2].point, 0, 10), 'extremos en 0° y 90° (inclusivo)'); }

// ── polar sin rotar items ──
{ const a = polarArray({ x: 0, y: 0 }, { x: 5, y: 0 }, { count: 2, angleSpanDeg: 180, rotateItems: false });
  ok(a.every((it) => it.rotationDeg === 0), 'rotateItems=false deja rotación 0'); }

// ── pathArray ──
{ const path: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const a = pathArray(path, 3);
  ok(a.length === 3, 'path count=3');
  ok(nearP(a[0].point, 0, 0), 'primer punto al inicio');
  ok(nearP(a[2].point, 10, 10), 'último punto al final');
  // total = 20; el punto medio (d=10) cae justo en el vértice (10,0)
  ok(nearP(a[1].point, 10, 0), 'punto medio en el vértice'); }
{ const a = pathArray([{ x: 0, y: 0 }, { x: 4, y: 0 }], 1);
  ok(a.length === 1 && nearP(a[0].point, 0, 0), 'count=1 → punto inicial'); }
{ const a = pathArray([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2);
  ok(near(a[0].rotationDeg, 0) && near(a[1].rotationDeg, 0), 'tangente horizontal → rotación 0'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} cad-array`);
