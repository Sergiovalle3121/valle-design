/**
 * QDIM y TEXTALIGN: la productividad diaria que faltaba junto a AUDIT/RECOVER.
 *
 * ## QDIM — acotación rápida
 *
 * AutoCAD real ofrece cuatro modos (Continua, Escalonada, Línea base,
 * Ordenada). Esta versión sólo hace CONTINUA: una cadena de cotas lineales
 * consecutivas sobre el eje dominante de la selección, alineadas en la MISMA
 * línea de cota. Es la mitad que ahorra el gesto repetido de acotar tramo a
 * tramo; escalonada/base/ordenada quedan «todavía no», dichas aquí y no en
 * silencio.
 *
 * Reutiliza `dimension-support.ts` para los extremos acotables y para
 * construir la entidad — el mismo camino que DIMLINEAR/DIMCONTINUE, no una
 * segunda fábrica de cotas.
 *
 * ## TEXTALIGN — alinear texto existente
 *
 * Proyecta cada texto/mtext designado sobre la recta que definen dos puntos,
 * conservando su posición RELATIVA a lo largo de ella, y les da a todos el
 * ángulo de esa recta. No reordena ni redistribuye espaciado: eso es DDPTYPE u
 * otra orden; TEXTALIGN sólo endereza.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";
import { cadDimensionEnds, cadDimensionEntity, cadLinearOffset, type CadDimensionPick } from "./dimension-support";
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

function readEntities(context: CadCommandContext, ids: readonly string[]): CadEntity[] {
  return ids.map((id) => context.entity?.(id)).filter((entity): entity is CadEntity => !!entity);
}

// ---------------------------------------------------------------------------
// QDIM
// ---------------------------------------------------------------------------

interface QdimState {
  targets: string[];
}

const QDIM_PICK_PROMPT = { message: "Designe los objetos a acotar juntos", options: [] } as const;
const QDIM_TOLERANCE = 1e-6;

function qdimAsking(state: QdimState): CadCommandStep<QdimState> {
  return { state, prompt: QDIM_PICK_PROMPT, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
}

/** Todos los extremos acotables de la selección, con su anclaje si lo hay. */
function collectPicks(entities: readonly CadEntity[]): CadDimensionPick[] {
  const picks: CadDimensionPick[] = [];
  for (const entity of entities) {
    const ends = cadDimensionEnds(entity);
    if (ends) picks.push(...ends);
  }
  return picks;
}

/** Eje con MÁS dispersión entre los puntos recogidos: ahí va la cadena. */
function dominantAxis(picks: readonly CadDimensionPick[]): "x" | "y" {
  const xs = picks.map((pick) => pick.point.x);
  const ys = picks.map((pick) => pick.point.y);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  return spreadX >= spreadY ? "x" : "y";
}

/** Una posición por valor distinto del eje elegido, en el orden en que aparecen. */
function dedupeAlongAxis(picks: readonly CadDimensionPick[], axis: "x" | "y"): CadDimensionPick[] {
  const value = (pick: CadDimensionPick) => (axis === "x" ? pick.point.x : pick.point.y);
  const kept: CadDimensionPick[] = [];
  for (const pick of picks) {
    if (kept.some((seen) => Math.abs(value(seen) - value(pick)) <= QDIM_TOLERANCE)) continue;
    kept.push(pick);
  }
  return kept.sort((a, b) => value(a) - value(b));
}

