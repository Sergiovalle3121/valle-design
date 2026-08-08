/**
 * ROTATE, SCALE, FILLET y CHAMFER como comandos del motor (ola 5, primera parte).
 *
 * ROTATE y SCALE no existían por ningún camino. FILLET y CHAMFER sí existían,
 * pero **sólo desde controles sueltos del panel derecho**: no se podían teclear
 * y no se podían repetir con Espacio, que son las dos cosas que un dibujante
 * hace con ellos todo el día.
 *
 * ## Por qué no se reutilizan `applyCadLineFillet` / `applyCadLineChamfer`
 *
 * Esas funciones toman el documento entero y hacen su propio `commitChange`.
 * Son una **segunda ruta de mutación**, exactamente lo que el motor viene a
 * eliminar. Aquí se usa sólo su geometría —`computeCadLineFillet` y
 * `computeCadLineChamfer`, que es donde está la matemática y donde están sus
 * specs— y el resultado se emite como `CadEntityCommand[]`: dos `properties`
 * recortando las líneas y un `insert` con el arco o el chaflán. Un lote, un
 * `commitChange`, un paso de deshacer.
 *
 * ## Lo que estos comandos NO hacen todavía
 *
 * FILLET y CHAMFER aceptan **dos LINE**. La geometría de `cad-fillet.ts` y
 * `cad-chamfer.ts` no cubre arco-arco ni polilínea, y generalizarla es trabajo
 * aparte. Se rechaza con un mensaje que dice qué se designó, en vez de recortar
 * en silencio la primera línea que se encuentre.
 *
 * MIRROR no está aquí. Una reflexión no se puede expresar con
 * `{translation, rotationDeg, scale}` —el determinante es negativo— y añadirla
 * obliga a repasar los once adaptadores: el `bulge` de la polilínea cambia de
 * signo, los extremos del arco se intercambian, el ángulo de patrón del
 * sombreado pasa a `180° − ángulo`. Es la refactorización a afín, y va en su
 * propio cambio con su corpus de propiedades.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { computeCadLineChamfer } from "../../cad-chamfer";
import { computeCadLineFillet } from "../../cad-fillet";
import {
  CAD_ACCEPT_ANGLE,
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

function distance(a: CadPoint2, b: CadPoint2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleDeg(from: CadPoint2, to: CadPoint2): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// ROTATE y SCALE — misma forma: designar, punto base, magnitud
// ---------------------------------------------------------------------------

const REFERENCE = { keyword: "Referencia", shortcut: "R" } as const;
const COPY_OPTION = { keyword: "Copiar", shortcut: "C" } as const;

interface BasePointState {
  selection: readonly string[];
  base: CadPoint2 | null;
  /** Primer punto de la referencia, cuando se mide en vez de teclearse. */
  referenceFrom: CadPoint2 | null;
  reference: boolean;
  copy: boolean;
}

const EMPTY_BASE_STATE: BasePointState = {
  selection: [],
  base: null,
  referenceFrom: null,
  reference: false,
  copy: false,
};

function finish(
  commands: CadEntityCommand[],
  label: string,
): CadCommandStep<BasePointState> {
  return {
    state: EMPTY_BASE_STATE,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0 ? { kind: "document", commands, label } : { kind: "none" },
  };
}

