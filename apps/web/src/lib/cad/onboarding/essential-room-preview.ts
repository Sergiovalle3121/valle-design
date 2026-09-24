import type { CadDocument } from "../cad-document";
import { buildCadBimSchedule } from "../bim-schedule";
import { cadPointInBoundary } from "../hatch-associativity";
import { cadRoomAreaLabels } from "./room-area-labels";

type RoomPreviewExclusions = { textIds: ReadonlySet<string>; assetLabelIds: ReadonlySet<string> };
const previewCache = new WeakMap<CadDocument, RoomPreviewExclusions>();

/** Sólo presentación: las entidades originales siguen intactas para Pro y exportación. */
function roomPreviewExclusions(document: CadDocument): RoomPreviewExclusions {
  const cached = previewCache.get(document);
  if (cached) return cached;
  const schedule = buildCadBimSchedule(document, document.meta.unit);
  const labels = cadRoomAreaLabels(document, schedule);
  const visibleRoomIds = new Set(labels.map((room) => room.id));
  const rooms = schedule.rooms.filter((room) => visibleRoomIds.has(room.id));
  const result: RoomPreviewExclusions = {
    textIds: new Set(labels.flatMap((room) => room.textLabelId ? [room.textLabelId] : [])),
    assetLabelIds: new Set(document.entities.flatMap((entity) => {
      if (entity.type !== "box" || entity.kind !== "room" || !entity.label?.trim()) return [];
      const center = { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
      return rooms.some((room) => cadPointInBoundary(center, room.ring)) ? [entity.id] : [];
    })),
  };
  previewCache.set(document, result);
  return result;
}

export function cadEssentialRoomLabelIds(document: CadDocument): ReadonlySet<string> {
  return roomPreviewExclusions(document).textIds;
}

export function cadEssentialRoomAssetLabelIds(document: CadDocument): ReadonlySet<string> {
  return roomPreviewExclusions(document).assetLabelIds;
}
