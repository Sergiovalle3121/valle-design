/**
 * DIMBASELINE, DIMCONTINUE, DIM y DIMEDIT.
 *
 * Lo que aquí se prueba y no se puede probar en ningún otro sitio: que
 * encadenar usa el ESTADO DE SESIÓN —`context.session.lastDimensionId`— y no un
 * módulo global ni un campo del documento, y que cuando no hay cota anterior las
 * dos órdenes PIDEN la base en vez de fallar.
 *
 * Y la diferencia que las separa, con números exactos: la cadena continua deja
 * todos los eslabones en la MISMA línea de cota, y la de línea base los SEPARA un
 * escalón cada uno. Sin ese escalón se dibujarían encima y la orden no serviría.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandResult,
  CadCommandSession,
} from "../command-types";

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
  extra: { session?: CadCommandSession; selection?: readonly string[] } = {},
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection: extra.selection ?? [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nueva${++ids}`,
    ...(extra.session ? { session: extra.session } : {}),
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

function dimensionsOf(result: CadCommandResult | undefined): CadDimensionEntity[] {
  return commandsOf(result).flatMap((command) =>
    command.type === "insert" && command.entity.type === "dimension" ? [command.entity] : [],
  );
}

const measurement = (entity: CadDimensionEntity): number =>
  buildCadDimensionGeometry(entity)?.measurement ?? Number.NaN;

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const pick = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const enter: CadCommandInput = { kind: "enter" };

/** Una cota lineal ya puesta sobre el tramo 0 → 1.000, a 400 de altura. */
const base: CadDimensionEntity = {
  id: "base",
  type: "dimension",
  a: { x: 0, y: 0 },
  b: { x: 1_000, y: 0 },
  dimensionKind: "linear",
  axis: "x",
  offset: 400,
  associative: true,
  associationStatus: "associated",
  references: [
    { entityId: "l1", anchor: "start" },
    { entityId: "l1", anchor: "end" },
  ],
  layer,
};

const scene = (): CadDocument =>
  document([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
    { id: "l2", type: "line", start: { x: 1_000, y: 0, z: 0 }, end: { x: 1_800, y: 0, z: 0 }, layer },
    base,
  ]);

// --- alias ---------------------------------------------------------------------------
{
  eq(CAD_COMMAND_REGISTRY_V2.get("DBA")?.name, "DIMBASELINE", "DBA → DIMBASELINE");
  eq(CAD_COMMAND_REGISTRY_V2.get("DCO")?.name, "DIMCONTINUE", "DCO → DIMCONTINUE");
  eq(CAD_COMMAND_REGISTRY_V2.get("DED")?.name, "DIMEDIT", "DED → DIMEDIT");
}

// --- DIMCONTINUE arranca de la sesión, sin preguntar -----------------------------------
{
  const doc = scene();
  const created = dimensionsOf(
    run("DIMCONTINUE", [point(1_800, 0), enter], doc, { session: { lastDimensionId: "base" } }),
  );
  eq(created.length, 1, "un eslabón");
  eq(created[0].a, { x: 1_000, y: 0 }, "arranca donde acabó la anterior");
  eq(created[0].b, { x: 1_800, y: 0 }, "y llega al punto nuevo");
  close(measurement(created[0]), 800, "mide 800");
  eq(created[0].offset, 400, "MISMO desfase: la cadena continua queda en una sola línea");
  // Heredó la referencia del extremo de la cota base y enganchó el punto nuevo
  // por coincidencia con el final de `l2`.
  eq(
    created[0].references,
    [
      { entityId: "l1", anchor: "end" },
      { entityId: "l2", anchor: "end" },
    ],
    "asociativa por los dos lados",
  );
}

// --- DIMBASELINE arranca siempre del mismo origen y SEPARA cada eslabón -------------------
{
  const doc = scene();
  const created = dimensionsOf(
    run("DIMBASELINE", [point(1_800, 0), point(1_000, 0), enter], doc, {
      session: { lastDimensionId: "base" },
    }),
  );
  eq(created.length, 2, "dos eslabones en UN solo lote: un paso de deshacer");
  eq(created[0].a, { x: 0, y: 0 }, "el primero arranca del origen de la base");
  eq(created[1].a, { x: 0, y: 0 }, "y el segundo también: eso es una cadena de línea base");
  close(measurement(created[0]), 1_800, "1.800");
  close(measurement(created[1]), 1_000, "y 1.000");
  // El escalón es 2 × el tamaño de flecha por defecto (180) = 360.
  eq(created[0].offset, 760, "primer eslabón: 400 + 360");
  eq(created[1].offset, 1_120, "segundo: 400 + 720, para que no se dibujen encima");
}

// --- sin cota en la sesión, se PIDE la base ---------------------------------------------------
{
  const doc = scene();
  const asked = run("DIMCONTINUE", [pick("base", 500, 400), point(1_800, 0), enter], doc);
  const created = dimensionsOf(asked);
  eq(created.length, 1, "designando la base a mano, funciona igual");
  eq(created[0].a, { x: 1_000, y: 0 }, "y encadena desde su extremo");

  // Y una sesión que apunta a una cota BORRADA no rompe: se vuelve a pedir.
  const stale = run("DIMCONTINUE", [pick("base", 500, 400), point(1_800, 0), enter], doc, {
    session: { lastDimensionId: "ya-no-existe" },
  });
  eq(dimensionsOf(stale).length, 1, "una referencia de sesión caducada se ignora sin más");
}

