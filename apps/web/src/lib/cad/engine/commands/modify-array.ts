/**
 * ARRAY y ARRAYEDIT: el multiplicador, y lo que lo hace ASOCIATIVO.
 *
 * `array.ts` estaba escrito, probado y huérfano desde la fase B3. `AR` no
 * resolvía a nada, así que en el producto la matriz no existía: butacas de un
 * cine, tornillos de una brida o luminarias de un techo se copiaban a mano.
 *
 * ## Por qué hay DOS comandos
 *
 * Una matriz que no se puede editar después no es asociativa, es un
 * copiar-pegar con buena presentación. Aquí cada miembro guarda en su
 * `context.metadata` a qué matriz pertenece, con qué índice y con qué
 * PARÁMETROS se generó; `ARRAYEDIT` los lee, borra las copias y las rehace con
 * el número nuevo sin que el usuario vuelva a designar ni a medir nada.
 *
 * Lo que todavía NO hace, dicho antes de que nadie lo suponga: editar la
 * geometría del original no regenera las copias. Eso pide un gancho en el
 * ejecutor como el de los sombreados asociativos y es un cambio aparte.
 *
 * ## Un lote, un paso de deshacer
 *
 * Una matriz de 50 elementos emite 50 `copy`, 50 `transform` y sus `metadata`
 * en UN `CadEntityCommand[]`. Si emitiera uno por copia, Ctrl+Z desharía la
 * última y quien pulsó una vez creería haberlas deshecho todas.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ARRAY_META,
  cadArrayIdOf,
  cadArrayMembers,
  cadArrayPlacements,
  parseCadArraySpec,
  serializeCadArraySpec,
  type CadArraySpec,
} from "../../cad-array-placement";
import { cadEntityCurves, curvePointAt } from "../../curve-model";
import type { CadVec2 } from "../../primitives";
import {
  CAD_ACCEPT_DISTANCE,
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

const RECTANGULAR = { keyword: "Rectangular", shortcut: "R" } as const;
const POLAR = { keyword: "PolaR", shortcut: "PO" } as const;
const PATH = { keyword: "Camino", shortcut: "CA" } as const;
const KEEP_ORIENTATION = { keyword: "NoGirar", shortcut: "N" } as const;

/** Cada pregunta del guion, con su texto y qué acepta. */
type ArrayQuestion =
  | "rows"
  | "cols"
  | "rowSpacing"
  | "colSpacing"
  | "center"
  | "count"
  | "fill"
  | "path"
  | "base";

const QUESTIONS: Record<ArrayQuestion, { message: string; accepts: number }> = {
  rows: { message: "Número de filas", accepts: CAD_ACCEPT_DISTANCE },
  cols: { message: "Número de columnas", accepts: CAD_ACCEPT_DISTANCE },
  rowSpacing: { message: "Distancia entre filas", accepts: CAD_ACCEPT_DISTANCE },
  colSpacing: { message: "Distancia entre columnas", accepts: CAD_ACCEPT_DISTANCE },
  center: { message: "Precise el centro de la matriz", accepts: CAD_ACCEPT_POINT },
  count: { message: "Número de elementos", accepts: CAD_ACCEPT_DISTANCE },
  fill: { message: "Ángulo total a rellenar", accepts: CAD_ACCEPT_DISTANCE },
  path: { message: "Designe el camino", accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION },
  base: { message: "Precise el punto base de los objetos", accepts: CAD_ACCEPT_POINT },
};

const SCRIPT: Record<"rectangular" | "polar" | "path", ArrayQuestion[]> = {
  rectangular: ["rows", "cols", "rowSpacing", "colSpacing"],
  polar: ["center", "count", "fill"],
  path: ["path", "base", "count"],
};

interface ArrayState {
  targets: readonly string[];
  kind: "rectangular" | "polar" | "path" | null;
  pending: ArrayQuestion[];
  answers: Partial<Record<ArrayQuestion, number>>;
  center: CadPoint2 | null;
  base: CadPoint2 | null;
  pathId: string | null;
  rotateItems: boolean;
}

