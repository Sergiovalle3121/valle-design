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
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { computeCadLineChamfer } from "../../cad-chamfer";
import { computeCadCurveFillet, type CadCornerEntity } from "../../cad-corner";
import { computeCadLineFillet } from "../../cad-fillet";
import { asCadEditableEntity, computeCadCurveKeepSide } from "../../curve-edit";
import {
  cadEntityCurves,
  curveIntersections,
  curvePointAt,
} from "../../curve-model";
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
  /**
   * Dónde se pinchó cada objeto.
   *
   * No es un adorno: dos curvas admiten hasta OCHO empalmes de un mismo radio,
   * todos geométricamente válidos, y el punto de designación es lo único que
   * distingue el que se quería. Con dos líneas basta la regla del extremo más
   * cercano al cruce; en cuanto entra un arco, deja de bastar.
   */
  pickPoints: CadPoint2[];
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
 * Los dos objetos designados, o el motivo por el que no sirven.
 *
 * `context.entity` sólo da lectura, que es justo lo que hace falta: se
 * comprueba el tipo ANTES de calcular nada, y el rechazo nombra lo que se
 * designó. Sin esto, `computeCadLineFillet` recibiría un arco, leería
 * `entity.start` como `undefined` y produciría `NaN` — geometría corrupta
 * escrita sin un solo error visible.
 *
 * CHAMFER sigue admitiendo sólo LINE, y no es una carencia: en AutoCAD el
 * chaflán tampoco acepta arcos ni círculos. No hay «distancia a lo largo» de
 * una curva que produzca una recta tangente, así que aceptarlo habría
 * significado inventar una geometría que ningún otro CAD produce.
 */
function twoCorners(
  picks: readonly string[],
  context: CadCommandContext,
  label: "FILLET" | "CHAMFER",
) {
  const allowed: readonly string[] = label === "FILLET" ? ["line", "arc", "circle"] : ["line"];
  const found = picks.map((id) => context.entity?.(id));
  for (let index = 0; index < found.length; index += 1) {
    const entity = found[index];
    if (!entity) return { error: `La entidad designada (${picks[index]}) ya no existe.` };
    if (!allowed.includes(entity.type))
      return {
        error:
          label === "FILLET"
            ? `Sólo se admiten LINE, ARC y CIRCLE; se designó ${entity.type.toUpperCase()}.`
            : `CHAMFER sólo admite LINE, igual que en AutoCAD; se designó ${entity.type.toUpperCase()}.`,
      };
  }
  const [a, b] = found;
  if (!a || !b) return { error: "Faltan objetos." };
  if (a.id === b.id) return { error: "Hay que designar dos objetos distintos." };
  return { first: a as CadCornerEntity, second: b as CadCornerEntity };
}

/** El recorte de un objeto hasta su punto de tangencia, ya como comando. */
function trimToTangent(
  entity: CadCornerEntity,
  tangent: CadPoint2,
  pick: CadPoint2,
): CadEntityCommand | null {
  // Un CÍRCULO no se recorta al redondear una esquina — es la regla de AutoCAD,
  // y la sensata: recortarlo lo convertiría en arco y destruiría el objeto que
  // sirve de referencia.
  if (entity.type === "circle") return null;
  const target = asCadEditableEntity(entity);
  if (!target) return null;
  const outcome = computeCadCurveKeepSide(target, tangent, pick);
  if ("error" in outcome) return null;
  if (outcome.replace) return { type: "replace", entityId: entity.id, entity: outcome.replace };
  if (outcome.patch) return { type: "properties", entityId: entity.id, patch: outcome.patch };
  return null;
}

/**
 * El empalme general: línea contra arco, arco contra círculo, y sus mezclas.
 *
 * Los recortes se piden a `computeCadCurveKeepSide`, que prolonga cuando la
 * tangencia cae fuera del objeto y recorta cuando cae dentro. Antes de emitir
 * nada se comprueba que TODOS los números del lote son finitos: el modo de
 * fallo documentado de este repositorio es un `NaN` que entra en el documento y
 * se exporta a DXF sin un solo error visible, y la comprobación es lo que lo
 * impide.
 */
