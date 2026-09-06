/**
 * Aplica la TABLA de `visual-styles.ts` a una geometría de escena: caras,
 * aristas, ninguna, o las dos, con la opacidad y el ocultador que le tocan.
 *
 * Factoriza el camino que `solid3d-three.ts` ya recorre para `SOLID3D`
 * (`buildCadSolidObject`), para que `wall-solid-three.ts` y
 * `room-solid-three.ts` dejen de tener SU PROPIO camino —una cara opaca fija,
 * sin aristas ni Alámbrico ni Oculto— que es justo el «éxito falso» que T-10a
 * mide: `VSCURRENT` confirma un cambio de estilo por la línea de comandos que
 * sobre `wall`, `room` y las masas nativas NO ocurría.
 *
 * ## Lo que NO hace, a propósito
 *
 * No poda aristas ocultas por CPU (`removesHiddenEdges` con una vista
 * declarada): esa precisión de píxel exige el mismo índice de aristas
 * topológicas que `solid3d-three.ts`/`buildCadSolidVisibleEdges` construye
 * para el árbol de un `SOLID3D`, y un muro o una losa no lo tienen. `Oculto`
 * sobre estas dos formas sigue siendo correcto —la GPU esconde lo de detrás
 * con exactitud de píxel vía `occludes`—, sólo que envía más aristas de las
 * estrictamente necesarias. Se declara aquí para que quien mida sepa contra
 * qué mide.
 */
import * as THREE from "three";
import type { CadVisualStyle } from "./visual-styles";

/** Los mismos cuatro colores que `solid3d-three.ts` usa para SOLID3D. */
export const CAD_STYLED_MESH_EDGE_COLOR = 0x0f172a;
export const CAD_STYLED_MESH_OCCLUDER_COLOR = 0x0b1220;

export interface CadStyledMeshOptions {
  style: CadVisualStyle;
  /** Color de las caras, ya resuelto (seleccionado o del material propio). */
  facesColor: number;
  edgesColor?: number;
  occluderColor?: number;
  edgeThresholdAngle?: number;
  /** Se estampa en `userData.nativeEntityId` de cada hijo, para picking. */
  nativeEntityId?: string;
}

/**
 * Añade a `group` la malla de caras y/o el alambre de aristas de `geometry`
 * según `options.style`. Nombra los hijos `${group.name}-faces`/`-edges` para
 * que `disposeCad*Object` los recorra genéricamente (ya lo hacen: liberan
 * `mesh.geometry`/`material` de TODO hijo con `isMesh`).
 *
 * Cuando el estilo no pinta caras ni las usa de ocultador
 * (`!faces && !occludes`, el caso Alámbrico), `geometry` se LIBERA tras
 * construir las aristas: nadie más la referencia, igual que
 * `buildCadSolidObject` ya hace.
 */
export function applyCadVisualStyleToGroup(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  options: CadStyledMeshOptions,
): void {
  const { style } = options;
  if (style.faces || style.occludes) {
    const material = new THREE.MeshLambertMaterial({
      color: style.faces ? options.facesColor : (options.occluderColor ?? CAD_STYLED_MESH_OCCLUDER_COLOR),
      transparent: style.opacity < 1,
      opacity: style.opacity,
      // Empuja las caras hacia atrás en el búfer de profundidad para que las
      // aristas dibujadas encima no parpadeen contra ellas — el mismo
      // z-fighting que `solid3d-three.ts` ya evita así.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${group.name}-faces`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (options.nativeEntityId) mesh.userData.nativeEntityId = options.nativeEntityId;
    group.add(mesh);
  }
  if (style.edges) {
    const edgesGeometry = new THREE.EdgesGeometry(geometry, options.edgeThresholdAngle ?? 20);
    const line = new THREE.LineSegments(
      edgesGeometry,
      new THREE.LineBasicMaterial({ color: options.edgesColor ?? CAD_STYLED_MESH_EDGE_COLOR }),
    );
    line.name = `${group.name}-edges`;
    if (options.nativeEntityId) line.userData.nativeEntityId = options.nativeEntityId;
    group.add(line);
    if (!style.faces && !style.occludes) geometry.dispose();
  }
}
