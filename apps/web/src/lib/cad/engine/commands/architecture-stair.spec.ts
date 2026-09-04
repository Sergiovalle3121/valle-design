/**
 * STAIR contra fórmulas en PAPEL (Ola E, 2026-09-02; tramos y descansos,
 * 2026-09-04).
 *
 * El reparto de contrahuellas y huellas se contrasta con la aritmética
 * cerrada del reglamento y de Blondel, y el volumen de los sólidos —calculado
 * por el kernel B-rep sobre el árbol PERSISTIDO, lo que viaja al servidor— con
 * la fórmula del dentado: `ancho · h · c · (n − 1) · n / 2` por tramo de `n`
 * contrahuellas, más `ancho · fondo · c · k` por descanso pisado tras `k`.
 *
 *   H = 2400 (la altura de planta de WALL): N = ⌈2400/180⌉ = 14, c = 171,43,
 *   h = 630 − 2c = 287,14, desarrollo 13 · h = 3.732,86.
 *   H = 3000 con Huella 280: N = 17, c = 176,47, h = 280, desarrollo 4.480,
 *   2c + h = 632,9 (dentro de 600–650).
 *   En L, esas mismas 14 contrahuellas son 7 + 7: dos tramos de 6 · h con un
 *   descanso de 1.000 de fondo en medio → desarrollo 4.445,71.
 *   En U son 5 + 5 + 4: tres tramos de 4h + 4h + 3h y dos descansos →
 *   desarrollo 5.158,57.
 *
 * ## La escalera recta no se movió
 *
 * Los descansos son una capacidad NUEVA, no un rediseño: cinco escaleras
 * rectas —los defaults, Altura+Huella con cota, en metros, con huella
 * incómoda y bajando hacia −Y— se comparan contra la huella SHA-256 del lote
 * que la orden emitía ANTES de que existieran los tramos. Un id distinto, un
 * vértice movido en la última cifra o una coma en el aviso rompen el hash.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { planarBodyVolume } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import {
  cadStairDesign,
  cadStairFlights,
  cadStairProfile,
  CAD_STAIR_MAX_RISER_MM,
  CAD_STAIR_MIN_FLIGHT_RISERS,
  CAD_STAIR_MIN_TREAD_MM,
} from "./architecture-stair";

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

const descriptor = CAD_COMMAND_REGISTRY_V2.get("STAIR");
assert.ok(descriptor, "STAIR llegó al registro del producto");

/* ── Los nombres que se teclean ─────────────────────────────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  eq(resolveCadCommandAlias("STAIRADD", known), "STAIR", "el nombre de AutoCAD Architecture");
  eq(resolveCadCommandAlias("escalera", known), "STAIR", "la memoria muscular en español, en minúsculas");
  eq(descriptor!.kind, "draw", "es una orden de dibujo (hereda CECOLOR/CELTYPE como LINE)");
  eq(descriptor!.spatial, "elevation", "toma la cota del arranque, como las primitivas");
}

function makeContext(unit = "mm", cursor?: CadPoint2): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "ESCALERAS",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `e${++ids}`,
    ...(cursor ? { cursor } : {}),
  };
}

const point = (x: number, y: number, z?: number): CadCommandInput => ({
  kind: "point",
  point: z === undefined ? { x, y } : ({ x, y, z } as { x: number; y: number }),
  source: "typed",
});
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

function drive(inputs: readonly CadCommandInput[], context = makeContext()) {
  let step = descriptor!.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts, options: step.prompt.options.map((option) => option.keyword) };
}

interface Built {
  entities: CadEntity[];
  solid: CadSolid3dEntity;
  solids: CadSolid3dEntity[];
  notice: string;
}

/** Lo que la orden escribió, o falla con el mensaje que dio. */
function built(driven: ReturnType<typeof drive>): Built {
  const result = driven.result;
  assert.ok(
    result && result.kind === "document",
    `debía producir documento, dio ${result?.kind}${result?.kind === "message" ? `: ${result.text}` : ""}`,
  );
  eq(result.label, "STAIR", "la frontera de deshacer lleva el nombre de la orden");
  const entities = result.commands.map((command) => {
    assert.ok(command.type === "insert", "el lote sólo da de alta");
    return command.entity as CadEntity;
  });
  const solids = entities.filter((entity): entity is CadSolid3dEntity => entity.type === "solid3d");
  assert.ok(solids.length > 0, "hay al menos un SOLID3D");
  return { entities, solid: solids[0], solids, notice: result.notice ?? "" };
}

function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}