function curveFillet(
  state: CornerState,
  first: CadCornerEntity,
  second: CadCornerEntity,
  pickPoints: readonly CadPoint2[],
  context: CadCommandContext,
): CadCommandStep<CornerState> {
  const refuseCorner = (text: string): CadCommandStep<CornerState> => ({
    state: { ...state, picks: [], pickPoints: [] },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text: `FILLET: ${text}` },
  });

  const pickFirst = pickPoints[0] ?? entityAnchorPoint(first);
  const pickSecond = pickPoints[1] ?? entityAnchorPoint(second);
  const geometry = computeCadCurveFillet(
    first,
    second,
    state.primary,
    context.newEntityId(),
    pickFirst,
    pickSecond,
  );
  if ("error" in geometry) return refuseCorner(geometry.error);

  const commands: CadEntityCommand[] = [];
  const trimFirst = trimToTangent(first, geometry.tangents[0], pickFirst);
  if (trimFirst) commands.push(trimFirst);
  const trimSecond = trimToTangent(second, geometry.tangents[1], pickSecond);
  if (trimSecond) commands.push(trimSecond);
  commands.push({ type: "insert", entity: geometry.arc });

  if (!allFinite(commands))
    return refuseCorner(
      "el cálculo produjo coordenadas no finitas y no se ha escrito nada. Es un fallo del empalme, no del dibujo.",
    );
  return cornerFinish(commands, "FILLET", state);
}

/**
 * La esquina exacta: intersección (real o prolongada) de los dos objetos más
 * cercana a los clics. Es la geometría de FILLET radio 0 y de CHAMFER 0×0 —
 * el gesto de AutoCAD para CERRAR una esquina, y además el valor con el que
 * ambas órdenes arrancan.
 */
function cadCornerPoint(
  first: CadCornerEntity,
  second: CadCornerEntity,
  pickFirst: CadPoint2,
  pickSecond: CadPoint2,
): { point: CadPoint2 } | { error: string } {
  const curvesA = cadEntityCurves(first);
  const curvesB = cadEntityCurves(second);
  if (!curvesA || !curvesB)
    return { error: "uno de los objetos designados no tiene geometría de esquina." };
  const measure = (a: CadPoint2, b: CadPoint2) => Math.hypot(a.x - b.x, a.y - b.y);
  let best: { point: CadPoint2; score: number } | null = null;
  for (const a of curvesA)
    for (const b of curvesB)
      for (const hit of curveIntersections(a, b, { extendA: true, extendB: true })) {
        const point = curvePointAt(a, hit.tA);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        const score = measure(point, pickFirst) + measure(point, pickSecond);
        if (!best || score < best.score) best = { point, score };
      }
  if (!best)
    return { error: "los objetos no se cruzan ni prolongados: no hay esquina que cerrar." };
  return { point: best.point };
}

/**
 * FILLET 0 / CHAMFER 0×0: recorta o prolonga ambos objetos hasta su esquina
 * exacta, sin arco ni chaflán de por medio. Sobrevive el lado donde se pulsó
 * cada objeto, igual que en AutoCAD.
 */
function cornerJoin(
  state: CornerState,
  label: "FILLET" | "CHAMFER",
  first: CadCornerEntity,
  second: CadCornerEntity,
  pickPoints: readonly CadPoint2[],
): CadCommandStep<CornerState> {
  const refuse = (text: string): CadCommandStep<CornerState> => ({
    state: { ...state, picks: [], pickPoints: [] },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text: `${label}: ${text}` },
  });
  const pickFirst = pickPoints[0] ?? entityAnchorPoint(first);
  const pickSecond = pickPoints[1] ?? entityAnchorPoint(second);
  const corner = cadCornerPoint(first, second, pickFirst, pickSecond);
  if ("error" in corner) return refuse(corner.error);
  const commands: CadEntityCommand[] = [];
  const trimFirst = trimToTangent(first, corner.point, pickFirst);
  if (trimFirst) commands.push(trimFirst);
  const trimSecond = trimToTangent(second, corner.point, pickSecond);
  if (trimSecond) commands.push(trimSecond);
  if (commands.length === 0)
    return refuse("ninguno de los dos objetos se pudo llevar a la esquina.");
  if (!allFinite(commands))
    return refuse(
      "el cálculo produjo coordenadas no finitas y no se ha escrito nada. Es un fallo de la esquina, no del dibujo.",
    );
  return cornerFinish(commands, label, state);
}

