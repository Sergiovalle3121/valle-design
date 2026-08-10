/**
 * Del sólido B-rep al visor 3D: teselado, estilos visuales y el gancho.
 *
 * Es la última pieza de la cadena. `lib/brep/` sabe modelar, `solid3d-build.ts`
 * sabe evaluar el árbol persistido y `tessellateBody` devuelve exactamente el
 * formato que consume `entity-three.ts` —posiciones, normales e índices—. Lo que
 * faltaba era el adaptador entre el mapeo de escena del editor y esa malla, y es
 * todo lo que hay aquí.
 *
 * ## El mapeo de escena, que NO se reinventa
 *
 * El editor pone el dibujo sobre el plano XZ y usa la Y de THREE como altura
 * (ver la cabecera de `view/view-controller.ts`):
 *
 * ```text
 * escena.x = (dibujo.x − W/2) · s
 * escena.z = (dibujo.y − H/2) · s
 * escena.y = elevación · s
 * ```
 *
 * Un sólido tiene z REAL —es lo que lo hace un sólido— así que su `z` de dibujo
 * es la altura de escena. Confundir los dos ejes es el error que deja una pieza
 * tumbada en el suelo con la altura pintada hacia el norte, y la comprobación que
 * lo caza no es visual: es que la caja envolvente de la malla en Y tiene que
 * medir la altura de la extrusión.
 *
 * ## El gancho, dicho sin ambigüedad
 *
 * `entity-three.ts` es de otra sesión en esta ola y no se toca aquí. Este módulo
 * expone `buildCadSolidObject`, que es una función con la misma firma que las que
 * ya usa `buildCadNativeObject`; enchufarla son estas tres líneas dentro de esa
 * función:
 *
 * ```ts
 * if (entity.type === "solid3d") {
 *   group.add(buildCadSolidObject(entity, viewport, style));
 * }
 * ```
 *
 * Hasta que ese cambio exista, el sólido se dibuja en el viewport 2D por su
 * proyección alámbrica (que sí está enchufada, vía `CAD_ENTITY_REGISTRY`) y este
 * módulo queda cubierto por su spec pero sin consumidor en el visor. Está dicho
 * aquí y en el PR: no es una omisión, es una frontera de propiedad.
 */
import * as THREE from "three";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import { solid3dMesh } from "./solid3d-build";
import {
  CAD_DEFAULT_VISUAL_STYLE,
  cadVisualStyle,
  type CadVisualStyle,
  type CadVisualStyleId,
} from "./view/visual-styles";
import type { CadThreeViewport } from "./entity-three";

const SOLID_COLOR = 0x94a3b8;
const SOLID_EDGE_COLOR = 0x0f172a;
const SELECTED_COLOR = 0x22d3ee;
/** Color del fondo del visor: lo que pinta el estilo Oculto para tapar. */
const OCCLUDER_COLOR = 0x0b1220;

export interface CadSolidThreeOptions {
  style?: CadVisualStyleId | CadVisualStyle;
  selected?: boolean;
}

function resolveStyle(style: CadSolidThreeOptions["style"]): CadVisualStyle {
  if (!style) return cadVisualStyle(CAD_DEFAULT_VISUAL_STYLE);
  return typeof style === "string" ? cadVisualStyle(style) : style;
}

/**
 * Geometría del sólido en coordenadas de ESCENA.
 *
 * Se construye una sola vez y la comparten la malla y las aristas: duplicarla
 * doblaría la memoria de vídeo de cada pieza sin ganar nada, y la geometría es
 * inmutable una vez subida.
 */
export function buildCadSolidGeometry(
  entity: CadSolid3dEntity,
  viewport: CadThreeViewport,
): THREE.BufferGeometry {
  const mesh = solid3dMesh(entity);
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  const { scale, width, height } = viewport;
  for (let index = 0; index < count; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    positions[index * 3] = (x - width / 2) * scale;
    // La `z` del dibujo ES la altura de escena. Un sólido es lo único del
    // documento que la tiene de verdad, así que aquí no vale la elevación fija
    // que usan las entidades planas.
    positions[index * 3 + 1] = z * scale;
    positions[index * 3 + 2] = (y - height / 2) * scale;
    // Las normales sufren la MISMA permutación de ejes que las posiciones, pero
    // sin traslación ni escala: son direcciones. Escalarlas no cambiaría el
    // sombreado —THREE las normaliza— pero trasladarlas lo destruiría.
    normals[index * 3] = mesh.normals[index * 3];
    normals[index * 3 + 1] = mesh.normals[index * 3 + 2];
    normals[index * 3 + 2] = mesh.normals[index * 3 + 1];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(Array.from(mesh.indices));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Objeto del visor para un sólido, según el estilo visual vigente.
 *
 * Un solo camino de código parametrizado por la tabla de estilos, en vez de
 * cuatro ramas paralelas: así «Oculto» no puede quedarse siendo un alias de
 * «Alámbrico», que es como se rompe esto normalmente.
 */
export function buildCadSolidObject(
  entity: CadSolid3dEntity,
  viewport: CadThreeViewport,
  options: CadSolidThreeOptions = {},
): THREE.Group {
  const style = resolveStyle(options.style);
  const group = new THREE.Group();
  group.name = `cad-solid:${entity.id}`;
  group.userData.nativeEntityId = entity.id;
  group.userData.nativeEntityType = "solid3d";
  group.userData.visualStyle = style.id;

  let geometry: THREE.BufferGeometry;
  try {
    geometry = buildCadSolidGeometry(entity, viewport);
  } catch {
    // Un árbol roto no tumba el visor: deja el grupo vacío, igual que el
    // adaptador 2D deja una cruz. El problema se cuenta en propiedades.
    group.userData.invalid = true;
    return group;
  }

  if (style.faces || style.occludes) {
    const material = new THREE.MeshLambertMaterial({
      color: style.faces ? (options.selected ? SELECTED_COLOR : SOLID_COLOR) : OCCLUDER_COLOR,
      transparent: style.opacity < 1,
      opacity: style.opacity,
      // Las caras se empujan hacia atrás en el buffer de profundidad para que las
      // aristas dibujadas encima no se peleen con ellas. Sin esto, un sólido
      // sombreado con aristas parpadea por franjas al orbitar — es el z-fighting
      // clásico entre una malla y su propio alambre.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `cad-solid-faces:${entity.id}`;
    mesh.userData.nativeEntityId = entity.id;
    group.add(mesh);
  }

  if (style.edges) {
    const edges = new THREE.EdgesGeometry(geometry, 20);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: options.selected ? SELECTED_COLOR : SOLID_EDGE_COLOR }),
    );
    line.name = `cad-solid-edges:${entity.id}`;
    line.userData.nativeEntityId = entity.id;
    group.add(line);
    // Sin caras que la sostengan, la geometría de la malla no la referencia
    // nadie más: se libera aquí para no dejarla colgando en memoria de vídeo.
    if (!style.faces && !style.occludes) geometry.dispose();
  }

  return group;
}

/** Libera geometrías y materiales de un objeto de sólido. */
export function disposeCadSolidObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
  object.removeFromParent();
}
