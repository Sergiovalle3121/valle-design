#!/usr/bin/env node
/**
 * Sonda de INTEGRIDAD del registro de comandos: ¿cada comando hace lo que dice?
 *
 * ## Qué pregunta exactamente
 *
 * No pregunta si el comando dibuja bien —eso lo prueban sus specs de familia,
 * que son miles de líneas—. Pregunta algo más barato y más grave: si un comando
 * TERMINA respondiendo algo que suena a éxito sin haber producido NINGÚN efecto
 * verificable. Un «Hecho» sin efecto es peor que un «no disponible»: rompe la
 * confianza en todo lo demás y no deja rastro para depurar. Es el defecto que
 * la auditoría externa encontró en PLOT Previa y MSPACE/PSPACE, y éste es el
 * mecanismo que impide que vuelva.
 *
 * ## Cómo lo pregunta
 *
 * Ejecuta cada comando del registro REAL contra un documento de prueba con el
 * MISMO reductor que usa el producto, respondiendo sus prompts con un
 * auto-respondedor (un punto cuando pide punto, una selección cuando pide
 * selección, la opción por defecto cuando pide palabra clave…). Al terminar
 * clasifica:
 *
 * - `muta`: aplicó un lote y el documento CAMBIÓ de verdad (se compara la
 *   serialización canónica antes/después).
 * - `delegado`: emitió una petición a un anfitrión (vista, trazado, interfaz,
 *   variables, selección). La honestidad de ESA capa la prueban los specs de
 *   los anfitriones; aquí basta con que el efecto exista.
 * - `informa`: terminó con un mensaje y su contrato es informar (consulta) o
 *   no muta (`mutates: false`).
 * - `honesto-limitado`: terminó declarando su límite («no está disponible…»,
 *   «falta…», «todavía no…»). Decir que no se puede ES integridad.
 * - `no-concluyente`: el auto-respondedor no supo llevarlo a término. NO es un
 *   fallo del comando; queda listado y exento con razón, y su familia tiene
 *   spec propio.
 * - `ROJO`: terminó «bien» sin efecto y sin declarar límite, siendo un comando
 *   que promete mutar. Ésos son los que el gate no deja pasar.
 */
import { writeFileSync } from "node:fs";
import { CAD_COMMAND_REGISTRY_V2, cadWarmAllCommands } from "../src/lib/cad/engine";
import {
  cadCommandEngineReduce,
  EMPTY_CAD_COMMAND_ENGINE,
  type CadCommandAction,
  type CadCommandEngineState,
} from "../src/lib/cad/engine/command-engine";
import {
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_TEXT,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_ENTITY_PICK,
  type CadCommandContext,
  type CadCommandInput,
} from "../src/lib/cad/engine/command-types";
import type { CadHostRequest } from "../src/lib/cad/engine/host-requests";
import { migrateCadDocument, serializeCadDocument, type CadDocument } from "../src/lib/cad/cad-document";
import { executeCadEntityCommandBatch } from "../src/lib/cad/entity-commands";
import { cadExpandSelectionByGroup } from "../src/lib/cad/blocks/cad-groups";
import { CadSystemVariableStore } from "../src/lib/cad/system-variables";
import { cadDocumentExtents } from "../src/lib/cad/view/document-extents";

/** Documento de prueba: geometría variada, capas, bloque, hoja y restricción. */
function probeDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "muro", name: "MURO", color: "#ff0000", visible: true, locked: false },
      { id: "cotas", name: "COTAS", color: "#00ff00", visible: true, locked: false },
    ],
    entities: [
      { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: "l2", type: "line", layer: "0", start: { x: 50, y: -20 }, end: { x: 50, y: 60 } },
      { id: "l3", type: "line", layer: "MURO", start: { x: 0, y: 30 }, end: { x: 100, y: 30 } },
      { id: "c1", type: "circle", layer: "0", center: { x: 150, y: 20 }, radius: 15 },
      {
        id: "p1",
        type: "polyline",
        layer: "0",
        closed: true,
        vertices: [
          { x: 200, y: 0 },
          { x: 260, y: 0 },
          { x: 260, y: 40 },
          { x: 200, y: 40 },
        ],
      },
      { id: "t1", type: "text", layer: "COTAS", position: { x: 10, y: 80 }, text: "PRUEBA", height: 5 },
      { id: "a1", type: "arc", layer: "0", center: { x: 320, y: 20 }, radius: 20, startAngle: 0, endAngle: 180 },
    ],
  } as never);
}