const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));
const linesOf = (entities: CadEntity[]) => entities.filter((entity) => entity.type === "line");
const polylinesOf = (entities: CadEntity[]) => entities.filter((entity): entity is Extract<CadEntity, { type: "polyline" }> => entity.type === "polyline");
const closedOf = (entities: CadEntity[]) => polylinesOf(entities).filter((polyline) => polyline.closed);
const openOf = (entities: CadEntity[]) => polylinesOf(entities).filter((polyline) => !polyline.closed);
const textOf = (entities: CadEntity[]) => {
  const text = entities.find((entity): entity is Extract<CadEntity, { type: "text" }> => entity.type === "text");
  assert.ok(text, "hay un TEXT");
  return text!;
};
const span = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.hypot(to.x - from.x, to.y - from.y);

/* ── La receta en papel ─────────────────────────────────────────────────── */
{
  const design = cadStairDesign({ rise: 2400, width: 1000, tread: null, maxRiser: 180, unit: "mm" });
  assert.ok(!("refused" in design));
  eq(design.risers, 14, "⌈2400 / 180⌉ = 14 contrahuellas");
  ok(near(design.riser, 2400 / 14), "c = 2400 / 14 = 171,43");
  ok(near(design.tread, 630 - 2 * (2400 / 14)), "h = 630 − 2c = 287,14 (Blondel)");
  ok(near(design.run, 13 * (630 - 2 * (2400 / 14))), "desarrollo = 13 huellas: una menos que contrahuellas");
  ok(near(design.blondelMm, 630), "2c + h = 630 exacto cuando la huella la pone Blondel");
  ok(design.comfortable, "y es cómoda");
  eq(design.form, "recto", "sin Forma, la escalera es recta");
  eq(design.flights, [14], "un solo tramo con las catorce");
  eq(design.landing, 0, "y ningún descanso");

  const fixed = cadStairDesign({ rise: 3000, width: 1000, tread: 280, maxRiser: 180, unit: "mm" });
  assert.ok(!("refused" in fixed));
  eq(fixed.risers, 17, "⌈3000 / 180⌉ = 17");
  ok(near(fixed.tread, 280), "la huella tecleada manda");
  ok(near(fixed.blondelMm, 2 * (3000 / 17) + 280), "2c + h = 632,9");
  ok(fixed.comfortable, "dentro de 600–650");

  const metres = cadStairDesign({ rise: 2.4, width: 1, tread: null, maxRiser: 0.18, unit: "m" });
  assert.ok(!("refused" in metres));
  eq(metres.risers, 14, "en metros, las mismas 14 contrahuellas");
  ok(near(metres.tread, 0.63 - 2 * (2.4 / 14)), "y la huella en metros: 0,2871");

  const profile = cadStairProfile(design);
  eq(profile.length, 2 * 14, "el dentado tiene 2N vértices");
  let twice = 0;
  for (let index = 0; index < profile.length; index += 1) {
    const a = profile[index];
    const b = profile[(index + 1) % profile.length];
    twice += a.x * b.y - b.x * a.y;
  }
  ok(twice > 0, "antihorario, como espera el kernel");
  ok(near(twice / 2, design.tread * design.riser * (13 * 14) / 2), "área del dentado = h · c · (N − 1) · N / 2");
}

/* ── El reparto de contrahuellas entre tramos suma N, siempre ───────────── */
{
  for (let risers = 2; risers <= 40; risers += 1)
    for (const count of [1, 2, 3]) {
      const flights = cadStairFlights(risers, count);
      eq(flights.length, count, `${risers} en ${count} tramos da ${count} tramos`);
      eq(flights.reduce((sum, value) => sum + value, 0), risers, `${flights.join(" + ")} = ${risers} exacto`);
      ok(flights[0] - flights[flights.length - 1] <= 1, "lo más parejo que permite la división entera");
      ok(flights.every((value, index) => index === 0 || value <= flights[index - 1]), "y la de más se la queda el primero");
    }
  eq(cadStairFlights(14, 2), [7, 7], "14 en L: 7 + 7");
  eq(cadStairFlights(14, 3), [5, 5, 4], "14 en U: 5 + 5 + 4");
  eq(cadStairFlights(17, 2), [9, 8], "17 en L: 9 + 8");
}

