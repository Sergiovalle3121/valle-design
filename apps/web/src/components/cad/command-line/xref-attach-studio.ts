/**
 * Adjuntar una referencia externa desde el ESTUDIO: traer el activo y
 * proyectarlo.
 *
 * Vive fuera del monolito por el presupuesto de líneas y porque no necesita
 * estar dentro: son dos pasos —una descarga y una mutación por el embudo
 * canónico— y ninguno toca THREE ni el lienzo. El panel de referencias externas
 * y `XATTACH` lo usan LOS DOS, que es lo que garantiza que adjuntar por menú y
 * adjuntar por teclado sean la misma cosa y no dos que puedan divergir.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import { attachCadXref, type CadXrefAssetSnapshot } from "@/lib/cad/cad-xrefs";

export interface CadStudioXrefAttachDraft {
  assetId: string;
  revision: string;
  name: string;
  mode: "attachment" | "overlay";
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CadStudioXrefAttachDeps {
  /** Trae el activo del inquilino ya migrado al esquema vigente. */
  fetchSnapshot(
    assetId: string,
    revision: string,
    displayName?: string,
  ): Promise<CadXrefAssetSnapshot>;
  /** El embudo de mutación de bloques del editor, con su paso de deshacer. */
  commit(
    mutate: (document: CadDocument) => CadDocument,
    touched: string[],
    message: string,
    label: string,
    select: boolean,
  ): void;
  newEntityId(): string;
  /** Identidad del dibujo ANFITRIÓN, para detectar ciclos al anidar. */
  hostAssetId(): string;
}

export function cadStudioAttachXref(
  deps: CadStudioXrefAttachDeps,
): (draft: CadStudioXrefAttachDraft) => Promise<void> {
  return async (draft) => {
    const source = await deps.fetchSnapshot(draft.assetId, draft.revision, draft.name);
    const id = deps.newEntityId();
    deps.commit(
      (document) =>
        attachCadXref(document, {
          id,
          snapshot: source,
          mode: draft.mode,
          hostAssetId: deps.hostAssetId(),
          insertion: { x: draft.x, y: draft.y, z: 0 },
          scale: draft.scale,
          rotation: draft.rotation,
        }),
      [`xref:${id}:insert`],
      `${draft.mode === "overlay" ? "Overlay" : "Attachment"} ${draft.assetId}@${draft.revision} vinculado.`,
      "XREF",
      true,
    );
  };
}
