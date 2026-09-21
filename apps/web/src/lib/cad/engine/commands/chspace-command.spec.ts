/**
 * CHSPACE, tecleado y APLICADO: la geometría se escala de verdad y la
 * pertenencia a espacio papel viaja con ella.
 *
 * No basta con que el comando emita `transform`/`paper-space`: se ejecutan con
 * el motor real y se mide la geometría resultante en milímetros, comparándola
 * contra la entrada — un CHSPACE que sólo mueve la entidad de lista sin
 * escalarla dibujaría un muro de 8 metros sobre una hoja A1.
 */
import { strict as assert } from "node:assert";
import { parseCadDocument, serializeCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { createCadPaperSpace } from "../../paper-space";
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
  // 1:50 — la MISMA relación que usa `cad-chspace.spec.ts`: un muro de 8 m
  // (8.000 mm) mide 160 mm de papel.
  const space = createCadPaperSpace({
    id: "layout:planta",
    name: "Planta",
    order: 0,
    paper: "A3",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    metadata: METADATA,
    scale: 50,
  });
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      { id: "muro", type: "line", layer: "0", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 9_000, y: 1_000, z: 0 } },
      { id: "sello", type: "line", layer: "0", start: { x: 5, y: 5, z: 0 }, end: { x: 45, y: 5, z: 0 } },
    ],
    history: [],
    modelSpace: { entityIds: ["muro", "sello"] },
    // "sello" ya vive en el PAPEL de esta presentación desde el arranque: es
    // la anotación —un cajetín, en miniatura— que CHSPACE debe poder devolver
    // al modelo en la misma orden que manda "muro" al papel.
    paperSpaces: [{ ...space, entityIds: ["sello"] }],
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

const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });

const messages = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

function line(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(entity && entity.type === "line", `${id} sigue siendo una línea`);
  return entity as Extract<CadDocument["entities"][number], { type: "line" }>;
}

// --- CHSPACE modelo -> papel: escala EXACTA por la ventana designada --------
{
  const before = baseDocument();
  const { document } = run(before, ["CHSPACE", pick("muro"), "\r", "\r"]);

  // 8.000 mm de modelo a 1:50 = 160 mm de papel.
  const wall = line(document, "muro");
  assert.ok(Math.abs((wall.end.x - wall.start.x) - 160) < 1e-6, `el muro mide 160 mm de papel (dio ${wall.end.x - wall.start.x})`);
  assert.ok(Math.abs(wall.start.y - wall.end.y) < 1e-9, "sigue siendo horizontal: sin volteo de eje");

  // La esquina del modelBounds cae en la esquina del paperBounds de la ventana.
  const viewport = document.paperSpaces[0].viewports![0];
  assert.ok(
    Math.abs(wall.start.x - (viewport.paperBounds.x + (1_000 - viewport.modelBounds.x) * 0.02)) < 1e-6,
    "la posición sigue la MISMA afín que el factor de escala",
  );

  // Y pasa a vivir en el PAPEL de la presentación.
  assert.ok(document.paperSpaces[0].entityIds!.includes("muro"), "muro entra en entityIds de la lámina");
  assert.equal(document.meta.version - before.meta.version, 1, "CHSPACE es UN paso de historia, aunque mueva geometría y sección");
}

// --- CHSPACE papel -> modelo: el inverso exacto, y una selección MIXTA en un solo lote --
{
  const before = baseDocument();
  const { document } = run(before, ["CHSPACE", pick("muro"), pick("sello"), "\r", "\r"]);

  // "muro" (estaba en modelo) creció a papel; "sello" (estaba en papel) volvió al modelo.
  assert.ok(document.paperSpaces[0].entityIds!.includes("muro"), "muro pasa a papel");
  assert.ok(!document.paperSpaces[0].entityIds!.includes("sello"), "sello vuelve a modelo");

  const seal = line(document, "sello");
  // 40 mm de papel * 50 (escala) = 2.000 unidades de modelo.
  assert.ok(Math.abs((seal.end.x - seal.start.x) - 2_000) < 1e-6, `el sello mide 2.000 unidades de modelo (dio ${seal.end.x - seal.start.x})`);
}

// --- sin ventana en la presentación: se niega diciéndolo, no inventa una escala ---
{
  const empty = baseDocument();
  empty.paperSpaces[0] = { ...empty.paperSpaces[0], viewports: [] };
  const { effects, document } = run(empty, ["CHSPACE", pick("muro"), "\r"]);
  assert.ok(messages(effects).some((text) => text.includes("ventana")), "CHSPACE dice que no hay ventana de referencia");
  assert.deepEqual(document.entities, empty.entities, "y no toca la geometría");
}

// --- ventana inexistente: se niega nombrándola ------------------------------
{
  const { effects, document } = run(baseDocument(), ["CHSPACE", pick("muro"), "\r", "Detalle"]);
  assert.ok(messages(effects).some((text) => text.includes("Detalle")), "nombra la ventana que no existe");
  assert.equal(document.paperSpaces[0].entityIds!.includes("muro"), false, "y no mueve nada");
}

// --- sobrevive a GUARDAR y RECARGAR el documento -----------------------------
{
  const before = baseDocument();
  const { document } = run(before, ["CHSPACE", pick("muro"), "\r", "\r"]);
  const reloaded = parseCadDocument(serializeCadDocument(document));
  const wall = line(reloaded, "muro");
  assert.ok(Math.abs((wall.end.x - wall.start.x) - 160) < 1e-6, "la geometría escalada sobrevive a la recarga");
  assert.ok(reloaded.paperSpaces[0].entityIds!.includes("muro"), "y la pertenencia a papel también");
}

console.log(
  "chspace-command: CHSPACE escala EXACTAMENTE por el factor de la ventana designada (8 m a 1:50 = 160 mm), " +
    "mueve la selección MIXTA cada objeto a su espacio contrario en UN lote, se niega sin ventana o con una " +
    "que no existe, y la geometría y la pertenencia a papel sobreviven a guardar y recargar.",
);
