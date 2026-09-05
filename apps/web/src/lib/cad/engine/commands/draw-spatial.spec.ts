/**
 * La COTA en los comandos de dibujo (Ola C, 2026-09-02).
 *
 * Medido antes de la ola: PLINE escribía `z: 0` fijo, RECTANG calculaba en el
 * plano del mundo, CIRCLE y ARC aplanaban el centro y el motor rechazaba a los
 * cuatro en cuanto el SCU salía del plano `z = 0`, elevado o inclinado por
 * igual. Aquí se fija lo que cada uno sabe hacer ahora y, con el mismo
 * cuidado, lo que sigue rechazando y cómo lo dice.
 *
 * Sin anfitrión: se llama a `begin`/`step` con un contexto de tres líneas y,
 * cuando hace falta un SCU, con un `CadSystemVariableStore` parcheado con
 * `cadUcsVariablePatch`. Los puntos se pasan ya en coordenadas del MUNDO, que
 * es como llegan del puntero (`cadDrawingPoint(wx, wy, wz)`).
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { cadCommandEngineReduce, EMPTY_CAD_COMMAND_ENGINE } from "../command-engine";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { CadSystemVariableStore, cadUcsVariablePatch } from "../../system-variables";
import { cadUcsFromPlane, cadUcsPlaneDistance, ucsToWorld, type CadNamedUcs } from "../../ucs";
import { CAD_DRAW_PLINE_COMMANDS } from "./draw-pline";
import { CAD_DRAW_RECTANG_COMMANDS } from "./draw-rectang";
import { CAD_DRAW_BASIC_COMMANDS } from "./draw-basics";
import { CAD_DRAW_CURVE_COMMANDS } from "./draw-curves";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

function variablesFor(ucs: CadNamedUcs | null): CadSystemVariableStore {
  const store = new CadSystemVariableStore();
  if (ucs) for (const [name, value] of Object.entries(cadUcsVariablePatch(ucs))) store.publish(name, value);
  return store;
}

function makeContext(ucs: CadNamedUcs | null = null): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    variables: variablesFor(ucs),
    newEntityId: () => `id${++ids}`,
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

function drive(descriptor: (typeof CAD_DRAW_PLINE_COMMANDS)[number], inputs: readonly CadCommandInput[], ucs: CadNamedUcs | null = null) {
  const context = makeContext(ucs);
  let step = descriptor.begin(context);
  const prompts: string[] = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
    prompts.push(step.prompt.message);
  }
  return { result: step.result, prompts, step };
}

function inserted(result: ReturnType<typeof drive>["result"]) {
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}`);
  const command = result.commands[0];
  assert.ok(command && command.type === "insert");
  if (command.type !== "insert") throw new Error("tipo");
  return command.entity;
}

/** Un faldón: plano por (0,0,0) con normal (0, −sin 30°, cos 30°) y la X del mundo. */
const faldon = (() => {
  const outcome = cadUcsFromPlane("FALDON", { x: 0, y: 0, z: 0 }, { x: 0, y: -0.5, z: Math.sqrt(3) / 2 }, { x: 1, y: 0, z: 0 });
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.ucs;
})();
/** La planta del segundo piso: llana, a +3000. */
const planta = (() => {
  const outcome = cadUcsFromPlane("PLANTA2", { x: 0, y: 0, z: 3000 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.ucs;
})();

const PLINE = CAD_DRAW_PLINE_COMMANDS[0];
const RECTANG = CAD_DRAW_RECTANG_COMMANDS[0];
const CIRCLE = CAD_DRAW_BASIC_COMMANDS.find((descriptor) => descriptor.name === "CIRCLE")!;
const ARC = CAD_DRAW_CURVE_COMMANDS.find((descriptor) => descriptor.name === "ARC")!;

/* ── PLINE conserva la cota de cada vértice ───────────────────────────────── */
{
  const entity = inserted(drive(PLINE, [point(0, 0, 0), point(1000, 0, 500), point(1000, 800, 1200), enter]).result);
  ok(entity.type === "polyline", "PLINE produce una polilínea");
  if (entity.type === "polyline") {
    ok(
      entity.vertices.map((vertex) => vertex.z).every((z, index) => near(z, [0, 500, 1200][index])),
      "cada vértice conserva la cota que trajo el punto (antes: z = 0 fijo)",
    );
  }
  const plano = inserted(drive(PLINE, [point(0, 0), point(10, 0), enter]).result);
  ok(plano.type === "polyline" && plano.vertices.every((vertex) => vertex.z === 0), "sin cota en el punto, la polilínea sigue en el suelo");
}

/* ── PLINE · Longitud prolonga en 3D cuando el tramo está inclinado ────────── */
{
  // Tramo de (0,0,0) a (300,0,400): mide 500. Longitud 250 sigue POR ESA
  // recta, no por su sombra: llega a (450, 0, 600), no a (550, 0, 400).
  const entity = inserted(drive(PLINE, [point(0, 0, 0), point(300, 0, 400), keyword("Longitud"), distance(250), enter]).result);
  ok(entity.type === "polyline" && entity.vertices.length === 3, "Longitud añadió un tercer vértice");
  if (entity.type === "polyline") {
    const last = entity.vertices[2];
    ok(near(last.x, 450, 1e-9) && near(last.y, 0, 1e-9) && near(last.z, 600, 1e-9), `el tercer vértice está en (450, 0, 600), no en la sombra: (${last.x}, ${last.y}, ${last.z})`);
  }
  // En planta, Longitud sigue siendo la de siempre y conserva la cota del plano.
  const flat = inserted(drive(PLINE, [point(0, 0, 3000), point(300, 0, 3000), keyword("Longitud"), distance(250), enter]).result);
  ok(flat.type === "polyline" && near(flat.vertices[2].x, 550) && near(flat.vertices[2].z, 3000), "en una planta elevada prolonga en planta y a la misma cota");
}

/* ── PLINE · Arco se rechaza sobre un plano inclinado, diciéndolo ─────────── */
{
  const driven = drive(PLINE, [point(0, 0, 0), keyword("Arco")], faldon);
  ok(driven.result === undefined, "Arco sobre el faldón no termina el comando");
  ok(/Arco no está disponible con el SCU inclinado/.test(driven.prompts.at(-1) ?? ""), "y el prompt dice por qué");
  ok(driven.step.state && (driven.step.state as { mode: string }).mode === "line", "la orden sigue en modo Línea");
  ok(!(driven.step.prompt.options ?? []).some((option) => option.keyword === "Arco"), "y ya no ofrece Arco entre sus opciones");
  const ground = drive(PLINE, [point(0, 0), keyword("Arco")]);
  ok((ground.step.state as { mode: string }).mode === "arc", "en el plano del mundo Arco sigue entrando");
}

/* ── RECTANG calcula EN el plano del SCU ──────────────────────────────────── */
{
  // Las esquinas llegan en coordenadas del MUNDO, como del puntero sobre el faldón.
  const first = ucsToWorld({ x: 0, y: 0, z: 0 }, faldon);
  const opposite = ucsToWorld({ x: 400, y: 200, z: 0 }, faldon);
  const entity = inserted(drive(RECTANG, [point(first.x, first.y, first.z), point(opposite.x, opposite.y, opposite.z)], faldon).result);
  ok(entity.type === "polyline" && entity.vertices.length === 4, "cuatro esquinas");
  if (entity.type === "polyline") {
    ok(entity.vertices.every((vertex) => Math.abs(cadUcsPlaneDistance(vertex, faldon)) <= 1e-9), "las cuatro esquinas están SOBRE el faldón");
    const corner = ucsToWorld({ x: 400, y: 0, z: 0 }, faldon);
    ok(near(entity.vertices[1].x, corner.x) && near(entity.vertices[1].y, corner.y) && near(entity.vertices[1].z, corner.z), "la segunda esquina es (400, 0) del faldón llevada al mundo");
    ok(entity.vertices.some((vertex) => Math.abs(vertex.z) > 1), "y el rectángulo tiene cota: no es su sombra");
  }
  // Elevación: a lo largo de la Z del SCU, es decir, separándose del faldón.
  const raised = inserted(drive(RECTANG, [keyword("Elevación"), distance(100), point(first.x, first.y, first.z), point(opposite.x, opposite.y, opposite.z)], faldon).result);
  ok(raised.type === "polyline" && raised.vertices.every((vertex) => near(cadUcsPlaneDistance(vertex, faldon), 100, 1e-9)), "Elevación 100 separa el rectángulo 100 del faldón por su normal");
  // Empalme sobre el faldón: un bulge es un arco en planta y no cabe. Se dice.
  const filleted = drive(RECTANG, [keyword("Empalme"), distance(20), point(first.x, first.y, first.z), point(opposite.x, opposite.y, opposite.z)], faldon);
  ok(filleted.result?.kind === "message" && /empalme no está disponible con el SCU inclinado/i.test(filleted.result.text), "Empalme sobre el faldón termina con su motivo, sin escribir");
  // En el plano del mundo, exactamente lo de siempre.
  const ground = inserted(drive(RECTANG, [point(0, 0), point(400, 200)]).result);
  ok(ground.type === "polyline" && ground.vertices.map((vertex) => [vertex.x, vertex.y, vertex.z]).flat().join(",") === "0,0,0,400,0,0,400,200,0,0,200,0", "sin SCU el rectángulo sale como antes");
}

/* ── CIRCLE y ARC conservan la cota del plano elevado ─────────────────────── */
{
  const byCenter = inserted(drive(CIRCLE, [point(10, 20, 3000), distance(5)]).result);
  ok(byCenter.type === "circle" && near(byCenter.center.z, 3000), "CIRCLE centro-radio: el centro conserva la cota");
  const by2p = inserted(drive(CIRCLE, [keyword("2P"), point(0, 0, 3000), point(10, 0, 3000)]).result);
  ok(by2p.type === "circle" && near(by2p.center.x, 5) && near(by2p.center.z, 3000), "CIRCLE 2P: el centro calculado toma la cota del primer punto");
  const by3p = inserted(drive(ARC, [point(0, 0, 3000), point(10, 10, 3000), point(20, 0, 3000)]).result);
  ok(by3p.type === "arc" && near(by3p.center.x, 10) && near(by3p.center.z, 3000), "ARC por tres puntos: el centro calculado toma la cota del primer punto");
}

/* ── El motor distingue elevado de inclinado ─────────────────────────────── */
{
  const registry = CAD_COMMAND_REGISTRY_V2;
  const run = (name: string, inputs: readonly CadCommandInput[], ucs: CadNamedUcs | null) => {
    const context = makeContext(ucs);
    let state = EMPTY_CAD_COMMAND_ENGINE;
    const messages: string[] = [];
    let executed = 0;
    const dispatch = (action: Parameters<typeof cadCommandEngineReduce>[1]) => {
      const reduction = cadCommandEngineReduce(state, action, context, registry);
      state = reduction.state;
      for (const effect of reduction.effects) {
        if (effect.kind === "message") messages.push(effect.text);
        if (effect.kind === "execute") executed += 1;
      }
    };
    dispatch({ kind: "invoke", command: name });
    for (const input of inputs) dispatch({ kind: "input", input });
    return { messages, executed };
  };
  const elevated = run("CIRCLE", [point(10, 20, 3000), distance(5)], planta);
  ok(elevated.executed === 1 && elevated.messages.length === 0, "CIRCLE (`spatial: \"elevation\"`) dibuja sobre la planta elevada sin protestar");
  const inclined = run("CIRCLE", [point(0, 0, 0), distance(5)], faldon);
  ok(inclined.executed === 0 && inclined.messages.some((text) => /plano inclinado/.test(text) && /CIRCLE/.test(text)), "y sobre el faldón se niega nombrando el plano inclinado");
  const plain = run("ELLIPSE", [point(0, 0, 3000), point(40, 0, 3000), distance(10)], planta);
  ok(plain.executed === 0 && plain.messages.some((text) => /elevado/.test(text) && /ELLIPSE/.test(text)), "ELLIPSE (sin `spatial`) se niega sobre la planta elevada nombrando la elevación");
  const spatialOnSlope = run("PLINE", [point(0, 0, 0), point(100, 0, 0), enter], faldon);
  ok(spatialOnSlope.executed === 1, "PLINE (`spatial: true`) dibuja sobre el faldón");
}

console.log(`draw-spatial: ${checks} comprobaciones sobre la cota en PLINE, RECTANG, CIRCLE y ARC`);
