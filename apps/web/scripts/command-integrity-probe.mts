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
 *   serialización canónica antes/después) y cada entidad añadida o cambiada
 *   tiene geometría evaluable; un cascarón vacío es ROJO.
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
 *   que promete mutar; o AFIRMÓ un resultado sin efecto, aunque en el mismo
 *   mensaje declare también un límite («creada… — requiere WebGL»); o insertó
 *   entidades sin geometría. Ésos son los que el gate no deja pasar.
 *
 * El árbol de decisión vive en `scripts/cad/command-integrity-rules.mjs`, con
 * su spec: cada regla tiene ahí su trampa atrapada y su caso legítimo en verde.
 *
 * ## Dos pasadas, y por qué
 *
 * Cada comando se conduce DOS veces. `plano2d` es el documento de siempre
 * (`command-integrity-probe-seed.mts`): siete entidades 2D y la designación
 * `l1`+`l2`. `solidos3d` es la probeta de `command-integrity-probeta.mts`: los
 * mismos siete MÁS dos sólidos que se solapan, una región y una presentación
 * abierta con su vista derivada, todo eso designado.
 *
 * La segunda pasada existe porque la primera dejaba un agujero grande: 18 de
 * los 26 comandos de las familias `solids-*` y los 9 de la familia de lámina
 * nunca llegaban a ejecutar nada. Respondían «Esta orden necesita SOLID3D
 * designados» o «No hay ninguna presentación abierta» y la sonda los contaba
 * como `honesto-limitado`. Decir la verdad sobre una precondición que la sonda
 * NUNCA cumple no cuesta nada: es un verde gratis disfrazado de honestidad.
 *
 * Las dos se combinan con `combinarPasadas`, que es MONÓTONA: un ROJO en
 * cualquiera de las dos gana, y sólo un efecto verificado (`muta`/`delegado`)
 * asciende. Ni la probeta puede quitarle su veredicto a un comando ya medido,
 * ni un comando que sigue sin producir efecto puede salir mejor.
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
import { serializeCadDocument, type CadDocument } from "../src/lib/cad/cad-document";
import { executeCadEntityCommandBatch } from "../src/lib/cad/entity-commands";
import { cadExpandSelectionByGroup } from "../src/lib/cad/blocks/cad-groups";
import { CadSystemVariableStore } from "../src/lib/cad/system-variables";
import { cadDocumentExtents } from "../src/lib/cad/view/document-extents";
import { solid3dMassProperties, solid3dMesh } from "../src/lib/cad/solid3d-build";
import { regionArea } from "../src/lib/cad/solid3d-adapter";
import { probeDocumentSeed } from "./command-integrity-probe-seed.mts";
import {
  clasificar,
  combinarPasadas,
  entidadesTocadas,
  sinGeometria,
} from "../../../scripts/cad/command-integrity-rules.mjs";
import {
  PROBETA_LAYOUT,
  comprobarProbeta,
  probetaDocument,
  probetaEvidencia,
} from "./command-integrity-probeta.mts";

const EVALUADORES = { solid3dMesh, solid3dMassProperties, regionArea };

type Verdict =
  | "muta"
  | "delegado"
  | "informa"
  | "honesto-limitado"
  | "no-concluyente"
  | "ROJO";

interface PassOutcome {
  verdict: Verdict;
  steps: number;
  effects: string[];
  lastMessages: string[];
  note?: string;
}

interface ProbeOutcome extends PassOutcome {
  command: string;
  kind: string;
  mutates: boolean;
  /** Qué pasada decidió el veredicto combinado. */
  pasada: string;
  /** El veredicto de CADA pasada, sin combinar: la combinación no se cree sola. */
  pasadas: Record<string, PassOutcome>;
}

/**
 * Las DOS pasadas, y por qué son dos y no una.
 *
 * `plano2d` es el documento de SIEMPRE, bit a bit: siete entidades 2D, ninguna
 * lámina y la designación `l1`+`l2`. Se conserva para que la probeta nueva no
 * pueda QUITARLE el veredicto a un comando ya medido — designar una región y un
 * texto rompe la familia GC* («t1 es de tipo text y no participa en el dibujo
 * paramétrico») y degrada DCANGULAR y LAYISO, y con la combinación monótona
 * esos comandos conservan intacto lo que la pasada base midió.
 *
 * `solidos3d` es la probeta: los mismos siete más dos sólidos solapados, una
 * región y una lámina abierta con su vista derivada, con todo eso DESIGNADO y
 * `activeLayout` puesto. Es la pasada que le quita a 18 comandos de sólidos y a
 * 9 de lámina la excusa de una precondición que la sonda nunca cumplía.
 *
 * El veredicto final los combina con `combinarPasadas`: ROJO en cualquiera
 * manda, y sólo un efecto verificado asciende.
 */
interface Pasada {
  id: string;
  documento: () => CadDocument;
  /** Lo que el auto-respondedor designa cuando un paso pide una selección. */
  seleccion: readonly string[];
  /** De dónde salen las entidades cuando un paso pide designar UNA. */
  pool: readonly string[];
  activeLayout?: string;
}

