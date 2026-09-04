/**
 * VECTORIZE de punta a punta: el escaneo entra por IMAGEATTACH y sale como
 * polilíneas en su sitio (Ola I, 2026-09-04).
 *
 * El recorrido completo, sin atajos: un PNG de 40 × 30 con un rectángulo de
 * (5, 5) a (34, 24) y una diagonal de (10, 10) a (22, 22) —más cinco motas de
 * polvo— se ADJUNTA de verdad con IMAGEATTACH en (1000, 500), ancho 4000
 * unidades sobre 40 px (1 px = 100 mm) y girado 90°. La entidad y la
 * definición que ese comando escribe son las que VECTORIZE lee después.
 *
 *   - Sale una capa nueva y DOS polilíneas: el contorno cerrado de cuatro
 *     vértices y la diagonal abierta de dos.
 *   - Cada vértice cae a menos de 1 px (100 mm) del vértice de origen EN
 *     COORDENADAS DEL DIBUJO; de hecho cae a menos de una micra, y se dice.
 *   - El plan se enseña ANTES de escribir y dice el umbral, cuántas manchas
 *     se descartaron y con cuántos píxeles, y la tolerancia. No cancela nada.
 *   - Tolerancia, Mancha y Umbral rehacen el plan sin tocar el dibujo.
 *   - Designar una LINE, una imagen sin definición y un JPEG adjunto se
 *     rechazan cada uno con SU motivo.
 *   - El aviso que queda registrado dice lo que todavía no reconoce.
 *
 * Y el segundo recorrido, el del RÓTULO (Ola I, 2º entregable): un PNG con
 * «PREDIO 4-A · 1 240.50 m2» TRAZADO con las mismas fuentes Hershey con las
 * que el producto dibuja su TEXT se adjunta a 1 px = 10 mm y vuelve como UNA
 * entidad TEXT con su cadena, su altura y su inserción en unidades de dibujo;
 * sus 36 trazos NO se escriben además como polilíneas; con la imagen girada
 * 90° el texto sale girado 90°; y la opción Texto apaga el reconocimiento y
 * devuelve las 36 polilíneas de antes.
 */
// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "../../cad-document";
import type { CadImageDefinition, CadImageEntity } from "../../cad-entities-v4";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { cadImageDataUri } from "../../image-attach-payload";
import { CAD_IMAGE_PAYLOAD_KIND, encodeCadImagePayload } from "../../image-attach-payload";
import { cadPngFixture, cadPngHersheyLabel } from "../../image-fixtures";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_VECTORIZE_RASTER_COMMANDS, layerNameFor } from "./vectorize-raster";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/* ── El escaneo, el mismo que prueba la tubería ─────────────────────────── */
const WIDTH = 40;
const HEIGHT = 30;
const RECT = { left: 5, top: 5, right: 34, bottom: 24 };
const SPECKS: ReadonlyArray<readonly [number, number]> = [[2, 2], [37, 2], [2, 27], [37, 27], [30, 15]];
const png = cadPngFixture(WIDTH, HEIGHT, (x, y) => {
  const edge = x >= RECT.left && x <= RECT.right && y >= RECT.top && y <= RECT.bottom && (x === RECT.left || x === RECT.right || y === RECT.top || y === RECT.bottom);
  const diagonal = x === y && x >= 10 && x <= 22;
  const speck = SPECKS.some(([sx, sy]) => sx === x && sy === y);
  const value = edge || diagonal || speck ? ((x + y) % 2 === 0 ? 30 : 50) : (x * 7 + y) % 3 === 0 ? 210 : 240;
  return [value, value, value, 255];
});
const dataUri = cadImageDataUri("image/png", png);
const payload = encodeCadImagePayload({ kind: CAD_IMAGE_PAYLOAD_KIND, name: "predio.png", dataUri, width: WIDTH, height: HEIGHT });

/* ── El contexto ────────────────────────────────────────────────────────── */
const baseLayer: CadLayerDef = { id: "0", name: "0", color: "#ffffff", visible: true, locked: false };
function makeContext(entities: CadEntity[] = [], definitions: CadImageDefinition[] = [], layers: CadLayerDef[] = [baseLayer], selection: string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection,
    activeLayer: "ESCANEO",
    unit: "mm",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `v${++ids}`,
    layers: () => layers,
    blocks: () => [],
    document: () =>
      ({
        meta: { version: 1, schema: 9, unit: "mm" },
        entities,
        layers,
        blocks: [],
        styles: { text: {}, dimension: {}, table: {}, plot: {} },
        externalReferences: [],
        modelSpace: { entityIds: entities.map((entity) => entity.id) },
        unsupportedEntities: [],
        lossManifest: [],
        imageDefinitions: definitions,
      }) as never,
  };
}
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const angle = (degrees: number): CadCommandInput => ({ kind: "angle", degrees });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };

