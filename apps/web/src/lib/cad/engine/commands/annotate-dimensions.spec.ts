/**
 * DIMLINEAR y DIMALIGNED, y la propiedad que las hace útiles: la
 * ASOCIATIVIDAD.
 *
 * Una propiedad de ida y vuelta se cumple de forma VACÍA si el código nunca toca
 * el campo, así que aquí no se afirma «la cota cambió»: se afirma QUÉ NÚMERO
 * sale. Se acota una línea de 1.000, se estira su extremo a 1.500 por la ruta
 * canónica y se comprueba que la etiqueta pasa a decir 1500,00 mm. Con un
 * «cambió», una implementación que redondeara mal pasaría igual.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import {
  buildCadDimensionGeometry,
  type CadDimensionEntity,
} from "../../associative-dimension";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_ENTITY_REGISTRY } from "../../entity-runtime";
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

function document(entities: CadEntity[] = []): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Cotas", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

const horizontalLine = (id = "l1", x2 = 1_000): CadEntity => ({
  id,
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: x2, y: 0, z: 0 },
  layer,
});

function makeContext(doc: CadDocument, selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `cota${++ids}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc = document(),
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(doc, selection);
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

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const pick = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const enter: CadCommandInput = { kind: "enter" };

// --- alias ------------------------------------------------------------------------
{
  eq(CAD_COMMAND_REGISTRY_V2.get("DLI")?.name, "DIMLINEAR", "DLI → DIMLINEAR");
  eq(CAD_COMMAND_REGISTRY_V2.get("DAL")?.name, "DIMALIGNED", "DAL → DIMALIGNED");
}

// --- DIMLINEAR sobre coordenadas tecleadas, con anclas absolutas -------------------
{
  const doc = document([horizontalLine()]);
  const entity = dimensionOf(run("DIMLINEAR", [point(0, 0), point(1_000, 0), point(500, 400)], doc));
  eq(entity.dimensionKind, "linear", "cota lineal");
  eq(entity.axis, "x", "soltar la línea ARRIBA mide la distancia horizontal");
  eq(entity.a, { x: 0, y: 0 }, "primer origen");
  eq(entity.b, { x: 1_000, y: 0 }, "segundo origen");
  // `linearDimension` mide el desfase desde el extremo MAYOR del eje
  // perpendicular: 400 − max(0, 0) = 400. Si se calculara desde el punto medio o
  // desde el primer punto, la línea de cota no caería donde se soltó.
  eq(entity.offset, 400, "el desfase deja la línea exactamente donde se soltó");
  close(measurement(entity), 1_000, "mide 1.000");
  eq(label(entity), "1000.00 mm", "y su etiqueta lo dice, con dos decimales");

  // Y se enganchó SOLA a la línea, porque las coordenadas tecleadas caen sobre
  // sus extremos. Sin esto, acotar por teclado daría cotas muertas.
  eq(entity.associative, true, "asociativa");
  eq(
    entity.references,
    [
      { entityId: "l1", anchor: "start" },
      { entityId: "l1", anchor: "end" },
    ],
    "colgada de los dos extremos de la línea",
  );
}

// --- la propiedad que importa: estirar la pieza CAMBIA el número -------------------
{
  const doc = document([horizontalLine()]);
  const created = executeCadEntityCommandBatch(
    doc,
    commandsOf(run("DIMLINEAR", [point(0, 0), point(1_000, 0), point(500, 400)], doc)),
    "DIMLINEAR",
  ).document;
  const before = created.entities.find((entity) => entity.type === "dimension") as CadDimensionEntity;
  eq(label(before), "1000.00 mm", "antes de estirar");

  // Se estira el extremo de la LÍNEA por la ruta canónica. Nadie toca la cota.
  const stretched = executeCadEntityCommandBatch(
    created,
    [{ type: "grip", entityId: "l1", gripId: "end", point: { x: 1_500, y: 0 } }],
    "STRETCH",
  );
  const after = stretched.document.entities.find(
    (entity) => entity.type === "dimension",
  ) as CadDimensionEntity;
  eq(after.b, { x: 1_500, y: 0 }, "el punto de definición siguió al extremo");
  close(measurement(after), 1_500, "la medida se recalculó");
  eq(label(after), "1500.00 mm", "y el TEXTO de la cota dice el número nuevo");
  eq(after.associationStatus, "associated", "sigue asociada");
  ok(
    stretched.affectedEntityIds.includes(after.id),
    "y el lote declara que la cota cambió, para que el editor la repinte",
  );
}

// --- un punto que NO cae sobre nada da una cota honestamente suelta -----------------
{
  const doc = document([horizontalLine()]);
  const entity = dimensionOf(run("DIMLINEAR", [point(0, 0), point(1_000, 7), point(500, 400)], doc));
  eq(entity.associative, undefined, "sin los dos anclajes, NO se marca asociativa");
  eq(entity.references, undefined, "y no se cuelgan referencias a medias");
}

// --- designar el objeto entero -------------------------------------------------------
{
  const doc = document([horizontalLine()]);
  // Enter en el primer paso = «designar objeto», el gesto de AutoCAD.
  const entity = dimensionOf(run("DIMLINEAR", [enter, pick("l1", 500, 0), point(500, -300)], doc));
  eq(entity.a, { x: 0, y: 0 }, "extremo inicial del objeto");
  eq(entity.b, { x: 1_000, y: 0 }, "extremo final");
  eq(entity.associative, true, "designar el objeto siempre da una cota asociativa");
  eq(entity.offset, -300, "soltada por debajo, el desfase es negativo");
}

// --- horizontal y vertical se pueden forzar ---------------------------------------------
{
  const doc = document([
    { id: "d1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 600, y: 800, z: 0 }, layer },
  ]);
  const auto = dimensionOf(run("DIMLINEAR", [point(0, 0), point(600, 800), point(300, 2_000)], doc));
  eq(auto.axis, "x", "soltada arriba: horizontal");
  const forced = dimensionOf(
    run("DIMLINEAR", [point(0, 0), point(600, 800), keyword("Vertical"), point(300, 2_000)], doc),
  );
  eq(forced.axis, "y", "la opción manda sobre el gesto");
  close(measurement(forced), 800, "y mide la proyección vertical");
}

// --- rechazo razonado: una proyección nula no es una cota ------------------------------------
{
  const doc = document([
    { id: "v1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 900, z: 0 }, layer },
  ]);
  // Dos puntos con la misma X, forzando horizontal: no hay nada que medir.
  const result = run("DIMLINEAR", [point(0, 0), point(0, 900), keyword("Horizontal"), point(400, 450)], doc);
  eq(result?.kind, "message", "se niega en vez de escribir una cota invisible");
  ok(
    result?.kind === "message" && result.text.includes("DIMALIGNED"),
    "y propone la salida, en vez de dejar al dibujante mirando la pantalla",
  );
}

// --- DIMALIGNED mide la distancia REAL ------------------------------------------------------
{
  const doc = document([
    { id: "d2", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 300, y: 400, z: 0 }, layer },
  ]);
  const entity = dimensionOf(run("DIMALIGNED", [point(0, 0), point(300, 400), point(-80, 60)], doc));
  eq(entity.dimensionKind, "aligned", "cota alineada");
  close(measurement(entity), 500, "3-4-5: mide 500, no la proyección");
  // Desfase = proyección sobre la normal (−dir.y, dir.x) = (−0,8; 0,6).
  // (−80, 60) · (−0,8; 0,6) = 64 + 36 = 100.
  close(entity.offset ?? 0, 100, "desfase con signo, exacto");
  eq(entity.associative, true, "asociativa por coincidencia de anclajes");
}

// --- REFLEXIÓN: el texto NO se invierte; el lado del que sale la cota SÍ ------------------------
{
  const doc = document([
    { id: "d3", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 300, y: 400, z: 0 }, layer },
  ]);
  const original = dimensionOf(run("DIMALIGNED", [point(0, 0), point(300, 400), point(-80, 60)], doc));
  const adapter = CAD_ENTITY_REGISTRY.adapter(original);
  const mirrored = adapter.commands.transform(original, {
    mirror: { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } },
  }) as CadDimensionEntity;

  // La medida de una longitud es una MAGNITUD: espejar una pieza no la encoge.
  close(measurement(mirrored), 500, "sigue midiendo 500 tras el espejo");
  eq(label(mirrored), label(original), "y la etiqueta es LA MISMA cadena, sin signo ni vuelta");

  // El ángulo del texto sí cambia —el tramo ahora baja en vez de subir— y sigue
  // siendo legible: `readableAngle` lo mantiene en (−90, 90].
  const angleBefore = buildCadDimensionGeometry(original)!.textAngle;
  const angleAfter = buildCadDimensionGeometry(mirrored)!.textAngle;
  close(angleBefore, 53.13010235415598, "ángulo original, exacto");
  close(angleAfter, -53.13010235415598, "espejado: el mismo ángulo, del otro lado");
  ok(angleAfter > -90 && angleAfter <= 90, "y nunca queda de cabeza");

  // Y el desfase INVIERTE su signo. Una reflexión cambia la mano del par
  // (dirección, normal), así que conservar el signo mandaba la línea de cota al
  // otro lado de la pieza: el número decía la verdad y el dibujo estaba mal.
  close(mirrored.offset ?? 0, -100, "el desfase alineado se invierte bajo reflexión");
  const dimLineBefore = buildCadDimensionGeometry(original)!.paths[0].points[0];
  const dimLineAfter = buildCadDimensionGeometry(mirrored)!.paths[0].points[0];
  close(dimLineAfter.x, dimLineBefore.x, "la línea de cota cae en el sitio espejado (x)");
  close(dimLineAfter.y, -dimLineBefore.y, "y en el espejado (y), no en el opuesto");
}

console.log(
  `annotate-dimensions: ${checks} comprobaciones · DIMLINEAR/DIMALIGNED en el registro del producto, ` +
    "asociativas por coincidencia de anclaje (1000 → 1500 al estirar), rechazo de proyección nula " +
    "y reflexión con anclas absolutas de ángulo y desfase",
);
