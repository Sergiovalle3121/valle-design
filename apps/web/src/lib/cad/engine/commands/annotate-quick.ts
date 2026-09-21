/**
 * QDIM y TEXTALIGN: la productividad diaria que faltaba junto a AUDIT/RECOVER.
 *
 * ## QDIM — acotación rápida
 *
 * Los seis modos de AutoCAD (Ola 7 completa los cuatro que faltaban):
 *
 *   - **Continua** (por defecto): una cadena de cotas lineales CONSECUTIVAS
 *     sobre el eje dominante de la selección, todas en la MISMA línea de cota.
 *   - **Escalonada**: la misma cadena consecutiva, pero cada tramo se aleja un
 *     escalón MÁS que el anterior — para que el texto no se pise cuando los
 *     puntos están juntos.
 *   - **Base**: cada punto se acota DESDE EL PRIMERO (no del vecino), y cada
 *     cota se separa un escalón más — la misma progresión que DIMBASELINE.
 *   - **Ordenada**: una cota de coordenada por punto (salvo el primero, que
 *     hace de datum), en el eje PERPENDICULAR al que domina la selección — si
 *     los puntos marchan en X, se rotula su Y; y viceversa.
 *   - **Radio** / **Diámetro**: una cota por cada CÍRCULO o ARCO de la
 *     selección — el resto de objetos designados se ignora, con su motivo si
 *     no queda ninguno acotable.
 *
 * El escalón de Escalonada y Base es el mismo DIMDLI (`baselineSpacing`) del
 * estilo vigente que ya usa DIMBASELINE — una sola cifra de norma, no una
 * inventada aquí aparte.
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
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites, cadEntityAnchorCandidates } from "./annotate-support";
import { cadDimensionEnds, cadDimensionEntity, cadLinearOffset, type CadDimensionPick } from "./dimension-support";
import {
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

function readEntities(context: CadCommandContext, ids: readonly string[]): CadEntity[] {
  return ids.map((id) => context.entity?.(id)).filter((entity): entity is CadEntity => !!entity);
}

// ---------------------------------------------------------------------------
// QDIM
// ---------------------------------------------------------------------------

type QdimLinearMode = "continuous" | "staggered" | "baseline";
type QdimMode = QdimLinearMode | "ordinate" | "radius" | "diameter";

const QDIM_MODE_DEFAULT: QdimMode = "continuous";
const QDIM_MODE_OPTIONS = [
  { keyword: "Continua", shortcut: "C" },
  { keyword: "Escalonada", shortcut: "E" },
  { keyword: "Base", shortcut: "B" },
  { keyword: "Ordenada", shortcut: "O" },
  { keyword: "Radio", shortcut: "R" },
  { keyword: "Diametro", shortcut: "D" },
] as const;
const QDIM_MODE_BY_KEYWORD: Readonly<Record<string, QdimMode>> = {
  Continua: "continuous",
  Escalonada: "staggered",
  Base: "baseline",
  Ordenada: "ordinate",
  Radio: "radius",
  Diametro: "diameter",
};
const QDIM_MODE_LABEL: Readonly<Record<QdimMode, string>> = {
  continuous: "Continua",
  staggered: "Escalonada",
  baseline: "Base",
  ordinate: "Ordenada",
  radius: "Radio",
  diameter: "Diámetro",
};

interface QdimSelecting {
  phase: "select";
  targets: string[];
  mode: QdimMode;
}
interface QdimLinearPlacing {
  phase: "linear";
  mode: QdimLinearMode;
  picks: CadDimensionPick[];
  axis: "x" | "y";
}
interface QdimOrdinatePlacing {
  phase: "ordinate";
  /** `picks[0]` es el datum; el resto son los puntos a rotular. */
  picks: CadDimensionPick[];
  /** Eje que se ROTULA — el PERPENDICULAR al que domina la selección. */
  axis: "x" | "y";
}
interface QdimRadialPlacing {
  phase: "radial";
  mode: "radius" | "diameter";
  entityIds: string[];
}
type QdimState = QdimSelecting | QdimLinearPlacing | QdimOrdinatePlacing | QdimRadialPlacing;

