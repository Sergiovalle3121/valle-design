/**
 * VPLAYER Color/LTipo/Grosor, tecleados y APLICADOS.
 *
 * Igual que la spec de Inutilizar/Reutilizar: no basta con que el comando
 * escriba `layerOverrides` — se mide lo que la PUBLICACIÓN proyecta después
 * (`styleFor`, `paper-space-style.ts`), en dos ventanas de la misma lámina,
 * para demostrar que el estilo es de la VENTANA y no del documento.
 */
import { strict as assert } from "node:assert";
import { parseCadDocument, serializeCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { buildCadPublishPlan, createCadPaperSpace } from "../../paper-space";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

const METADATA = {
  project: "-", drawingNumber: "-", title: "Lámina", sheetNumber: "1",
  revision: "-", discipline: "General",
};

function baseDocument(): CadDocument {
  const space = createCadPaperSpace({
    id: "layout:planta",
    name: "Planta",
    order: 0,
    paper: "A3",
    modelBounds: { x: 0, y: 0, width: 1_000, height: 600 },
    metadata: METADATA,
  });
  const second = { ...space.viewports![0], id: "layout:planta:viewport:2", name: "Coordinación" };
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "EJES", name: "EJES", color: "#00ffff", visible: true, locked: false, linetype: "CENTER", lineweight: 0.18 },
    ],
    entities: [
      { id: "eje", type: "line", layer: "EJES", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 } },
    ],
    history: [],
    modelSpace: { entityIds: ["eje"] },
    // A COLOR: en monocromo `styleFor` fuerza #111827 en todo, y una anulación
    // de color sería invisible a esta spec por una razón ajena a VPLAYER.
    paperSpaces: [{
      ...space,
      pageSetup: { ...space.pageSetup!, colorMode: "color" },
      viewports: [space.viewports![0], second],
    }],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

interface Session {
  effects: CadCommandEffect[];
  document: CadDocument;
}

type Fed = string | CadCommandInput;

function run(document: CadDocument, tokens: readonly Fed[], overrides: Partial<CadCommandContext> = {}): Session {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      document: () => current,
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      activeLayout: "layout:planta",
      paperSpaces: () => current.paperSpaces,
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `new-${effects.length}`,
      ...overrides,
    };
    const reduction =
      typeof token !== "string"
        ? cadCommandEngineReduce(state, { kind: "input", input: token }, context, registry)
        : token === "\r"
          ? cadCommandEngineReduce(state, { kind: "input", input: { kind: "enter" } }, context, registry)
          : cadCommandEngineReduce(state, { kind: "token", value: token }, context, registry);
    state = reduction.state;
    effects.push(...reduction.effects);
    for (const effect of reduction.effects)
      if (effect.kind === "execute")
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
  }
  return { effects, document: current };
}

const messages = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

function viewportStyle(document: CadDocument, viewportId: string, entityId: string) {
  const plan = buildCadPublishPlan(document);
  const commands = plan.sheets[0].viewports.find((viewport) => viewport.id === viewportId)!.commands;
  const command = commands.find((c) => c.entityId === entityId);
  assert.ok(command && command.kind === "path", `${entityId} se traza en ${viewportId}`);
  return (command as Extract<typeof command, { kind: "path" }>).style;
}

// --- VPLAYER Color fija el color SOLO en una ventana -------------------------
{
  const before = baseDocument();
  const [first, second] = before.paperSpaces[0].viewports!;
  const { document } = run(before, ["VPLAYER", "C", "EJES", "#ff00ff", first.id]);

  const written = document.paperSpaces[0].viewports!.find((v) => v.id === first.id)!;
  assert.deepEqual(written.layerOverrides, { EJES: { color: "#ff00ff" } });
  assert.equal(
    document.paperSpaces[0].viewports!.find((v) => v.id === second.id)!.layerOverrides,
    undefined,
    "la otra ventana no se toca",
  );
  assert.equal(document.meta.version - before.meta.version, 1, "UN paso de historia");

  assert.equal(viewportStyle(document, first.id, "eje").stroke, "#ff00ff", "la ventana anulada pinta el color fijado");
  assert.notEqual(viewportStyle(document, second.id, "eje").stroke, "#ff00ff", "la otra sigue con el color de capa");
}

