/**
 * Las órdenes que AÚN NO ESTÁN DISPONIBLES lo dicen, no tocan el dibujo y no
 * tienen botón en la cinta.
 *
 * Lo que mide, contra el registro y el reductor REALES:
 *
 *   1. Las 24 órdenes de la auditoría del 2026-09-19 están en la tabla: 13 de
 *      render, luces y materiales (su petición no la atendía nadie), 8 de
 *      visualización («requiere anfitrión con visor 3D») y las 3 que destruían
 *      trabajo (SURFSCULPT, SURFUNTRIM, MESHCOLLAPSE).
 *   2. Invocadas con un sólido y una malla YA designados, terminan en el acto
 *      con un único renglón «… aún no está disponible: …», sin petición a un
 *      anfitrión, sin vista, sin variables, sin lote — y sin afirmar que otro
 *      anfitrión las atiende.
 *   3. EL DOCUMENTO NO CAMBIA: se conducen con un bucle de anfitrión que sí
 *      aplica los lotes (como la sonda de integridad) y con las entradas que
 *      antes las llevaban a destruir; la serialización, el número de entidades
 *      y el volumen de cada sólido quedan idénticos.
 *   4. La cinta no las monta, las declara no-expuestas con su motivo, y la
 *      paleta Ctrl+K no promete lo que no hacen.
 *
 * Con el código anterior fallan el 2 (RENDER abría un prompt de formato y
 * acababa en `render-capture`), el 3 (SURFSCULPT borraba el cubo de 500 000 mm³
 * y dejaba una placa de 1 000; MESHCOLLAPSE superponía la caja envolvente) y el
 * 4 (RENDER era el botón grande de Salida › Render).
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { solid3dBody, solid3dMassProperties } from "../solid3d-build";
import { CAD_RIBBON_DATA, CAD_RIBBON_UNEXPOSED, cadRibbonExposedNames, findCadRibbonCommand } from "../ribbon";
import {
  CAD_COMANDOS_AUN_NO_DISPONIBLES,
  cadComandoAunNoDisponible,
  cadMensajeAunNoDisponible,
} from "./command-availability";
import {
  cadCommandEngineReduce,
  EMPTY_CAD_COMMAND_ENGINE,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "./command-engine";
import { cadCommandSummary } from "./command-summaries";
import type { CadCommandContext, CadCommandInput } from "./command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "./index";

import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;
let comprobaciones = 0;
const ok = (condicion: unknown, mensaje: string): void => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

// ── 1. La tabla cubre la auditoría y sólo nombra comandos reales ─────────────
const RENDER = [
  "RENDER", "RENDERPRESETS", "RENDEREXPOSURE", "RENDERENVIRONMENT", "RENDERCROP", "RENDERWIN",
  "MATERIALS", "MATERIALATTACH", "MATERIALMAP", "POINTLIGHT", "SPOTLIGHT", "DISTANTLIGHT", "SUNPROPERTIES",
];
const VISUALIZACION = ["3DWALK", "3DFLY", "3DSWIVEL", "VISUALSTYLES", "CAMERA", "DVIEW", "NAVVCUBE", "NAVBAR"];
const DESTRUCTIVOS = ["SURFSCULPT", "SURFUNTRIM", "MESHCOLLAPSE"];
const AUDITADOS = [...RENDER, ...VISUALIZACION, ...DESTRUCTIVOS];

const nombres = Object.keys(CAD_COMANDOS_AUN_NO_DISPONIBLES);
for (const name of AUDITADOS) ok(cadComandoAunNoDisponible(name), `${name} está declarado como aún no disponible`);
for (const name of nombres) {
  ok(registry.get(name), `${name} sigue en el registro: quien lo teclea recibe respuesta, no «Comando desconocido»`);
  const motivo = CAD_COMANDOS_AUN_NO_DISPONIBLES[name];
  ok(motivo.length >= 20 && !motivo.endsWith("."), `${name}: el motivo es una frase sin punto final («${motivo}»)`);
}
assert.throws(() => cadMensajeAunNoDisponible("LINE"), /no está declarado/, "LINE funciona: no tiene renglón de negativa");
comprobaciones += 1;

// ── Documento de prueba: un cubo de 100×100×50 y una malla refinada ─────────
const layer = "0";
let ids = 0;

function context(document: CadDocument, selection: readonly string[]): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    document: () => document,
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 50, centerY: 50 },
    cursor: { x: 50, y: 50 },
    newEntityId: () => `av${(ids += 1)}`,
  };
}

/** Para montar el documento: el descriptor a pelo, como los specs de familia. */
function aplicar(document: CadDocument, name: string, inputs: readonly CadCommandInput[], selection: readonly string[]): CadDocument {
  const descriptor = registry.get(name)!;
  const ctx = context(document, selection);
  let step = descriptor.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
  }
  assert.ok(step.result?.kind === "document", `${name} monta el documento de prueba`);
  return executeCadEntityCommandBatch(document, step.result.commands, step.result.label).document;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const enter: CadCommandInput = { kind: "enter" };

