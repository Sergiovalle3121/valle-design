/**
 * IMAGEATTACH, IMAGECLIP e IMAGEADJUST contra papel (Ola H, 2026-09-02).
 *
 *   - IMAGEATTACH con el sobre de un PNG de 4 × 2 px, inserción (1000, 500),
 *     ancho 400 y giro 90°: definición `data:` + entidad con U = (0, 100),
 *     V = (−100, 0), tamaño 4 × 2, al FONDO. Intro en el ancho toma 1 unidad
 *     por píxel. El sobre de error y el texto que no es sobre se dicen.
 *   - IMAGECLIP Nuevo Poligonal con tres vértices deja `clipBoundary` en
 *     píxeles EXACTOS; Rectangular con dos esquinas deja cuatro; Eliminar lo
 *     quita; designar una LINE se rechaza diciéndolo.
 *   - IMAGEADJUST Brillo 70 · Atenuación 25 · Listo escribe los tres campos;
 *     Restablecer vuelve a 50/50/0; sin cambios no escribe y lo dice.
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "../../cad-document";
import type { CadImageEntity } from "../../cad-entities-v4";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_IMAGE_PAYLOAD_ERROR_KIND, CAD_IMAGE_PAYLOAD_KIND, cadImageDataUri, decodeCadImagePayload, encodeCadImagePayload } from "../../image-attach-payload";
import { cadPngChecker } from "../../image-fixtures";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

/* ── Los nombres ────────────────────────────────────────────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  for (const [alias, name] of [["IAT", "IMAGEATTACH"], ["adjuntarimagen", "IMAGEATTACH"], ["ICL", "IMAGECLIP"], ["recortarimagen", "IMAGECLIP"], ["IAD", "IMAGEADJUST"], ["ajustarimagen", "IMAGEADJUST"], ["IM", "IMAGE"]])
    eq(resolveCadCommandAlias(alias, known), name, `${alias} → ${name}`);
}

/* ── El sobre ───────────────────────────────────────────────────────────── */
const png = cadPngChecker(4, 2);
const dataUri = cadImageDataUri("image/png", png);
const payload = encodeCadImagePayload({ kind: CAD_IMAGE_PAYLOAD_KIND, name: "plano.png", dataUri, width: 4, height: 2 });
{
  ok(dataUri.startsWith("data:image/png;base64,iVBORw0KGgo"), "el data: empieza por la firma PNG");
  eq(decodeCadImagePayload(payload), { kind: CAD_IMAGE_PAYLOAD_KIND, name: "plano.png", dataUri, width: 4, height: 2 }, "el sobre va y vuelve");
  eq(decodeCadImagePayload("0\nSECTION"), null, "un DXF no es un sobre");
  assert.throws(() => decodeCadImagePayload('{"kind":"valle-image","name":"x"}'), /malformado/, "sin data: ni tamaño, lanza");
  checks += 1;
  eq(decodeCadImagePayload(encodeCadImagePayload({ kind: CAD_IMAGE_PAYLOAD_ERROR_KIND, name: "x.tif", reason: "no es PNG" })), { kind: CAD_IMAGE_PAYLOAD_ERROR_KIND, name: "x.tif", reason: "no es PNG" }, "el sobre de error va y vuelve");
}

/* ── El contexto ────────────────────────────────────────────────────────── */
const baseLayer: CadLayerDef = { id: "0", name: "0", color: "#ffffff", visible: true, locked: false };
function makeContext(entities: CadEntity[] = [], definitions: Array<{ id: string; name: string; uri: string; pixelWidth: number; pixelHeight: number }> = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "ESCANEO",
    unit: "mm",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `r${++ids}`,
    layers: () => [baseLayer],
    blocks: () => [],
    document: () => ({ meta: { version: 1, schema: 9, unit: "mm" }, entities, layers: [baseLayer], blocks: [], styles: { text: {}, dimension: {}, table: {}, plot: {} }, externalReferences: [], modelSpace: { entityIds: entities.map((entity) => entity.id) }, unsupportedEntities: [], lossManifest: [], imageDefinitions: definitions }) as never,
  };
}
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const angle = (degrees: number): CadCommandInput => ({ kind: "angle", degrees });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };

function drive(name: string, inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name)!;
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts };
}
function written(driven: ReturnType<typeof drive>, label: string) {
  const result = driven.result;
  assert.ok(result && result.kind === "document", `debía escribir, dio ${result?.kind}${result?.kind === "message" ? `: ${result.text}` : ""}`);
  eq(result.label, label, "la etiqueta de deshacer");
  return { commands: result.commands, notice: result.notice ?? "" };
}
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}

/* ── IMAGEATTACH ────────────────────────────────────────────────────────── */
let attached: CadImageEntity;
let definitionId = "";
{
  const asked = drive("IMAGEATTACH", [keyword("Archivo")]);
  ok(asked.result?.kind === "ui" && asked.result.request.target === "image-file", "Archivo pide el archivo por el canal image-file");
  const driven = drive("IMAGEATTACH", [text(payload), point(1000, 500), distance(400), angle(90)]);
  ok(driven.prompts[1].startsWith("«plano.png» (4 × 2 px). Precise el punto de inserción"), `tras el sobre, la inserción: ${driven.prompts[1]}`);
  eq(driven.prompts[2], "Precise el ancho de la imagen en unidades de dibujo", "luego el ancho");
  eq(driven.prompts[3], "Precise el ángulo de rotación", "luego el giro");
  const { commands, notice } = written(driven, "IMAGEATTACH");
  eq(commands.length, 2, "la definición y la entidad");
  const definition = commands[0];
  assert.ok(definition.type === "image-definition");
  ok(definition.definition.uri === dataUri && definition.definition.pixelWidth === 4 && definition.definition.pixelHeight === 2 && definition.definition.loaded === true && definition.definition.name === "plano.png", "la definición lleva el data: y el tamaño real");
  definitionId = definition.definition.id;
  ok(definitionId.startsWith("image:plano.png:"), `el id sale del nombre y una huella: ${definitionId}`);
  const inserted = commands[1];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "image");
  eq(inserted.drawOrder, "back", "al fondo: es el calco");
  attached = inserted.entity;
  ok(near(attached.uVector.x, 0) && near(attached.uVector.y, 100) && near(attached.vVector.x, -100) && near(attached.vVector.y, 0), `girada 90° a 100 mm por píxel: U = (0, 100), V = (−100, 0); dio U = (${attached.uVector.x}, ${attached.uVector.y})`);
  eq(attached.size, { width: 4, height: 2 }, "el tamaño en píxeles");
  eq(attached.layer, "ESCANEO", "en la capa activa");
  eq(attached.definition, definitionId, "apunta a su definición");
  eq(notice, "IMAGEATTACH: «plano.png» (4 × 2 px, 0 kB dentro del dibujo) en (1000, 500); 1 px = 100 mm, girada 90°.", "la orden dice sus números");

  const defaults = written(drive("IMAGEATTACH", [text(payload), point(0, 0), enter, enter]), "IMAGEATTACH");
  const plain = defaults.commands[1];
  assert.ok(plain.type === "insert" && plain.entity.type === "image");
  eq([plain.entity.uVector.x, plain.entity.vVector.y], [1, 1], "Intro en el ancho: 1 unidad por píxel, sin giro");

  ok(messageOf(drive("IMAGEATTACH", [text(encodeCadImagePayload({ kind: CAD_IMAGE_PAYLOAD_ERROR_KIND, name: "grande.png", reason: "pesa 12,0 MB y el tope es 8 MB." }))])).includes("«grande.png» no se adjunta: pesa 12,0 MB"), "el sobre de error se dice");
  ok(messageOf(drive("IMAGEATTACH", [text("hola")])).includes("necesita el archivo elegido con Archivo"), "un texto que no es sobre se rechaza");
  ok(messageOf(drive("IMAGEATTACH", [text(payload), point(0, 0), distance(0)])).includes("el ancho debe ser mayor que cero"), "ancho cero se rechaza");
}

