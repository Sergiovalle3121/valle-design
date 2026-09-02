import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { importDxfPrimitives } from "../dxf-import";
import { cadDxfPrimitivesToCanonicalEntities } from "../dxf-cad-document";
import { createCadVariableAccess } from "../system-variables";
import { CAD_COMMAND_REGISTRY_V2 } from "../engine/index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../engine/command-types";
import {
  CAD_HATCH_STITCH_DEFAULT,
  cadHatchRegionArea,
  cadHatchRegionAtPoint,
  cadHatchRegionFromObjects,
} from "../engine/commands/hatch-support";
import {
  DENTRO as INTERIOR,
  HOLGURA_PERIMETRO,
  HOLGURA_SUPERFICIE,
  PERIMETRO,
  SUPERFICIE,
  TRAMOS,
  dxfDeOtroDespacho,
  plantaDeDespacho,
  shoelace,
  tramosMalEmpatados,
} from "./planta-mal-empatada";

/**
 * LA PRUEBA DE DESPACHO — área 2 del listón (Ola D, 2026-09-02).
 *
 * «Recibir un DWG, unir 34 líneas mal empatadas y obtener perímetro y
 * superficie.» Medido el 2026-09-01 (distancia-autocad-completo-20260901.md,
 * FRENTE 3): fallaba en el PRIMER paso. No existía tolerancia de hueco
 * (HPGAPTOL), `stitchCadBoundaryPaths` se llamaba con un solo argumento desde
 * sus dos llamadores, y JOIN no rellenaba huecos entre objetos distintos.
 *
 * Aquí se RECIBE un DXF con 34 LINE que forman una planta con los tramos
 * separados entre 0,2 y 0,92 mm —como llega de otro despacho— y se recorre lo
 * que haría quien lo abre:
 *
 *   1. HATCH pinchando dentro con HPGAPTOL = 0 → «no está dentro de ningún
 *      contorno cerrado». Es la verdad: no lo está.
 *   2. HPGAPTOL = 2 → el sombreado sale con la superficie de la planta y NO
 *      asociativo (el regenerador cose con la de fábrica y lo marcaría roto al
 *      primer movimiento; el prompt lo dice). Con HPGAPTOL = 0,5 sigue sin
 *      cerrar: la tolerancia es un número, no un interruptor.
 *   3. Sin tocar la variable, `Tolerancia` 2 en la propia orden da lo mismo.
 *   4. BOUNDARY con la misma tolerancia dibuja UNA polilínea cerrada de 34
 *      vértices.
 *   5. JOIN con `Tolerancia` 2 sobre las 34 líneas da UNA polilínea cerrada;
 *      sin tolerancia dice que teclee Tolerancia.
 *   6. AREA Objeto sobre esa polilínea: superficie y perímetro.
 *
 * La planta, su DXF, el oráculo en papel (92.840.000 mm², 46.297,06 mm) y las
 * holguras están en `planta-mal-empatada.ts`, que comparte con el golden 74
 * para que los dos midan la misma planta.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} ≠ ${expected} (±${tolerance})`,
  );
  checks += 1;
};

/* ── La planta, en papel ─────────────────────────────────────────────────── */
{
  const exact = plantaDeDespacho();
  eq(exact.length, TRAMOS, "la planta tiene 34 vértices, luego 34 tramos");
  near(shoelace(exact), SUPERFICIE, 1e-6, "el papel y la fórmula del cordón coinciden en la superficie");
}

/* ── El DXF que llega: 34 LINE mal empatadas ─────────────────────────────── */