/** Punto de referencia cuando se designó por selección y no hay clic. */
function entityAnchorPoint(entity: CadCornerEntity): CadPoint2 {
  return entity.type === "line"
    ? { x: entity.start.x, y: entity.start.y }
    : { x: entity.center.x, y: entity.center.y };
}

/**
 * `true` si ningún número del lote es NaN ni infinito.
 *
 * Es el guardia que este repositorio pagó caro por no tener: un arco llegando
 * donde se esperaba una línea escribía NaN en las coordenadas y el documento se
 * guardaba y se exportaba con la geometría corrupta, sin un solo error.
 */
function allFinite(commands: readonly CadEntityCommand[]): boolean {
  let ok = true;
  JSON.stringify(commands, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) ok = false;
    return value;
  });
  return ok;
}

function cornerCommand(
  label: "FILLET" | "CHAMFER",
  name: string,
  aliases: readonly string[],
): CadCommandDescriptor<CornerState> {
  const initial: CornerState = {
    primary: 0,
    secondary: 0,
    asking: "none",
    picks: [],
    pickPoints: [],
  };
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
      // El punto de designación se guarda cuando lo hay. Al designar por
      // selección no lo hay, y entonces se toma un punto del propio objeto:
      // basta para las dos líneas, y para un arco es lo mejor disponible.
      const pickPoints = [
        ...state.pickPoints,
        ...(input.kind === "entityPick" ? [input.point] : picked.map(() => null)),
      ]
        .slice(0, 2)
        .filter((point): point is CadPoint2 => point !== null);
      if (picks.length < 2) return cornerStep({ ...state, picks, pickPoints }, label);

      const resolved = twoCorners(picks, context, label);
      if ("error" in resolved)
        return {
          state: { ...state, picks: [], pickPoints: [] },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: `${label}: ${resolved.error}` },
        };

      // FILLET con radio 0 y CHAMFER con 0×0 cierran la ESQUINA EXACTA, como
      // en AutoCAD — que además es el valor con el que las dos órdenes
      // arrancan. Antes de la campaña de cimientos ese caso se rechazaba con
      // «el radio debe ser mayor que cero», o sea: la orden fallaba de fábrica.
      if (
        state.primary === 0 &&
        (label === "FILLET" || state.secondary === 0)
      )
        return cornerJoin(state, label, resolved.first, resolved.second, pickPoints);

      // El par de LÍNEAS sigue yendo por `computeCadLineFillet`: su regla de
      // desambiguación —el extremo más cercano al cruce es la esquina— está
      // congelada y probada, y sustituirla por la general cambiaría resultados
      // que hoy son correctos.
      if (
        label === "FILLET" &&
        (resolved.first.type !== "line" || resolved.second.type !== "line")
      )
        return curveFillet(state, resolved.first, resolved.second, pickPoints, context);

      try {
        const newId = context.newEntityId();
        const lineA = resolved.first as Extract<CadEntity, { type: "line" }>;
        const lineB = resolved.second as Extract<CadEntity, { type: "line" }>;
        const geometry =
          label === "FILLET"
            ? computeCadLineFillet(lineA, lineB, state.primary, newId)
            : computeCadLineChamfer(lineA, lineB, state.primary, state.secondary, newId);
        const inserted = "arc" in geometry ? geometry.arc : geometry.chamfer;
        return cornerFinish(
          [
            {
              type: "properties",
              entityId: lineA.id,
              patch: {
                startX: geometry.lineA.start.x,
                startY: geometry.lineA.start.y,
                endX: geometry.lineA.end.x,
                endY: geometry.lineA.end.y,
              },
            },
            {
              type: "properties",
              entityId: lineB.id,
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
