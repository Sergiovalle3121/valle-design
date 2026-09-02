/**
 * ROOF y SLAB contra fórmulas en PAPEL (Ola E, 2026-09-02).
 *
 * El volumen lo calcula el kernel B-rep sobre el árbol PERSISTIDO —lo que
 * viaja al servidor— y se contrasta con la aritmética cerrada de cada
 * cuerpo. Rectángulo de 6.000 × 4.000 con alero 600 → 7.200 × 5.200:
 *
 *   cuatro aguas, 30 %: h = 0,3 · 2.600 = 780; V = h · W · ((L − W)/2 + W/3)
 *   dos aguas, 30 %:    V = L · W · h / 2
 *   un agua, 20 %, sin alero: h = 0,2 · 4.000 = 800; V = 6.000 · 4.000 · 800 / 2
 *   cuadrado 4.000 a cuatro aguas sin alero: pirámide, V = W² · h / 3
 *   losa de 150 sobre 24 m²: 3,6 m³, cara superior a la cota del contorno
 */
import { strict as assert } from "node:assert";
import { planarBodyVolume } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { cadRoofRectangle } from "./architecture-roof";
import { cadRingArea } from "./architecture-support";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, relative = 1e-9) => Math.abs(a - b) <= Math.max(1, Math.abs(b)) * relative;

/* ── Los nombres que se teclean ─────────────────────────────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  eq(resolveCadCommandAlias("ROOFADD", known), "ROOF", "el nombre de AutoCAD Architecture");
  eq(resolveCadCommandAlias("cubierta", known), "ROOF", "la memoria muscular en español");
  eq(resolveCadCommandAlias("SLABADD", known), "SLAB", "SLABADD");
  eq(resolveCadCommandAlias("losa", known), "SLAB", "LOSA");
}

const rect = (id: string, x: number, y: number, w: number, h: number, z = 0): CadEntity => ({
  id,
  type: "polyline",
  vertices: [{ x, y, z }, { x: x + w, y, z }, { x: x + w, y: y + h, z }, { x, y: y + h, z }],
  closed: true,
  layer: "0",
});
/** Rectángulo de 6.000 × 4.000 girado 30° alrededor de (10.000, 10.000). */
function rotated(id: string): CadEntity {
  const c = { x: 10_000, y: 10_000 };
  const a = (30 * Math.PI) / 180;
  const at = (x: number, y: number) => ({ x: c.x + x * Math.cos(a) - y * Math.sin(a), y: c.y + x * Math.sin(a) + y * Math.cos(a), z: 0 });
  return { id, type: "polyline", vertices: [at(-3000, -2000), at(3000, -2000), at(3000, 2000), at(-3000, 2000)], closed: true, layer: "0" };
}
const ENTITIES: CadEntity[] = [
  rect("rect", 0, 0, 6_000, 4_000),
  rect("alto", 0, 0, 6_000, 4_000, 3_000),
  rect("cuadrado", 0, 0, 4_000, 4_000),
  rotated("girado"),
  { id: "pent", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 4000, y: 0, z: 0 }, { x: 5000, y: 2000, z: 0 }, { x: 4000, y: 4000, z: 0 }, { x: 0, y: 4000, z: 0 }], closed: true, layer: "0" },
  { id: "rombo", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 4000, y: 0, z: 0 }, { x: 5000, y: 3000, z: 0 }, { x: 1000, y: 3000, z: 0 }], closed: true, layer: "0" },
  { id: "abierta", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 4000, y: 0, z: 0 }, { x: 4000, y: 3000, z: 0 }], closed: false, layer: "0" },
  { id: "linea", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0" },
  { id: "circulo", type: "circle", center: { x: 20_000, y: 0, z: 0 }, radius: 2_000, layer: "0" },
];

function makeContext(selection: readonly string[] = [], unit = "mm", entities = ENTITIES): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection,
    activeLayer: "CUBIERTAS",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `r${++ids}`,
  };
}

const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

