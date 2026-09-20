/**
 * DIMSPACE — iguala o cierra el espacio entre cotas paralelas ya colocadas.
 *
 * ## El problema que resuelve
 *
 * DIMBASELINE separa cada eslabón un escalón fijo (T14), pero una cota
 * movida a mano, o una cadena montada cota a cota con OFFSETs distintos,
 * termina con huecos desiguales — exactamente lo que un dibujante corrige a
 * ojo, cota por cota, en cualquier plano real. DIMSPACE lo hace de una vez:
 * se designa una cota BASE (no se mueve), las demás cotas del mismo grupo, y
 * una distancia; el resto se recoloca a esa distancia de la base, en el mismo
 * orden relativo que ya tenían.
 *
 * Con distancia 0 el resultado es «Ajustar»: todas coinciden con la línea de
 * cota de la base, es decir, quedan ALINEADAS — el caso degenerado que
 * AutoCAD documenta con ese mismo valor especial.
 *
 * ## Qué mueve, y qué NO
 *
 * Sólo el `offset` de cada cota (no-base). Ni los puntos de definición, ni
 * las asociaciones, ni el tipo: DIMSPACE reordena líneas de cota, no vuelve a
 * medir nada, y por eso el patch pasa por `properties.write` — `offset` es un
 * campo de primera clase del adaptador (`dimension-entity-adapter.ts`), no
 * hace falta `replace`.
 *
 * ## El grupo tiene que ser comparable
 *
 * Todas LINEAL con el MISMO eje, o todas ALINEADA en el MISMO sentido (el
 * producto escalar de sus direcciones, no sólo paralelas: una cota que mide
 * en sentido contrario tiene la normal volteada y «la misma distancia»
 * dejaría de significar lo mismo). Cualquier otra mezcla se rechaza con el
 * motivo — es una decisión explícita, no una limitación descubierta tarde:
 * espaciar cotas de radio o de ángulo no tiene una «línea de cota paralela»
 * de la que hablar.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadDimensionEntity } from "../../associative-dimension";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

function asDimension(entity: CadEntity | undefined): CadDimensionEntity | null {
  return entity?.type === "dimension" ? entity : null;
}

function direction(a: CadPoint2, b: CadPoint2): CadPoint2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? { x: dx / len, y: dy / len } : null;
}

type Group = { kind: "linear"; axis: "x" | "y" } | { kind: "aligned"; normal: CadPoint2; dir: CadPoint2 };

/** Lo que declara el grupo, a partir de la cota BASE. `null` si su tipo no sirve de base. */
function groupOf(base: CadDimensionEntity): Group | null {
  const kind = base.dimensionKind ?? "aligned";
  if (kind === "linear") return { kind: "linear", axis: base.axis ?? "x" };
  if (kind === "aligned") {
    const dir = direction(base.a, base.b);
    return dir ? { kind: "aligned", normal: { x: -dir.y, y: dir.x }, dir } : null;
  }
  return null;
}

/** Por qué una cota NO entra en el grupo de `group`, o `null` si sí entra. */
function incompatibility(dimension: CadDimensionEntity, group: Group): string | null {
  const kind = dimension.dimensionKind ?? "aligned";
  if (group.kind === "linear") {
    if (kind !== "linear") return `es de tipo ${kind}, no lineal`;
    if ((dimension.axis ?? "x") !== group.axis) return `mide en el eje ${dimension.axis ?? "x"}, no ${group.axis}`;
    return null;
  }
  if (kind !== "aligned") return `es de tipo ${kind}, no alineada`;
  const dir = direction(dimension.a, dimension.b);
  if (!dir) return "tiene longitud cero";
  if (dir.x * group.dir.x + dir.y * group.dir.y < 1 - 1e-6) return "mide en sentido contrario o no es paralela a la base";
  return null;
}

/** La posición ABSOLUTA (a lo largo de la normal del grupo) de la línea de cota de hoy. */
function baseline(dimension: CadDimensionEntity, group: Group): number {
  if (group.kind === "linear")
    return group.axis === "x" ? Math.max(dimension.a.y, dimension.b.y) : Math.max(dimension.a.x, dimension.b.x);
  return dimension.a.x * group.normal.x + dimension.a.y * group.normal.y;
}

function coordinate(dimension: CadDimensionEntity, group: Group): number {
  return baseline(dimension, group) + (dimension.offset ?? 0);
}

