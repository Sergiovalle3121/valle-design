import type { MutableRefObject } from "react";
import type { CadLayerAssignments } from "@/lib/cad/layers";
import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import type { Ann } from "../viewport/scene-objects";

/**
 * Mantiene la sombra del editor legado (`annotationsRef`/`layerAssignmentsRef`
 * en `Layout3DEditor.tsx`) al día tras un comando NATIVO.
 *
 * TEXT es el único tipo con adaptador nativo que también tiene sombra legada
 * (`Ann` no existe para ningún otro tipo native — MTEXT, DIMENSION, etc. no
 * tenían representación previa en el editor legado, así que no hay sombra que
 * pueda quedarse vieja). `snapshotDocument()` —el checkpoint de CADA comando
 * nativo y de CADA guardado— reconstruye siempre desde esta sombra vía
 * `replaceEditorProjection`, que gana para los campos que sabe expresar. Sin
 * este resincronizado, editar el CONTENIDO o la CAPA de un TEXT por la
 * paleta de propiedades y guardar a continuación revertía la edición: la
 * sombra, nunca tocada por el comando, volvía a ganar en el guardado
 * siguiente.
 *
 * Vive fuera de `Layout3DEditor.tsx` porque ese archivo está en el
 * trinquete de tamaño de `check-monolith-budget.mjs` y sólo puede encoger.
 */
export function syncLegacyTextShadow(
  annotations: Map<string, Ann>,
  layerAssignmentsRef: MutableRefObject<CadLayerAssignments>,
  setLayerAssignments: (value: CadLayerAssignments) => void,
  upsert: readonly CadNativeEntity[],
  remove: readonly string[],
): void {
  for (const id of remove) annotations.delete(id);
  const textUpserts = upsert.filter(
    (entity): entity is Extract<CadNativeEntity, { type: "text" }> =>
      entity.type === "text",
  );
  for (const entity of textUpserts) {
    annotations.set(entity.id, {
      id: entity.id,
      type: "text",
      x: entity.x,
      y: entity.y,
      text: entity.text,
      ...(entity.color ? { color: entity.color } : {}),
    });
  }
  if (!textUpserts.length) return;
  const next = { ...layerAssignmentsRef.current };
  for (const entity of textUpserts) next[entity.id] = entity.layer;
  layerAssignmentsRef.current = next;
  setLayerAssignments(next);
}

/**
 * Al ABRIR: mezcla en `restoredLayers` la capa real de cada anotación TEXT.
 *
 * `layoutFromDocument` expone `entityLayers` —la capa de CUALQUIER entidad,
 * no sólo activos (ver `legacy/layout-mapper.ts`)—; antes de este helper
 * `Layout3DEditor.tsx` sólo la consumía para activos, así que una anotación
 * TEXT en una capa real se reproyectaba con el defecto `"Text"` del propio
 * carácter de la apertura, sin haber tocado nada.
 */
export function mergeAnnotationLayers(
  restoredLayers: CadLayerAssignments,
  entityLayers: Record<string, string> | undefined,
  annotationIds: Iterable<string>,
): void {
  if (!entityLayers) return;
  for (const id of annotationIds) {
    const layer = entityLayers[id];
    if (layer?.trim()) restoredLayers[id] = layer;
  }
}