const QDIM_TOLERANCE = 1e-6;
const QDIM_DEFAULT_ARROW_SIZE = 180;

function qdimSelectPrompt(state: QdimSelecting): CadCommandStep<QdimState> {
  return {
    state,
    prompt: {
      message: `Designe los objetos a acotar juntos (modo: ${QDIM_MODE_LABEL[state.mode]})`,
      options: QDIM_MODE_OPTIONS,
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
  };
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

const perpendicularAxis = (axis: "x" | "y"): "x" | "y" => (axis === "x" ? "y" : "x");

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

/**
 * El escalón de Escalonada y Base: el MISMO DIMDLI (`baselineSpacing`) que ya
 * usa DIMBASELINE (`annotate-dimension-chains.ts`), leído del estilo vigente
 * (DIMSTYLE) en vez de inventar una cifra propia. Sin estilo con nombre, o sin
 * `baselineSpacing` declarado, el respaldo es el mismo de fábrica: dos veces
 * el tamaño de flecha por defecto.
 */
function qdimStaggerStep(context: CadCommandContext): number {
  const styleName = context.variables?.get("DIMSTYLE");
  if (typeof styleName === "string" && styleName && context.document) {
    const dimStyle = context.document().styles.dimension[styleName];
    if (dimStyle?.baselineSpacing) return dimStyle.baselineSpacing;
  }
  return QDIM_DEFAULT_ARROW_SIZE * 2;
}

function qdimIsRadial(entity: CadEntity): entity is Extract<CadEntity, { type: "circle" | "arc" }> {
  return (entity.type === "circle" || entity.type === "arc") && entity.radius > QDIM_TOLERANCE;
}

const qdimCommand: CadCommandDescriptor<QdimState> = {
  name: "QDIM",
  aliases: ["QD"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => qdimSelectPrompt({ phase: "select", targets: [...context.selection], mode: QDIM_MODE_DEFAULT }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    // ── Fase 2a: cotas lineales (Continua / Escalonada / Base) ──────────────
    if (state.phase === "linear") {
      if (input.kind !== "point")
        return { state, prompt: { message: "Precise dónde va la línea de cota", options: [] }, accepts: CAD_ACCEPT_POINT };
      const { picks, axis, mode } = state;
      const offset = cadLinearOffset(picks[0].point, picks[picks.length - 1].point, axis, input.point);
      const direction = offset >= 0 ? 1 : -1;
      const step = mode === "continuous" ? 0 : qdimStaggerStep(context);
      const commands: CadEntityCommand[] = [];
      if (mode === "baseline") {
        // Todas DESDE EL PRIMER punto, cada una un escalón más lejos — la
        // misma progresión que DIMBASELINE (T14).
        for (let index = 1; index < picks.length; index += 1) {
          const a = picks[0];
          const b = picks[index];
          const entity = cadDimensionEntity(
            { kind: "linear", a: a.point, b: b.point, axis, offset: offset + direction * step * index, references: [a.reference, b.reference] },
            context,
          );
          commands.push({ type: "insert", entity });
        }
      } else {
        // Continua y Escalonada: tramo a tramo entre vecinos consecutivos.
        for (let index = 0; index < picks.length - 1; index += 1) {
          const a = picks[index];
          const b = picks[index + 1];
          const entity = cadDimensionEntity(
            { kind: "linear", a: a.point, b: b.point, axis, offset: offset + direction * step * index, references: [a.reference, b.reference] },
            context,
          );
          commands.push({ type: "insert", entity });
        }
      }
      return cadCommandWrites(state, commands, `QDIM ${QDIM_MODE_LABEL[mode]} (${commands.length} cota(s))`);
    }

    // ── Fase 2b: Ordenada ────────────────────────────────────────────────────
    if (state.phase === "ordinate") {
      if (input.kind !== "point")
        return { state, prompt: { message: "Precise dónde va el codo de las cotas de coordenada", options: [] }, accepts: CAD_ACCEPT_POINT };
      const { picks, axis } = state;
      const datum = picks[0];
      const commands: CadEntityCommand[] = [];
      for (let index = 1; index < picks.length; index += 1) {
        const target = picks[index];
        const offset = axis === "x" ? input.point.y - target.point.y : input.point.x - target.point.x;
        const entity = cadDimensionEntity(
          { kind: "ordinate", a: datum.point, b: target.point, axis, offset, references: [datum.reference, target.reference] },
          context,
        );
        commands.push({ type: "insert", entity });
      }
      return cadCommandWrites(state, commands, `QDIM Ordenada (${commands.length} cota(s))`);
    }

    // ── Fase 2c: Radio / Diámetro ────────────────────────────────────────────
    if (state.phase === "radial") {
      if (input.kind !== "point")
        return { state, prompt: { message: "Precise hacia dónde sale la flecha", options: [] }, accepts: CAD_ACCEPT_POINT };
      const commands: CadEntityCommand[] = [];
      for (const entityId of state.entityIds) {
        const entity = context.entity?.(entityId);
        if (!entity || !qdimIsRadial(entity)) continue;
        const candidates = cadEntityAnchorCandidates(entity);
        const center = candidates.find((candidate) => candidate.anchor === "center");
        const edges = candidates.filter((candidate) => candidate.anchor === "arc-start" || candidate.anchor === "arc-end");
        if (!center || edges.length === 0) continue;
        const edge = edges.reduce((best, candidate) =>
          Math.hypot(candidate.point.x - input.point.x, candidate.point.y - input.point.y) <
          Math.hypot(best.point.x - input.point.x, best.point.y - input.point.y)
            ? candidate
            : best,
        );
        commands.push({
          type: "insert",
          entity: cadDimensionEntity(
            {
              kind: state.mode,
              a: center.point,
              b: edge.point,
              radius: entity.radius,
              references: [
                { entityId, anchor: "center" },
                { entityId, anchor: edge.anchor },
              ],
            },
            context,
          ),
        });
      }
      return cadCommandWrites(state, commands, `QDIM ${QDIM_MODE_LABEL[state.mode]} (${commands.length} cota(s))`);
    }

    // ── Fase 1: acumular objetos y elegir el modo ────────────────────────────
    if (input.kind === "keyword") {
      const mode = QDIM_MODE_BY_KEYWORD[input.keyword];
      return mode ? qdimSelectPrompt({ ...state, mode }) : qdimSelectPrompt(state);
    }
    if (input.kind === "entityPick")
      return qdimSelectPrompt({ ...state, targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection")
      return qdimSelectPrompt({ ...state, targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return qdimSelectPrompt(state);

    if (state.targets.length === 0) return cadCommandRefused(state, "QDIM no tiene ningún objeto designado; no se hizo nada.");
    const entities = readEntities(context, state.targets);

    if (state.mode === "radius" || state.mode === "diameter") {
      const entityIds = entities.filter(qdimIsRadial).map((entity) => entity.id);
      if (entityIds.length === 0)
        return cadCommandRefused(
          state,
          `QDIM ${QDIM_MODE_LABEL[state.mode]} necesita un círculo o arco en la designación; no se hizo nada.`,
        );
      return {
        state: { phase: "radial", mode: state.mode, entityIds },
        prompt: { message: "Precise hacia dónde sale la flecha", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    const picks = collectPicks(entities);
    if (picks.length === 0)
      return cadCommandRefused(state, "Ninguno de los objetos designados tiene extremos acotables; no se hizo nada.");
    const axis = dominantAxis(picks);
    const deduped = dedupeAlongAxis(picks, axis);
    if (deduped.length < 2)
      return cadCommandRefused(
        state,
        `Los objetos designados no tienen dos posiciones distintas sobre el eje ${axis.toUpperCase()}; no se hizo nada.`,
      );
    if (state.mode === "ordinate")
      return {
        state: { phase: "ordinate", picks: deduped, axis: perpendicularAxis(axis) },
        prompt: { message: "Precise dónde va el codo de las cotas de coordenada", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    return {
      state: { phase: "linear", mode: state.mode, picks: deduped, axis },
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