/* ── IMAGECLIP ──────────────────────────────────────────────────────────── */
const image: CadImageEntity = { ...attached, id: "img", uVector: { x: 2, y: 0, z: 0 }, vVector: { x: 0, y: 2, z: 0 }, size: { width: 1000, height: 500 }, insertion: { x: 100, y: 200, z: 0 } };
const line: CadEntity = { id: "ln", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, layer: "0" } as CadEntity;
const definitions = [{ id: definitionId, name: "plano.png", uri: dataUri, pixelWidth: 4, pixelHeight: 2 }];
{
  const context = makeContext([image, line], definitions);
  const driven = drive("IMAGECLIP", [pick("img"), enter, enter, point(300, 400), point(1100, 400), point(700, 1000), enter], context);
  eq(driven.prompts[0], "Designe la imagen que recortar", "primero la imagen");
  eq(driven.prompts[1], "Indique la opción de recorte", "luego Nuevo/Eliminar");
  eq(driven.prompts[2], "Indique el tipo de contorno", "luego Poligonal/Rectangular");
  const { commands, notice } = written(driven, "IMAGECLIP");
  assert.ok(commands[0].type === "replace" && commands[0].entity.type === "image");
  eq(commands[0].entity.clipBoundary, [{ x: 100, y: 100, z: 0 }, { x: 500, y: 100, z: 0 }, { x: 300, y: 400, z: 0 }], "el triángulo tecleado en el plano queda en píxeles exactos");
  eq(notice, "IMAGECLIP: recorte de 3 vértices en «plano.png».", "la orden lo dice");

  const rectangle = written(drive("IMAGECLIP", [pick("img"), keyword("Nuevo"), keyword("Rectangular"), point(300, 400), point(1100, 1000)], context), "IMAGECLIP");
  assert.ok(rectangle.commands[0].type === "replace" && rectangle.commands[0].entity.type === "image");
  eq(rectangle.commands[0].entity.clipBoundary?.length, 4, "rectangular: cuatro vértices");

  const clipped: CadImageEntity = { ...image, clipBoundary: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }] };
  const removed = written(drive("IMAGECLIP", [pick("img"), keyword("Eliminar")], makeContext([clipped], definitions)), "IMAGECLIP");
  assert.ok(removed.commands[0].type === "replace" && removed.commands[0].entity.type === "image");
  eq(removed.commands[0].entity.clipBoundary, undefined, "Eliminar quita el recorte");
  ok(messageOf(drive("IMAGECLIP", [pick("img"), keyword("Eliminar")], context)).includes("no tiene recorte que eliminar"), "sin recorte, Eliminar lo dice");
  ok(messageOf(drive("IMAGECLIP", [pick("ln")], context)).includes("se designó LINE; hace falta una IMAGE"), "una LINE se rechaza");
  ok(messageOf(drive("IMAGECLIP", [pick("img"), enter, enter, point(0, 0), point(1, 0), enter], context)).includes("al menos tres vértices"), "dos vértices no cierran");
  ok(messageOf(drive("IMAGECLIP", [pick("img"), enter, enter, point(0, 0), point(1, 0), point(2, 0), enter], context)).includes("no cierra área"), "tres alineados no cierran área");
}

