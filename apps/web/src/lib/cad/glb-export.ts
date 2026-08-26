/**
 * Qué viaja en el GLB — la lista explícita, en un módulo que un spec puede
 * ejercitar sin montar el editor.
 *
 * ## El defecto que este módulo cierra
 *
 * «Exportar modelo 3D (.glb)» exportaba SOLO los grupos del modelo de activos
 * heredado (bloques, assets, conexiones, suelo). La arquitectura nativa — los
 * muros con sus vanos recortados, el piso, el cielorraso, la cubierta y los
 * SOLID3D — vive en otros grupos de escena (`CadNativeMassHosts`,
 * `CadSolidShadeHost`) que nadie incluía: el botón entregaba un edificio sin
 * edificio, y ningún spec lo miraba. Para la campaña COMMERCIAL-RC1 un GLB
 * sin la arquitectura es un fallo, no una exportación.
 *
 * ## El contrato
 *
 * `collectCadGlbExportObjects` recibe los grupos por su papel y devuelve la
 * lista a exportar, sin nulos y sin grupos vacíos (un grupo vacío en el GLB es
 * un nodo fantasma que confunde a Blender sin aportar geometría). La lista es
 * EXPLÍCITA a propósito: si mañana aparece un anfitrión nuevo con geometría
 * comercial, tiene que sumarse aquí y al spec de round-trip — no hay un
 * «exportar todo» que lo incluya en silencio junto con overlays y grips.
 */
import type * as THREE from "three";

export interface CadGlbExportGroups {
  /** Modelo heredado: bloques colocados, activos, conexiones, suelo. */
  legacy: readonly (THREE.Object3D | null | undefined)[];
  /**
   * Arquitectura nativa: muros con vanos recortados + piso/cielorraso/
   * cubierta (`CadNativeMassHosts.group`) y SOLID3D (`CadSolidShadeHost.group`).
   */
  architecture: readonly (THREE.Object3D | null | undefined)[];
}

function hasRenderableContent(object: THREE.Object3D): boolean {
  let renderable = false;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const line = child as unknown as { isLine?: boolean };
    const points = child as unknown as { isPoints?: boolean };
    if (mesh.isMesh || line.isLine === true || points.isPoints === true)
      renderable = true;
  });
  return renderable;
}

/**
 * La lista final de objetos a exportar. `architectureRequired` (default true)
 * hace FALLAR la colección cuando el documento tiene arquitectura que
 * exportar y los grupos llegan vacíos — la firma del defecto original.
 */
export function collectCadGlbExportObjects(
  groups: CadGlbExportGroups,
): THREE.Object3D[] {
  const present = (
    list: readonly (THREE.Object3D | null | undefined)[],
  ): THREE.Object3D[] =>
    list.filter(
      (object): object is THREE.Object3D =>
        !!object && hasRenderableContent(object),
    );
  return [...present(groups.legacy), ...present(groups.architecture)];
}

/**
 * ¿Incluye la lista al menos un objeto de ARQUITECTURA con geometría real?
 * El exportador del editor lo usa para avisar cuando el GLB saldría sin
 * edificio (documento con muros pero grupos 3D aún no materializados).
 */
export function cadGlbExportIncludesArchitecture(
  groups: CadGlbExportGroups,
): boolean {
  return groups.architecture.some(
    (object) => !!object && hasRenderableContent(object),
  );
}
