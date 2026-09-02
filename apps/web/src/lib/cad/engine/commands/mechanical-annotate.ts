/**
 * BALLOON y BOM: el globo y la lista de materiales (Ola I, 2026-09-02).
 *
 * BALLOON designa la pieza (o precisa el punto de la flecha; o toma la
 * designación previa: con una pieza ya designada, como AMBALLOON, la flecha
 * va a su punto de inserción), precisa el centro del círculo y numera solo:
 * el siguiente al mayor globo del dibujo, salvo que se teclee `Número`. Si lo designado es un INSERT, el globo se
 * queda con el id del bloque: es lo que la lista de materiales usa para dar a
 * cada normalizado la posición de su globo. Cuatro entidades con la misma
 * marca en `context.metadata` (`mechanical-symbols.ts` dice por qué no hay
 * una entidad `balloon`).
 *
 * BOM inserta la lista como TABLE en el punto indicado, con el criterio de
 * `mechanical-bom.ts`; se niega diciéndolo si no hay normalizados ni globos.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import { resolveCadDimensionStyle } from "../../dimension-style";
import { buildCadMechanicalBom, buildCadMechanicalBomTable } from "../../mechanical-bom";
import { CAD_BALLOON_MARK, cadBalloonEntities } from "../../mechanical-symbols";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

const NUMBER_OPTION = { keyword: "Número", shortcut: "N" } as const;
const HEIGHT_OPTION = { keyword: "Altura", shortcut: "A" } as const;
const NO_DOCUMENT_VIEW = "Este espacio de trabajo no expone el documento entero: BOM no puede leer los normalizados aquí.";

/** La altura de texto de los símbolos mecánicos: la del estilo de cota Standard (DIMTXT). */
export function cadMechanicalTextHeight(context: CadCommandContext): number {
  const height = resolveCadDimensionStyle(context.document?.().styles, "Standard").textHeight;
  return height && height > 0 ? height : 120;
}

/** El siguiente número libre de globo: uno más que el mayor del dibujo. */
export function cadNextBalloonNumber(context: CadCommandContext): number {
  let max = 0;
  for (const entityId of context.entityIds) {
    const entity = context.entity?.(entityId);
    if (!entity || entity.type !== "circle") continue;
    const metadata = entity.context?.metadata;
    if (metadata?.mechanical !== CAD_BALLOON_MARK) continue;
    const item = Number(metadata.balloon);
    if (Number.isFinite(item)) max = Math.max(max, item);
  }
  return max + 1;
}

interface BalloonState {
  target: CadPoint2 | null;
  targetId?: string;
  part?: string;
  center: CadPoint2 | null;
  item: number | null;
  height: number | null;
  asking: "number" | "height" | null;
}

function askBalloon(state: BalloonState): CadCommandStep<BalloonState> {
  if (state.asking === "number")
    return { state, prompt: { message: "Precise el número del globo", options: [], defaultValue: String(state.item ?? "") }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.asking === "height")
    return { state, prompt: { message: "Precise la altura del texto", options: [], defaultValue: String(state.height ?? "") }, accepts: CAD_ACCEPT_DISTANCE };
  if (!state.target)
    return {
      state,
      prompt: { message: "Designe la pieza o precise el punto de la flecha", options: [NUMBER_OPTION, HEIGHT_OPTION] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return { state, prompt: { message: "Precise el centro del globo", options: [NUMBER_OPTION, HEIGHT_OPTION] }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD };
}

function finishBalloon(state: BalloonState, center: CadPoint2, context: CadCommandContext): CadCommandStep<BalloonState> {
  const item = state.item ?? cadNextBalloonNumber(context);
  const height = state.height ?? cadMechanicalTextHeight(context);
  const entities = cadBalloonEntities(
    { item, target: state.target!, center, height, layer: context.activeLayer, ...(state.part ? { part: state.part } : {}), ...(state.targetId ? { targetId: state.targetId } : {}) },
    context.newEntityId,
  );
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: entities.map((entity) => ({ type: "insert" as const, entity })),
      label: "BALLOON",
      notice: `BALLOON: globo ${item}${state.part ? ` sobre ${state.part}` : ""} en (${Math.round(center.x)}, ${Math.round(center.y)}).`,
    },
  };
}

