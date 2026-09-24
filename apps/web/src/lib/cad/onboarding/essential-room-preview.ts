import type { CadDocument } from "../cad-document";
import { buildCadBimSchedule } from "../bim-schedule";
import { cadPointInBoundary } from "../hatch-associativity";
import { isCadRoomSpaceAnchor } from "../room-space";
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
  const entities = new Map(document.entities.map((entity) => [entity.id, entity]));
  const result: RoomPreviewExclusions = {
    textIds: new Set(labels.flatMap((room) => {
      if (!room.textLabelId) return [];
      if (room.textLabelMatchesName) return [room.textLabelId];
      const anchor = room.spaceId ? entities.get(room.spaceId) : null;
      if (!anchor || !isCadRoomSpaceAnchor(anchor)) return [];
      const original = entities.get(room.textLabelId);
      const storedId = anchor.context?.metadata?.roomNameSourceTextId;
      const storedText = anchor.context?.metadata?.roomNameSourceText;
      return storedId === original?.id && (original?.type === "text" || original?.type === "mtext") &&
        original.text.replace(/\s+/g, " ").trim() === storedText ? [original.id] : [];
    })),
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
