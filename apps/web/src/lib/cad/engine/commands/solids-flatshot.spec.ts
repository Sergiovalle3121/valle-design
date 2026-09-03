/**
 * FLATSHOT y SOLPROF tecleados de punta a punta, y la única pregunta que importa:
 * ¿lo que sale se puede ACOTAR e IMPRIMIR?
 *
 * Un aplanado que produce un lote bonito y no llega al documento no ha hecho
 * nada. Aquí cada afirmación se comprueba DESPUÉS de aplicar el lote por la ruta
 * canónica (`executeCadEntityCommandBatch`), y las dos afirmaciones de producto
 * se comprueban con los módulos que ya existían y que nadie ha tocado para esto:
 *
 *  · **Acotable**: el motor de enganche encuentra el vértice del alzado, y una
 *    DIMLINEAR tirada entre dos de sus extremos mide 3.000 — la altura real del
 *    muro. Si el aplanado saliera a otra escala, ese número saldría mal.
 *  · **Imprimible**: `cadDocumentExtents` —el mismo que usa ZOOM Extensión y el
 *    encuadre del trazado— devuelve una envolvente que incluye el aplanado. Si
 *    el aplanado fuera una imagen o un tipo de entidad nuevo, no lo vería.
 *
 * El muro de la prueba mide 2.000 × 1.000 × 3.000, que son las medidas de un
 * paño de verdad, para que los números del spec se puedan comprobar mirando.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { cadFlatshotEntities } from "../../flatshot";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
import { createCadVariableAccess } from "../../system-variables";
import { cadDocumentExtents } from "../../view/document-extents";
import { cadSnapSceneAddEntities } from "../../snap-scene";
import { snap, type SnapScene } from "../../snap-engine";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, `${message} — se obtuvo ${JSON.stringify(actual)}`);
  checks += 1;
};
const near = (actual: number, expected: number, message: string, tol = 1e-9) =>
  ok(Math.abs(actual - expected) <= tol, `${message} — esperado ${expected}, obtenido ${actual}`);

const LAYER = "MUROS";

/** Un muro de 2.000 × 1.000 × 3.000 con la esquina en el origen. */
function wall(id = "muro"): CadEntity {
  return {
    id,
    type: "solid3d",
    root: "caja",
    nodes: [{ id: "caja", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 2000, y: 1000, z: 3000 } }],
    layer: LAYER,
  };
}

/** Una caja pequeña DETRÁS del muro: su aplanado tiene que salir oculto. */
function behind(id = "detras"): CadEntity {
  return {
    id,
    type: "solid3d",
    root: "caja",
    nodes: [{ id: "caja", op: "box", min: { x: 400, y: 4000, z: 400 }, max: { x: 1600, y: 5000, z: 2600 } }],
    layer: LAYER,
  };
}

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: LAYER, name: LAYER, color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

let idCounter = 0;

/**
 * SCU de ALZADO: X del dibujo hacia +X del mundo, Y del dibujo hacia +Z. Es
 * poner el sistema de pie, que es literalmente lo que hace un dibujante antes de
 * sacar un alzado, y es de donde FLATSHOT saca la dirección de proyección.
 */
const ELEVATION_UCS = {
  UCSXDIRX: 1,
  UCSXDIRY: 0,
  UCSXDIRZ: 0,
  UCSYDIRX: 0,
  UCSYDIRY: 0,
  UCSYDIRZ: 1,
};

function makeContext(
  document: CadDocument,
  options: {
    selection?: readonly string[];
    ucs?: Record<string, number>;
    /** El catálogo de alturas del anfitrión. Sin él, sólo entran los B-rep. */
    objectVolume?: (kind: string) => { height: number; opening?: boolean } | null;
  } = {},
): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    blocks: () => document.blocks ?? [],
    selection: options.selection ?? [],
    activeLayer: LAYER,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    variables: createCadVariableAccess(options.ucs ?? {}),
    newEntityId: () => `f${++idCounter}`,
    ...(options.objectVolume ? { objectVolume: options.objectVolume } : {}),
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  options: {
    selection?: readonly string[];
    ucs?: Record<string, number>;
    objectVolume?: (kind: string) => { height: number; opening?: boolean } | null;
  } = {},
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(document, options);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function apply(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  options: {
    selection?: readonly string[];
    ucs?: Record<string, number>;
    objectVolume?: (kind: string) => { height: number; opening?: boolean } | null;
  } = {},
): CadDocument {
  const result = run(name, inputs, document, options);
  assert.ok(result, `${name} no terminó`);
  assert.equal(
    result.kind,
    "document",
    `${name} debía escribir: ${result.kind === "message" ? result.text : result.kind}`,
  );
  if (result.kind !== "document") throw new Error("tipo");
  return executeCadEntityCommandBatch(document, result.commands, result.label).document;
}

