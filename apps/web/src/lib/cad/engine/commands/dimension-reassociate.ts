/**
 * DIMDISASSOCIATE y DIMREASSOCIATE (Ola 7, 2026-09-20).
 *
 * `associative-dimension.ts` ya sabía RECALCULAR una cota asociativa y
 * DECLARARLA huérfana (`associationStatus: 'broken'`) cuando su geometría
 * desaparecía o se movía fuera del mismo lote — `regenerateAssociativeDimensions`
 * corre en cada lote de `entity-commands.ts`. Lo que faltaba era el VERBO: no
 * había ORDEN para desasociar una cota a propósito ni para volver a engancharla
 * después de perder su referencia. El tipo `dimension-association` ya existía
 * en `entity-commands.ts` — nadie lo emitía.
 *
 * ## DIMDISASSOCIATE
 *
 * Designa cotas y les quita la asociatividad: sus puntos de definición quedan
 * fijos donde están, y ya no persiguen a la geometría que los originó. Se
 * niega, con el motivo, si ninguna de las designadas era asociativa — quitar
 * algo que no está puesto no es una operación, es un silencio con forma de
 * éxito.
 *
 * ## DIMREASSOCIATE
 *
 * Recorre las cotas designadas —o, sin designación, TODAS las que no están
 * `'associated'` (huérfanas o nunca asociadas), que es lo mismo que ofrece
 * AutoCAD cuando se pulsa Intro sin señalar nada— y para cada una pide, PUNTO A
 * PUNTO, un nuevo anclaje: Intro conserva el punto actual tal cual estaba (con
 * su referencia si la tenía, rota si estaba rota — DIMREASSOCIATE no inventa un
 * arreglo que el usuario no pidió). Al cerrar la última cota, UN solo lote
 * escribe las que quedaron con los N anclajes que su tipo necesita como
 * `associated`, y dice cuántas se reasociaron y cuántas siguen huérfanas: la
 * cuenta la hace el motor, no una promesa.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadDimensionEntity } from "../../associative-dimension";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadCommandCancelled,
  cadCommandRefused,
  cadCommandWrites,
  type CadAssociationReference,
} from "./annotate-support";
import {
  cadDimensionPick,
  cadDimensionReferenceCount,
  type CadDimensionKind,
  type CadDimensionPick,
} from "./dimension-support";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function dimensionsAmong(ids: readonly string[], context: CadCommandContext): CadDimensionEntity[] {
  const found: CadDimensionEntity[] = [];
  for (const id of ids) {
    const entity = context.entity?.(id);
    if (entity?.type === "dimension") found.push(entity as CadDimensionEntity);
  }
  return found;
}

// ---------------------------------------------------------------------------
// DIMDISASSOCIATE
// ---------------------------------------------------------------------------

interface DisassocState {
  targets: string[];
}

const DISASSOC_PROMPT = { message: "Designe las cotas a desasociar", options: [] } as const;

const dimDisassociateCommand: CadCommandDescriptor<DisassocState> = {
  name: "DIMDISASSOCIATE",
  aliases: ["DIMDISASOC"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => ({
    state: { targets: [...context.selection] },
    prompt: DISASSOC_PROMPT,
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick")
      return { state: { targets: [...new Set([...state.targets, input.entityId])] }, prompt: DISASSOC_PROMPT, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    if (input.kind === "selection")
      return { state: { targets: [...new Set([...state.targets, ...input.entityIds])] }, prompt: DISASSOC_PROMPT, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    if (input.kind !== "enter") return { state, prompt: DISASSOC_PROMPT, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

    if (state.targets.length === 0)
      return cadCommandRefused(state, "DIMDISASSOCIATE no tiene ninguna cota designada; no se hizo nada.");
    const dimensions = dimensionsAmong(state.targets, context);
    const associative = dimensions.filter((dimension) => dimension.associative === true);
    if (associative.length === 0)
      return cadCommandRefused(
        state,
        dimensions.length === 0
          ? "La designación no contiene cotas: DIMDISASSOCIATE sólo toca cotas."
          : "Ninguna de las cotas designadas es asociativa: no hay nada que desasociar.",
      );
    const commands: CadEntityCommand[] = associative.map((dimension) => ({
      type: "dimension-association" as const,
      entityId: dimension.id,
      associative: false,
    }));
    return cadCommandWrites(state, commands, `DIMDISASSOCIATE (${commands.length} cota(s))`);
  },
};

// ---------------------------------------------------------------------------
// DIMREASSOCIATE
// ---------------------------------------------------------------------------

interface ReassocDimension {
  entity: CadDimensionEntity;
  kind: CadDimensionKind;
  needed: number;
}

interface ReassocState {
  /** Cotas por recorrer, la que se está editando primero. */
  pending: ReassocDimension[];
  /** Puntos ya resueltos de la cota ACTUAL, en orden (`a`, `b`, `c`). */
  collected: CadDimensionPick[];
  /** Lotes ya cerrados de cotas anteriores en este mismo recorrido. */
  commands: CadEntityCommand[];
  reassociated: number;
  stillBroken: number;
}

