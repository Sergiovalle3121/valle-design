/**
 * LIST y MASSPROP: el volcado completo y las propiedades de masa.
 *
 * ## LIST
 *
 * Enseña TODO lo que el documento sabe de lo designado. Su valor está en que no
 * hay una lista escrita a mano de qué enseñar: las propiedades salen de
 * `properties.read` del registro de adaptadores. El día que se registre un tipo
 * nuevo, LIST lo describe entero sin que nadie venga a acordarse.
 *
 * ## MASSPROP, y de quién es
 *
 * Este MASSPROP es el de las REGIONES 2D: área, perímetro, centroide, momentos
 * y ejes principales de un contorno cerrado. El de los SÓLIDOS 3D —volumen,
 * masa, momentos respecto de tres ejes— pertenece a la sesión del kernel B-rep
 * y saldrá por el mismo nombre de comando cuando llegue.
 *
 * Reparto: si lo designado son sólidos, este comando se aparta y lo dice, en
 * vez de calcular el área de su silueta y presentarla como propiedades de masa.
 * Un número plausible y equivocado es peor que una negativa.
 */
import type { CadEntity } from "../../cad-document";
import {
  cadEntityContours,
  cadMassProperties,
  type CadContour,
} from "../../inquiry/contours";
import {
  cadInquiryLens,
  describeCadEntity,
  formatCadMassProperties,
} from "../../inquiry/reports";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const SELECT_PROMPT = { message: "Designe objetos", options: [] } as const;

function pendingSelection<S>(state: S): CadCommandStep<S> {
  return { state, prompt: SELECT_PROMPT, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
}

function report<S>(
  state: S,
  text: string,
  patch: Record<string, number> = {},
): CadCommandStep<S> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      Object.keys(patch).length > 0
        ? { kind: "variables", patch, system: true, text }
        : { kind: "message", text },
  };
}

function resolve(context: CadCommandContext, ids: readonly string[]): CadEntity[] {
  return ids
    .map((entityId) => context.entity?.(entityId))
    .filter((entity): entity is CadEntity => entity !== undefined);
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

interface ListState {
  targets: readonly string[];
}

/** Tope de objetos volcados de una vez. Más allá el diálogo deja de leerse. */
const LIST_LIMIT = 20;

function listResult(
  state: ListState,
  targets: readonly string[],
  context: CadCommandContext,
): CadCommandStep<ListState> {
  if (targets.length === 0)
    return report({ targets }, "LIST: no hay ningún objeto designado.");
  const lens = cadInquiryLens(context.variables);
  const entities = resolve(context, targets);
  if (entities.length === 0)
    return report({ targets }, "LIST: lo designado ya no está en el dibujo.");
  const shown = entities.slice(0, LIST_LIMIT);
  const lines = shown.flatMap((entity) => describeCadEntity(entity, lens.format));
  if (entities.length > shown.length)
    lines.push(
      `… y ${entities.length - shown.length} objeto(s) más. LIST vuelca ${LIST_LIMIT} de una vez; ` +
        "designe menos para verlos todos.",
    );
  return report({ targets }, lines.join("\n"));
}

const listCommand: CadCommandDescriptor<ListState> = {
  name: "LIST",
  aliases: ["LI", "LS"],
  kind: "inquiry",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: false,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? listResult({ targets: context.selection }, context.selection, context)
      : pendingSelection({ targets: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "selection") return listResult(state, input.entityIds, context);
    if (input.kind === "entityPick") return listResult(state, [input.entityId], context);
    if (input.kind === "enter") return listResult(state, state.targets, context);
    return pendingSelection(state);
  },
};

// ---------------------------------------------------------------------------
// MASSPROP
// ---------------------------------------------------------------------------

interface MassPropState {
  targets: readonly string[];
}

/** Tipos que el kernel 3D reclamará. Aquí sólo sirven para apartarse. */
const SOLID_TYPES = new Set(["solid3d", "brep", "mesh", "surface"]);

function massPropResult(
  state: MassPropState,
  targets: readonly string[],
  context: CadCommandContext,
): CadCommandStep<MassPropState> {
  const entities = resolve(context, targets);
  if (entities.length === 0)
    return report(state, "MASSPROP: no hay ningún objeto designado.");

  const solids = entities.filter((entity) => SOLID_TYPES.has(entity.type));
  if (solids.length > 0)
    return report(
      state,
      `MASSPROP: ${solids.length} sólido(s) entre lo designado. Las propiedades de masa de un ` +
        "sólido las calcula el kernel 3D; este MASSPROP mide regiones 2D. Designe sólo regiones.",
    );

  const contours: CadContour[] = [];
  const skipped: string[] = [];
  for (const entity of entities) {
    const closed = cadEntityContours(entity).filter(
      (contour) => contour.closed && contour.points.length >= 3,
    );
    if (closed.length === 0) skipped.push(entity.type.toUpperCase());
    else contours.push(...closed);
  }

  if (contours.length === 0)
    return report(
      state,
      "MASSPROP sólo mide regiones: contornos CERRADOS. Nada de lo designado lo es " +
        `(${[...new Set(skipped)].join(", ") || "sin contorno"}). Use REGION para crear una.`,
    );

  const properties = cadMassProperties(contours);
  if (!properties)
    return report(state, "MASSPROP: los contornos designados encierran un área nula.");

  const lens = cadInquiryLens(context.variables);
  const lines = formatCadMassProperties(properties, lens.format);
  if (skipped.length > 0)
    lines.push(
      `Se han ignorado ${skipped.length} objeto(s) sin contorno cerrado: ${[...new Set(skipped)].join(", ")}.`,
    );
  return report({ targets }, lines.join("\n"), {
    AREA: properties.area,
    PERIMETER: properties.perimeter,
  });
}

const massPropCommand: CadCommandDescriptor<MassPropState> = {
  name: "MASSPROP",
  aliases: ["MASS"],
  kind: "inquiry",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: false,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? massPropResult({ targets: context.selection }, context.selection, context)
      : pendingSelection({ targets: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "selection") return massPropResult(state, input.entityIds, context);
    if (input.kind === "entityPick") return massPropResult(state, [input.entityId], context);
    if (input.kind === "enter") return massPropResult(state, state.targets, context);
    return pendingSelection(state);
  },
};

export const CAD_INQUIRY_LIST_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(listCommand),
  asCadCommand(massPropCommand),
];
