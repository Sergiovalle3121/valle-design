/**
 * TRIM, EXTEND, BREAK, BREAKATPOINT y REVERSE como comandos del motor (ola 5,
 * segunda parte, ampliada en la ola 2 de «editar 2D»).
 *
 * Los cinco tienen su geometría probada y verde, y ninguno se podía teclear del
 * todo: `TR`, `EX` y `BR` no resolvían a nada. TRIM y EXTEND se alcanzaban
 * desde controles del panel derecho; BREAK **no se alcanzaba desde ningún
 * sitio** — código correcto, probado y muerto. BREAKATPOINT y REVERSE no
 * existían de ninguna forma.
 *
 * ## La forma de la orden, que es la mitad de la función
 *
 * Hasta 2021 AutoCAD era de dos fases: primero se designaban los BORDES
 * (`Enter` para tomarlos todos), después se iban designando los objetos a
 * recortar, uno tras otro, sin salir de la orden. Desde entonces el modo POR
 * DEFECTO es «rápido»: la orden entra YA en la segunda fase, con todo lo
 * visible como borde, y un clic sobre el tramo que sobra basta —sin designar
 * nada antes—. `TRIMEXTENDMODE` (ola 3, `system-variables.ts`) decide con cuál
 * arranca cada invocación, y la opción `Bordes` deja volver al flujo clásico
 * sin tocar esa variable, para cuando de verdad hace falta acotar el corte a
 * un puñado de líneas. La fase repetitiva de designar objetos —una vez
 * abierta, en cualquiera de los dos modos— es lo que hace la orden útil:
 * recortar quince líneas contra un muro son quince clics, no quince
 * invocaciones.
 *
 * Aquí se implementa esa forma. El comando **acumula** los recortes y los emite
 * como UN lote al terminar, así que las quince líneas son un solo paso de
 * deshacer — que es lo que espera quien luego pulsa Ctrl+Z una vez.
 *
 * ## Alcance
 *
 * TRIM y EXTEND aceptan LINE, ARC, CIRCLE, ELLIPSE y POLYLINE, como objeto y
 * como borde. La regla es una sola —conservar el tramo entre los cortes vecinos
 * al clic— y vive en `curve-edit.ts`, escrita sobre el parámetro de
 * `curve-model.ts`; aquí sólo se recoge la designación y se emite el lote. Lo
 * que ese módulo no sabe convertir (hoy, SPLINE) se rechaza nombrándolo en vez
 * de aproximarlo por su poligonal, que cortaría en el sitio equivocado.
 *
 * BREAK usaba la geometría de segmentos de `geom-trim.ts` y admitía sólo LINE.
 * Ahora usa `computeCadCurveBreak` de `curve-edit.ts` —la misma generalización
 * de TRIM/EXTEND sobre el parámetro de cualquier curva— y por eso admite
 * también ARC, CIRCLE y POLYLINE. `breakSegment`/`breakSegmentBetween` de
 * `geom-trim.ts` siguen escritas y probadas ahí (documentan el caso de dos
 * segmentos con anclas propias) pero ya no las llama ningún comando, igual que
 * `trimSegment`/`extendSegment`.
 *
 * BREAKATPOINT es la mitad de BREAK que corta sin dejar hueco —los dos puntos
 * coinciden—: existía escondida dentro del BREAK viejo y ahora es su propia
 * orden, como en AutoCAD.
 *
 * REVERSE invierte LINE, POLYLINE y SPLINE; ARC se rechaza a propósito (ver su
 * comentario más abajo).
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  asCadEditableEntity,
  computeCadCurveExtend,
  computeCadCurveTrim,
  type CadCurveEditOutcome,
  type CadEditableEntity,
} from "../../curve-edit";
import { CAD_ENTITY_REGISTRY } from "../../entity-runtime";
import { entityMatchesPath } from "../../native-selection-index";
import { segmentIntersection } from "../../snap-engine";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const ALL_EDGES = { keyword: "Todos", shortcut: "T" } as const;
/**
 * `Valla` (T-23/T-21): arrastrar una línea y recortar TODO lo que cruza, en
 * vez de designar objeto por objeto. Sólo tiene sentido en TRIM —EXTEND no
 * "cruza" nada, alarga hacia un borde— y la geometría ya estaba: la valla
 * (`entityMatchesPath(…, "fence", true)`, exportada de
 * `native-selection-index.ts` para T-21) encuentra QUÉ cruza; el PUNTO de
 * corte de cada una es la intersección real valla↔entidad, no una
 * aproximación — el mismo `pick` que ya usa el recorte objeto por objeto.
 */
