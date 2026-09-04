/**
 * DXFIN y DXFOUT: que EXISTAN y que el archivo dé la vuelta entera.
 *
 * Tres cosas se comprueban aquí y ninguna es decorativa:
 *
 *   1. **Que se puedan teclear.** Los alias `DXFIN` y `DXFOUT` llevaban meses
 *      declarados en `alias-table.ts` sin ningún descriptor detrás: el usuario
 *      que los escribía obtenía «Comando desconocido». Se resuelven contra el
 *      registro REAL del producto, no contra uno montado en la spec, porque el
 *      registro real es el que decide qué pasa cuando alguien teclea.
 *   2. **Que el ciclo cierre.** Se exporta con `DXFOUT`, se vuelve a meter el
 *      texto por `DXFIN` y se exige que las entidades regresen. Un round-trip
 *      contra el propio lector es la única prueba que no se puede satisfacer
 *      escribiendo un archivo que parece DXF.
 *   3. **Que falle cerrado.** Un DWG renombrado, una selección vacía y un
 *      dibujo sin geometría terminan en un mensaje con su razón, no en un lote
 *      vacío aplicado con éxito ni en un archivo de cero entidades.
 *
 * Correr:  npx tsx src/lib/cad/engine/commands/interop-dxf.spec.ts
 */
import { strict as assert } from "node:assert";
import {
  layoutToCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { importDxfPrimitives } from "../../dxf-import";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import type {
  CadCommandContext,
  CadCommandDocumentView,
  CadCommandInput,
  CadCommandResult,
} from "../command-types";
import { planCadDxfExport, planCadDxfImport } from "./interop-dxf";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

// --- 1. existen, y con el nombre que el dibujante teclea ---------------------
{
  for (const name of ["DXFIN", "DXFOUT"]) {
    const descriptor = registry.get(name);
    assert.ok(descriptor, `${name} no llegó al registro del producto`);
    assert.equal(descriptor?.name, name);
    // El guion de AutoCAD es decorativo mientras nadie reclame ese nombre; la
    // spec del registro lo exige para todos y aquí se fija para éstos dos.
    assert.equal(registry.get(`-${name}`)?.name, name, `-${name} debe llevar a ${name}`);
    assert.equal(registry.get(`_${name}`)?.name, name, `_${name} debe llevar a ${name}`);
    // La tabla de alias los declaraba desde antes de que existieran: ahora
    // resuelven de verdad en vez de quedarse en el inventario de pendientes.
    assert.equal(resolveCadCommandAlias(name, registry.names()), name);
    assert.equal(
      resolveCadCommandAlias(name.toLowerCase(), registry.names()),
      name,
      "tecleado en minúsculas resuelve igual",
    );
  }
  assert.ok(
    !registry.unresolvedAliases().some((entry) => entry.includes("DXFIN") || entry.includes("DXFOUT")),
    "DXFIN y DXFOUT ya no pueden figurar como alias sin implementar",
  );
}

// --- montaje: un documento con lo que trae un plano de arquitectura ----------
const entities: CadEntity[] = [
  { id: "muro", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 4_000, y: 0, z: 0 }, layer: "MUROS" },
  {
    id: "zona",
    type: "polyline",
    vertices: [
      { x: 0, y: 500, z: 0, bulge: 0.5 },
      { x: 2_000, y: 500, z: 0 },
      { x: 2_000, y: 2_000, z: 0 },
    ],
    closed: true,
    layer: "ZONAS",
  },
  { id: "col", type: "circle", center: { x: 3_000, y: 3_000, z: 0 }, radius: 150, layer: "COLUMNAS" },
  {
    id: "nota",
    type: "mtext",
    insertion: { x: 100, y: 4_000, z: 0 },
    text: "NIVEL DE PISO TERMINADO",
    height: 200,
    layer: "TEXTOS",
  },
];

function makeDocument(): CadDocument {
  const empty = layoutToCadDocument({}, { unit: "mm" });
  return {
    ...empty,
    layers: ["0", "MUROS", "ZONAS", "COLUMNAS", "TEXTOS"].map((name) => ({
      id: name,
      name,
      color: "#ffffff",
      visible: true,
      locked: false,
    })),
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  };
}

function view(document: CadDocument): CadCommandDocumentView {
  return document;
}