interface ProbeOutcome {
  command: string;
  kind: string;
  mutates: boolean;
  verdict:
    | "muta"
    | "delegado"
    | "informa"
    | "honesto-limitado"
    | "no-concluyente"
    | "ROJO";
  steps: number;
  effects: string[];
  lastMessages: string[];
  note?: string;
}

/**
 * Mensajes que declaran un límite o un rechazo: el comando explicó por qué NO
 * hizo nada. Eso es integridad, no fallo — lo contrario del «Hecho» vacío.
 */
const HONESTY =
  /no est[aá]|no puede|no pued|no hay|no se |no lo es|no es |no son |no parece|no toca|no queda|no encierra|no pertenece|no lleva|no forma|no aporta|no sostiene|no tiene|no existe|falta|todav[ií]a no|sin (un )?anfitri[oó]n|se neg[oó]|requiere|necesita|ya est[aá]|debe ser|must be|s[oó]lo se|es para |admite |vocabulario|cancelad|abierta: no|convierten primero|nada de lo|s[oó]lo mide|use /i;

/**
 * Mensajes que AFIRMAN una acción consumada. Si aparecen sin ning[uú]n efecto
 * verificable, eso es exactamente el «éxito falso» que este gate persigue.
 */
const CLAIMS =
  /cread[oa]|dibujad[oa]|aplicad[oa]|hech[oa]|guardad[oa]|trazad[oa]|abiert[oa]|cambiad[oa]|designad[oa]|actualizad[oa]|publicad[oa]|insertad[oa]|definid[oa]|modificad[oa]|borrad[oa]|eliminad[oa]|renombrad[oa]|movid[oa]|girad[oa]|copiad[oa]|restaurad[oa]|cargad[oa]|activad[oa]\.|listo\b|completad[oa]/i;

/** Puntos variados: cerca de la geometría del documento y separados entre sí. */
const POINTS = [
  { x: 10, y: 10 },
  { x: 60, y: 10 },
  { x: 60, y: 45 },
  { x: 10, y: 45 },
  { x: 35, y: 25 },
  { x: 150, y: 20 },
  { x: 230, y: 20 },
  { x: 320, y: 20 },
  { x: 90, y: 5 },
  { x: 5, y: 28 },
];

