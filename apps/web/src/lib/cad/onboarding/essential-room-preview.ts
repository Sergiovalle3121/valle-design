import type { CadDocument } from "../cad-document";
import { cadRoomAreaLabels } from "./room-area-labels";

/** Sólo presentación: los TEXT originales siguen en CadDocument y en exportación. */
export function cadEssentialRoomLabelIds(document: CadDocument): ReadonlySet<string> {
  return new Set(cadRoomAreaLabels(document).flatMap((room) => room.labelId ? [room.labelId] : []));
}