function drive(name: string, inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} está en el registro`);
  let step = descriptor!.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts, options: step.prompt.options };
}

type Polyline = Extract<CadEntity, { type: "polyline" }>;
type Line = Extract<CadEntity, { type: "line" }>;
type Text = Extract<CadEntity, { type: "text" }>;

function built(driven: ReturnType<typeof drive>, label: string) {
  const result = driven.result;
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}${result?.kind === "message" ? `: ${result.text}` : ""}`);
  eq(result.label, label, "la frontera de deshacer lleva el nombre de la orden");
  ok(result.commands.every((command) => command.type === "insert"), "el lote sólo da de alta: el contorno designado se conserva");
  const entities = result.commands.flatMap((command) => (command.type === "insert" ? [command.entity as CadEntity] : []));
  const solids = entities.filter((entity): entity is CadSolid3dEntity => entity.type === "solid3d");
  return {
    entities,
    solids,
    solid: solids[0],
    polylines: entities.filter((entity): entity is Polyline => entity.type === "polyline"),
    lines: entities.filter((entity): entity is Line => entity.type === "line"),
    texts: entities.filter((entity): entity is Text => entity.type === "text"),
    notice: result.notice ?? "",
  };
}
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}
const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));
const round = (point: { x: number; y: number; z?: number }) => [Math.round(point.x), Math.round(point.y), Math.round(point.z ?? 0)];
const sameSegment = (line: Line, a: CadPoint2, b: CadPoint2) =>
  (near(line.start.x, a.x, 1e-6) && near(line.start.y, a.y, 1e-6) && near(line.end.x, b.x, 1e-6) && near(line.end.y, b.y, 1e-6)) ||
  (near(line.start.x, b.x, 1e-6) && near(line.start.y, b.y, 1e-6) && near(line.end.x, a.x, 1e-6) && near(line.end.y, a.y, 1e-6));

const L = 7200;
const W = 5200;

/* ── ROOF a cuatro aguas con los defaults ───────────────────────────────── */
{
  const driven = drive("ROOF", [select("rect"), enter]);
  eq(driven.prompts[0], "Cubierta a cuatro aguas, pendiente 30 %, alero 600 mm. Designe el rectángulo de la cubierta", "el prompt dice la receta vigente");
  eq(driven.prompts[1], "Cubierta a cuatro aguas, pendiente 30 %, alero 600 mm. Intro para construirla", "con el rectángulo designado, Intro construye");
  const { entities, solid, polylines, lines, texts, notice } = built(driven, "ROOF");
  const h = 0.3 * (W / 2);
  eq(entities.length, 1 + 5 + 8 + 4 + 1, "contorno del alero + cumbrera y 4 limatesas + 4 flechas (asta y barbas) + 4 rótulos + sólido");
  eq(polylines[0].vertices.map(round), [[-600, -600, 0], [6600, -600, 0], [6600, 4600, 0], [-600, 4600, 0]], "el contorno del alero, 600 por fuera");
  eq(lines.length, 5, "cumbrera + 4 limatesas");
  ok(sameSegment(lines[0], { x: 2000, y: 2000 }, { x: 4000, y: 2000 }), "la cumbrera mide L − W = 2.000 y está centrada");
  ok(sameSegment(lines[1], { x: -600, y: -600 }, { x: 2000, y: 2000 }), "cada limatesa va de la esquina del alero al extremo de la cumbrera");
  eq(texts.map((text) => text.text), ["30 %", "30 %", "30 %", "30 %"], "un rótulo de pendiente por faldón");
  ok(texts.every((text) => (text.rotation ?? 0) >= -90 && (text.rotation ?? 0) <= 90), "los rótulos se leen derechos");
  ok(entities.every((entity) => entity.layer === "CUBIERTAS"), "todo en la capa activa");
  eq(solid.nodes.length, 1, "UN nodo");
  const node = solid.nodes[0];
  assert.ok(node.op === "brep");
  eq(node.points.length, 6, "cuatro esquinas y dos extremos de cumbrera");
  eq(node.faces.length, 5, "bajo, dos faldones largos y dos cortos");
  ok(node.points.slice(4).every((point) => near(point.z, h)), "la cumbrera a +780");
  eq(solid.name, "Cubierta a cuatro aguas 30 %", "la receta viaja en el nombre");
  const expected = h * W * ((L - W) / 2 + W / 3);
  ok(near(volumeOf(solid), expected), `V = h · W · ((L − W)/2 + W/3) = ${expected.toFixed(0)} (medido ${volumeOf(solid).toFixed(0)})`);
  eq(notice, "ROOF: cubierta a cuatro aguas sobre 6,000 × 4,000 mm con alero 600 mm (7,200 × 5,200), pendiente 30 %: cumbrera a +780 mm sobre la cota 0; 4 faldones, 11.09 m³ bajo cubierta.", "la orden dice los números");
  eq(drive("ROOF", [select("rect")]).options.map((option) => option.label ?? option.keyword), ["Pendiente", "Alero", "Cuatro aguas", "Dos aguas", "Un agua"], "las cinco palabras clave, con sus rótulos");
}