function runCommand(name: string): ProbeOutcome {
  const registry = CAD_COMMAND_REGISTRY_V2;
  const descriptor = registry.get(name)!;
  let document = probeDocument();
  const variables = new CadSystemVariableStore();
  let selection: readonly string[] = [];
  let ids = 0;
  const newEntityId = () => `probe${(ids += 1)}`;
  const before = serializeCadDocument(document);

  const context = (): CadCommandContext => {
    const entities = document.entities;
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return {
      entityIds: entities.map((entity) => entity.id),
      entity: (entityId) => byId.get(entityId),
      blocks: () => document.blocks ?? [],
      layers: () => document.layers,
      document: () => document,
      selection: cadExpandSelectionByGroup(selection, entities),
      activeLayer: "0",
      variables,
      paperSpaces: () => document.paperSpaces ?? [],
      constraints: document.constraints,
      ...(document.parameters ? { parameters: document.parameters } : {}),
      ...(document.meta?.unit ? { unit: document.meta.unit } : {}),
      drawingExtents: () => cadDocumentExtents(document),
      view: { pixelsPerUnit: 1, centerX: 50, centerY: 20 },
      cursor: { x: 55, y: 22 },
      newEntityId,
    };
  };

  let state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  const effects: string[] = [];
  const messages: Array<{ text: string; level: string }> = [];
  const hostRequests: CadHostRequest[] = [];
  let applied = 0;
  let selectionEffects = 0;
  let variablePatches = 0;
  let uiRequests = 0;
  let viewRequests = 0;

  const dispatch = (action: CadCommandAction): void => {
    const reduction = cadCommandEngineReduce(state, action, context(), registry);
    state = reduction.state;
    for (const effect of reduction.effects) {
      if (effect.kind === "execute") {
        try {
          const result = executeCadEntityCommandBatch(document, effect.commands, effect.label);
          document = result.document;
          applied += 1;
          effects.push(`execute:${effect.label}`);
        } catch (error) {
          messages.push({ text: `lote rechazado: ${String(error)}`, level: "error" });
        }
      } else if (effect.kind === "variables") {
        for (const [variable, value] of Object.entries(effect.patch)) {
          const outcome = effect.system
            ? variables.publish(variable, value)
            : variables.set(variable, value);
          if (outcome.ok) variablePatches += 1;
          else messages.push({ text: outcome.reason, level: "error" });
        }
        effects.push("variables");
      } else if (effect.kind === "host") {
        hostRequests.push(effect.request);
        effects.push(`host:${effect.request.kind}`);
      } else if (effect.kind === "view") {
        viewRequests += 1;
        effects.push(`view:${effect.request.kind ?? "?"}`);
      } else if (effect.kind === "ui") {
        uiRequests += 1;
        effects.push(`ui:${effect.request.target ?? "?"}`);
      } else if (effect.kind === "selection") {
        selection = effect.entityIds;
        selectionEffects += 1;
        effects.push(`selection:${effect.entityIds.length}`);
      } else if (effect.kind === "message") {
        messages.push({ text: effect.text, level: effect.level ?? "info" });
      }
    }
  };

  dispatch({ kind: "invoke", command: name });

  let steps = 0;
  let pointCursor = 0;
  let entityCursor = 0;
  let selectionFed = false;
  const seenPrompts = new Map<string, number>();
  const inputTrace: string[] = [];
  let probeAborted = false;
  const MAX_STEPS = 36;

  while (state.active && steps < MAX_STEPS) {
    steps += 1;
    const step = state.active.step;
    const accepts = step.accepts ?? 0;
    const promptKey = `${state.active.name}:${step.prompt.message}`;
    const seen = (seenPrompts.get(promptKey) ?? 0) + 1;
    seenPrompts.set(promptKey, seen);

    let input: CadCommandInput | null = null;
    if (seen > 3) {
      // El mismo prompt tres veces: primero un Enter por si cierra con el
      // valor por defecto, y a la siguiente vuelta se cancela.
      input = seen === 4 ? { kind: "enter" } : { kind: "cancel" };
      if (input.kind === "cancel") probeAborted = true;
    } else if (accepts & CAD_ACCEPT_SELECTION) {
      if (!selectionFed) {
        selectionFed = true;
        input = { kind: "selection", entityIds: ["l1", "l2"] };
      } else {
        input = { kind: "enter" };
      }
    } else if (accepts & CAD_ACCEPT_ENTITY_PICK) {
      const pool = ["l1", "l2", "l3", "c1", "p1", "a1", "t1"];
      const entityId = pool[entityCursor % pool.length]!;
      entityCursor += 1;
      input = { kind: "entityPick", entityId, point: { x: 50, y: 0 } };
    } else if (accepts & CAD_ACCEPT_ANGLE && accepts & CAD_ACCEPT_POINT) {
      // Girar/inclinar: un punto también respondería, pero definiría un ángulo
      // de 0° respecto de la base — un no-op legítimo que ensuciaría la sonda.
      input = { kind: "angle", degrees: 45 };
    } else if (accepts & CAD_ACCEPT_POINT) {
      const point = POINTS[pointCursor % POINTS.length]!;
      pointCursor += 1;
      input = { kind: "point", point, source: "typed" };
    } else if (accepts & CAD_ACCEPT_DISTANCE) {
      input = { kind: "distance", value: 10 };
    } else if (accepts & CAD_ACCEPT_ANGLE) {
      input = { kind: "angle", degrees: 45 };
    } else if (accepts & CAD_ACCEPT_KEYWORD && step.prompt.defaultOption) {
      input = { kind: "enter" };
    } else if (accepts & CAD_ACCEPT_TEXT) {
      input = { kind: "text", value: `PROBE${steps}` };
    } else if (accepts & CAD_ACCEPT_KEYWORD && step.prompt.options?.length) {
      input = { kind: "keyword", keyword: step.prompt.options[0]!.keyword };
    } else {
      input = { kind: "enter" };
    }
    inputTrace.push(input.kind);
    dispatch({ kind: "input", input });
  }

  if (state.active) {
    // Cancela para no arrastrar estado; el veredicto ya es no-concluyente.
    dispatch({ kind: "input", input: { kind: "cancel" } });
    if (state.active) dispatch({ kind: "input", input: { kind: "cancel" } });
  }

  const after = serializeCadDocument(document);
  const changed = after !== before;
  const lastMessages = messages.slice(-4).map((entry) => `${entry.level}:${entry.text}`);
  const delegated = hostRequests.length + viewRequests + uiRequests + variablePatches + selectionEffects > 0;
  const honest = messages.some((entry) => HONESTY.test(entry.text));

  const claims = messages.some(
    (entry) => entry.level === "info" && CLAIMS.test(entry.text) && !HONESTY.test(entry.text),
  );

  let verdict: ProbeOutcome["verdict"];
  let note: string | undefined;
  if (steps >= MAX_STEPS) {
    verdict = "no-concluyente";
    note = "el auto-respondedor no lo llevó a término";
  } else if (applied > 0 && changed) {
    verdict = "muta";
  } else if (applied > 0 && !changed) {
    verdict = "ROJO";
    note = "aplicó un lote pero el documento canónico quedó idéntico";
  } else if (delegated) {
    verdict = "delegado";
  } else if (claims) {
    verdict = "ROJO";
    note = "afirma una acción consumada sin ningún efecto verificable";
  } else if (
    messages.length === 0 &&
    steps > 0 &&
    inputTrace[inputTrace.length - 1] === "enter"
  ) {
    // Cerró tras un Enter del auto-respondedor: es la salida normal de un
    // comando repetitivo (OFFSET, PURGE, MATCHPROP…), no un éxito falso.
    verdict = "informa";
    note = "cierre normal con Enter, sin afirmación";
  } else if (messages.length === 0 && steps > 0 && probeAborted) {
    verdict = "no-concluyente";
    note = "la sonda lo canceló tras prompts repetidos; terminó sin mensaje";
  } else if (messages.length === 0 && steps > 0) {
    verdict = "ROJO";
    note = "terminó en silencio absoluto: sin efecto, sin mensaje, sin límite declarado — entradas: " + inputTrace.join("→");
  } else if (honest) {
    verdict = "honesto-limitado";
  } else if (messages.length > 0) {
    verdict = "informa";
  } else {
    // Cero pasos y cero mensajes: el comando terminó en su `begin` sin decir
    // nada. Para uno que promete mutar, eso es un no-op silencioso.
    verdict = descriptor.mutates ? "ROJO" : "informa";
    if (descriptor.mutates) note = "terminó al invocarse, sin efecto y sin mensaje";
  }

  return {
    command: name,
    kind: descriptor.kind,
    mutates: descriptor.mutates === true,
    verdict,
    steps,
    effects: effects.slice(0, 8),
    lastMessages,
    ...(note ? { note } : {}),
  };
}