interface SpaceState {
  mode: "base" | "select" | "value";
  baseId: string | null;
  otherIds: string[];
}

const EMPTY: SpaceState = { mode: "base", baseId: null, otherIds: [] };

function spaceStep(state: SpaceState): CadCommandStep<SpaceState> {
  if (state.mode === "base")
    return {
      state,
      prompt: { message: "Designe la cota BASE (no se moverá)", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (state.mode === "select")
    return {
      state,
      prompt: {
        message: "Designe las cotas a espaciar respecto de la base",
        options: [],
        defaultValue: "Enter para continuar",
      },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: {
      message: "Precise la distancia entre cotas (0 las alinea)",
      options: [],
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

function apply(state: SpaceState, distance: number, context: CadCommandContext): CadCommandStep<SpaceState> {
  if (distance < 0) return cadCommandRefused(state, "La distancia no puede ser negativa.");
  const base = state.baseId ? asDimension(context.entity?.(state.baseId)) : null;
  if (!base) return cadCommandRefused(state, "La cota base ya no existe en el dibujo.");
  const group = groupOf(base);
  if (!group)
    return cadCommandRefused(
      state,
      `DIMSPACE sólo iguala cotas lineales o alineadas; la base es de tipo ${base.dimensionKind ?? "aligned"}.`,
    );

  const entries: { id: string; dimension: CadDimensionEntity; coordinate: number }[] = [
    { id: state.baseId!, dimension: base, coordinate: coordinate(base, group) },
  ];
  for (const id of state.otherIds) {
    const dimension = asDimension(context.entity?.(id));
    if (!dimension) return cadCommandRefused(state, `La cota ${id} ya no existe en el dibujo.`);
    const reason = incompatibility(dimension, group);
    if (reason) return cadCommandRefused(state, `DIMSPACE necesita cotas paralelas a la base: la designada ${reason}.`);
    entries.push({ id, dimension, coordinate: coordinate(dimension, group) });
  }

  const sorted = [...entries].sort((a, b) => a.coordinate - b.coordinate);
  const baseIndex = sorted.findIndex((entry) => entry.id === state.baseId);
  const baseCoordinate = entries[0].coordinate;

  const commands: CadEntityCommand[] = [];
  sorted.forEach((entry, index) => {
    if (entry.id === state.baseId) return; // la base no se mueve
    const target = distance === 0 ? baseCoordinate : baseCoordinate + (index - baseIndex) * distance;
    const newOffset = target - baseline(entry.dimension, group);
    commands.push({ type: "properties", entityId: entry.id, patch: { offset: newOffset } });
  });

  return cadCommandWrites(state, commands, "DIMSPACE");
}

const spaceCommand: CadCommandDescriptor<SpaceState> = {
  name: "DIMSPACE",
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first, ...rest] = context.selection;
    if (first && rest.length > 0) return spaceStep({ mode: "value", baseId: first, otherIds: [...rest] });
    if (first) return spaceStep({ mode: "select", baseId: first, otherIds: [] });
    return spaceStep(EMPTY);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (state.mode === "base") {
      const entityId =
        input.kind === "entityPick" ? input.entityId : input.kind === "selection" ? input.entityIds[0] : null;
      if (!entityId) return input.kind === "enter" ? cadCommandCancelled(state) : spaceStep(state);
      const base = asDimension(context.entity?.(entityId));
      if (!base)
        return cadCommandRefused(
          state,
          `DIMSPACE espacia cotas; ${(context.entity?.(entityId)?.type ?? "ese objeto").toUpperCase()} no lo es.`,
        );
      return spaceStep({ ...state, mode: "select", baseId: entityId });
    }

    if (state.mode === "select") {
      if (input.kind === "entityPick" && input.entityId !== state.baseId)
        return spaceStep({ ...state, otherIds: [...new Set([...state.otherIds, input.entityId])] });
      if (input.kind === "selection")
        return spaceStep({
          ...state,
          otherIds: [...new Set([...state.otherIds, ...input.entityIds.filter((id) => id !== state.baseId)])],
        });
      if (input.kind === "enter")
        return state.otherIds.length > 0 ? spaceStep({ ...state, mode: "value" }) : cadCommandCancelled(state);
      return spaceStep(state);
    }

    // state.mode === "value"
    if (input.kind === "distance") return apply(state, input.value, context);
    return spaceStep(state);
  },
};

export const CAD_DIMENSION_SPACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(spaceCommand)];
