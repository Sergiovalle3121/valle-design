/**
 * DIMSPACE — igualar o cerrar el espacio entre cotas paralelas.
 *
 * Lo que se mide aquí no es que el comando "no dé error": es la POSICIÓN
 * real de la línea de cota de cada resultado —`cadDimensionLineEnds`, la
 * misma función que usa DIMBREAK para medir un cruce—, antes y después de
 * aplicar el lote que el comando emite por `executeCadEntityCommandBatch`.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { cadDimensionLineEnds, type CadDimensionEntity } from "../../associative-dimension";
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

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
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
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

function linearDim(id: string, offset: number, axis: "x" | "y" = "x"): CadDimensionEntity {
  return {
    id,
    type: "dimension",
    a: { x: 0, y: 0 },
    b: { x: 1_000, y: 0 },
    dimensionKind: "linear",
    axis,
    offset,
    layer,
  };
}

function lineY(dimension: CadDimensionEntity): number {
  const ends = cadDimensionLineEnds(dimension);
  assert.ok(ends, `${dimension.id} debía tener una línea de cota recta`);
  checks += 1;
  return ends!.a.y;
}

// --- tres cotas a distancias desiguales quedan a la distancia pedida -------------------
{
  const d1 = linearDim("d1", 40);
  const d2 = linearDim("d2", 130);
  const d3 = linearDim("d3", 260);
  const doc = document([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
    d1,
    d2,
    d3,
  ]);
  // Antes: huecos desiguales (90 y 130).
  close(lineY(d2) - lineY(d1), 90, "hueco 1 antes de espaciar");
  close(lineY(d3) - lineY(d2), 130, "hueco 2 antes de espaciar");

  const commands = commandsOf(run("DIMSPACE", [pick("d1"), pick("d2"), pick("d3"), enter, distance(100)], doc));
  eq(commands.length, 2, "sólo se tocan las DOS cotas que no son la base");
  const applied = executeCadEntityCommandBatch(doc, commands, "DIMSPACE").document;
  const [a1, a2, a3] = ["d1", "d2", "d3"].map(
    (id) => applied.entities.find((entity) => entity.id === id) as CadDimensionEntity,
  );
  close(lineY(a1), 40, "la BASE no se mueve");
  close(lineY(a2), 140, "la segunda queda a 100 de la base");
  close(lineY(a3), 240, "la tercera queda a 200 de la base — mismo paso, no el hueco viejo");
  close(lineY(a2) - lineY(a1), 100, "hueco 1 después: exactamente el pedido");
  close(lineY(a3) - lineY(a2), 100, "hueco 2 después: exactamente el pedido");
}

// --- distancia 0: modo «Ajustar», quedan alineadas -----------------------------------
{
  const d1 = linearDim("d1", 40);
  const d2 = linearDim("d2", 130);
  const d3 = linearDim("d3", 260);
  const doc = document([d1, d2, d3]);
  const commands = commandsOf(run("DIMSPACE", [pick("d1"), pick("d2"), pick("d3"), enter, distance(0)], doc));
  const applied = executeCadEntityCommandBatch(doc, commands, "DIMSPACE").document;
  const [a1, a2, a3] = ["d1", "d2", "d3"].map(
    (id) => applied.entities.find((entity) => entity.id === id) as CadDimensionEntity,
  );
  close(lineY(a1), 40, "la base sigue en su sitio");
  close(lineY(a2), 40, "la segunda se alinea con la base");
  close(lineY(a3), 40, "la tercera también: las tres COINCIDEN");
}

// --- funciona igual con cotas ALINEADAS, mismo sentido ------------------------------
{
  const aligned = (id: string, offset: number): CadDimensionEntity => ({
    id,
    type: "dimension",
    a: { x: 0, y: 0 },
    b: { x: 800, y: 0 },
    dimensionKind: "aligned",
    offset,
    layer,
  });
  const doc = document([aligned("a1", 50), aligned("a2", 500)]);
  const commands = commandsOf(run("DIMSPACE", [pick("a1"), pick("a2"), enter, distance(200)], doc));
  const applied = executeCadEntityCommandBatch(doc, commands, "DIMSPACE").document;
  const a2after = applied.entities.find((entity) => entity.id === "a2") as CadDimensionEntity;
  close(lineY(a2after), 250, "alineadas: la segunda queda a 200 de la base (a lo largo de la normal)");
}

// --- rechazos con motivo -------------------------------------------------------------
{
  const base = document([linearDim("d1", 40), linearDim("d2", 130, "y")]);
  const mismatchedAxis = run("DIMSPACE", [pick("d1"), pick("d2"), enter, distance(50)], base);
  eq(mismatchedAxis?.kind, "message", "ejes distintos no son comparables");
  ok(
    mismatchedAxis?.kind === "message" && mismatchedAxis.text.includes("eje"),
    "y el motivo nombra el eje",
  );

  const negDoc = document([linearDim("d1", 40), linearDim("d2", 130)]);
  const negativeReal = run("DIMSPACE", [pick("d1"), pick("d2"), enter, distance(-10)], negDoc);
  eq(negativeReal?.kind, "message", "una distancia negativa se rechaza");

  const notADimension = document([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer },
    linearDim("d1", 40),
  ]);
  const refused = run("DIMSPACE", [pick("l1")], notADimension);
  eq(refused?.kind, "message", "la base tiene que ser una cota");
  ok(refused?.kind === "message" && refused.text.includes("LINE"), "y se nombra el tipo designado");
}

console.log(
  `annotate-dimension-space: ${checks} comprobaciones · DIMSPACE mide la POSICIÓN real de la línea ` +
    "de cota (cadDimensionLineEnds) antes y después, iguala a la distancia pedida y con 0 alinea",
);
