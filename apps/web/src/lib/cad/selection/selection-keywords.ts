/**
 * Las diez palabras clave que AutoCAD acepta en TODA petición «Designe
 * objetos» — Todo, Previo, Último, Ventana, Captura, Valla, Vpolígono,
 * Cpolígono, Borrar y Añadir — y que aquí no aceptaba ninguna: el prompt
 * compartido de `modify-basics.ts` sólo declaraba
 * `CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK` (T-21).
 *
 * ## Por qué esto no necesita el índice espacial en vivo
 *
 * `CadNativeSelectionIndex` (`native-selection-index.ts`) es un R-tree que
 * ACELERA la ventana/captura/valla sobre un dibujo grande, pero la prueba
 * geométrica de fondo —¿esta entidad cae dentro o cruza este rectángulo o
 * esta valla?— es la MISMA que ya usan sus adaptadores
 * (`hitTester.intersectsWindow`) y la función pura `entityMatchesPath` que
 * este módulo importa. Un comando del motor no tiene el índice —es puro y no
 * conoce al editor— pero SÍ tiene `context.entityIds` y `context.entity()`,
 * que bastan para la misma prueba en O(n). Una petición de selección no
 * corre en cada `pointermove`: correr en O(n) en vez de O(log n) una vez por
 * Intro es un cambio que nadie nota.
 *
 * ## Lo que un comando llamador tiene que hacer
 *
 * Guardar `pick: CadDesignatePickState` y `removing: boolean` en su propio
 * estado (junto a `targets`), y llamar a `cadDesignateStep` con cada entrada
 * ANTES de su propia lógica: si devuelve `null`, la entrada no es asunto de
 * este módulo y el comando sigue como si T-21 no existiera.
 */
import type { CadPoint2 } from "../cad-document";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import { entityMatchesPath } from "../native-selection-index";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  type CadCommandContext,
  type CadCommandInput,
  type CadInputMask,
  type CadKeyword,
  type CadPrompt,
} from "../engine/command-types";

export const CAD_SELECT_WINDOW: CadKeyword = { keyword: "Ventana", shortcut: "V" };
export const CAD_SELECT_CROSSING: CadKeyword = { keyword: "Captura", shortcut: "C" };
export const CAD_SELECT_FENCE: CadKeyword = { keyword: "Valla", shortcut: "VA" };
export const CAD_SELECT_WPOLYGON: CadKeyword = { keyword: "Vpolígono", shortcut: "VP" };
export const CAD_SELECT_CPOLYGON: CadKeyword = { keyword: "Cpolígono", shortcut: "CP" };
export const CAD_SELECT_ALL: CadKeyword = { keyword: "Todo", shortcut: "TO" };
export const CAD_SELECT_PREVIOUS: CadKeyword = { keyword: "Previo", shortcut: "P" };
export const CAD_SELECT_LAST: CadKeyword = { keyword: "Último", shortcut: "U" };
export const CAD_SELECT_REMOVE: CadKeyword = { keyword: "Borrar", shortcut: "B" };
export const CAD_SELECT_ADD: CadKeyword = { keyword: "Añadir", shortcut: "A" };

/** Las diez, en el orden en que se muestran en el prompt. */
export const CAD_SELECT_KEYWORD_OPTIONS: readonly CadKeyword[] = [
  CAD_SELECT_WINDOW,
  CAD_SELECT_CROSSING,
  CAD_SELECT_FENCE,
  CAD_SELECT_WPOLYGON,
  CAD_SELECT_CPOLYGON,
  CAD_SELECT_ALL,
  CAD_SELECT_PREVIOUS,
  CAD_SELECT_LAST,
  CAD_SELECT_REMOVE,
  CAD_SELECT_ADD,
];

type CadDesignateGesture = "window" | "crossing" | "fence" | "wpolygon" | "cpolygon";

/** Estado de una ventana/captura/valla/polígono a medio reunir. */
export interface CadDesignatePickState {
  gesture: CadDesignateGesture | null;
  points: readonly CadPoint2[];
}

export const CAD_DESIGNATE_IDLE: CadDesignatePickState = { gesture: null, points: [] };

const GESTURE_MESSAGE: Record<CadDesignateGesture, string> = {
  window: "Precise la esquina opuesta de la ventana",
  crossing: "Precise la esquina opuesta de la captura",
  fence: "Precise el punto de la valla (Intro para terminar)",
  wpolygon: "Precise el vértice del polígono (Intro para terminar, mínimo tres)",
  cpolygon: "Precise el vértice del polígono (Intro para terminar, mínimo tres)",
};
/** Cuántos puntos hacen falta como mínimo para que Intro cierre la figura. */
const MIN_POINTS: Record<CadDesignateGesture, number> = {
  window: 2,
  crossing: 2,
  fence: 2,
  wpolygon: 3,
  cpolygon: 3,
};
/** Ventana/captura se cierran solas al segundo punto; valla/polígono esperan Intro. */
const CLOSES_ON_ENTER: Record<CadDesignateGesture, boolean> = {
  window: false,
  crossing: false,
  fence: true,
  wpolygon: true,
  cpolygon: true,
};