function recibir(): CadDocument {
  const imported = importDxfPrimitives(dxfDeOtroDespacho());
  const entities = cadDxfPrimitivesToCanonicalEntities(imported.primitives);
  eq(entities.length, TRAMOS, "las 34 LINE llegan del DXF");
  ok(entities.every((entity) => entity.type === "line"), "y llegan como LINE");
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "MUROS", name: "MUROS", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

{
  const gaps = tramosMalEmpatados();
  const worst = Math.max(...gaps.map((tramo) => tramo.gap));
  const best = Math.min(...gaps.map((tramo) => tramo.gap));
  ok(worst <= 0.92 && best >= 0.2, `huecos entre 0,2 y 0,92 mm (medidos: ${best} … ${worst})`);
  ok(best > CAD_HATCH_STITCH_DEFAULT * 100, "y todos muy por encima del cosido de fábrica (1e-4)");
}

/* ── El arnés: comandos del PRODUCTO con variables de sistema ────────────── */

function context(doc: CadDocument, variables: Record<string, number>, selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `despacho${++ids}`,
    variables: createCadVariableAccess(variables),
  };
}

function drive(
  name: string,
  inputs: readonly CadCommandInput[],
  ctx: CadCommandContext,
): { result: CadCommandResult | undefined; prompts: string[] } {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let step = descriptor.begin(ctx);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
    prompts.push(step.prompt.message);
  }
  return { result: step.result, prompts };
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const select = (entityIds: readonly string[]): CadCommandInput => ({ kind: "selection", entityIds: [...entityIds] });
const enter: CadCommandInput = { kind: "enter" };
const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });

type Polyline = Extract<CadEntity, { type: "polyline" }>;

function inserted(result: CadCommandResult | undefined, what: string): CadEntity[] {
  assert.ok(
    result?.kind === "document",
    `${what}: debía escribir; dio ${result?.kind}${result?.kind === "message" ? ` «${result.text}»` : ""}`,
  );
  checks += 1;
  return result.commands.flatMap((command) => (command.type === "insert" ? [command.entity as CadEntity] : []));
}

type Hatch = Extract<CadEntity, { type: "hatch" }>;
const hatchOf = (result: CadCommandResult | undefined, what: string): Hatch => {
  const hatches = inserted(result, what).filter((entity): entity is Hatch => entity.type === "hatch");
  eq(hatches.length, 1, `${what}: UN sombreado`);
  return hatches[0];
};
const polylinesOf = (result: CadCommandResult | undefined, what: string): Polyline[] =>
  inserted(result, what).filter((entity): entity is Polyline => entity.type === "polyline");

const DENTRO = point(INTERIOR.x, INTERIOR.y);

/* ── 1. Con HPGAPTOL = 0 el contorno NO cierra, y se dice ────────────────── */
{
  const doc = recibir();
  const { result } = drive("HATCH", [DENTRO], context(doc, { HPGAPTOL: 0 }));
  ok(result?.kind === "message", "HATCH sin tolerancia no rellena");
  ok(
    result?.kind === "message" && result.text.includes("no está dentro de ningún contorno cerrado"),
    "y explica que el punto no está dentro de un contorno cerrado",
  );
}

/* ── 2. HPGAPTOL = 2 cierra; 0,5 no basta ────────────────────────────────── */
{
  const doc = recibir();
  const { result, prompts } = drive("HATCH", [DENTRO], context(doc, { HPGAPTOL: 2 }));
  const hatch = hatchOf(result, "HATCH con HPGAPTOL = 2");
  eq(hatch.boundaries.length, 1, "de un solo contorno");
  eq(hatch.boundaries[0].length, TRAMOS, "con los 34 vértices de la planta");
  near(cadHatchRegionArea(hatch.boundaries), SUPERFICIE, HOLGURA_SUPERFICIE, "y la superficie del papel");
  eq(hatch.associative, undefined, "nace NO asociativo: el regenerador cose con la de fábrica");
  eq(hatch.boundaryRefs, undefined, "y no cuelga de las líneas");
  ok(
    prompts[0].includes("Tolerancia de hueco 2") && prompts[0].includes("no será asociativo"),
    `el prompt lo dijo antes de pinchar: «${prompts[0]}»`,
  );

  const half = drive("HATCH", [DENTRO], context(doc, { HPGAPTOL: 0.5 })).result;
  ok(half?.kind === "message", "con HPGAPTOL = 0,5 los huecos de 0,9 siguen abiertos: la tolerancia es un número");
}

