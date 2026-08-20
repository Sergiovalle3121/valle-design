/**
 * VPLAYER y la familia LAY*, tecleados y APLICADOS.
 *
 * Igual que la spec de LAYOUT/MVIEW: no basta con que el comando emita las
 * órdenes — se aplican con el ejecutor por lotes y se afirma sobre el
 * documento resultante Y sobre lo que la publicación proyecta después. Un
 * VPLAYER que escribe `layerVisibility` que nadie respeta sería un comando
 * verde y una lámina mentirosa.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadPaperSpace } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { buildCadPublishPlan, createCadPaperSpace } from "../../paper-space";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

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
  // Segunda ventana, para poder afirmar que congelar en UNA no toca la otra.
  const second = {
    ...space.viewports![0],
    id: "layout:planta:viewport:2",
    name: "Detalle",
  };
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
      { id: "MEP", name: "MEP", color: "#00ff00", visible: true, locked: false },
    ],
    entities: [
      { id: "muro", type: "line", layer: "MUROS", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 } },
      { id: "tubo", type: "line", layer: "MEP", start: { x: 0, y: 300, z: 0 }, end: { x: 1_000, y: 300, z: 0 } },
    ],
    history: [],
    modelSpace: { entityIds: ["muro", "tubo"] },
    paperSpaces: [{ ...space, viewports: [space.viewports![0], second] }],
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

function run(
  document: CadDocument,
  tokens: readonly string[],
  overrides: Partial<CadCommandContext> = {},
): Session {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  let current = document;
  let ids = 0;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: current.entities.map((entity) => entity.id),
      entity: (id) => current.entities.find((entity) => entity.id === id),
      layers: () => current.layers,
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      activeLayout: "layout:planta",
      paperSpaces: () => current.paperSpaces,
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `new-${(ids += 1)}`,
      ...overrides,
    };
    const reduction =
      token === "\r"
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

const viewportCommands = (document: CadDocument, viewportId: string) =>
  buildCadPublishPlan(document)
    .sheets[0].viewports.find((viewport) => viewport.id === viewportId)!
    .commands.map((command) => command.entityId);

// --- VPLAYER Inutilizar escribe UNA ventana y la publicación lo respeta ------
{
  const before = baseDocument();
  const [first, second] = before.paperSpaces[0].viewports!;
  const { document } = run(before, ["VPLAYER", "I", "MEP", first.id]);

  const written = document.paperSpaces[0].viewports!.find((v) => v.id === first.id)!;
  assert.deepEqual(written.layerVisibility, { MEP: false }, "la anulación queda en la ventana");
  assert.equal(
    document.paperSpaces[0].viewports!.find((v) => v.id === second.id)!.layerVisibility,
    undefined,
    "la otra ventana no se toca",
  );
  assert.equal(document.meta.version - before.meta.version, 1, "UN paso de historia");

  assert.ok(!viewportCommands(document, first.id).includes("tubo"), "la ventana congelada no proyecta MEP");
  assert.ok(viewportCommands(document, second.id).includes("tubo"), "la otra sí");

  // Reutilizar BORRA la anulación en vez de escribir true.
  const thawed = run(document, ["VPLAYER", "R", "MEP", first.id]).document;
  assert.equal(
    thawed.paperSpaces[0].viewports!.find((v) => v.id === first.id)!.layerVisibility,
    undefined,
    "reutilizar devuelve la ventana a heredar del documento",
  );
}

// --- VPLAYER Todas, con Enter como valor por defecto -------------------------
{
  const { document } = run(baseDocument(), ["VPLAYER", "I", "MEP", "\r"]);
  for (const viewport of document.paperSpaces[0].viewports!)
    assert.deepEqual(
      viewport.layerVisibility,
      { MEP: false },
      `Enter aplica a todas las ventanas (${viewport.id})`,
    );
  assert.equal(document.meta.version, baseDocument().meta.version + 1, "y sigue siendo UN lote");
}

// --- una capa mal escrita se rechaza nombrándola -----------------------------
{
  const { effects, document } = run(baseDocument(), ["VPLAYER", "I", "FANTASMA"]);
  assert.ok(
    messages(effects).some((text) => text.includes("FANTASMA")),
    "el nombre que no existe se dice",
  );
  assert.deepEqual(document.paperSpaces, baseDocument().paperSpaces, "y nada cambia");
}

// --- VPLAYER ? lista qué congela cada ventana --------------------------------
{
  const frozen = run(baseDocument(), ["VPLAYER", "I", "MEP", "\r"]).document;
  const { effects } = run(frozen, ["VPLAYER", "?"]);
  assert.ok(
    messages(effects).some((text) => text.includes("MEP")),
    "el listado nombra la capa inutilizada",
  );
}

console.log(
  "settings-layer-tools: VPLAYER congela y descongela por ventana en un lote, la publicación lo respeta, " +
    "Enter aplica a todas y los nombres inexistentes se rechazan nombrándolos",
);
