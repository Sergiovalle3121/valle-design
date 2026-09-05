/**
 * DIMANGULAR, DIMARC, DIMRADIUS, DIMDIAMETER y DIMORDINATE.
 *
 * Cada una con su camino feliz Y su rechazo, porque una orden que se calla
 * cuando no puede hacer su trabajo es peor que una que no existe: el dibujante
 * no sabe si falló él o el programa.
 *
 * La prueba de asociatividad que más dice es la de DIMARC: se acota un arco de
 * radio 1.000 y 90° —1.570,80 de longitud—, se le cambia el radio a 2.000 por la
 * ruta canónica y la cota tiene que decir 3.141,59. Si el radio de la cota no se
 * re-derivara al regenerar, el barrido cambiaría y la longitud se quedaría en el
 * número viejo sin que nada avisara.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

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
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `cota${++ids}`,
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

function dimensionOf(result: CadCommandResult | undefined): CadDimensionEntity {
  const command = commandsOf(result).find(
    (item) => item.type === "insert" && item.entity.type === "dimension",
  );
  assert.ok(command?.type === "insert", "debía insertar una cota");
  if (command?.type !== "insert" || command.entity.type !== "dimension") throw new Error("tipo");
  checks += 1;
  return command.entity;
}

const label = (entity: CadDimensionEntity): string => buildCadDimensionGeometry(entity)?.label ?? "";
const measurement = (entity: CadDimensionEntity): number =>
  buildCadDimensionGeometry(entity)?.measurement ?? Number.NaN;

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const pick = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});

const corner = (): CadEntity[] => [
  { id: "h", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
  { id: "v", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 1_000, z: 0 }, layer },
];

// --- alias -----------------------------------------------------------------------------
{
  for (const [alias, canonical] of [
    ["DAN", "DIMANGULAR"],
    ["DAR", "DIMARC"],
    ["DRA", "DIMRADIUS"],
    ["DDI", "DIMDIAMETER"],
    ["DOR", "DIMORDINATE"],
  ] as const)
    eq(CAD_COMMAND_REGISTRY_V2.get(alias)?.name, canonical, `${alias} → ${canonical}`);
}

// --- DIMANGULAR con dos rectas ------------------------------------------------------------
{
  const doc = document(corner());
  const entity = dimensionOf(
    run("DIMANGULAR", [pick("h", 900, 0), pick("v", 0, 900), point(300, 300)], doc),
  );
  eq(entity.dimensionKind, "angular", "cota angular");
  eq(entity.a, { x: 0, y: 0 }, "el vértice es la intersección de las dos rectas");
  eq(entity.b, { x: 1_000, y: 0 }, "el lado sale del extremo más cercano al punto pinchado");
  eq(entity.c, { x: 0, y: 1_000 }, "y el otro igual");
  close(measurement(entity), 90, "mide 90°");
  eq(label(entity), "90.00°", "y la etiqueta lleva el símbolo de grado, no unidades de longitud");
  // El radio es la distancia del vértice al punto donde se soltó el arco.
  close(entity.radius ?? 0, Math.hypot(300, 300), "radio del arco de cota");
  // NO asociativa, y a conciencia: el vértice es una intersección y el
  // vocabulario de anclajes del esquema no la sabe expresar.
  eq(entity.associative, undefined, "la forma de dos rectas nace suelta, sin fingir");
}

// --- DIMANGULAR: pinchar por el otro lado mide el suplementario ----------------------------
{
  const doc = document([
    { id: "h", type: "line", start: { x: -1_000, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
    { id: "v", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 1_000, z: 0 }, layer },
  ]);
  const right = dimensionOf(run("DIMANGULAR", [pick("h", 900, 0), pick("v", 0, 900), point(300, 300)], doc));
  close(measurement(right), 90, "pinchando la horizontal por la derecha: 90°");
  const left = dimensionOf(run("DIMANGULAR", [pick("v", 0, 900), pick("h", -900, 0), point(-300, 300)], doc));
  close(measurement(left), 90, "de la vertical a la izquierda, en sentido antihorario: 90°");
  const wide = dimensionOf(run("DIMANGULAR", [pick("h", -900, 0), pick("v", 0, 900), point(-300, 300)], doc));
  close(measurement(wide), 270, "y del lado izquierdo a la vertical, el ángulo largo: 270°");
}

// --- DIMANGULAR: rechazo con motivo sobre dos paralelas -------------------------------------
{
  const doc = document([
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
    { id: "b", type: "line", start: { x: 0, y: 500, z: 0 }, end: { x: 1_000, y: 500, z: 0 }, layer },
  ]);
  const result = run("DIMANGULAR", [pick("a", 500, 0), pick("b", 500, 500)], doc);
  eq(result?.kind, "message", "dos paralelas no forman ángulo");
  ok(
    result?.kind === "message" && result.text.includes("paralelas"),
    "y lo DICE, en vez de dibujar una cota invisible",
  );
  ok(
    result?.kind === "message" && result.text.includes("DIMLINEAR"),
    "y propone la orden que sí sirve",
  );
}

// --- DIMANGULAR por vértice y dos extremos: SÍ se engancha -------------------------------------
{
  const doc = document(corner());
  const entity = dimensionOf(
    run("DIMANGULAR", [point(0, 0), point(1_000, 0), point(0, 1_000), point(300, 300)], doc),
  );
  close(measurement(entity), 90, "mismos 90°");
  eq(entity.associative, true, "los tres puntos cayeron sobre anclajes");
  eq(entity.references?.length, 3, "y hacen falta tres para regenerar un ángulo");
}

// --- DIMARC: mide el arco, y sigue al arco -------------------------------------------------------
{
  const arc: CadEntity = {
    id: "a1",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 1_000,
    startAngle: 0,
    endAngle: 90,
    layer,
  };
  const doc = document([arc]);
  const commands = commandsOf(run("DIMARC", [pick("a1", 707, 707)], doc));
  const entity = dimensionOf(run("DIMARC", [pick("a1", 707, 707)], doc));
  eq(entity.dimensionKind, "arc-length", "longitud de arco");
  close(measurement(entity), (Math.PI / 2) * 1_000, "1.000 × π/2");
  eq(label(entity), "1570.80 mm", "la longitud del ARCO, no la de la cuerda (1.414,21)");
  eq(entity.associative, true, "centro, arranque y final del arco son los tres anclajes");

  // Y ahora la propiedad: se le cambia el radio al ARCO y la cota se entera.
  const created = executeCadEntityCommandBatch(doc, commands, "DIMARC").document;
  const grown = executeCadEntityCommandBatch(
    created,
    [{ type: "properties", entityId: "a1", patch: { radius: 2_000 } }],
    "PROPERTIES",
  ).document;
  const after = grown.entities.find((item) => item.type === "dimension") as CadDimensionEntity;
  close(after.radius ?? 0, 2_000, "el radio de la cota se re-derivó de sus puntos de definición");
  eq(label(after), "3141.59 mm", "y la longitud de arco es exactamente el doble");
}

// --- DIMARC: rechazos ------------------------------------------------------------------------------
{
  const doc = document([
    { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 500, layer },
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer },
  ]);
  const circle = run("DIMARC", [pick("c1", 500, 0)], doc);
  eq(circle?.kind, "message", "un círculo completo no tiene longitud de arco");
  ok(
    circle?.kind === "message" && circle.text.includes("DIMDIAMETER"),
    "y se propone la orden correcta",
  );
  const line = run("DIMARC", [pick("l1", 5, 0)], doc);
  ok(line?.kind === "message" && line.text.includes("LINE"), "y sobre una LINE se nombra el tipo");
}

// --- DIMRADIUS y DIMDIAMETER ---------------------------------------------------------------------------
{
  const doc = document([{ id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 500, layer }]);
  const radius = dimensionOf(run("DIMRADIUS", [pick("c1", 500, 0)], doc));
  eq(radius.dimensionKind, "radius", "radio");
  close(measurement(radius), 500, "mide el radio");
  eq(label(radius), "R500.00 mm", "con su prefijo R");
  eq(radius.associative, true, "asociativa: centro y borde son anclajes del círculo");

  const diameter = dimensionOf(run("DIMDIAMETER", [pick("c1", 500, 0)], doc));
  close(measurement(diameter), 1_000, "el diámetro es el doble");
  eq(label(diameter), "Ø1000.00 mm", "con su prefijo Ø");

  // Por dónde se pincha decide por dónde sale la flecha: `arc-end` está a 180°.
  const otherSide = dimensionOf(run("DIMRADIUS", [pick("c1", -500, 0)], doc));
  close(otherSide.b.x, -500, "pinchando a la izquierda, la flecha sale por la izquierda");
  close(otherSide.b.y, 0, "sobre el eje", 1e-9);
  eq(otherSide.references?.[1]?.anchor, "arc-end", "y se cuelga del anclaje de ese lado");

  const refused = run("DIMRADIUS", [pick("nada", 0, 0)], doc);
  eq(refused?.kind, "message", "designar algo que no existe se rechaza");
}

// --- DIMORDINATE -------------------------------------------------------------------------------------------
{
  const doc = document([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
  ]);
  const entity = dimensionOf(run("DIMORDINATE", [point(0, 0), point(1_000, 0), point(1_000, 500)], doc));
  eq(entity.dimensionKind, "ordinate", "cota de coordenada");
  eq(entity.axis, "x", "directriz vertical → se acota la X");
  eq(entity.c, { x: 1_000, y: 500 }, "el codo cae donde se soltó la directriz");
  close(measurement(entity), 1_000, "la X del punto respecto del datum");
  eq(entity.associative, true, "datum y punto cayeron sobre los extremos de la línea");

  const sideways = dimensionOf(run("DIMORDINATE", [point(0, 0), point(1_000, 0), point(1_600, 0)], doc));
  eq(sideways.axis, "y", "directriz horizontal → se acota la Y");
  close(measurement(sideways), 0, "y la Y de ese punto es 0 respecto del datum");
}

console.log(
  `annotate-dimensions-angular: ${checks} comprobaciones · DIMANGULAR (dos rectas y tres puntos, ` +
    "con rechazo de paralelas), DIMARC que sigue al arco (1570,80 → 3141,59), DIMRADIUS/DIMDIAMETER " +
    "asociativas por el lado pinchado y DIMORDINATE con el eje deducido de la directriz",
);
