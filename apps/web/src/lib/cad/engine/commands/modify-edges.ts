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
 * En AutoCAD TRIM y EXTEND son de dos fases: primero se designan los BORDES
 * (`Enter` para tomarlos todos), después se van designando los objetos a
 * recortar, uno tras otro, sin salir de la orden. Esa segunda fase repetitiva
 * es lo que hace la orden útil: recortar quince líneas contra un muro son
 * quince clics, no quince invocaciones.
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
  computeCadCurveBreak,
  computeCadCurveExtend,
  computeCadCurveTrim,
  type CadCurveEditOutcome,
  type CadEditableEntity,
} from "../../curve-edit";
import type { CadNativeEntity } from "../../entity-runtime";
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
}

const EMPTY: EdgeState = { edges: [], cutting: false, commands: [], touched: 0, refusals: [], fence: null };

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
  return {
    state,
    prompt: {
      message:
        operation === "TRIM"
          ? "Designe el objeto a recortar"
          : "Designe el objeto a alargar",
      options: operation === "TRIM" ? [FENCE] : [],
    },
    accepts:
      CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_POINT | (operation === "TRIM" ? CAD_ACCEPT_KEYWORD : 0),
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
function editCommands(entityId: string, outcome: CadCurveEditOutcome): CadEntityCommand[] {
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
    begin: () => edgeStep(EMPTY, operation),
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

/** Lo que BREAK y BREAKATPOINT saben partir. Ni ELLIPSE ni SPLINE están aquí:
 * ninguno de los dos se pidió, y aceptar la designación para no hacer nada
 * distinto sería el defecto de siempre. */
const BREAK_TYPES = ["line", "arc", "circle", "polyline"] as const;

function asBreakable(entity: CadEntity | undefined): CadEditableEntity | null {
  return entity && (BREAK_TYPES as readonly string[]).includes(entity.type)
    ? (entity as CadEditableEntity)
    : null;
}

function breakTypeRefusal(entity: CadEntity | undefined, label: string): string {
  return `${label}: sólo se admiten LINE, ARC, CIRCLE y POLYLINE; se designó ${
    entity ? entity.type.toUpperCase() : "una entidad inexistente"
  }.`;
}

const FIRST_POINT = { keyword: "Primer punto", shortcut: "P" } as const;

interface BreakState {
  entityId: string | null;
  first: CadPoint2 | null;
  /**
   * Se pidió explícitamente `Primer punto`: el próximo punto que llegue
   * REEMPLAZA al primero en vez de cerrar la orden con el segundo.
   */
  askingFirst: boolean;
}

const EMPTY_BREAK: BreakState = { entityId: null, first: null, askingFirst: false };

function breakDone(result: CadCommandStep<BreakState>["result"]): CadCommandStep<BreakState> {
  return { state: EMPTY_BREAK, prompt: { message: "", options: [] }, accepts: 0, result };
}

function breakStep(state: BreakState): CadCommandStep<BreakState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe el objeto a partir", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (!state.first || state.askingFirst)
    return {
      state,
      prompt: { message: "Precise el primer punto de ruptura", options: [] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
    };
  return {
    state,
    prompt: { message: "Precise el segundo punto de ruptura", options: [FIRST_POINT] },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * BREAK parte un objeto quitando el tramo entre DOS puntos, con hueco real —
 * la convención de AutoCAD, opción `Primer punto` incluida: el punto de
 * designación es el primero por defecto, y esa opción permite precisar otro
 * antes de pedir el segundo.
 *
 * El trozo que conserva el id original es el que queda; el segundo —cuando la
 * curva es ABIERTA y el hueco cae por el medio— es una entidad nueva. Sobre
 * una curva CERRADA (CIRCLE, POLILÍNEA cerrada) el resultado es SIEMPRE una
 * sola pieza: un anillo al que se le quita un tramo deja un arco, no dos.
 */
const breakCommand: CadCommandDescriptor<BreakState> = {
  name: "BREAK",
  aliases: ["BR"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => breakStep(EMPTY_BREAK),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return breakDone({ kind: "none" });

    if (!state.entityId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return breakStep(state);
      const found = context.entity?.(id);
      const target = asBreakable(found);
      if (!target) return breakDone({ kind: "message", text: breakTypeRefusal(found, "BREAK") });
      // El punto de designación es también el primer punto de ruptura, como en
      // AutoCAD: sólo hace falta pedirlo aparte si se designó por selección (sin
      // punto) o si luego se pide `Primer punto`.
      const first = input.kind === "entityPick" ? input.point : null;
      return breakStep({ entityId: id, first, askingFirst: false });
    }

    if (!state.first || state.askingFirst) {
      const point =
        input.kind === "point" ? input.point : input.kind === "entityPick" ? input.point : null;
      if (!point) return breakStep(state);
      return breakStep({ ...state, first: point, askingFirst: false });
    }

    if (input.kind === "keyword" && input.keyword === FIRST_POINT.keyword)
      return breakStep({ ...state, askingFirst: true });

    const second =
      input.kind === "point" ? input.point : input.kind === "entityPick" ? input.point : null;
    if (!second) return breakStep(state);

    const found = context.entity?.(state.entityId);
    const target = asBreakable(found);
    if (!target) return breakDone({ kind: "message", text: "BREAK: la entidad ya no existe." });

    const outcome = computeCadCurveBreak({
      target,
      first: state.first,
      second,
      newEntityId: context.newEntityId,
    });
    const commands = editCommands(target.id, outcome);
    if (commands.length === 0)
      return breakDone({
        kind: "message",
        text: `BREAK: ${"error" in outcome ? outcome.error : "no partió nada."}`,
      });
    return breakDone({ kind: "document", commands, label: "BREAK" });
  },
};

interface BreakAtPointState {
  entityId: string | null;
}

const EMPTY_BREAK_AT_POINT: BreakAtPointState = { entityId: null };

function breakAtPointStep(state: BreakAtPointState): CadCommandStep<BreakAtPointState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe el objeto a partir", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: { message: "Precise el punto de partición", options: [] },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
  };
}

/**
 * BREAKATPOINT: la mitad de BREAK que corta SIN dejar hueco —los dos puntos
 * coinciden—, como orden propia. Antes de esta ola era lo único que BREAK
 * sabía hacer, aunque respondía al nombre equivocado; ahora cada uno es el
 * suyo, como en AutoCAD.
 *
 * Un CÍRCULO se rechaza: partirlo en un solo punto no produce un hueco de
 * longitud cero identificable —el «antes» y el «después» del corte son el
 * mismo punto en un anillo— y hacen falta dos puntos distintos, que es lo que
 * pide BREAK.
 */
const breakAtPointCommand: CadCommandDescriptor<BreakAtPointState> = {
  name: "BREAKATPOINT",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => breakAtPointStep(EMPTY_BREAK_AT_POINT),
  step: (state, input, context) => {
    const done = (
      result: CadCommandStep<BreakAtPointState>["result"],
    ): CadCommandStep<BreakAtPointState> => ({
      state: EMPTY_BREAK_AT_POINT,
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel" || input.kind === "enter") return done({ kind: "none" });

    if (!state.entityId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return breakAtPointStep(state);
      const found = context.entity?.(id);
      const target = asBreakable(found);
      if (!target) return done({ kind: "message", text: breakTypeRefusal(found, "BREAKATPOINT") });
      if (target.type === "circle")
        return done({
          kind: "message",
          text: "BREAKATPOINT: un CÍRCULO no se puede partir en un solo punto; use BREAK con dos puntos.",
        });
      return breakAtPointStep({ entityId: id });
    }

    const point =
      input.kind === "point" ? input.point : input.kind === "entityPick" ? input.point : null;
    if (!point) return breakAtPointStep(state);

    const found = context.entity?.(state.entityId);
    const target = asBreakable(found);
    if (!target) return done({ kind: "message", text: "BREAKATPOINT: la entidad ya no existe." });

    const outcome = computeCadCurveBreak({
      target,
      first: point,
      second: null,
      newEntityId: context.newEntityId,
    });
    const commands = editCommands(target.id, outcome);
    if (commands.length === 0)
      return done({
        kind: "message",
        text: `BREAKATPOINT: ${"error" in outcome ? outcome.error : "no partió nada."}`,
      });
    return done({ kind: "document", commands, label: "BREAKATPOINT" });
  },
};

// ---------------------------------------------------------------------------
// REVERSE
// ---------------------------------------------------------------------------

/**
 * REVERSE invierte el SENTIDO de LINE, POLYLINE y SPLINE: lo que era el
 * primer vértice pasa a ser el último. No existía por ningún camino —ni
 * tecleado ni en un panel— aunque hace falta para preparar el camino de un
 * SWEEP o para corregir una polilínea trazada al revés de como se acota
 * (una cota alineada a lo largo de una polilínea lee sus tramos en el orden
 * de los vértices).
 *
 * ARC se queda fuera A PROPÓSITO. El esquema canónico no guarda una dirección
 * de un arco aparte de su forma: un arco SIEMPRE se recorre en sentido
 * antihorario de `startAngle` a `endAngle` (`cad-document.ts`), y esa dirección
 * de recorrido en un ángulo fijo es una propiedad DEL PUNTO sobre el círculo,
 * no de cuál de los dos extremos se llame «inicio». Intercambiar los dos
 * ángulos no invierte el sentido del MISMO arco: dibuja el arco
 * COMPLEMENTARIO (el resto de la circunferencia), una forma distinta. Aceptar
 * la designación y devolver otra geometría sería exactamente el defecto que
 * este producto paga caro: un «Hecho» silencioso sobre el dibujo equivocado.
 * Se rechaza nombrando el motivo en vez de fingir que se invirtió.
 */
const REVERSIBLE_TYPES = ["line", "polyline", "spline"] as const;
type CadReversibleEntity = Extract<CadEntity, { type: "line" | "polyline" | "spline" }>;

function asReversible(entity: CadEntity | undefined): CadReversibleEntity | null {
  return entity && (REVERSIBLE_TYPES as readonly string[]).includes(entity.type)
    ? (entity as CadReversibleEntity)
    : null;
}

type CadPolylineVertex = Extract<CadEntity, { type: "polyline" }>["vertices"][number];

/**
 * Invierte el orden de los vértices de una polilínea CONSERVANDO su forma
 * exacta.
 *
 * `bulge` y los anchos de un tramo van CON EL TRAMO, no con el vértice donde
 * viven hoy: describen lo que sale de ese vértice hacia el siguiente
 * (`cad-document.ts`). Al invertir el orden, cada tramo cambia de sentido —su
 * `bulge` cambia de signo (el mismo arco recorrido al revés) y sus dos anchos
 * se intercambian— y pasa a colgar del vértice que ahora lo empieza, no del
 * que lo empezaba antes. Sin este reparto, una polilínea con un solo tramo
 * curvo saldría con el arco en el tramo vecino y con la curvatura al revés.
 */
function reversedPolylineVertices(
  vertices: readonly CadPolylineVertex[],
  closed: boolean,
): CadPolylineVertex[] {
  const count = vertices.length;
  const reversed: CadPolylineVertex[] = [...vertices]
    .reverse()
    .map((vertex) => ({ x: vertex.x, y: vertex.y, z: vertex.z }));
  for (let index = 0; index < count; index += 1) {
    const hasSegment = closed || index < count - 1;
    if (!hasSegment) continue;
    const sourceIndex = closed ? (((count - 2 - index) % count) + count) % count : count - 2 - index;
    const source = vertices[sourceIndex];
    if (typeof source.bulge === "number") reversed[index].bulge = -source.bulge;
    if (typeof source.startWidth === "number" || typeof source.endWidth === "number") {
      if (typeof source.endWidth === "number") reversed[index].startWidth = source.endWidth;
      if (typeof source.startWidth === "number") reversed[index].endWidth = source.startWidth;
    }
  }
  return reversed;
}

function reversedEntity(entity: CadReversibleEntity): CadNativeEntity {
  if (entity.type === "line") return { ...entity, start: entity.end, end: entity.start };
  if (entity.type === "polyline")
    return { ...entity, vertices: reversedPolylineVertices(entity.vertices, entity.closed) };
  // SPLINE: pesos CON su punto (SPLINEDIT `inVertir`). Nudos invertidos con
  // `nuevo(i)=primero+último−original(m-i)`: un clamped uniforme es simétrico
  // y no se notaba, pero uno de DXF ajeno es arbitrario y sin esto sale OTRA curva.
  const [k0, kN] = [entity.knots[0], entity.knots.at(-1)!];
  return {
    ...entity,
    controlPoints: [...entity.controlPoints].reverse(),
    knots: [...entity.knots].reverse().map((k) => k0 + kN - k),
    ...(entity.weights ? { weights: [...entity.weights].reverse() } : {}),
  };
}

interface ReverseState {
  targets: readonly string[];
}

const EMPTY_REVERSE: ReverseState = { targets: [] };
const REVERSE_PROMPT = { message: "Designe objetos a invertir", options: [] } as const;
const REVERSE_ACCEPTS = CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK;

function reverseResult(targets: readonly string[], context: CadCommandContext): CadCommandStep<ReverseState> {
  const commands: CadEntityCommand[] = [];
  const refusals: string[] = [];
  for (const id of targets) {
    const entity = context.entity?.(id);
    const target = asReversible(entity);
    if (!target) {
      refusals.push(`${id} ${entity ? `es ${entity.type.toUpperCase()}` : "ya no existe"}.`);
      continue;
    }
    commands.push({ type: "replace", entityId: target.id, entity: reversedEntity(target) });
  }
  return {
    state: EMPTY_REVERSE,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0
        ? {
            kind: "document",
            commands,
            label: "REVERSE",
            ...(refusals.length > 0
              ? { notice: `REVERSE: sólo admite LINE, POLYLINE y SPLINE — ${refusals.join(" ")}` }
              : {}),
          }
        : {
            kind: "message",
            text:
              refusals.length > 0
                ? `REVERSE: sólo admite LINE, POLYLINE y SPLINE. ${refusals.join(" ")}`
                : "REVERSE: no se designó nada.",
          },
  };
}

const reverseCommand: CadCommandDescriptor<ReverseState> = {
  name: "REVERSE",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? reverseResult(context.selection, context)
      : { state: EMPTY_REVERSE, prompt: REVERSE_PROMPT, accepts: REVERSE_ACCEPTS },
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state: EMPTY_REVERSE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "selection") return reverseResult(input.entityIds, context);
    if (input.kind === "entityPick")
      return {
        state: { targets: [...new Set([...state.targets, input.entityId])] },
        prompt: REVERSE_PROMPT,
        accepts: REVERSE_ACCEPTS,
      };
    if (input.kind === "enter") return reverseResult(state.targets, context);
    return { state, prompt: REVERSE_PROMPT, accepts: REVERSE_ACCEPTS };
  },
};

export const CAD_MODIFY_EDGE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(edgeCommand("TRIM", "TRIM", ["TR"])),
  asCadCommand(edgeCommand("EXTEND", "EXTEND", ["EX"])),
  asCadCommand(breakCommand),
  asCadCommand(breakAtPointCommand),
  asCadCommand(reverseCommand),
];
