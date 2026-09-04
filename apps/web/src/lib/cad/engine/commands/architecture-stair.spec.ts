/**
 * STAIR contra fórmulas en PAPEL (Ola E, 2026-09-02).
 *
 * El reparto de contrahuellas y huellas se contrasta con la aritmética
 * cerrada del reglamento y de Blondel, y el volumen del sólido —calculado por
 * el kernel B-rep sobre el árbol PERSISTIDO, lo que viaja al servidor— con la
 * fórmula del dentado: `ancho · h · c · (N − 1) · N / 2`.
 *
 *   H = 2400 (la altura de planta de WALL): N = ⌈2400/180⌉ = 14, c = 171,43,
 *   h = 630 − 2c = 287,14, desarrollo 13 · h = 3.732,86.
 *   H = 3000 con Huella 280: N = 17, c = 176,47, h = 280, desarrollo 4.480,
 *   2c + h = 632,9 (dentro de 600–650).
 */
import { strict as assert } from "node:assert";
import { planarBodyVolume } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { cadStairDesign, cadStairProfile, CAD_STAIR_MAX_RISER_MM, CAD_STAIR_MIN_TREAD_MM } from "./architecture-stair";

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
  const solid = entities.find((entity): entity is CadSolid3dEntity => entity.type === "solid3d");
  assert.ok(solid, "hay un SOLID3D");
  return { entities, solid: solid!, notice: result.notice ?? "" };
}

function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}

const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));
const linesOf = (entities: CadEntity[]) => entities.filter((entity) => entity.type === "line");
const polylinesOf = (entities: CadEntity[]) => entities.filter((entity): entity is Extract<CadEntity, { type: "polyline" }> => entity.type === "polyline");
const textOf = (entities: CadEntity[]) => {
  const text = entities.find((entity): entity is Extract<CadEntity, { type: "text" }> => entity.type === "text");
  assert.ok(text, "hay un TEXT");
  return text!;
};

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

/* ── Dos clics con los defaults: planta y sólido ────────────────────────── */
{
  const driven = drive([point(0, 0), point(1000, 0)]);
  eq(driven.prompts[0], "Precise el punto de arranque de la escalera", "primer prompt");
  eq(driven.prompts[1], "Precise la dirección de subida", "segundo prompt");
  const { entities, solid, notice } = built(driven);
  eq(entities.length, 1 + 12 + 1 + 1 + 1 + 1, "contorno + 12 contrahuellas interiores + subida + flecha + SUBE + sólido");
  eq(
    notice,
    "STAIR: 14 contrahuellas de 171.4 mm y 13 huellas de 287.1 mm; desarrollo 3,732.9 mm, ancho 1,000 mm; 2c + h = 630 mm.",
    "la orden dice los números al terminar",
  );
  const run = 13 * (630 - 2 * (2400 / 14));
  const [outline, travel, arrow] = polylinesOf(entities);
  eq(outline.closed, true, "el contorno está cerrado");
  eq(outline.vertices.map((vertex) => [Math.round(vertex.x * 1000) / 1000, vertex.y, vertex.z]), [[0, 0, 0], [Math.round(run * 1000) / 1000, 0, 0], [Math.round(run * 1000) / 1000, 1000, 0], [0, 1000, 0]], "contorno: desarrollo × ancho, a la izquierda del sentido de subida");
  const lines = linesOf(entities);
  eq(lines.length, 12, "N − 2 contrahuellas interiores como LINE");
  ok(lines.every((line, index) => line.type === "line" && near(line.start.x, (index + 1) * (run / 13)) && line.start.y === 0 && line.end.y === 1000), "cada contrahuella cruza el ancho a k · h");
  eq(travel.closed, false, "la línea de subida es abierta");
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
  const [outline] = polylinesOf(entities);
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
  const [outline] = polylinesOf(entities);
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
  const [outline] = polylinesOf(entities);
  ok(near(outline.vertices[2].y, 1), "ancho de 1 m, no de 1000 m");
  ok(near(outline.vertices[1].x, 13 * (0.63 - 2 * (2.4 / 14))), "desarrollo de 3,73 m");
  ok(notice.startsWith("STAIR: 14 contrahuellas de 171.4 mm"), "y los números se dicen en mm, que es como se leen en obra");
}

/* ── La previsualización es la planta entera ────────────────────────────── */
{
  const context = makeContext("mm", { x: 2000, y: 0 });
  const step = descriptor!.step(descriptor!.begin(context).state, point(0, 0), context);
  eq(step.preview?.length, 1 + 12 + 1 + 1, "contorno, 12 contrahuellas, subida y flecha bajo el cursor");
  eq(step.prompt.options.map((option) => option.keyword), ["aNcho", "Altura", "Huella", "Contrahuella"], "las cuatro palabras clave siguen disponibles");
}

console.log(`architecture-stair: ${checks} comprobaciones · 2400 → 14 × 171,4 / 287,1 (desarrollo 3.732,9), 3000 con Huella 280 → 17 × 176,5 / 280, volúmenes por fórmula del dentado`);
