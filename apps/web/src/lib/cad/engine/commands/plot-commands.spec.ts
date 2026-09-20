/**
 * PAGESETUP y PLOT tecleados.
 *
 * PAGESETUP se comprueba sobre el DOCUMENTO resultante: qué papel quedó
 * guardado, qué márgenes, qué tabla de plumas. PLOT se comprueba sobre la
 * PETICIÓN que sale hacia el anfitrión, porque trazar no cambia el dibujo y
 * afirmar sobre el documento no diría nada.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { createCadLayout } from "../../layout/layout-operations";
import {
  cadLayoutPlotStyleTable,
  cadPageSetupFromLayout,
  cadPrintableArea,
} from "../../plot/page-setup";
import { createCadVariableAccess } from "../../system-variables";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import type { CadHostRequest } from "../host-requests";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

function documentWithLayout(): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: {
      project: "Nave",
      drawingNumber: "A-0001",
      title: "Planta",
      sheetNumber: "S-001",
      revision: "P01",
      discipline: "Arquitectura",
    },
  });
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [layout],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

function run(
  document: CadDocument,
  tokens: readonly string[],
  // Almacén de variables COMPARTIDO entre los tokens de esta llamada: como
  // lo haría el anfitrión real, un "variables" que PLOTSTAMP escribe lo lee
  // PLOT dentro del MISMO run() (ver el bloque PLOTSTAMP más abajo).
  variables = createCadVariableAccess(),
): { document: CadDocument; effects: CadCommandEffect[] } {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  let current = document;
  const effects: CadCommandEffect[] = [];
  let ids = 0;
  for (const token of tokens) {
    const context: CadCommandContext = {
      entityIds: [],
      selection: [],
      activeLayer: "0",
      unit: current.meta.unit,
      activeLayout: "layout:planta",
      paperSpaces: () => current.paperSpaces,
      drawingExtents: () => ({ minX: 0, minY: 0, maxX: 10_000, maxY: 6_000 }),
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `new-${(ids += 1)}`,
      variables,
    };
    const reduction =
      token === "\r"
        ? cadCommandEngineReduce(state, { kind: "input", input: { kind: "enter" } }, context, registry)
        : cadCommandEngineReduce(state, { kind: "token", value: token }, context, registry);
    state = reduction.state;
    effects.push(...reduction.effects);
    for (const effect of reduction.effects) {
      if (effect.kind === "execute")
        current = executeCadEntityCommandBatch(current, effect.commands, effect.label).document;
      if (effect.kind === "variables")
        for (const [name, value] of Object.entries(effect.patch)) variables.set(name, value);
    }
  }
  return { document: current, effects };
}

const hosts = (effects: readonly CadCommandEffect[]): CadHostRequest[] =>
  effects.flatMap((effect) => (effect.kind === "host" ? [effect.request] : []));
const messages = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// --- PAGESETUP escribe la presentación ---------------------------------------
{
  const base = documentWithLayout();
  assert.equal(base.paperSpaces[0].page.width, 841, "A1 apaisado de partida");

  const paper = run(base, ["PAGESETUP", "P", "A3"]).document;
  assert.equal(paper.paperSpaces[0].pageSetup?.paper, "A3");
  assert.equal(paper.paperSpaces[0].page.width, 420);
  assert.equal(paper.paperSpaces[0].page.height, 297);

  const portrait = run(paper, ["PSET", "O", "Vertical"]).document;
  assert.equal(portrait.paperSpaces[0].page.orientation, "portrait");
  assert.equal(portrait.paperSpaces[0].page.width, 297);
  assert.equal(portrait.paperSpaces[0].page.height, 420);

  const styled = run(portrait, ["PSET", "E", "estudio-2004"]).document;
  assert.equal(cadLayoutPlotStyleTable(styled.paperSpaces[0]), "estudio-2004");
  const unstyled = run(styled, ["PSET", "E", "ninguna"]).document;
  assert.equal(cadLayoutPlotStyleTable(unstyled.paperSpaces[0]), null);

  const color = run(styled, ["PSET", "CO", "Color"]).document;
  assert.equal(color.paperSpaces[0].pageSetup?.colorMode, "color");

  const weights = run(color, ["PSET", "G", "1.5"]).document;
  assert.equal(weights.paperSpaces[0].pageSetup?.lineweightScale, 1.5);

  const margins = run(weights, ["PSET", "MA", "5,6,7,8"]).document;
  assert.deepEqual(margins.paperSpaces[0].pageSetup?.margins, {
    top: 5,
    right: 6,
    bottom: 7,
    left: 8,
  });

  // Cada opción es UN paso de historia, y nada más.
  assert.equal(margins.meta.version - base.meta.version, 6);

  const bad = run(base, ["PSET", "P", "A9"]);
  assert.ok(messages(bad.effects).some((text) => text.includes("no es un tamaño conocido")));
  assert.equal(bad.document.paperSpaces[0].pageSetup?.paper, "A1");

  const badMargins = run(base, ["PSET", "MA", "5,6"]);
  assert.ok(messages(badMargins.effects).some((text) => text.includes("cuatro números")));

  // T-12·3: no hay diálogo ni setups con nombre — «Diálogo» ya NO anuncia
  // éxito sin efecto. Muestra el setup vigente (verificable) y no escribe
  // nada ni pide nada al anfitrión.
  const dialog = run(base, ["PSET", "D"]);
  assert.deepEqual(hosts(dialog.effects), [], "sin diálogo real, no se pide nada al anfitrión");
  const dialogText = messages(dialog.effects).join(" ");
  assert.match(dialogText, /no hay un diálogo de configuración de página ni setups con nombre/i);
  assert.match(dialogText, /papel A1/i, "el setup vigente se lee y se muestra de verdad");
  assert.match(dialogText, /orientación apaisada/i);
  assert.equal(dialog.document.meta.version, base.meta.version, "leer el setup no escribe nada");
}

// --- PAGESETUP recoloca las ventanas gráficas al cambiar de papel --------------
{
  // El caso medido del defecto `paper-change-does-not-move-viewport`: la lámina
  // nace en A1 y se pasa a A3. Antes la ventana conservaba los `paperBounds`
  // de A1 y la geometría caía fuera del área imprimible del A3.
  //
  // La lámina se crea sin plantilla: márgenes uniformes de 10 mm, el caso
  // mínimo. (Con plantilla la afirmación también valdría: desde que
  // `createCadLayout` aplica la plantilla a través de
  // `applyCadPageSetupToLayout`, la ventana nace dentro de los márgenes ISO;
  // eso lo fija el spec de layout-operations.) La afirmación es exacta:
  // dentro del área imprimible, sin tolerancias blandas.
  const consistente = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: {
      project: "Nave",
      drawingNumber: "A-0001",
      title: "Planta",
      sheetNumber: "S-001",
      revision: "P01",
      discipline: "Arquitectura",
    },
  });
  const base = { ...documentWithLayout(), paperSpaces: [consistente] } as CadDocument;
  const before = base.paperSpaces[0].viewports![0];

  const changed = run(base, ["PAGESETUP", "P", "A3"]).document;
  const space = changed.paperSpaces[0];
  const viewport = space.viewports![0];
  const printable = cadPrintableArea(cadPageSetupFromLayout(space));
  const eps = 1e-6;
  assert.ok(
    viewport.paperBounds.x >= printable.x - eps &&
      viewport.paperBounds.y >= printable.y - eps &&
      viewport.paperBounds.x + viewport.paperBounds.width <= printable.x + printable.width + eps &&
      viewport.paperBounds.y + viewport.paperBounds.height <= printable.y + printable.height + eps,
    `la ventana (${JSON.stringify(viewport.paperBounds)}) debe quedar dentro del área imprimible del A3 (${JSON.stringify(printable)})`,
  );
  assert.ok(
    viewport.paperBounds.width < before.paperBounds.width,
    "en un papel más chico la ventana encoge; conservar el tamaño de A1 es el defecto",
  );
  // La escala es contrato del plano y el trozo de modelo encuadrado también:
  // recolocar es COLOCACIÓN. Si el modelo ya no cabe a esa escala, lo declara
  // el aviso viewport_model_clipped de la publicación, no un cambio callado.
  assert.equal(viewport.scale, before.scale, "la escala no se toca");
  assert.deepEqual(viewport.modelBounds, before.modelBounds, "el encuadre del modelo no se toca");

  // Ida y vuelta A1 → A3 → A1: la ventana vuelve a su sitio original. Es lo que
  // garantiza que el mapeo es proporcional de verdad y no una deriva acumulada.
  const roundTrip = run(changed, ["PAGESETUP", "P", "A1"]).document;
  const restored = roundTrip.paperSpaces[0].viewports![0];
  for (const key of ["x", "y", "width", "height"] as const)
    assert.ok(
      Math.abs(restored.paperBounds[key] - before.paperBounds[key]) < 1e-6,
      `ida y vuelta de papel: paperBounds.${key} volvió a ${restored.paperBounds[key]}, se esperaba ${before.paperBounds[key]}`,
    );
}

// --- PLOT compone la petición y NO toca el documento --------------------------
{
  const base = documentWithLayout();

  const plain = run(base, ["PLOT", "T", "planta-general"]);
  const requests = hosts(plain.effects);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.kind, "plot");
  if (request.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(request.mode, "plot");
  assert.equal(request.request.layoutId, "layout:planta");
  assert.equal(request.request.fileName, "planta-general");
  assert.deepEqual(request.request.pageSetup.area, { kind: "layout" });
  assert.deepEqual(request.request.pageSetup.scale, {
    kind: "ratio",
    paperMm: 1,
    drawingUnits: 1,
  });
  assert.equal(plain.document.meta.version, base.meta.version, "trazar no muta el dibujo");

  // Área Extensión + escala 1:50.
  const scaled = run(base, ["PLOT", "EX", "ESC", "1:50", "T", "planta-50"]);
  const scaledRequest = hosts(scaled.effects)[0];
  if (scaledRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.deepEqual(scaledRequest.request.pageSetup.area, { kind: "extents" });
  assert.deepEqual(scaledRequest.request.pageSetup.scale, {
    kind: "ratio",
    paperMm: 1,
    drawingUnits: 50,
  });

  // Área Ventana: dos esquinas.
  const windowed = run(base, ["PLOT", "V", "0,0", "5000,3000", "T", "detalle"]);
  const windowRequest = hosts(windowed.effects)[0];
  if (windowRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.deepEqual(windowRequest.request.pageSetup.area, {
    kind: "window",
    corner1: { x: 0, y: 0 },
    corner2: { x: 5000, y: 3000 },
  });

  // "Ventana" sin picar las dos esquinas NO deja el área en "Pantalla"
  // (T-31c/D6): eso trazaría un área que además siempre está bloqueada.
  // Se queda en la que hubiera antes de elegir "Ventana".
  const abandonedWindow = run(base, ["PLOT", "V", "T", "sin-esquinas"]);
  const abandonedRequest = hosts(abandonedWindow.effects)[0];
  if (abandonedRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.deepEqual(abandonedRequest.request.pageSetup.area, { kind: "layout" });

  // Intro con la PRIMERA esquina ya picada abandona la ventana a medias, igual
  // que la palabra clave «Trazar». Antes se quedaba en un bucle: `plotStep`
  // mira `corner1` antes que `askingFile` y devolvía otra vez «Precise la
  // esquina opuesta», sin más salida que cancelar.
  const halfWindow = run(base, ["PLOT", "V", "0,0", "\r", "media-ventana"]);
  const halfRequest = hosts(halfWindow.effects)[0];
  if (halfRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.deepEqual(halfRequest.request.pageSetup.area, { kind: "layout" });
  assert.equal(halfRequest.request.fileName, "media-ventana");

  // «Ajustar» es una escala válida y se dice así.
  const fitted = run(base, ["PLOT", "ESC", "ajustar", "T", "ajustado"]);
  const fittedRequest = hosts(fitted.effects)[0];
  if (fittedRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.deepEqual(fittedRequest.request.pageSetup.scale, { kind: "fit" });

  const badScale = run(base, ["PLOT", "ESC", "grandecito"]);
  assert.ok(messages(badScale.effects).some((text) => text.includes("no es una escala")));

  // La vista previa no pide nombre: no produce archivo.
  const preview = run(base, ["PLOT", "PR"]);
  const previewRequest = hosts(preview.effects)[0];
  if (previewRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(previewRequest.mode, "preview");

  // Enter en el paso del nombre acepta el de la presentación.
  const defaulted = run(base, ["PLOT", "T", "\r"]);
  const defaultedRequest = hosts(defaulted.effects)[0];
  if (defaultedRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(defaultedRequest.request.fileName, "Planta");

  // La tabla de plumas de la hoja viaja en la petición: trazar sin la CTB del
  // estudio es exactamente el fallo que este camino evita.
  const withTable = run(base, ["PSET", "E", "estudio-2004"]).document;
  const styledPlot = run(withTable, ["PLOT", "T", "x"]);
  const styledRequest = hosts(styledPlot.effects)[0];
  if (styledRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(styledRequest.request.pageSetup.plotStyleTable, "estudio-2004");
}

// --- PLOTSTAMP enciende PLOTSTAMPMODE y PLOT lo lee al componer la petición --
{
  const base = documentWithLayout();

  // Por defecto, apagado: nadie pidió sello y la petición no debe llevarlo.
  const off = run(base, ["PLOT", "T", "sin-sello"]);
  const offRequest = hosts(off.effects)[0];
  if (offRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(offRequest.request.pageSetup.plotStamp, false, "sin PLOTSTAMP, plotStamp queda apagado");

  // PLOTSTAMP Encender, y LUEGO PLOT, en la MISMA sesión: es el escenario
  // real — el usuario enciende el sello una vez y traza varias hojas.
  const on = run(base, ["PLOTSTAMP", "E", "PLOT", "T", "con-sello"]);
  assert.ok(
    messages(on.effects).some((text) => text.includes("Encendido")),
    "PLOTSTAMP dice que quedó encendido",
  );
  const onRequests = hosts(on.effects);
  assert.equal(onRequests.length, 1, "PLOTSTAMP no traza: sólo cambia la variable");
  const onRequest = onRequests[0];
  if (onRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(onRequest.request.pageSetup.plotStamp, true, "PLOT lee PLOTSTAMPMODE encendido");

  // Enter alterna en vez de fijar: sobre "Apagado" enciende, sobre
  // "Encendido" apaga — como FILL, LAYON/LAYOFF y el resto de la familia.
  const toggled = run(base, ["PLOTSTAMP", "\r", "PLOTSTAMP", "\r", "PLOT", "T", "doble"]);
  const toggledRequest = hosts(toggled.effects)[0];
  if (toggledRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(toggledRequest.request.pageSetup.plotStamp, false, "dos Intros vuelven a apagado");

  // Apagar explícito sobre lo ya encendido.
  const explicitOff = run(base, ["PLOTSTAMP", "E", "PLOTSTAMP", "A", "PLOT", "T", "apagado-explicito"]);
  const explicitOffRequest = hosts(explicitOff.effects)[0];
  if (explicitOffRequest.kind !== "plot") throw new Error("se esperaba una petición de trazado");
  assert.equal(explicitOffRequest.request.pageSetup.plotStamp, false);
}

// --- PLOT no se declara mutante ----------------------------------------------
{
  assert.equal(registry.get("PLOT")?.mutates, false, "un dibujo en sólo lectura se puede imprimir");
  assert.equal(registry.get("PAGESETUP")?.mutates, true);
  assert.equal(registry.get("PLOT")?.name, registry.get("PRINT")?.name);
  assert.equal(registry.get("-PLOT")?.name, "PLOT", "la variante sin diálogo resuelve igual");
}

console.log("cad plot command specs passed");