/* ── Dos clics con los defaults: planta y sólido ────────────────────────── */
{
  const driven = drive([point(0, 0), point(1000, 0)]);
  eq(driven.prompts[0], "Precise el punto de arranque de la escalera", "primer prompt");
  eq(driven.prompts[1], "Precise la dirección de subida", "segundo prompt");
  const { entities, solid, solids, notice } = built(driven);
  eq(entities.length, 1 + 12 + 1 + 1 + 1 + 1, "contorno + 12 contrahuellas interiores + subida + flecha + SUBE + sólido");
  eq(solids.length, 1, "un solo sólido: un solo tramo y ningún descanso");
  eq(
    notice,
    "STAIR: 14 contrahuellas de 171.4 mm y 13 huellas de 287.1 mm; desarrollo 3,732.9 mm, ancho 1,000 mm; 2c + h = 630 mm.",
    "la orden dice los números al terminar",
  );
  const run = 13 * (630 - 2 * (2400 / 14));
  const [outline] = closedOf(entities);
  const [travel, arrow] = openOf(entities);
  eq(outline.closed, true, "el contorno está cerrado");
  eq(outline.vertices.map((vertex) => [Math.round(vertex.x * 1000) / 1000, vertex.y, vertex.z]), [[0, 0, 0], [Math.round(run * 1000) / 1000, 0, 0], [Math.round(run * 1000) / 1000, 1000, 0], [0, 1000, 0]], "contorno: desarrollo × ancho, a la izquierda del sentido de subida");
  const lines = linesOf(entities);
  eq(lines.length, 12, "N − 2 contrahuellas interiores como LINE");
  ok(lines.every((line, index) => line.type === "line" && near(line.start.x, (index + 1) * (run / 13)) && line.start.y === 0 && line.end.y === 1000), "cada contrahuella cruza el ancho a k · h");
  eq(travel.closed, false, "la línea de subida es abierta");
  eq(travel.vertices.length, 2, "recta, sin quiebros: no hay descanso donde doblar");
  ok(near(travel.vertices[0].y, 500) && near(travel.vertices[1].x, run), "por el eje, hasta el final del desarrollo");
  eq(arrow.vertices.length, 3, "la punta de flecha son dos barbas");
  const label = textOf(entities);
  eq(label.text, "SUBE", "el rótulo de toda escalera");
  eq(label.rotation, undefined, "sin giro cuando sube hacia +X");
  ok(entities.every((entity) => entity.layer === "ESCALERAS"), "todo en la capa activa");

  eq(solid.nodes.length, 1, "UN nodo");
  eq(solid.nodes[0].op, "extrude", "un `extrude` de canto, reeditable");
  eq(solid.name, "Escalera 14 × 171.4 / 287.1 mm", "la receta viaja en el nombre del sólido");
  const expected = 1000 * (630 - 2 * (2400 / 14)) * (2400 / 14) * ((13 * 14) / 2);
  ok(near(volumeOf(solid), expected, 1e-9), `volumen = ancho · h · c · (N − 1) · N / 2 = ${expected.toFixed(0)} (medido ${volumeOf(solid).toFixed(0)})`);
}

/* ── Altura, Huella y la dirección hacia +Y con cota ────────────────────── */
{
  const driven = drive([keyword("Altura"), distance(3000), keyword("Huella"), distance(280), point(1000, 2000, 300), point(1000, 5000)]);
  eq(driven.prompts[1], "Precise la altura a salvar", "Altura pide la altura");
  eq(driven.prompts[3], "Precise la huella", "Huella pide la huella");
  const { entities, solid, notice } = built(driven);
  eq(entities.length, 1 + 15 + 1 + 1 + 1 + 1, "17 contrahuellas: 15 interiores");
  ok(notice.startsWith("STAIR: 17 contrahuellas de 176.5 mm y 16 huellas de 280 mm; desarrollo 4,480 mm"), `los números: ${notice}`);
  ok(notice.includes("2c + h = 632.9 mm."), "y Blondel, cómoda");
  const [outline] = closedOf(entities);
  eq(outline.vertices.map((vertex) => [Math.round(vertex.x), Math.round(vertex.y), vertex.z]), [[1000, 2000, 300], [1000, 6480, 300], [0, 6480, 300], [0, 2000, 300]], "sube hacia +Y: el ancho crece hacia −X (la izquierda) y todo a la cota del arranque");
  ok(near(textOf(entities).rotation ?? 0, 90), "SUBE gira con la escalera");
  const node = solid.nodes[0];
  assert.ok(node.op === "extrude");
  eq(node.frame?.origin, { x: 1000, y: 2000, z: 300 }, "el marco arranca en el punto con su cota");
  ok(near(node.height, -1000), "la extrusión recorre el ancho");
  ok(near(volumeOf(solid), 1000 * 280 * (3000 / 17) * ((16 * 17) / 2), 1e-9), "volumen = 1000 · 280 · 176,47 · 136");
}

/* ── Enter acepta el valor vigente; el prompt lo enseña ─────────────────── */
{
  const driven = drive([keyword("aNcho"), enter, point(0, 0), point(0, -1000)]);
  eq(driven.prompts[1], "Precise el ancho de la escalera", "aNcho pide el ancho");
  const { entities } = built(driven);
  const [outline] = closedOf(entities);
  ok(near(Math.abs(outline.vertices[2].x - outline.vertices[1].x), 1000), "Enter deja el ancho por defecto de 1000");
  ok(outline.vertices[2].x > outline.vertices[1].x, "bajando hacia −Y, la izquierda es +X");
  const asked = drive([keyword("Contrahuella")]);
  eq(asked.step.prompt.defaultValue, "180", "el prompt enseña la contrahuella máxima vigente");
}

