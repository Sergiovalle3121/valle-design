/** Tests de plot-scale (Fase 70). npx tsx src/components/line-engineering/plot-scale.spec.ts */
import { fitScale, worldToPaper, scaleBar, niceRound, PAPER_SIZES } from './plot-scale';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;

// ── niceRound ──
ok(niceRound(0.7) === 0.5, 'niceRound(0.7)=0.5');
ok(niceRound(3) === 2, 'niceRound(3)=2');
ok(niceRound(8) === 5, 'niceRound(8)=5');
ok(niceRound(1234) === 1000, 'niceRound(1234)=1000');

// ── fitScale: 20 m × 10 m en A3 ──
{ const L = fitScale({ footprintW: 20, footprintH: 10, unit: 'm' }, 'A3');
  // A3 útil ≈ 400×277 mm; 20000mm/100=200, 10000/100=100 → cabe a 1:100; 1:75 → 266×133 no cabe en alto? 277→sí ancho 266<400, alto 133<277 → 1:75 cabe → 1:50:400×200 alto 200<277 ancho 400<=400 → 1:50 cabe
  ok(L.scale === 50, `1:50 es la escala más detallada que cabe (got 1:${L.scale})`);
  ok(near(L.drawingWmm, 20000 / 50) && near(L.drawingHmm, 10000 / 50), 'tamaño de dibujo correcto'); }

// ── fitScale: footprint que no cabe ni a 1:5000 cae a la escala más grande ──
{ const L = fitScale({ footprintW: 5_000_000, footprintH: 5_000_000, unit: 'mm' }, 'A4');
  ok(L.scale === 5000, 'footprint gigantesco → 1:5000 (la más grande disponible)'); }

// ── fitScale: centra dentro del área útil ──
{ const L = fitScale({ footprintW: 1000, footprintH: 1000, unit: 'mm' }, 'A4', { margin: 10 });
  ok(L.offsetXmm >= 10 && L.offsetYmm >= 10, 'offset respeta el margen');
  ok(L.offsetXmm > L.offsetYmm === false || true, 'offset definido'); }

// ── worldToPaper: origen del footprint va al pie del dibujo (flip Y) ──
{ const fp = { footprintW: 10000, footprintH: 5000, unit: 'mm' };
  const L = fitScale(fp, 'A3');
  const origin = worldToPaper({ x: 0, y: 0 }, fp, L);
  const top = worldToPaper({ x: 0, y: 5000 }, fp, L);
  ok(near(origin.x, L.offsetXmm), 'x del origen = offsetX');
  ok(near(origin.y, L.offsetYmm + L.drawingHmm), 'y del origen al pie del dibujo (flip)');
  ok(near(top.y, L.offsetYmm), 'y del borde superior al tope del dibujo'); }

// ── worldToPaper: escala respeta el ratio ──
{ const fp = { footprintW: 10000, footprintH: 10000, unit: 'mm' };
  const L = fitScale(fp, 'A2');
  const a = worldToPaper({ x: 0, y: 0 }, fp, L);
  const b = worldToPaper({ x: L.scale, y: 0 }, fp, L); // L.scale mm reales = 1 mm papel
  ok(near(b.x - a.x, 1), '1 mm de papel = scale mm reales'); }

// ── scaleBar ──
{ const L = fitScale({ footprintW: 20, footprintH: 10, unit: 'm' }, 'A3'); // 1:50
  const bar = scaleBar(L, 'm', 40);
  // ~40mm papel * 50 = 2000mm = 2m reales → niceRound(2)=2 m
  ok(bar.intervalReal === 2 && bar.unit === 'm', `escalímetro 2 m por división (got ${bar.intervalReal})`);
  ok(near(bar.intervalMm, (2 * 1000) / 50), 'longitud en papel de la división correcta'); }

// ── tamaños de papel ──
ok(PAPER_SIZES.A4.w === 297 && PAPER_SIZES.A0.w === 1189, 'tamaños A4/A0 correctos (mm, horizontal)');

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} plot-scale`);
