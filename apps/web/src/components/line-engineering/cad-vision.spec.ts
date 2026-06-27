/** Tests de cad-vision (Fase 71). npx tsx src/components/line-engineering/cad-vision.spec.ts */
import { normalizeVision, VISION_SYSTEM_PROMPT } from './cad-vision';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;

const FP = { footprintW: 10000, footprintH: 5000 };

// ── system prompt ──
ok(VISION_SYSTEM_PROMPT.includes('walls') && VISION_SYSTEM_PROMPT.includes('[0,1]'), 'prompt describe el JSON y la normalización');

// ── muro normalizado → footprint, con flip Y ──
{ const r = normalizeVision({ walls: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] }, FP);
  ok(r.walls.length === 1, 'un muro');
  // (0,0) normalizado (arriba-izq) → (0, H) en footprint; (1,0) → (W, H)
  ok(near(r.walls[0].a.x, 0) && near(r.walls[0].a.y, 5000), 'esquina sup-izq → (0,H)');
  ok(near(r.walls[0].b.x, 10000) && near(r.walls[0].b.y, 5000), 'esquina sup-der → (W,H)'); }

// ── coords fuera de [0,1] se clampean ──
{ const r = normalizeVision({ walls: [{ x1: -0.5, y1: 0.5, x2: 2, y2: 0.5 }] }, FP);
  ok(near(r.walls[0].a.x, 0) && near(r.walls[0].b.x, 10000), 'x se clampa a [0,1]→[0,W]'); }

// ── muro inválido / longitud cero se descarta con error ──
{ const r = normalizeVision({ walls: [{ x1: 0, y1: 0, x2: 0, y2: 0 }, { x1: 'a', y1: 0, x2: 1, y2: 1 }] }, FP);
  ok(r.walls.length === 0 && r.errors.length === 2, 'descarta muro cero y muro con coord inválida'); }

// ── zona con ≥3 puntos ──
{ const r = normalizeVision({ zones: [{ name: 'ESD', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }] }] }, FP);
  ok(r.zones.length === 1 && r.zones[0].name === 'ESD' && r.zones[0].points.length === 3, 'zona ESD con 3 puntos'); }

// ── zona con <3 puntos se descarta ──
{ const r = normalizeVision({ zones: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] }, FP);
  ok(r.zones.length === 0 && r.errors.some((e) => e.includes('zona')), 'zona con 2 puntos → descartada'); }

// ── unitHint ──
{ const r = normalizeVision({ walls: [], unitHint: 'm' }, FP);
  ok(r.unitHint === 'm', 'unitHint m reconocido'); }
{ const r = normalizeVision({ walls: [], unitHint: 'leguas' }, FP);
  ok(r.unitHint === undefined, 'unitHint inválido se ignora'); }

// ── string JSON y basura ──
{ const r = normalizeVision('{"walls":[{"x1":0,"y1":1,"x2":1,"y2":1}]}', FP);
  ok(r.walls.length === 1, 'acepta JSON como string'); }
{ const r = normalizeVision('no soy json', FP);
  ok(r.walls.length === 0 && r.errors.length === 1, 'JSON inválido → error, sin crash'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} cad-vision`);
