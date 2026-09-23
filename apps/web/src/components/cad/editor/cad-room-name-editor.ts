import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import { cadRoomNameCommands } from "@/lib/cad/room-space";
import type { CadRoomAreaLabel } from "@/lib/cad/onboarding/room-area-labels";

/** Bridges a room name to the editor's existing canonical transaction and legacy asset shadow. */
export function renameCadRoomSpace(
  room: CadRoomAreaLabel,
  name: string,
  snapshotDocument: () => CadDocument,
  commitCommands: (commands: CadEntityCommand[]) => boolean,
  createId: (prefix: string) => string,
  legacyAssets: ReadonlyMap<string, { label?: string }>,
  rebuildAssets: () => void,
  refreshSelection: () => void,
): boolean {
  const commands = cadRoomNameCommands(snapshotDocument(), room, name, room.spaceId ?? createId("room"));
  if (!commitCommands(commands)) return false;
  // A template room box is still projected through assetsRef. Keep that shadow
  // in step so the next snapshot cannot overwrite the canonical label.
  const asset = room.spaceId ? legacyAssets.get(room.spaceId) : undefined;
  if (asset) {
    asset.label = name.replace(/\s+/g, " ").trim();
    rebuildAssets();
    refreshSelection();
  }
  return true;
}
