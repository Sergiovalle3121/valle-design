/**
 * LAYOUT, MVIEW, MSPACE y PSPACE tecleados, y APLICADOS.
 *
 * No basta con que el comando emita las órdenes correctas: hay que comprobar
 * que el ejecutor por lotes las escribe en `document.paperSpaces` y que sale UN
 * solo paso de historia. Una orden `paper-space` que el ejecutor ignorase daría
 * un comando verde y un producto que no crea pestañas.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadPaperSpace } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { CAD_VIEWPORT_CLIP_METADATA } from "../../layout/viewport-operations";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

function emptyDocument(paperSpaces: CadPaperSpace[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces,
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

/**
 * Teclea una secuencia y APLICA lo que salga sobre el documento, igual que hace
 * el anfitrión. Devuelve el documento resultante.
 */
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
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      paperSpaces: () => current.paperSpaces,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 20_000, maxY: 12_000 }),
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

// --- LAYOUT Nueva escribe el documento en UN paso ----------------------------
{
  const before = emptyDocument();
  const { document } = run(before, ["LAYOUT", "N", "Planta baja"]);
  assert.equal(document.paperSpaces.length, 1);
  assert.equal(document.paperSpaces[0].name, "Planta baja");
  assert.equal(document.paperSpaces[0].id, "layout:planta-baja");
  assert.equal(document.paperSpaces[0].order, 0);
  assert.equal(document.paperSpaces[0].viewports?.length, 1);
  assert.equal(
    document.meta.version - before.meta.version,
    1,
    "crear una presentación es UN paso de historia",
  );
  assert.equal(document.history.length - before.history.length, 1);
}

// --- LAYOUT PLantilla: el papel sale del catálogo ----------------------------
{
  const { document } = run(emptyDocument(), ["LO", "PL", "a4-portrait", "Detalle"]);
  assert.equal(document.paperSpaces[0].page.width, 210);
  assert.equal(document.paperSpaces[0].page.height, 297);
  assert.equal(document.paperSpaces[0].pageSetup?.paper, "A4");

  const bad = run(emptyDocument(), ["LO", "PL", "a9-cuadrada"]);
  assert.ok(messages(bad.effects).some((text) => text.includes("no es una plantilla")));
  assert.equal(bad.document.paperSpaces.length, 0);
}

// --- copiar, renombrar, suprimir y listar ------------------------------------
{
  let document = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  document = run(document, ["LO", "N", "Alzado"]).document;
  assert.deepEqual(
    document.paperSpaces.map((space) => space.name),
    ["Planta", "Alzado"],
  );
  assert.deepEqual(
    document.paperSpaces.map((space) => space.order),
    [0, 1],
  );

  document = run(document, ["LO", "CO", "Planta", "Planta bis"]).document;
  assert.equal(document.paperSpaces.length, 3);
  assert.equal(document.paperSpaces[2].name, "Planta bis");
  assert.equal(document.paperSpaces[2].id, "layout:planta-bis");
  assert.notEqual(
    document.paperSpaces[2].viewports?.[0].id,
    document.paperSpaces[0].viewports?.[0].id,
  );

  document = run(document, ["LO", "R", "Alzado", "Sección"]).document;
  assert.ok(document.paperSpaces.some((space) => space.name === "Sección"));

  const listed = run(document, ["LO", "LI"]);
  assert.ok(messages(listed.effects).some((text) => text.includes("Sección")));

  document = run(document, ["LO", "S", "Sección"]).document;
  assert.equal(document.paperSpaces.length, 2);
  assert.deepEqual(
    document.paperSpaces.map((space) => space.order),
    [0, 1],
    "borrar renumera las pestañas",
  );

  // La última no se borra.
  const one = run(emptyDocument(), ["LO", "N", "Única"]).document;
  const refused = run(one, ["LO", "S", "Única"]);
  assert.ok(messages(refused.effects).some((text) => text.includes("única presentación")));
  assert.equal(refused.document.paperSpaces.length, 1);
}

// --- MVIEW rectangular: una ventana más sobre la hoja activa -----------------
{
  const base = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  const { document } = run(base, ["MV", "40,40", "340,240"], {
    activeLayout: "layout:planta",
  });
  const viewports = document.paperSpaces[0].viewports!;
  assert.equal(viewports.length, 2);
  const created = viewports[1];
  assert.deepEqual(created.paperBounds, { x: 40, y: 40, width: 300, height: 200 });
  assert.equal(created.locked, false);
  assert.ok(created.scale > 0);
}