const VECTORIZE = CAD_VECTORIZE_RASTER_COMMANDS[0];
function drive(descriptor: typeof VECTORIZE, inputs: readonly CadCommandInput[], context: CadCommandContext) {
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts };
}
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result.kind === "message" ? driven.result.text : "";
}

/* ── El nombre del comando y su capa ────────────────────────────────────── */
{
  eq(VECTORIZE.name, "VECTORIZE", "el comando se llama como en AutoCAD");
  eq([...VECTORIZE.aliases], ["VECTORIZAR", "VEC"], "con su nombre en español y su abreviatura");
  eq(VECTORIZE.mutates, true, "escribe en el dibujo");
  eq(layerNameFor("predio.png"), "VECTORIZADO-PREDIO", "la capa dice de qué escaneo salió el calco");
  eq(layerNameFor("Plano de conjunto (rev B).jpg"), "VECTORIZADO-PLANO-DE-CONJUNTO-REV-B", "y se sanea: los espacios y los paréntesis salen");
  eq(layerNameFor("Levantamiento topografico del predio 14.png"), "VECTORIZADO-LEVANTAMIENTO-TOPOGRAFIC", "y se recorta a 24 caracteres sin dejar el guion colgando");
  eq(layerNameFor(".png"), "VECTORIZADO", "sin nombre útil, la capa genérica");
}

/* ── El escaneo entra por IMAGEATTACH, de verdad ────────────────────────── */
let image: CadImageEntity;
let definition: CadImageDefinition;
{
  const attach = CAD_COMMAND_REGISTRY_V2.get("IMAGEATTACH")!;
  const context = makeContext();
  let step = attach.begin(context);
  for (const input of [text(payload), point(1000, 500), distance(4000), angle(90)]) {
    if (step.result) break;
    step = attach.step(step.state, input, context);
  }
  assert.ok(step.result?.kind === "document", `IMAGEATTACH debía escribir: ${step.result?.kind}`);
  checks += 1;
  const [definitionCommand, insertCommand] = step.result.commands;
  assert.ok(definitionCommand.type === "image-definition" && insertCommand.type === "insert" && insertCommand.entity.type === "image");
  definition = definitionCommand.definition;
  image = insertCommand.entity as CadImageEntity;
  ok(Math.abs(image.uVector.y - 100) < 1e-9 && Math.abs(image.vVector.x + 100) < 1e-9, `1 px = 100 mm y girada 90°: U = (${image.uVector.x}, ${image.uVector.y}), V = (${image.vVector.x}, ${image.vVector.y})`);
  eq(image.size, { width: WIDTH, height: HEIGHT }, "y con su tamaño en píxeles");
}

const attached = makeContext([image as unknown as CadEntity], [definition]);

/* ── El plan a la vista, antes de tocar el dibujo ───────────────────────── */
{
  const planned = drive(VECTORIZE, [pick(image.id)], attached);
  eq(planned.prompts[0], "Designe la imagen que vectorizar", "primero se designa");
  const plan = planned.prompts[1];
  ok(plan.startsWith("«predio.png»: 40 × 30 px (PNG 8 bits, RGBA)"), `el plan dice qué leyó: ${plan.split("\n")[0]}`);
  ok(plan.includes("umbral 50 (Otsu, automático): 114 píxel(es) de tinta"), `y con qué umbral separó la tinta: ${plan}`);
  ok(plan.includes("despeckle: 5 mancha(s) de menos de 8 px fuera (5 píxel(es) descartados)"), "y cuántas manchas quitó, con sus píxeles");
  ok(plan.includes("esqueleto de 109 px → 2 trazo(s), ajustados con tolerancia 1.5 px"), "y con qué tolerancia ajustó");
  ok(plan.includes("a la capa VECTORIZADO-PREDIO; 2 polilínea(s) y 0 texto(s); 1 px = 100 mm"), `y dónde va a caer: ${plan}`);
  ok(plan.includes("todavía no: arcos y círculos salen como polilíneas de tramos rectos"), "los arcos y los círculos, declarados ANTES de escribir");
  ok(plan.includes("todavía no: los sombreados"), "y los sombreados también");
  ok(plan.includes("texto: ningún glifo se pudo leer contra Hershey Simplex"), `un dibujo sin rótulos lo dice, no lo calla: ${plan}`);
  ok(plan.endsWith("¿Vectorizar?"), "y termina preguntando: nada se ha escrito todavía");
  ok(planned.result === undefined, "en efecto, sin resultado: el dibujo no ha cambiado");
}

