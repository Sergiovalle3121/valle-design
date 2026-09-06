/**
 * EXTRUDE, PRESSPULL y REVOLVE: de un dibujo plano a un sólido.
 *
 * Son las tres órdenes con las que empieza cualquier modelado, y las cuatro
 * comparten la misma promesa: **no se teclean coordenadas de perfil**. Se designa
 * lo que ya está dibujado —una polilínea cerrada, un círculo, una región— y el
 * comando saca de ahí la sección. La conversión vive en `solid3d-profiles.ts` y
 * usa el renderizador del propio adaptador, así que la base del sólido es
 * exactamente el trazo que se ve en pantalla, con sus arcos de `bulge` incluidos.
 *
 * ## Qué pasa con el perfil designado
 *
 * Se BORRA, que es el comportamiento por defecto de AutoCAD (`DELOBJ = 1`) y el
 * que evita el error clásico de acabar con una polilínea invisible pegada a la
 * base del sólido, que luego aparece en la designación por ventana y en el
 * exportado a DXF. Quien quiera conservarla la copia antes; el paso está en un
 * solo lote, así que deshacer lo devuelve todo de una vez.
 *
 * ## Un perfil inclinado se RECHAZA, no se aplana
 *
 * La auditoría del 2026-09-05 (T-10 b) encontró que EXTRUDE tomaba la cota de
 * UN vértice y extruía el perfil aplanado: un contorno dibujado a 30° daba un
 * sólido más pequeño por el coseno, a la cota de una sola esquina y con aspecto
 * de correcto. En esta versión el extrusor sólo sabe levantar perfiles
 * horizontales, y eso se DICE: `horizontalProfileFromEntity` mide cuánto se
 * separan en cota los vértices del contorno y, si se separan más que la
 * tolerancia del kernel, la orden termina con ese número en milímetros y sin
 * escribir nada. Extruir por la normal del perfil es el arreglo bueno y está
 * pendiente; lo que no está permitido es entregar el aplanado en silencio.
 *
 * ## PRESSPULL ya no vive aquí
 *
 * Este archivo declaraba que PRESSPULL sólo sabía convertir un área cerrada en
 * sólido, porque *«el viewport 2D designa entidades, no caras»*. Ya no es
 * cierto: `lib/cad/pick3d/` resuelve el rayo de cámara contra las caras y
 * `CAD_ACCEPT_FACE_PICK` deja pedirlas. PRESSPULL se mudó a
 * `solids-push-face.ts`, donde hace LAS DOS COSAS —empujar una cara o extruir
 * un contorno— decidiendo por el primer gesto del usuario. La máquina de
 * extrusión que usa para el segundo caso sigue siendo la de aquí, exportada
 * para que no haya dos.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadSolidNode } from "../../cad-entities-v5";
import {
  horizontalProfileFromEntity,
  planeFrameAt,
  profileFromEntity,
  revolveSetupFromProfile,
  type CadExtractedProfile,
} from "../../solid3d-profiles";
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
import { cadMillimetresLabel, cadToMillimetres } from "./architecture-support";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  selectedEntities,
  solidBatch,
  solidCancelled,
  solidMessage,
} from "./solids-support";

interface SelectionState {
  selection: readonly string[];
}

const NO_PROFILE =
  "No hay ningún contorno cerrado entre lo designado. Sirven las polilíneas CERRADAS, los círculos, las elipses completas, las splines cerradas y las REGION.";

function designatePrompt<S extends SelectionState>(state: S, message: string): CadCommandStep<S> {
  return {
    state,
    prompt: { message, options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

/** Perfiles extraídos de la designación, en el orden en que se designaron. */
function profilesOf(context: CadCommandContext, ids: readonly string[]): CadExtractedProfile[] {
  const profiles: CadExtractedProfile[] = [];
  for (const entity of selectedEntities(context, ids)) {
    const extracted = profileFromEntity(entity);
    if (extracted) profiles.push(extracted);
  }
  return profiles;
}

