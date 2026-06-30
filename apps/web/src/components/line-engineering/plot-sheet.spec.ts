import { plotSheetModel } from './plot-sheet';

declare const process: { exit(code?: number): never };

let passed = 0;
const failures: string[] = [];

function ok(condition: boolean, message: string) {
  if (condition) passed += 1;
  else failures.push(message);
}

function fieldValue(fields: { label: string; value: string }[], label: string): string | undefined {
  return fields.find((field) => field.label === label)?.value;
}

const base = {
  model: 'AX-100',
  revision: 'B',
  unit: 'mm',
  footprintW: 20_000,
  footprintH: 10_000,
  placedStations: 6,
  totalStations: 8,
  equipmentCount: 4,
  utilPct: 24.25,
  flowLen: 5_000,
  date: '2026-06-29T12:00:00.000Z',
};

{
  const sheet = plotSheetModel(base);
  ok(sheet.title === 'Layout de planta', 'uses the expected CAD sheet title');
  ok(sheet.subtitle === 'AX-100 - Rev B', 'builds a stable subtitle');
  ok(fieldValue(sheet.fields, 'Revision') === 'B', 'uses ASCII revision label');
  ok(fieldValue(sheet.fields, 'Huella') === '20.0 m x 10.0 m', 'formats footprint dimensions in metres');
  ok(fieldValue(sheet.fields, 'Aprovechamiento') === '24.3 %', 'rounds utilization to one decimal');
  ok(fieldValue(sheet.fields, 'Validacion CAD') === 'Pendiente', 'defaults validation status to pending');
  ok(fieldValue(sheet.fields, 'Paquete') === 'PDF / A4 landscape', 'defaults package metadata');
}

{
  const sheet = plotSheetModel({
    ...base,
    preparedBy: 'Industrial Engineering',
    sheetSize: 'A3 landscape',
    exportFormat: 'PDF package',
    approvalStatus: 'En revision',
    activeLayer: 'Safety',
    layerCount: 6,
    visibleLayerCount: 5,
    lockedLayerCount: 2,
    connectorCount: 3,
    dimensionCount: 7,
    labelCount: 4,
    validationSeverity: 'warning',
    validationIssueCount: 5,
    dxfWarningCount: 2,
  });
  ok(fieldValue(sheet.fields, 'Conectores') === '3', 'includes connector count');
  ok(fieldValue(sheet.fields, 'Anotaciones') === '7 cotas / 4 notas', 'includes dimensions and notes');
  ok(fieldValue(sheet.fields, 'Capas') === '5/6 visibles / 2 lock', 'includes visible and locked layers');
  ok(fieldValue(sheet.fields, 'Capa activa') === 'Safety', 'includes active layer');
  ok(fieldValue(sheet.fields, 'Validacion CAD') === 'Con avisos (5)', 'includes validation issue count');
  ok(fieldValue(sheet.fields, 'Warnings DXF') === '2', 'includes DXF warning count');
  ok(fieldValue(sheet.fields, 'Paquete') === 'PDF package / A3 landscape', 'includes package target');
  ok(fieldValue(sheet.fields, 'Estado') === 'En revision', 'includes approval state');
  ok(fieldValue(sheet.fields, 'Preparo') === 'Industrial Engineering', 'includes preparer');
}

{
  const sheet = plotSheetModel({
    ...base,
    layerCount: 6,
    visibleLayerCount: 0,
    lockedLayerCount: 0,
  });
  ok(fieldValue(sheet.fields, 'Capas') === '0/6 visibles', 'preserves an explicit zero visible-layer count');
}

{
  const sheet = plotSheetModel({
    ...base,
    model: ' ',
    revision: '',
    totalStations: -3,
    placedStations: 2,
    equipmentCount: -9,
    utilPct: 150,
    flowLen: 0,
    date: 'not-a-date',
  });
  ok(sheet.subtitle === '--- - Rev ---', 'falls back for blank model and revision');
  ok(fieldValue(sheet.fields, 'Estaciones') === '2/2', 'keeps total stations at least placed stations');
  ok(fieldValue(sheet.fields, 'Equipos') === '0', 'clamps negative equipment count');
  ok(fieldValue(sheet.fields, 'Aprovechamiento') === '100.0 %', 'clamps utilization to 100');
  ok(fieldValue(sheet.fields, 'Flujo total') === '---', 'does not fake zero flow distance');
}

if (failures.length) {
  console.log(`Failed ${failures.length} plot-sheet checks after ${passed} passed.`);
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}

console.log(`Passed ${passed} plot-sheet checks.`);