const FENCE = { keyword: "Valla", shortcut: "V" } as const;

/**
 * `Bordes` (ola 3 «recortar», 2026-09-19): vuelve al flujo clásico de dos
 * fases —designar los bordes antes de recortar— cuando `TRIMEXTENDMODE` abrió
 * el comando en modo rápido. Es la salida de emergencia para el dibujo con
 * miles de objetos donde «todo visible es borde» busca demasiado, o para
 * quien de verdad quiere acotar el corte a un puñado de líneas.
 */
const BORDERS_OPTION = { keyword: "Bordes", shortcut: "B" } as const;

/**
 * Opción `Arista` de AutoCAD (EDGEMODE): un borde de corte o contorno que NO
 * llega a cruzar el objetivo cuenta igual si, prolongado, lo haría. `Alargar`
 * lo trata como recta/curva infinita SÓLO para este cruce; `No alargar`
 * —el valor de fábrica— vuelve al comportamiento clásico. Vive por invocación,
 * no en una variable de sistema: es una decisión del recorte de HOY, no una
 * preferencia que deba sobrevivir al siguiente TRIM.
 *
 * Los nombres son los de la ayuda oficial de AutoCAD en español (RECORTA/
 * ALARGA, opción Arista): «Alargar» / «No alargar», NO «Extender»/
 * «Sinextender» —que no existen en el AutoCAD real y romperían la memoria
 * muscular de quien viene de él, que es justo lo que esta ola persigue—.
 */
const EDGE_OPTION = { keyword: "Arista", shortcut: "A" } as const;
const EDGE_EXTEND = { keyword: "Alargar", shortcut: "AL" } as const;
const EDGE_NO_EXTEND = { keyword: "No alargar", shortcut: "NA" } as const;

/**
 * `TRIMEXTENDMODE` (ola 3): 0 abre el comando en el flujo clásico de dos
 * fases; cualquier otro valor —incluido no tener variables de sistema, como en
 * una spec desnuda— abre en modo RÁPIDO, que es el que trae AutoCAD desde
 * 2021. Ausente ⇒ rápido, no clásico: un anfitrión que todavía no expone
 * `variables` tiene que comportarse como el AutoCAD de hoy, no como el de
 * hace un lustro.
 */
function beginsInQuickMode(context: CadCommandContext): boolean {
  const raw = context.variables?.get("TRIMEXTENDMODE");
  return raw === undefined || Number(raw) !== 0;
}




/**
 * T16: aplica los comandos pendientes de `state.commands` sobre una entidad
 * para que el segundo TRIM/EXTEND opere sobre la geometría ya modificada.
 */
function applyPendingEdits(
  entity: CadEditableEntity,
  commands: CadEntityCommand[],
): CadEditableEntity {
  let current: CadEditableEntity = entity;
  for (const cmd of commands) {
    if (cmd.type === "properties" && cmd.entityId === entity.id) {
      current = { ...current, ...cmd.patch } as CadEditableEntity;
    } else if (cmd.type === "replace" && cmd.entityId === entity.id) {
      current = cmd.entity as CadEditableEntity;
    }
  }
  return current;
}

interface EdgeState {
  /** Bordes designados. Vacío + `Todos` = todas las líneas del dibujo. */
  edges: string[];
  /** Los bordes ya están cerrados y se está en la fase de recortar. */
  cutting: boolean;
  /** Comandos acumulados de esta invocación. */
  commands: CadEntityCommand[];
  /** Lo que ya se tocó, para poder informar al terminar. */
  touched: number;
  /** Objetos designados que no se pudieron tratar, con su motivo. */
  refusals: string[];
  /** `Valla` (sólo TRIM) a medio reunir: `null` en reposo. */
  fence: CadPoint2[] | null;
  /** Opción `Arista`: `true` = «Alargar», un borde corto cuenta prolongado. */
  edgeExtend: boolean;
  /** Mientras se responde `Alargar`/`No alargar` al submenú `Arista`. */
  awaitingEdgeChoice: boolean;
}

