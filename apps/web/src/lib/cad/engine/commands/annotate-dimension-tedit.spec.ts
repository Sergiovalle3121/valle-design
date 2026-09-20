/**
 * DIMTEDIT — desplaza el rótulo de una cota: Izquierda, Derecha, Centro,
 * Inicio y Ángulo.
 *
 * Lo que se mide es dónde cae `textAnchor` de verdad —
 * `buildCadDimensionGeometry`, la misma función que alimenta el render y el
 * DXF— antes y después de cada opción, no sólo qué campo escribió el patch.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import "@/lib/cad/engine/all-commands";

import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const close = (actual: number, expected: number, message: string, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
  checks += 1;
};

const layer = "COTAS";

function document(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Cotas", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function run(name: string, inputs: readonly CadCommandInput[], doc: CadDocument): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nueva${++ids}`,
  };
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function commandsOf(result: CadCommandResult | undefined): readonly CadEntityCommand[] {
  assert.ok(result?.kind === "document", `debía escribir; dio ${result?.kind}`);
  if (result?.kind !== "document") throw new Error("tipo");
  checks += 1;
  return result.commands;
}

const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const angle = (degrees: number): CadCommandInput => ({ kind: "angle", degrees });
const enter: CadCommandInput = { kind: "enter" };

const base: CadDimensionEntity = {
  id: "d1",
  type: "dimension",
  a: { x: 0, y: 0 },
  b: { x: 1_000, y: 0 },
  dimensionKind: "linear",
  axis: "x",
  offset: 400,
  layer,
};

function apply(doc: CadDocument, commands: readonly CadEntityCommand[]): CadDimensionEntity {
  return executeCadEntityCommandBatch(doc, commands, "DIMTEDIT").document.entities.find(
    (entity) => entity.id === "d1",
  ) as CadDimensionEntity;
}

// --- Izquierda / Derecha / Centro mueven el rótulo a lo largo de la línea de cota --------
{
  const doc = document([base]);
  const centeredAnchor = buildCadDimensionGeometry(base)!.textAnchor;

  const left = apply(doc, commandsOf(run("DIMTEDIT", [keyword("Izquierda"), pick("d1"), enter], doc)));
  const leftAnchor = buildCadDimensionGeometry(left)!.textAnchor;
  ok(leftAnchor.x < centeredAnchor.x, `«Izquierda» mueve el rótulo hacia el extremo A (x=${leftAnchor.x} < ${centeredAnchor.x})`);
  close(leftAnchor.y, centeredAnchor.y, "el desfase perpendicular a la línea de cota no cambia");

  const right = apply(doc, commandsOf(run("DIMTEDIT", [keyword("Derecha"), pick("d1"), enter], doc)));
  const rightAnchor = buildCadDimensionGeometry(right)!.textAnchor;
  ok(rightAnchor.x > centeredAnchor.x, `«Derecha» lo mueve hacia el extremo B (x=${rightAnchor.x} > ${centeredAnchor.x})`);

  // Centro, partiendo de una cota ya movida a la izquierda, la devuelve al centro.
  const recentered = apply(doc, commandsOf(run("DIMTEDIT", [keyword("Centro"), pick("d1"), enter], document([left]))));
  close(buildCadDimensionGeometry(recentered)!.textAnchor.x, centeredAnchor.x, "«Centro» recentra");
}

// --- Ángulo escribe una rotación real, leída por el render --------------------------------
{
  const doc = document([base]);
  const rotated = apply(doc, commandsOf(run("DIMTEDIT", [keyword("Ángulo"), angle(25), pick("d1"), enter], doc)));
  close(buildCadDimensionGeometry(rotated)!.textAngle, 25, "el ángulo del render es el que se pidió");
}

// --- un rótulo arrastrado a mano, justificado y girado: Inicio lo borra TODO de una vez ---
{
  const messy: CadDimensionEntity = {
    ...base,
    textPosition: { x: 999, y: 999 },
    textJustification: "second",
    textRotationOverride: 77,
  };
  const doc = document([messy]);
  const homed = apply(doc, commandsOf(run("DIMTEDIT", [keyword("Inicio"), pick("d1"), enter], doc)));
  ok(homed.textPosition === undefined, "sin textPosition");
  ok(homed.textJustification === undefined, "sin textJustification");
  ok(homed.textRotationOverride === undefined, "sin textRotationOverride — DIMEDIT «Inicio» no llega tan lejos, DIMTEDIT sí");
  const geometry = buildCadDimensionGeometry(homed)!;
  close(geometry.textAnchor.x, buildCadDimensionGeometry(base)!.textAnchor.x, "vuelve al centro derivado");
  close(geometry.textAngle, buildCadDimensionGeometry(base)!.textAngle, "y al ángulo derivado");
}

// --- Izquierda/Derecha/Centro BORRAN un textPosition arrastrado a mano -------------------
{
  const dragged: CadDimensionEntity = { ...base, textPosition: { x: 200, y: 5_000 } };
  const doc = document([dragged]);
  const justified = apply(doc, commandsOf(run("DIMTEDIT", [keyword("Centro"), pick("d1"), enter], doc)));
  ok(justified.textPosition === undefined, "elegir una justificación limpia el arrastre manual");
  close(
    buildCadDimensionGeometry(justified)!.textAnchor.y,
    buildCadDimensionGeometry(base)!.textAnchor.y,
    "y el rótulo vuelve a la altura derivada, no a los 5.000 arrastrados",
  );
}

// --- sólo aplica a cotas con línea de cota recta -----------------------------------------
{
  const radial: CadDimensionEntity = { id: "r1", type: "dimension", a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, dimensionKind: "radius", radius: 500, layer };
  const doc = document([radial]);
  const refused = run("DIMTEDIT", [keyword("Izquierda"), pick("r1"), enter], doc);
  eq(refused?.kind, "message", "una cota de radio no tiene «izquierda» que signifique algo");
}

console.log(
  `annotate-dimension-tedit: ${checks} comprobaciones · Izquierda/Derecha/Centro mueven el textAnchor ` +
    "real a lo largo de la línea de cota, Ángulo gira el rótulo, e Inicio limpia posición, " +
    "justificación y rotación de una sola vez",
);
