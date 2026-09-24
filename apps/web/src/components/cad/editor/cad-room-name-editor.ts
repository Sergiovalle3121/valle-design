import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import { cadRoomNameCommands } from "@/lib/cad/room-space";
import type { CadRoomAreaLabel } from "@/lib/cad/onboarding/room-area-labels";

/** Bridges an export-neutral room name to the editor's canonical transaction. */
export function renameCadRoomSpace(
  room: CadRoomAreaLabel,
  name: string,
  snapshotDocument: () => CadDocument,
  commitCommands: (commands: CadEntityCommand[]) => boolean,
  createId: (prefix: string) => string,
): boolean {
  return commitCommands(cadRoomNameCommands(snapshotDocument(), room, name, createId("room")));
}