const qdimCommand: CadCommandDescriptor<QdimState | { picks: CadDimensionPick[]; axis: "x" | "y" }> = {
  name: "QDIM",
  aliases: ["QD"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => qdimAsking({ targets: [...context.selection] }),
  step: (state, input, context) => {
    if ("picks" in state) {
      // Segunda fase: ya se eligieron los objetos, falta el punto de la línea de cota.
      if (input.kind === "cancel") return cadCommandCancelled(state);
      if (input.kind !== "point") return { state, prompt: { message: "Precise dónde va la línea de cota", options: [] }, accepts: CAD_ACCEPT_POINT };
      const { picks, axis } = state;
      const offset = cadLinearOffset(picks[0].point, picks[picks.length - 1].point, axis, input.point);
      const commands: CadEntityCommand[] = [];
      for (let index = 0; index < picks.length - 1; index += 1) {
        const a = picks[index];
        const b = picks[index + 1];
        const entity = cadDimensionEntity(
          { kind: "linear", a: a.point, b: b.point, axis, offset, references: [a.reference, b.reference] },
          context,
        );
        commands.push({ type: "insert", entity });
      }
      return cadCommandWrites(state, commands, `QDIM (${commands.length} cota(s))`);
    }

    // Primera fase: acumular objetos.
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick")
      return qdimAsking({ targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection")
      return qdimAsking({ targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return qdimAsking(state);

    if (state.targets.length === 0) return cadCommandRefused(state, "QDIM no tiene ningún objeto designado; no se hizo nada.");
    const picks = collectPicks(readEntities(context, state.targets));
    if (picks.length === 0)
      return cadCommandRefused(state, "Ninguno de los objetos designados tiene extremos acotables; no se hizo nada.");
    const axis = dominantAxis(picks);
    const deduped = dedupeAlongAxis(picks, axis);
    if (deduped.length < 2)
      return cadCommandRefused(
        state,
        `Los objetos designados no tienen dos posiciones distintas sobre el eje ${axis.toUpperCase()}; no se hizo nada.`,
      );
    return {
      state: { picks: deduped, axis },
      prompt: { message: "Precise dónde va la línea de cota", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  },
};

// ---------------------------------------------------------------------------
// TEXTALIGN
// ---------------------------------------------------------------------------

interface TextAlignSelecting {
  phase: "selecting";
  targets: string[];
}
interface TextAlignPoint {
  phase: "point";
  entities: CadEntity[];
  first?: CadPoint2;
}
type TextAlignState = TextAlignSelecting | TextAlignPoint;

const TEXTALIGN_PICK_PROMPT = { message: "Designe el texto a alinear", options: [] } as const;

function textAlignAsking(state: TextAlignSelecting): CadCommandStep<TextAlignState> {
  return { state, prompt: TEXTALIGN_PICK_PROMPT, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
}

function isAlignable(entity: CadEntity): entity is Extract<CadEntity, { type: "text" | "mtext" }> {
  return entity.type === "text" || entity.type === "mtext";
}

function positionOf(entity: Extract<CadEntity, { type: "text" | "mtext" }>): CadPoint2 {
  return entity.type === "text" ? { x: entity.x, y: entity.y } : { x: entity.insertion.x, y: entity.insertion.y };
}

function withPosition(
  entity: Extract<CadEntity, { type: "text" | "mtext" }>,
  point: CadPoint2,
  rotationDegrees: number,
): CadNativeEntity {
  if (entity.type === "text") return { ...entity, x: point.x, y: point.y, rotation: rotationDegrees } as CadNativeEntity;
  return { ...entity, insertion: { ...entity.insertion, x: point.x, y: point.y }, rotation: rotationDegrees } as CadNativeEntity;
}

const textAlignCommand: CadCommandDescriptor<TextAlignState> = {
  name: "TEXTALIGN",
  aliases: ["TA"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => textAlignAsking({ phase: "selecting", targets: [...context.selection] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (state.phase === "selecting") {
      if (input.kind === "entityPick")
        return textAlignAsking({ phase: "selecting", targets: [...new Set([...state.targets, input.entityId])] });
      if (input.kind === "selection")
        return textAlignAsking({ phase: "selecting", targets: [...new Set([...state.targets, ...input.entityIds])] });
      if (input.kind !== "enter") return textAlignAsking(state);

      const entities = readEntities(context, state.targets).filter(isAlignable);
      if (entities.length === 0)
        return cadCommandRefused(state, "La selección no tiene ningún texto que alinear; no se hizo nada.");
      return {
        state: { phase: "point", entities },
        prompt: { message: "Primer punto de la línea de alineación", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (input.kind !== "point")
      return { state, prompt: { message: state.first ? "Segundo punto de la línea de alineación" : "Primer punto de la línea de alineación", options: [] }, accepts: CAD_ACCEPT_POINT };
    if (!state.first) return { state: { ...state, first: input.point }, prompt: { message: "Segundo punto de la línea de alineación", options: [] }, accepts: CAD_ACCEPT_POINT };

    const p1 = state.first;
    const p2 = input.point;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!(lengthSquared > 1e-12))
      return cadCommandRefused(state, "Los dos puntos de la línea de alineación coinciden; no se hizo nada.");
    const rotationDegrees = (Math.atan2(dy, dx) * 180) / Math.PI;

    const commands: CadEntityCommand[] = state.entities.map((entity) => {
      const alignable = entity as Extract<CadEntity, { type: "text" | "mtext" }>;
      const position = positionOf(alignable);
      const t = ((position.x - p1.x) * dx + (position.y - p1.y) * dy) / lengthSquared;
      const projected = { x: p1.x + t * dx, y: p1.y + t * dy };
      return { type: "replace", entityId: entity.id, entity: withPosition(alignable, projected, rotationDegrees) };
    });
    return cadCommandWrites(state, commands, `TEXTALIGN (${commands.length} texto(s))`);
  },
};

export const CAD_ANNOTATE_QUICK_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(qdimCommand),
  asCadCommand(textAlignCommand),
];