function makeContext(options: { document?: CadDocument; selection?: readonly string[] } = {}): CadCommandContext {
  let ids = 0;
  const document = options.document;
  return {
    entityIds: document?.entities.map((entity) => entity.id) ?? [],
    entity: (id) => document?.entities.find((entity) => entity.id === id),
    selection: options.selection ?? [],
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
    ...(document
      ? { document: () => view(document), layers: () => document.layers }
      : {}),
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  context: CadCommandContext,
): CadCommandResult | undefined {
  const descriptor = registry.get(name);
  assert.ok(descriptor, `${name} no está registrado`);
  let step = descriptor!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
  }
  return step.result;
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const enter: CadCommandInput = { kind: "enter" };
const cancel: CadCommandInput = { kind: "cancel" };

// --- 2. DXFOUT produce texto DXF, y con las pérdidas declaradas --------------
let exported = "";
{
  const result = run("DXFOUT", [keyword("Todo"), text("planta-baja")], makeContext({ document: makeDocument() }));
  assert.ok(result && result.kind === "host", `DXFOUT debía pedir trabajo al anfitrión, dio ${result?.kind}`);
  if (!result || result.kind !== "host") throw new Error("tipo");
  const request = result.request;
  assert.equal(request.kind, "dxf-export");
  if (request.kind !== "dxf-export") throw new Error("tipo");
  // La extensión se pone sola: nadie teclea «.dxf» y descubrir que el archivo
  // se llama «planta-baja» a secas pasa cuando ya está en el correo.
  assert.equal(request.fileName, "planta-baja.dxf");
  assert.ok(request.content.includes("SECTION"), "el contenido es un DXF de texto");
  assert.ok(request.entityCount > 0, "el DXF lleva entidades");
  assert.ok(request.layers.includes("MUROS"), "las capas del dibujo viajan al archivo");
  // El manifiesto viaja CON el archivo: es lo que permite decir qué no lleva
  // antes de mandarlo, que es la ventaja honesta frente a AutoCAD.
  assert.ok(Array.isArray(request.losses), "el manifiesto de pérdidas acompaña al archivo");
  exported = request.content;
}

// --- 3. el ciclo cierra: lo exportado vuelve a entrar por DXFIN --------------
{
  const context = makeContext();
  const asked = registry.get("DXFIN")!.begin(context);
  assert.equal(asked.result, undefined, "DXFIN empieza pidiendo el contenido, no terminando");

  // Primer paso: el texto produce el paso de CONFIRMACIÓN, no el documento. Es
  // lo que garantiza que el informe de pérdidas no se pueda saltar.
  const confirm = registry.get("DXFIN")!.step(asked.state, text(exported), context);
  assert.equal(confirm.result, undefined, "tras leer el DXF hay que confirmar antes de tocar el dibujo");
  assert.ok(
    confirm.prompt.message.includes("Entraron") || confirm.prompt.message.includes("Entró completo"),
    `el prompt debe resumir qué entró; decía: ${confirm.prompt.message}`,
  );
  assert.deepEqual(
    confirm.prompt.options.map((option) => option.keyword),
    ["Sí", "No"],
  );

  const result = run("DXFIN", [text(exported), enter], context);
  assert.ok(result && result.kind === "document", `DXFIN debía mutar el documento, dio ${result?.kind}`);
  if (!result || result.kind !== "document") throw new Error("tipo");
  const inserts = result.commands.filter((command) => command.type === "insert");
  const layers = result.commands.filter((command) => command.type === "layer");
  assert.equal(inserts.length, entities.length, "vuelven las cuatro entidades del plano");
  assert.ok(
    layers.some((command) => command.type === "layer" && command.op === "upsert" && command.layer.name === "MUROS"),
    "las capas que el dibujo no tiene se crean",
  );
  const types = inserts.map((command) => (command.type === "insert" ? command.entity.type : "?")).sort();
  assert.deepEqual(types, ["circle", "line", "mtext", "polyline"], "cada tipo vuelve como lo que era");
  // El bulge es lo primero que se pierde en un lector a medias: un arco de
  // polilínea vuelto recto es indistinguible de un dibujo mal hecho.
  const polyline = inserts
    .map((command) => (command.type === "insert" ? command.entity : null))
    .find((entity) => entity?.type === "polyline");
  assert.ok(polyline && polyline.type === "polyline");
  if (polyline?.type !== "polyline") throw new Error("tipo");
  assert.ok(
    polyline.vertices.some((vertex) => Math.abs((vertex.bulge ?? 0) - 0.5) < 1e-6),
    "el bulge del tramo curvo sobrevive al ciclo entero",
  );
  assert.ok(result.label.includes("DXFIN"), "el paso de deshacer se llama DXFIN");
}

// --- 4. DXFIN sin anfitrión de archivos pide la interfaz --------------------
{
  const result = run("DXFIN", [keyword("Archivo")], makeContext());
  assert.ok(result && result.kind === "ui", `DXFIN Archivo debía pedir interfaz, dio ${result?.kind}`);
  if (!result || result.kind !== "ui") throw new Error("tipo");
  assert.equal(result.request.target, "dxf-file");
  assert.ok(
    result.request.unavailable.includes("Pega"),
    "si nadie sabe abrir archivos, el comando dice cuál es la alternativa que SÍ funciona",
  );
}

// --- 5. fallo cerrado -------------------------------------------------------
{
  const noContent = run("DXFIN", [text("   ")], makeContext());
  assert.equal(noContent?.kind, "message", "un contenido vacío no puede parecer una importación");

  // Un DWG renombrado a `.dxf` es el caso real: llega, no se parsea, y lo que
  // el usuario tiene que leer es eso y no «0 entidades importadas».
  const garbage = run("DXFIN", [text("Esto no es un DXF, es un correo.")], makeContext());
  assert.ok(garbage && garbage.kind === "message", "un archivo ilegible termina en mensaje");
  if (garbage?.kind !== "message") throw new Error("tipo");
  assert.ok(
    garbage.text.includes("DWG") || garbage.text.includes("no se pudo leer") || garbage.text.includes("ninguna entidad"),
    `el mensaje debe decir qué pasó; decía: ${garbage.text}`,
  );

  // Rechazar en el paso de confirmación NO toca el dibujo.
  const rejected = run("DXFIN", [text(exported), keyword("No")], makeContext());
  assert.equal(rejected?.kind, "message", "decir «No» no aplica nada");

  const escaped = run("DXFIN", [text(exported), cancel], makeContext());
  assert.equal(escaped?.kind, "message", "Esc tampoco aplica nada");

  // DXFOUT sobre selección vacía: son dos archivos muy distintos y el usuario
  // no vería la diferencia hasta que la viese el cliente.
  const emptySelection = run("DXFOUT", [keyword("Selección")], makeContext({ document: makeDocument() }));
  assert.ok(emptySelection && emptySelection.kind === "message");
  if (emptySelection?.kind !== "message") throw new Error("tipo");
  assert.ok(emptySelection.text.includes("designado"), emptySelection.text);

  // DXFOUT sin documento legible: se dice, no se escribe un archivo vacío.
  const blind = run("DXFOUT", [keyword("Todo"), enter], makeContext());
  assert.equal(blind?.kind, "message", "sin lectura del dibujo no se inventa un archivo");

  // Un dibujo sin geometría exportable tampoco produce archivo.
  const emptyDocument = layoutToCadDocument({}, { unit: "mm" });
  const nothing = run("DXFOUT", [keyword("Todo"), enter], makeContext({ document: emptyDocument }));
  assert.ok(nothing && nothing.kind === "message");
  if (nothing?.kind !== "message") throw new Error("tipo");
  assert.ok(nothing.text.includes("No se ha escrito"), nothing.text);
}

// --- 6. DXFOUT por SELECCIÓN escribe sólo lo designado ----------------------
{
  const result = run(
    "DXFOUT",
    [keyword("Selección"), enter],
    makeContext({ document: makeDocument(), selection: ["muro"] }),
  );
  assert.ok(result && result.kind === "host");
  if (!result || result.kind !== "host") throw new Error("tipo");
  const request = result.request;
  if (request.kind !== "dxf-export") throw new Error("tipo");
  assert.equal(request.fileName, "dibujo.dxf", "sin nombre tecleado se usa el propuesto");
  const reimported = importDxfPrimitives(request.content);
  assert.equal(reimported.primitives.length, 1, "sólo viaja la entidad designada");
  assert.equal(reimported.primitives[0].kind, "line");
}

// --- 7. los planes puros, sin máquina de estados ----------------------------
{
  // El plan es lo que se puede probar con texto DXF real sin montar la
  // conversación: cablearlo mal en el descriptor lo rompería arriba, y
  // romperlo aquí señala el módulo exacto.
  let ids = 0;
  const plan = planCadDxfImport(exported, { newEntityId: () => `p${++ids}` });
  assert.ok(plan.ok, "el plan de importación sale del DXF exportado");
  if (!plan.ok) throw new Error("tipo");
  assert.equal(plan.report.entityCount, entities.length);
  assert.ok(plan.report.headline.length > 0, "el informe siempre tiene titular");

  // Las capas que YA existen no se vuelven a escribir: una importación que te
  // repinta las capas del proyecto es una importación que nadie repite.
  const withLayers = planCadDxfImport(exported, {
    newEntityId: () => `q${++ids}`,
    existingLayers: ["0", "MUROS", "ZONAS", "COLUMNAS", "TEXTOS"],
  });
  assert.ok(withLayers.ok);
  if (!withLayers.ok) throw new Error("tipo");
  assert.equal(
    withLayers.commands.filter((command) => command.type === "layer").length,
    0,
    "no se toca ninguna capa que el dibujo ya tenga",
  );

  const document = makeDocument();
  const all = planCadDxfExport(document);
  const one = planCadDxfExport(document, (id) => id === "col");
  assert.ok(all.entityCount > one.entityCount, "el ámbito recorta de verdad lo que se escribe");
  assert.ok(all.content.includes("MUROS"), "las capas del dibujo llegan al archivo");
}

console.log(
  "interop-dxf: DXFIN y DXFOUT resuelven por nombre, con guion y con guion bajo; el ciclo " +
    "exportar→reimportar devuelve las cuatro entidades con su bulge; y los seis fallos cerrados " +
    "terminan en mensaje sin tocar el dibujo",
);
