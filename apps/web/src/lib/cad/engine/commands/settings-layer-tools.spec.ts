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
import {
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "../../cad-document";
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
      document: () => current,
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

// --- LAYISO y LAYWALK ENCADENADOS comparten memoria: la foto es la de ANTES
// del primer aislamiento, no la del último paso intermedio ------------------
{
  const catalog = new CadLayerStateCatalog();
  const catalogs = { layerStates: catalog };
  const before = baseDocument();
  for (const layer of before.layers) assert.equal(layer.visible, true, "arranca con todo encendido");

  // Primero LAYISO dEja sólo MUROS; la memoria guarda el "todo encendido".
  const isolated = run(before, ["LAYISO", pick("muro"), "\r"], { catalogs }).document;
  assert.equal(layerById(isolated, "MUROS").visible, true);

  // LAYWALK, encima, pasea hasta MEP: NO debe pisar la memoria de LAYISO.
  const walked = run(isolated, ["LAYWALK", "MEP"], { catalogs }).document;
  assert.equal(layerById(walked, "MEP").visible, true, "el paseo muestra MEP en solitario");
  assert.equal(layerById(walked, "MUROS").visible, false, "y apaga lo que LAYISO había dejado");

  // LAYUNISO devuelve el estado de ANTES de LAYISO —todo encendido—, no el
  // de antes de LAYWALK (que habría sido "sólo MUROS").
  const restored = run(walked, ["LAYUNISO"], { catalogs }).document;
  for (const layer of restored.layers)
    assert.equal(layer.visible, true, `LAYUNISO tras encadenar devuelve ${layer.id} a como estaba al principio`);
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

// --- LAYERSTATE sobrevive a la RECARGA: guardar, recargar, restituir ---------
{
  // Se apaga una capa, se fotografía, se estropea el reparto… y se RECARGA:
  // el documento viaja por serializar+parsear, que es exactamente lo que pasa
  // al cerrar la pestaña. El estado tiene que seguir ahí y restituir.
  const working = run(baseDocument(), ["LAYOFF", pick("tubo")]).document;
  const saved = run(working, ["LAYERSTATE", "G", "Impresión"]).document;
  assert.equal(saved.layerStates?.length, 1, "el estado queda en el documento");
  assert.equal(saved.layerStates?.[0].name, "Impresión");
  assert.equal(
    saved.layerStates?.[0].entries.find((entry) => entry.layerName === "MEP")?.visible,
    false,
    "la foto recuerda que MEP estaba apagada",
  );

  const reloaded = parseCadDocument(serializeCadDocument(saved));
  assert.equal(reloaded.layerStates?.length, 1, "el estado SOBREVIVE a la recarga");

  // Tras recargar, alguien lo enciende todo… y el estado lo deshace.
  const messed = run(reloaded, ["LAYON"]).document;
  assert.equal(
    messed.layers.find((layer) => layer.id === "MEP")?.visible,
    true,
    "el reparto se estropeó de verdad",
  );
  const restored = run(messed, ["LAYERSTATE", "R", "Impresión"]).document;
  assert.equal(
    restored.layers.find((layer) => layer.id === "MEP")?.visible,
    false,
    "restituir tras la recarga devuelve el reparto guardado",
  );
  assert.equal(restored.meta.version - messed.meta.version, 1, "en UN paso de historia");

  // Suprimir retira el estado del documento y con él la sección (opcional-ausente).
  const removed = run(restored, ["LAYERSTATE", "S", "Impresión"]).document;
  assert.equal(removed.layerStates, undefined, "borrar el último estado retira la sección");
  assert.ok(!serializeCadDocument(removed).includes("layerStates"));
}

// --- LAYERSTATE recuerda CONGELADA, y Renombrar/eXportar/Importar viajan ----
{
  const before = baseDocument();
  const frozenDoc = run(before, ["-LAYER", "I", "MEP"]).document; // MEP congelada
  const saved = run(frozenDoc, ["LAYERSTATE", "G", "ConCongelada"]).document;
  const frozenEntry = saved.layerStates?.[0].entries.find((entry) => entry.layerName === "MEP");
  assert.equal(frozenEntry?.frozen, true, "la foto recuerda que MEP estaba congelada");
  const thawedEntry = saved.layerStates?.[0].entries.find((entry) => entry.layerName === "MUROS");
  assert.equal(thawedEntry?.frozen, undefined, "y que MUROS NO lo estaba (ausente, no `false`)");

  // Se descongela de verdad, se estropea el reparto… y Restituir vuelve a
  // congelar: el bit de CONGELADA hace la ida y vuelta completa, no sólo la
  // visibilidad que ya se comprobaba arriba.
  const messed = run(saved, ["-LAYER", "R", "MEP"]).document;
  assert.ok(!("frozen" in layerById(messed, "MEP")), "MEP queda descongelada antes de restituir");
  const restored = run(messed, ["LAYERSTATE", "R", "ConCongelada"]).document;
  assert.equal(layerById(restored, "MEP").frozen, true, "restituir vuelve a congelar MEP");
  assert.equal(restored.meta.version - messed.meta.version, 1, "en UN paso de historia");

  // Renombrar: las MISMAS entradas —congelada incluida— bajo un nombre nuevo,
  // en un solo paso de deshacer (borrar el viejo y crear el nuevo es UN lote).
  const renamed = run(restored, ["LAYERSTATE", "N", "ConCongelada", "Entrega"]).document;
  assert.equal(renamed.layerStates?.length, 1, "renombrar no duplica el estado");
  assert.equal(renamed.layerStates?.[0].name, "Entrega", "el nombre cambia");
  assert.equal(
    renamed.layerStates?.[0].entries.find((entry) => entry.layerName === "MEP")?.frozen,
    true,
    "y las entradas viajan intactas",
  );
  assert.equal(renamed.meta.version - restored.meta.version, 1, "renombrar también en UN paso");

  const noSource = run(renamed, ["LAYERSTATE", "N", "NoExiste"]);
  assert.ok(
    messages(noSource.effects).some((text) => text.includes("No hay ningún estado")),
    "renombrar un estado que no existe se dice, no se aproxima",
  );
  const withSecond = run(renamed, ["LAYERSTATE", "G", "Otra"]).document;
  const collision = run(withSecond, ["LAYERSTATE", "N", "Otra", "Entrega"]);
  assert.ok(
    messages(collision.effects).some((text) => text.includes("Ya existe un estado")),
    "renombrar a un nombre ya usado por OTRO estado se niega",
  );

  // eXportar: el texto sale en el mensaje, listo para copiar a otro dibujo.
  const exported = run(renamed, ["LAYERSTATE", "X", "Entrega"]);
  const exportedText = messages(exported.effects).find((text) => text.includes("exportado"));
  assert.ok(exportedText, "eXportar responde con el texto");
  const payload = exportedText!.split("\n").pop()!;
  assert.ok(payload.includes('"Entrega"') && payload.includes('"frozen":true'), "el JSON trae el nombre y la capa congelada");
  const exportMissing = run(renamed, ["LAYERSTATE", "X", "NoExiste"]);
  assert.ok(
    messages(exportMissing.effects).some((text) => text.includes("No hay ningún estado")),
    "eXportar de un nombre inexistente se dice",
  );

  // Importar: el MISMO texto, pegado en un dibujo SIN ese estado, reconstruye
  // el estado completo — y restituirlo allí vuelve a congelar la capa. Esa es
  // la ida y vuelta completa: capturar → exportar → importar → restituir.
  const otherDrawing = baseDocument();
  const imported = run(otherDrawing, [
    "LAYERSTATE",
    "I",
    { kind: "text", value: payload },
  ]).document;
  assert.equal(imported.layerStates?.length, 1, "el estado importado queda en el documento destino");
  assert.equal(imported.layerStates?.[0].name, "Entrega");
  assert.equal(
    imported.layerStates?.[0].entries.find((entry) => entry.layerName === "MEP")?.frozen,
    true,
    "la capa congelada sobrevive al viaje exportar→importar",
  );
  const restoredThere = run(imported, ["LAYERSTATE", "R", "Entrega"]).document;
  assert.equal(layerById(restoredThere, "MEP").frozen, true, "y restituirlo en el dibujo destino congela MEP");

  // Importar texto que no es JSON, o al que le falta forma, se NIEGA con la
  // razón: nunca aproxima un estado a medias.
  const badJson = run(otherDrawing, [
    "LAYERSTATE",
    "I",
    { kind: "text", value: "esto no es json" },
  ]);
  assert.ok(
    messages(badJson.effects).some((text) => text.includes("no pudo importar")),
    "JSON inválido se rechaza con la razón",
  );
  const missingShape = run(otherDrawing, [
    "LAYERSTATE",
    "I",
    { kind: "text", value: JSON.stringify({ name: "X" }) },
  ]);
  assert.ok(
    messages(missingShape.effects).some((text) => text.includes("no pudo importar")),
    "un objeto sin «entries» también se rechaza",
  );

  // Importar un nombre que YA existe SUSTITUYE, y lo dice (en la etiqueta del
  // lote: importar SÍ muta el documento, así que no es un mensaje suelto).
  const overwritten = run(imported, [
    "LAYERSTATE",
    "I",
    { kind: "text", value: payload },
  ]);
  assert.ok(
    overwritten.effects.some(
      (effect) => effect.kind === "execute" && effect.label.includes("sustituyó"),
    ),
    "reimportar el mismo nombre avisa de que sustituyó",
  );
  assert.equal(overwritten.document.layerStates?.length, 1, "y no duplica el estado");
}

// --- LAYCUR escribe CLAYER (no CCLAYER) y lo dibujado después cae ahí -------
{
  // Bug real: escribía `CCLAYER`, una variable que nadie lee. LAYCUR
  // designaba la capa "actual" pero el dibujo seguía cayendo en la 0.
  const before = baseDocument();
  const { effects } = run(before, ["LAYCUR", pick("tubo")]);
  const variableEffect = effects.find((effect) => effect.kind === "variables");
  assert.ok(variableEffect, "LAYCUR emite un cambio de variables");
  assert.equal(
    variableEffect?.kind === "variables" ? variableEffect.patch.CLAYER : undefined,
    "MEP",
    "escribe CLAYER (no CCLAYER) con la capa del objeto designado",
  );
  assert.equal(
    variableEffect?.kind === "variables" ? "CCLAYER" in variableEffect.patch : false,
    false,
    "y no deja la clave vieja a medias",
  );

  // La prueba de verdad: ese CLAYER alimenta context.activeLayer como lo haría
  // el anfitrión, y una LINE dibujada a continuación cae de verdad en "MEP",
  // no en "0" (la capa por defecto de la sesión).
  const nextLayer =
    variableEffect?.kind === "variables" ? String(variableEffect.patch.CLAYER) : "0";
  const drawn = run(
    before,
    [
      "LINE",
      { kind: "point", point: { x: 10, y: 10 }, source: "typed" },
      { kind: "point", point: { x: 20, y: 20 }, source: "typed" },
      "\r",
    ],
    { activeLayer: nextLayer },
  );
  const newLine = drawn.document.entities.find(
    (entity) => !before.entities.some((original) => original.id === entity.id),
  );
  assert.ok(newLine, "LINE dibuja un segmento nuevo");
  assert.equal(newLine?.layer, "MEP", "el objeto nuevo queda en la capa que designó LAYCUR");
}

console.log(
  "settings-layer-tools: VPLAYER congela y descongela por ventana en un lote y la publicación lo respeta; " +
    "LAYISO/LAYUNISO aíslan con memoria de sesión, LAYFRZ/LAYTHW y LAYOFF/LAYON tocan el documento canónico, " +
    "LAYMCH iguala capas, LAYWALK pasea de verdad con vuelta, LAYMRG fusiona y purga en un lote, " +
    "-LAYER aprende Inutilizar/Reutilizar y LAYCUR escribe CLAYER de verdad (no CCLAYER)",
);