// --- rechazos con motivo ------------------------------------------------------------------------
{
  const doc = scene();
  const notADimension = run("DIMCONTINUE", [pick("l1", 500, 0)], doc);
  eq(notADimension?.kind, "message", "no se encadena desde una línea");
  ok(
    notADimension?.kind === "message" && notADimension.text.includes("LINE"),
    "y el mensaje NOMBRA el tipo designado",
  );

  const radial = document([
    { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 500, layer },
    {
      id: "r1",
      type: "dimension",
      a: { x: 0, y: 0 },
      b: { x: 500, y: 0 },
      dimensionKind: "radius",
      radius: 500,
      layer,
    },
  ]);
  const fromRadius = run("DIMBASELINE", [pick("r1", 250, 0)], radial);
  eq(fromRadius?.kind, "message", "encadenar desde una cota de radio no significa nada");
  ok(
    fromRadius?.kind === "message" && fromRadius.text.includes("radius"),
    "y se dice de qué tipo era",
  );

  // Un punto que no añade proyección: la cota mediría cero.
  const flat = run("DIMCONTINUE", [point(1_000, 0), enter], scene(), {
    session: { lastDimensionId: "base" },
  });
  eq(flat?.kind, "message", "se niega en vez de escribir una cota de longitud cero");
}

// --- la cadena entera es UN paso de deshacer ---------------------------------------------------------
{
  const doc = scene();
  const commands = commandsOf(
    run("DIMBASELINE", [point(1_800, 0), point(1_400, 0), point(1_200, 0), enter], doc, {
      session: { lastDimensionId: "base" },
    }),
  );
  eq(commands.length, 3, "tres cotas");
  const applied = executeCadEntityCommandBatch(doc, commands, "DIMBASELINE");
  eq(applied.document.meta.version, 2, "y UNA sola entrada de historia");
  eq(applied.createdEntityIds.length, 3, "las tres nacieron en el mismo lote");
}

// --- DIM: elige el tipo de cota según lo designado ------------------------------------------------------
{
  const doc = document([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 300, y: 400, z: 0 }, layer },
    { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 500, layer },
    { id: "a1", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 250, startAngle: 0, endAngle: 90, layer },
    { id: "t1", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "X", layer },
  ]);
  const online = dimensionsOf(run("DIM", [pick("l1", 150, 200), point(-80, 60)], doc));
  eq(online[0].dimensionKind, "aligned", "sobre una línea, cota alineada");
  close(measurement(online[0]), 500, "que mide su longitud real");

  const onCircle = dimensionsOf(run("DIM", [pick("c1", 500, 0)], doc));
  eq(onCircle[0].dimensionKind, "diameter", "sobre un círculo, diámetro; y sin segundo paso");

  const onArc = dimensionsOf(run("DIM", [pick("a1", 250, 0)], doc));
  eq(onArc[0].dimensionKind, "radius", "sobre un arco, radio");

  const refused = run("DIM", [pick("t1", 0, 0)], doc);
  eq(refused?.kind, "message", "sobre un MTEXT no hay nada que acotar");
  ok(refused?.kind === "message" && refused.text.includes("MTEXT"), "y se nombra el tipo");
}

// --- DIMEDIT ------------------------------------------------------------------------------------------------
{
  const doc = document([
    { ...base, id: "d1" },
    { ...base, id: "d2", textPosition: { x: 500, y: 900 } },
  ]);

  const renamed = commandsOf(
    run("DIMEDIT", [keyword("Nuevo"), text("VER DETALLE 3"), pick("d1", 500, 400), enter], doc),
  );
  eq(
    renamed,
    [{ type: "properties", entityId: "d1", patch: { textOverride: "VER DETALLE 3" } }],
    "«Nuevo» escribe la sobrescritura del texto",
  );

  // «Inicio» devuelve el texto a su sitio derivado. `properties.write` no sabe
  // BORRAR un campo, así que se sustituye la entidad conservando su id.
  const homed = commandsOf(run("DIMEDIT", [keyword("Inicio"), pick("d2", 500, 900), enter], doc));
  eq(homed.length, 1, "un comando");
  eq(homed[0].type, "replace", "sustitución, no escritura de propiedad");
  ok(
    homed[0].type === "replace" && !("textPosition" in homed[0].entity),
    "y la entidad resultante ya no lleva `textPosition`",
  );
  const applied = executeCadEntityCommandBatch(doc, homed, "DIMEDIT");
  const restored = applied.document.entities.find((entity) => entity.id === "d2");
  eq(
    restored?.type === "dimension" ? restored.textPosition : "sigue",
    undefined,
    "y el documento lo confirma",
  );

  // Una cota que ya tenía el texto en su sitio no genera trabajo.
  const nothing = run("DIMEDIT", [keyword("Inicio"), pick("d1", 500, 400), enter], doc);
  eq(nothing?.kind, "message", "no se ensucia la historia con un paso de deshacer vacío");

  // Y lo que NO se puede hacer, se dice.
  const rotate = run("DIMEDIT", [keyword("Girar")], doc);
  eq(rotate?.kind, "message", "«Girar» se rechaza");
  ok(
    rotate?.kind === "message" && rotate.text.includes("esquema canónico"),
    "explicando que el esquema no guarda ese ángulo, en vez de fingir que se aplicó",
  );
}

console.log(
  `annotate-dimension-chains: ${checks} comprobaciones · DIMCONTINUE conserva el desfase y ` +
    "DIMBASELINE lo escalona 360 por eslabón, ambas leen `context.session` y piden la base cuando no " +
    "la hay; DIM elige el tipo por lo designado y DIMEDIT dice lo que no puede hacer",
);
