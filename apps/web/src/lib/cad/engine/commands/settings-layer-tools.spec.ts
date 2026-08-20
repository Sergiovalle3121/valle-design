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
import { CadLayerStateCatalog } from "../../layer-states";
import { buildCadPublishPlan, createCadPaperSpace } from "../../paper-space";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { CAD_LAYER_ISOLATION_MEMORY } from "./settings-layer-tools";

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
      { id: "EJES", name: "EJES", color: "#00ffff", visible: true, locked: false },
      { id: "MEP", name: "MEP", color: "#00ff00", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
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

/** Un token tecleado, `"\r"` (Enter) o una entrada cruda como un pick. */
type Fed = string | CadCommandInput;

function run(
  document: CadDocument,
  tokens: readonly Fed[],
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

const pick = (entityId: string): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x: 0, y: 0 },
});

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

// ---------------------------------------------------------------------------
// Familia LAY*
// ---------------------------------------------------------------------------

const layerById = (document: CadDocument, id: string) =>
  document.layers.find((layer) => layer.id === id)!;

// --- LAYISO apaga las demás, con memoria, y LAYUNISO restituye ---------------
{
  const catalog = new CadLayerStateCatalog();
  const catalogs = { layerStates: catalog };
  const before = baseDocument();

  const isolated = run(before, ["LAYISO", pick("muro"), "\r"], { catalogs }).document;
  assert.equal(layerById(isolated, "MUROS").visible, true, "la capa designada queda encendida");
  for (const id of ["0", "EJES", "MEP"])
    assert.equal(layerById(isolated, id).visible, false, `la capa ${id} se apaga`);
  assert.equal(isolated.meta.version - before.meta.version, 1, "aislar es UN paso de historia");
  assert.ok(catalog.get(CAD_LAYER_ISOLATION_MEMORY), "la foto previa queda en la sesión");

  const restored = run(isolated, ["LAYUNISO"], { catalogs }).document;
  for (const layer of restored.layers)
    assert.equal(layer.visible, true, `LAYUNISO reenciende ${layer.id}`);
  assert.equal(catalog.get(CAD_LAYER_ISOLATION_MEMORY), undefined, "y consume la memoria");

  const nothing = run(restored, ["LAYUNISO"], { catalogs });
  assert.ok(
    messages(nothing.effects).some((text) => text.includes("aislamiento")),
    "sin memoria, LAYUNISO lo dice en vez de inventar",
  );
}

// --- LAYISO sin catálogo aísla igual y avisa de que no habrá vuelta ----------
{
  const { effects, document } = run(baseDocument(), ["LAYISO", pick("tubo"), "\r"]);
  assert.equal(layerById(document, "MEP").visible, true);
  assert.equal(layerById(document, "MUROS").visible, false);
  assert.ok(
    effects.some(
      (effect) => effect.kind === "execute" && effect.label.includes("no podrá restituir"),
    ),
    "la etiqueta declara que no hay memoria de sesión",
  );
}

// --- LAYFRZ congela lo designado; la capa actual se niega --------------------
{
  const frozen = run(baseDocument(), ["LAYFRZ", pick("tubo")]).document;
  assert.equal(layerById(frozen, "MEP").frozen, true, "la capa del objeto queda congelada");
  assert.equal(layerById(frozen, "MUROS").frozen, undefined, "las demás no se tocan");

  const refused = run(baseDocument(), ["LAYFRZ", pick("muro")], { activeLayer: "MUROS" });
  assert.ok(
    messages(refused.effects).some((text) => text.includes("capa actual")),
    "congelar la capa actual se niega diciéndolo",
  );
  assert.equal(layerById(refused.document, "MUROS").frozen, undefined);

  // LAYTHW descongela TODAS y BORRA la clave, no escribe false.
  const thawed = run(frozen, ["LAYTHW"]).document;
  assert.ok(!("frozen" in layerById(thawed, "MEP")), "descongelar borra la clave (opcional-ausente)");
  const idle = run(thawed, ["LAYTHW"]);
  assert.ok(messages(idle.effects).some((text) => text.includes("ninguna capa congelada")));
}

// --- LAYOFF apaga lo designado; LAYON reenciende todas -----------------------
{
  const off = run(baseDocument(), ["LAYOFF", pick("muro")]).document;
  assert.equal(layerById(off, "MUROS").visible, false);
  const on = run(off, ["LAYON"]).document;
  for (const layer of on.layers) assert.equal(layer.visible, true, `LAYON enciende ${layer.id}`);
  const idle = run(on, ["LAYON"]);
  assert.ok(messages(idle.effects).some((text) => text.includes("ya están activadas")));
}