/* ── El reglamento se niega al teclearlo, con el número ─────────────────── */
{
  eq(messageOf(drive([keyword("Contrahuella"), distance(200)])), `Contrahuella 200 mm: el reglamento admite ${CAD_STAIR_MAX_RISER_MM} mm como máximo.`, "contrahuella de 200");
  eq(messageOf(drive([keyword("Huella"), distance(200)])), `Huella 200 mm: el reglamento pide ${CAD_STAIR_MIN_TREAD_MM} mm como mínimo.`, "huella de 200");
  eq(messageOf(drive([keyword("Contrahuella"), distance(0.2)], makeContext("m"))), "Contrahuella 200 mm: el reglamento admite 180 mm como máximo.", "en metros, 0,2 son 200 mm y también se niega");
  eq(messageOf(drive([keyword("Altura"), distance(0)])), "STAIR: la altura a salvar tiene que ser mayor que cero.", "altura cero");
  eq(messageOf(drive([point(0, 0), point(0, 0)])), "STAIR: el segundo punto coincide con el arranque y no da dirección de subida.", "sin dirección");
  eq(messageOf(drive([enter])), "STAIR necesita un punto de arranque.", "Enter sin arranque");
  eq(messageOf(drive([point(0, 0), enter])), "STAIR necesita la dirección de subida.", "Enter sin dirección");
  const cancelled = drive([point(0, 0), { kind: "cancel" }]);
  eq(cancelled.result?.kind, "none", "Esc no escribe nada");
}

/* ── Blondel es comodidad: se dice, no se prohíbe ───────────────────────── */
{
  const { notice, solid } = built(drive([keyword("Huella"), distance(400), point(0, 0), point(1000, 0)]));
  ok(notice.includes("2c + h = 742.9 mm — fuera de la horquilla de comodidad 600–650."), `se dice que es incómoda: ${notice}`);
  ok(near(volumeOf(solid), 1000 * 400 * (2400 / 14) * ((13 * 14) / 2), 1e-9), "y se construye igual");
}

/* ── Un contexto en metros: los defaults se atan a la unidad ────────────── */
{
  const { entities, notice } = built(drive([point(0, 0), point(1, 0)], makeContext("m")));
  const [outline] = closedOf(entities);
  ok(near(outline.vertices[2].y, 1), "ancho de 1 m, no de 1000 m");
  ok(near(outline.vertices[1].x, 13 * (0.63 - 2 * (2.4 / 14))), "desarrollo de 3,73 m");
  ok(notice.startsWith("STAIR: 14 contrahuellas de 171.4 mm"), "y los números se dicen en mm, que es como se leen en obra");
}

/* ── La previsualización es la planta entera ────────────────────────────── */
{
  const context = makeContext("mm", { x: 2000, y: 0 });
  const step = descriptor!.step(descriptor!.begin(context).state, point(0, 0), context);
  eq(step.preview?.length, 1 + 12 + 1 + 1, "contorno, 12 contrahuellas, subida y flecha bajo el cursor");
  eq(step.prompt.options.map((option) => option.keyword), ["aNcho", "Altura", "Huella", "Contrahuella", "Forma"], "las cinco palabras clave de una escalera recta");
  ok(!step.prompt.options.some((option) => option.keyword === "Descanso"), "Descanso NO se ofrece donde no hay descanso");
  const shortcuts = step.prompt.options.map((option) => option.shortcut.toUpperCase());
  eq(new Set(shortcuts).size, shortcuts.length, "y ningún atajo se repite: un empate deja la tecla inservible para las dos");
}

/* ══ LA ESCALERA RECTA NO SE MOVIÓ ══════════════════════════════════════ */
/*
 * Huella SHA-256 del lote (`JSON.stringify` del resultado) capturada del
 * árbol ANTES de que STAIR supiera repartir tramos. Cubre ids, orden, cada
 * vértice hasta su última cifra, el árbol del sólido, su nombre y el aviso.
 */
{
  const golden: [string, string, ReturnType<typeof drive>][] = [
    ["defaults", "aef444374f342ca886d00344f8fd6926924949460a0262d950a4ae2a332c3e53", drive([point(0, 0), point(1000, 0)])],
    ["alturaHuella", "ab40ab1401e97647bdc720acc0c6cfe6255cd10a2182a2b5d594a9392b4222fd", drive([keyword("Altura"), distance(3000), keyword("Huella"), distance(280), point(1000, 2000, 300), point(1000, 5000)])],
    ["metros", "716c20955d9f467424c64e1f9fd558404f71f0f1e6ef7c0beffb9b2be302b539", drive([point(0, 0), point(1, 0)], makeContext("m"))],
    ["huellaGrande", "6fb197ec06c8ee98d8fc72e698e471a03f5dd9177b3458304c5e52d4cc70e049", drive([keyword("Huella"), distance(400), point(0, 0), point(1000, 0)])],
    ["bajando", "4ed59df2b48e69d00a611165feb85492716c29f6b95ecac0690a3bb00d344715", drive([point(0, 0), point(0, -1000)])],
  ];
  for (const [name, hash, driven] of golden)
    eq(createHash("sha256").update(JSON.stringify(driven.result)).digest("hex"), hash, `la escalera recta «${name}» emite byte a byte lo mismo que antes de los tramos`);
}