const EMPTY: EdgeState = {
  edges: [],
  cutting: false,
  commands: [],
  touched: 0,
  refusals: [],
  fence: null,
  edgeExtend: false,
  awaitingEdgeChoice: false,
};

type EdgeOperation = "TRIM" | "EXTEND";

function edgeStep(state: EdgeState, operation: EdgeOperation): CadCommandStep<EdgeState> {
  if (!state.cutting)
    return {
      state,
      prompt: {
        message:
          operation === "TRIM"
            ? "Designe los bordes de corte"
            : "Designe los bordes de contorno",
        options: [ALL_EDGES],
        defaultOption: ALL_EDGES.keyword,
      },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
    };
  if (state.fence)
    return {
      state,
      prompt: { message: "Precise el punto de la valla (Intro para terminar)", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.awaitingEdgeChoice)
    return {
      state,
      prompt: {
        message: "Arista de corte/contorno",
        options: [EDGE_EXTEND, EDGE_NO_EXTEND],
        defaultOption: state.edgeExtend ? EDGE_EXTEND.keyword : EDGE_NO_EXTEND.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message:
        operation === "TRIM"
          ? "Designe el objeto a recortar"
          : "Designe el objeto a alargar",
      options: [
        EDGE_OPTION,
        BORDERS_OPTION,
        ...(operation === "TRIM" ? [FENCE] : []),
      ],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * Los ids que la valla cruza, cada uno con su punto de corte REAL —la
 * intersección valla↔entidad, no el punto más cercano de la valla ni una
 * aproximación—. Recorre los tramos ya teselados del renderer, que es
 * exactamente lo que `native-selection-index.ts` usa para lo mismo.
 */
function fenceCrossings(
  fence: readonly CadPoint2[],
  candidates: readonly CadEntity[],
): Array<{ entity: CadEntity; pick: CadPoint2 }> {
  const fenceSegments: Array<{ a: CadPoint2; b: CadPoint2 }> = [];
  for (let index = 1; index < fence.length; index += 1)
    fenceSegments.push({ a: fence[index - 1], b: fence[index] });

  const result: Array<{ entity: CadEntity; pick: CadPoint2 }> = [];
  for (const entity of candidates) {
    // Un asset HEREDADO (`box`, `station`) no tiene adaptador registrado: no
    // es de aquí, igual que `computeCadCurveTrim` ya los rechaza más abajo.
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    if (!entityMatchesPath(entity, fence, "fence", true)) continue;
    const paths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, 64);
    let pick: CadPoint2 | null = null;
    for (const path of paths) {
      for (let index = 1; index < path.points.length && !pick; index += 1) {
        const entitySegment = { a: path.points[index - 1], b: path.points[index] };
        for (const fenceSegment of fenceSegments) {
          const point = segmentIntersection(entitySegment, fenceSegment);
          if (point) {
            pick = point;
            break;
          }
        }
      }
      if (pick) break;
    }
    if (pick) result.push({ entity, pick });
  }
  return result;
}

/**
 * Cierre del comando.
 *
 * Si hubo rechazos se cuentan en el mensaje aunque también haya habido
 * recortes: un TRIM que trata ocho de doce objetos y no lo dice deja creyendo
 * que trató los doce.
 */
function edgeFinish(state: EdgeState, operation: EdgeOperation): CadCommandStep<EdgeState> {
  if (state.commands.length === 0)
    return {
      state: EMPTY,
      prompt: { message: "", options: [] },
      accepts: 0,
      result:
        state.refusals.length > 0
          ? { kind: "message", text: `${operation}: ${state.refusals.join(" ")}` }
          : { kind: "none" },
    };
  return {
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: state.commands, label: operation },
  };
}

/**
 * Bordes efectivos: los designados, o TODO el dibujo si se pidió `Todos`.
 *
 * Ya no se filtra a líneas. `curve-edit.ts` descarta por su cuenta lo que no
 * sabe convertir, así que un arco o una polilínea del dibujo cortan igual que
 * una línea sin que este comando tenga que saberlo.
 */
function edgeEntities(state: EdgeState, context: CadCommandContext): CadEntity[] {
  const ids = state.edges.length > 0 ? state.edges : context.entityIds;
  return ids
    .map((id) => context.entity?.(id))
    .filter((entity): entity is CadEntity => !!entity);
}

/**
 * El cambio calculado, ya como comandos de entidad. Puede ser más de uno: un
 * TRIM por el medio edita la mitad inicial Y crea la segunda mitad.
 */
export function editCommands(entityId: string, outcome: CadCurveEditOutcome): CadEntityCommand[] {
  if ("error" in outcome) return [];
  const commands: CadEntityCommand[] = [];
  if (outcome.replace) commands.push({ type: "replace", entityId, entity: outcome.replace });
  else if (outcome.patch) commands.push({ type: "properties", entityId, patch: outcome.patch });
  if (commands.length > 0 && outcome.create)
    commands.push({ type: "insert", entity: outcome.create });
  return commands;
}

function edgeCommand(
  operation: EdgeOperation,
  name: string,
  aliases: readonly string[],
): CadCommandDescriptor<EdgeState> {
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "command-first",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    // TRIMEXTENDMODE decide la fase de arranque: rápido (por defecto) entra
    // YA recortando con «todo visible es borde»; clásico pide antes los
    // bordes, como siempre. `Bordes` deja pasar de uno a otro dentro de la
    // misma invocación sin tocar la variable.
    begin: (context) => edgeStep(beginsInQuickMode(context) ? { ...EMPTY, cutting: true } : EMPTY, operation),
    step: (state, input, context) => {
      if (input.kind === "cancel")
        // T15: preserve accumulated trims/extends on Esc
        return edgeFinish({ ...state, fence: null }, operation);

      // `Valla` a medio reunir (T-23): sus puntos y su Intro son SUYOS, no
      // del comando — se resuelven ANTES de que el Intro genérico de abajo
      // pudiera confundirlo con «cerrar la fase» o «terminar el comando».
      if (state.fence) {
        if (input.kind === "point")
          return edgeStep({ ...state, fence: [...state.fence, input.point] }, operation);
        if (input.kind === "enter") {
          if (state.fence.length < 2) return edgeStep({ ...state, fence: null }, operation);
          // La valla busca entre TODO el dibujo qué recortar — igual que un
          // `entityPick` con el ratón puede designar cualquier objeto—, no
          // sólo entre los bordes de corte ya designados.
          const candidates = context.entityIds
            .map((id) => context.entity?.(id))
            .filter((entity): entity is CadEntity => !!entity);
          const crossings = fenceCrossings(state.fence, candidates);
          let commands = state.commands;
          let touched = state.touched;
          const refusals = [...state.refusals];
          for (const { entity, pick } of crossings) {
            const target = asCadEditableEntity(entity);
            if (!target) continue;
            const outcome = computeCadCurveTrim({
              target,
              boundaries: edgeEntities(state, context),
              pick,
              newEntityId: context.newEntityId,
              edgeExtend: state.edgeExtend,
            });
            const produced = editCommands(target.id, outcome);
            if (produced.length === 0) {
              refusals.push(`${target.id} ${"error" in outcome ? outcome.error : "no cambió."}`);
              continue;
            }
            commands = [...commands, ...produced];
            touched += 1;
          }
          return edgeStep({ ...state, fence: null, commands, touched, refusals }, operation);
        }
        return edgeStep(state, operation);
      }

      // Submenú `Arista` a medio responder: igual que la valla, su respuesta
      // es SUYA y se resuelve antes que el Intro/palabra clave genéricos.
      if (state.awaitingEdgeChoice) {
        if (input.kind === "keyword" && input.keyword === EDGE_EXTEND.keyword)
          return edgeStep({ ...state, edgeExtend: true, awaitingEdgeChoice: false }, operation);
        if (input.kind === "keyword" && input.keyword === EDGE_NO_EXTEND.keyword)
          return edgeStep({ ...state, edgeExtend: false, awaitingEdgeChoice: false }, operation);
        if (input.kind === "enter") return edgeStep({ ...state, awaitingEdgeChoice: false }, operation);
        return edgeStep(state, operation);
      }

      // Enter cierra la fase actual: la primera vez pasa a recortar (con todos
      // los bordes si no se designó ninguno), la segunda termina.
      if (input.kind === "enter")
        return state.cutting
          ? edgeFinish(state, operation)
          : edgeStep({ ...state, cutting: true }, operation);

      if (input.kind === "keyword" && input.keyword === ALL_EDGES.keyword)
        return edgeStep({ ...state, edges: [], cutting: true }, operation);

      if (input.kind === "keyword" && input.keyword === FENCE.keyword && state.cutting && operation === "TRIM")
        return edgeStep({ ...state, fence: [] }, operation);

      // `Arista`: abre el submenú Alargar/No alargar. `Bordes`: abandona el
      // modo rápido y vuelve a pedir los bordes de la forma clásica, para ESTA
      // invocación — no toca `TRIMEXTENDMODE`.
      if (input.kind === "keyword" && input.keyword === EDGE_OPTION.keyword && state.cutting)
        return edgeStep({ ...state, awaitingEdgeChoice: true }, operation);

      if (input.kind === "keyword" && input.keyword === BORDERS_OPTION.keyword && state.cutting)
        return edgeStep({ ...state, cutting: false, edges: [] }, operation);

      const picked =
        input.kind === "entityPick"
          ? [input.entityId]
          : input.kind === "selection"
            ? [...input.entityIds]
            : null;

      if (!state.cutting) {
        if (!picked) return edgeStep(state, operation);
        return edgeStep(
          { ...state, edges: [...new Set([...state.edges, ...picked])] },
          operation,
        );
      }

      if (!picked || picked.length === 0) return edgeStep(state, operation);
      const targetId = picked[0];
      const found = context.entity?.(targetId);
      const raw: CadEditableEntity | null = asCadEditableEntity(found);
      if (!raw)
        return edgeStep(
          {
            ...state,
            refusals: [
              ...state.refusals,
              found
                ? `${found.type.toUpperCase()} todavía no se puede tratar.`
                : `${targetId} ya no existe.`,
            ],
          },
          operation,
        );
      // T16: el segundo TRIM sobre el mismo objeto opera sobre la geometría
      // que dejó el primero, no sobre la original.
      const target = applyPendingEdits(raw, state.commands);

      // El punto de designación decide QUÉ TROZO se conserva en TRIM y QUÉ
      // EXTREMO se estira en EXTEND. Sin él no hay forma de saber a qué lado
      // del cruce apuntaba el usuario, y elegir por nuestra cuenta cambiaría la
      // mitad equivocada. Sin punto se toma el arranque del objeto, que es el
      // comportamiento que ya tenía la designación por selección.
      const pick =
        input.kind === "entityPick" ? input.point : entityAnchor(target);

      const payload = {
        target,
        boundaries: edgeEntities(state, context),
        pick,
        // Un TRIM por el medio parte el objeto: la segunda mitad necesita id.
        newEntityId: context.newEntityId,
        edgeExtend: state.edgeExtend,
      };
      const outcome =
        operation === "TRIM" ? computeCadCurveTrim(payload) : computeCadCurveExtend(payload);
      const produced = editCommands(target.id, outcome);
      if (produced.length === 0)
        return edgeStep(
          {
            ...state,
            refusals: [
              ...state.refusals,
              `${target.id} ${"error" in outcome ? outcome.error : "no cambió."}`,
            ],
          },
          operation,
        );

      return edgeStep(
        { ...state, touched: state.touched + 1, commands: [...state.commands, ...produced] },
        operation,
      );
    },
  };
}

/** Punto de referencia cuando se designa sin pinchar: el arranque del objeto. */
function entityAnchor(entity: CadEditableEntity): CadPoint2 {
  if (entity.type === "line") return { x: entity.start.x, y: entity.start.y };
  if (entity.type === "polyline")
    return entity.vertices.length > 0
      ? { x: entity.vertices[0].x, y: entity.vertices[0].y }
      : { x: 0, y: 0 };
  return { x: entity.center.x, y: entity.center.y };
}

// ---------------------------------------------------------------------------
// BREAK y BREAKATPOINT
// ---------------------------------------------------------------------------

import { CAD_BREAK_COMMANDS } from "./modify-break";

export const CAD_MODIFY_EDGE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(edgeCommand("TRIM", "TRIM", ["TR"])),
  asCadCommand(edgeCommand("EXTEND", "EXTEND", ["EX"])),
  asCadCommand(CAD_BREAK_COMMANDS.breakCommand),
  asCadCommand(CAD_BREAK_COMMANDS.breakAtPointCommand),
  asCadCommand(CAD_BREAK_COMMANDS.reverseCommand),
];
