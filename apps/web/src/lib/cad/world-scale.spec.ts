/** Pure factory-scale world-sizing tests. */
import { strict as assert } from 'node:assert';
import {
  metersToUnit,
  unitToMeters,
  clampMeters,
  clampGridMeters,
  clampFootprintUnit,
  clampGridUnit,
  presetToUnit,
  adaptiveGridStepM,
  niceScaleBarMeters,
  formatMeters,
  FACTORY_PRESETS,
  MIN_WORLD_M,
  MAX_WORLD_M,
} from './world-scale';

// --- unit conversion round-trips ---
assert.equal(metersToUnit(1, 'mm'), 1000, '1 m = 1000 mm');
assert.equal(metersToUnit(1, 'cm'), 100, '1 m = 100 cm');
assert.equal(metersToUnit(1, 'm'), 1, '1 m = 1 m');
assert.equal(unitToMeters(1000, 'mm'), 1, '1000 mm = 1 m');
assert.equal(unitToMeters(250, 'cm'), 2.5, '250 cm = 2.5 m');
for (const u of ['mm', 'cm', 'm'] as const) {
  assert.equal(unitToMeters(metersToUnit(42, u), u), 42, `round-trips in ${u}`);
}

// --- bounds clamping ---
assert.equal(clampMeters(0), MIN_WORLD_M, 'too small clamps up');
assert.equal(clampMeters(99999), MAX_WORLD_M, 'too large clamps down');
assert.equal(clampMeters(150), 150, 'in-range stays');
assert.equal(clampMeters(Number.NaN), MIN_WORLD_M, 'NaN is safe');
assert.equal(clampGridMeters(0), 0.1, 'zero grid clamps to minimum');
assert.equal(clampGridMeters(9999), 50, 'huge grid clamps to maximum');

// --- footprint clamping in the editor unit (mm) ---
assert.equal(clampFootprintUnit(200000, 'mm'), 200000, '200 m footprint allowed in mm');
assert.equal(clampFootprintUnit(2_000_000, 'mm'), MAX_WORLD_M * 1000, '2 km clamps to the plant max');
assert.equal(clampFootprintUnit(10, 'mm'), MIN_WORLD_M * 1000, '10 mm clamps up to the floor');
assert.equal(clampGridUnit(0, 'mm'), 100, '0 grid clamps to 100 mm');

// --- presets are all in-range and translate to whole units ---
for (const p of FACTORY_PRESETS) {
  assert.ok(p.widthM >= MIN_WORLD_M && p.widthM <= MAX_WORLD_M, `${p.id} width in range`);
  assert.ok(p.heightM >= MIN_WORLD_M && p.heightM <= MAX_WORLD_M, `${p.id} height in range`);
  const u = presetToUnit(p, 'mm');
  assert.equal(u.width, Math.round(p.widthM * 1000), `${p.id} width → mm`);
  assert.equal(u.height, Math.round(p.heightM * 1000), `${p.id} height → mm`);
  assert.ok(Number.isInteger(u.width) && Number.isInteger(u.height), `${p.id} whole units`);
}
// the "plant" preset is the 300×200 m nave the AC calls out
const plant = FACTORY_PRESETS.find((p) => p.id === 'plant');
assert.ok(plant && plant.widthM === 300 && plant.heightM === 200, 'plant preset is 300×200 m');

// the work area opens up well beyond a single nave — the biggest preset spans a campus
assert.ok(MAX_WORLD_M >= 1000, 'plant max opened up to at least 1 km per side');
const biggest = FACTORY_PRESETS.reduce((a, b) => (b.widthM > a.widthM ? b : a));
assert.ok(biggest.widthM > 500, 'largest preset is bigger than the old 500 m cap');
assert.ok(
  biggest.widthM <= MAX_WORLD_M && biggest.heightM <= MAX_WORLD_M,
  'largest preset stays within the plant bounds',
);

// --- adaptive grid step keeps the line count sane and rises with the world ---
assert.ok(adaptiveGridStepM(10) <= adaptiveGridStepM(300), 'bigger plant → coarser grid');
assert.ok(adaptiveGridStepM(300) >= 5, '300 m plant uses a coarse step');
for (const span of [10, 40, 80, 150, 300, 500, 800, 1200, 1500]) {
  const step = adaptiveGridStepM(span);
  const lines = span / step;
  assert.ok(lines <= 40 && lines >= 2, `~${Math.round(lines)} lines for ${span} m is readable`);
}

// --- nice scale-bar rounding (1/2/5 × 10^n) ---
assert.equal(niceScaleBarMeters(90), 50, '90 → 50');
assert.equal(niceScaleBarMeters(9), 5, '9 → 5');
assert.equal(niceScaleBarMeters(3), 2, '3 → 2');
assert.equal(niceScaleBarMeters(1.7), 1, '1.7 → 1');
assert.equal(niceScaleBarMeters(0.3), 0.2, '0.3 → 0.2');
assert.equal(niceScaleBarMeters(250), 200, '250 → 200');
assert.ok(niceScaleBarMeters(0) > 0, 'zero is safe');
for (const raw of [0.4, 1.3, 7, 42, 130, 480]) {
  assert.ok(niceScaleBarMeters(raw) <= raw, `${raw} rounds down to a nice value`);
}

// --- formatting ---
assert.equal(formatMeters(1.5), '1.5 m', 'metres formatted');
assert.equal(formatMeters(200), '200 m', 'whole metres formatted');

console.log('cad world-scale specs passed');
