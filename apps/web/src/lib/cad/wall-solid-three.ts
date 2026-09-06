/**
 * El cuerpo LOCAL del muro (`wall-solid.ts`), llevado a geometría de escena.
 *
 * Es la misma frontera que `solid3d-three.ts` traza para `SOLID3D`: el kernel
 * no sabe de Three.js ni de la convención de escena del editor, y este módulo
 * es el único que conoce las dos cosas a la vez.
 *
 * ## La rotación que `solid3d-three.ts` no necesita y aquí sí
 *
 * Un `SOLID3D` ya vive en coordenadas de DIBUJO — su `z` es la altura, sin
 * más—, así que ese adaptador sólo permuta ejes. Un muro vive en su marco
 * LOCAL (eje, a través del grosor, altura) y hay que llevarlo al mundo
 * ANTES de permutar: `wallAxisFrame`/`wallAxisPoint` (ya probados en
 * `wall-openings.ts`) hacen esa rotación en planta — nunca una rotación 3D
 * completa, porque un muro no se inclina.
 */
import * as THREE from "three";
import { tessellateBody } from "../brep";
import type { CadWallEntity } from "./cad-entities-v6";
import type { CadThreeViewport } from "./entity-three";
import { cadVisualStyle, type CadVisualStyleId } from "./view/visual-styles";
import {
  applyCadVisualStyleToGroup,
  CAD_STYLED_MESH_EDGE_COLOR,
  CAD_STYLED_MESH_OCCLUDER_COLOR,
} from "./view/visual-style-mesh";
import type { CadWallJoins } from "./wall-joins";
import { cadWallMaterialStyle } from "./wall-materials";
import { wallAxisFrame, type CadWallAxisFrame } from "./wall-openings";
import {
  wallSolidBodyLocalWithDiagnostics,
  type CadWallSolidOpening,
} from "./wall-solid";
import {
  cadWallOpeningCutBlocksSolid,
  type CadWallOpeningCutDiagnostic,
} from "./wall-solid-diagnostics";

const WALL_SELECTED_COLOR = 0x22d3ee;

/** Punto LOCAL (eje, a través, altura) llevado a coordenadas de ESCENA. */
function sceneFromLocal(
  frame: CadWallAxisFrame,
  baseZ: number,
  viewport: CadThreeViewport,
  lx: number,
  ly: number,
  lz: number,
): THREE.Vector3 {
  const world = {
    x: frame.origin.x + frame.u.x * lx + frame.n.x * ly,
    y: frame.origin.y + frame.u.y * lx + frame.n.y * ly,
    z: baseZ + lz,
  };
  return new THREE.Vector3(
    (world.x - viewport.width / 2) * viewport.scale,
    world.z * viewport.scale,
    (world.y - viewport.height / 2) * viewport.scale,
  );
}

/** Dirección LOCAL (no punto: sin traslación) llevada a ESCENA. Para normales. */
function sceneDirectionFromLocal(
  frame: CadWallAxisFrame,
  nlx: number,
  nly: number,
  nlz: number,
): THREE.Vector3 {
  const worldX = frame.u.x * nlx + frame.n.x * nly;
  const worldY = frame.u.y * nlx + frame.n.y * nly;
  return new THREE.Vector3(worldX, nlz, worldY);
}

/**
 * Geometría de escena del muro con sus vanos recortados, o `null` si la
 * receta es degenerada o el eje del muro no se puede orientar (longitud
 * nula) — el mismo criterio fail-closed que `wallFootprint`.
 *
 * `joins` (opcional): las uniones L/T contra los vecinos, las mismas de la
 * planta 2D — con ellas el sólido extruye el contorno ajustado y la esquina
 * se ve limpia también en 3D (`wallSolidBodyLocal`).
 */