/** Cómo nombra el mensaje al contorno que no se pudo extruir. */
const PROFILE_NOUN: Partial<Record<CadEntity["type"], string>> = {
  polyline: "la polilínea",
  region: "la región",
  spline: "la spline",
  ellipse: "la elipse",
  circle: "el círculo",
};

/**
 * El motivo, con el número, por el que un contorno inclinado no se extruye.
 *
 * Habla en milímetros porque es lo que el arquitecto lee, y los saca de la
 * unidad del documento por el mismo helper que usan SLAB y ROOF. Una desviación
 * real pero menor que la décima de milímetro no se redondea a «0 mm», que
 * sería decirle al usuario que su perfil es horizontal justo al negárselo.
 */
function inclinedProfileRefusal(
  label: string,
  entity: CadEntity,
  deviation: number,
  position: { index: number; total: number },
  unit: string | undefined,
): string {
  const noun = PROFILE_NOUN[entity.type] ?? "el contorno";
  const which = position.total > 1 ? `${noun} (contorno ${position.index + 1} de ${position.total})` : noun;
  const millimetres = cadToMillimetres(deviation, unit);
  const amount = millimetres < 0.1 ? `menos de ${formatMagnitude(0.1)} mm` : `${cadMillimetresLabel(deviation, unit)} mm`;
  return (
    `${label} no extruyó ${which}: el perfil no es horizontal (sus vértices se separan ${amount} en cota). ` +
    `En esta versión ${label} sólo acepta perfiles horizontales y no aplana los inclinados; extruirlos por su normal está pendiente.`
  );
}

/**
 * Perfiles HORIZONTALES de la designación, o el motivo del primero que no lo es.
 *
 * Un solo contorno inclinado aborta la orden entera, igual que un perfil que
 * no da sólido: emitir los demás dejaría media operación hecha y al usuario
 * sin saber cuál faltó.
 */
function horizontalProfilesOf(
  context: CadCommandContext,
  ids: readonly string[],
  label: string,
): { profiles: CadExtractedProfile[] } | { refusal: string } {
  // Sólo cuentan como «contorno N de M» las entidades que encierran un área;
  // una línea colada en la designación no se numera.
  const contours = selectedEntities(context, ids)
    .map((entity) => ({ entity, horizontal: horizontalProfileFromEntity(entity) }))
    .filter((entry) => entry.horizontal.kind !== "none");
  const profiles: CadExtractedProfile[] = [];
  for (const [index, { entity, horizontal }] of contours.entries()) {
    if (horizontal.kind === "inclined")
      return {
        refusal: inclinedProfileRefusal(label, entity, horizontal.deviation, { index, total: contours.length }, context.unit),
      };
    if (horizontal.kind === "profile") profiles.push(horizontal.extracted);
  }
  return { profiles };
}

// ---------------------------------------------------------------------------
// EXTRUDE / PRESSPULL
// ---------------------------------------------------------------------------

export interface ExtrudeState extends SelectionState {
  /** Ángulo de desmoldeo en grados. Positivo ⇒ la pieza se ensancha al subir. */
  taperDeg: number;
  askingTaper: boolean;
}

const EXTRUDE_TAPER = { keyword: "Inclinación", shortcut: "I" } as const;

export const EMPTY_EXTRUDE: ExtrudeState = { selection: [], taperDeg: 0, askingTaper: false };