/* ── IMAGEADJUST ────────────────────────────────────────────────────────── */
{
  const context = makeContext([image, line], definitions);
  const driven = drive("IMAGEADJUST", [pick("img"), keyword("Brillo"), distance(70), keyword("Atenuación"), distance(25), keyword("Listo")], context);
  ok(driven.prompts[1].startsWith("Brillo 50 · Contraste 50 · Atenuación 0. Indique el ajuste"), `las cifras actuales en el prompt: ${driven.prompts[1]}`);
  eq(driven.prompts[2], "Precise el brillo (0 a 100)", "Brillo pide su valor");
  ok(driven.prompts[3].startsWith("Brillo 70 · Contraste 50 · Atenuación 0."), "y vuelve con el nuevo");
  const { commands, notice } = written(driven, "IMAGEADJUST");
  assert.ok(commands[0].type === "replace" && commands[0].entity.type === "image");
  eq([commands[0].entity.brightness, commands[0].entity.contrast, commands[0].entity.fade], [70, 50, 25], "brillo 70, contraste 50, atenuación 25");
  eq(notice, "IMAGEADJUST: «plano.png» brillo 70, contraste 50, atenuación 25.", "la orden lo dice");
  const clamped = written(drive("IMAGEADJUST", [pick("img"), keyword("Contraste"), distance(140), enter], context), "IMAGEADJUST");
  assert.ok(clamped.commands[0].type === "replace" && clamped.commands[0].entity.type === "image");
  eq(clamped.commands[0].entity.contrast, 100, "140 se acota a 100");
  const adjusted: CadImageEntity = { ...image, brightness: 70, contrast: 40, fade: 25 };
  const reset = written(drive("IMAGEADJUST", [pick("img"), keyword("Restablecer"), enter], makeContext([adjusted], definitions)), "IMAGEADJUST");
  assert.ok(reset.commands[0].type === "replace" && reset.commands[0].entity.type === "image");
  eq([reset.commands[0].entity.brightness, reset.commands[0].entity.contrast, reset.commands[0].entity.fade], [50, 50, 0], "Restablecer vuelve a 50/50/0");
  ok(messageOf(drive("IMAGEADJUST", [pick("img"), enter], context)).includes("queda como estaba"), "sin cambios no se escribe, y se dice");
  ok(messageOf(drive("IMAGEADJUST", [pick("ln")], context)).includes("hace falta una IMAGE"), "una LINE se rechaza");
}

/* ── La imagen designada ANTES de la orden (Ctrl+A, un clic) ────────────── */
{
  const preselected = { ...makeContext([image, line], definitions), selection: ["img"] };
  const clip = drive("IMAGECLIP", [enter, enter, point(300, 400), point(1100, 400), point(700, 1000), enter], preselected);
  eq(clip.prompts[0], "Indique la opción de recorte", "con la imagen designada, IMAGECLIP arranca en las opciones");
  written(clip, "IMAGECLIP");
  const adjust = drive("IMAGEADJUST", [keyword("Atenuación"), distance(40), enter], preselected);
  ok(adjust.prompts[0].startsWith("Brillo 50 · Contraste 50 · Atenuación 0."), "y IMAGEADJUST también");
  written(adjust, "IMAGEADJUST");
  const two = { ...makeContext([image, line], definitions), selection: ["img", "ln"] };
  eq(drive("IMAGECLIP", [], two).prompts[0], "Designe la imagen que recortar", "con dos designados no se adivina: se pide la imagen");
  ok(messageOf(drive("IMAGECLIP", [enter], makeContext([image], definitions))).includes("necesita una imagen designada"), "Intro sin nada designado lo dice");
  // Sin nada designado la orden espera en la designación; si el usuario
  // designa DESPUÉS (la selección vigente cambia) e Intro, la toma.
  const late = makeContext([image], definitions);
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("IMAGEADJUST")!;
  const waiting = descriptor.begin(late);
  eq(waiting.prompt.message, "Designe la imagen que ajustar", "sin designación, espera");
  const taken = descriptor.step(waiting.state, enter, { ...late, selection: ["img"] });
  ok(taken.prompt.message.startsWith("Brillo 50"), "Intro en la designación toma la selección vigente");
}

console.log(`raster-image: ${checks} comprobaciones · IMAGEATTACH con el sobre PNG 4 × 2 (data: dentro del dibujo, 1 px = 100 mm girada 90°); IMAGECLIP poligonal exacto en píxeles, rectangular y Eliminar; IMAGEADJUST 70/50/25, acotado y Restablecer`);
