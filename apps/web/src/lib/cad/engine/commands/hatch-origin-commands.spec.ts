/**
 * HATCHORIGIN contra el registro del PRODUCTO — y la FASE real del patrón,
 * no sólo que el campo `origin` haya cambiado.
 *
 * Dos HATCH en regiones separadas, mismo patrón/ángulo/escala. Con orígenes
 * DISTINTOS sus líneas de barrido quedan a destiempo — se mide proyectando un
 * punto de cada trazo sobre la normal de la familia y comparando el resto
 * módulo la separación. Tras `HATCHORIGIN` sobre los dos con el MISMO punto,
 * la misma medida da 0: las rayas de las dos regiones caen sobre las MISMAS
 * rectas del plano.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { cadHatchFamilies } from "../../hatch-pattern-table";
import { cadHatchPatternStrokes } from "../../hatch-pattern-strokes";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const layer = "0";
const PATTERN = "ANSI31";
const SCALE = 10; // ANSI31 a escala 10 separa 10 unidades entre rayas.

function document(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(doc: CadDocument, selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    document: () => doc,
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${Math.random()}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[], doc: CadDocument, selection: readonly string[]): CadEntityCommand[] {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(doc, selection);
  let step = descriptor!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
  }
  const result: CadCommandResult | undefined = step.result;
  assert.ok(result?.kind === "document", `${name} debía escribir; dio ${result?.kind}`);
  checks += 1;
  return result!.kind === "document" ? [...result.commands] : [];
}

function square(id: string, x0: number, y0: number, size: number, origin?: { x: number; y: number }): CadEntity {
  return {
    id,
    type: "hatch",
    pattern: PATTERN,
    solid: false,
    scale: SCALE,
    boundaries: [
      [
        { x: x0, y: y0, z: 0 },
        { x: x0 + size, y: y0, z: 0 },
        { x: x0 + size, y: y0 + size, z: 0 },
        { x: x0, y: y0 + size, z: 0 },
      ],
    ],
    ...(origin ? { origin: { x: origin.x, y: origin.y, z: 0 } } : {}),
    layer,
  } as CadEntity;
}

/**
 * Fase de un HATCH: la distancia del primer trazo al múltiplo más cercano de
 * la separación de la familia, medida desde `origin`. 0 = perfectamente en
 * fase con ese origen; `spacing/2` = todo lo desfasado que se puede estar.
 */
function phaseResidual(entity: Extract<CadEntity, { type: "hatch" }>, origin: { x: number; y: number }): number {
  const family = cadHatchFamilies(entity.pattern, entity.angle, entity.scale ?? 1).families[0]!;
  const rad = (family.angle * Math.PI) / 180;
  const normal = { x: -Math.sin(rad), y: Math.cos(rad) };
  const strokes = cadHatchPatternStrokes(
    entity.boundaries.map((loop) => loop.map((point) => ({ x: point.x, y: point.y }))),
    entity,
    entity.scale ?? 1,
  );
  ok(strokes.strokes.length > 0, `${entity.id}: el sombreado sí produce trazos para medir`);
  const point = strokes.strokes[0]!.a;
  const projection = (point.x - origin.x) * normal.x + (point.y - origin.y) * normal.y;
  const mod = ((projection % family.spacing) + family.spacing) % family.spacing;
  return Math.min(mod, family.spacing - mod);
}

// Región A en el origen, región B lejos y con un origen DISTINTO — desplazado
// MEDIA separación a lo largo de la normal de la familia, el peor desfase
// posible, para que la comprobación no dependa de acertar un número al azar.
const baseFamily = cadHatchFamilies(PATTERN, undefined, SCALE).families[0]!;
const baseRad = (baseFamily.angle * Math.PI) / 180;
const baseNormal = { x: -Math.sin(baseRad), y: Math.cos(baseRad) };
const halfSpacingOffset = {
  x: baseNormal.x * (baseFamily.spacing / 2),
  y: baseNormal.y * (baseFamily.spacing / 2),
};
const a = square("ha", 0, 0, 40);
const b = square("hb", 500, 500, 40, halfSpacingOffset);
let doc = document([a, b]);

const beforeA = doc.entities.find((entity) => entity.id === "ha") as Extract<CadEntity, { type: "hatch" }>;
const beforeB = doc.entities.find((entity) => entity.id === "hb") as Extract<CadEntity, { type: "hatch" }>;

// Medidos cada uno CONTRA EL ORIGEN DE A: si de verdad tienen orígenes
// distintos, la fase de B contra el origen de A no es 0.
ok(phaseResidual(beforeA, { x: 0, y: 0 }) < 1e-6, "A, medido contra su propio origen (0,0), está en fase consigo mismo");
ok(
  phaseResidual(beforeB, { x: 0, y: 0 }) > baseFamily.spacing / 2 - 1e-6,
  "ANTES de HATCHORIGIN: B (desplazado media separación) NO está en fase con el origen de A — la costura se vería",
);

// HATCHORIGIN iguala el origen de LOS DOS al mismo punto.
const target = { x: 7, y: 3 };
const commands = run(
  "HATCHORIGIN",
  [{ kind: "point", point: target, source: "typed" }],
  doc,
  ["ha", "hb"],
);
ok(commands.length === 2, "HATCHORIGIN escribe una orden por cada HATCH designado");
doc = executeCadEntityCommandBatch(doc, commands, "HATCHORIGIN").document;

const afterA = doc.entities.find((entity) => entity.id === "ha") as Extract<CadEntity, { type: "hatch" }>;
const afterB = doc.entities.find((entity) => entity.id === "hb") as Extract<CadEntity, { type: "hatch" }>;
ok(afterA.origin?.x === target.x && afterA.origin?.y === target.y, "A queda con el nuevo origen");
ok(afterB.origin?.x === target.x && afterB.origin?.y === target.y, "B queda con el MISMO nuevo origen");

// DESPUÉS: medidas contra el origen COMÚN, las dos regiones caen en fase.
const phaseAAfter = phaseResidual(afterA, target);
const phaseBAfter = phaseResidual(afterB, target);
ok(phaseAAfter < 1e-6, "DESPUÉS de HATCHORIGIN: A sigue en fase con el origen común");
ok(
  phaseBAfter < 1e-6,
  `DESPUÉS de HATCHORIGIN: B (en una región totalmente distinta) también cae en fase con el origen común (residuo ${phaseBAfter})`,
);

console.log(`hatch-origin-commands: ${checks} comprobaciones OK`);