function reassocPointPrompt(state: ReassocState): CadCommandStep<ReassocState> {
  const current = state.pending[0];
  const index = state.collected.length;
  return {
    state,
    prompt: {
      message: `Cota ${current.entity.id}: designe el punto de definición ${index + 1} de ${current.needed} (Intro conserva el actual)`,
      options: [],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
  };
}

function reassocAsking(state: ReassocState): CadCommandStep<ReassocState> {
  if (state.pending.length === 0) {
    const commands = state.commands;
    if (commands.length === 0) return cadCommandRefused(state, "DIMREASSOCIATE no cambió ningún punto de definición; no se hizo nada.");
    return cadCommandWrites(
      state,
      commands,
      `DIMREASSOCIATE: ${state.reassociated} cota(s) reasociada(s)` +
        (state.stillBroken > 0 ? `, ${state.stillBroken} siguen huérfana(s)` : ""),
    );
  }
  return reassocPointPrompt(state);
}

/** El punto ACTUAL de la cota en el índice `i` (0=`a`, 1=`b`, 2=`c`), con su referencia si la tenía. */
function currentPointOf(entity: CadDimensionEntity, index: number): CadDimensionPick {
  const point: CadPoint2 | undefined = index === 0 ? entity.a : index === 1 ? entity.b : entity.c;
  const reference: CadAssociationReference | undefined = entity.references?.[index];
  return { point: point ?? { x: 0, y: 0 }, reference };
}

/** Cierra la cota ACTUAL con los puntos recogidos: un `replace` con sus N anclajes. */
function finishDimension(state: ReassocState): ReassocState {
  const current = state.pending[0];
  const rest = state.pending.slice(1);
  const points = state.collected;
  const references = points.map((pick) => pick.reference);
  const associated = references.length === current.needed && references.every(Boolean);
  const next: CadDimensionEntity = {
    ...current.entity,
    a: points[0]!.point,
    b: points[1]!.point,
    ...(points[2] ? { c: points[2].point } : {}),
    ...(current.kind === "radius" || current.kind === "diameter" || current.kind === "arc-length"
      ? { radius: Math.hypot(points[1]!.point.x - points[0]!.point.x, points[1]!.point.y - points[0]!.point.y) }
      : {}),
    associative: associated,
    associationStatus: associated ? "associated" : "broken",
    ...(associated ? { references: references.map((reference) => ({ ...reference! })) } : {}),
  };
  const command: CadEntityCommand = { type: "replace", entityId: current.entity.id, entity: next };
  return {
    pending: rest,
    collected: [],
    commands: [...state.commands, command],
    reassociated: state.reassociated + (associated ? 1 : 0),
    stillBroken: state.stillBroken + (associated ? 0 : 1),
  };
}

const dimReassociateCommand: CadCommandDescriptor<ReassocState | { phase: "select"; targets: string[] }> = {
  name: "DIMREASSOCIATE",
  aliases: ["DIMREASOC"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => ({ state: { phase: "select", targets: [...context.selection] }, prompt: { message: "Designe las cotas a reasociar (Intro: todas las huérfanas)", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if ("phase" in state) {
      if (input.kind === "entityPick")
        return { state: { ...state, targets: [...new Set([...state.targets, input.entityId])] }, prompt: { message: "Designe las cotas a reasociar (Intro: todas las huérfanas)", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
      if (input.kind === "selection")
        return { state: { ...state, targets: [...new Set([...state.targets, ...input.entityIds])] }, prompt: { message: "Designe las cotas a reasociar (Intro: todas las huérfanas)", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
      if (input.kind !== "enter") return { state, prompt: { message: "Designe las cotas a reasociar (Intro: todas las huérfanas)", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

      const explicit = dimensionsAmong(state.targets, context);
      // Sin designación: TODAS las que no están `associated` — huérfanas y
      // las que nunca se asociaron —, igual que AutoCAD con Intro en blanco.
      const dimensions = explicit.length > 0
        ? explicit
        : dimensionsAmong(context.entityIds, context).filter((dimension) => dimension.associationStatus !== "associated");
      if (dimensions.length === 0)
        return cadCommandRefused(
          state,
          state.targets.length > 0
            ? "La designación no contiene cotas: DIMREASSOCIATE sólo toca cotas."
            : "No hay ninguna cota huérfana ni sin asociar en el dibujo; no se hizo nada.",
        );
      const pending: ReassocDimension[] = dimensions.map((entity) => {
        const kind = (entity.dimensionKind ?? "aligned") as CadDimensionKind;
        return { entity, kind, needed: cadDimensionReferenceCount(kind) };
      });
      return reassocAsking({ pending, collected: [], commands: [], reassociated: 0, stillBroken: 0 });
    }

    // Recorrido punto a punto.
    if (input.kind === "enter") {
      const picked = currentPointOf(state.pending[0].entity, state.collected.length);
      const collected = [...state.collected, picked];
      return collected.length === state.pending[0].needed
        ? reassocAsking(finishDimension({ ...state, collected }))
        : reassocAsking({ ...state, collected });
    }
    const picked = cadDimensionPick(input, context);
    if (!picked) return reassocPointPrompt(state);
    const collected = [...state.collected, picked];
    return collected.length === state.pending[0].needed
      ? reassocAsking(finishDimension({ ...state, collected }))
      : reassocAsking({ ...state, collected });
  },
};

export const CAD_DIMENSION_REASSOCIATE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(dimDisassociateCommand),
  asCadCommand(dimReassociateCommand),
];