function extrudeStep(state: ExtrudeState, verb: string): CadCommandStep<ExtrudeState> {
  if (state.selection.length === 0)
    return designatePrompt(state, `Designe los contornos cerrados que ${verb}`);
  if (state.askingTaper)
    return {
      state,
      prompt: { message: "Precise el ángulo de inclinación de la extrusión", options: [], defaultValue: "0" },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ANGLE,
    };
  return {
    state,
    prompt: {
      message: "Precise la altura de la extrusión",
      options: [EXTRUDE_TAPER],
      defaultValue: state.taperDeg !== 0 ? `inclinación ${state.taperDeg}°` : undefined,
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

function extrudeResult(
  state: ExtrudeState,
  height: number,
  context: CadCommandContext,
  label: string,
): CadCommandStep<ExtrudeState> {
  if (!(Math.abs(height) > 1e-9))
    return solidMessage(state, `${label} necesita una altura distinta de cero.`);
  // Un contorno inclinado termina la orden con su motivo ANTES de que nada se
  // aplane: ver la cabecera, «Un perfil inclinado se RECHAZA, no se aplana».
  const horizontal = horizontalProfilesOf(context, state.selection, label);
  if ("refusal" in horizontal) return solidMessage(state, horizontal.refusal);
  const profiles = horizontal.profiles;
  if (profiles.length === 0) return solidMessage(state, NO_PROFILE);

  const commands: CadEntityCommand[] = [];
  for (const extracted of profiles) {
    const node: CadSolidNode = {
      id: "perfil",
      op: "extrude",
      profile: extracted.profile,
      height,
      frame: planeFrameAt(extracted.elevation),
      ...(state.taperDeg !== 0 ? { draftAngleRad: (state.taperDeg * Math.PI) / 180 } : {}),
    };
    const solid = makeSolidEntity(context.newEntityId(), [node], "perfil", context.activeLayer);
    const finished = finishedSolid(solid, { state, label });
    // Un perfil que no da sólido aborta la orden entera: emitir los que sí
    // funcionaron dejaría al usuario con media operación hecha y sin saber cuál.
    if (finished.result?.kind !== "document") return finished;
    commands.push(...finished.result.commands, { type: "delete", entityId: extracted.sourceId });
  }
  return solidBatch(state, commands, label);
}

export function extrudeDescriptor(
  name: string,
  aliases: readonly string[],
  verb: string,
): CadCommandDescriptor<ExtrudeState> {
  return {
    name,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => extrudeStep({ ...EMPTY_EXTRUDE, selection: context.selection }, verb),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (input.kind === "selection") return extrudeStep({ ...state, selection: input.entityIds }, verb);
      if (input.kind === "entityPick")
        return extrudeStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] }, verb);

      if (input.kind === "keyword" && input.keyword === EXTRUDE_TAPER.keyword)
        return extrudeStep({ ...state, askingTaper: true }, verb);

      if (state.askingTaper) {
        if (input.kind === "enter") return extrudeStep({ ...state, askingTaper: false }, verb);
        const degrees = input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
        if (degrees === null) return extrudeStep(state, verb);
        // Un desmoldeo de ±90° o más no define ninguna extrusión: la sección se
        // haría infinita a media altura. El kernel también lo rechaza; aquí el
        // mensaje habla de grados, que es lo que el usuario tecleó.
        if (Math.abs(degrees) >= 90)
          return solidMessage(state, "El ángulo de inclinación tiene que estar entre −90° y 90°.");
        return extrudeStep({ ...state, taperDeg: degrees, askingTaper: false }, verb);
      }

      if (input.kind === "enter") {
        if (state.selection.length === 0) return solidMessage(state, `${name} necesita al menos un contorno designado.`);
        return extrudeStep(state, verb);
      }
      if (input.kind === "distance") return extrudeResult(state, input.value, context, name);
      if (input.kind === "point") {
        // Un punto marca la altura por su distancia al plano del perfil medida
        // en Y, que es la convención de arrastre del viewport 2D.
        const profiles = profilesOf(context, state.selection);
        if (profiles.length === 0) return solidMessage(state, NO_PROFILE);
        return extrudeResult(state, heightFromPoint(input.point, profiles[0]), context, name);
      }
      return extrudeStep(state, verb);
    },
  };
}

/** Altura implícita al precisar un punto: su separación del centro del perfil. */
function heightFromPoint(point: CadPoint2, extracted: CadExtractedProfile): number {
  const ring = extracted.profile.outer;
  if (ring.length === 0) return 0;
  const centre = ring.reduce(
    (total, vertex) => ({ x: total.x + vertex.x / ring.length, y: total.y + vertex.y / ring.length }),
    { x: 0, y: 0 },
  );
  return Math.hypot(point.x - centre.x, point.y - centre.y);
}