function entitiesOf(context: CadCommandContext): CadNativeEntity[] {
  return context.entityIds
    .map((id) => context.entity?.(id))
    .filter((entity): entity is CadNativeEntity => entity !== undefined);
}

function resolveWindow(
  context: CadCommandContext,
  corner1: CadPoint2,
  corner2: CadPoint2,
  crossing: boolean,
): readonly string[] {
  const bounds = {
    minX: Math.min(corner1.x, corner2.x),
    maxX: Math.max(corner1.x, corner2.x),
    minY: Math.min(corner1.y, corner2.y),
    maxY: Math.max(corner1.y, corner2.y),
  };
  return entitiesOf(context)
    .filter((entity) => CAD_ENTITY_REGISTRY.adapter(entity).hitTester.intersectsWindow(entity, bounds, crossing))
    .map((entity) => entity.id);
}

function resolvePath(
  context: CadCommandContext,
  points: readonly CadPoint2[],
  gesture: "fence" | "wpolygon" | "cpolygon",
): readonly string[] {
  const mode = gesture === "fence" ? "fence" : "polygon";
  const crossing = gesture !== "wpolygon";
  return entitiesOf(context)
    .filter((entity) => entityMatchesPath(entity, points, mode, crossing))
    .map((entity) => entity.id);
}

function merge(targets: readonly string[], ids: readonly string[], removing: boolean): readonly string[] {
  if (removing) {
    if (ids.length === 0) return targets;
    const drop = new Set(ids);
    return targets.filter((id) => !drop.has(id));
  }
  const set = new Set(targets);
  for (const id of ids) set.add(id);
  return [...set];
}

function idlePrompt(message: string): CadPrompt {
  return { message, options: CAD_SELECT_KEYWORD_OPTIONS };
}

const IDLE_ACCEPTS: CadInputMask =
  CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD;

/**
 * Resultado de `cadDesignateStep`. `null` significa «esta entrada no es de
 * selección por palabra clave»: el llamador sigue con su propia lógica de
 * siempre (incluida su propia forma de terminar con Intro en reposo).
 */
export interface CadDesignateStepResult {
  targets: readonly string[];
  pick: CadDesignatePickState;
  removing: boolean;
  prompt: CadPrompt;
  accepts: CadInputMask;
}

/**
 * Aplica una entrada de designación por palabra clave sobre un estado que YA
 * lleva `targets`/`pick`/`removing`. El comando llamador (`ERASE`, `MOVE`,
 * `COPY`…) le pasa CADA entrada de su paso «Designe objetos» antes de mirarla
 * él mismo.
 */