function refuse(text: string): CadCommandStep<BasePointState> {
  return {
    state: EMPTY_BASE_STATE,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

/**
 * Pasos comunes de ROTATE y SCALE.
 *
 * `magnitude` describe el tercer dato, que es lo único que los distingue: para
 * ROTATE grados, para SCALE un factor. La estructura —designar, punto base,
 * magnitud, con `Copiar` y `Referencia`— es idéntica, y duplicarla sería
 * duplicar también cada corrección futura.
 */
function baseStep(
  state: BasePointState,
  magnitude: { message: string; options: readonly { keyword: string; shortcut: string }[] },
): CadCommandStep<BasePointState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  if (!state.base)
    return {
      state,
      prompt: { message: "Precise el punto base", options: [COPY_OPTION] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  if (state.reference && !state.referenceFrom)
    return {
      state,
      prompt: { message: "Precise el primer punto de la referencia", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: {
      message: state.reference ? "Precise el segundo punto de la referencia" : magnitude.message,
      options: state.reference ? [] : [...magnitude.options],
    },
    accepts:
      CAD_ACCEPT_POINT | CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ANGLE | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * `Copiar` deja el original y transforma un duplicado.
 *
 * El duplicado se crea con `copy` sin desplazamiento y se transforma después,
 * en el mismo lote: así el original queda intacto y el nuevo lleva la
 * transformación completa, sin depender de en qué orden el ejecutor procese los
 * comandos —los ids nuevos ya existen cuando les toca su `transform`—.
 */
function transformCommands(
  state: BasePointState,
  transform: { rotationDeg?: number; scale?: number },
  context: CadCommandContext,
): CadEntityCommand[] {
  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const target = state.copy ? context.newEntityId() : entityId;
    if (state.copy) commands.push({ type: "copy", entityId, newEntityId: target });
    commands.push({
      type: "transform",
      entityId: target,
      transform: { ...transform, origin: state.base ?? undefined },
    });
  }
  return commands;
}

const ROTATE_MAGNITUDE = {
  message: "Precise el ángulo de rotación",
  options: [REFERENCE],
} as const;

const rotateCommand: CadCommandDescriptor<BasePointState> = {
  name: "ROTATE",
  aliases: ["RO"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    baseStep({ ...EMPTY_BASE_STATE, selection: context.selection }, ROTATE_MAGNITUDE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return finish([], "ROTATE");

    if (input.kind === "selection")
      return baseStep({ ...state, selection: input.entityIds }, ROTATE_MAGNITUDE);
    if (input.kind === "entityPick")
      return baseStep(
        { ...state, selection: [...new Set([...state.selection, input.entityId])] },
        ROTATE_MAGNITUDE,
      );
    if (input.kind === "enter" && state.selection.length === 0)
      return refuse("ROTATE necesita al menos un objeto designado.");

    if (input.kind === "keyword") {
      if (input.keyword === COPY_OPTION.keyword)
        return baseStep({ ...state, copy: true }, ROTATE_MAGNITUDE);
      if (input.keyword === REFERENCE.keyword)
        return baseStep({ ...state, reference: true }, ROTATE_MAGNITUDE);
      return baseStep(state, ROTATE_MAGNITUDE);
    }

    if (!state.base) {
      if (input.kind !== "point") return baseStep(state, ROTATE_MAGNITUDE);
      return baseStep({ ...state, base: input.point }, ROTATE_MAGNITUDE);
    }

    // Modo referencia: se miden dos puntos y el giro es la diferencia de sus
    // ángulos respecto del punto base. Es como se alinea una pieza con un borde
    // existente sin calcular nada a mano.
    if (state.reference) {
      if (input.kind !== "point") return baseStep(state, ROTATE_MAGNITUDE);
      if (!state.referenceFrom)
        return baseStep({ ...state, referenceFrom: input.point }, ROTATE_MAGNITUDE);
      const degrees =
        angleDeg(state.base, input.point) - angleDeg(state.base, state.referenceFrom);
      return finish(transformCommands(state, { rotationDeg: degrees }, context), "ROTATE");
    }

    const degrees =
      input.kind === "angle"
        ? input.degrees
        : input.kind === "distance"
          ? input.value
          : input.kind === "point"
            ? angleDeg(state.base, input.point)
            : null;
    if (degrees === null) return baseStep(state, ROTATE_MAGNITUDE);
    // Un giro de cero no es un error, pero tampoco un cambio: se termina sin
    // escribir para no dejar un paso de deshacer que no deshace nada.
    if (Math.abs(degrees % 360) < 1e-9) return finish([], "ROTATE");
    return finish(transformCommands(state, { rotationDeg: degrees }, context), "ROTATE");
  },
};

const SCALE_MAGNITUDE = {
  message: "Precise el factor de escala",
  options: [REFERENCE],
} as const;

const scaleCommand: CadCommandDescriptor<BasePointState> = {
  name: "SCALE",
  aliases: ["SC"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    baseStep({ ...EMPTY_BASE_STATE, selection: context.selection }, SCALE_MAGNITUDE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return finish([], "SCALE");

    if (input.kind === "selection")
      return baseStep({ ...state, selection: input.entityIds }, SCALE_MAGNITUDE);
    if (input.kind === "entityPick")
      return baseStep(
        { ...state, selection: [...new Set([...state.selection, input.entityId])] },
        SCALE_MAGNITUDE,
      );
    if (input.kind === "enter" && state.selection.length === 0)
      return refuse("SCALE necesita al menos un objeto designado.");

    if (input.kind === "keyword") {
      if (input.keyword === COPY_OPTION.keyword)
        return baseStep({ ...state, copy: true }, SCALE_MAGNITUDE);
      if (input.keyword === REFERENCE.keyword)
        return baseStep({ ...state, reference: true }, SCALE_MAGNITUDE);
      return baseStep(state, SCALE_MAGNITUDE);
    }

    if (!state.base) {
      if (input.kind !== "point") return baseStep(state, SCALE_MAGNITUDE);
      return baseStep({ ...state, base: input.point }, SCALE_MAGNITUDE);
    }

    // Referencia: la longitud medida pasa a ser la nueva unidad. El factor es
    // el cociente, y una referencia de longitud nula no define ninguno.
    if (state.reference) {
      if (input.kind !== "point") return baseStep(state, SCALE_MAGNITUDE);
      if (!state.referenceFrom)
        return baseStep({ ...state, referenceFrom: input.point }, SCALE_MAGNITUDE);
      const from = distance(state.base, state.referenceFrom);
      if (!(from > 1e-9))
        return refuse("La referencia tiene longitud cero: no define ninguna escala.");
      const factor = distance(state.base, input.point) / from;
      if (!(factor > 1e-9)) return refuse("Un factor de escala nulo colapsaría los objetos.");
      return finish(transformCommands(state, { scale: factor }, context), "SCALE");
    }

    const factor =
      input.kind === "distance"
        ? input.value
        : input.kind === "point"
          ? distance(state.base, input.point)
          : null;
    if (factor === null) return baseStep(state, SCALE_MAGNITUDE);
    // Escala nula o negativa: la primera colapsa la geometría a un punto y la
    // segunda es una reflexión disfrazada, que este comando no sabe hacer bien
    // todavía. Se rechaza diciéndolo en vez de escribir basura.
    if (!(factor > 1e-9))
      return refuse(
        `Factor de escala no válido (${factor}). Debe ser mayor que cero; para reflejar se usará MIRROR.`,
      );
    if (Math.abs(factor - 1) < 1e-12) return finish([], "SCALE");
    return finish(transformCommands(state, { scale: factor }, context), "SCALE");
  },
};

// ---------------------------------------------------------------------------
// FILLET y CHAMFER
// ---------------------------------------------------------------------------

const RADIUS_OPTION = { keyword: "Radio", shortcut: "R" } as const;
const DISTANCE_OPTION = { keyword: "Distancia", shortcut: "D" } as const;

interface CornerState {
  /** Radio de FILLET, o primera distancia de CHAMFER. */
  primary: number;
  /** Segunda distancia de CHAMFER. Igual a `primary` mientras no se diga otra. */
  secondary: number;
  /** Se está pidiendo la magnitud en vez de designar. */
  asking: "none" | "primary" | "secondary";
  picks: string[];
}

function cornerFinish(
  commands: CadEntityCommand[],
  label: string,
  state: CornerState,
): CadCommandStep<CornerState> {
  return {
    // Las magnitudes SOBREVIVEN al comando: en AutoCAD el radio de FILLET es
    // pegajoso y repetir con Espacio vuelve a usarlo. Reiniciarlo obligaría a
    // teclearlo en cada esquina de un contorno.
    state: { ...state, asking: "none", picks: [] },
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0 ? { kind: "document", commands, label } : { kind: "none" },
  };
}

function cornerStep(
  state: CornerState,
  label: "FILLET" | "CHAMFER",
): CadCommandStep<CornerState> {
  if (state.asking === "primary")
    return {
      state,
      prompt: {
        message: label === "FILLET" ? "Precise el radio" : "Precise la primera distancia",
        options: [],
        defaultValue: String(state.primary),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.asking === "secondary")
    return {
      state,
      prompt: {
        message: "Precise la segunda distancia",
        options: [],
        defaultValue: String(state.primary),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  const magnitude =
    label === "FILLET"
      ? `Radio actual = ${state.primary}`
      : `Distancias actuales = ${state.primary}, ${state.secondary}`;
  return {
    state,
    prompt: {
      message:
        state.picks.length === 0
          ? `${magnitude}. Designe la primera línea`
          : "Designe la segunda línea",
      options: state.picks.length === 0 ? [label === "FILLET" ? RADIUS_OPTION : DISTANCE_OPTION] : [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * Las dos líneas designadas, o el motivo por el que no sirven.
 *
 * `context.entity` sólo da lectura, que es justo lo que hace falta: se
 * comprueba el tipo ANTES de calcular nada, y el rechazo nombra lo que se
 * designó. Sin esto, `computeCadLineFillet` recibiría un arco, leería
 * `entity.start` como `undefined` y produciría `NaN` — geometría corrupta
 * escrita sin un solo error visible.
 */
function twoLines(picks: readonly string[], context: CadCommandContext) {
  const found = picks.map((id) => context.entity?.(id));
  for (let index = 0; index < found.length; index += 1) {
    const entity = found[index];
    if (!entity) return { error: `La entidad designada (${picks[index]}) ya no existe.` };
    if (entity.type !== "line")
      return {
        error: `Sólo se admiten LINE por ahora; se designó ${entity.type.toUpperCase()}.`,
      };
  }
  const [a, b] = found;
  if (!a || !b || a.type !== "line" || b.type !== "line") return { error: "Faltan líneas." };
  if (a.id === b.id) return { error: "Hay que designar dos líneas distintas." };
  return { lineA: a, lineB: b };
}

function cornerCommand(
  label: "FILLET" | "CHAMFER",
  name: string,
  aliases: readonly string[],
): CadCommandDescriptor<CornerState> {
  const initial: CornerState = { primary: 0, secondary: 0, asking: "none", picks: [] };
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "command-first",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: () => cornerStep(initial, label),
    step: (state, input, context) => {
      if (input.kind === "cancel" || input.kind === "enter")
        return cornerFinish([], label, state);

      if (input.kind === "keyword")
        return cornerStep({ ...state, asking: "primary" }, label);

      if (input.kind === "distance") {
        if (state.asking === "primary") {
          const value = Math.abs(input.value);
          return cornerStep(
            label === "CHAMFER"
              ? { ...state, primary: value, secondary: value, asking: "secondary" }
              : { ...state, primary: value, asking: "none" },
            label,
          );
        }
        if (state.asking === "secondary")
          return cornerStep({ ...state, secondary: Math.abs(input.value), asking: "none" }, label);
        return cornerStep(state, label);
      }

      const picked =
        input.kind === "entityPick"
          ? [input.entityId]
          : input.kind === "selection"
            ? input.entityIds
            : null;
      if (!picked) return cornerStep(state, label);

      const picks = [...state.picks, ...picked].slice(0, 2);
      if (picks.length < 2) return cornerStep({ ...state, picks }, label);

      const resolved = twoLines(picks, context);
      if ("error" in resolved)
        return {
          state: { ...state, picks: [] },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: `${label}: ${resolved.error}` },
        };

      try {
        const newId = context.newEntityId();
        const geometry =
          label === "FILLET"
            ? computeCadLineFillet(resolved.lineA, resolved.lineB, state.primary, newId)
            : computeCadLineChamfer(
                resolved.lineA,
                resolved.lineB,
                state.primary,
                state.secondary,
                newId,
              );
        const inserted = "arc" in geometry ? geometry.arc : geometry.chamfer;
        return cornerFinish(
          [
            {
              type: "properties",
              entityId: resolved.lineA.id,
              patch: {
                startX: geometry.lineA.start.x,
                startY: geometry.lineA.start.y,
                endX: geometry.lineA.end.x,
                endY: geometry.lineA.end.y,
              },
            },
            {
              type: "properties",
              entityId: resolved.lineB.id,
              patch: {
                startX: geometry.lineB.start.x,
                startY: geometry.lineB.start.y,
                endX: geometry.lineB.end.x,
                endY: geometry.lineB.end.y,
              },
            },
            { type: "insert", entity: inserted },
          ],
          label,
          state,
        );
      } catch (cause) {
        // Paralelas, radio imposible o distancias más largas que las líneas:
        // la geometría ya lo comprueba y lo dice. Se propaga su explicación tal
        // cual en vez de sustituirla por un «no se pudo».
        return {
          state: { ...state, picks: [] },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "message",
            text: `${label}: ${cause instanceof Error ? cause.message : String(cause)}`,
          },
        };
      }
    },
  };
}

export const CAD_MODIFY_TRANSFORM_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(rotateCommand),
  asCadCommand(scaleCommand),
  asCadCommand(cornerCommand("FILLET", "FILLET", ["F"])),
  asCadCommand(cornerCommand("CHAMFER", "CHAMFER", ["CHA"])),
];