// --- LAYMCH iguala capas al objeto de destino --------------------------------
{
  const { document } = run(baseDocument(), ["LAYMCH", pick("muro"), "\r", pick("tubo")]);
  assert.equal(
    document.entities.find((entity) => entity.id === "muro")!.layer,
    "MEP",
    "el muro pasa a la capa del objeto de destino",
  );
  const noop = run(document, ["LAYMCH", pick("muro"), "\r", pick("tubo")]);
  assert.ok(
    messages(noop.effects).some((text) => text.includes("ya están en esa capa")),
    "igualar lo ya igual no ensucia el deshacer",
  );
}

// --- LAYWALK camina de verdad: cada paso enseña UNA capa ---------------------
{
  const catalog = new CadLayerStateCatalog();
  const catalogs = { layerStates: catalog };
  const first = run(baseDocument(), ["LAYWALK", "\r"], { catalogs }).document;
  // Orden alfabético de ids: 0, EJES, MEP, MUROS — el paseo arranca en "0".
  assert.equal(layerById(first, "0").visible, true, "el paseo arranca en la primera capa");
  for (const id of ["EJES", "MEP", "MUROS"])
    assert.equal(layerById(first, id).visible, false, `${id} queda apagada durante el paseo`);

  const second = run(first, ["LAYWALK", "\r"], { catalogs }).document;
  assert.equal(layerById(second, "EJES").visible, true, "repetir avanza a la siguiente");
  assert.equal(layerById(second, "0").visible, false);

  const named = run(second, ["LAYWALK", "MUROS"], { catalogs }).document;
  assert.equal(layerById(named, "MUROS").visible, true, "teclear un nombre salta a esa capa");

  const restored = run(named, ["LAYWALK", "R"], { catalogs }).document;
  for (const layer of restored.layers)
    assert.equal(layer.visible, true, `Restituir devuelve ${layer.id}`);
}

// --- LAYMRG fusiona A en B: reasigna y purga en UN lote ----------------------
{
  const before = baseDocument();
  const { document } = run(before, ["LAYMRG", "MEP", "MUROS"]);
  assert.ok(!document.layers.some((layer) => layer.id === "MEP"), "la capa origen desaparece");
  assert.equal(
    document.entities.find((entity) => entity.id === "tubo")!.layer,
    "MUROS",
    "sus objetos pasan al destino",
  );
  assert.equal(document.meta.version - before.meta.version, 1, "en UN paso de historia");

  const zero = run(baseDocument(), ["LAYMRG", "0"]);
  assert.ok(messages(zero.effects).some((text) => text.includes("capa 0")), "la 0 se niega");
  const active = run(baseDocument(), ["LAYMRG", "MUROS"], { activeLayer: "MUROS" });
  assert.ok(
    messages(active.effects).some((text) => text.includes("capa actual")),
    "la actual también, con el porqué",
  );
}

// --- -LAYER gana Inutilizar/Reutilizar ---------------------------------------
{
  const frozen = run(baseDocument(), ["-LAYER", "I", "MEP"]).document;
  assert.equal(layerById(frozen, "MEP").frozen, true, "-LAYER Inutilizar congela");
  const thawed = run(frozen, ["-LAYER", "R", "MEP"]).document;
  assert.ok(!("frozen" in layerById(thawed, "MEP")), "-LAYER Reutilizar borra la clave");
  const refused = run(baseDocument(), ["-LAYER", "I", "MUROS"], { activeLayer: "MUROS" });
  assert.ok(
    messages(refused.effects).some((text) => text.includes("capa actual")),
    "la capa actual no se congela ni desde -LAYER",
  );
}

console.log(
  "settings-layer-tools: VPLAYER congela y descongela por ventana en un lote y la publicación lo respeta; " +
    "LAYISO/LAYUNISO aíslan con memoria de sesión, LAYFRZ/LAYTHW y LAYOFF/LAYON tocan el documento canónico, " +
    "LAYMCH iguala capas, LAYWALK pasea de verdad con vuelta, LAYMRG fusiona y purga en un lote " +
    "y -LAYER aprende Inutilizar/Reutilizar",
);