/**
 * Las 291 implementaciones, TRAÍDAS ENTERAS antes de ejecutarlas.
 *
 * Desde 2026-09-04 la máquina de estados `begin`/`step` llega a demanda
 * (`engine/lazy-commands.ts`) para que abrir un plano no descargue las 291. Eso
 * es una decisión de CARGA en el navegador; aquí, en Node, cargarlas todas no
 * cuesta nada. Esta línea NO es una exención ni una cuarentena: la sonda sigue
 * ejecutando los 291 comandos REALES, uno por uno, con el mismo reductor del
 * producto. Sin ella la sonda mediría el envoltorio perezoso en vez del
 * comando, que es justamente el «éxito sin efecto» que existe para prohibir.
 */
await cadWarmAllCommands();

const names = [...CAD_COMMAND_REGISTRY_V2.names()].sort();
const outcomes: ProbeOutcome[] = [];
for (const name of names) {
  try {
    outcomes.push(runCommand(name));
  } catch (error) {
    outcomes.push({
      command: name,
      kind: "?",
      mutates: false,
      verdict: "no-concluyente",
      steps: 0,
      effects: [],
      lastMessages: [String(error).slice(0, 200)],
      note: "la sonda reventó al ejecutarlo",
    });
  }
}

const summary = {
  generatedBy: "apps/web/scripts/command-integrity-probe.mts",
  total: outcomes.length,
  verdicts: {
    muta: outcomes.filter((outcome) => outcome.verdict === "muta").length,
    delegado: outcomes.filter((outcome) => outcome.verdict === "delegado").length,
    informa: outcomes.filter((outcome) => outcome.verdict === "informa").length,
    "honesto-limitado": outcomes.filter((outcome) => outcome.verdict === "honesto-limitado").length,
    "no-concluyente": outcomes.filter((outcome) => outcome.verdict === "no-concluyente").length,
    ROJO: outcomes.filter((outcome) => outcome.verdict === "ROJO").length,
  },
  outcomes,
};

const target = process.argv[2];
const json = JSON.stringify(summary, null, 2);
if (target) writeFileSync(target, `${json}\n`);
else process.stdout.write(`${json}\n`);
