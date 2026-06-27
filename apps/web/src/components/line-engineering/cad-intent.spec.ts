/** Tests de cad-intent (Fase 69). npx tsx src/components/line-engineering/cad-intent.spec.ts */
import { CAD_TOOLS, normalizeToolCall, normalizeToolCalls } from './cad-intent';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };

// ── esquema de tools ──
ok(CAD_TOOLS.length >= 6 && CAD_TOOLS.every((t) => t.type === 'function' && !!t.function.name), 'CAD_TOOLS bien formado');
ok(CAD_TOOLS.some((t) => t.function.name === 'placeAsset'), 'incluye placeAsset');

// ── setFootprint ──
{ const r = normalizeToolCall('setFootprint', { footprintW: 20000, footprintH: 10000 });
  ok(r.ok && r.intent.kind === 'setFootprint' && r.intent.footprintW === 20000, 'setFootprint válido'); }
{ const r = normalizeToolCall('setFootprint', { footprintW: -5, footprintH: 10 });
  ok(!r.ok, 'setFootprint rechaza ancho ≤ 0'); }
{ const r = normalizeToolCall('setFootprint', '{"footprintW":1000,"footprintH":500,"gridSize":250}');
  ok(r.ok && r.intent.kind === 'setFootprint' && r.intent.gridSize === 250, 'acepta args como string JSON'); }

// ── placeAsset ──
{ const r = normalizeToolCall('placeAsset', { kind: 'workbench', x: 100, y: 200 });
  ok(r.ok && r.intent.kind === 'placeAsset' && r.intent.asset.w === 1000 && r.intent.asset.h === 800, 'placeAsset con defaults de tamaño'); }
{ const r = normalizeToolCall('placeAsset', { kind: 'ROBOT', x: 1, y: 2, w: 500, rotation: 90, label: 'R1' });
  ok(r.ok && r.intent.kind === 'placeAsset' && r.intent.asset.kind === 'robot' && r.intent.asset.rotation === 90 && r.intent.asset.label === 'R1', 'placeAsset normaliza kind a minúsculas'); }
{ const r = normalizeToolCall('placeAsset', { kind: 'unicornio', x: 1, y: 2 });
  ok(!r.ok, 'placeAsset rechaza kind desconocido'); }
{ const r = normalizeToolCall('placeAsset', { kind: 'rack', x: 'no', y: 2 });
  ok(!r.ok, 'placeAsset rechaza x no numérico'); }

// ── drawWall / addDimension → DrawAction addSegment ──
{ const r = normalizeToolCall('drawWall', { x1: 0, y1: 0, x2: 10, y2: 0 });
  ok(r.ok && r.intent.kind === 'draw' && r.intent.action.type === 'addSegment', 'drawWall → addSegment'); }
{ const r = normalizeToolCall('addDimension', { x1: 0, y1: 0, x2: 10 });
  ok(!r.ok, 'addDimension rechaza si falta un punto'); }

// ── arrangeLine / connectLine ──
{ const r = normalizeToolCall('arrangeLine', {});
  ok(r.ok && r.intent.kind === 'arrangeLine', 'arrangeLine'); }
{ const r = normalizeToolCall('connectLine', { kind: 'conveyor' });
  ok(r.ok && r.intent.kind === 'connectLine' && r.intent.flow === 'conveyor', 'connectLine conveyor'); }
{ const r = normalizeToolCall('connectLine', { kind: 'basura' });
  ok(r.ok && r.intent.kind === 'connectLine' && r.intent.flow === 'flow', 'connectLine cae a flow por default'); }

// ── moveStation ──
{ const r = normalizeToolCall('moveStation', { station: 'EST-10', x: 1500, y: 2000 });
  ok(r.ok && r.intent.kind === 'moveStation' && r.intent.station === 'EST-10' && r.intent.x === 1500, 'moveStation válido'); }
{ const r = normalizeToolCall('moveStation', { station: '', x: 1, y: 2 });
  ok(!r.ok, 'moveStation rechaza estación vacía'); }
{ const r = normalizeToolCall('moveStation', { station: 'EST-1', x: 'no', y: 2 });
  ok(!r.ok, 'moveStation rechaza x no numérico'); }

// ── herramienta desconocida ──
{ const r = normalizeToolCall('hackTheGibson', {});
  ok(!r.ok, 'herramienta desconocida → error'); }

// ── batch ──
{ const { intents, errors } = normalizeToolCalls([
    { name: 'arrangeLine', arguments: {} },
    { name: 'placeAsset', arguments: { kind: 'aoi', x: 5, y: 5 } },
    { name: 'placeAsset', arguments: { kind: 'dragón', x: 5, y: 5 } },
  ]);
  ok(intents.length === 2 && errors.length === 1, 'batch separa válidos de inválidos'); }

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} cad-intent`);