const PASADAS: readonly Pasada[] = [
  {
    id: "plano2d",
    documento: probeDocumentSeed,
    seleccion: ["l1", "l2"],
    pool: ["l1", "l2", "l3", "c1", "p1", "a1", "t1"],
  },
  {
    id: "solidos3d",
    documento: () => probetaDocument(probeDocumentSeed),
    // Los sólidos van DELANTE de las líneas: `selectedSolids` respeta el orden
    // de designación y SUBTRACT resta del primero.
    seleccion: ["s1", "s2", "p1", "c1", "r1", "l1", "l2", "l3", "a1", "t1"],
    // El pool de designación de UNA entidad conserva el orden de la pasada
    // base y añade los tres nuevos al FINAL. Ponerlos delante degradaba
    // comandos 2D por el fixture y no por el producto: DIMLINEAR designaba el
    // sólido, se quedaba sin arista de la que colgar la cota y caía a dos
    // puntos alineados. La familia de sólidos no lo necesita: pide SELECCIÓN,
    // y ahí los sólidos van primeros.
    pool: ["l1", "l2", "l3", "c1", "p1", "a1", "t1", "s1", "s2", "r1"],
    activeLayout: PROBETA_LAYOUT,
  },
];

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

function runPass(name: string, pasada: Pasada): PassOutcome {
  const registry = CAD_COMMAND_REGISTRY_V2;
  let document = pasada.documento();
  const initial = document;
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
      ...(pasada.activeLayout ? { activeLayout: pasada.activeLayout } : {}),
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
        input = { kind: "selection", entityIds: [...pasada.seleccion] };
      } else {
        input = { kind: "enter" };
      }
    } else if (accepts & CAD_ACCEPT_ENTITY_PICK) {
      const pool = pasada.pool;
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
  const vacias =
    applied > 0 && changed
      ? entidadesTocadas(initial.entities, document.entities).flatMap((entity) => {
          const motivo = sinGeometria(entity, EVALUADORES);
          return motivo ? [{ id: entity.id, motivo }] : [];
        })
      : [];
  const { verdict, note } = clasificar({
    steps,
    maxSteps: MAX_STEPS,
    applied,
    changed,
    delegated,
    messages,
    inputTrace,
    probeAborted,
    mutates: registry.get(name)!.mutates === true,
    vacias,
  });

  return {
    verdict,
    steps,
    effects: effects.slice(0, 8),
    lastMessages,
    ...(note ? { note } : {}),
  };
}

/** Las dos pasadas de un comando y su veredicto combinado. */
function runCommand(name: string): ProbeOutcome {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name)!;
  const pasadas: Record<string, PassOutcome> = {};
  for (const pasada of PASADAS) pasadas[pasada.id] = runPass(name, pasada);
  const combinado = combinarPasadas(pasadas[PASADAS[0]!.id]!, pasadas[PASADAS[1]!.id]!);
  return {
    command: name,
    kind: descriptor.kind,
    mutates: descriptor.mutates === true,
    ...combinado,
    pasadas,
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

/**
 * La probeta se COMPRUEBA antes de medir un solo comando, y su fallo es fatal.
 *
 * «muta» se concede comparando la serialización antes/después, así que un
 * fixture que se moviera solo podría ascender comandos sin que nadie lo viera.
 * Si el fixture no es el que dice ser, esta corrida no vale: no se mide.
 */
const fallosDeProbeta = comprobarProbeta(probeDocumentSeed);
if (fallosDeProbeta.length > 0) {
  process.stderr.write("La probeta de sólidos y lámina NO cumple sus invariantes:\n");
  for (const fallo of fallosDeProbeta) process.stderr.write(`- ${fallo}\n`);
  process.exit(1);
}

const names = [...CAD_COMMAND_REGISTRY_V2.names()].sort();
const outcomes: ProbeOutcome[] = [];
for (const name of names) {
  try {
    outcomes.push(runCommand(name));
  } catch (error) {
    const roto: PassOutcome = {
      verdict: "no-concluyente",
      steps: 0,
      effects: [],
      lastMessages: [String(error).slice(0, 200)],
      note: "la sonda reventó al ejecutarlo",
    };
    outcomes.push({
      command: name,
      kind: "?",
      mutates: false,
      pasada: "?",
      pasadas: Object.fromEntries(PASADAS.map((pasada) => [pasada.id, roto])),
      ...roto,
    });
  }
}

const VEREDICTOS = [
  "muta",
  "delegado",
  "informa",
  "honesto-limitado",
  "no-concluyente",
  "ROJO",
] as const;

const contar = (leer: (outcome: ProbeOutcome) => string) =>
  Object.fromEntries(
    VEREDICTOS.map((veredicto) => [
      veredicto,
      outcomes.filter((outcome) => leer(outcome) === veredicto).length,
    ]),
  );

const summary = {
  generatedBy: "apps/web/scripts/command-integrity-probe.mts",
  total: outcomes.length,
  verdicts: contar((outcome) => outcome.verdict),
  /** El desglose de CADA pasada, para poder auditar la combinación. */
  pasadas: Object.fromEntries(
    PASADAS.map((pasada) => [pasada.id, contar((outcome) => outcome.pasadas[pasada.id]!.verdict)]),
  ),
  probeta: probetaEvidencia(probeDocumentSeed),
  outcomes,
};

const target = process.argv[2];
const json = JSON.stringify(summary, null, 2);
if (target) writeFileSync(target, `${json}\n`);
else process.stdout.write(`${json}\n`);