/* ── 3. `Tolerancia` en la orden, sin tocar la variable ──────────────────── */
{
  const doc = recibir();
  const { result, prompts } = drive(
    "HATCH",
    [keyword("Tolerancia"), distance(2), DENTRO],
    context(doc, { HPGAPTOL: 0 }),
  );
  const hatch = hatchOf(result, "HATCH Tolerancia 2");
  near(cadHatchRegionArea(hatch.boundaries), SUPERFICIE, HOLGURA_SUPERFICIE, "misma superficie que con la variable");
  eq(hatch.associative, undefined, "y tampoco asociativo");
  ok(prompts[1].includes("tolerancia de hueco"), "la palabra clave pide la tolerancia");
  ok(prompts[2].includes("Tolerancia de hueco 2"), "y el prompt siguiente la enseña");
  ok(!prompts[0].includes("Tolerancia de hueco"), "sin tolerancia el prompt no avisa de nada");
}

/* ── 4. BOUNDARY dibuja la planta como UNA polilínea cerrada ─────────────── */
{
  const doc = recibir();
  const { result, prompts } = drive("BOUNDARY", [DENTRO], context(doc, { HPGAPTOL: 2 }));
  const polylines = polylinesOf(result, "BOUNDARY con HPGAPTOL = 2");
  eq(polylines.length, 1, "una polilínea");
  eq(polylines[0].closed, true, "cerrada");
  eq(polylines[0].vertices.length, TRAMOS, "de 34 vértices");
  near(shoelace(polylines[0].vertices), SUPERFICIE, HOLGURA_SUPERFICIE, "que encierra la superficie del papel");
  ok(
    prompts[0].includes("Tolerancia de hueco 2") && !prompts[0].includes("asociativo"),
    "BOUNDARY avisa de la tolerancia pero no de asociatividad, que no tiene",
  );
  ok(drive("BOUNDARY", [DENTRO], context(doc, { HPGAPTOL: 0 })).result?.kind === "message", "y sin tolerancia no cierra");
}

/* ── 5. JOIN Tolerancia: las 34 líneas, una polilínea cerrada ────────────── */
function unir(doc: CadDocument): { document: CadDocument; polyline: Polyline } {
  const ids = doc.entities.map((entity) => entity.id);
  const { result, prompts } = drive(
    "JOIN",
    [keyword("Tolerancia"), distance(2), select(ids), enter],
    context(doc, { HPGAPTOL: 0 }),
  );
  ok(prompts[1].includes("distancia de aproximación"), "JOIN Tolerancia pide la distancia de aproximación");
  ok(prompts[2].includes("Distancia de aproximación 2"), "y el prompt la enseña mientras se designa");
  assert.ok(result?.kind === "document", `JOIN debía escribir; dio ${result?.kind}${result?.kind === "message" ? ` «${result.text}»` : ""}`);
  checks += 1;
  const replace = result.commands.find((command) => command.type === "replace");
  assert.ok(replace?.type === "replace" && replace.entity.type === "polyline", "JOIN sustituye la primera línea por la polilínea");
  checks += 1;
  eq(result.commands.filter((command) => command.type === "delete").length, TRAMOS - 1, "y borra las otras 33");
  const applied = executeCadEntityCommandBatch(doc, result.commands, "JOIN").document;
  const polyline = applied.entities.find((entity): entity is Polyline => entity.type === "polyline");
  assert.ok(polyline, "la polilínea existe en el documento");
  checks += 1;
  return { document: applied, polyline };
}