/* ══ LA ESCALERA EN L ═══════════════════════════════════════════════════ */

const RISER_14 = 2400 / 14;
const TREAD_14 = 630 - 2 * RISER_14;

/**
 * Mide el desarrollo sobre las COORDENADAS EMITIDAS, no sobre la receta.
 *
 * Cada contorno cerrado se emite como `[origen, +avance, +avance+ancho,
 * +ancho]`, así que su primer lado es lo que la pieza ocupa en el sentido de
 * la marcha y el segundo, el ancho. Sumar los primeros lados da el desarrollo
 * total; comparar el segundo con el ancho comprueba que ninguna pieza se
 * estrechó por el camino.
 */
function measured(entities: CadEntity[]) {
  return closedOf(entities).map((polyline) => {
    const [a, b, c] = polyline.vertices;
    return {
      advance: span(a, b),
      width: span(b, c),
      heading: { x: (b.x - a.x) / span(a, b), y: (b.y - a.y) / span(a, b) },
    };
  });
}

/** Vértices que comparte cada pieza con la siguiente: dos, o hay un hueco. */
function shared(entities: CadEntity[]): number[] {
  const rings = closedOf(entities).map((polyline) => polyline.vertices.map((vertex) => `${Math.round(vertex.x)}|${Math.round(vertex.y)}|${Math.round(vertex.z)}`));
  return rings.slice(1).map((ring, index) => ring.filter((key) => rings[index].includes(key)).length);
}