export function cadDesignateStep(
  targets: readonly string[],
  pick: CadDesignatePickState,
  removing: boolean,
  input: CadCommandInput,
  context: CadCommandContext,
  basePrompt: string,
): CadDesignateStepResult | null {
  // A media ventana/captura/valla/polígono: sólo puntos e Intro son de aquí.
  if (pick.gesture) {
    if (input.kind === "point") {
      const points = [...pick.points, input.point];
      const gesture = pick.gesture;
      if (!CLOSES_ON_ENTER[gesture] && points.length >= MIN_POINTS[gesture]) {
        const ids =
          gesture === "window" || gesture === "crossing"
            ? resolveWindow(context, points[0], points[1], gesture === "crossing")
            : resolvePath(context, points, gesture);
        const nextTargets = merge(targets, ids, removing);
        return {
          targets: nextTargets,
          pick: CAD_DESIGNATE_IDLE,
          removing,
          prompt: idlePrompt(basePrompt),
          accepts: IDLE_ACCEPTS,
        };
      }
      return {
        targets,
        pick: { gesture, points },
        removing,
        prompt: { message: GESTURE_MESSAGE[gesture], options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }
    if (
      input.kind === "enter" &&
      (pick.gesture === "fence" || pick.gesture === "wpolygon" || pick.gesture === "cpolygon") &&
      CLOSES_ON_ENTER[pick.gesture]
    ) {
      const gesture = pick.gesture;
      const ids = pick.points.length >= MIN_POINTS[gesture] ? resolvePath(context, pick.points, gesture) : [];
      const nextTargets = merge(targets, ids, removing);
      return {
        targets: nextTargets,
        pick: CAD_DESIGNATE_IDLE,
        removing,
        prompt: idlePrompt(basePrompt),
        accepts: IDLE_ACCEPTS,
      };
    }
    // Cancelar a medio reunir vuelve al reposo sin tocar `targets`.
    if (input.kind === "cancel")
      return { targets, pick: CAD_DESIGNATE_IDLE, removing, prompt: idlePrompt(basePrompt), accepts: IDLE_ACCEPTS };
    return null;
  }

  if (input.kind === "keyword") {
    switch (input.keyword) {
      case CAD_SELECT_ALL.keyword:
        return {
          targets: merge(targets, context.entityIds, removing),
          pick: CAD_DESIGNATE_IDLE,
          removing,
          prompt: idlePrompt(basePrompt),
          accepts: IDLE_ACCEPTS,
        };
      case CAD_SELECT_LAST.keyword: {
        // El último id de `context.entityIds` es la entidad creada más
        // recientemente: el documento preserva el orden de inserción y nadie
        // lo reordena al leer. `Último` no existe en absoluto sin este
        // supuesto — es lo que AutoCAD llama LAST.
        const last = context.entityIds.at(-1);
        return {
          targets: merge(targets, last ? [last] : [], removing),
          pick: CAD_DESIGNATE_IDLE,
          removing,
          prompt: idlePrompt(basePrompt),
          accepts: IDLE_ACCEPTS,
        };
      }
      case CAD_SELECT_PREVIOUS.keyword:
        // Ver el comentario de `lastSelectionIds` en `command-types.ts`: sin
        // anfitrión que la escriba, resuelve a «nada» — la respuesta honesta,
        // no un error.
        return {
          targets: merge(targets, context.session?.lastSelectionIds ?? [], removing),
          pick: CAD_DESIGNATE_IDLE,
          removing,
          prompt: idlePrompt(basePrompt),
          accepts: IDLE_ACCEPTS,
        };
      case CAD_SELECT_REMOVE.keyword:
        return { targets, pick: CAD_DESIGNATE_IDLE, removing: true, prompt: idlePrompt(`${basePrompt} a quitar`), accepts: IDLE_ACCEPTS };
      case CAD_SELECT_ADD.keyword:
        return { targets, pick: CAD_DESIGNATE_IDLE, removing: false, prompt: idlePrompt(basePrompt), accepts: IDLE_ACCEPTS };
      case CAD_SELECT_WINDOW.keyword:
        return { targets, pick: { gesture: "window", points: [] }, removing, prompt: { message: "Precise la primera esquina de la ventana", options: [] }, accepts: CAD_ACCEPT_POINT };
      case CAD_SELECT_CROSSING.keyword:
        return { targets, pick: { gesture: "crossing", points: [] }, removing, prompt: { message: "Precise la primera esquina de la captura", options: [] }, accepts: CAD_ACCEPT_POINT };
      case CAD_SELECT_FENCE.keyword:
        return { targets, pick: { gesture: "fence", points: [] }, removing, prompt: { message: GESTURE_MESSAGE.fence, options: [] }, accepts: CAD_ACCEPT_POINT };
      case CAD_SELECT_WPOLYGON.keyword:
        return { targets, pick: { gesture: "wpolygon", points: [] }, removing, prompt: { message: GESTURE_MESSAGE.wpolygon, options: [] }, accepts: CAD_ACCEPT_POINT };
      case CAD_SELECT_CPOLYGON.keyword:
        return { targets, pick: { gesture: "cpolygon", points: [] }, removing, prompt: { message: GESTURE_MESSAGE.cpolygon, options: [] }, accepts: CAD_ACCEPT_POINT };
      default:
        return null;
    }
  }

  // Un `entityPick`/`selection` CRUDO —el ratón, agregado por el anfitrión
  // antes de llegar aquí— NO es asunto de este módulo: el comando llamador lo
  // resuelve con su propia lógica de siempre (que hoy TERMINA el comando de
  // inmediato, por diseño anterior a T-21). Sólo se intercepta cuando el modo
  // «Borrar» está activo: sin eso, un clic con Borrar puesto BORRARÍA la
  // designación en vez de quitar de ella, que sería peor que no tener Borrar.
  if (removing && input.kind === "entityPick")
    return {
      targets: merge(targets, [input.entityId], removing),
      pick,
      removing,
      prompt: idlePrompt(basePrompt),
      accepts: IDLE_ACCEPTS,
    };
  if (removing && input.kind === "selection")
    return {
      targets: merge(targets, input.entityIds, removing),
      pick,
      removing,
      prompt: idlePrompt(basePrompt),
      accepts: IDLE_ACCEPTS,
    };

  return null;
}
