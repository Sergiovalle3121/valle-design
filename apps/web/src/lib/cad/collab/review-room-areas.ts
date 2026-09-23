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
    return [{
      id: room.id,
      at,
      nameFromDocument: Boolean(room.labelId),
      axisArea: squareMetres(room.axisArea),
      ...(room.clearArea === undefined
        ? {}
        : { clearArea: squareMetres(room.clearArea) }),
    }];
  });
}