/* ── Las dos polilíneas, en coordenadas del dibujo ──────────────────────── */
{
  const driven = drive(VECTORIZE, [pick(image.id), enter], attached);
  assert.ok(driven.result?.kind === "document", `Intro confirma y escribe: ${driven.result?.kind}`);
  checks += 1;
  eq(driven.result.label, "VECTORIZE (2 polilíneas)", "la etiqueta de deshacer");
  const commands = driven.result.commands;
  eq(commands.length, 3, "la capa nueva y las dos polilíneas");
  const layer = commands[0];
  assert.ok(layer.type === "layer" && layer.op === "upsert");
  eq(layer.layer.name, "VECTORIZADO-PREDIO", "la capa del calco, nueva");

  const polylines = commands.slice(1).map((command) => {
    assert.ok(command.type === "insert" && command.entity.type === "polyline");
    return command.entity;
  });
  eq(polylines.length, 2, "dos polilíneas");
  const closed = polylines.find((polyline) => polyline.closed)!;
  const open = polylines.find((polyline) => !polyline.closed)!;
  assert.ok(closed && open, "una cerrada y una abierta");
  checks += 1;
  eq(closed.vertices.length, 4, "el contorno con cuatro vértices");
  eq(open.vertices.length, 2, "la diagonal con dos");
  eq(closed.layer, "VECTORIZADO-PREDIO", "las dos a la capa del calco");
  eq(closed.context?.metadata, { origen: "VECTORIZE", imagen: "predio.png", umbral: 50, tolerancia: 1.5 }, "con su procedencia y sus números en metadatos");

  // Calculado a mano desde la colocación: mundo = (1000 − 100·py, 500 + 100·px)
  // con px = columna + ½ y py = 29 − fila + ½. La esquina (5, 5) del escaneo
  // es (5,5 · 24,5) en píxeles y (−1450, 1050) en el dibujo.
  const corners = [
    { x: -1450, y: 1050 },
    { x: -1450, y: 3950 },
    { x: 450, y: 3950 },
    { x: 450, y: 1050 },
  ];
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, tolerance: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
  for (const corner of corners) {
    ok(closed.vertices.some((vertex) => near(vertex, corner, 100)), `la esquina (${corner.x}, ${corner.y}) mm tiene su vértice a menos de 1 px (100 mm)`);
    ok(closed.vertices.some((vertex) => near(vertex, corner, 1e-6)), `y de hecho a menos de una micra: el giro de 90° no desplaza nada`);
  }
  ok(
    open.vertices.some((vertex) => near(vertex, { x: -950, y: 1550 }, 100)) && open.vertices.some((vertex) => near(vertex, { x: 250, y: 2750 }, 100)),
    `los extremos de la diagonal: ${open.vertices.map((vertex) => `(${Math.round(vertex.x)}, ${Math.round(vertex.y)})`).join(" ")}`,
  );
  ok(closed.vertices.every((vertex) => vertex.z === 0), "planas, en z = 0");

  const notice = driven.result.notice ?? "";
  ok(notice.startsWith("VECTORIZE: 2 polilínea(s) y 0 texto(s) de «predio.png» en la capa VECTORIZADO-PREDIO"), notice);
  ok(notice.includes("umbral 50 (Otsu), 5 mancha(s) descartada(s) (5 px), tolerancia 1.5 px"), `el manifiesto en el aviso: ${notice}`);
  ok(notice.includes("Todavía no: arcos, círculos ni sombreados"), `y lo que no hace, en el mismo aviso: ${notice}`);
}

/* ── No cancela; la capa que ya existe no se vuelve a crear ─────────────── */
{
  const declined = drive(VECTORIZE, [pick(image.id), keyword("No")], attached);
  eq(messageOf(declined), "VECTORIZE cancelado. El dibujo no ha cambiado.", "No cancela sin tocar nada");
  const withLayer = makeContext([image as unknown as CadEntity], [definition], [baseLayer, { id: "VECTORIZADO-PREDIO", name: "VECTORIZADO-PREDIO", color: "#f59e0b", visible: true, locked: false }]);
  const again = drive(VECTORIZE, [pick(image.id), enter], withLayer);
  assert.ok(again.result?.kind === "document");
  checks += 1;
  eq(again.result.commands.length, 2, "con la capa ya creada, sólo entran las dos polilíneas");
}

