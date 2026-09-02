/**
 * DIST, ID y AREA: los comandos que no dibujan nada y se usan cincuenta veces
 * al día.
 *
 * No salen en los folletos porque no producen geometría. Son, aun así, la mitad
 * del tiempo que se pasa dentro de un CAD: comprobar que ese hueco mide lo que
 * debe, leer la coordenada de un punto para pasársela a otro, sumar las áreas
 * de cuatro estancias y restarles el patio.
 *
 * ## Tres decisiones que definen si sirven de verdad
 *
 * **Se informa en el SCU, no en el mundo.** Un edificio girado 23,5 grados se
 * dibuja girando el sistema; si ID sigue contestando en coordenadas del mundo,
 * hay que convertir a mano cada vez.
 *
 * **Se escribe con las unidades del dibujo.** `3.5` y `3'-6"` son el mismo
 * número y sólo uno de los dos se puede leer en obra.
 *
 * **AREA acumula.** Medir el hueco de un forjado es sumar la losa y restar los
 * huecos, y sin acumulador eso se hace con una calculadora al lado.
 *
 * Los tres publican su resultado en las variables `DISTANCE`, `AREA` y
 * `PERIMETER`, como AutoCAD, para que un `.scr` o una macro puedan leerlo.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  accumulateCadArea,
  cadDistanceBetween,
  cadInquiryLens,
  EMPTY_CAD_AREA,
  formatCadAreaReport,
  formatCadDistanceReport,
  formatCadPoint,
  type CadAreaAccumulator,
} from "../../inquiry/reports";
import { cadEntityArea, cadPolygonArea } from "../../inquiry/contours";
import { cadFormatGeoreferenced, cadGeoreferenceOf } from "../../georeference";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function finished<S>(state: S, text: string, patch: Record<string, number>): CadCommandStep<S> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "variables", patch, system: true, text },
  };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

// ---------------------------------------------------------------------------
// DIST
// ---------------------------------------------------------------------------

interface DistState {
  /** El motor lee `points` para `@relativo` y para la entrada directa. */
  points: CadPoint2[];
}

