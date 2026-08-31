/**
 * Los quince comandos de modelado de sólidos, tecleados de punta a punta.
 *
 * No basta con que cada comando emita un lote bonito: la definición de terminado
 * es que el lote pase por la ÚNICA ruta de mutación
 * (`executeCadEntityCommandBatch`), que el documento resultante se serialice, se
 * vuelva a abrir y que el sólido siga ahí — con su árbol de construcción y con
 * su volumen. Un EXTRUDE que produce una entidad preciosa y no sobrevive al
 * guardado no ha hecho nada, que es exactamente la situación de la que sale este
 * subsistema: un kernel entero construido y sin un solo consumidor.
 *
 * Los invariantes de `invariants.ts` se comprueban tras CADA operación dentro de
 * `finishedSolid`, así que un comando que produzca un cuerpo roto termina en
 * mensaje y no escribe. Aquí se verifica también eso: negarse es una función.
 */
import { strict as assert } from "node:assert";
import { eulerCounts, validateBody } from "../../../brep";
import {
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import {
  clearSolidCache,
  solid3dBody,
  solid3dMassProperties,
} from "../../solid3d-build";
import { CAD_INTEROP_EPOCH, exportSolidEntity, importSolidEntity } from "../../solid3d-interop";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

const layer = "MUROS";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

let idCounter = 0;

function makeContext(document: CadDocument, selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `s${++idCounter}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(document, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

/** Ejecuta el comando y APLICA su lote: la única ruta de mutación. */
function apply(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): CadDocument {
  const result = run(name, inputs, document, selection);
  assert.ok(result, `${name} no terminó`);
  assert.equal(result.kind, "document", `${name} debía escribir: ${result.kind === "message" ? result.text : result.kind}`);
  if (result.kind !== "document") throw new Error("tipo");
  return executeCadEntityCommandBatch(document, result.commands, result.label).document;
}

function messageOf(result: CadCommandResult | undefined): string {
  assert.ok(result && result.kind === "message", `debía responder con un mensaje, dio ${result?.kind}`);
  if (result.kind !== "message") throw new Error("tipo");
  return result.text;
}

function soleSolid(document: CadDocument) {
  const solids = document.entities.filter((entity) => entity.type === "solid3d");
  assert.equal(solids.length, 1, `se esperaba UN sólido y hay ${solids.length}`);
  const solid = solids[0];
  if (solid.type !== "solid3d") throw new Error("tipo");
  return solid;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const angle = (degrees: number): CadCommandInput => ({ kind: "angle", degrees });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const ENTER: CadCommandInput = { kind: "enter" };
const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });

const near = (actual: number, expected: number, what: string, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

/** Rectángulo cerrado como polilínea, que es lo que un usuario dibuja. */
function rectangle(id: string, x: number, y: number, w: number, h: number, z = 0): CadEntity {
  return {
    id,
    type: "polyline",
    vertices: [
      { x, y, z },
      { x: x + w, y, z },
      { x: x + w, y: y + h, z },
      { x, y: y + h, z },
    ],
    closed: true,
    layer,
  };
}

// --- REGION la aporta otra ola; aquí sólo se comprueba que ALIMENTA a EXTRUDE ---
//
// `REGION` vive en `inquiry-region.ts` y encadena bordes SUELTOS por sus
// extremos, cosa que esta rama no sabía hacer. Al fundir las dos olas se retiró
// la versión de aquí en vez de registrar un segundo comando con el mismo nombre.
// Lo que sí hay que demostrar es que su salida sirve de perfil: si no, «crear
// una región» y «extruirla» serían dos mundos que no se tocan.
{
  const document = documentWith([rectangle("rect", 0, 0, 400, 300)]);
  const afterRegion = apply("REGION", [select("rect"), ENTER], document, ["rect"]);
  const next = apply(
    "EXTRUDE",
    [select(afterRegion.entities[0].id), distance(200)],
    afterRegion,
    [afterRegion.entities[0].id],
  );
  near(solid3dMassProperties(soleSolid(next)).volume, 24_000_000, "volumen de lo extruido tras REGION", 1e-3);
}

// --- EXTRUDE ------------------------------------------------------------------
{
  const document = documentWith([rectangle("rect", 0, 0, 400, 300)]);
  const next = apply("EXTRUDE", [select("rect"), distance(200)], document, ["rect"]);
  const solid = soleSolid(next);
  near(solid3dMassProperties(solid).volume, 24_000_000, "volumen de la extrusión", 1e-3);
  assert.ok(!next.entities.some((entity) => entity.id === "rect"), "el perfil se consume");
  assert.equal(solid.nodes.length, 1, "el árbol tiene su único nodo");
  assert.equal(solid.nodes[0].op, "extrude");

  const counts = eulerCounts(solid3dBody(solid));
  assert.equal(counts.characteristic, 2, "χ = 2 tras EXTRUDE");
  assert.equal(counts.genus, 0);

  // Altura cero: se niega en vez de escribir un cuerpo degenerado.
  assert.match(
    messageOf(run("EXTRUDE", [select("rect"), distance(0)], document, ["rect"])),
    /altura distinta de cero/,
  );

  // Con inclinación, la sección crece con la altura y el volumen SUBE. El valor
  // no se calcula a ojo: es la regla de Simpson sobre el área desplazada, que es
  // exacta porque el área es cuadrática en el desplazamiento.
  const tapered = apply(
    "EXTRUDE",
    [select("rect"), keyword("Inclinación"), angle(10), distance(200)],
    document,
    ["rect"],
  );
  assert.ok(
    solid3dMassProperties(soleSolid(tapered)).volume > 24_000_000,
    "la extrusión con desmoldeo positivo encierra MÁS volumen",
  );
  const taperedNode = soleSolid(tapered).nodes[0];
  if (taperedNode.op !== "extrude") throw new Error("op");
  near((taperedNode.draftAngleRad ?? 0) * (180 / Math.PI), 10, "el ángulo se guarda en radianes");

  // Un desmoldeo imposible se rechaza hablando de GRADOS, que es lo que se tecleó.
  assert.match(
    messageOf(run("EXTRUDE", [select("rect"), keyword("Inclinación"), angle(120)], document, ["rect"])),
    /entre −90° y 90°/,
  );
}

// --- PRESSPULL ----------------------------------------------------------------
{
  const document = documentWith([rectangle("rect", 0, 0, 100, 100)]);
  const next = apply("PRESSPULL", [select("rect"), distance(50)], document, ["rect"]);
  near(solid3dMassProperties(soleSolid(next)).volume, 500_000, "volumen de PRESSPULL", 1e-3);
}

// --- REVOLVE ------------------------------------------------------------------
{
  // Rectángulo de 10 × 40 apoyado en x = 20: al girar 360° alrededor del eje Y
  // da un tubo. Volumen exacto del sólido FACETADO con N = 32:
  // (N/2)·sen(2π/N)·∮x²dy, que para un rectángulo [20,30]×[0,40] vale
  // (N/2)·sen(Δ)·(30² − 20²)·40 = 16·sen(π/16)·20000.
  const document = documentWith([rectangle("perfil", 20, 0, 10, 40)]);
  const next = apply("REVOLVE", [select("perfil"), point(0, 0), point(0, 10), ENTER], document, ["perfil"]);
  const solid = soleSolid(next);
  const expected = 16 * Math.sin(Math.PI / 16) * (30 * 30 - 20 * 20) * 40;
  near(solid3dMassProperties(solid).volume, expected, "volumen de la revolución facetada", 1e-3);
  assert.ok(
    validateBody(solid3dBody(solid), { requireClosed: true, requirePlanarFaces: true }).ok,
    "la revolución produce un sólido válido",
  );
  assert.equal(eulerCounts(solid3dBody(solid)).genus, 1, "un tubo tiene género 1");

  // Un perfil que CRUZA el eje se rechaza con su motivo, no con un error del
  // kernel sobre coordenadas que el usuario nunca ha visto.
  const crossing = documentWith([rectangle("cruza", -10, 0, 40, 20)]);
  assert.match(
    messageOf(run("REVOLVE", [select("cruza"), point(0, 0), point(0, 10), ENTER], crossing, ["cruza"])),
    /CRUZA el eje/,
  );
}

// --- SWEEP --------------------------------------------------------------------
{
  const document = documentWith([
    rectangle("seccion", 0, 0, 10, 10),
    { id: "guia", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 200, z: 0 }, layer },
  ]);
  const next = apply("SWEEP", [select("seccion", "guia"), ENTER], document, ["seccion", "guia"]);
  const solid = soleSolid(next);
  // Sección 10 × 10 barrida 200: 20 000. El perfil entra RECENTRADO, así que su
  // posición original no cambia el volumen — que es justo lo que se comprueba.
  near(solid3dMassProperties(solid).volume, 20_000, "volumen del barrido", 1e-3);
  assert.ok(!next.entities.some((entity) => entity.id === "guia"), "el camino se consume");

  assert.match(
    messageOf(run("SWEEP", [select("seccion"), ENTER], document, ["seccion"])),
    /recorrido/,
  );
}

// --- LOFT ---------------------------------------------------------------------
{
  const document = documentWith([
    rectangle("base", 0, 0, 100, 100, 0),
    rectangle("cima", 25, 25, 50, 50, 100),
  ]);
  // Se designan AL REVÉS a propósito: el comando ordena por cota, así que la
  // pieza no sale retorcida por haber pinchado primero la de arriba.
  const next = apply("LOFT", [select("cima", "base"), ENTER], document, ["cima", "base"]);
  const solid = soleSolid(next);
  const volume = solid3dMassProperties(solid).volume;
  // Un prismatoide entre 100² y 50² a 100 de altura: h/6·(A₁ + 4·Aₘ + A₂) con
  // Aₘ = 75² = 5625 ⇒ 100/6·(10000 + 22500 + 2500) = 583 333,33.
  near(volume, 583_333.3333333334, "volumen del solevado", 1);
  assert.ok(validateBody(solid3dBody(solid), { requireClosed: true }).ok, "el solevado es un sólido válido");

  const sameHeight = documentWith([rectangle("a", 0, 0, 10, 10, 5), rectangle("b", 0, 0, 20, 20, 5)]);
  assert.match(
    messageOf(run("LOFT", [select("a", "b"), ENTER], sameHeight, ["a", "b"])),
    /MISMA cota/,
  );
}

// --- UNION / SUBTRACT / INTERSECT ---------------------------------------------
{
  // Dos extrusiones INDEPENDIENTES: las dos traen un nodo llamado `perfil`. Si el
  // fundido de árboles no renombrara, uno pisaría al otro y la resta tomaría el
  // operando equivocado — con una pieza plausible y sin ningún error.
  let document = documentWith([rectangle("a", 0, 0, 100, 100), rectangle("b", 50, 50, 100, 100)]);
  document = apply("EXTRUDE", [select("a"), distance(10)], document, ["a"]);
  const firstId = soleSolid(document).id;
  document = apply("EXTRUDE", [select("b"), distance(10)], document, ["b"]);
  const solidIds = document.entities.filter((entity) => entity.type === "solid3d").map((entity) => entity.id);
  assert.equal(solidIds.length, 2);
  const secondId = solidIds.find((id) => id !== firstId)!;

  const united = apply("UNION", [select(firstId, secondId), ENTER], document, [firstId, secondId]);
  const unionSolid = soleSolid(united);
  // 100² + 100² − 50² (el solape) = 10000 + 10000 − 2500 = 17500, por 10 de alto.
  near(solid3dMassProperties(unionSolid).volume, 175_000, "volumen de la unión", 1e-3);
  assert.equal(unionSolid.nodes.length, 3, "el árbol conserva los dos operandos MÁS la operación");
  assert.ok(
    unionSolid.nodes.some((node) => node.id === "op0:perfil") &&
      unionSolid.nodes.some((node) => node.id === "op1:perfil"),
    "los nodos homónimos se renombran con prefijo: sin eso, uno pisaría al otro",
  );

  const subtracted = apply("SUBTRACT", [select(firstId, secondId), ENTER], document, [firstId, secondId]);
  near(solid3dMassProperties(soleSolid(subtracted)).volume, 75_000, "volumen de la resta", 1e-3);

  const intersected = apply("INTERSECT", [select(firstId, secondId), ENTER], document, [firstId, secondId]);
  near(solid3dMassProperties(soleSolid(intersected)).volume, 25_000, "volumen de la intersección", 1e-3);

  // Con un solo sólido no hay operación posible, y se dice.
  assert.match(messageOf(run("UNION", [select(firstId), ENTER], document, [firstId])), /DOS sólidos/);
}

// --- FILLETEDGE / CHAMFEREDGE -------------------------------------------------
{
  let document = documentWith([rectangle("base", 0, 0, 100, 100)]);
  document = apply("EXTRUDE", [select("base"), distance(100)], document, ["base"]);
  const solidId = soleSolid(document).id;
  const original = solid3dMassProperties(soleSolid(document)).volume;
  near(original, 1_000_000, "cubo de 100", 1e-3);

  const chamfered = apply("CHAMFEREDGE", [select(solidId), distance(10)], document, [solidId]);
  const chamferedSolid = soleSolid(chamfered);
  assert.equal(chamferedSolid.id, solidId, "CHAMFEREDGE conserva el id: `replace`, no borrar+crear");
  assert.ok(
    solid3dMassProperties(chamferedSolid).volume < original,
    "achaflanar RETIRA material",
  );
  assert.ok(
    validateBody(solid3dBody(chamferedSolid), { requireClosed: true, requirePlanarFaces: true }).ok,
    "y el resultado sigue siendo un sólido válido",
  );
  const last = chamferedSolid.nodes[chamferedSolid.nodes.length - 1];
  assert.equal(last.op, "chamfer", "el árbol crece con el nodo de la operación: sigue siendo reeditable");

  const filleted = apply("FILLETEDGE", [select(solidId), distance(10)], document, [solidId]);
  const filletedVolume = solid3dMassProperties(soleSolid(filleted)).volume;
  assert.ok(filletedVolume < original, "redondear también retira material");
  // Y retira MÁS que el chaflán del mismo tamaño. La razón está en la sección:
  // las dos órdenes cortan el mismo perfil circular, el chaflán con UNA faceta y
  // el redondeo con ocho. Una faceta es la CUERDA del arco, y la cuerda queda por
  // dentro — así que el chaflán deja material que el redondeo se lleva. Es la
  // comprobación que distingue de verdad las dos órdenes: sin ella, `fillet`
  // podría estar cableado a `chamfer` y nadie se enteraría.
  const chamferedVolume = solid3dMassProperties(chamferedSolid).volume;
  assert.ok(
    filletedVolume < chamferedVolume,
    `el redondeo (${filletedVolume}) debe retirar MÁS que el chaflán (${chamferedVolume})`,
  );
}

// --- SLICE / SECTION ----------------------------------------------------------
{
  let document = documentWith([rectangle("base", 0, 0, 100, 100)]);
  document = apply("EXTRUDE", [select("base"), distance(40)], document, ["base"]);
  const solidId = soleSolid(document).id;

  // Plano vertical por (50,0)→(50,100): la normal apunta a −X, así que
  // «Izquierda» conserva el lado de x < 50.
  const sliced = apply(
    "SLICE",
    [select(solidId), point(50, 0), point(50, 100), keyword("Izquierda")],
    document,
    [solidId],
  );
  near(solid3dMassProperties(soleSolid(sliced)).volume, 200_000, "media pieza tras SLICE", 1e-3);

  const both = apply(
    "SLICE",
    [select(solidId), point(50, 0), point(50, 100), keyword("Ambos")],
    document,
    [solidId],
  );
  const halves = both.entities.filter((entity) => entity.type === "solid3d");
  assert.equal(halves.length, 2, "«Ambos» deja las dos mitades");
  const total = halves.reduce(
    (sum, half) => sum + (half.type === "solid3d" ? solid3dMassProperties(half).volume : 0),
    0,
  );
  near(total, 400_000, "las dos mitades suman el original", 1e-3);

  const sectioned = apply(
    "SECTION",
    [select(solidId), point(50, 0), point(50, 100), ENTER],
    document,
    [solidId],
  );
  const regions = sectioned.entities.filter((entity) => entity.type === "region");
  assert.equal(regions.length, 1, "SECTION deja la huella del corte como REGION");
  const region = regions[0];
  if (region.type !== "region") throw new Error("tipo");
  assert.equal(region.outer.length, 4, "la sección de un prisma recto es un rectángulo");

  // Un plano que no toca la pieza no inventa ninguna sección.
  assert.match(
    messageOf(run("SECTION", [select(solidId), point(500, 0), point(500, 100), ENTER], document, [solidId])),
    /no atraviesa/,
  );
}

// --- MASSPROP (de la ola de consultas) / INTERFERE -----------------------------
{
  let document = documentWith([rectangle("a", 0, 0, 100, 100), rectangle("b", 50, 50, 100, 100)]);
  document = apply("EXTRUDE", [select("a"), distance(10)], document, ["a"]);
  const firstId = soleSolid(document).id;
  document = apply("EXTRUDE", [select("b"), distance(10)], document, ["b"]);
  const secondId = document.entities
    .filter((entity) => entity.type === "solid3d")
    .map((entity) => entity.id)
    .find((id) => id !== firstId)!;

  // MASSPROP es UNA sola orden repartida por tipo de objeto designado: las
  // regiones 2D las mide `inquiry-list.ts` y los sólidos los mide el kernel
  // desde ese mismo archivo. Aquí se comprueba la mitad de los sólidos.
  const mass = messageOf(run("MASSPROP", [select(firstId), ENTER], document, [firstId]));
  assert.match(mass, /SOLID3D/, "MASSPROP reconoce el sólido en vez de apartarse");
  assert.match(mass, /volumen/, "y publica el volumen");
  assert.match(mass, /deriva/, "y la discrepancia entre los DOS caminos, que es lo que permite fiarse");

  const interfering = messageOf(run("INTERFERE", [select(firstId, secondId), ENTER], document, [firstId, secondId]));
  assert.match(interfering, /INTERFIEREN/, "dos piezas solapadas interfieren");
  assert.match(interfering, /25,000|25000/, "y el volumen común es 50 × 50 × 10");

  // Dos piezas separadas NO interfieren, y eso no es un error de cálculo.
  let apart = documentWith([rectangle("c", 0, 0, 10, 10), rectangle("d", 1_000, 1_000, 10, 10)]);
  apart = apply("EXTRUDE", [select("c"), distance(10)], apart, ["c"]);
  const cId = soleSolid(apart).id;
  apart = apply("EXTRUDE", [select("d"), distance(10)], apart, ["d"]);
  const dId = apart.entities
    .filter((entity) => entity.type === "solid3d")
    .map((entity) => entity.id)
    .find((id) => id !== cId)!;
  assert.match(
    messageOf(run("INTERFERE", [select(cId, dId), ENTER], apart, [cId, dId])),
    /Ninguno de los 2 sólidos/,
  );
}

// --- IMPORT / EXPORT: la ida y vuelta completa --------------------------------
{
  let document = documentWith([rectangle("base", 0, 0, 60, 40)]);
  document = apply("EXTRUDE", [select("base"), distance(20)], document, ["base"]);
  const solid = soleSolid(document);
  const volume = solid3dMassProperties(solid).volume;
  near(volume, 48_000, "volumen de partida", 1e-3);

  for (const format of ["step", "iges"] as const) {
    const file = exportSolidEntity(solid, { format, timestamp: format === "step" ? CAD_INTEROP_EPOCH : "19700101.000000" });
    assert.ok(file.length > 0, `${format}: el archivo no puede estar vacío`);

    const back = importSolidEntity(file, { id: `vuelta-${format}`, layer });
    assert.equal(back.format, format, "el formato se detecta por la cabecera, no se pregunta");
    assert.equal(back.entity.nodes.length, 1, "lo importado entra como UN nodo `brep`");
    assert.equal(back.entity.nodes[0].op, "brep", "no se inventa una receta que el archivo no traía");

    const body = solid3dBody(back.entity);
    assert.ok(
      validateBody(body, { requireClosed: true, requirePlanarFaces: true }).ok,
      `${format}: los invariantes se conservan en la ida y vuelta`,
    );
    near(solid3dMassProperties(back.entity).volume, volume, `${format}: el volumen se conserva`, 1e-6);
    assert.equal(eulerCounts(body).characteristic, 2, `${format}: χ = 2 tras la ida y vuelta`);
  }

  // Y por el COMANDO, que es como lo teclea un usuario.
  const exported = messageOf(run("EXPORT", [select(solid.id), keyword("STEP")], document, [solid.id]));
  assert.match(exported, /ISO-10303-21/, "EXPORT devuelve el archivo STEP");
  const payload = exported.slice(exported.indexOf("ISO-10303-21") - 1);
  const importResult = run("IMPORT", [text(payload)], documentWith([]));
  assert.ok(importResult && importResult.kind === "document", "IMPORT escribe el sólido en el documento");
  if (importResult.kind !== "document") throw new Error("tipo");
  const insert = importResult.commands.find((command): command is Extract<CadEntityCommand, { type: "insert" }> => command.type === "insert");
  assert.ok(insert, "IMPORT inserta una entidad");
  if (insert.entity.type !== "solid3d") throw new Error("tipo");
  near(solid3dMassProperties(insert.entity).volume, volume, "el volumen sobrevive al comando IMPORT", 1e-6);

  // Un texto que no es ninguno de los dos formatos se rechaza diciéndolo.
  assert.match(messageOf(run("IMPORT", [text("esto no es un archivo")], documentWith([]))), /no parece/);
}

// --- La definición de terminado: guardar, cerrar y reabrir --------------------
{
  let document = documentWith([rectangle("base", 0, 0, 200, 120), rectangle("hueco", 60, 40, 40, 40)]);
  document = apply("EXTRUDE", [select("base"), distance(50)], document, ["base"]);
  const baseId = soleSolid(document).id;
  document = apply("EXTRUDE", [select("hueco"), distance(50)], document, ["hueco"]);
  const huecoId = document.entities
    .filter((entity) => entity.type === "solid3d")
    .map((entity) => entity.id)
    .find((id) => id !== baseId)!;
  document = apply("SUBTRACT", [select(baseId, huecoId), ENTER], document, [baseId, huecoId]);

  const built = soleSolid(document);
  // 200·120·50 − 40·40·50 = 1 200 000 − 80 000 = 1 120 000
  near(solid3dMassProperties(built).volume, 1_120_000, "volumen de la pieza acabada", 1e-3);

  const reopened = parseCadDocument(serializeCadDocument(document));
  const restored = soleSolid(reopened);
  assert.equal(restored.nodes.length, 3, "el ÁRBOL sobrevive al guardado, no una malla");
  assert.ok(
    !serializeCadDocument(document).includes('"positions"'),
    "y la malla no viaja en el documento",
  );

  // El caché se vacía: si el volumen coincidiera por estar cacheado, la
  // comprobación no diría nada sobre lo que se persistió.
  clearSolidCache();
  near(solid3dMassProperties(restored).volume, 1_120_000, "y el volumen se reconstruye al reabrir", 1e-3);
  assert.equal(eulerCounts(solid3dBody(restored)).genus, 1, "la pieza reabierta sigue teniendo su agujero");
}

console.log(
  "sólidos: EXTRUDE, PRESSPULL, REVOLVE, SWEEP, LOFT, UNION, SUBTRACT, INTERSECT, " +
    "FILLETEDGE, CHAMFEREDGE, SLICE, SECTION, INTERFERE, IMPORT y EXPORT tecleados de punta a punta; " +
    "invariantes, Euler-Poincaré y volumen verificados tras cada operación; ida y vuelta STEP/IGES y por el documento",
);