/* ── Dos aguas y un agua ────────────────────────────────────────────────── */
{
  const two = built(drive("ROOF", [select("rect"), keyword("Dos"), enter]), "ROOF");
  const h = 0.3 * (W / 2);
  eq(two.lines.length, 1, "sólo la cumbrera");
  ok(sameSegment(two.lines[0], { x: -600, y: 2000 }, { x: 6600, y: 2000 }), "de lado a lado del alero");
  eq(two.texts.length, 2, "dos faldones");
  ok(near(volumeOf(two.solid), (L * W * h) / 2), "V = L · W · h / 2");
  ok(two.notice.startsWith("ROOF: cubierta a dos aguas"), two.notice);

  const one = built(drive("ROOF", [select("rect"), keyword("Una"), keyword("Pendiente"), distance(20), keyword("Alero"), distance(0), enter]), "ROOF");
  const h1 = 0.2 * 4000;
  eq(one.polylines[0].vertices.map(round), [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]], "sin alero, el contorno es el rectángulo");
  eq(one.lines.length, 0, "ni cumbrera ni limatesas");
  eq(one.texts.map((text) => text.text), ["20 %"], "un faldón al 20 %");
  ok(near(volumeOf(one.solid), (6000 * 4000 * h1) / 2), "V = L · W · h / 2 con h = s · W = 800");
  ok(one.notice.includes("borde alto a +800 mm"), one.notice);
  ok(one.notice.includes("1 faldón, 9.6 m³"), one.notice);
}

/* ── Cota, giro y cuadrado ──────────────────────────────────────────────── */
{
  const high = built(drive("ROOF", [select("alto"), enter]), "ROOF");
  ok(high.polylines[0].vertices.every((vertex) => vertex.z === 3000), "la planta a la cota del contorno");
  const node = high.solid.nodes[0];
  assert.ok(node.op === "brep");
  ok(node.points.slice(0, 4).every((point) => point.z === 3000) && node.points.slice(4).every((point) => near(point.z, 3780)), "el sólido arranca en +3000 y la cumbrera queda a +3780");
  ok(high.notice.includes("sobre la cota 3,000"), high.notice);

  const turned = built(drive("ROOF", [select("girado"), enter]), "ROOF");
  const h = 0.3 * (W / 2);
  ok(near(volumeOf(turned.solid), h * W * ((L - W) / 2 + W / 3)), "girado 30°, el mismo volumen");
  const ridge = turned.lines[0];
  ok(near(Math.hypot(ridge.end.x - ridge.start.x, ridge.end.y - ridge.start.y), 2000, 1e-6), "la cumbrera sigue midiendo 2.000");
  const angle = (Math.atan2(ridge.end.y - ridge.start.y, ridge.end.x - ridge.start.x) * 180) / Math.PI;
  ok(near(((angle % 180) + 180) % 180, 30, 1e-6), `y va por el lado largo, a 30° (medido ${angle.toFixed(3)})`);

  const square = built(drive("ROOF", [select("cuadrado"), keyword("Alero"), distance(0), enter]), "ROOF");
  const node2 = square.solid.nodes[0];
  assert.ok(node2.op === "brep");
  eq(node2.points.length, 5, "un cuadrado a cuatro aguas es una pirámide");
  eq(square.lines.length, 4, "cuatro limatesas al centro");
  ok(near(volumeOf(square.solid), (4000 * 4000 * 600) / 3), "V = W² · h / 3");
}

/* ── ROOF se niega diciendo por qué ─────────────────────────────────────── */
{
  eq(messageOf(drive("ROOF", [select("pent"), enter])), "ROOF necesita un rectángulo de cuatro vértices; el contorno designado tiene 5.", "pentágono");
  eq(messageOf(drive("ROOF", [select("rombo"), enter])), "ROOF necesita un rectángulo; el contorno designado no tiene los cuatro ángulos rectos.", "romboide");
  ok(messageOf(drive("ROOF", [select("abierta"), enter])).includes("no encierra un área"), "polilínea abierta");
  ok(messageOf(drive("ROOF", [select("linea"), enter])).includes("(line) no encierra un área"), "una línea");
  eq(messageOf(drive("ROOF", [select("rect", "alto"), enter])), "ROOF necesita UN rectángulo; hay 2 objetos designados.", "dos rectángulos");
  eq(messageOf(drive("ROOF", [enter])), "ROOF necesita un rectángulo designado.", "Intro sin designar");
  eq(messageOf(drive("ROOF", [select("rect"), keyword("Pendiente"), distance(0)])), "ROOF necesita una pendiente mayor que cero.", "pendiente cero");
  eq(messageOf(drive("ROOF", [select("rect"), keyword("Alero"), distance(-100)])), "ROOF: el alero no puede ser negativo; sin alero, teclee 0.", "alero negativo");
  eq(drive("ROOF", [select("rect"), { kind: "cancel" }]).result?.kind, "none", "Esc no escribe nada");
  const preselected = drive("ROOF", [enter], makeContext(["rect"]));
  eq(preselected.prompts[0], "Cubierta a cuatro aguas, pendiente 30 %, alero 600 mm. Intro para construirla", "con selección previa, va directo a construir");
  ok(preselected.result?.kind === "document", "y construye");
  const rectangle = cadRoofRectangle(ENTITIES[0]);
  assert.ok(!("refused" in rectangle));
  ok(near(rectangle.halfLength, 3000) && near(rectangle.halfWidth, 2000) && rectangle.along.x === 1, "el lado largo es el eje de la cumbrera");
}

