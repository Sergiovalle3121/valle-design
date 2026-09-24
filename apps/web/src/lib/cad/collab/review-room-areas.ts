/** Areas for the guest view, derived only from canonical walls the guest can see. */
import type { CadDocument, CadPoint2 } from "../cad-document";
import { buildCadBimSchedule } from "../bim-schedule";
import { CAD_MM_PER_UNIT } from "../engine/commands/architecture-support";
import { cadPointInBoundary } from "../hatch-associativity";
import { interiorPoint } from "../onboarding/room-area-labels";
import type { CadPlanProjection } from "./plan-projection";

export interface CadReviewRoomArea {
  id: string;
  at: CadPoint2;
  /** A source TEXT/MTEXT already names this room; do not repeat the name. */
  nameFromDocument: boolean;
  axisArea: string;
  clearArea?: string;
  /** Lado menor de la caja del local, en unidades del dibujo: decide si cabe la etiqueta completa. */
  minSpan: number;
  /** Área de la caja del local, en unidades del dibujo²: los grandes se colocan primero. */
  boxArea: number;
}

// An authored number with an area unit already occupies the room on the plan.
// Do not add a second label over it, even if its value differs from the model.
const AUTHORED_AREA = /\d(?:[\d.,\s]*\d)?\s*(?:m²|m2|cm²|cm2|ft²|ft2|in²|in2|u²|u2)(?![\p{L}\p{N}])/iu;

export function cadReviewRoomAreas(
  document: CadDocument,
  projection: CadPlanProjection,
): CadReviewRoomArea[] {
  // A truncated plan cannot honestly display a derived label over missing walls.
  if (projection.truncated) return [];
  // The schedule may use mm internally for an unknown unit. Do not present a
  // measurement to a guest unless the document declares a supported unit.
  const unit = document.meta?.unit?.trim().toLowerCase();
  if (!unit || !Object.hasOwn(CAD_MM_PER_UNIT, unit)) return [];
  const drawnIds = new Set(projection.elements.map((element) =>
    element.kind === "stroke" ? element.stroke.entityId : element.text.entityId));
  const entities = document.entities.filter((entity) => drawnIds.has(entity.id));
  if (!entities.some((entity) => entity.type === "wall")) return [];

  const schedule = buildCadBimSchedule({ entities }, unit);
  const mm = CAD_MM_PER_UNIT[unit];
  const squareMetres = (area: number) => `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((area * mm * mm) / 1_000_000)} m²`;
  const authoredAreas = projection.texts
    .filter((label) => AUTHORED_AREA.test(label.lines.map((line) => line.text).join(" ")))
    .map((label) => label.origin);

  return schedule.rooms.flatMap((room) => {
    if (!(room.axisArea > 0) ||
        authoredAreas.some((point) => cadPointInBoundary(point, room.ring))) return [];
    const at = interiorPoint(room.ring);
    const xs = room.ring.map((point) => point.x);
    const ys = room.ring.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return [{
      id: room.id,
      at,
      nameFromDocument: Boolean(room.labelId),
      minSpan: Math.min(width, height),
      boxArea: width * height,
      axisArea: squareMetres(room.axisArea),
      ...(room.clearArea === undefined
        ? {}
        : { clearArea: squareMetres(room.clearArea) }),
    }];
  });
}

export interface CadReviewRoomAreaPlacement {
  area: CadReviewRoomArea;
  x: number;
  y: number;
  /** Una sola línea con el área a ejes (la misma cifra que el estudio). */
  compact: boolean;
}

/** Por debajo de este lado en pantalla, el local sólo lleva su cifra. */
const FULL_LABEL_MIN_ROOM_PX = 140;
const LINE_PX = 16;
const CHAR_PX = 6.6;
const PAD_PX = 20;

/**
 * DÓNDE VA CADA ETIQUETA DE m² EN EL VISOR DEL INVITADO.
 *
 * En un celular de 390 px una casa de seis locales deja cada cuarto en unos
 * 80 px: las etiquetas de dos líneas («A ejes · …» / «Útil · …») se montaban
 * unas sobre otras y ninguna se leía (medido por el robot estudiante el
 * 2026-09-24). Reglas, en este orden:
 *
 * 1. Los locales grandes se colocan primero.
 * 2. Un local pequeño en pantalla lleva UNA línea: su área a ejes, la misma
 *    cifra que enseña el estudio. El detalle completo sigue en su
 *    `aria-label`.
 * 3. Si aun así chocaría con una etiqueta ya colocada, se omite: una etiqueta
 *    ilegible no informa y tapa a la que sí se lee. Acercar la vista la trae.
 */
export function placeCadReviewRoomAreas(
  areas: readonly CadReviewRoomArea[],
  toScreen: (point: CadPoint2) => { x: number; y: number },
  viewport: { widthPx: number; heightPx: number; pixelsPerUnit: number },
): CadReviewRoomAreaPlacement[] {
  const placed: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const byBoxDescending = [...areas].sort((a, b) => b.boxArea - a.boxArea);
  return byBoxDescending.flatMap((area) => {
    const position = toScreen(area.at);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) ||
        position.x <= 0 || position.y <= 0 ||
        position.x >= viewport.widthPx || position.y >= viewport.heightPx) return [];
    const x = position.x;
    const y = position.y + (area.nameFromDocument ? 28 : 0);
    const roomPx = area.minSpan * viewport.pixelsPerUnit;
    const modes = roomPx >= FULL_LABEL_MIN_ROOM_PX ? [false, true] : [true];
    for (const compact of modes) {
      const lines = compact
        ? [area.axisArea]
        : [
            ...(area.nameFromDocument ? [] : [`Local ${area.id}`]),
            `A ejes · ${area.axisArea}`,
            ...(area.clearArea ? [`Útil · ${area.clearArea}`] : []),
          ];
      const width = Math.max(...lines.map((line) => line.length)) * CHAR_PX + PAD_PX;
      const height = lines.length * LINE_PX + 10;
      const box = { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
      const collides = placed.some((other) =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      if (collides) continue;
      placed.push(box);
      return [{ area, x, y, compact }];
    }
    return [];
  });
}
