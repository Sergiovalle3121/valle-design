/**
 * La exportación DWG de punta a punta, con el gate DELANTE del round-trip:
 *
 *   1. FALLO CERRADO: con los gates de producción (oráculo externo sin
 *      correr — §8.2), la exportación se RECHAZA aunque la bandera esté
 *      encendida, y los bloqueos nombran el oráculo y la OWNER ACTION.
 *   2. ROUND-TRIP (con gates inyectados como si el oráculo hubiera pasado):
 *      un documento del producto con el subconjunto §8.1 más un MURO (fuera
 *      del subconjunto) sale como «éxito con pérdidas», el muro está en el
 *      manifiesto POR SU NOMBRE de tipo, y `readDwg` relee el archivo con
 *      las entidades escribibles y sus coordenadas intactas.
 *   3. RECHAZO por vacío: un documento sin entidades escribibles no produce
 *      archivo — un DWG vacío que dice ser tu plano es peor que un error.
 */
import assert from "node:assert/strict";
import { readDwg } from "@valle-design/dwg-codec";
import type { CadDocument } from "./cad-document";
import {
  exportCadDocumentToDwg,
  preflightCadDwgExport,
} from "./dwg-native-writer";
import { DWG_EXPORT_FLAG, dwgBetaExportIsEnabled } from "./dwg-export-flag";

const ORACLE_PASSED = Object.freeze({
  publicWriterExists: true,
  externalOracleVerified: true,
});

function baseDocument(entities: CadDocument["entities"]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MURO", name: "MURO", color: "#f87171", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

const mixedDocument = baseDocument([
  { id: "l1", type: "line", start: { x: 100, y: 200, z: 0 }, end: { x: 900, y: 200, z: 0 }, layer: "0" },
  { id: "c1", type: "circle", center: { x: 500, y: 500, z: 0 }, radius: 150, layer: "0" },
  { id: "a1", type: "arc", center: { x: 800, y: 800, z: 0 }, radius: 90, startAngle: 0, endAngle: 180, layer: "0" },
  {
    id: "w1",
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 3_000, y: 0, z: 0 },
    thickness: 250,
    height: 2_400,
    layer: "MURO",
    material: "brick",
  },
] as CadDocument["entities"]);

// 1 · FALLO CERRADO con los gates reales de producción.
{
  assert.equal(DWG_EXPORT_FLAG, false, "la bandera nace apagada");
  assert.equal(dwgBetaExportIsEnabled(true), false, "bandera sin oráculo = cerrado");
  const rejected = exportCadDocumentToDwg(mixedDocument, { betaFlagOn: true });
  assert.equal(rejected.estado, "rechazado");
  assert.equal(rejected.motivo, "gate_cerrado");
  assert.ok(
    rejected.bloqueos.some((blocker) => /ODA File Converter/.test(blocker) && /OWNER ACTION/.test(blocker)),
    "el bloqueo nombra el oráculo externo y la OWNER ACTION",
  );
  // El preflight informa aunque el gate esté cerrado: la interfaz puede
  // enseñar qué viajaría el día que el oráculo pase.
  assert.equal(rejected.preflight.writableCount, 3);
  assert.deepEqual(rejected.preflight.unwritableByType, { wall: 1 });
}

// 2 · ROUND-TRIP con el oráculo inyectado como pasado.
{
  const result = exportCadDocumentToDwg(mixedDocument, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  assert.equal(result.estado, "exito_con_perdidas", "el muro no viaja y se DICE");
  assert.ok(result.bytes.length > 500, "el archivo tiene contenido real");
  assert.ok(
    result.manifiestoDePerdidas.some(
      (entry) => /wall/i.test(`${entry.sourceType} ${entry.detail}`),
    ),
    `el manifiesto nombra al muro: ${JSON.stringify(result.manifiestoDePerdidas)}`,
  );

  const reread = readDwg(result.bytes);
  const kinds = reread.modelSpaceEntities.map((record) => record.entity.kind).sort();
  assert.deepEqual(kinds, ["arc", "circle", "line"], "releído: exactamente lo escribible");
  const line = reread.modelSpaceEntities.find(
    (record) => record.entity.kind === "line",
  )!.entity;
  assert.ok("start" in line && "end" in line, "la línea releída trae sus puntos");
  const start = (line as { start: { x: number; y: number } }).start;
  const end = (line as { end: { x: number; y: number } }).end;
  assert.ok(Math.abs(start.x - 100) < 1e-6 && Math.abs(start.y - 200) < 1e-6, "coordenadas de inicio intactas");
  assert.ok(Math.abs(end.x - 900) < 1e-6 && Math.abs(end.y - 200) < 1e-6, "coordenadas de fin intactas");

  // `readDwg` es el códec crudo: NO convierte grados↔radianes (ver el
  // comentario de `toCanonicalEntity` en dwg-native-writer.ts) — lee EXACTAMENTE
  // lo que el writer escribió en el campo de ángulo, en RADIANES. El
  // documento del producto guarda 180° (`mixedDocument` arriba); si el
  // writer los escribiera crudos como si ya fueran radianes (el bug que
  // esto cierra), este valor releído sería 180, no π. `check:dwg` prohíbe
  // que este archivo importe el adaptador de LECTURA (ADR-0009 §6/§8, ver
  // scripts/dwg/check-product-boundary.mjs), así que la prueba se queda del
  // lado del códec crudo en vez de cruzar esa frontera.
  const arcRecord = reread.modelSpaceEntities.find(
    (record) => record.entity.kind === "arc",
  )!.entity as { startAngle: number; endAngle: number };
  assert.ok(
    Math.abs(arcRecord.startAngle - 0) < 1e-9,
    `startAngle crudo: ${arcRecord.startAngle} rad (esperado 0)`,
  );
  assert.ok(
    Math.abs(arcRecord.endAngle - Math.PI) < 1e-9,
    `endAngle crudo: ${arcRecord.endAngle} rad (esperado π ≈ ${Math.PI}; ` +
      `180 crudo delataría el bug de grados-como-radianes)`,
  );
}

// 3 · RECHAZO por documento sin nada escribible.
{
  const onlyWalls = baseDocument([
    {
      id: "w2",
      type: "wall",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1_000, y: 0, z: 0 },
      thickness: 200,
      height: 2_400,
      layer: "MURO",
      material: "brick",
    },
  ] as CadDocument["entities"]);
  const rejected = exportCadDocumentToDwg(onlyWalls, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  assert.equal(rejected.estado, "rechazado");
  assert.equal(rejected.motivo, "sin_entidades_escribibles");
}

// 4 · El preflight solo no escribe nada (pura consulta).
{
  const preflight = preflightCadDwgExport(mixedDocument);
  assert.equal(preflight.writableCount, 3);
  assert.deepEqual(preflight.unwritableByType, { wall: 1 });
}

console.log(
  "dwg-native-writer.spec: gate cerrado hasta el oráculo, round-trip íntegro y pérdidas con nombre",
);