// --- MVIEW ESCala fija la escala Y BLOQUEA -----------------------------------
{
  const base = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  const viewportId = base.paperSpaces[0].viewports![0].id;
  const { document } = run(base, ["MV", "ESC", viewportId, "1:50"], {
    activeLayout: "layout:planta",
  });
  const viewport = document.paperSpaces[0].viewports![0];
  assert.equal(viewport.scale, 50);
  assert.equal(viewport.annotationScale, 50);
  assert.equal(viewport.locked, true, "fijar la escala la protege del siguiente zoom");

  const bad = run(base, ["MV", "ESC", viewportId, "grande"], { activeLayout: "layout:planta" });
  assert.ok(messages(bad.effects).some((text) => text.includes("no es una escala")));
}

// --- MVIEW Inutilizar congela capas SÓLO en esa ventana ----------------------
{
  let document = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  document = run(document, ["MV", "300,40", "400,140"], { activeLayout: "layout:planta" }).document;
  const [general, detail] = document.paperSpaces[0].viewports!;
  document = run(document, ["MV", "I", general.id, "MEP, ELEC"], {
    activeLayout: "layout:planta",
  }).document;
  const [frozen, untouched] = document.paperSpaces[0].viewports!;
  assert.equal(frozen.id, general.id);
  assert.deepEqual(frozen.layerVisibility, { MEP: false, ELEC: false });
  assert.equal(untouched.id, detail.id);
  assert.equal(untouched.layerVisibility, undefined, "la otra ventana no se entera");
}

// --- MVIEW ACtivar / DEsactivar ----------------------------------------------
{
  const base = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  const viewportId = base.paperSpaces[0].viewports![0].id;
  const off = run(base, ["MV", "DE", viewportId], { activeLayout: "layout:planta" }).document;
  assert.equal(off.paperSpaces[0].viewports![0].layerVisibility?.["*"], false);
  const on = run(off, ["MV", "AC", viewportId], { activeLayout: "layout:planta" }).document;
  assert.equal(on.paperSpaces[0].viewports![0].layerVisibility, undefined);
}

// --- MVIEW Poligonal: contorno y ventana en el MISMO lote --------------------
{
  const base = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  const { document } = run(
    base,
    ["MV", "P", "20,20", "160,20", "160,120", "60,150", "\r"],
    { activeLayout: "layout:planta" },
  );
  assert.equal(
    document.meta.version - base.meta.version,
    1,
    "el contorno y la ventana son UNA transacción",
  );
  const clip = document.entities.find(
    (entity) => entity.context?.metadata?.[CAD_VIEWPORT_CLIP_METADATA],
  );
  assert.ok(clip, "la polilínea de recorte se dio de alta");
  assert.equal(clip.type, "polyline");
  const viewport = document.paperSpaces[0].viewports!.at(-1)!;
  assert.equal(clip.context?.metadata?.[CAD_VIEWPORT_CLIP_METADATA], viewport.id);
  assert.deepEqual(viewport.paperBounds, { x: 20, y: 20, width: 140, height: 130 });
  assert.ok(
    document.paperSpaces[0].entityIds.includes(clip.id),
    "y vive en el espacio papel de esa hoja",
  );
}

// --- MVIEW sin presentación se niega -----------------------------------------
{
  const session = run(emptyDocument(), ["MV", "0,0", "100,100"]);
  assert.ok(messages(session.effects).some((text) => text.includes("ninguna presentación")));
  assert.equal(session.document.paperSpaces.length, 0);
}

// --- MSPACE / PSPACE piden al anfitrión, no escriben -------------------------
{
  const base = run(emptyDocument(), ["LO", "N", "Planta"]).document;
  const paper = run(base, ["PS"]);
  const hosts = paper.effects.flatMap((effect) => (effect.kind === "host" ? [effect.request] : []));
  assert.deepEqual(hosts, [{ kind: "space", space: "paper", layoutId: "layout:planta" }]);
  assert.equal(paper.document.meta.version, base.meta.version, "PSPACE no muta el documento");

  const model = run(base, ["MS"]);
  assert.deepEqual(
    model.effects.flatMap((effect) => (effect.kind === "host" ? [effect.request] : [])),
    [{ kind: "space", space: "model", layoutId: "layout:planta" }],
  );

  const orphan = run(emptyDocument(), ["MS"]);
  assert.ok(messages(orphan.effects).some((text) => text.includes("MSPACE necesita")));
}

// --- sin presentaciones en el contexto, se dice ------------------------------
{
  const session = run(emptyDocument(), ["LO", "N", "X"], { paperSpaces: undefined });
  assert.ok(messages(session.effects).some((text) => text.includes("no expone las presentaciones")));
}

console.log("cad layout command specs passed");