{
  const doc = recibir();
  const { document, polyline } = unir(doc);
  eq(document.entities.length, 1, "de 34 entidades queda UNA");
  eq(polyline.closed, true, "cerrada");
  eq(polyline.vertices.length, TRAMOS, "con 34 vértices");
  near(shoelace(polyline.vertices), SUPERFICIE, HOLGURA_SUPERFICIE, "y la superficie del papel");

  const ids = doc.entities.map((entity) => entity.id);
  const exact = drive("JOIN", [select(ids), enter], context(doc, { HPGAPTOL: 0 })).result;
  ok(exact?.kind === "message", "sin Tolerancia JOIN no une lo que no se toca");
  ok(
    exact?.kind === "message" && exact.text.includes("Teclee Tolerancia"),
    `y dice cómo unirlo: «${exact?.kind === "message" ? exact.text : ""}»`,
  );
  const half = drive("JOIN", [keyword("Tolerancia"), distance(0.5), select(ids), enter], context(doc, { HPGAPTOL: 0 })).result;
  ok(
    half?.kind === "message" && half.text.includes("a menos de 0.5"),
    "con 0,5 la negativa nombra la distancia que no bastó",
  );
}

/* ── 6. AREA Objeto: superficie y perímetro ──────────────────────────────── */
{
  const { document, polyline } = unir(recibir());
  const { result } = drive("AREA", [keyword("Objeto"), pick(polyline.id)], context(document, { HPGAPTOL: 0 }));
  assert.ok(result?.kind === "variables", `AREA debía medir; dio ${result?.kind}`);
  checks += 1;
  near(Number(result.patch.AREA), SUPERFICIE, HOLGURA_SUPERFICIE, "superficie: 92,84 m² del papel");
  near(Number(result.patch.PERIMETER), PERIMETRO, HOLGURA_PERIMETRO, "perímetro: 46.297 mm del papel");
  ok(!(result.text ?? "").includes("está abierto"), "y no hubo que cerrar nada por la cuerda: la polilínea YA está cerrada");
}

/* ── Los dos llamadores de stitchCadBoundaryPaths pasan HPGAPTOL ─────────── */
{
  const doc = recibir();
  const ids = doc.entities.map((entity) => entity.id);
  const tight = context(doc, { HPGAPTOL: 0 });
  const loose = context(doc, { HPGAPTOL: 2 });
  ok(cadHatchRegionAtPoint(INTERIOR, tight, "normal") === null, "por punto, HPGAPTOL 0: nada");
  ok(cadHatchRegionAtPoint(INTERIOR, loose, "normal") !== null, "por punto, HPGAPTOL 2: la región");
  ok(cadHatchRegionFromObjects(ids, tight, "normal") === null, "por objetos, HPGAPTOL 0: nada");
  ok(cadHatchRegionFromObjects(ids, loose, "normal") !== null, "por objetos, HPGAPTOL 2: la región");

  // Y en el código, para que un refactor no vuelva a dejar un llamador con
  // un solo argumento sin que ningún test lo note por comportamiento.
  const source = readFileSync(new URL("../engine/commands/hatch-support.ts", import.meta.url), "utf8");
  // Un nivel de paréntesis anidados: el argumento es `cadCandidateBoundaryPaths(...)`.
  const calls = source.match(/stitchCadBoundaryPaths\((?:[^()]|\([^()]*\))*\)/g) ?? [];
  eq(calls.length, 2, "hatch-support.ts llama a stitchCadBoundaryPaths exactamente dos veces");
  ok(calls.every((call) => call.includes("gapTolerance")), `y las dos pasan la tolerancia: ${calls.join(" · ")}`);
}

console.log(
  `prueba-de-despacho: ${checks} comprobaciones · un DXF con 34 LINE mal empatadas (huecos 0,2–0,92 mm) → ` +
    `HATCH que dice que no cierra con HPGAPTOL 0, cierra con 2 (no asociativo, dicho) y no con 0,5; ` +
    `Tolerancia en la orden; BOUNDARY una polilínea cerrada; JOIN Tolerancia una polilínea de 34 vértices; ` +
    `AREA Objeto ${SUPERFICIE} mm² y ${PERIMETRO.toFixed(2)} mm ± lo que mueven los huecos`,
);
