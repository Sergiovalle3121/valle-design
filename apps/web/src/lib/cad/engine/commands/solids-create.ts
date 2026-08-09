/**
 * REGION, EXTRUDE, PRESSPULL y REVOLVE: de un dibujo plano a un sólido.
 *
 * Son las cuatro órdenes con las que empieza cualquier modelado, y las cuatro
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
 * ## PRESSPULL, y qué NO es aquí
 *
 * En AutoCAD, PRESSPULL empuja también la CARA de un sólido existente. Eso exige
 * poder designar una cara, y el viewport 2D designa entidades, no caras. Lo que
 * hace aquí es lo otro que hace PRESSPULL: convertir un área cerrada en sólido
 * arrastrando. Está dicho en el prompt en vez de fingir que hace las dos cosas.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadSolidNode } from "../../cad-entities-v5";
import {
  planeFrameAt,
  profileFromEntity,
  revolveSetupFromProfile,
  closedLoopsOfEntity,
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
import {
  finishedSolid,
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

// ---------------------------------------------------------------------------
// REGION
// ---------------------------------------------------------------------------

const regionCommand: CadCommandDescriptor<SelectionState> = {
  name: "REGION",
  aliases: ["REG"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  // Semántica PICKFIRST, como el resto de las órdenes de sólidos.
  begin: (context) =>
    context.selection.length > 0
      ? regionResult({ selection: context.selection }, context)
      : designatePrompt({ selection: context.selection }, REGION_PROMPT),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection") return designatePrompt({ selection: input.entityIds }, REGION_PROMPT);
    if (input.kind === "entityPick")
      return designatePrompt(
        { selection: [...new Set([...state.selection, input.entityId])] },
        REGION_PROMPT,
      );
    if (input.kind !== "enter") return designatePrompt(state, REGION_PROMPT);
    return regionResult(state, context);
  },
};

const REGION_PROMPT = "Designe los contornos cerrados que convertir en regiones";

function regionResult(
  state: SelectionState,
  context: CadCommandContext,
): CadCommandStep<SelectionState> {
    const commands: CadEntityCommand[] = [];
    let created = 0;
    for (const entity of selectedEntities(context, state.selection)) {
      const loops = closedLoopsOfEntity(entity);
      if (loops.length === 0) continue;
      commands.push({
        type: "insert",
        entity: {
          id: context.newEntityId(),
          type: "region",
          outer: loops[0],
          ...(loops.length > 1 ? { inners: loops.slice(1) } : {}),
          layer: entity.layer ?? context.activeLayer,
        },
      });
      // El contorno se consume: dejarlo debajo de la región duplicaría la
      // silueta en pantalla y en el exportado.
      commands.push({ type: "delete", entityId: entity.id });
      created += 1;
    }
    if (created === 0) return solidMessage(state, NO_PROFILE);
    return solidBatch(state, commands, "REGION");
}

// ---------------------------------------------------------------------------
// EXTRUDE / PRESSPULL
// ---------------------------------------------------------------------------

interface ExtrudeState extends SelectionState {
  /** Ángulo de desmoldeo en grados. Positivo ⇒ la pieza se ensancha al subir. */
  taperDeg: number;
  askingTaper: boolean;
}

const EXTRUDE_TAPER = { keyword: "Inclinación", shortcut: "I" } as const;

const EMPTY_EXTRUDE: ExtrudeState = { selection: [], taperDeg: 0, askingTaper: false };

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
  const profiles = profilesOf(context, state.selection);
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

function extrudeDescriptor(
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
  asCadCommand(regionCommand),
  asCadCommand(extrudeDescriptor("EXTRUDE", ["EXT"], "extruir")),
  // PRESSPULL comparte máquina con EXTRUDE porque hace lo mismo sobre un área
  // cerrada; lo que NO hace es empujar la cara de un sólido existente, y eso se
  // dice en el prompt en vez de fingirlo.
  asCadCommand(extrudeDescriptor("PRESSPULL", [], "empujar o tirar")),
  asCadCommand(revolveCommand),
];