const EMPTY: ArrayState = {
  targets: [],
  kind: null,
  pending: [],
  answers: {},
  center: null,
  base: null,
  pathId: null,
  rotateItems: true,
};

function refuse(text: string): CadCommandStep<ArrayState> {
  return { state: EMPTY, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function arrayStep(state: ArrayState): CadCommandStep<ArrayState> {
  if (state.targets.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  if (!state.kind)
    return {
      state,
      prompt: {
        message: "Indique el tipo de matriz",
        options: [RECTANGULAR, POLAR, PATH],
        defaultOption: RECTANGULAR.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  const question = state.pending[0];
  const spec = QUESTIONS[question];
  return {
    state,
    prompt: {
      message: spec.message,
      // `NoGirar` sólo tiene sentido en la polar, y sólo mientras se la está
      // definiendo: ofrecerla en la rectangular sería una opción que no hace
      // nada, que es peor que no ofrecerla.
      options: state.kind === "polar" && question !== "center" ? [KEEP_ORIENTATION] : [],
    },
    accepts: spec.accepts | (state.kind === "polar" ? CAD_ACCEPT_KEYWORD : 0),
  };
}

/**
 * El camino como polilínea de puntos.
 *
 * Los arcos se tesela a 64 tramos por curva. Es una aproximación DECLARADA: el
 * reparto por longitud de arco sobre la poligonal difiere del exacto en menos
 * de una diezmilésima del radio, y a cambio un camino puede ser una línea, una
 * polilínea con bulge, un arco o un círculo sin casos especiales.
 */
function pathPointsOf(context: CadCommandContext, entityId: string): CadVec2[] | null {
  const entity = context.entity?.(entityId);
  if (!entity) return null;
  const curves = cadEntityCurves(entity);
  if (!curves || curves.length === 0) return null;
  const points: CadVec2[] = [];
  for (const curve of curves) {
    const steps = curve.kind === "segment" ? 1 : 64;
    for (let index = 0; index < steps; index += 1) points.push(curvePointAt(curve, index / steps));
  }
  points.push(curvePointAt(curves[curves.length - 1], 1));
  return points;
}

function specOf(state: ArrayState, itemBase: CadVec2, path: CadVec2[] | null): CadArraySpec | string {
  if (state.kind === "rectangular") {
    const rows = Math.round(state.answers.rows ?? 0);
    const cols = Math.round(state.answers.cols ?? 0);
    if (rows < 1 || cols < 1) return "una matriz rectangular necesita al menos una fila y una columna.";
    if (rows * cols < 2) return "una matriz de un solo elemento no multiplica nada.";
    return {
      kind: "rectangular",
      rows,
      cols,
      rowSpacing: state.answers.rowSpacing ?? 0,
      colSpacing: state.answers.colSpacing ?? 0,
    };
  }
  if (state.kind === "polar") {
    const count = Math.round(state.answers.count ?? 0);
    if (count < 2) return "una matriz polar necesita al menos dos elementos.";
    if (!state.center) return "falta el centro de la matriz.";
    return {
      kind: "polar",
      center: state.center,
      count,
      totalAngle: state.answers.fill ?? 360,
      rotateItems: state.rotateItems,
      ...(state.rotateItems ? {} : { itemBase }),
    };
  }
  const count = Math.round(state.answers.count ?? 0);
  if (count < 2) return "una matriz de camino necesita al menos dos elementos.";
  if (!path) return "el camino designado no tiene geometría recorrible.";
  return { kind: "path", path, count, base: state.base ?? { x: 0, y: 0 } };
}

/**
 * Los comandos de una matriz: por cada objeto y cada colocación, una copia
 * transformada; y en todos, incluidos los originales, la marca de asociación.
 */
export function cadArrayCommands(
  spec: CadArraySpec,
  targets: readonly string[],
  arrayId: string,
  newEntityId: () => string,
): CadEntityCommand[] {
  const placements = cadArrayPlacements(spec);
  const serialized = serializeCadArraySpec(spec);
  // Sin parámetros que quepan se guarda la pertenencia igual —los miembros
  // siguen siendo de la misma matriz— pero no la promesa de regenerarla.
  const association = {
    [CAD_ARRAY_META.id]: arrayId,
    [CAD_ARRAY_META.kind]: spec.kind,
    ...(serialized ? { [CAD_ARRAY_META.params]: serialized } : {}),
  };
  const commands: CadEntityCommand[] = [];
  for (const entityId of targets) {
    commands.push({
      type: "metadata",
      entityId,
      patch: { ...association, [CAD_ARRAY_META.index]: 0 },
    });
    // La colocación 0 es la identidad: coincide con el original y no se copia.
    for (let index = 1; index < placements.length; index += 1) {
      const copyId = newEntityId();
      commands.push({ type: "copy", entityId, newEntityId: copyId });
      commands.push({ type: "transform", entityId: copyId, transform: placements[index] });
      commands.push({
        type: "metadata",
        entityId: copyId,
        patch: { ...association, [CAD_ARRAY_META.index]: index },
      });
    }
  }
  return commands;
}

const arrayCommand: CadCommandDescriptor<ArrayState> = {
  name: "ARRAY",
  aliases: ["AR", "ARR"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => arrayStep({ ...EMPTY, targets: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return { state: EMPTY, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    if (state.targets.length === 0) {
      if (input.kind === "selection") return arrayStep({ ...state, targets: input.entityIds });
      if (input.kind === "entityPick")
        return arrayStep({ ...state, targets: [...new Set([...state.targets, input.entityId])] });
      if (input.kind === "enter") return refuse("ARRAY necesita al menos un objeto designado.");
      return arrayStep(state);
    }

    if (!state.kind) {
      const chosen =
        input.kind === "enter"
          ? "rectangular"
          : input.kind === "keyword"
            ? input.keyword === POLAR.keyword
              ? "polar"
              : input.keyword === PATH.keyword
                ? "path"
                : input.keyword === RECTANGULAR.keyword
                  ? "rectangular"
                  : null
            : null;
      if (!chosen) return arrayStep(state);
      return arrayStep({ ...state, kind: chosen, pending: [...SCRIPT[chosen]] });
    }

    if (input.kind === "keyword" && input.keyword === KEEP_ORIENTATION.keyword)
      return arrayStep({ ...state, rotateItems: false });

    const question = state.pending[0];
    let next: ArrayState | null = null;
    if (question === "center" || question === "base") {
      if (input.kind !== "point") return arrayStep(state);
      next =
        question === "center"
          ? { ...state, center: input.point, pending: state.pending.slice(1) }
          : { ...state, base: input.point, pending: state.pending.slice(1) };
    } else if (question === "path") {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return arrayStep(state);
      if (!pathPointsOf(context, id))
        return refuse(`ARRAY: ${id} no sirve de camino; sólo línea, arco, círculo, elipse o polilínea.`);
      next = { ...state, pathId: id, pending: state.pending.slice(1) };
    } else {
      // `fill` acepta Enter para quedarse con los 360° por defecto.
      if (input.kind === "enter" && question === "fill")
        next = { ...state, answers: { ...state.answers, fill: 360 }, pending: state.pending.slice(1) };
      else if (input.kind === "distance")
        next = {
          ...state,
          answers: { ...state.answers, [question]: input.value },
          pending: state.pending.slice(1),
        };
      else return arrayStep(state);
    }

    if (next.pending.length > 0) return arrayStep(next);

    const itemBase = next.base ?? next.center ?? { x: 0, y: 0 };
    const path = next.pathId ? pathPointsOf(context, next.pathId) : null;
    const spec = specOf(next, itemBase, path);
    if (typeof spec === "string") return refuse(`ARRAY: ${spec}`);
    const commands = cadArrayCommands(spec, next.targets, context.newEntityId(), context.newEntityId);
    if (commands.length === 0) return refuse("ARRAY: la matriz no produjo ninguna copia.");
    return {
      state: EMPTY,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "document", commands, label: "ARRAY" },
    };
  },
};

// ---------------------------------------------------------------------------
// ARRAYEDIT
// ---------------------------------------------------------------------------

interface ArrayEditState {
  arrayId: string | null;
  spec: CadArraySpec | null;
  sources: readonly string[];
}

const EMPTY_EDIT: ArrayEditState = { arrayId: null, spec: null, sources: [] };

/**
 * ARRAYEDIT rehace una matriz existente con otro número de elementos.
 *
 * Borra las copias y las vuelve a crear desde los miembros de índice 0, que son
 * los originales. No toca los originales: si los borrase y recrease, todo lo
 * que los apunte —cotas asociativas, sombreados, orden de dibujo— se rompería
 * a cada retoque del número de filas.
 */
const arrayEditCommand: CadCommandDescriptor<ArrayEditState> = {
  name: "ARRAYEDIT",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: EMPTY_EDIT,
    prompt: { message: "Designe un elemento de la matriz", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  }),
  step: (state, input, context) => {
    const done = (text: string): CadCommandStep<ArrayEditState> => ({
      state: EMPTY_EDIT,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "message", text },
    });
    if (input.kind === "cancel")
      return { state: EMPTY_EDIT, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    if (!state.arrayId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id)
        return {
          state,
          prompt: { message: "Designe un elemento de la matriz", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
        };
      const entity = context.entity?.(id);
      const arrayId = cadArrayIdOf(entity);
      if (!arrayId)
        return done(`ARRAYEDIT: ${id} no pertenece a ninguna matriz asociativa.`);
      const spec = parseCadArraySpec(entity?.context?.metadata?.[CAD_ARRAY_META.params]);
      if (!spec)
        return done(
          `ARRAYEDIT: la matriz ${arrayId} no conserva sus parámetros; no se puede regenerar sin inventárselos.`,
        );
      const entities = context.entityIds
        .map((entityId) => context.entity?.(entityId))
        .filter((found): found is NonNullable<typeof found> => !!found);
      const sources = cadArrayMembers(entities, arrayId)
        .filter((member) => member.index === 0)
        .map((member) => member.entity.id);
      if (sources.length === 0)
        return done(`ARRAYEDIT: la matriz ${arrayId} ha perdido sus objetos originales.`);
      return {
        state: { arrayId, spec, sources },
        prompt: {
          // En una rectangular se retoca el número de COLUMNAS y las filas se
          // conservan: colapsar una rejilla 4×5 a una fila de 20 no es «editar
          // la matriz», es hacer otra distinta.
          message:
            spec.kind === "rectangular" ? "Número de columnas nuevo" : "Número de elementos nuevo",
          options: [],
          defaultValue: String(spec.kind === "rectangular" ? spec.cols : spec.count),
        },
        accepts: CAD_ACCEPT_DISTANCE,
      };
    }

    if (input.kind !== "distance" || !state.spec || !state.arrayId)
      return {
        state,
        prompt: { message: "Número de elementos nuevo", options: [] },
        accepts: CAD_ACCEPT_DISTANCE,
      };

    const count = Math.round(input.value);
    if (count < 2) return done("ARRAYEDIT: una matriz necesita al menos dos elementos.");
    const spec: CadArraySpec =
      state.spec.kind === "rectangular"
        ? { ...state.spec, cols: count }
        : { ...state.spec, count };

    const entities = context.entityIds
      .map((entityId) => context.entity?.(entityId))
      .filter((found): found is NonNullable<typeof found> => !!found);
    const commands: CadEntityCommand[] = cadArrayMembers(entities, state.arrayId)
      .filter((member) => member.index !== 0)
      .map((member) => ({ type: "delete", entityId: member.entity.id }));
    commands.push(...cadArrayCommands(spec, state.sources, state.arrayId, context.newEntityId));
    return {
      state: EMPTY_EDIT,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "document", commands, label: "ARRAYEDIT" },
    };
  },
};

export const CAD_MODIFY_ARRAY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(arrayCommand),
  asCadCommand(arrayEditCommand),
];
