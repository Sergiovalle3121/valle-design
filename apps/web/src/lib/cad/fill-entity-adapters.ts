/**
 * Adaptadores de SOLID, WIPEOUT e IMAGE — las tres entidades de SUPERFICIE del
 * esquema 4.
 *
 * Las tres cubren una región del plano en vez de trazar una línea, y eso
 * cambia dos cosas respecto de las curvas: se impacta por INTERIOR (pinchar en
 * medio de un solid lo selecciona, no hace falta acertarle al borde) y su sitio
 * en `modelSpace.entityIds` es contenido, no decoración — un WIPEOUT que baja
 * en el z-order deja de tapar.
 *
 * ## Reflexión, tipo por tipo
 *
 * · SOLID y WIPEOUT son POLÍGONOS: se reflejan sus vértices y ya está. El
 *   sentido de recorrido se invierte, y da igual: un relleno no tiene
 *   orientación. No se invierte la lista a propósito — hacerlo daría la misma
 *   silueta y rompería los grips, que apuntan al vértice por su índice.
 * · IMAGE guarda `uVector` y `vVector`, que son VECTORES: van por la parte
 *   LINEAL de la transformada. De ahí sale gratis lo que un usuario espera de
 *   MIRROR sobre una imagen — que salga espejada de verdad — sin ningún caso
 *   especial. Pasar esos vectores por la transformada de PUNTO les sumaría la
 *   traslación y mandaría la imagen a la otra punta del plano, estirada en
 *   proporción a lo lejos que estuviera del origen.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import { cadTransformPoint3, cadTransformVector3 } from "./transform2d";
import type {
  CadEntityAdapter,
  CadHitTester,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
  CadSnapPoint,
} from "./entity-runtime";

type CadSolidEntity = Extract<CadNativeEntity, { type: "solid" }>;
type CadWipeoutEntity = Extract<CadNativeEntity, { type: "wipeout" }>;
type CadImageEntity = Extract<CadNativeEntity, { type: "image" }>;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });

const flat = (points: readonly CadPoint3[]): CadPoint2[] =>
  points.map((point) => ({ x: point.x, y: point.y }));

/** Área con signo; el valor absoluto es el área del polígono. */
function signedArea(points: readonly CadPoint2[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/**
 * Impacto de una entidad RELLENA: cuenta el interior, no sólo el borde. Es la
 * diferencia entre poder pinchar un solid en medio y tener que acertarle al
 * contorno con la tolerancia del cursor.
 */
function filledHitTester<E extends CadNativeEntity>(
  outline: (entity: E) => CadPoint2[],
): CadHitTester<E> {
  return {
    hitTest: (entity, point, tolerance) => {
      const polygon = outline(entity);
      if (polygon.length < 2) return false;
      return (
        pointInPolygon(point, polygon) ||
        pathHit([{ points: polygon, closed: true }], point, tolerance)
      );
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = pointsBounds(outline(entity));
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  };
}

function polygonSnaps(points: readonly CadPoint2[], label: string): CadSnapPoint[] {
  const snaps: CadSnapPoint[] = points.map((point, index) => ({
    kind: "endpoint" as const,
    point,
    label: `${label} ${index + 1}`,
  }));
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    snaps.push({
      kind: "control",
      point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      label: `Punto medio ${index + 1}`,
    });
  }
  return snaps;
}

// ---------------------------------------------------------------------------
// SOLID
// ---------------------------------------------------------------------------

export const solidAdapter: CadEntityAdapter<CadSolidEntity> = {
  type: "solid",
  renderer: { paths: (entity) => [{ points: flat(entity.points), closed: true }] },
  bounds: { bounds: (entity) => pointsBounds(flat(entity.points)) },
  hitTester: filledHitTester<CadSolidEntity>((entity) => flat(entity.points)),
  grips: {
    grips: (entity) =>
      entity.points.map((point, index) => ({
        id: `vertex:${index}`,
        kind: "endpoint" as const,
        point: { x: point.x, y: point.y },
        label: `Vértice ${index + 1}`,
      })),
    moveGrip: (entity, gripId, point) => {
      const index = Number(gripId.split(":")[1]);
      if (!Number.isInteger(index) || !entity.points[index]) return entity;
      return {
        ...entity,
        points: entity.points.map((current, position) =>
          position === index ? point3(point, current.z) : { ...current },
        ),
      };
    },
  },
  snaps: { snaps: (entity) => polygonSnaps(flat(entity.points), "Vértice") },
  properties: {
    read: (entity) => ({
      vertexCount: entity.points.length,
      area: Math.abs(signedArea(flat(entity.points))),
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => ({
      ...entity,
      points: entity.points.map((point) => cadTransformPoint3(point, transform)),
      context: entity.context ? structuredClone(entity.context) : undefined,
    }),
  },
};

// ---------------------------------------------------------------------------
// WIPEOUT
// ---------------------------------------------------------------------------

export const wipeoutAdapter: CadEntityAdapter<CadWipeoutEntity> = {
  type: "wipeout",
  renderer: { paths: (entity) => [{ points: flat(entity.boundary), closed: true }] },
  bounds: { bounds: (entity) => pointsBounds(flat(entity.boundary)) },
  hitTester: filledHitTester<CadWipeoutEntity>((entity) => flat(entity.boundary)),
  grips: {
    grips: (entity) =>
      entity.boundary.map((point, index) => ({
        id: `vertex:${index}`,
        kind: "endpoint" as const,
        point: { x: point.x, y: point.y },
        label: `Vértice ${index + 1}`,
      })),
    moveGrip: (entity, gripId, point) => {
      const index = Number(gripId.split(":")[1]);
      if (!Number.isInteger(index) || !entity.boundary[index]) return entity;
      return {
        ...entity,
        boundary: entity.boundary.map((current, position) =>
          position === index ? point3(point, current.z) : { ...current },
        ),
      };
    },
  },
  snaps: { snaps: (entity) => polygonSnaps(flat(entity.boundary), "Vértice") },
  properties: {
    read: (entity) => ({
      vertexCount: entity.boundary.length,
      area: Math.abs(signedArea(flat(entity.boundary))),
      frame: entity.frame ?? true,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      frame: typeof patch.frame === "boolean" ? patch.frame : entity.frame,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => ({
      ...entity,
      boundary: entity.boundary.map((point) => cadTransformPoint3(point, transform)),
      context: entity.context ? structuredClone(entity.context) : undefined,
    }),
  },
};

// ---------------------------------------------------------------------------
// IMAGE
// ---------------------------------------------------------------------------

/**
 * Las cuatro esquinas, empezando por la inserción (inferior izquierda) y
 * recorriendo U y luego V. Salen de `insertion + u·ancho + v·alto` sin
 * trigonometría porque la rotación ya vive dentro de los vectores.
 */
function imageCorners(entity: CadImageEntity): CadPoint2[] {
  const { insertion: origin, uVector: u, vVector: v, size } = entity;
  const ux = u.x * size.width;
  const uy = u.y * size.width;
  const vx = v.x * size.height;
  const vy = v.y * size.height;
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + ux, y: origin.y + uy },
    { x: origin.x + ux + vx, y: origin.y + uy + vy },
    { x: origin.x + vx, y: origin.y + vy },
  ];
}

function imagePaths(entity: CadImageEntity): CadRenderPath[] {
  const paths: CadRenderPath[] = [{ points: imageCorners(entity), closed: true }];
  if (entity.clipBoundary && entity.clipBoundary.length >= 3) {
    // El recorte se declara en píxeles de la definición; se lleva al plano por
    // los mismos vectores U/V, así que gira y se refleja con la imagen.
    const { insertion: origin, uVector: u, vVector: v } = entity;
    paths.push({
      points: entity.clipBoundary.map((pixel) => ({
        x: origin.x + u.x * pixel.x + v.x * pixel.y,
        y: origin.y + u.y * pixel.x + v.y * pixel.y,
      })),
      closed: true,
    });
  }
  return paths;
}

export const imageAdapter: CadEntityAdapter<CadImageEntity> = {
  type: "image",
  renderer: { paths: imagePaths },
  bounds: { bounds: (entity) => pointsBounds(imageCorners(entity)) },
  hitTester: filledHitTester<CadImageEntity>(imageCorners),
  grips: {
    grips: (entity) => {
      const corners = imageCorners(entity);
      return [
        { id: "insertion", kind: "endpoint" as const, point: corners[0], label: "Inserción" },
        { id: "u", kind: "control" as const, point: corners[1], label: "Ancho" },
        { id: "corner", kind: "control" as const, point: corners[2], label: "Esquina" },
        { id: "v", kind: "control" as const, point: corners[3], label: "Alto" },
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "insertion")
        return { ...entity, insertion: point3(point, entity.insertion.z) };
      // Mover un tirador de eje cambia el TAMAÑO DE PÍXEL, no el de la imagen
      // en píxeles: el archivo sigue teniendo los que tiene.
      if (gripId === "u" && entity.size.width > 0)
        return {
          ...entity,
          uVector: {
            x: (point.x - entity.insertion.x) / entity.size.width,
            y: (point.y - entity.insertion.y) / entity.size.width,
            z: entity.uVector.z,
          },
        };
      if (gripId === "v" && entity.size.height > 0)
        return {
          ...entity,
          vVector: {
            x: (point.x - entity.insertion.x) / entity.size.height,
            y: (point.y - entity.insertion.y) / entity.size.height,
            z: entity.vVector.z,
          },
        };
      return entity;
    },
  },
  snaps: {
    snaps: (entity) =>
      imageCorners(entity).map((point, index) => ({
        kind: "endpoint" as const,
        point,
        label: `Esquina ${index + 1}`,
      })),
  },
  properties: {
    read: (entity) => ({
      definition: entity.definition,
      insertionX: entity.insertion.x,
      insertionY: entity.insertion.y,
      pixelWidth: entity.size.width,
      pixelHeight: entity.size.height,
      drawnWidth: Math.hypot(entity.uVector.x, entity.uVector.y) * entity.size.width,
      drawnHeight: Math.hypot(entity.vVector.x, entity.vVector.y) * entity.size.height,
      rotation: (Math.atan2(entity.uVector.y, entity.uVector.x) * 180) / Math.PI,
      brightness: entity.brightness ?? 50,
      contrast: entity.contrast ?? 50,
      fade: entity.fade ?? 0,
      showImage: entity.showImage ?? true,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      insertion: {
        x: finite(patch.insertionX, entity.insertion.x),
        y: finite(patch.insertionY, entity.insertion.y),
        z: entity.insertion.z,
      },
      brightness: Math.max(0, Math.min(100, finite(patch.brightness, entity.brightness ?? 50))),
      contrast: Math.max(0, Math.min(100, finite(patch.contrast, entity.contrast ?? 50))),
      fade: Math.max(0, Math.min(100, finite(patch.fade, entity.fade ?? 0))),
      showImage: typeof patch.showImage === "boolean" ? patch.showImage : entity.showImage,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => ({
      ...entity,
      insertion: cadTransformPoint3(entity.insertion, transform),
      uVector: cadTransformVector3(entity.uVector, transform),
      vVector: cadTransformVector3(entity.vVector, transform),
      // `size` es el tamaño en PÍXELES del archivo: no lo toca ninguna
      // transformada del plano. Escalarlo aquí sería recortar la imagen.
      size: { ...entity.size },
      ...(entity.clipBoundary ? { clipBoundary: entity.clipBoundary.map((p) => ({ ...p })) } : {}),
      context: entity.context ? structuredClone(entity.context) : undefined,
    }),
  },
};

export const __testables = { imageCorners, signedArea };