{
  const driven = drive([keyword("Forma"), keyword("Ele"), point(0, 0), point(1000, 0)]);
  eq(driven.prompts[1], "Precise la forma de la escalera", "Forma pide la forma");
  const { entities, solids, notice } = built(driven);
  const run = 6 * TREAD_14;

  eq(solids.length, 3, "dos tramos y un descanso: tres sólidos");
  eq(closedOf(entities).length, 3, "y tres contornos cerrados en planta");
  eq(linesOf(entities).length, 5 + 5, "las contrahuellas interiores de cada tramo: (7 − 2) × 2");
  eq(entities.length, 3 + 10 + 1 + 1 + 1 + 3, "contornos + contrahuellas + subida + flecha + SUBE + sólidos");
  eq(
    notice,
    "STAIR: 14 contrahuellas de 171.4 mm y 12 huellas de 287.1 mm; desarrollo 4,445.7 mm, ancho 1,000 mm; " +
      "2c + h = 630 mm. Escalera en L: 7 + 7 contrahuellas por tramo, 1 descanso de 1,000 mm de fondo.",
    "el aviso dice el reparto y el descanso",
  );

  const pieces = measured(entities);
  eq(pieces.length, 3, "tramo, descanso, tramo: en orden de subida");
  ok(near(pieces[0].advance, run) && near(pieces[2].advance, run), "los dos tramos miden 6 huellas");
  ok(near(pieces[1].advance, 1000), "el descanso, 1.000 de fondo");
  ok(pieces.every((piece) => near(piece.width, 1000)), "y los tres, 1.000 de ancho");
  ok(near(pieces[0].advance + pieces[1].advance + pieces[2].advance, 2 * run + 1000), "el desarrollo medido = tramos + descanso");
  // Y ese desarrollo medido es el que la orden dijo: 4.445,7 mm.
  ok(near(2 * run + 1000, 4445.714285714286), "que es el desarrollo del aviso");
  ok(near(pieces[1].advance, pieces[1].width), "fondo = ancho: el mínimo que pide el reglamento");
  ok(pieces[1].advance >= pieces[1].width - 1e-9, "y nunca menor que el ancho");
  ok(near(pieces[0].heading.x * pieces[2].heading.x + pieces[0].heading.y * pieces[2].heading.y, 0), "el segundo tramo gira 90° respecto del primero");
  ok(near(pieces[0].heading.x, 1) && near(pieces[2].heading.y, 1), "sube hacia +X y gira a la izquierda, hacia +Y");

  const [outline1, landing, outline2] = closedOf(entities).map((polyline) => polyline.vertices.map((vertex) => [Math.round(vertex.x), Math.round(vertex.y)]));
  eq(outline1, [[0, 0], [1723, 0], [1723, 1000], [0, 1000]], "primer tramo: 6 huellas hacia +X");
  eq(landing, [[1723, 0], [2723, 0], [2723, 1000], [1723, 1000]], "descanso: el cuadrado de la esquina");
  eq(outline2, [[2723, 1000], [2723, 2723], [1723, 2723], [1723, 1000]], "segundo tramo: sale del descanso hacia +Y");

  const [travel, arrow] = openOf(entities);
  eq(travel.vertices.map((vertex) => [Math.round(vertex.x), Math.round(vertex.y)]), [[0, 500], [2223, 500], [2223, 2723]], "la línea de subida quiebra en el centro del descanso");
  ok(near((travel.vertices[1].x - travel.vertices[0].x) * (travel.vertices[2].x - travel.vertices[1].x) + (travel.vertices[1].y - travel.vertices[0].y) * (travel.vertices[2].y - travel.vertices[1].y), 0), "y el quiebro es de 90°");
  eq([Math.round(arrow.vertices[1].x), Math.round(arrow.vertices[1].y)], [2223, 2723], "la flecha remata el ÚLTIMO tramo");
  eq(textOf(entities).rotation, undefined, "SUBE se gira con el PRIMER tramo, que aquí va hacia +X");

  const flightVolume = 1000 * TREAD_14 * RISER_14 * ((6 * 7) / 2);
  eq(solids.map((solid) => solid.root), ["escalera", "descanso", "escalera"], "cada pieza es un sólido con su raíz");
  eq(solids[0].name, "Escalera en L tramo 1 de 2: 7 × 171.4 / 287.1 mm", "el nombre lleva la receta del tramo");
  eq(solids[1].name, "Descanso 1 de 1: fondo 1,000 mm a +1,200 mm", "y el del descanso, su fondo y su cota");
  ok(near(volumeOf(solids[0]), flightVolume, 1e-9), `tramo 1 = ancho · h · c · 6 · 7 / 2 = ${flightVolume.toFixed(0)}`);
  ok(near(volumeOf(solids[2]), flightVolume, 1e-9), "tramo 2, el mismo dentado");
  ok(near(volumeOf(solids[1]), 1000 * 1000 * RISER_14 * 7, 1e-9), "descanso = ancho² · c · 7 (siete contrahuellas subidas)");
  const node = solids[2].nodes[0];
  assert.ok(node.op === "extrude");
  eq(node.frame?.origin, { x: 2722.857142857143, y: 1000, z: 1200 }, "el segundo tramo arranca EN el descanso, a +1.200");
  ok(near(volumeOf(solids[0]) + volumeOf(solids[1]) + volumeOf(solids[2]), 2 * flightVolume + 1000 * 1000 * RISER_14 * 7, 1e-9), "y el volumen total es la suma de las piezas");

  eq(shared(entities), [2, 2], "tramo y descanso comparten su arista: no hay hueco por donde caerse");
}

/* ══ LA ESCALERA EN U ═══════════════════════════════════════════════════ */
{
  const { entities, solids, notice } = built(drive([keyword("Forma"), keyword("U"), point(0, 0), point(1000, 0)]));
  eq(solids.length, 5, "tres tramos y dos descansos");
  eq(linesOf(entities).length, 3 + 3 + 2, "contrahuellas interiores de 5 + 5 + 4");
  eq(entities.length, 5 + 8 + 1 + 1 + 1 + 5, "cinco contornos, ocho contrahuellas, subida, flecha, SUBE y cinco sólidos");
  ok(notice.endsWith("Escalera en U: 5 + 5 + 4 contrahuellas por tramo, 2 descansos de 1,000 mm de fondo."), `el reparto en U: ${notice}`);

  const pieces = measured(entities);
  const advance = pieces.reduce((sum, piece) => sum + piece.advance, 0);
  ok(near(advance, 11 * TREAD_14 + 2000), "desarrollo medido = (4 + 4 + 3) huellas + dos descansos");
  ok(near(advance, 5158.571428571428), "que es el 5.158,6 mm del aviso");
  ok(pieces.every((piece) => near(piece.width, 1000)), "ninguna pieza se estrecha");
  ok(near(pieces[1].advance, 1000) && near(pieces[3].advance, 1000), "los dos descansos, con su fondo = ancho");
  ok(near(pieces[0].heading.x * pieces[2].heading.x + pieces[0].heading.y * pieces[2].heading.y, 0), "el segundo tramo gira 90°");
  ok(near(pieces[0].heading.x * pieces[4].heading.x + pieces[0].heading.y * pieces[4].heading.y, -1), "y el tercero vuelve ANTIPARALELO al primero: eso es la U");

  const outlines = closedOf(entities).map((polyline) => polyline.vertices.map((vertex) => [Math.round(vertex.x), Math.round(vertex.y)]));
  eq(outlines[4], [[1149, 3149], [287, 3149], [287, 2149], [1149, 2149]], "el tercer tramo baja de vuelta hacia −X, sobre el primero");
  const [travel] = openOf(entities);
  eq(travel.vertices.length, 4, "la línea de subida quiebra dos veces: una por descanso");
  eq(travel.vertices.map((vertex) => [Math.round(vertex.x), Math.round(vertex.y)]), [[0, 500], [1649, 500], [1649, 2649], [287, 2649]], "por los centros de los dos descansos");

  eq(solids.map((solid) => solid.root), ["escalera", "descanso", "escalera", "descanso", "escalera"], "tramo, descanso, tramo, descanso, tramo");
  eq(solids[3].name, "Descanso 2 de 2: fondo 1,000 mm a +1,714.3 mm", "el segundo descanso está a diez contrahuellas");
  const flight = (risers: number) => 1000 * TREAD_14 * RISER_14 * (((risers - 1) * risers) / 2);
  ok(near(volumeOf(solids[0]), flight(5), 1e-9), "tramo de 5: ancho · h · c · 4 · 5 / 2");
  ok(near(volumeOf(solids[2]), flight(5), 1e-9), "el segundo, igual");
  ok(near(volumeOf(solids[4]), flight(4), 1e-9), "el tercero, de 4 contrahuellas");
  ok(near(volumeOf(solids[1]), 1000 * 1000 * RISER_14 * 5, 1e-9), "descanso 1 = ancho² · c · 5");
  ok(near(volumeOf(solids[3]), 1000 * 1000 * RISER_14 * 10, 1e-9), "descanso 2 = ancho² · c · 10");
  eq(shared(entities), [2, 2, 2, 2], "las cinco piezas se tocan de dos en dos: la U es continua");
}