// ---------------------------------------------------------------------------
// REVOLVE
// ---------------------------------------------------------------------------

interface RevolveState extends SelectionState {
  axisStart: CadPoint2 | null;
  axisEnd: CadPoint2 | null;
}

const EMPTY_REVOLVE: RevolveState = { selection: [], axisStart: null, axisEnd: null };

function revolveStep(state: RevolveState): CadCommandStep<RevolveState> {
  if (state.selection.length === 0)
    return designatePrompt(state, "Designe los contornos cerrados que revolucionar");
  if (!state.axisStart)
    return { state, prompt: { message: "Precise el primer punto del eje de revolución", options: [] }, accepts: CAD_ACCEPT_POINT };
  if (!state.axisEnd)
    return {
      state,
      prompt: { message: "Precise el segundo punto del eje de revolución", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview: [{ points: [state.axisStart, state.axisStart] }],
    };
  return {
    state,
    prompt: { message: "Precise el ángulo de revolución", options: [], defaultValue: "360" },
    accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD,
  };
}

function revolveResult(
  state: RevolveState,
  degrees: number,
  context: CadCommandContext,
): CadCommandStep<RevolveState> {
  const profiles = profilesOf(context, state.selection);
  if (profiles.length === 0) return solidMessage(state, NO_PROFILE);
  const commands: CadEntityCommand[] = [];
  for (const extracted of profiles) {
    const setup = revolveSetupFromProfile(extracted, state.axisStart!, state.axisEnd!);
    if (!setup)
      return solidMessage(
        state,
        "El perfil CRUZA el eje de revolución. Al girar, el sólido se atravesaría a sí mismo: mueve el eje fuera del contorno.",
      );
    const node: CadSolidNode = {
      id: "revolucion",
      op: "revolve",
      profile: setup.profile,
      frame: setup.frame,
      angleRad: (degrees * Math.PI) / 180,
      segments: 32,
    };
    const solid = makeSolidEntity(context.newEntityId(), [node], "revolucion", context.activeLayer);
    const finished = finishedSolid(solid, { state, label: "REVOLVE" });
    if (finished.result?.kind !== "document") return finished;
    commands.push(...finished.result.commands, { type: "delete", entityId: extracted.sourceId });
  }
  return solidBatch(state, commands, "REVOLVE");
}

const revolveCommand: CadCommandDescriptor<RevolveState> = {
  name: "REVOLVE",
  aliases: ["REV"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => revolveStep({ ...EMPTY_REVOLVE, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection") return revolveStep({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return revolveStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });

    if (input.kind === "point") {
      if (!state.axisStart) return revolveStep({ ...state, axisStart: input.point });
      if (!state.axisEnd) {
        if (Math.hypot(input.point.x - state.axisStart.x, input.point.y - state.axisStart.y) < 1e-9)
          return solidMessage(state, "Los dos puntos del eje son el mismo: no definen ninguna revolución.");
        return revolveStep({ ...state, axisEnd: input.point });
      }
      return revolveStep(state);
    }

    if (!state.axisStart || !state.axisEnd) {
      if (input.kind === "enter" && state.selection.length === 0)
        return solidMessage(state, "REVOLVE necesita al menos un contorno designado.");
      return revolveStep(state);
    }

    // Enter acepta el defecto: la vuelta completa.
    if (input.kind === "enter") return revolveResult(state, 360, context);
    if (input.kind === "angle") return revolveResult(state, input.degrees, context);
    if (input.kind === "distance") return revolveResult(state, input.value, context);
    return revolveStep(state);
  },
};

export const CAD_SOLID_CREATE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(extrudeDescriptor("EXTRUDE", ["EXT"], "extruir")),
  // PRESSPULL comparte máquina con EXTRUDE porque hace lo mismo sobre un área
  // cerrada; lo que NO hace es empujar la cara de un sólido existente, y eso se
  // dice en el prompt en vez de fingirlo.
  asCadCommand(revolveCommand),
];
