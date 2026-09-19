/**
 * TIME, VIEWRES y FIND a través del motor.
 *
 * TIME: consulta de tiempo — no muta, reporta versión y unidad del dibujo.
 * VIEWRES: variable de sistema — reporta el valor actual de resolución.
 * FIND: búsqueda de texto — encuentra coincidencias en TEXT y MTEXT.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import { emptyStyles } from "../../cad-document-shared";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import "@/lib/cad/engine/all-commands";

import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandStep,
} from "../command-types";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}

// ---------------------------------------------------------------------------
// Escena de prueba
// ---------------------------------------------------------------------------

const SCENE: CadEntity[] = [
  {
    id: "t1",
    type: "text",
    x: 100,
    y: 200,
    text: "RECÁMARA PRINCIPAL",
    layer: "0",
  },
  {
    id: "t2",
    type: "text",
    x: 300,
    y: 200,
    text: "COCINA",
    layer: "0",
  },
  {
    id: "m1",
    type: "mtext",
    insertion: { x: 500, y: 200, z: 0 },
    text: "SALA DE ESTAR — 16.00 m²",
    layer: "0",
  },
  {
    id: "linea",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1000, y: 0, z: 0 },
    layer: "0",
  },
];

function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  const byId = new Map(SCENE.map((entity) => [entity.id, entity]));
  return {
    entityIds: SCENE.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    layers: () => [],
    document: () => ({
      meta: { version: 1, schema: 9, unit: "mm" },
      entities: SCENE,
      blocks: [],
      layers: [],
      styles: emptyStyles(),
      externalReferences: [],
      modelSpace: { entityIds: SCENE.map((e) => e.id) },
      paperSpaces: [],
      constraints: [],
      unsupportedEntities: [],
      lossManifest: [],
      publications: [],
      imageDefinitions: [],
      layerStates: [],
    }),
    selection: [],
    activeLayer: "0",
    variables: {
      get: (name: string) => (name === "VIEWRES" ? 1500 : undefined),
      set: () => ({ ok: true as const, value: 0 }),
      publish: () => ({ ok: true as const, value: 0 }),
    },
    ...overrides,
  } as CadCommandContext;
}

function runCommand(
  name: string,
  inputs: CadCommandInput[],
  ctx: CadCommandContext = context(),
): CadCommandStep {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name.toUpperCase());
  ok(descriptor !== undefined, `descriptor de ${name} existe`);
  let step = descriptor!.begin(ctx);
  for (const input of inputs) {
    step = descriptor!.step(step.state, input, ctx);
  }
  return step;
}

// ---------------------------------------------------------------------------
// TIME
// ---------------------------------------------------------------------------

console.log("=== TIME ===");

{
  const step = runCommand("TIME", []);
  ok(step.result?.kind === "message", "TIME produce mensaje");
  ok(step.result !== undefined && "text" in step.result, "TIME tiene texto");
  const text = (step.result as { text: string }).text;
  ok(text.includes("Fecha actual:"), "TIME incluye fecha actual");
  ok(text.includes("Versión del dibujo: 1"), "TIME incluye versión");
  ok(text.includes("Unidad: mm"), "TIME incluye unidad");
  console.log("  TIME: " + text.replace(/\n/g, " | "));
}

// ---------------------------------------------------------------------------
// VIEWRES
// ---------------------------------------------------------------------------

console.log("=== VIEWRES ===");

{
  const step = runCommand("VIEWRES", []);
  ok(step.result?.kind === "message", "VIEWRES produce mensaje");
  const text = (step.result as { text: string }).text;
  ok(text.includes("1500"), "VIEWRES reporta valor de la variable");
  console.log("  VIEWRES: " + text);
}

{
  // Sin variable definida, usa default 1000
  const ctxNoVars = context({ variables: undefined });
  const step = runCommand("VIEWRES", [], ctxNoVars);
  const text = (step.result as { text: string }).text;
  ok(text.includes("1000"), "VIEWRES default 1000 sin variable");
  console.log("  VIEWRES (sin var): " + text);
}

// ---------------------------------------------------------------------------
// FIND
// ---------------------------------------------------------------------------

console.log("=== FIND ===");

{
  // Buscar "COCINA" → 1 coincidencia
  const step = runCommand("FIND", [
    { kind: "text", value: "COCINA" },
  ]);
  ok(step.result?.kind === "message", "FIND produce mensaje");
  const text = (step.result as { text: string }).text;
  ok(text.includes("1 coincidencia"), "FIND encuentra COCINA");
  console.log("  FIND 'COCINA': " + text);
}

{
  // Buscar "RECÁMARA" → 1 coincidencia
  const step = runCommand("FIND", [
    { kind: "text", value: "RECÁMARA" },
  ]);
  const text = (step.result as { text: string }).text;
  ok(text.includes("1 coincidencia"), "FIND encuentra RECÁMARA");
  console.log("  FIND 'RECÁMARA': " + text);
}

{
  // Buscar "m²" → 1 coincidencia (en MTEXT)
  const step = runCommand("FIND", [
    { kind: "text", value: "m²" },
  ]);
  const text = (step.result as { text: string }).text;
  ok(text.includes("1 coincidencia"), "FIND encuentra m² en MTEXT");
  console.log("  FIND 'm²': " + text);
}

{
  // Buscar "INEXISTENTE" → 0 coincidencias
  const step = runCommand("FIND", [
    { kind: "text", value: "INEXISTENTE" },
  ]);
  const text = (step.result as { text: string }).text;
  ok(text.includes("no se encontró"), "FIND no encuentra INEXISTENTE");
  console.log("  FIND 'INEXISTENTE': " + text);
}

{
  // Buscar con case-insensitive: "cocina" encuentra "COCINA"
  const step = runCommand("FIND", [
    { kind: "text", value: "cocina" },
  ]);
  const text = (step.result as { text: string }).text;
  ok(text.includes("1 coincidencia"), "FIND es case-insensitive");
  console.log("  FIND 'cocina' (case-insensitive): " + text);
}

{
  // FIND vacío → cancelado
  const step = runCommand("FIND", [
    { kind: "text", value: "" },
  ]);
  const text = (step.result as { text: string }).text;
  ok(text.includes("cancelada"), "FIND vacío cancela");
  console.log("  FIND vacío: " + text);
}

{
  // Buscar y NO reemplazar (Intro sin elegir R)
  const step1 = runCommand("FIND", [
    { kind: "text", value: "COCINA" },
  ]);
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("FIND");
  const step2 = descriptor!.step(step1.state as never, { kind: "text", value: "" }, context());
  const text = (step2.result as { text: string }).text;
  ok(text.includes("sin cambios"), "FIND sin reemplazar no muta");
  console.log("  FIND sin reemplazar: " + text);
}

console.log(`\n${checks} comprobaciones — FIND/TIME/VIEWRES OK`);