/** La pieza de la designación previa, si la hay: la primera inserción, o la primera entidad con un punto. */
function preselectedTarget(context: CadCommandContext): Pick<BalloonState, "target" | "targetId" | "part"> | null {
  const entities = context.selection.map((id) => context.entity?.(id)).filter((entity): entity is CadEntity => !!entity);
  const chosen = entities.find((entity) => entity.type === "insert") ?? entities[0];
  if (!chosen) return null;
  if (chosen.type === "insert") return { target: { x: chosen.insertion.x, y: chosen.insertion.y }, targetId: chosen.id, part: chosen.block };
  const anchor = "start" in chosen ? chosen.start : "center" in chosen ? chosen.center : "vertices" in chosen ? chosen.vertices[0] : "insertion" in chosen ? chosen.insertion : null;
  return anchor ? { target: { x: anchor.x, y: anchor.y }, targetId: chosen.id } : null;
}

const balloonCommand: CadCommandDescriptor<BalloonState> = {
  name: "BALLOON",
  aliases: ["AMBALLOON", "GLOBO"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => askBalloon({ target: null, center: null, item: null, height: null, asking: null, ...(preselectedTarget(context) ?? {}) }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (state.asking) {
      if (input.kind === "enter") return askBalloon({ ...state, asking: null });
      if (input.kind !== "distance") return askBalloon(state);
      if (state.asking === "number") {
        const item = Math.round(input.value);
        if (!(item > 0)) return cadCommandRefused(state, "El número del globo debe ser un entero mayor que cero.");
        return askBalloon({ ...state, item, asking: null });
      }
      if (!(input.value > 0)) return cadCommandRefused(state, "La altura del texto debe ser mayor que cero.");
      return askBalloon({ ...state, height: input.value, asking: null });
    }
    if (input.kind === "keyword") {
      if (input.keyword === NUMBER_OPTION.keyword) return askBalloon({ ...state, asking: "number" });
      if (input.keyword === HEIGHT_OPTION.keyword) return askBalloon({ ...state, asking: "height" });
      return askBalloon(state);
    }
    if (!state.target) {
      if (input.kind === "entityPick") {
        const entity = context.entity?.(input.entityId);
        const part = entity?.type === "insert" ? entity.block : undefined;
        return askBalloon({ ...state, target: input.point, targetId: input.entityId, ...(part ? { part } : {}) });
      }
      if (input.kind === "point") return askBalloon({ ...state, target: input.point });
      if (input.kind === "enter") return cadCommandRefused(state, "BALLOON necesita la pieza o el punto de la flecha.");
      return askBalloon(state);
    }
    if (input.kind === "point") return finishBalloon(state, input.point, context);
    if (input.kind === "enter") return cadCommandRefused(state, "BALLOON necesita el centro del globo.");
    return askBalloon(state);
  },
};

/* ───────────────────────────────── BOM ───────────────────────────────── */

const bomCommand: CadCommandDescriptor<Record<string, never>> = {
  name: "BOM",
  aliases: ["AMBOM", "LISTAMATERIALES"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ({ state: {}, prompt: { message: "Precise el punto de inserción de la lista de materiales", options: [] }, accepts: CAD_ACCEPT_POINT }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "enter") return cadCommandRefused(state, "BOM necesita un punto de inserción.");
    if (input.kind !== "point") return { state, prompt: { message: "Precise el punto de inserción de la lista de materiales", options: [] }, accepts: CAD_ACCEPT_POINT };
    const view = context.document?.();
    if (!view) return cadCommandRefused(state, NO_DOCUMENT_VIEW);
    const bom = buildCadMechanicalBom(view);
    if (bom.rows.length === 0)
      return cadCommandRefused(state, "El dibujo no tiene normalizados (bloques MECH-) ni globos: no hay lista de materiales que insertar.");
    const table = buildCadMechanicalBomTable(bom, input.point, context.activeLayer, context.newEntityId);
    const units = bom.rows.reduce((sum, row) => sum + row.count, 0);
    const written = cadCommandWrites(state, [{ type: "insert", entity: table }], "BOM");
    return {
      ...written,
      result: {
        ...written.result!,
        notice: `BOM: ${bom.rows.length} posición(es), ${units} unidad(es), ${bom.balloons} globo(s) en (${Math.round(input.point.x)}, ${Math.round(input.point.y)}).`,
      },
    };
  },
};

export const CAD_MECHANICAL_ANNOTATE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(balloonCommand), asCadCommand(bomCommand)];
