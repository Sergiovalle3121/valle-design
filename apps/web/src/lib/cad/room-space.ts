import type { CadDocument, CadEntity, CadPoint2 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import { cadPointInBoundary } from "./hatch-associativity";

type RoomBox = Extract<CadEntity, { type: "box" }>;

/** A box with no footprint is a persisted room identity, never a room boundary. */
export function isCadRoomSpaceAnchor(entity: CadEntity): boolean {
  return entity.type === "box" && entity.kind === "room" && entity.w === 0 && entity.h === 0 &&
    entity.context?.metadata?.roomSpaceAnchor === true;
}

export function cadRoomSpaceAnchor(id: string, label: string, at: CadPoint2, layer = "0"): RoomBox {
  return {
    id, type: "box", kind: "room", x: at.x, y: at.y, w: 0, h: 0,
    rotation: 0, layer, shape: "rect", label,
    context: { metadata: { roomSpaceAnchor: true } },
  };
}

/** Existing template rooms use the very same box.label, but their rectangles do not define wall area. */
export function cadRoomSpaceInside(ring: readonly CadPoint2[], entities: readonly CadEntity[]): RoomBox | null {
  const candidates = entities.filter((entity): entity is RoomBox => {
    if (entity.type !== "box" || entity.kind !== "room" || !entity.label?.trim()) return false;
    if (!isCadRoomSpaceAnchor(entity) && entity.tags?.some((tag) =>
      ["shell", "gross-area", "building", "pad"].includes(tag.toLowerCase()))) return false;
    return cadPointInBoundary({ x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 }, ring);
  });
  return candidates.sort((left, right) =>
    Number(isCadRoomSpaceAnchor(right)) - Number(isCadRoomSpaceAnchor(left)) ||
    left.w * left.h - right.w * right.h || left.id.localeCompare(right.id))[0] ?? null;
}

export interface CadRoomNameTarget {
  at: CadPoint2;
  spaceId?: string;
  textLabelId?: string;
}

/** One transaction updates the space label and any visible TEXT/MTEXT shadow. */
export function cadRoomNameCommands(
  document: Pick<CadDocument, "entities">,
  room: CadRoomNameTarget,
  rawName: string,
  createId: string,
): CadEntityCommand[] {
  const label = rawName.replace(/\s+/g, " ").trim();
  if (!label || label.length > 80) throw new Error("El nombre del cuarto debe tener entre 1 y 80 caracteres.");
  const commands: CadEntityCommand[] = [{
    type: "room-space-name", entityId: room.spaceId ?? createId, label,
    ...(room.spaceId ? {} : { at: room.at }),
  }];
  const text = document.entities.find((entity) => entity.id === room.textLabelId);
  if (text && (text.type === "text" || text.type === "mtext") && text.text !== label)
    commands.push({ type: "replace", entityId: text.id, entity: { ...text, text: label } });
  return commands;
}
