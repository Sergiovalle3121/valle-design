/** Tests de dimension-format (Fase 73). npx tsx src/components/line-engineering/dimension-format.spec.ts */
import {
  convertLength, formatLength, formatWithTolerance, formatArea, formatAngle,
} from './dimension-format';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };
const eq = (a: string, b: string, m: string) => ok(a === b, `${m} (got "${a}")`);
const near = (a: number, b: number, t = 1e-9) => Math.abs(a - b) < t;

// ── convertLength ──
ok(near(convertLength(1000, 'mm', 'm'), 1), '1000 mm = 1 m');
ok(near(convertLength(1, 'm', 'mm'), 1000), '1 m = 1000 mm');
ok(near(convertLength(50, 'cm', 'mm'), 500), '50 cm = 500 mm');
ok(near(convertLength(2.5, 'm', 'cm'), 250), '2.5 m = 250 cm');

// ── formatLength ──
eq(formatLength(1234.56, { unit: 'mm', precision: 1 }), '1234.6 mm', 'precisión 1 redondea');
eq(formatLength(1234.56, { unit: 'mm', precision: 0 }), '1235 mm', 'precisión 0');
eq(formatLength(1234567, { unit: 'mm', group: true }), '1,234,567 mm', 'separador de miles');
eq(formatLength(1234.5, { unit: 'm', precision: 2, showUnit: false }), '1234.50', 'sin sufijo de unidad');
eq(formatLength(-0, { unit: 'mm' }), '0 mm', 'evita -0');

// ── formatWithTolerance ──
eq(formatWithTolerance(100, 0.5, { unit: 'mm', precision: 1 }), '100.0 ± 0.5 mm', 'tolerancia simétrica');
eq(formatWithTolerance(100, { plus: 0.5, minus: 0.2 }, { unit: 'mm', precision: 1 }), '100.0 +0.5/−0.2 mm', 'tolerancia asimétrica');
ok(formatWithTolerance(100, { plus: 0.5, minus: 0.2 }).includes('−'), 'usa el signo menos tipográfico');

// ── formatArea ──
eq(formatArea(12.345, { unit: 'm', precision: 2 }), '12.35 m²', 'área con sufijo ²');
eq(formatArea(1000000, { unit: 'mm', precision: 0, group: true }), '1,000,000 mm²', 'área con grupos');

// ── formatAngle ──
eq(formatAngle(45), '45.0°', 'ángulo 45.0°');
eq(formatAngle(30.25, 2), '30.25°', 'ángulo con 2 decimales');

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} dimension-format`);