export function buildCadWallSolidGeometry(
  wall: Pick<CadWallEntity, "start" | "end" | "thickness" | "height">,
  openings: readonly CadWallSolidOpening[],
  viewport: CadThreeViewport,
  joins?: CadWallJoins | null,
): THREE.BufferGeometry | null {
  return buildCadWallSolidGeometryWithDiagnostics(
    wall,
    openings,
    viewport,
    joins,
  ).geometry;
}

export interface CadWallSolidGeometryResult {
  geometry: THREE.BufferGeometry | null;
  /** Un elemento por vano NO recortado (`wall-solid-diagnostics.ts`). */
  diagnostics: CadWallOpeningCutDiagnostic[];
}

/** Igual que `buildCadWallSolidGeometry`, con el recorte de vanos declarado. */
export function buildCadWallSolidGeometryWithDiagnostics(
  wall: Pick<CadWallEntity, "start" | "end" | "thickness" | "height">,
  openings: readonly CadWallSolidOpening[],
  viewport: CadThreeViewport,
  joins?: CadWallJoins | null,
): CadWallSolidGeometryResult {
  const frame = wallAxisFrame(wall);
  const { body, diagnostics } = wallSolidBodyLocalWithDiagnostics(
    wall,
    openings,
    joins,
  );
  if (!frame || !body) return { geometry: null, diagnostics };
  const mesh = tessellateBody(body);
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  const baseZ = wall.start.z;
  for (let index = 0; index < count; index += 1) {
    const point = sceneFromLocal(
      frame,
      baseZ,
      viewport,
      mesh.positions[index * 3],
      mesh.positions[index * 3 + 1],
      mesh.positions[index * 3 + 2],
    );
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
    const normal = sceneDirectionFromLocal(
      frame,
      mesh.normals[index * 3],
      mesh.normals[index * 3 + 1],
      mesh.normals[index * 3 + 2],
    );
    normals[index * 3] = normal.x;
    normals[index * 3 + 1] = normal.y;
    normals[index * 3 + 2] = normal.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(Array.from(mesh.indices));
  geometry.computeBoundingSphere();
  return { geometry, diagnostics };
}

export interface CadWallSolidObjectOptions {
  selected?: boolean;
  /** Uniones L/T del muro (las de la planta 2D); sin ellas, la caja base. */
  joins?: CadWallJoins | null;
  /**
   * VSCURRENT/SHADEMODE (T-10a). Por defecto `"shaded"` (caras opacas, sin
   * aristas propias): es exactamente el aspecto que este anfitrión pintaba
   * antes de que el estilo existiera aquí — cambiar el defecto habría movido
   * goldens sin que nadie lo pidiera.
   */
  style?: CadVisualStyleId;
}

/**
 * Objeto de escena del muro nativo, con la MISMA identidad que el resto de
 * proyecciones nativas (`userData.nativeEntityId`) para que picking y
 * selección lo resuelvan sin caso especial.
 */
export function buildCadWallSolidObject(
  wall: Pick<
    CadWallEntity,
    "id" | "start" | "end" | "thickness" | "height" | "material"
  >,
  openings: readonly CadWallSolidOpening[],
  viewport: CadThreeViewport,
  options: CadWallSolidObjectOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = `cad-wall-solid:${wall.id}`;
  group.userData.nativeEntityId = wall.id;
  group.userData.nativeEntityType = "wall";

  let geometry: THREE.BufferGeometry | null;
  let diagnostics: CadWallOpeningCutDiagnostic[] = [];
  try {
    const result = buildCadWallSolidGeometryWithDiagnostics(
      wall,
      openings,
      viewport,
      options.joins,
    );
    geometry = result.geometry;
    diagnostics = result.diagnostics;
  } catch (error) {
    geometry = null;
    diagnostics = [
      {
        openingIndex: -1,
        kind: "boolean-failed",
        cause: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  // El recorte declarado viaja con el objeto: el anfitrión lo recoge para el
  // informe de validación con muro y vano identificados.
  if (diagnostics.length) group.userData.openingCutDiagnostics = diagnostics;
  if (geometry && cadWallOpeningCutBlocksSolid(diagnostics)) {
    // Un vano VÁLIDO que el kernel no pudo recortar: presentar el muro macizo
    // mentiría. Se bloquea la representación (grupo inválido, sin malla) y el
    // informe de validación lo hace visible con su causa — nunca una pérdida
    // silenciosa de geometría.
    geometry.dispose();
    geometry = null;
  }
  if (!geometry) {
    // Receta degenerada o booleana irrecuperable: grupo vacío, no un visor
    // roto. El mismo patrón que `buildCadSolidObject` para SOLID3D.
    group.userData.invalid = true;
    return group;
  }

  const style = cadVisualStyle(options.style ?? "shaded");
  group.userData.visualStyle = style.id;
  applyCadVisualStyleToGroup(group, geometry, {
    style,
    facesColor: options.selected ? WALL_SELECTED_COLOR : cadWallMaterialStyle(wall.material).color,
    nativeEntityId: wall.id,
  });
  return group;
}

/**
 * Recolorea un sólido YA CONSTRUIDO sin retesellar. Designar o soltar un
 * muro no mueve un solo vértice de su malla — sólo cambia qué color pinta
 * la misma cara —, así que `CadWallSolidHost.sync()` llama a esto en vez de
 * `disposeCadWallSolidObject` + `buildCadWallSolidObject` cuando lo único
 * que cambió es la selección: la reconstrucción completa (recortar vanos,
 * retesellar el B-rep) es cara y aquí no hace ninguna falta.
 *
 * `false` cuando el objeto es el grupo «inválido» sin malla (receta
 * degenerada, ver `buildCadWallSolidObject`) — no hay material que
 * recolorear, y quien llama no tiene nada que actualizar.
 */
export function recolorCadWallSolidObject(
  object: THREE.Object3D,
  wall: Pick<CadWallEntity, "material">,
  selected: boolean,
): boolean {
  // El color de la cara depende del ESTILO vigente: en Oculto la cara es un
  // ocultador (`!style.faces`), no el material del muro — recolorearla con
  // `cadWallMaterialStyle` la convertiría en una cara visible sin que nadie
  // haya cambiado VSCURRENT.
  const style = cadVisualStyle(object.userData.visualStyle as CadVisualStyleId | undefined);
  let changed = false;
  const mesh = object.children.find(
    (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
  );
  const material = mesh?.material as THREE.MeshLambertMaterial | undefined;
  if (material) {
    material.color.set(
      style.faces
        ? (selected ? WALL_SELECTED_COLOR : cadWallMaterialStyle(wall.material).color)
        : CAD_STYLED_MESH_OCCLUDER_COLOR,
    );
    changed = true;
  }
  // Alámbrico no tiene cara (`applyCadVisualStyleToGroup` la libera): lo
  // único que hay que recolorear son sus aristas.
  const lines = object.children.find(
    (child): child is THREE.LineSegments => (child as THREE.LineSegments).isLineSegments === true,
  );
  const lineMaterial = lines?.material as THREE.LineBasicMaterial | undefined;
  if (lineMaterial) {
    lineMaterial.color.set(selected ? WALL_SELECTED_COLOR : CAD_STYLED_MESH_EDGE_COLOR);
    changed = true;
  }
  return changed;
}

/** Libera geometría y material del objeto del muro. */
export function disposeCadWallSolidObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as
      THREE.Material | THREE.Material[] | undefined;
    const materials = Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    // `.map` no lo pone hoy ningún material de muro (`cadWallMaterialStyle`
    // es un color plano) — pero si algún día lleva una muestra de textura,
    // esto ya lo libera: el mismo hueco que tiene `disposeObject` genérico
    // de `scene-objects.ts`, cerrado aquí antes de que haga falta.
    for (const item of materials) {
      (item as THREE.MeshLambertMaterial).map?.dispose?.();
      item.dispose();
    }
  });
  object.removeFromParent();
}