/* ── Descanso: el fondo se agranda, y el reglamento pone el piso ────────── */
{
  const driven = drive([keyword("Forma"), keyword("Ele"), keyword("Descanso"), distance(1500), point(0, 0), point(1000, 0)]);
  eq(driven.prompts[2], "Precise el punto de arranque de la escalera", "elegida la forma, la orden vuelve a pedir el arranque");
  eq(driven.prompts[3], "Precise el fondo del descanso", "y Descanso pide el fondo");
  const { entities, solids, notice } = built(driven);
  const pieces = measured(entities);
  ok(near(pieces[1].advance, 1500), "el descanso mide el fondo tecleado");
  ok(near(pieces.reduce((sum, piece) => sum + piece.advance, 0), 2 * 6 * TREAD_14 + 1500), "y el desarrollo crece con él");
  ok(notice.includes("1 descanso de 1,500 mm de fondo."), `el aviso lo dice: ${notice}`);
  ok(near(volumeOf(solids[1]), 1000 * 1500 * RISER_14 * 7, 1e-9), "descanso = ancho · fondo · c · k");

  const asked = drive([keyword("Forma"), keyword("Ele"), keyword("Descanso")]);
  eq(asked.step.prompt.message, "Precise el fondo del descanso", "Descanso pide el fondo");
  eq(asked.step.prompt.defaultValue, "1000", "y enseña el mínimo vigente, que es el ancho");
  eq(asked.options, [], "el fondo se teclea, no se elige");

  eq(
    messageOf(drive([keyword("Forma"), keyword("Ele"), keyword("Descanso"), distance(800)])),
    "Descanso de 800 mm de fondo: el reglamento pide cuando menos el ancho de la escalera, 1,000 mm.",
    "un descanso más estrecho que la escalera se niega con las dos cifras",
  );
  eq(
    messageOf(drive([keyword("Forma"), keyword("Ele"), keyword("Descanso"), distance(0)])),
    "STAIR: el fondo del descanso tiene que ser mayor que cero.",
    "y un fondo de cero, antes que eso",
  );
  // El fondo se mide contra el ancho VIGENTE, no contra el que había al
  // teclearlo: ensanchar la escalera después deja corto el descanso, y se
  // dice en ese momento y no dos clics más tarde.
  eq(
    messageOf(drive([keyword("Forma"), keyword("Ele"), keyword("Descanso"), distance(1000), keyword("aNcho"), distance(1500)])),
    "Descanso de 1,000 mm de fondo: el reglamento pide cuando menos el ancho de la escalera, 1,500 mm.",
    "ensanchar la escalera con el descanso ya tecleado se niega al ensanchar",
  );
}