// --- VPLAYER LTipo llega a la PUBLICACIÓN: el fallo real que corrige esta ola --
{
  // Antes de este cambio `paper-space-style.ts` guardaba `layerOverrides.linetype`
  // y nunca lo leía: la ventana anulaba color y grosor pero el eje seguía
  // saliendo CONTINUO. Esta spec falla si esa lectura se revierte.
  const before = baseDocument();
  const [first] = before.paperSpaces[0].viewports!;
  // La capa EJES ya trae CENTER; se fuerza HIDDEN SOLO en esta ventana para
  // que el patrón observado sólo pueda venir de la anulación, nunca de la capa.
  const { document } = run(before, ["VPLAYER", "LT", "EJES", "HIDDEN", first.id]);
  assert.equal(document.paperSpaces[0].viewports![0].layerOverrides?.EJES?.linetype, "HIDDEN");
  assert.equal(
    viewportStyle(document, first.id, "eje").linetype,
    "HIDDEN",
    "la publicación traza con el tipo de línea FIJADO en la ventana, no el CENTER de la capa",
  );
}

// --- VPLAYER Grosor, y los tres campos CONVIVEN sin pisarse ------------------
{
  const before = baseDocument();
  const [first] = before.paperSpaces[0].viewports!;
  const colored = run(before, ["VPLAYER", "C", "EJES", "#112233", first.id]).document;
  const { document } = run(colored, ["VPLAYER", "G", "EJES", "0,7", first.id]);
  assert.deepEqual(
    document.paperSpaces[0].viewports![0].layerOverrides,
    { EJES: { color: "#112233", lineweight: 0.7 } },
    "fijar el grosor no borra el color ya fijado (coma decimal aceptada)",
  );
  assert.ok(
    Math.abs(viewportStyle(document, first.id, "eje").lineWidth - 0.7) < 1e-6,
    "la publicación traza con el grosor fijado",
  );
}

// --- valores inválidos se rechazan nombrando el error ------------------------
{
  const bad1 = run(baseDocument(), ["VPLAYER", "C", "EJES", "azul"]);
  assert.ok(messages(bad1.effects).some((t) => t.includes("azul")), "un color no hexadecimal se nombra");
  const bad2 = run(baseDocument(), ["VPLAYER", "G", "EJES", "gordo"]);
  assert.ok(messages(bad2.effects).some((t) => t.includes("gordo")), "un grosor no numérico se nombra");
}

// --- sobrevive a GUARDAR y RECARGAR el documento -----------------------------
{
  const before = baseDocument();
  const [first] = before.paperSpaces[0].viewports!;
  const styled = run(before, ["VPLAYER", "C", "EJES", "#ff00ff", first.id]).document;
  const reloaded = parseCadDocument(serializeCadDocument(styled));
  assert.deepEqual(
    reloaded.paperSpaces[0].viewports!.find((v) => v.id === first.id)!.layerOverrides,
    { EJES: { color: "#ff00ff" } },
    "la anulación de color SOBREVIVE a la recarga",
  );
  assert.equal(viewportStyle(reloaded, first.id, "eje").stroke, "#ff00ff");
}

console.log(
  "settings-layer-vplayer: VPLAYER Color/LTipo/Grosor fijan `layerOverrides` SOLO en la ventana designada, " +
    "los tres campos conviven sin pisarse, la publicación proyecta el tipo de línea fijado (antes se perdía), " +
    "los valores inválidos se rechazan nombrándolos, y todo sobrevive a guardar y recargar.",
);
