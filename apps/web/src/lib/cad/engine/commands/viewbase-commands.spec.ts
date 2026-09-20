/**
 * Familia VIEWBASE: los seis comandos de documentación desde el modelo.
 *
 *   VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE.
 *
 * Delegan en el motor SOLVIEW/SOLDRAW, y la sección 8 más abajo es la
 * excepción deliberada a la frase de siempre («aquí no se comprueba que la
 * proyección sea correcta, eso ya lo cubre `solview-golden.spec.ts`»): ese
 * golden mide el ALGORITMO llamando a `cadSoldrawCommands` DIRECTAMENTE, nunca
 * pasa por el registro de comandos, así que no demuestra que VIEWBASE y
 * VIEWUPDATE —las órdenes que de verdad se teclean— produzcan esa misma
 * geometría medida. La sección 8 sí: crea la vista y la dibuja por el
 * registro, mide el rectángulo que sale, mueve el sólido y vuelve a pedir
 * VIEWUPDATE para comprobar que la vista se REGENERA con el número que toca,
 * no con el de antes.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

// Las implementaciones de los comandos llegan a demanda en el navegador.
import "@/lib/cad/engine/all-commands";

const layer = "MUROS";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [{
      id: "ps1",
      name: "Presentación1",
      page: { width: 420, height: 297 },
      viewports: [],
    }],
  });
}

let idCounter = 0;

function makeContext(
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `vb${++idCounter}`,
    paperSpaces: () => document.paperSpaces,
    activeLayout: "Presentación1",
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro`);
  const context = makeContext(document, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const enter: CadCommandInput = { kind: "enter" };

// --- Modelo de prueba: un rectángulo extruido ---------------------------------
const rect: CadEntity = {
  id: "base",
  type: "polyline",
  closed: true,
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 5000, y: 0, z: 0 },
    { x: 5000, y: 3000, z: 0 },
    { x: 0, y: 3000, z: 0 },
  ],
  layer,
};
let doc = documentWith([rect]);

// Extruir el rectángulo para tener un sólido.
{
  const result = run("EXTRUDE", [keyword("base"), distance(2800)], doc, ["base"]);
  assert.ok(result && result.kind === "document", "EXTRUDE produce documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
}

// --- Registro: los seis comandos existen --------------------------------------
{
  const names = ["VIEWBASE", "VIEWPROJ", "VIEWSECTION", "VIEWDETAIL", "VIEWEDIT", "VIEWUPDATE"];
  for (const name of names) {
    assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);
  }
}

// --- VIEWBASE: planta por defecto con corte a 1200 mm -------------------------
{
  const result = run("VIEWBASE", [enter, enter, text("Planta baja"), enter], doc);
  assert.ok(result?.kind === "document", "VIEWBASE produce documento");
  assert.ok(result.commands.length > 0, "VIEWBASE genera comandos de inserción");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const vps = doc.paperSpaces[0]?.viewports ?? [];
  const vp = vps.find((v) => v.name === "Planta baja");
  assert.ok(vp, "VIEWBASE crea viewport con nombre «Planta baja»");
}

// --- VIEWPROJ: proyectar la planta hacia frontal --------------------------------
{
  const result = run("VIEWPROJ", [text("Planta baja"), keyword("Frontal"), text("Alzado sur")], doc);
  if (result?.kind === "document") {
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    assert.ok(result?.kind === "message", `VIEWPROJ responde: ${result?.kind}`);
  }
}

// --- VIEWSECTION: sección por dos puntos --------------------------------------
{
  const result = run("VIEWSECTION", [point(0, 1500), point(5000, 1500), text("Corte A-A")], doc);
  if (result?.kind === "document") {
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    assert.ok(result?.kind === "message", `VIEWSECTION responde: ${result?.kind}`);
  }
}

// --- VIEWDETAIL: detalle ampliado de la planta ---------------------------------
{
  const result = run("VIEWDETAIL", [text("Planta baja"), enter, text("Detalle esquina")], doc);
  if (result?.kind === "document") {
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    assert.ok(result?.kind === "message", `VIEWDETAIL responde: ${result?.kind}`);
  }
}

// --- VIEWEDIT: consultar propiedades de la planta ------------------------------
{
  const result = run("VIEWEDIT", [text("Planta baja")], doc);
  assert.ok(result && result.kind === "message", "VIEWEDIT devuelve un mensaje");
}

// --- VIEWEDIT: vista inexistente -----------------------------------------------
{
  const result = run("VIEWEDIT", [text("No existe")], doc);
  assert.ok(result && result.kind === "message", "VIEWEDIT con vista inexistente devuelve mensaje");
}

// --- VIEWUPDATE: actualizar vistas obsoletas -----------------------------------
{
  const result = run("VIEWUPDATE", [enter], doc);
  // VIEWUPDATE devuelve documento si hay algo que actualizar, o mensaje si ya
  // están al día. Ambos son válidos.
  assert.ok(
    result && (result.kind === "document" || result.kind === "message"),
    `VIEWUPDATE responde: ${result?.kind}`,
  );
}

// --- 8. LA MEDIDA: VIEWBASE + VIEWUPDATE por el registro, área real, y
//        REGENERAR tras mover el sólido (no un dibujo fijo) -------------------
//
// SOLDRAW dibuja la vista derivada EN COORDENADAS REALES (milímetros del
// modelo), en una zona propia del espacio modelo que reserva para sí —no en
// unidades de papel escaladas—: la escala del viewport gobierna cómo se VE en
// la lámina, no lo que se guarda. Así que lo que este bloque mide es el
// tamaño real (5.000 × 3.000 mm, el de la planta) y el desplazamiento real
// (1.000 mm) tras mover el sólido, filtrando la capa `…-VIS` que es la huella
// del sólido — la capa `…-ROT` añade una marca de orientación que no forma
// parte del contorno y ensancharía la caja si no se descartara.
{
  // Documento AISLADO: no comparte `doc` con las secciones de arriba, así
  // que nada de lo que aquí se mueva les afecta.
  const planta: CadEntity = {
    id: "planta",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 5000, y: 0, z: 0 },
      { x: 5000, y: 3000, z: 0 },
      { x: 0, y: 3000, z: 0 },
    ],
    layer,
  };
  let medida = documentWith([planta]);
  const extrusion = run("EXTRUDE", [keyword("planta"), distance(2800)], medida, ["planta"]);
  assert.ok(extrusion?.kind === "document", "EXTRUDE arma el sólido de la medida");
  if (extrusion?.kind !== "document") throw new Error("tipo");
  medida = executeCadEntityCommandBatch(medida, extrusion.commands, extrusion.label).document;
  const solidoId = medida.entities.find((entity) => entity.type === "solid3d")!.id;

  const base = run("VIEWBASE", [enter, enter, text("Planta medida"), enter], medida);
  assert.ok(base?.kind === "document", "VIEWBASE produce documento");
  if (base?.kind !== "document") throw new Error("tipo");
  medida = executeCadEntityCommandBatch(medida, base.commands, base.label).document;
  const viewport = medida.paperSpaces[0]?.viewports?.find((v) => v.name === "Planta medida");
  assert.ok(viewport, "el viewport «Planta medida» existe");
  const capaVistas = `${viewport?.derivation?.layerBase}-VIS`;
  assert.equal(capaVistas, "PLANTA-MEDIDA-VIS", "la capa de vistas sale del nombre de la vista");

  // VIEWBASE crea el HUECO, no el dibujo: sin VIEWUPDATE no hay una sola
  // línea nueva. Es la comprobación que separa «definí la vista» de «la vista
  // ya muestra algo», y es la que `solview-golden.spec.ts` no hace porque
  // llama a `cadSoldrawCommands` sin pasar por el hueco que deja VIEWBASE.
  const antesDeActualizar = new Set(medida.entities.map((entity) => entity.id));
  assert.equal(
    medida.entities.filter((entity) => entity.type === "line").length,
    0,
    "VIEWBASE por sí sola no dibuja ni una línea",
  );

  /** Envolvente de las líneas NUEVAS de la capa de vistas —no de todo lo nuevo. */
  const boundsOfViewLines = (document: CadDocument, knownIds: ReadonlySet<string>) => {
    const nuevas = document.entities.filter(
      (entity): entity is Extract<CadEntity, { type: "line" }> =>
        entity.type === "line" && entity.layer === capaVistas && !knownIds.has(entity.id),
    );
    assert.ok(nuevas.length > 0, "VIEWUPDATE tiene que dejar líneas nuevas en la capa de vistas");
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const line of nuevas)
      for (const p of [line.start, line.end]) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, count: nuevas.length };
  };

  const primeraActualizacion = run("VIEWUPDATE", [enter], medida);
  assert.ok(primeraActualizacion?.kind === "document", "VIEWUPDATE dibuja la planta recién creada");
  if (primeraActualizacion?.kind !== "document") throw new Error("tipo");
  medida = executeCadEntityCommandBatch(medida, primeraActualizacion.commands, primeraActualizacion.label).document;

  const near = (actual: number, expected: number, mensaje: string, tolerancia = 1e-6) =>
    assert.ok(Math.abs(actual - expected) <= tolerancia, `${mensaje}: ${actual}, se esperaba ${expected}`);
  const cajaInicial = boundsOfViewLines(medida, antesDeActualizar);
  // La medida, no el recuento: la huella de la planta es la del sólido —
  // 5.000 × 3.000 mm— tal cual, porque SOLDRAW la dibuja en milímetros reales.
  near(cajaInicial.width, 5_000, "la planta dibujada mide 5.000 mm de ancho, el largo real del sólido", 1e-6);
  near(cajaInicial.height, 3_000, "y 3.000 mm de fondo", 1e-6);

  // Cambiar el MODELO: el sólido se desplaza 1.000 mm en X. Es una orden real
  // del motor de transformaciones (MOVE la aplica igual), no un truco de spec.
  const mover: CadEntityCommand = {
    type: "transform",
    entityId: solidoId,
    transform: { translation: { x: 1_000, y: 0 } },
  };
  medida = executeCadEntityCommandBatch(medida, [mover], "MOVE").document;

  const idsAntesDeSegundaVuelta = new Set(medida.entities.map((entity) => entity.id));
  const segundaActualizacion = run("VIEWUPDATE", [enter], medida);
  assert.ok(
    segundaActualizacion?.kind === "document",
    `VIEWUPDATE, tras mover el sólido, tiene ALGO que regenerar: ${JSON.stringify(segundaActualizacion)}`,
  );
  if (segundaActualizacion?.kind !== "document") throw new Error("tipo");
  assert.ok(
    segundaActualizacion.commands.length > 0,
    "y el lote que regenera no está vacío: la vista de verdad se REDIBUJA, no se declara al día en silencio",
  );
  medida = executeCadEntityCommandBatch(medida, segundaActualizacion.commands, segundaActualizacion.label).document;

  const cajaTrasMover = boundsOfViewLines(medida, idsAntesDeSegundaVuelta);
  // El tamaño NO cambia —sólo se tradujo el sólido, no se estiró—, pero el
  // CENTRO sí, y exactamente lo que se movió: 1.000 mm en X.
  near(cajaTrasMover.width, 5_000, "tras mover el sólido, la planta redibujada sigue midiendo 5.000 mm", 1e-6);
  near(cajaTrasMover.height, 3_000, "y 3.000 mm: sólo se tradujo, no se deformó", 1e-6);
  const desplazamiento = (cajaTrasMover.minX + cajaTrasMover.maxX) / 2 - (cajaInicial.minX + cajaInicial.maxX) / 2;
  near(desplazamiento, 1_000, "el centro del dibujo se movió los mismos 1.000 mm que el sólido: la vista SÍ se regeneró", 1e-6);
}

// --- Cancelación --------------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("VIEWBASE")!;
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "VIEWBASE se cancela limpiamente",
  );
}

// --- Sin presentaciones -------------------------------------------------------
{
  const sinEspacios = migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities: [],
    modelSpace: { entityIds: [] },
  });
  const ctxSinEspacios: CadCommandContext = {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `vb${++idCounter}`,
    paperSpaces: () => sinEspacios.paperSpaces,
  };
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("VIEWBASE")!;
  let step = descriptor.begin(ctxSinEspacios);
  for (const input of [enter, enter, text("X"), enter]) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctxSinEspacios);
  }
  const result = step.result;
  assert.ok(
    result && result.kind === "message",
    "VIEWBASE sin presentaciones devuelve mensaje",
  );
}

console.log(
  "✅ viewbase-commands.spec: VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE — flujo tecleado, " +
    "y la sección 8 midiendo la planta real (5.000×3.000 mm) y su regeneración tras mover el sólido (+1.000 mm) " +
    "por el registro de comandos, no por la función interna",
);
