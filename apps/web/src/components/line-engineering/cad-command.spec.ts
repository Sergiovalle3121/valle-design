/** Tests de cad-command (Fase 66/67). npx tsx src/components/line-engineering/cad-command.spec.ts */
import {
  startCommand, feedPoint, feedDistance, commit, cancel, previewGeometry, DrawAction,
} from './cad-command';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const first = (e: DrawAction[]) => e[0] as DrawAction;

// ── rect: dos esquinas → addRect (bbox normalizado) ──
{ let s = startCommand('rect');
  ok(s.prompt === 'Primera esquina', 'rect prompt inicial');
  s = feedPoint(s, { x: 10, y: 8 });
  ok(!s.done && s.prompt === 'Esquina opuesta', 'rect pide esquina opuesta');
  s = feedPoint(s, { x: 2, y: 2 });
  const a = first(s.emitted);
  ok(s.done && a.type === 'addRect' && near(a.x, 2) && near(a.y, 2) && near(a.w, 8) && near(a.h, 6), 'rect bbox normalizado'); }

// ── circle: centro + punto perímetro → radio por distancia ──
{ let s = startCommand('circle');
  s = feedPoint(s, { x: 0, y: 0 });
  ok(s.awaitingRadius === true, 'circle espera radio tras centro');
  s = feedPoint(s, { x: 3, y: 4 });
  const a = first(s.emitted);
  ok(s.done && a.type === 'addCircle' && near(a.r, 5), 'circle radio = distancia (5)'); }

// ── circle: radio tecleado por número ──
{ let s = startCommand('circle');
  s = feedPoint(s, { x: 1, y: 1 });
  s = feedDistance(s, 7);
  const a = first(s.emitted);
  ok(s.done && a.type === 'addCircle' && near(a.r, 7) && near(a.cx, 1), 'circle radio tecleado'); }

// ── line: encadena, emite un tramo por punto y reancla ──
{ let s = startCommand('line');
  s = feedPoint(s, { x: 0, y: 0 });
  ok(s.emitted.length === 0 && s.prompt === 'Siguiente punto', 'line: primer punto no emite');
  s = feedPoint(s, { x: 10, y: 0 });
  const a = first(s.emitted);
  ok(a.type === 'addSegment' && near(a.b.x, 10), 'line: emite tramo 1');
  ok(s.points.length === 1 && near((s.points[0] as { x: number; y: number }).x, 10), 'line: reancla en último punto');
  s = feedPoint(s, { x: 10, y: 5 });
  const b = first(s.emitted);
  ok(b.type === 'addSegment' && near(b.a.x, 10) && near(b.b.y, 5), 'line: emite tramo 2 encadenado'); }

// ── polyline: acumula y emite en commit ──
{ let s = startCommand('polyline');
  s = feedPoint(s, { x: 0, y: 0 });
  s = feedPoint(s, { x: 5, y: 0 });
  s = feedPoint(s, { x: 5, y: 5 });
  ok(s.emitted.length === 0, 'polyline no emite hasta commit');
  s = commit(s);
  const a = first(s.emitted);
  ok(s.done && a.type === 'addPolyline' && a.points.length === 3 && a.closed === false, 'polyline emite 3 puntos en commit'); }

// ── move: base + destino → delta ──
{ let s = startCommand('move');
  s = feedPoint(s, { x: 100, y: 100 });
  s = feedPoint(s, { x: 130, y: 90 });
  const a = first(s.emitted);
  ok(s.done && a.type === 'moveBy' && near(a.dx, 30) && near(a.dy, -10), 'move delta (+30,-10)'); }

// ── copy: emite copyBy ──
{ let s = startCommand('copy');
  s = feedPoint(s, { x: 0, y: 0 });
  s = feedPoint(s, { x: -5, y: 5 });
  const a = first(s.emitted);
  ok(a.type === 'copyBy' && near(a.dx, -5) && near(a.dy, 5), 'copy delta (-5,+5)'); }

// ── offset por distancia ──
{ let s = startCommand('offset');
  s = feedDistance(s, 2.5);
  const a = first(s.emitted);
  ok(s.done && a.type === 'offsetBy' && near(a.distance, 2.5), 'offset distancia 2.5'); }

// ── cancel limpia ──
{ let s = startCommand('rect'); s = feedPoint(s, { x: 1, y: 1 }); s = cancel(s);
  ok(s.done && s.emitted.length === 0 && s.points.length === 0, 'cancel limpia sin emitir'); }

// ── preview rubber-band ──
{ let s = startCommand('rect'); s = feedPoint(s, { x: 0, y: 0 });
  const pv = previewGeometry(s, { x: 4, y: 3 });
  ok(pv !== null && pv.type === 'addRect' && near(pv.w, 4) && near(pv.h, 3), 'preview rect bajo cursor'); }
{ const pv = previewGeometry(startCommand('line'), { x: 1, y: 1 });
  ok(pv === null, 'preview sin punto base = null'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} cad-command`);
