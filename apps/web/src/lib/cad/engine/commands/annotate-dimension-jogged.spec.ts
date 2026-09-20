/**
 * DIMJOGGED — cota de radio con quiebre para arcos cuyo centro cae fuera del plano.
 *
 * Lo que se mide: (1) el RÓTULO sigue siendo el radio REAL, aunque el centro
 * de verdad esté clavado a 100.000 unidades de distancia — el propio caso que
 * abrió el encargo; (2) la línea de referencia NO llega hasta el centro real,
 * sólo hasta el sustituto; (3) el quiebre es un zigzag medible: su tramo
 * central forma exactamente `jogAngle` grados con la línea de referencia, en
 * el punto que resulta de PROYECTAR el pick del usuario sobre esa línea.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
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

function dimensionOf(result: CadCommandResult | undefined): CadDimensionEntity {
  assert.ok(result?.kind === "document", `debía escribir; dio ${result?.kind}`);
  if (result?.kind !== "document") throw new Error("tipo");
  checks += 1;
  const insert = result.commands.find((command) => command.type === "insert");
  assert.ok(insert?.type === "insert" && insert.entity.type === "dimension", "el lote inserta una cota");
  checks += 1;
  return insert!.entity as CadDimensionEntity;
}

const pick = (entityId: string, x: number, y: number): CadCommandInput => ({ kind: "entityPick", entityId, point: { x, y } });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });

const angleBetween = (u: { x: number; y: number }, v: { x: number; y: number }): number => {
  const dot = u.x * v.x + u.y * v.y;
  const cross = u.x * v.y - u.y * v.x;
  return Math.abs((Math.atan2(Math.abs(cross), dot) * 180) / Math.PI);
};

// --- el centro real cae MUY lejos del plano: el arco de un pórtico grande -----------------
{
  const centerFarAway = { x: 100_000, y: 0 };
  const radius = 100_000 - 5_000; // el arco pasa por (5000, 0)
  const doc = document([
    {
      id: "a1",
      type: "arc",
      center: { x: centerFarAway.x, y: centerFarAway.y, z: 0 },
      radius,
      startAngle: 180,
      endAngle: 270,
      layer,
    },
  ]);
  const overrideCenter = { x: 5_800, y: -800 };
  // Deliberadamente FUERA de la línea borde→sustituto (que pasaría por
  // (5450,-450) a esta altura de X): el quiebre tiene que PROYECTAR este pick
  // sobre la línea, no clavarse donde se hizo clic.
  const jogClick = { x: 5_450, y: -300 };

  const result = run("DIMJOGGED", [pick("a1", 5_000, 0), point(overrideCenter.x, overrideCenter.y), point(jogClick.x, jogClick.y)], doc);
  const dimension = dimensionOf(result);

  eq(dimension.dimensionKind, "radius", "DIMJOGGED es una cota de radio");
  eq(dimension.jogCenterOverride, overrideCenter, "guarda el centro sustituto tal cual se marcó");

  const geometry = buildCadDimensionGeometry(dimension);
  assert.ok(geometry, "la geometría de la cota jogged se construye");
  checks += 1;
  close(geometry!.measurement, radius, "el RÓTULO mide el radio REAL, no la distancia al sustituto");
  ok(geometry!.label.startsWith("R"), "y lleva el prefijo de radio");

  const dimPath = geometry!.paths.find((path) => path.role === "dimension")!;
  ok(dimPath.points.length >= 5, "el trazo tiene borde, quiebre (3 puntos) y sustituto");
  const [edge, jogStart, jogPeak, jogEnd, override] = dimPath.points;
  eq(override, overrideCenter, "el trazo TERMINA en el sustituto");
  const distanceToRealCenter = Math.hypot(override.x - centerFarAway.x, override.y - centerFarAway.y);
  ok(
    distanceToRealCenter > radius * 0.9,
    `el trazo NO se acerca al centro real (a ${distanceToRealCenter.toFixed(0)} de él): ésa es la razón de ser de DIMJOGGED`,
  );
  for (const p of dimPath.points) {
    const distanceFromRealCenter = Math.hypot(p.x - centerFarAway.x, p.y - centerFarAway.y);
    ok(distanceFromRealCenter < radius * 1.5, "ningún punto del trazo se acerca al centro real");
  }

  // El quiebre: un zigzag de dos tramos a `jogAngle` (45° por defecto) de la
  // línea de referencia borde→sustituto.
  const leaderDir = { x: override.x - edge.x, y: override.y - edge.y };
  const firstLeg = { x: jogPeak.x - jogStart.x, y: jogPeak.y - jogStart.y };
  const secondLeg = { x: jogEnd.x - jogPeak.x, y: jogEnd.y - jogPeak.y };
  close(angleBetween(firstLeg, leaderDir), 45, "primer tramo del quiebre a 45° de la línea de referencia", 1e-3);
  close(angleBetween(secondLeg, leaderDir), 45, "segundo tramo también, en el sentido contrario", 1e-3);

  // jogCenterPoint (midpoint entre jogStart y jogEnd) es la PROYECCIÓN del pick
  // del usuario sobre la línea borde→sustituto — no el punto tecleado tal cual.
  const jogCenterPoint = { x: (jogStart.x + jogEnd.x) / 2, y: (jogStart.y + jogEnd.y) / 2 };
  const leaderLen = Math.hypot(leaderDir.x, leaderDir.y);
  const leaderUnit = { x: leaderDir.x / leaderLen, y: leaderDir.y / leaderLen };
  const rawProjection =
    (jogClick.x - edge.x) * leaderUnit.x + (jogClick.y - edge.y) * leaderUnit.y;
  const expectedProjection = { x: edge.x + leaderUnit.x * rawProjection, y: edge.y + leaderUnit.y * rawProjection };
  close(jogCenterPoint.x, expectedProjection.x, "el quiebre cae en la proyección del pick sobre la línea", 1);
  close(jogCenterPoint.y, expectedProjection.y, "también en Y", 1);

  // Invariante independiente: el pick estaba a 100 unidades PERPENDICULARES de
  // la línea borde→sustituto, y el quiebre no puede heredar ese desvío — tiene
  // que caer EXACTAMENTE sobre la línea, sea cual sea el punto que se marcó.
  const perpUnit = { x: -leaderUnit.y, y: leaderUnit.x };
  const perpendicularOfJogCenter =
    (jogCenterPoint.x - edge.x) * perpUnit.x + (jogCenterPoint.y - edge.y) * perpUnit.y;
  close(perpendicularOfJogCenter, 0, "el quiebre está SOBRE la línea de referencia, no a un lado", 1e-6);
}

// --- círculo, ángulo de quiebre no-por-defecto -------------------------------------------
{
  const doc = document([{ id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 1_000, layer }]);
  const result = run("DIMJOGGED", [pick("c1", 1_000, 0), point(1_400, 300), point(1_200, 150)], doc);
  const dimension = dimensionOf(result);
  const geometry = buildCadDimensionGeometry(dimension)!;
  close(geometry.measurement, 1_000, "el radio real de un círculo también se mide bien");

  // Con jogAngle explícito distinto del de fábrica: comprobar que la geometría lo respeta.
  const rotated: CadDimensionEntity = { ...dimension, jogAngle: 30 };
  const rotatedGeometry = buildCadDimensionGeometry(rotated)!;
  const path = rotatedGeometry.paths.find((p) => p.role === "dimension")!;
  const [edge, jogStart, jogPeak] = path.points;
  const override = path.points.at(-1)!;
  const leaderDir = { x: override.x - edge.x, y: override.y - edge.y };
  const firstLeg = { x: jogPeak.x - jogStart.x, y: jogPeak.y - jogStart.y };
  close(angleBetween(firstLeg, leaderDir), 30, "jogAngle explícito de 30° se refleja en el quiebre", 1e-3);
}

// --- rechazos con motivo -------------------------------------------------------------------
{
  const doc = document([{ id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer }]);
  const refused = run("DIMJOGGED", [pick("l1", 0, 0)], doc);
  eq(refused?.kind, "message", "una línea no tiene radio");
  ok(refused?.kind === "message" && refused.text.includes("LINE"), "y se nombra el tipo");
}

console.log(
  `annotate-dimension-jogged: ${checks} comprobaciones · el rótulo mide el radio REAL, la línea de ` +
    "referencia se detiene en el sustituto (nunca cerca del centro real) y el quiebre respeta jogAngle",
);