/* ── Tolerancia, Mancha y Umbral rehacen el plan sin escribir ───────────── */
{
  const coarse = drive(VECTORIZE, [pick(image.id), keyword("Tolerancia"), distance(0.2)], attached);
  eq(coarse.prompts[2], "Precise la tolerancia de ajuste, en píxeles del escaneo", "Tolerancia pregunta por su número");
  ok(coarse.prompts[3].includes("tolerancia 0.2 px"), `y el plan se rehace con ella: ${coarse.prompts[3].split("\n")[3]}`);
  ok(coarse.result === undefined, "sin escribir todavía");

  const dust = drive(VECTORIZE, [pick(image.id), keyword("Mancha"), distance(1), enter], attached);
  ok(dust.prompts[3].includes("ninguna mancha por debajo de 1 px que descartar"), `con área mínima 1 no se tira polvo: ${dust.prompts[3].split("\n")[2]}`);
  assert.ok(dust.result?.kind === "document");
  checks += 1;
  eq(dust.result.commands.length, 3, "y aun así salen las mismas dos polilíneas: una mota suelta no es un trazo");

  const manual = drive(VECTORIZE, [pick(image.id), keyword("Umbral"), distance(40)], attached);
  eq(manual.prompts[2], "Precise el umbral de tinta, de 0 a 255 (0 devuelve el automático de Otsu)", "Umbral pregunta y dice qué significa el 0");
  ok(manual.prompts[3].includes("umbral 40 (fijado a mano)"), `un umbral dado se declara como dado: ${manual.prompts[3].split("\n")[1]}`);
  const back = drive(VECTORIZE, [pick(image.id), keyword("Umbral"), distance(40), keyword("Umbral"), distance(0)], attached);
  ok(back.prompts[5].includes("umbral 50 (Otsu, automático)"), "y el 0 devuelve el automático");
}