function messageOf(result: CadCommandResult | undefined): string {
  assert.ok(result && result.kind === "message", `debía responder con un mensaje, dio ${result?.kind}`);
  if (result.kind !== "message") throw new Error("tipo");
  return result.text;
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });

/** Las líneas de un bloque, por capa. */
function linesOn(document: CadDocument, blockName: string, layer: string) {
  const block = (document.blocks ?? []).find((candidate) => candidate.name === blockName);
  assert.ok(block, `el bloque ${blockName} debe existir en la tabla`);
  return block.entities.filter((entity) => entity.type === "line" && entity.layer === layer);
}

/** Envolvente de un conjunto de líneas, en coordenadas del bloque. */
function boundsOf(lines: readonly CadEntity[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entity of lines) {
    if (entity.type !== "line") continue;
    for (const p of [entity.start, entity.end]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// 1. Las dos órdenes existen y se declaran espaciales
// ---------------------------------------------------------------------------
{
  for (const name of ["FLATSHOT", "SOLPROF"]) {
    const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
    ok(descriptor !== undefined, `${name} está en el registro del producto`);
    // Sin `spatial`, el motor rechaza el punto de inserción en cuanto el SCU
    // está inclinado — y un SCU inclinado es exactamente cómo se saca un alzado.
    ok(descriptor?.spatial === true, `${name} se declara espacial`);
    ok(descriptor?.mutates === true, `${name} escribe en el documento`);
  }
  eq(CAD_COMMAND_REGISTRY_V2.get("APLANAR")?.name, "FLATSHOT", "APLANAR → FLATSHOT");
  eq(CAD_COMMAND_REGISTRY_V2.get("PERFILSOL")?.name, "SOLPROF", "PERFILSOL → SOLPROF");
}

// ---------------------------------------------------------------------------
// 2. El alzado sale SOLO: se pone el SCU de pie y se teclea
// ---------------------------------------------------------------------------
{
  const start = documentWith([wall()]);
  const after = apply("FLATSHOT", [select("muro"), point(0, 0)], start, { ucs: ELEVATION_UCS });

  const visible = linesOn(after, "APLANADO", "APLANADO-VISTAS");
  ok(visible.length > 0, "el alzado deja líneas vistas");
  const box = boundsOf(visible);
  // El muro mide 2.000 en X y 3.000 en Z. Con el SCU de pie, la X del dibujo es
  // la X del mundo y la Y del dibujo es la Z: el alzado mide 2.000 × 3.000. Ese
  // par de números es el producto entero: es el alzado que el arquitecto NO va a
  // volver a dibujar a mano.
  near(box.minX, 0, "el alzado arranca en x = 0");
  near(box.maxX, 2000, "y llega a x = 2.000, el largo del muro");
  near(box.minY, 0, "arranca en y = 0");
  near(box.maxY, 3000, "y llega a y = 3.000, la altura del muro");

  // Y en PLANTA —SCU universal— el mismo muro da su huella: 2.000 × 1.000.
  const plan = apply("FLATSHOT", [select("muro"), point(0, 0)], start);
  const planBox = boundsOf(linesOn(plan, "APLANADO", "APLANADO-VISTAS"));
  near(planBox.maxX, 2000, "en planta el largo sigue siendo 2.000");
  near(planBox.maxY, 1000, "y el fondo es 1.000, no la altura");

  // Lo emitido son LINE: entidades normales del documento, no una imagen ni un
  // tipo nuevo. Es la condición para que las cotas y el trazado las traten como
  // cualquier otro trazo, y por eso se comprueba y no se supone.
  const block = (after.blocks ?? []).find((candidate) => candidate.name === "APLANADO");
  ok(block !== undefined, "el aplanado va dentro de un bloque");
  ok(
    (block?.entities ?? []).every((entity) => entity.type === "line"),
    "y todo lo que hay dentro son líneas",
  );
  const inserts = after.entities.filter((entity) => entity.type === "insert");
  eq(inserts.length, 1, "queda UNA inserción del bloque en el espacio modelo");
}

// ---------------------------------------------------------------------------
// 3. Vistas y ocultas en capas DISTINTAS, que es lo que permite apagarlas
// ---------------------------------------------------------------------------
{
  const start = documentWith([wall(), behind()]);
  const after = apply("FLATSHOT", [select("muro", "detras"), point(0, 0)], start, { ucs: ELEVATION_UCS });

  const visible = linesOn(after, "APLANADO", "APLANADO-VISTAS");
  const hidden = linesOn(after, "APLANADO", "APLANADO-OCULTAS");
  ok(visible.length > 0, "el muro de delante deja líneas vistas");
  ok(hidden.length > 0, "y la caja de detrás deja líneas ocultas");

  const layers = after.layers.map((layer) => layer.name);
  ok(layers.includes("APLANADO-VISTAS"), "la capa de vistas se crea");
  ok(layers.includes("APLANADO-OCULTAS"), "y la de ocultas también");
  const hiddenLayer = after.layers.find((layer) => layer.name === "APLANADO-OCULTAS");
  eq(hiddenLayer?.linetype, "HIDDEN", "las ocultas llevan trazo discontinuo POR CAPA");
  // Ahí está el interruptor: apagar la capa es lo único que hay que hacer para
  // que el alzado quede limpio, sin recalcular nada.
  ok(hiddenLayer?.visible === true, "y nacen encendidas, para que se vean al salir");

  // La caja de detrás está ENTERA dentro de la sombra del muro. En alzado su
  // contorno es el rectángulo (400,400)–(1.600,2.600), y sus cuatro esquinas
  // tienen que aparecer SÓLO entre las ocultas. Es la comprobación que un
  // clasificador de un solo cuerpo no puede pasar: mirando la caja sola, nueve
  // de sus doce aristas se ven.
  const corners = [
    { x: 400, y: 400 },
    { x: 1600, y: 400 },
    { x: 1600, y: 2600 },
    { x: 400, y: 2600 },
  ];
  const touches = (lines: readonly CadEntity[], corner: { x: number; y: number }) =>
    lines.some(
      (entity) =>
        entity.type === "line" &&
        [entity.start, entity.end].some(
          (p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 1e-6,
        ),
    );
  for (const corner of corners) {
    ok(touches(hidden, corner), `la esquina (${corner.x}, ${corner.y}) de la caja de atrás está entre las ocultas`);
    ok(!touches(visible, corner), `y NO está entre las vistas`);
  }

  // Sin ocultas: la capa no se crea y el bloque adelgaza.
  const noHidden = apply(
    "FLATSHOT",
    [select("muro", "detras"), keyword("Ocultas"), point(0, 0)],
    start,
    { ucs: ELEVATION_UCS },
  );
  ok(
    !noHidden.layers.some((layer) => layer.name === "APLANADO-OCULTAS"),
    "con las ocultas apagadas, esa capa ni se crea",
  );
  const lean = (noHidden.blocks ?? []).find((candidate) => candidate.name === "APLANADO");
  ok(
    (lean?.entities.length ?? 0) < (after.blocks ?? []).find((b) => b.name === "APLANADO")!.entities.length,
    "y el bloque tiene menos líneas que con ellas",
  );
}

// ---------------------------------------------------------------------------
// 4. Capas y nombre de bloque a medida, y REEMPLAZAR el bloque existente
// ---------------------------------------------------------------------------
{
  const start = documentWith([wall()]);
  const custom = apply(
    "FLATSHOT",
    [select("muro"), keyword("Capas"), text("ALZADO-N"), text("ALZADO-N-OC"), keyword("Bloque"), text("NORTE"), point(0, 0)],
    start,
    { ucs: ELEVATION_UCS },
  );
  ok(
    custom.layers.some((layer) => layer.name === "ALZADO-N"),
    "la capa de vistas se llama como se pidió",
  );
  ok(
    custom.layers.some((layer) => layer.name === "ALZADO-N-OC"),
    "y la de ocultas también",
  );
  const named = (custom.blocks ?? []).find((candidate) => candidate.name === "NORTE");
  ok(named !== undefined, "y el bloque se llama NORTE");
  eq(named?.version, 1, "recién creado, versión 1");

  // Segunda pasada con el MISMO nombre: se reemplaza en vez de duplicar, y la
  // inserción que ya había apunta al contenido nuevo. Es la opción «reemplazar
  // bloque existente» del cuadro de FLATSHOT, y es lo que hace que rehacer un
  // alzado después de tocar el modelo no deje dos alzados en el dibujo.
  const again = apply(
    "FLATSHOT",
    [select("muro"), keyword("Bloque"), text("NORTE"), point(0, 0)],
    custom,
    { ucs: ELEVATION_UCS },
  );
  const norths = (again.blocks ?? []).filter((candidate) => candidate.name === "NORTE");
  eq(norths.length, 1, "sigue habiendo UN solo bloque NORTE");
  eq(norths[0].version, 2, "y su versión ha subido: se redefinió, no se duplicó");
  const message = run(
    "FLATSHOT",
    [select("muro"), keyword("Bloque"), text("NORTE"), point(0, 0)],
    custom,
    { ucs: ELEVATION_UCS },
  );
  assert.ok(message && message.kind === "document");
  if (message.kind === "document")
    ok(message.label.includes("reemplazó"), `el mensaje dice que se reemplazó: «${message.label}»`);
}

// ---------------------------------------------------------------------------
// 5. ACOTABLE: el enganche encuentra el alzado y la cota mide lo que mide el muro
// ---------------------------------------------------------------------------
{
  const start = documentWith([wall()]);
  const after = apply("FLATSHOT", [select("muro"), point(5000, 0)], start, { ucs: ELEVATION_UCS });
  const block = (after.blocks ?? []).find((candidate) => candidate.name === "APLANADO");
  assert.ok(block);

  // Las líneas del bloque, ya colocadas donde el usuario las soltó. Es lo que ve
  // quien EXPLOTA el aplanado, que es el gesto normal para acotarlo, y lo
  // devuelve el propio módulo: si el desplazamiento se hiciera aquí a mano, la
  // spec probaría su aritmética y no la del producto.
  let exploded = 0;
  const placed = cadFlatshotEntities(block, { x: 5000, y: 0, z: 0 }, () => `expl${exploded++}`);

  // El motor de ENGANCHE encuentra la esquina alta del alzado. Sin esto, un
  // dibujante no puede pinchar el aplanado y «acotable» sería una palabra.
  const scene: SnapScene = { segments: [], endpoints: [], midpoints: [] };
  cadSnapSceneAddEntities(scene, placed, { x: 7000, y: 3000 });
  const hit = snap({ x: 7000.4, y: 2999.6 }, scene, { modes: { endpoint: true }, tolerance: 5 });
  ok(hit !== null, "OSNAP Punto final engancha en la esquina del alzado");
  if (hit) {
    near(hit.point.x, 7000, "y el enganche cae en x = 7.000", 1e-6);
    near(hit.point.y, 3000, "y en y = 3.000: la esquina alta del muro", 1e-6);
  }

  // Y la cota mide 3.000. Si el aplanado saliera a otra escala, o proyectara la
  // altura sobre el eje equivocado, este número saldría distinto.
  const withLines: CadDocument = {
    ...after,
    entities: [...after.entities, ...(placed as CadEntity[])],
    modelSpace: { ...after.modelSpace, entityIds: [...after.modelSpace.entityIds, ...placed.map((e) => e.id)] },
  };
  const dimension = apply(
    "DIMLINEAR",
    [point(5000, 0), point(5000, 3000), point(4500, 1500)],
    withLines,
  );
  const dim = dimension.entities.find((entity) => entity.type === "dimension") as
    | CadDimensionEntity
    | undefined;
  ok(dim !== undefined, "la cota se crea sobre el alzado");
  if (dim) near(buildCadDimensionGeometry(dim)?.measurement ?? NaN, 3000, "y mide 3.000 mm", 1e-6);

  // IMPRIMIBLE: la envolvente del documento —la misma que usan ZOOM Extensión y
  // el encuadre del trazado— incluye el aplanado. Una imagen o un tipo de
  // entidad nuevo no aparecerían aquí.
  const extents = cadDocumentExtents(after);
  ok(extents !== null, "el documento con el aplanado tiene envolvente");
  if (extents) {
    ok(extents.maxX >= 7000 - 1e-6, `la envolvente llega hasta el aplanado (maxX = ${extents.maxX})`);
    ok(extents.maxY >= 3000 - 1e-6, `y hasta su altura (maxY = ${extents.maxY})`);
  }
}

// ---------------------------------------------------------------------------
// 6. SOLPROF: las capas de perfil, con los nombres de siempre
// ---------------------------------------------------------------------------
{
  const start = documentWith([wall(), behind()]);
  const after = apply("SOLPROF", [select("muro", "detras"), point(0, 0)], start, { ucs: ELEVATION_UCS });
  const layers = after.layers.map((layer) => layer.name);
  ok(layers.includes("PV-MODELO"), "el perfil visto va a PV-…");
  ok(layers.includes("PH-MODELO"), "y el oculto a PH-…");
  eq(
    after.layers.find((layer) => layer.name === "PH-MODELO")?.linetype,
    "HIDDEN",
    "PH- nace con trazo discontinuo",
  );
  const block = (after.blocks ?? []).find((candidate) => candidate.name === "PERFIL-MODELO");
  ok(block !== undefined, "el perfil va en su propio bloque");

  // Con la ventana declarada a mano, las capas la llevan en el nombre: es como
  // SOLPROF distingue el perfil de una vista del de otra.
  const tagged = apply(
    "SOLPROF",
    [select("muro"), keyword("Ventana"), text("V12"), point(0, 0)],
    start,
    { ucs: ELEVATION_UCS },
  );
  ok(tagged.layers.some((layer) => layer.name === "PV-V12"), "PV-V12 con la ventana declarada");

  // Y respondiendo «no» a la capa aparte, el perfil sale entero en PV-: las
  // ocultas no se pierden, se dibujan sin distinguir. Es lo que hace SOLPROF.
  const together = apply(
    "SOLPROF",
    [select("muro", "detras"), keyword("Separar"), point(0, 0)],
    start,
    { ucs: ELEVATION_UCS },
  );
  ok(
    !together.layers.some((layer) => layer.name === "PH-MODELO"),
    "sin separar, la capa PH- ni se crea",
  );
  const merged = (together.blocks ?? []).find((candidate) => candidate.name === "PERFIL-MODELO");
  const separate = (after.blocks ?? []).find((candidate) => candidate.name === "PERFIL-MODELO");
  eq(
    merged?.entities.length,
    separate?.entities.length,
    "y el bloque tiene las MISMAS líneas: nada se ha perdido, sólo va todo a una capa",
  );
  ok(
    (merged?.entities ?? []).every((entity) => entity.layer === "PV-MODELO"),
    "todas en PV-",
  );
}

// ---------------------------------------------------------------------------
// 6 bis. EL MODELO DEL ARQUITECTO: muros y columnas, no sólo SOLID3D (Ola 4)
//
// El defecto (c) del informe de distancia lo decía así: «el único camino con
// oculta exacta (FLATSHOT) RECHAZA los muros, así que el modelo del arquitecto
// no puede usarlo». Y era literal: una planta de arquitectura no tiene un solo
// SOLID3D — sus muros son objetos de planta con la altura en el catálogo del
// anfitrión.
// ---------------------------------------------------------------------------
{
  const muroDePlanta = (id: string, x: number): CadEntity =>
    ({
      id, type: "box", kind: "wall", x, y: 0, w: 2_000, h: 150,
      rotation: 0, layer: LAYER, shape: "rect",
    }) as unknown as CadEntity;
  const alturas = (kind: string) =>
    kind === "wall" ? { height: 3_000 } : kind === "door" ? { height: 2_200, opening: true } : null;
  const planta = documentWith([muroDePlanta("muro-a", 0), muroDePlanta("muro-b", 4_000)]);

  // Sin catálogo de alturas el anfitrión no puede levantar volumen, y la orden
  // lo DICE en vez de escribir un bloque vacío.
  ok(
    messageOf(run("FLATSHOT", [point(0, 0)], planta, { ucs: ELEVATION_UCS })).includes("volumen"),
    "sin catálogo de alturas, FLATSHOT lo dice",
  );

  // Con él, el alzado sale.
  const resultado = run("FLATSHOT", [point(0, 0)], planta, {
    ucs: ELEVATION_UCS,
    objectVolume: alturas,
  });
  assert.ok(resultado && resultado.kind === "document", "con catálogo, FLATSHOT escribe");
  ok(/línea\(s\) vista\(s\)/.test(resultado.label), `y cuenta sus líneas: ${resultado.label}`);
  ok(!/fuera/.test(resultado.label), "sin nada fuera, no se inventa una nota de exclusión");
  // Y lo DICE: sin `notice`, una orden que escribe es muda —el anfitrión aplica
  // el lote y no imprime la etiqueta— y el aplanado salía sin una palabra.
  ok(resultado.notice === resultado.label, "el recuento se dice, no sólo se etiqueta");
  checks += 3;

  // Una PUERTA es un hueco: se resta del muro y se cuenta. Antes, con el mismo
  // catálogo, habría salido un bloque de 2,20 m plantado encima del muro.
  const conPuerta = documentWith([
    muroDePlanta("muro-a", 0),
    { id: "puerta", type: "box", kind: "door", x: 800, y: -100, w: 900, h: 350, rotation: 0, layer: LAYER, shape: "rect" } as unknown as CadEntity,
  ]);
  const conHueco = run("FLATSHOT", [point(0, 0)], conPuerta, {
    ucs: ELEVATION_UCS,
    objectVolume: alturas,
  });
  assert.ok(conHueco && conHueco.kind === "document");
  ok(/1 hueco\(s\) restado\(s\)/.test(conHueco.label), `el hueco se cuenta: ${conHueco.label}`);
  ok(!/fuera/.test(conHueco.label), "y la puerta NO se cuenta como excluida: se restó");
  checks += 2;

  // Un objeto sin altura declarada NO desaparece en silencio: se cuenta.
  const mixta = documentWith([
    muroDePlanta("muro-a", 0),
    { id: "mesa", type: "box", kind: "desk", x: 0, y: 500, w: 1_200, h: 600, rotation: 0, layer: LAYER, shape: "rect" } as unknown as CadEntity,
  ]);
  const conFuera = run("FLATSHOT", [point(0, 0)], mixta, {
    ucs: ELEVATION_UCS,
    objectVolume: alturas,
  });
  assert.ok(conFuera && conFuera.kind === "document");
  ok(/1 fuera/.test(conFuera.label), `lo excluido se cuenta: ${conFuera.label}`);
  ok(/no declara altura/.test(conFuera.label), "y con su motivo, no como un número suelto");
  ok(/1 fuera/.test(conFuera.notice ?? ""), "y se DICE en la línea de comandos");
  checks += 3;
}

// ---------------------------------------------------------------------------
// 7. Fallo cerrado, y supervivencia al guardado
// ---------------------------------------------------------------------------
{
  const empty = documentWith([]);
  ok(
    messageOf(run("FLATSHOT", [point(0, 0)], empty)).includes("volumen"),
    "sin nada con volumen, FLATSHOT lo dice en vez de escribir un bloque vacío",
  );
  ok(
    messageOf(run("SOLPROF", [select(), point(0, 0)], empty)).includes("volumen"),
    "y SOLPROF también",
  );

  // Un nombre de bloque imposible: se rechaza con su motivo, no se recorta.
  const start = documentWith([wall()]);
  const bad = messageOf(
    run("FLATSHOT", [select("muro"), keyword("Bloque"), text("x".repeat(200)), point(0, 0)], start, {
      ucs: ELEVATION_UCS,
    }),
  );
  ok(bad.includes("96"), `el nombre imposible se rechaza diciendo por qué: «${bad}»`);

  // Ida y vuelta por el documento: el bloque y su inserción sobreviven a
  // serializar, cerrar y volver a abrir. Sin esto, el alzado sería un adorno de
  // la sesión.
  const after = apply("FLATSHOT", [select("muro"), point(1000, 0)], start, { ucs: ELEVATION_UCS });
  const reopened = migrateCadDocument(parseCadDocument(serializeCadDocument(after)));
  const block = (reopened.blocks ?? []).find((candidate) => candidate.name === "APLANADO");
  ok(block !== undefined, "el bloque del aplanado sobrevive al guardado");
  eq(
    boundsOf(block?.entities ?? []).maxY,
    3000,
    "y sus líneas siguen midiendo lo mismo al reabrir",
  );
  const insert = reopened.entities.find((entity) => entity.type === "insert");
  ok(insert !== undefined, "y la inserción sigue en el espacio modelo");
}

console.log(
  `FLATSHOT y SOLPROF: ${checks} comprobaciones — alzado 2.000×3.000 desde el SCU de pie, ` +
    "vistas y ocultas en capas separadas, bloque reemplazable, y el aplanado acotado a 3.000 mm " +
    "por el enganche y el motor de cotas de siempre",
);
