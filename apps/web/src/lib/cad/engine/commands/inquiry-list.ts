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
 * ## MASSPROP, y de quién es cada mitad
 *
 * Una sola orden, dos mitades repartidas POR TIPO DE OBJETO DESIGNADO y no por
 * comando: las REGIONES 2D —área, perímetro, centroide, momentos y ejes
 * principales— y los SÓLIDOS 3D —volumen, área y centroide por el kernel B-rep—.
 * Este archivo escribió la primera mitad y dejó la segunda apartándose con un
 * mensaje; la ola de sólidos la rellena aquí, que es donde vive la orden.
 *
 * Lo que NO cambia es el criterio que dejó escrito la primera mitad: nunca se
 * calcula el área de la silueta de un sólido y se presenta como propiedades de
 * masa. Un número plausible y equivocado es peor que una negativa. Ahora ya no
 * hace falta negarse, porque hay con qué responder.
 *
 * Una designación MIXTA responde las dos cosas, cada una con su encabezado. El
 * volumen del sólido se publica por los DOS caminos del kernel —integración
 * sobre las caras y suma sobre la malla teselada— con su discrepancia: un solo
 * número escondería justo lo que sirve para saber si fiarse de él.
 */
import type { CadEntity } from "../../cad-document";
import {
  cadEntityContours,
  cadMassProperties,
  type CadContour,
} from "../../inquiry/contours";
import { solid3dMassComparison } from "../../solid3d-build";
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

/**
 * Tipos de SÓLIDO. `solid3d` es el del esquema 5 y lo resuelve el kernel B-rep;
 * los otros tres son nombres reservados para cuerpos que todavía no existen como
 * entidad, y sobre ellos MASSPROP sigue apartándose en vez de medir su silueta.
 */
const SOLID_TYPES = new Set(["solid3d", "brep", "mesh", "surface"]);

/** Una línea de propiedades de masa por sólido, con los dos caminos y su deriva. */
function solidMassLines(solids: readonly CadEntity[]): string[] {
  const lines: string[] = [];
  for (const entity of solids) {
    if (entity.type !== "solid3d") {
      lines.push(
        `${entity.type.toUpperCase()} ${entity.id}: todavía no hay kernel que lo mida; MASSPROP no inventa un número.`,
      );
      continue;
    }
    try {
      const comparison = solid3dMassComparison(entity);
      lines.push(
        `SOLID3D ${entity.name ?? entity.id}: volumen ${comparison.byFaces.volume} ` +
          `(malla ${comparison.byMesh.volume}, deriva ${comparison.volumeDrift.toExponential(2)}), ` +
          `área ${comparison.byFaces.area}, centroide ` +
          `(${comparison.byMesh.centroid.x}, ${comparison.byMesh.centroid.y}, ${comparison.byMesh.centroid.z})`,
      );
    } catch (error) {
      // Un árbol de construcción roto se cuenta, no se traga: el sólido existe
      // en el documento y el usuario merece saber por qué no se puede medir.
      lines.push(
        `SOLID3D ${entity.id}: no se pudo evaluar — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return lines;
}

function massPropResult(
  state: MassPropState,
  targets: readonly string[],
  context: CadCommandContext,
): CadCommandStep<MassPropState> {
  const entities = resolve(context, targets);
  if (entities.length === 0)
    return report(state, "MASSPROP: no hay ningún objeto designado.");

  // Reparto por tipo designado. Los sólidos los mide el kernel B-rep; el resto
  // sigue el camino de contornos 2D de siempre. Una designación mixta responde
  // las dos cosas en vez de obligar a designar dos veces.
  const solids = entities.filter((entity) => SOLID_TYPES.has(entity.type));
  const planar = entities.filter((entity) => !SOLID_TYPES.has(entity.type));
  const solidLines = solidMassLines(solids);
  if (planar.length === 0) return report(state, solidLines.join("\n"));

  const contours: CadContour[] = [];
  const skipped: string[] = [];
  for (const entity of planar) {
    const closed = cadEntityContours(entity).filter(
      (contour) => contour.closed && contour.points.length >= 3,
    );
    if (closed.length === 0) skipped.push(entity.type.toUpperCase());
    else contours.push(...closed);
  }

  if (contours.length === 0)
    return report(
      state,
      [
        ...solidLines,
        "MASSPROP sólo mide regiones: contornos CERRADOS. Nada de lo designado lo es " +
          `(${[...new Set(skipped)].join(", ") || "sin contorno"}). Use REGION para crear una.`,
      ].join("\n"),
    );

  const properties = cadMassProperties(contours);
  if (!properties)
    return report(
      state,
      [...solidLines, "MASSPROP: los contornos designados encierran un área nula."].join("\n"),
    );

  const lens = cadInquiryLens(context.variables);
  const lines = [...solidLines, ...formatCadMassProperties(properties, lens.format)];
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