/* ── En metros ──────────────────────────────────────────────────────────── */
{
  const metres = [rect("rect", 0, 0, 6, 4)];
  const { solid, notice } = built(drive("ROOF", [select("rect"), enter], makeContext([], "m", metres)), "ROOF");
  const h = 0.3 * 2.6;
  ok(near(volumeOf(solid), h * 5.2 * ((7.2 - 5.2) / 2 + 5.2 / 3)), "el alero por defecto son 0,6 m, no 600 m");
  ok(notice.includes("con alero 600 mm (7,200 × 5,200)"), `y se dice en mm: ${notice}`);
}

/* ── SLAB ───────────────────────────────────────────────────────────────── */
{
  const driven = drive("SLAB", [select("rect"), enter]);
  eq(driven.prompts[0], "Designe el contorno cerrado de la losa", "primer prompt");
  eq(driven.prompts[1], "Precise el espesor de la losa", "luego el espesor");
  eq(drive("SLAB", [select("rect")]).step.prompt.defaultValue, "150", "con 150 mm por defecto");
  const { entities, solid, notice } = built(driven, "SLAB");
  eq(entities.length, 1, "sólo el sólido: el contorno se conserva");
  const node = solid.nodes[0];
  assert.ok(node.op === "extrude");
  eq(node.height, 150, "150 de espesor");
  eq(node.frame?.origin.z, -150, "cuelga de la cota del contorno: la cara superior queda a 0");
  eq(solid.name, "Losa 150 mm", "la receta en el nombre");
  ok(near(volumeOf(solid), 6000 * 4000 * 150), "V = 24 m² × 0,15");
  eq(notice, "SLAB: losa de 150 mm sobre 24 m², cara superior a la cota 0; 3.6 m³.", "la orden dice área y volumen");

  const typed = built(drive("SLAB", [select("alto"), keyword("Elevación"), distance(3000), distance(200)]), "SLAB");
  const node2 = typed.solid.nodes[0];
  assert.ok(node2.op === "extrude");
  ok(node2.height === 200 && node2.frame?.origin.z === 2800, "Elevación 3000 y espesor 200: de 2.800 a 3.000");
  ok(typed.notice.includes("cara superior a la cota 3,000; 4.8 m³"), typed.notice);

  const two = built(drive("SLAB", [select("rect", "circulo"), enter]), "SLAB");
  eq(two.solids.length, 2, "un sólido por contorno");
  ok(two.notice.startsWith("SLAB: 2 losas de 150 mm sobre "), two.notice);
  const circle = two.solids[1].nodes[0];
  assert.ok(circle.op === "extrude");
  // El contorno del círculo es el polígono de 64 lados del renderizador (el
  // mismo que EXTRUDE), no el perfil de área igualada de CYLINDER: queda un
  // 0,16 % por debajo de π·r², y se dice.
  const ring = Math.abs(cadRingArea(circle.profile.outer));
  ok(near(volumeOf(two.solids[1]), ring * 150, 1e-9), "V = área del polígono × espesor");
  ok(ring < Math.PI * 2000 * 2000 && ring > 0.998 * Math.PI * 2000 * 2000, `el 64-gono queda entre el 99,8 % y el 100 % de π·r² (${(ring / (Math.PI * 4e6)).toFixed(5)})`);

  ok(messageOf(drive("SLAB", [select("linea"), enter])).startsWith("No hay ningún contorno cerrado entre lo designado"), "una línea no es una losa");
  eq(messageOf(drive("SLAB", [enter])), "SLAB necesita al menos un contorno cerrado designado.", "Intro sin designar");
  eq(messageOf(drive("SLAB", [select("rect"), distance(0)])), "SLAB necesita un espesor mayor que cero.", "espesor cero");
  const metres = built(drive("SLAB", [select("rect"), enter], makeContext([], "m", [rect("rect", 0, 0, 6, 4)])), "SLAB");
  ok(near(volumeOf(metres.solid), 6 * 4 * 0.15), "en metros, 0,15 de espesor");
  ok(metres.notice.includes("losa de 150 mm sobre 24 m²"), metres.notice);
}

console.log(`architecture-roof: ${checks} comprobaciones · cuatro/dos/un agua por fórmula (7.200 × 5.200, h 780), pirámide sobre cuadrado, losa de 24 m² con la cara superior a la cota`);
