/** Tests de geom-edit (Fase 67). npx tsx src/components/line-engineering/geom-edit.spec.ts */
import {
  lineLineIntersection, offsetSegment, offsetPolyline, extendToLine, trimAtCutter,
  chamferCorner, filletCorner,
} from './geom-edit';
import { Point } from './precision-input';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const nearP = (p: Point, x: number, y: number, t = 1e-6) => near(p.x, x, t) && near(p.y, y, t);

// ── intersección de rectas infinitas ──
{ const x = lineLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 });
  ok(x !== null && nearP(x!, 5, 0), 'rectas se cruzan en (5,0)'); }
{ const x = lineLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 });
  ok(x === null, 'rectas paralelas → null'); }
{ const x = lineLineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 });
  ok(x !== null && nearP(x!, 5, 0), 'usa recta INFINITA (más allá del segmento)'); }

// ── offset de segmento (izquierda = +) ──
{ const s = offsetSegment({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, 2);
  ok(nearP(s.a, 0, 2) && nearP(s.b, 10, 2), 'offset +2 sube el segmento horizontal'); }
{ const s = offsetSegment({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, -3);
  ok(nearP(s.a, 0, -3), 'offset negativo baja'); }

// ── offset de polilínea (junta en L) ──
{ const out = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2);
  // tramo 1 sube a y=2; tramo 2 se mueve a x=8 (izquierda de ↑ es -x). Vértice interior = (8,2).
  ok(out.length === 3 && nearP(out[1], 8, 2), 'vértice interior de la polilínea en (8,2)'); }

// ── extend hasta recta ──
{ const e = extendToLine({ a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }, 'b', { a: { x: 10, y: -5 }, b: { x: 10, y: 5 } });
  ok(e !== null && nearP(e!.b, 10, 0) && nearP(e!.a, 0, 0), 'extiende extremo b hasta x=10'); }

// ── trim conserva el lado sin el pick ──
{ const r = trimAtCutter({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 4, y: -5 }, b: { x: 4, y: 5 } }, { x: 1, y: 0 });
  // cutter en x=4; pick en x=1 (mitad a..ip) → se borra esa mitad, queda [4..10]
  ok(r !== null && nearP(r!.a, 4, 0) && nearP(r!.b, 10, 0), 'trim borra el lado del pick (queda 4..10)'); }
{ const r = trimAtCutter({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 4, y: -5 }, b: { x: 4, y: 5 } }, { x: 9, y: 0 });
  ok(r !== null && nearP(r!.a, 0, 0) && nearP(r!.b, 4, 0), 'trim con pick del otro lado (queda 0..4)'); }
{ const r = trimAtCutter({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } }, { x: 5, y: 0 });
  ok(r === null, 'sin intersección → null'); }

// ── chamfer ──
{ const c = chamferCorner({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 3, 4);
  ok(nearP(c.trimA, 3, 0) && nearP(c.trimB, 0, 4), 'chamfer corta 3 y 4 en cada pierna'); }

// ── fillet de esquina recta (90°) ──
{ const f = filletCorner({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 2);
  ok(f !== null, 'fillet 90° existe');
  // a 90°: tangentes a distancia r del vértice; centro en (r,r)
  ok(nearP(f!.start, 2, 0) && nearP(f!.end, 0, 2), 'tangentes a (2,0) y (0,2)');
  ok(nearP(f!.center, 2, 2), 'centro del arco en (2,2)'); }
{ const f = filletCorner({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 0 }, 2);
  ok(f === null, 'piernas colineales → null'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} geom-edit`);