const rect: CadEntity = {
  id: "base",
  type: "polyline",
  closed: true,
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 100, z: 0 },
    { x: 0, y: 100, z: 0 },
  ],
  layer,
};
let documento = migrateCadDocument({
  meta: { version: 1, schema: 5, unit: "mm" },
  layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
  entities: [rect],
  modelSpace: { entityIds: [rect.id] },
});
documento = aplicar(documento, "EXTRUDE", [keyword("base"), distance(50)], ["base"]);
const cuboId = documento.entities.find((entity) => entity.type === "solid3d")!.id;
documento = aplicar(documento, "MESH", [point(200, 0), point(300, 100), distance(50)], []);
const mallaBaseId = documento.entities.find((entity) => entity.type === "solid3d" && entity.id !== cuboId)!.id;
documento = aplicar(documento, "MESHREFINE", [{ kind: "entityPick", entityId: mallaBaseId, point: { x: 250, y: 50 } }, enter], []);
const mallaId = documento.entities.find(
  (entity) => entity.type === "solid3d" && entity.id !== cuboId && entity.id !== mallaBaseId,
)!.id;

const volumenes = (document: CadDocument): string =>
  document.entities
    .filter((entity) => entity.type === "solid3d")
    .map((entity) => `${entity.id}=${solid3dMassProperties(entity as never).volume.toFixed(3)}`)
    .join(" ");

ok(Math.abs(solid3dMassProperties(documento.entities.find((e) => e.id === cuboId) as never).volume - 500_000) < 1e-6,
  "el cubo de prueba mide 500 000 mm³ (el caso medido en la auditoría)");
ok(solid3dBody(documento.entities.find((e) => e.id === mallaId) as never).faces.length > 8,
  "la malla de prueba está refinada: MESHCOLLAPSE tendría algo que colapsar");

// ── 2 y 3. Conducidas por el reductor con un anfitrión que SÍ aplica lotes ──
interface Conduccion {
  document: CadDocument;
  effects: CadCommandEffect[];
  activa: boolean;
}

/**
 * El bucle de anfitrión de la sonda de integridad, en pequeño: invoca, alimenta
 * las entradas mientras la orden siga abierta y APLICA cada lote que salga.
 */
function conducir(document: CadDocument, name: string, selection: readonly string[], inputs: readonly CadCommandInput[]): Conduccion {
  let state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  let doc = document;
  const effects: CadCommandEffect[] = [];
  const despachar = (reduction: ReturnType<typeof cadCommandEngineReduce>): void => {
    state = reduction.state;
    for (const effect of reduction.effects) {
      effects.push(effect);
      if (effect.kind === "execute") doc = executeCadEntityCommandBatch(doc, effect.commands, effect.label).document;
    }
  };
  despachar(cadCommandEngineReduce(state, { kind: "invoke", command: name }, context(doc, selection), registry));
  const activaTrasInvocar = state.active !== null;
  for (const input of inputs) {
    if (!state.active) break;
    despachar(cadCommandEngineReduce(state, { kind: "input", input }, context(doc, selection), registry));
  }
  while (state.active) {
    despachar(cadCommandEngineReduce(state, { kind: "input", input: { kind: "cancel" } }, context(doc, selection), registry));
  }
  return { document: doc, effects, activa: activaTrasInvocar };
}

/** Las entradas que antes llevaban a cada orden hasta su efecto (o su destrozo). */
const ENTRADAS: readonly CadCommandInput[] = [
  { kind: "selection", entityIds: [mallaId, cuboId] },
  keyword("PNG"),
  { kind: "text", value: "Acero" },
  distance(10),
  point(0, 0),
  point(10, 0),
  enter,
  enter,
];

const EFECTOS_PERMITIDOS = new Set(["message", "preview", "osnapOverride", "idle"]);
const antes = serializeCadDocument(documento);
const volumenesAntes = volumenes(documento);