function distStep(state: DistState, context: CadCommandContext): CadCommandStep<DistState> {
  if (state.points.length === 0)
    return {
      state,
      prompt: { message: "Precise el primer punto", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Precise el segundo punto", options: [] },
    accepts: CAD_ACCEPT_POINT,
    preview: context.cursor ? [{ points: [state.points[0], context.cursor] }] : [],
  };
}

function distResult(state: DistState, context: CadCommandContext): CadCommandStep<DistState> {
  const lens = cadInquiryLens(context.variables);
  const raw = cadDistanceBetween(state.points[0], state.points[1]);
  // La distancia y los deltas son magnitudes distintas ante un SCU: la primera
  // no cambia al girar el sistema y los segundos sí. Girar la distancia sería
  // tan erróneo como no girar los deltas.
  const worldDelta = { x: raw.deltaX, y: raw.deltaY, z: raw.deltaZ };
  const delta = lens.vector(worldDelta);
  // Los dos ángulos se miden sobre el delta YA GIRADO, no restando el giro del
  // sistema: con un SCU apoyado en una cara inclinada no hay ningún giro que
  // restar, y el «ángulo en plano XY» que el dibujante espera es el que se ve
  // sobre la cara, no sobre el suelo.
  const planar = Math.hypot(delta.x, delta.y);
  const report = {
    ...raw,
    deltaX: delta.x,
    deltaY: delta.y,
    deltaZ: delta.z,
    angleXY: lens.vectorAngle(worldDelta),
    angleFromXY: (Math.atan2(delta.z, planar) * 180) / Math.PI,
  };
  return finished(state, formatCadDistanceReport(report, lens.format).join("\n"), {
    DISTANCE: raw.distance,
  });
}

const distCommand: CadCommandDescriptor<DistState> = {
  name: "DIST",
  aliases: ["DI"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: (context) => distStep({ points: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "enter" || input.kind === "cancel") return cancelled(state);
    if (input.kind !== "point") return distStep(state, context);
    const points = [...state.points, input.point];
    if (points.length < 2) return distStep({ points }, context);
    return distResult({ points }, context);
  },
};

// ---------------------------------------------------------------------------
// ID
// ---------------------------------------------------------------------------

interface IdState {
  points: CadPoint2[];
}

const idCommand: CadCommandDescriptor<IdState> = {
  name: "ID",
  aliases: [],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: () => ({
    state: { points: [] },
    prompt: { message: "Precise el punto", options: [] },
    accepts: CAD_ACCEPT_POINT,
  }),
  step: (state, input, context) => {
    if (input.kind !== "point") return cancelled(state);
    const lens = cadInquiryLens(context.variables);
    const local = lens.point(input.point);
    const header =
      lens.ucs.name && lens.ucs.name !== "*MUNDO*" ? ` (SCU "${lens.ucs.name}")` : "";
    // Dibujo georreferenciado (Ola G): además, el este/norte y la latitud y
    // longitud del punto en el sistema del marcador GEO.
    const view = context.document?.();
    const georeference = view ? cadGeoreferenceOf(view) : null;
    const geo = georeference ? `\n${cadFormatGeoreferenced(georeference, input.point, context.unit)}` : "";
    return finished({ points: [input.point] }, `${formatCadPoint(local, lens.format)}${header}${geo}`, {});
  },
};

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

const AREA_OBJECT = { keyword: "Objeto", shortcut: "O" } as const;
const AREA_ADD = { keyword: "Añadir", shortcut: "A" } as const;
const AREA_SUBTRACT = { keyword: "Restar", shortcut: "R" } as const;
const AREA_EXIT = { keyword: "salir", shortcut: "S" } as const;

interface AreaState {
  /** `null` mientras se mide una sola cosa; cambia al entrar en acumulación. */
  mode: "add" | "subtract" | null;
  accumulator: CadAreaAccumulator;
  points: CadPoint2[];
  /** Esperando la designación de un objeto. */
  pickingObject: boolean;
  /** Avisos que TIENEN que salir con el número: contornos abiertos, sobre todo. */
  notes: string[];
}

const EMPTY_AREA_STATE: AreaState = {
  mode: null,
  accumulator: EMPTY_CAD_AREA,
  points: [],
  pickingObject: false,
  notes: [],
};

function areaPrompt(state: AreaState, context: CadCommandContext): CadCommandStep<AreaState> {
  if (state.pickingObject)
    return {
      state,
      prompt: { message: "Seleccione el objeto", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  const accumulating = state.mode !== null;
  const label = accumulating
    ? state.mode === "add"
      ? "(MODO SUMAR) Precise el primer punto de esquina"
      : "(MODO RESTAR) Precise el primer punto de esquina"
    : "Precise el primer punto de esquina";
  if (state.points.length === 0)
    return {
      state,
      prompt: {
        message: label,
        options: accumulating
          ? [AREA_OBJECT, AREA_ADD, AREA_SUBTRACT, AREA_EXIT]
          : [AREA_OBJECT, AREA_ADD, AREA_SUBTRACT],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message: "Precise el punto siguiente",
      options: [],
      defaultOption: "Total",
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: context.cursor
      ? [{ points: [...state.points, context.cursor], closed: state.points.length >= 2 }]
      : [{ points: state.points, closed: false }],
  };
}

/** Cierra AREA imprimiendo el total y publicando `AREA` y `PERIMETER`. */
function areaFinish(state: AreaState, context: CadCommandContext): CadCommandStep<AreaState> {
  if (state.accumulator.added + state.accumulator.subtracted === 0) return cancelled(state);
  const lens = cadInquiryLens(context.variables);
  const lines = [...state.notes, formatCadAreaReport(state.accumulator, lens.format)];
  return finished(state, lines.join("\n"), {
    AREA: state.accumulator.total,
    PERIMETER: state.accumulator.perimeterTotal,
  });
}

/**
 * Añade una pieza al total.
 *
 * En modo suelto (sin Añadir/Restar) la primera pieza TERMINA el comando, que
 * es lo que hace AutoCAD y lo que espera quien sólo quería un número.
 */
function areaAccumulate(
  state: AreaState,
  area: number,
  perimeter: number,
  note: string | null,
  context: CadCommandContext,
): CadCommandStep<AreaState> {
  const mode = state.mode ?? "add";
  const next: AreaState = {
    ...state,
    points: [],
    pickingObject: false,
    accumulator: accumulateCadArea(state.accumulator, area, perimeter, mode),
    notes: note ? [...state.notes, note] : state.notes,
  };
  if (state.mode === null) return areaFinish(next, context);
  const lens = cadInquiryLens(context.variables);
  // En acumulación se enseña el parcial y se sigue pidiendo: sin el parcial, el
  // usuario suma diez estancias a ciegas y sólo descubre el error al final.
  const running = areaPrompt(next, context);
  return {
    ...running,
    prompt: {
      ...running.prompt,
      message:
        `${note ? `${note}  ` : ""}` +
        `Parcial: ${lens.format.area(next.accumulator.total)}. ${running.prompt.message}`,
    },
  };
}

const areaCommand: CadCommandDescriptor<AreaState> = {
  name: "AREA",
  aliases: ["AA"],
  kind: "inquiry",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: (context) => areaPrompt(EMPTY_AREA_STATE, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);

    if (input.kind === "keyword") {
      if (input.keyword === AREA_OBJECT.keyword)
        return areaPrompt({ ...state, pickingObject: true, points: [] }, context);
      if (input.keyword === AREA_ADD.keyword)
        return areaPrompt({ ...state, mode: "add", points: [], pickingObject: false }, context);
      if (input.keyword === AREA_SUBTRACT.keyword)
        return areaPrompt({ ...state, mode: "subtract", points: [], pickingObject: false }, context);
      if (input.keyword === AREA_EXIT.keyword) return areaFinish(state, context);
      return areaPrompt(state, context);
    }

    if (input.kind === "entityPick") {
      const entity = context.entity?.(input.entityId);
      if (!entity)
        return areaPrompt(state, context);
      const measured = cadEntityArea(entity);
      if (!measured)
        return {
          ...areaPrompt(state, context),
          prompt: {
            message: `Un ${entity.type.toUpperCase()} no encierra un área. Seleccione otro objeto`,
            options: [],
          },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      // La regla que el enunciado exige y que ningún CAD debería saltarse: si
      // el contorno estaba abierto, se DICE que se ha cerrado para medir.
      const note = measured.assumedClosed
        ? `El ${entity.type.toUpperCase()} designado está abierto: se cierra por la cuerda para poder medirlo.`
        : null;
      return areaAccumulate(state, measured.area, measured.perimeter, note, context);
    }

    if (input.kind === "enter") {
      if (state.points.length >= 3) {
        const measured = cadPolygonArea(state.points);
        if (measured) return areaAccumulate(state, measured.area, measured.perimeter, null, context);
      }
      if (state.points.length > 0)
        return {
          ...areaPrompt({ ...state, points: [] }, context),
          prompt: {
            message: "Con menos de tres puntos no hay superficie. Precise el primer punto de esquina",
            options: [AREA_OBJECT, AREA_ADD, AREA_SUBTRACT],
          },
          accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
        };
      return areaFinish(state, context);
    }

    if (input.kind !== "point") return areaPrompt(state, context);
    return areaPrompt({ ...state, points: [...state.points, input.point] }, context);
  },
};

export const CAD_INQUIRY_MEASURE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(distCommand),
  asCadCommand(idCommand),
  asCadCommand(areaCommand),
];