/* ── El reparto imposible se niega con el número, al teclear la forma ───── */
{
  eq(
    messageOf(drive([keyword("Altura"), distance(1000), keyword("Forma"), keyword("U")])),
    `6 contrahuellas no se reparten en 3 tramos (2 + 2 + 2): un tramo con menos de ${CAD_STAIR_MIN_FLIGHT_RISERS} contrahuellas no es un tramo. ` +
      "Suba la altura a salvar o baje la contrahuella máxima.",
    "seis contrahuellas no dan tres tramos",
  );
  eq(
    messageOf(drive([keyword("Forma"), keyword("U"), keyword("Altura"), distance(1200)])),
    "7 contrahuellas no se reparten en 3 tramos (3 + 2 + 2): un tramo con menos de 3 contrahuellas no es un tramo. " +
      "Suba la altura a salvar o baje la contrahuella máxima.",
    "y bajar la altura DESPUÉS de elegir la U se niega igual, antes de gastar dos clics",
  );
  eq(messageOf(drive([keyword("Altura"), distance(800), keyword("Forma"), keyword("Ele")])), "5 contrahuellas no se reparten en 2 tramos (3 + 2): un tramo con menos de 3 contrahuellas no es un tramo. Suba la altura a salvar o baje la contrahuella máxima.", "cinco en L dejan un tramo de dos");

  // El mínimo por tramo rige el REPARTO: la escalerilla recta de dos peldaños
  // sigue siendo legítima, porque ahí no hay nada que repartir.
  const short = cadStairDesign({ rise: 300, width: 1000, tread: null, maxRiser: 180, unit: "mm" });
  assert.ok(!("refused" in short));
  eq(short.flights, [2], "300 mm de altura son dos contrahuellas rectas, y se dibujan");
  const refusedEle = cadStairDesign({ rise: 300, width: 1000, tread: null, maxRiser: 180, form: "ele", unit: "mm" });
  ok("refused" in refusedEle, "las mismas dos en L no son dos tramos");
  const sixInEle = cadStairDesign({ rise: 1000, width: 1000, tread: null, maxRiser: 180, form: "ele", unit: "mm" });
  assert.ok(!("refused" in sixInEle));
  eq(sixInEle.flights, [3, 3], "seis en L sí: 3 + 3, el mínimo justo");
}

/* ── Forma: el prompt, el default y la vuelta a Recto ───────────────────── */
{
  const asked = drive([keyword("Forma")]);
  eq(asked.options, ["Recto", "Ele", "U"], "las tres formas");
  eq(asked.step.prompt.defaultOption, "Recto", "y el default es la recta de siempre");
  const back = drive([keyword("Forma"), keyword("Ele"), keyword("Forma")]);
  eq(back.step.prompt.defaultOption, "Ele", "elegida la L, el default pasa a ser la L");
  const returned = drive([keyword("Forma"), keyword("Ele"), keyword("Forma"), keyword("Recto"), point(0, 0), point(1000, 0)]);
  eq(built(returned).solids.length, 1, "volver a Recto vuelve a la escalera de un tramo");
  const kept = drive([keyword("Forma"), keyword("Ele"), keyword("Forma"), enter, point(0, 0), point(1000, 0)]);
  eq(built(kept).solids.length, 3, "y Enter en el prompt de forma no la cambia");
  const withLanding = drive([keyword("Forma"), keyword("Ele")]);
  eq(withLanding.options, ["aNcho", "Altura", "Huella", "Contrahuella", "Forma", "Descanso"], "con descanso, la palabra Descanso aparece");
  const ignored = drive([keyword("Descanso"), point(0, 0), point(1000, 0)]);
  eq(built(ignored).solids.length, 1, "y en recta se ignora: no hay descanso que medir");
}

/* ── En metros, la L se ata a la unidad igual que la recta ──────────────── */
{
  const { entities, solids, notice } = built(drive([keyword("Forma"), keyword("Ele"), point(0, 0), point(1, 0)], makeContext("m")));
  const pieces = measured(entities);
  ok(near(pieces[1].advance, 1), "el descanso mide 1 m de fondo, no 1.000 m");
  ok(near(pieces.reduce((sum, piece) => sum + piece.advance, 0), 2 * 6 * (0.63 - 2 * (2.4 / 14)) + 1), "desarrollo en metros");
  ok(notice.includes("1 descanso de 1,000 mm de fondo."), "y los números se dicen en mm, que es como se leen en obra");
  ok(near(volumeOf(solids[1]), 1 * 1 * (2.4 / 14) * 7, 1e-9), "el descanso, en m³ del documento");
}

console.log(
  `architecture-stair: ${checks} comprobaciones (117 repartos de N entre 1, 2 y 3 tramos incluidos) · `
    + `recta 2400 → 14 × 171,4 / 287,1 (desarrollo 3.732,9) con hash SHA-256 intacto, ` +
    `L 7 + 7 y descanso de 1.000 (desarrollo 4.445,7), U 5 + 5 + 4 con dos descansos (5.158,6), ` +
    `volúmenes por fórmula del dentado y del descanso`,
);