for (const name of nombres) {
  const esperado = cadMensajeAunNoDisponible(name);
  ok(esperado.startsWith(`${name} aún no está disponible: `), `${name}: el renglón empieza por «${name} aún no está disponible:»`);
  ok(!/anfitri/i.test(esperado), `${name}: no dice que otro anfitrión lo atiende («${esperado}»)`);

  const { document, effects, activa } = conducir(documento, name, [mallaId, cuboId], ENTRADAS);
  ok(!activa, `${name} termina al invocarse: no pide nada que luego no va a usar`);
  const mensajes = effects.filter((effect) => effect.kind === "message");
  ok(
    mensajes.length === 1 && mensajes[0].kind === "message" && mensajes[0].text === esperado,
    `${name} responde con un único renglón honesto; dijo: ${JSON.stringify(mensajes.map((m) => m.kind === "message" && m.text))}`,
  );
  const ajenos = effects.filter((effect) => !EFECTOS_PERMITIDOS.has(effect.kind)).map((effect) => effect.kind);
  ok(ajenos.length === 0, `${name} no emite lote, petición, vista, variables ni selección: ${ajenos.join(", ")}`);
  ok(serializeCadDocument(document) === antes, `${name} deja el documento idéntico`);
  ok(volumenes(document) === volumenesAntes, `${name} deja el volumen de cada sólido intacto: ${volumenes(document)}`);

  // Aunque alguien llamara a `step` a pelo (una orden transparente reanudada,
  // una rutina LISP), la respuesta es la misma negativa y nunca un documento.
  const descriptor = registry.get(name)!;
  const primero = descriptor.begin(context(documento, [cuboId]));
  for (const input of ENTRADAS) {
    const paso = descriptor.step(primero.state, input, context(documento, [cuboId]));
    ok(paso.result?.kind === "message" && paso.result.text === esperado, `${name}.step(${input.kind}) repite la negativa`);
  }

  // Metadatos que ven la cinta, el modo de sólo lectura y la paleta: los del
  // registro (manifiesto generado), no sólo los de la implementación.
  ok(descriptor.mutates === false, `${name} no se anuncia como orden que modifica el dibujo`);
  ok(descriptor.selection === "none", `${name} no pide designación`);
  ok(cadCommandSummary(name).startsWith("Aún no disponible"), `${name}: la paleta Ctrl+K no promete lo que no hace («${cadCommandSummary(name)}»)`);
}

// Los tres que destruían, con EXACTAMENTE lo que antes destruía: el cubo
// designado y Intro (SURFSCULPT → placa de 0,1 mm; SURFUNTRIM → placa de
// 0,001 mm) y la malla refinada designada e Intro (MESHCOLLAPSE → caja
// envolvente superpuesta). El documento sale como entró.
for (const [name, objetivo] of [["SURFSCULPT", cuboId], ["SURFUNTRIM", cuboId], ["MESHCOLLAPSE", mallaId]] as const) {
  const entradas: CadCommandInput[] = [{ kind: "selection", entityIds: [objetivo] }, enter, enter];
  for (const seleccion of [[objetivo], []] as const) {
    const { document, effects } = conducir(documento, name, seleccion, entradas);
    ok(!effects.some((effect) => effect.kind === "execute"), `${name} no manda ningún lote al ejecutor`);
    ok(document.entities.some((entity) => entity.id === objetivo), `${name} no borra ${objetivo}`);
    ok(document.entities.length === documento.entities.length, `${name} no añade ni quita entidades`);
    ok(serializeCadDocument(document) === antes, `${name} deja el documento idéntico (designación previa: ${seleccion.length})`);
  }
}

// ── 4. La cinta no las monta y dice por qué ─────────────────────────────────
const expuestos = cadRibbonExposedNames();
for (const name of nombres) {
  ok(!expuestos.has(name), `${name} no tiene botón en la cinta`);
  ok(findCadRibbonCommand(name) === undefined, `${name} no se encuentra en ningún panel`);
  ok(
    CAD_RIBBON_UNEXPOSED[name]?.includes(CAD_COMANDOS_AUN_NO_DISPONIBLES[name]),
    `${name} está declarado no-expuesto con su motivo`,
  );
}
for (const name of Object.keys(CAD_RIBBON_UNEXPOSED)) {
  ok(cadComandoAunNoDisponible(name), `${name} no tiene botón sin ser una orden aún no disponible: no se esconde trabajo`);
}
const salida = CAD_RIBBON_DATA.find((tab) => tab.id === "salida");
ok(salida && !salida.panels.some((panel) => panel.label === "Render"), "Salida ya no tiene el panel Render (RENDER era su botón grande)");
ok(salida?.panels.some((panel) => panel.commands.some((command) => command.name === "PLOT")), "Salida conserva PLOT");

console.log(
  `command-availability.spec: ${nombres.length} órdenes aún no disponibles (${RENDER.length} render, ` +
    `${VISUALIZACION.length} visualización, ${DESTRUCTIVOS.length} que destruían) — ${comprobaciones} comprobaciones`,
);
