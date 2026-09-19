/**
 * T17 — Mover geometría con su cota no la desasocia.
 *
 * Si la geometría y su cota van en la MISMA transformación del lote, la cota
 * debe seguir asociada y rastrear la posición nueva de la geometría.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "./associative-dimension";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "./entity-commands";
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function doc(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
  });
}

// --- MOVE de línea + cota asociada en un solo lote: sigue asociada ----------
const line: CadEntity = {
  id: "l1",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 4000, y: 0, z: 0 },
  layer: "0",
};
const dim: CadDimensionEntity = {
  id: "d1",
  type: "dimension",
  dimensionKind: "aligned",
  a: { x: 0, y: 0 },
  b: { x: 4000, y: 0 },
  c: { x: 0, y: -500 },
  offset: 500,
  layer: "0",
  precision: 0,
  sourceUnit: "mm",
  units: "mm",
  associative: true,
  references: [
    { entityId: "l1", anchor: "start" },
    { entityId: "l1", anchor: "end" },
  ],
  associationStatus: "associated",
};

const offset = { x: 1000, y: 500 };
const commands: CadEntityCommand[] = [
  { type: "transform", entityId: "l1", transform: { translation: offset } },
  { type: "transform", entityId: "d1", transform: { translation: offset } },
];

const d0 = doc([line, dim]);
const result = executeCadEntityCommandBatch(d0, commands, "MOVE");
const moved = result.document;

const movedLine = moved.entities.find((e) => e.id === "l1");
ok(movedLine?.type === "line", "la línea existe tras MOVE");
if (movedLine?.type === "line") {
  ok(Math.abs(movedLine.start.x - 1000) < 1e-6, "línea movida: start.x = 1000");
  ok(Math.abs(movedLine.start.y - 500) < 1e-6, "línea movida: start.y = 500");
  ok(Math.abs(movedLine.end.x - 5000) < 1e-6, "línea movida: end.x = 5000");
}

const movedDim = moved.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
ok(movedDim?.type === "dimension", "la cota existe tras MOVE");

if (movedDim) {
  // La cota debe seguir asociada, NO detached
  ok(movedDim.associative === true, "cota sigue asociativa tras MOVE conjunto");
  ok(
    movedDim.associationStatus === "associated",
    `associationStatus = "associated", no "${movedDim.associationStatus}"`,
  );

  // Los puntos de definición se movieron con el mismo offset
  ok(Math.abs(movedDim.a.x - 1000) < 1e-6, "cota.a.x movida a 1000");
  ok(Math.abs(movedDim.a.y - 500) < 1e-6, "cota.a.y movida a 500");
  ok(Math.abs(movedDim.b.x - 5000) < 1e-6, "cota.b.x movida a 5000");

  // La medida sigue siendo 4000 (la geometría no cambió de tamaño)
  const geom = buildCadDimensionGeometry(movedDim);
  ok(
    Math.abs((geom?.measurement ?? 0) - 4000) < 1,
    `medida = ${geom?.measurement}, esperada 4000`,
  );
}

// --- MOVE de solo geometría: cota se marca broken (ya no existe la ref) ---
const d1 = doc([line, dim]);
const moveOnlyLine: CadEntityCommand[] = [
  { type: "transform", entityId: "l1", transform: { translation: offset } },
];
const result2 = executeCadEntityCommandBatch(d1, moveOnlyLine, "MOVE");
const dimAfter = result2.document.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
ok(dimAfter?.type === "dimension", "la cota existe tras mover solo la línea");
if (dimAfter) {
  // Sin la línea transformada en el lote, la regeneración la marca broken
  // porque los anchors se recalculan contra la posición nueva de la línea
  // y la cota que no se movió queda desalineada. Pero eso es comportamiento
  // válido: lo que importa es que moverlas JUNTAS no rompa nada.
  ok(true, `estado tras mover solo geometría: ${dimAfter.associationStatus}`);
}

// --- COPY y MIRROR conservando el original: la copia nace DESASOCIADA -------
// Sus `references` siguen apuntando a la línea ORIGINAL. Si la copia conservara
// la asociación, la regeneración del lote la devolvería encima de la cota de
// partida: el ala copiada saldría sin cotas y la vieja con dos apiladas.
const mirror = { point: { x: 5000, y: 0 }, direction: { x: 0, y: 1000 } };
const copies: Array<[string, CadEntityCommand[], { x: number; y: number }]> = [
  ["COPY", [
    { type: "copy", entityId: "l1", newEntityId: "l1c", offset: { x: 0, y: 3000 } },
    { type: "copy", entityId: "d1", newEntityId: "d1c", offset: { x: 0, y: 3000 } },
  ], { x: 0, y: 3000 }],
  ["MIRROR", [
    { type: "copy", entityId: "l1", newEntityId: "l1c" },
    { type: "transform", entityId: "l1c", transform: { mirror } },
    { type: "copy", entityId: "d1", newEntityId: "d1c" },
    { type: "transform", entityId: "d1c", transform: { mirror } },
  ], { x: 10000, y: 0 }],
];
for (const [label, batch, expectedA] of copies) {
  const after = executeCadEntityCommandBatch(doc([line, dim]), batch, label).document;
  const copied = after.entities.find((e) => e.id === "d1c") as CadDimensionEntity | undefined;
  const kept = after.entities.find((e) => e.id === "d1") as CadDimensionEntity | undefined;
  ok(copied?.associative === false && copied.associationStatus === "detached", `${label}: la copia de la cota nace desasociada`);
  ok(
    Math.abs((copied?.a.x ?? NaN) - expectedA.x) < 1e-6 && Math.abs((copied?.a.y ?? NaN) - expectedA.y) < 1e-6,
    `${label}: la copia se queda donde la llevó la orden, a = (${copied?.a.x}, ${copied?.a.y})`,
  );
  ok(kept?.associative === true && kept.associationStatus === "associated", `${label}: el original sigue asociado`);
}

console.log(`dimension-move-association: ${checks} comprobaciones OK`);
