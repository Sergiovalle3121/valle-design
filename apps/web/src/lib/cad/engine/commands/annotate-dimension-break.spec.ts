/**
 * DIMBREAK — corta la línea de cota donde la cruza otro objeto, y se
 * restituye al quitarlo.
 *
 * Lo que se mide: la GEOMETRÍA de `buildCadDimensionGeometry` de verdad
 * tiene un hueco donde el objeto cruza — dos tramos `'dimension'` en vez de
 * uno, con el punto de cruce entre ellos— y, tras borrar el objeto que lo
 * abrió y volver a regenerar (`restoreCadDimensionBreaks`), vuelve a ser UN
 * solo tramo entero.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { buildCadDimensionGeometry, restoreCadDimensionBreaks, type CadDimensionEntity } from "../../associative-dimension";
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
const enter: CadCommandInput = { kind: "enter" };

/** Cota horizontal 0→2000 a la altura y=500; un muro vertical la cruza en x=800. */
function scene(): CadDocument {
  return document([
    {
      id: "d1",
      type: "dimension",
      a: { x: 0, y: 0 },
      b: { x: 2_000, y: 0 },
      dimensionKind: "linear",
      axis: "x",
      offset: 500,
      layer,
    },
    { id: "w1", type: "wall", start: { x: 800, y: -300, z: 0 }, end: { x: 800, y: 1_000, z: 0 }, thickness: 100, height: 2_400, layer },
  ]);
}

function dimensionPaths(entity: CadDimensionEntity) {
  const geometry = buildCadDimensionGeometry(entity);
  assert.ok(geometry, "la geometría de la cota tiene que poder construirse");
  checks += 1;
  return geometry!.paths.filter((path) => path.role === "dimension");
}

// --- corta un hueco donde el muro cruza --------------------------------------------------
{
  const doc = scene();
  const before = dimensionPaths(doc.entities.find((e) => e.id === "d1") as CadDimensionEntity);
  eq(before.length, 1, "antes de DIMBREAK, la línea de cota es UN solo tramo");

  const commands = commandsOf(run("DIMBREAK", [pick("d1"), pick("w1"), enter], doc));
  const applied = executeCadEntityCommandBatch(doc, commands, "DIMBREAK").document;
  const broken = applied.entities.find((e) => e.id === "d1") as CadDimensionEntity;
  ok((broken.breaks?.length ?? 0) === 1, "la cota lleva un hueco registrado");
  eq(broken.breaks![0].entityId, "w1", "colgado del muro que lo abrió");

  const after = dimensionPaths(broken);
  eq(after.length, 2, "después de DIMBREAK, la línea de cota son DOS tramos: el hueco");
  // El cruce real ocurre en x=800 sobre la línea de cota y=500 (0 a 2000): fracción 0.4.
  const gapStartX = Math.min(after[0].points.at(-1)!.x, after[1].points[0].x);
  const gapEndX = Math.max(after[0].points.at(-1)!.x, after[1].points[0].x);
  ok(gapStartX < 800 && gapEndX > 800, `el hueco (${gapStartX}..${gapEndX}) contiene el cruce real en x=800`);
  ok(gapEndX - gapStartX > 0 && gapEndX - gapStartX < 2_000, "el hueco es proporcional, no la línea entera");
  // Los dos tramos siguen a la altura y=500 de la línea de cota.
  for (const path of after) for (const point of path.points) close(point.y, 500, "la línea de cota sigue a y=500");
}

// --- se restituye al quitar el muro ------------------------------------------------------
{
  const doc = scene();
  const commands = commandsOf(run("DIMBREAK", [pick("d1"), pick("w1"), enter], doc));
  const withGap = executeCadEntityCommandBatch(doc, commands, "DIMBREAK").document;

  // Quitar el muro (sin pasar por DIMBREAK: cualquier borrado sirve) y regenerar.
  const withoutWall = withGap.entities.filter((entity) => entity.id !== "w1");
  const restored = restoreCadDimensionBreaks(withoutWall);
  ok(restored.restoredIds.includes("d1"), "la cota entra en la lista de restituidas");
  const dimAfter = restored.entities.find((e) => e.id === "d1") as CadDimensionEntity;
  ok(!dimAfter.breaks || dimAfter.breaks.length === 0, "sin el muro, ya no quedan huecos");
  const wholeAgain = dimensionPaths(dimAfter);
  eq(wholeAgain.length, 1, "la línea de cota vuelve a ser UN solo tramo, sola");

  // Y si el muro sigue ahí, regenerar NO le hace nada al hueco.
  const untouched = restoreCadDimensionBreaks(withGap.entities);
  eq(untouched.restoredIds.length, 0, "con el muro presente, regenerar no toca nada");
}

// --- rechazos con motivo ------------------------------------------------------------------
{
  const doc = scene();
  const notADimension = run("DIMBREAK", [pick("w1")], doc);
  eq(notADimension?.kind, "message", "no se corta una cosa que no es una cota");
  ok(notADimension?.kind === "message" && notADimension.text.includes("WALL"), "y se nombra el tipo");

  const noCrossing = document([
    { id: "d1", type: "dimension", a: { x: 0, y: 0 }, b: { x: 2_000, y: 0 }, dimensionKind: "linear", axis: "x", offset: 500, layer },
    { id: "l1", type: "line", start: { x: 5_000, y: -100, z: 0 }, end: { x: 5_000, y: 100, z: 0 }, layer },
  ]);
  const nothingCrosses = run("DIMBREAK", [pick("d1"), pick("l1"), enter], noCrossing);
  eq(nothingCrosses?.kind, "message", "un objeto que no cruza no abre ningún hueco");

  const radial = document([
    { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 500, layer },
    { id: "r1", type: "dimension", a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, dimensionKind: "radius", radius: 500, layer },
  ]);
  const wrongKind = run("DIMBREAK", [pick("r1")], radial);
  eq(wrongKind?.kind, "message", "una cota de radio no tiene línea recta que partir");
}

console.log(
  `annotate-dimension-break: ${checks} comprobaciones · corta un hueco real en la geometría donde cruza ` +
    "el objeto designado, y restoreCadDimensionBreaks lo restituye SOLO cuando ese objeto desaparece",
);