/* ── Lo que se rechaza, cada cosa con su motivo ─────────────────────────── */
{
  const line: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" };
  const wrong = drive(VECTORIZE, [pick("l1")], makeContext([line]));
  ok(messageOf(wrong).includes("se designó LINE; hace falta una IMAGE adjunta con IMAGEATTACH"), "una LINE se rechaza diciéndolo");

  const orphan = drive(VECTORIZE, [pick(image.id)], makeContext([image as unknown as CadEntity], []));
  ok(messageOf(orphan).includes("que el dibujo no tiene"), "una imagen sin su definición también");

  const jpeg = { ...definition, id: "jpg", uri: cadImageDataUri("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])), name: "escaneo.jpg" };
  const jpegImage = { ...image, id: "img-jpeg", definition: "jpg" };
  const refused = drive(VECTORIZE, [pick("img-jpeg")], makeContext([jpegImage as unknown as CadEntity], [jpeg]));
  const reason = messageOf(refused);
  ok(reason.includes("no lleva descodificador JPEG") && reason.includes("PNG o BMP"), `un JPEG adjunto se rechaza con su límite y su salida: ${reason}`);

  const empty = drive(VECTORIZE, [enter], makeContext());
  ok(messageOf(empty).includes("necesita una imagen designada"), "sin nada designado, se dice");

  // Una hoja en blanco: umbral 0, nada de tinta, ni un trazo. No se escribe.
  const blank = cadPngFixture(8, 8, () => [255, 255, 255, 255]);
  const blankDefinition: CadImageDefinition = { id: "blank", name: "vacio.png", uri: cadImageDataUri("image/png", blank), pixelWidth: 8, pixelHeight: 8, loaded: true };
  const blankImage = { ...image, id: "img-blank", definition: "blank", size: { width: 8, height: 8 } };
  const nothing = drive(VECTORIZE, [pick("img-blank"), enter], makeContext([blankImage as unknown as CadEntity], [blankDefinition]));
  ok(messageOf(nothing).includes("no dejó ni un trazo"), "una hoja en blanco no escribe nada y lo dice");
}

/* ── Con la imagen ya designada antes de teclear la orden ───────────────── */
{
  const preselected = makeContext([image as unknown as CadEntity], [definition], [baseLayer], [image.id]);
  const driven = drive(VECTORIZE, [enter, enter], preselected);
  assert.ok(driven.result?.kind === "document", `Intro sobre la designación previa vectoriza: ${driven.result?.kind}`);
  checks += 1;
  eq(driven.result.commands.length, 3, "la capa y las dos polilíneas");
}

/* ── El rótulo trazado vuelve a ser un TEXT ─────────────────────────────── */
{
  // El mismo rótulo del reconocedor, trazado con `cadHersheyTextStrokes` y
  // adjuntado de verdad con IMAGEATTACH: 567 px de ancho sobre 5 670 unidades,
  // es decir 1 px = 10 mm, y la línea base en la fila 48.
  const rotulo = cadPngHersheyLabel({ text: "PREDIO 4-A · 1 240.50 m2", capHeightPx: 24 });
  const LEIDO = "PREDIO 4-A ? 1 240.50 m2"; // el · no está en el juego Hershey: la fuente lo dibuja ?
  const rotuloPayload = encodeCadImagePayload({
    kind: CAD_IMAGE_PAYLOAD_KIND,
    name: "rotulo.png",
    dataUri: cadImageDataUri("image/png", rotulo.png),
    width: rotulo.width,
    height: rotulo.height,
  });
  const attach = CAD_COMMAND_REGISTRY_V2.get("IMAGEATTACH")!;

  const attachAt = (degrees: number) => {
    const context = makeContext();
    let step = attach.begin(context);
    for (const input of [text(rotuloPayload), point(0, 0), distance(rotulo.width * 10), angle(degrees)]) {
      if (step.result) break;
      step = attach.step(step.state, input, context);
    }
    assert.ok(step.result?.kind === "document", `IMAGEATTACH debía escribir: ${step.result?.kind}`);
    checks += 1;
    const [definitionCommand, insertCommand] = step.result.commands;
    assert.ok(definitionCommand.type === "image-definition" && insertCommand.type === "insert" && insertCommand.entity.type === "image");
    return { definition: definitionCommand.definition, entity: insertCommand.entity as CadImageEntity };
  };

  const derecho = attachAt(0);
  const context = makeContext([derecho.entity as unknown as CadEntity], [derecho.definition]);
  const driven = drive(VECTORIZE, [pick(derecho.entity.id), enter], context);

  const plan = driven.prompts[1];
  ok(plan.includes("texto: 19 glifo(s) leído(s) contra Hershey Simplex en 1 renglón(es)"), `el plan dice cuántos glifos leyó y contra qué juego: ${plan}`);
  ok(plan.includes("0 mancha(s) sin lectura quedan como polilínea, y 36 trazo(s) salen del calco por estar ya escritos"), `y qué se fue del calco por estar ya escrito: ${plan}`);
  ok(plan.includes("a la capa VECTORIZADO-ROTULO; 0 polilínea(s) y 1 texto(s); 1 px = 10 mm"), `y qué va a escribir: ${plan}`);
  ok(!plan.includes("todavía no: esta tubería devuelve las letras"), "y ya NO declara que las letras salgan como trazos: en este plan no salen así");

  assert.ok(driven.result?.kind === "document", `Intro escribe: ${driven.result?.kind}`);
  checks += 1;
  eq(driven.result.label, "VECTORIZE (0 polilíneas, 1 textos)", "la etiqueta de deshacer cuenta las dos cosas");
  const commands = driven.result.commands;
  eq(commands.length, 2, "la capa y UNA entidad de texto: ni una polilínea suelta del rótulo");
  const insert = commands[1];
  assert.ok(insert.type === "insert" && insert.entity.type === "text", "la segunda es un TEXT");
  checks += 1;
  const rotuloText = insert.entity;
  eq(rotuloText.text, LEIDO, "con la cadena leída del escaneo");
  // La inserción del renglón cae en el píxel (24,5 · 23,5) y la imagen está
  // en (0, 0) a 10 unidades por píxel: 245 y 235 en el dibujo.
  eq({ x: rotuloText.x, y: rotuloText.y }, { x: 245, y: 235 }, "en el punto de inserción medido, llevado a unidades de dibujo");
  eq(rotuloText.height, 240, "con la altura de mayúscula medida (24 px × 10 mm) como altura de texto");
  eq(rotuloText.rotation, undefined, "sin giro: el renglón está derecho y la imagen también");
  eq(rotuloText.layer, "VECTORIZADO-ROTULO", "a la capa del calco");
  eq(rotuloText.context?.metadata, { origen: "VECTORIZE", imagen: "rotulo.png", umbral: 40, tolerancia: 1.5, glifos: 19, fuente: "Hershey Simplex" }, "con su procedencia, sus números y el juego de trazos");

  const notice = driven.result.notice ?? "";
  ok(notice.startsWith("VECTORIZE: 0 polilínea(s) y 1 texto(s) de «rotulo.png»"), notice);
  ok(notice.includes("Texto: 19 glifo(s) leído(s) contra Hershey Simplex y 0 mancha(s) dejada(s) como geometría"), `el recuento en el aviso: ${notice}`);
  ok(
    notice.includes("lee rótulos trazados con una fuente de TRAZOS (txt, simplex, romans, isocp, monotxt), ni manuscrito ni tipografías de contorno relleno"),
    `y el límite en el mismo aviso: ${notice}`,
  );

  // Girada 90°, el rótulo sale girado 90°: el giro del renglón se compone con
  // el de la IMAGE, no se pierde ni se duplica.
  const girado = attachAt(90);
  const rotated = drive(VECTORIZE, [pick(girado.entity.id), enter], makeContext([girado.entity as unknown as CadEntity], [girado.definition]));
  assert.ok(rotated.result?.kind === "document");
  checks += 1;
  const rotatedInsert = rotated.result.commands[1];
  assert.ok(rotatedInsert.type === "insert" && rotatedInsert.entity.type === "text");
  checks += 1;
  eq(rotatedInsert.entity.text, LEIDO, "la misma cadena");
  ok(Math.abs((rotatedInsert.entity.rotation ?? 0) - 90) < 1e-9, `y girado 90°: ${rotatedInsert.entity.rotation}`);
  ok(
    Math.abs(rotatedInsert.entity.x + 235) < 1e-9 && Math.abs(rotatedInsert.entity.y - 245) < 1e-9,
    `con la inserción girada con la imagen: (${rotatedInsert.entity.x}, ${rotatedInsert.entity.y})`,
  );

  // Y Texto lo apaga: vuelven las 36 polilíneas y ni un TEXT.
  const apagado = drive(VECTORIZE, [pick(derecho.entity.id), keyword("Texto"), enter], context);
  ok(apagado.prompts[2].includes("texto: sin reconocer (Texto lo enciende); los rótulos salen como trazos"), `apagado se declara: ${apagado.prompts[2]}`);
  assert.ok(apagado.result?.kind === "document");
  checks += 1;
  eq(apagado.result.label, "VECTORIZE (36 polilíneas)", "y salen las 36 polilíneas de los trazos");
  eq(apagado.result.commands.filter((command) => command.type === "insert" && command.entity.type === "text").length, 0, "sin ninguna entidad de texto");
  ok((apagado.result.notice ?? "").includes("El reconocimiento de rótulos se dejó apagado (opción Texto)"), "y el aviso dice que se apagó a propósito");
}

/* ── 11. Tecleado LLEGA: el registro y la tabla de alias ────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  ok(CAD_COMMAND_REGISTRY_V2.get("VECTORIZE") !== undefined, "VECTORIZE está en el registro: se puede teclear");
  // El pipeline de ENTRADA resuelve por `alias-table.ts` y no por el
  // descriptor (medido en la Ola E con DX): que el descriptor declare `VEC`
  // no basta para que tecleado llegue a ninguna parte.
  eq(resolveCadCommandAlias("vec", known), "VECTORIZE", "«vec» tecleado llega a VECTORIZE");
  eq(resolveCadCommandAlias("vectorizar", known), "VECTORIZE", "«vectorizar» tecleado llega a VECTORIZE");
}

console.log(
  `vectorize-raster: ${checks} comprobaciones · el PNG entra por IMAGEATTACH a 1 px = 100 mm girado 90° y vuelve como 2 polilíneas cuyos 6 vértices caen a menos de una micra del original en coordenadas del dibujo; plan con umbral 50 (Otsu), 5 manchas fuera y tolerancia 1,5 px antes de escribir; Tolerancia, Mancha y Umbral rehacen sin tocar; LINE, definición perdida, JPEG y hoja en blanco rechazados con su motivo; y el rótulo «PREDIO 4-A · 1 240.50 m2» trazado con Hershey vuelve como UN TEXT de altura 240 mm en (245, 235), sin duplicar sus 36 trazos, girado 90° con la imagen, y la opción Texto lo apaga`,
);
