/**
 * Las órdenes del esquema 4: POINT, DIVIDE, MEASURE, XLINE, RAY, SOLID,
 * WIPEOUT, IMAGE, ATTDEF y TABLE.
 *
 * Además de la geometría de cada una, esta spec comprueba la DEFINICIÓN DE
 * TERMINADO completa: se teclea la orden, se aplica su lote por la única ruta
 * de mutación (`executeCadEntityCommandBatch`), se serializa el documento, se
 * vuelve a abrir y la geometría sigue ahí. Una orden que emite entidades
 * bonitas y no sobrevive al guardado no ha hecho nada.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../cad-document-shared";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { bisectorDirection } from "./draw-construction";
import { normalizeAttributeTag } from "./draw-annotation-v4";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const layer = "MUROS";

function emptyDocument(entities: CadEntity[] = []): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(document: CadDocument): CadCommandContext {
  let ids = 0;
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[], document = emptyDocument()) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(document);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function commandsOf(result: ReturnType<typeof run>): readonly CadEntityCommand[] {
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}`);
  if (result.kind !== "document") throw new Error("tipo");
  return result.commands;
}

function inserted(result: ReturnType<typeof run>) {
  const command = commandsOf(result).find((item) => item.type === "insert");
  assert.ok(command && command.type === "insert", "debía insertar una entidad");
  if (command.type !== "insert") throw new Error("tipo");
  return command.entity;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const ENTER: CadCommandInput = { kind: "enter" };

const near = (actual: number, expected: number, what: string, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

// --- POINT --------------------------------------------------------------------
{
  const result = run("PO", [point(10, 20), point(30, 40), ENTER]);
  const commands = commandsOf(result);
  assert.equal(commands.length, 2, "dos puntos, un solo lote — un solo paso de deshacer");
  const first = inserted(result);
  if (first.type !== "point") throw new Error("tipo");
  near(first.position.x, 10, "posición");
  assert.equal(first.style, undefined, "el estilo por defecto NO se materializa");
  assert.equal(first.layer, layer);

  // DDPTYPE: estilo 35 = 3 (aspa) + 32 (círculo), tamaño 25.
  const styled = inserted(run("POINT", [keyword("Estilo"), distance(35), distance(25), point(0, 0), ENTER]));
  if (styled.type !== "point") throw new Error("tipo");
  assert.equal(styled.style, 35, "PDMODE se guarda tal cual");
  assert.equal(styled.size, 25);
}

// --- DIVIDE: N−1 marcas INTERIORES, repartidas por longitud de arco -----------
{
  const line: CadEntity = {
    id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 400, y: 0, z: 0 }, layer,
  };
  const document = emptyDocument([line]);
  const commands = commandsOf(run("DIV", [pick("l1"), distance(4)], document));
  // Cuatro tramos → TRES marcas. Colocar cuatro es el error clásico: la de más
  // cae en el extremo, en un sitio perfectamente creíble.
  assert.equal(commands.length, 3, "dividir en 4 deja 3 marcas interiores");
  const xs = commands.map((command) => {
    if (command.type !== "insert" || command.entity.type !== "point") throw new Error("tipo");
    return command.entity.position.x;
  });
  for (const [index, x] of xs.entries()) near(x, 100 * (index + 1), `marca ${index}`, 1e-3);

  // Sobre un ARCO se reparte por longitud de arco real, no entre vértices: las
  // marcas equidistan sobre la curva.
  const arc: CadEntity = {
    id: "a1", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 100,
    startAngle: 0, endAngle: 180, layer,
  };
  const arcMarks = commandsOf(run("DIVIDE", [pick("a1"), distance(2)], emptyDocument([arc])));
  assert.equal(arcMarks.length, 1);
  const mark = arcMarks[0];
  if (mark.type !== "insert" || mark.entity.type !== "point") throw new Error("tipo");
  near(mark.entity.position.x, 0, "la mitad de un semicírculo está arriba, no en la cuerda", 1e-2);
  near(mark.entity.position.y, 100, "a un radio del centro", 1e-2);

  // Menos de dos partes no divide nada: rechazo explícito.
  assert.equal(run("DIVIDE", [pick("l1"), distance(1)], document)?.kind, "message");
  // La opción Bloque se rechaza diciéndolo, no se ignora.
  const blocked = run("DIVIDE", [pick("l1"), keyword("Bloque")], document);
  assert.equal(blocked?.kind, "message");
  assert.ok(blocked.kind === "message" && /PUNTO/.test(blocked.text), "y explica qué sí se admite");
}

// --- MEASURE: marcas cada N, sin marcar el origen -----------------------------
{
  const line: CadEntity = {
    id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 350, y: 0, z: 0 }, layer,
  };
  const commands = commandsOf(run("ME", [pick("l1"), distance(100)], emptyDocument([line])));
  // 100, 200, 300 — el origen NO se marca y el resto de 50 no da para otra.
  assert.equal(commands.length, 3, "no se marca el origen ni se completa el último tramo");
  const first = commands[0];
  if (first.type !== "insert" || first.entity.type !== "point") throw new Error("tipo");
  near(first.entity.position.x, 100, "la primera marca está a un intervalo del inicio", 1e-3);
}

// --- XLINE: Hor, Ver, Áng y Bisectriz ----------------------------------------
{
  const horizontal = inserted(run("XL", [keyword("Hor"), point(50, 60), ENTER]));
  if (horizontal.type !== "xline") throw new Error("tipo");
  near(horizontal.basePoint.x, 50, "punto base");
  near(horizontal.direction.x, 1, "dirección horizontal");
  near(horizontal.direction.y, 0, "sin componente vertical");

  const vertical = inserted(run("XLINE", [keyword("Ver"), point(0, 0), ENTER]));
  if (vertical.type !== "xline") throw new Error("tipo");
  near(vertical.direction.y, 1, "dirección vertical");

  const angled = inserted(run("XLINE", [keyword("Áng"), { kind: "angle", degrees: 30 }, point(0, 0), ENTER]));
  if (angled.type !== "xline") throw new Error("tipo");
  near(angled.direction.x, Math.cos(Math.PI / 6), "coseno de 30°");
  near(angled.direction.y, Math.sin(Math.PI / 6), "seno de 30°");

  // Bisectriz de un ángulo recto: 45°. Y la trampa: con lados de longitudes
  // muy distintas la bisectriz NO se inclina hacia el largo.
  const bisector = bisectorDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 1_000 })!;
  near(
    (Math.atan2(bisector.y, bisector.x) * 180) / Math.PI,
    45,
    "la bisectriz usa vectores UNITARIOS; con vectores crudos daría 84°",
    1e-9,
  );
  assert.equal(
    bisectorDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: -100, y: 0 }),
    null,
    "dos lados opuestos no tienen bisectriz única",
  );

  const bisected = inserted(
    run("XLINE", [keyword("Bisectriz"), point(0, 0), point(100, 0), point(0, 100)]),
  );
  if (bisected.type !== "xline") throw new Error("tipo");
  near((Math.atan2(bisected.direction.y, bisected.direction.x) * 180) / Math.PI, 45, "bisectriz a 45°");
}

// --- XLINE Desfase: paralela a una LÍNEA, del lado designado -----------------
{
  const line: CadEntity = {
    id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer,
  };
  const document = emptyDocument([line]);
  const above = inserted(run("XLINE", [keyword("Desfase"), distance(25), pick("l1"), point(50, 500)], document));
  if (above.type !== "xline") throw new Error("tipo");
  near(above.basePoint.y, 25, "el desfase cae del lado designado");
  const below = inserted(run("XLINE", [keyword("Desfase"), distance(25), pick("l1"), point(50, -500)], document));
  if (below.type !== "xline") throw new Error("tipo");
  near(below.basePoint.y, -25, "y del otro si se designa al otro lado");

  // Sin una recta de referencia válida, rechazo explícito.
  const badRef = emptyDocument([
    { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 10, layer },
  ]);
  assert.equal(
    run("XLINE", [keyword("Desfase"), distance(25), pick("c1"), point(0, 100)], badRef)?.kind,
    "message",
  );
}

// --- RAY ----------------------------------------------------------------------
{
  const ray = inserted(run("RAY", [point(0, 0), point(100, 100), ENTER]));
  if (ray.type !== "ray") throw new Error("tipo");
  near(ray.basePoint.x, 0, "nace en el primer punto");
  near(ray.direction.x, 100, "y apunta al segundo");
  near(ray.direction.y, 100, "en las dos componentes");
}

// --- SOLID: contorno natural, y máximo cuatro vértices -----------------------
{
  const quad = inserted(run("SOLID", [point(0, 0), point(100, 0), point(100, 100), point(0, 100)]));
  if (quad.type !== "solid") throw new Error("tipo");
  // Orden de CONTORNO, no el 1-2-4-3 en corbatín del DXF: el modelo no arrastra
  // la rareza del formato.
  assert.deepEqual(
    quad.points.map((item) => [item.x, item.y]),
    [[0, 0], [100, 0], [100, 100], [0, 100]],
  );
  const triangle = inserted(run("SOLID", [point(0, 0), point(100, 0), point(50, 80), ENTER]));
  if (triangle.type !== "solid") throw new Error("tipo");
  assert.equal(triangle.points.length, 3, "un triángulo es un SOLID válido");
  assert.equal(run("SOLID", [point(0, 0), point(100, 0), ENTER])?.kind, "none", "dos puntos no tienen área");
}

// --- WIPEOUT: nace AL FRENTE, o no taparía nada -------------------------------
{
  const result = run("WIPE", [point(0, 0), point(100, 0), point(100, 100), ENTER]);
  const command = commandsOf(result)[0];
  assert.ok(command.type === "insert" && command.entity.type === "wipeout");
  if (command.type !== "insert") throw new Error("tipo");
  assert.equal(command.drawOrder, "front", "un wipeout al fondo no ocultaría nada");
  if (command.entity.type !== "wipeout") throw new Error("tipo");
  assert.equal(command.entity.boundary.length, 3);
  assert.equal(command.entity.frame, true);

  const noFrame = run("WIPEOUT", [
    keyword("Marcos"), keyword("Desactivado"), point(0, 0), point(100, 0), point(100, 100), ENTER,
  ]);
  const framed = commandsOf(noFrame)[0];
  if (framed.type !== "insert" || framed.entity.type !== "wipeout") throw new Error("tipo");
  assert.equal(framed.entity.frame, false);
}

// --- IMAGE: exige un URI de asset y crea su DEFINICIÓN ------------------------
{
  const rejected = run("IMAGE", [text("C:/Users/ana/planta.png")]);
  assert.equal(rejected?.kind, "message", "una ruta local no se persiste");
  assert.ok(rejected.kind === "message" && /asset/.test(rejected.text));

  const result = run("IMAGE", [
    text("asset://tenant-1/planta.png"),
    point(0, 0),
    distance(4_000),
    distance(3_000),
  ]);
  const commands = commandsOf(result);
  assert.equal(commands.length, 2, "la definición y la inserción, en el MISMO lote");
  const definition = commands.find((command) => command.type === "image-definition");
  assert.ok(definition && definition.type === "image-definition");
  if (definition.type !== "image-definition") throw new Error("tipo");
  assert.equal(definition.definition.uri, "asset://tenant-1/planta.png");
  assert.equal(definition.definition.loaded, false, "el motor no puede abrir el archivo, y lo dice");

  const image = inserted(result);
  if (image.type !== "image") throw new Error("tipo");
  // `esquina = inserción + u·ancho + v·alto`, con size 1×1: los vectores miden
  // el rectángulo completo y el dibujo queda donde el usuario lo puso.
  near(image.uVector.x, 4_000, "U mide el ancho pedido");
  near(image.vVector.y, 3_000, "V mide el alto pedido");
  assert.equal(image.size.width, 1);
  const insertCommand = commands.find((command) => command.type === "insert");
  if (insertCommand?.type !== "insert") throw new Error("tipo");
  assert.equal(insertCommand.drawOrder, "back", "un calco va al fondo, no encima del dibujo");
}

// --- ATTDEF: la etiqueta es un identificador ---------------------------------
{
  assert.equal(normalizeAttributeTag("  código de pieza "), "CÓDIGO_DE_PIEZA");
  assert.equal(normalizeAttributeTag("   "), "", "una etiqueta en blanco no es etiqueta");

  const entity = inserted(
    run("ATT", [
      text("codigo pieza"),
      text("¿Código?"),
      text("P-01"),
      point(100, 200),
      distance(150),
      { kind: "angle", degrees: 30 },
    ]),
  );
  if (entity.type !== "attdef") throw new Error("tipo");
  assert.equal(entity.tag, "CODIGO_PIEZA", "sin espacios: es lo que resuelve un INSERT");
  assert.equal(entity.prompt, "¿Código?");
  assert.equal(entity.defaultValue, "P-01");
  near(entity.insertion.x, 100, "inserción");
  assert.equal(entity.height, 150);
  assert.equal(entity.rotation, 30);

  assert.equal(run("ATTDEF", [text("   ")])?.kind, "message", "y la vacía se rechaza diciéndolo");
}

// --- TABLE: rejilla vacía, y los límites se respetan -------------------------
{
  const entity = inserted(run("TB", [distance(4), distance(3), distance(200), distance(1_000), point(0, 5_000)]));
  if (entity.type !== "table") throw new Error("tipo");
  assert.equal(entity.rows, 4);
  assert.equal(entity.columns, 3);
  assert.deepEqual(entity.rowHeights, [200, 200, 200, 200]);
  assert.deepEqual(entity.columnWidths, [1_000, 1_000, 1_000]);
  assert.deepEqual(entity.cells, [], "la orden crea la rejilla; el contenido lo pone quien la rellena");
  near(entity.insertion.y, 5_000, "la inserción es la esquina SUPERIOR izquierda");

  assert.equal(run("TABLE", [distance(0)])?.kind, "message", "una tabla de cero filas no es una tabla");
  assert.equal(run("TABLE", [distance(3), distance(999)])?.kind, "message", "ni de 999 columnas");
}

// --- DEFINICIÓN DE TERMINADO: se dibuja, se guarda, se reabre y sigue ahí ----
{
  let document = emptyDocument();
  const draw = (name: string, inputs: readonly CadCommandInput[]) => {
    const descriptor = CAD_COMMAND_REGISTRY_V2.get(name)!;
    let ids = 0;
    const context: CadCommandContext = {
      entityIds: document.entities.map((entity) => entity.id),
      entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
      selection: [],
      activeLayer: layer,
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `${name.toLowerCase()}-${++ids}`,
    };
    let step = descriptor.begin(context);
    for (const input of inputs) {
      if (step.result) break;
      step = descriptor.step(step.state, input, context);
    }
    assert.ok(step.result?.kind === "document", `${name} debía producir documento`);
    if (step.result.kind !== "document") throw new Error("tipo");
    // La ÚNICA ruta de mutación: un lote, un `commitChange`, un paso de
    // deshacer. Nadie llama a `commitChange` por su cuenta.
    document = executeCadEntityCommandBatch(document, step.result.commands, step.result.label).document;
  };

  draw("POINT", [point(10, 10), ENTER]);
  draw("XLINE", [keyword("Hor"), point(0, 500), ENTER]);
  draw("RAY", [point(0, 0), point(1, 1), ENTER]);
  draw("SOLID", [point(0, 0), point(100, 0), point(50, 80), ENTER]);
  draw("WIPEOUT", [point(0, 0), point(100, 0), point(100, 100), ENTER]);
  draw("IMAGE", [text("asset://t/p.png"), point(0, 0), distance(400), distance(300)]);
  draw("ATTDEF", [text("CODIGO"), ENTER, ENTER, point(0, 0), ENTER, ENTER]);
  draw("TABLE", [distance(2), distance(2), distance(100), distance(400), point(0, 0)]);
  draw("SPLINE", [point(0, 0), point(100, 200), point(300, -100), ENTER]);
  draw("DONUT", [distance(50), distance(100), point(700, 700), ENTER]);
  draw("REVCLOUD", [point(2_000, 0), point(2_400, 400)]);
  draw("PLINE", [point(0, 0), keyword("Arco"), point(200, 200), ENTER]);
  draw("RECTANG", [keyword("Empalme"), distance(20), point(5_000, 0), point(5_400, 5_200)]);

  const reopened = parseCadDocument(serializeCadDocument(document));
  const byType = new Map<string, number>();
  for (const entity of reopened.entities) byType.set(entity.type, (byType.get(entity.type) ?? 0) + 1);
  for (const type of ["point", "xline", "ray", "solid", "wipeout", "image", "attdef", "table", "spline", "polyline"])
    assert.ok((byType.get(type) ?? 0) > 0, `${type} debía sobrevivir a guardar y reabrir`);
  assert.equal(reopened.imageDefinitions?.length, 1, "y la definición de imagen también");
  // La migración es aditiva: un documento escrito como v4 se reabre con el
  // esquema vigente sin perder un campo, y lo único que cambia es este número.
  assert.equal(reopened.meta.schema, CAD_DOCUMENT_SCHEMA);
  // Un paso de historia por ORDEN, no por entidad: trece órdenes, trece pasos.
  assert.equal(reopened.history.length, 13, "la frontera de deshacer es el comando");
  // El wipeout está por encima de lo que se dibujó antes que él; la imagen, por
  // debajo de todo. El z-order es contenido y sobrevive al viaje.
  const order = reopened.modelSpace.entityIds;
  const wipeout = reopened.entities.find((entity) => entity.type === "wipeout")!;
  const image = reopened.entities.find((entity) => entity.type === "image")!;
  const solid = reopened.entities.find((entity) => entity.type === "solid")!;
  assert.ok(order.indexOf(wipeout.id) > order.indexOf(solid.id), "el wipeout tapa lo anterior");
  assert.ok(order.indexOf(image.id) < order.indexOf(solid.id), "el calco queda debajo");
}

console.log(
  "órdenes del esquema 4: POINT/DIVIDE/MEASURE, XLINE (Hor/Ver/Áng/Bisectriz/Desfase), RAY, SOLID, " +
    "WIPEOUT, IMAGE, ATTDEF y TABLE verificadas — y trece órdenes dibujadas, guardadas y reabiertas " +
    "con su geometría, su catálogo de imágenes y su z-order intactos",
);
