/**
 * Adaptador de HATCH.
 *
 * Sale de `entity-runtime.ts` por el mismo camino que ya recorrieron los de
 * cota y directriz: el registro de capacidades es una cosa y la geometría de
 * cada entidad es otra, y mantener las once juntas en un archivo de 2.000
 * líneas hacía que cualquier corrección tocara el mismo sitio que todas las
 * demás.
 *
 * Aquí vive la regla de reflexión más fácil de equivocar del conjunto: el
 * ángulo del patrón **se refleja**, no se suma. Ver `commands.transform`.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import { hatchPolygon } from "./hatch";
import { hatchRegionContainsPoint } from "./hatch-associativity";
import {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformPoint3,
  cadTransformScaleFactor,
} from "./transform2d";
// De `entity-hit-geometry` y NO de `entity-runtime`: aquél importa este
// módulo, así que pedirle un VALOR de vuelta cierra un ciclo que revienta al
// cargar. Con tipos no pasaba nada; con valores, sí.
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointsBounds,
} from "./entity-hit-geometry";
import type {
  CadBoundsProvider,
  CadEntityAdapter,
  CadEntityRenderer,
  CadEntityTransform,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
} from "./entity-runtime";

const transformPoint = (point: CadPoint3, transform: CadEntityTransform): CadPoint3 =>
  cadTransformPoint3(point, transform);
const normalizeAngleDeg = (value: number) => ((value % 360) + 360) % 360;
const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });
const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const positive = (value: CadPropertyValue | undefined, fallback: number): number => {
  const next = finite(value, fallback);
  return next > 0 ? next : fallback;
};
const cloneContext = <T,>(context: T): T =>
  context === undefined ? context : structuredClone(context);

type CadHatchEntity = Extract<CadNativeEntity, { type: "hatch" }>;

function hatchBoundaries(entity: CadHatchEntity): CadPoint2[][] {
  return entity.boundaries
    .map((boundary) => boundary.map((point) => ({ x: point.x, y: point.y })))
    .filter((boundary) => boundary.length >= 3);
}

function hatchContains(entity: CadHatchEntity, point: CadPoint2): boolean {
  return hatchRegionContainsPoint(hatchBoundaries(entity), point, entity.islandStyle ?? "normal");
}

const hatchRenderer: CadEntityRenderer<CadHatchEntity> = {
  paths: (entity) => {
    const boundaries = hatchBoundaries(entity);
    const outlines: CadRenderPath[] = boundaries.map((points) => ({ points, closed: true }));
    if (entity.solid || !boundaries[0]) return outlines;
    const bounds = pointsBounds(boundaries.flat());
    const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    const spacing = Math.max(entity.scale ?? diagonal / 40, diagonal / 256, 1e-6);
    const pattern = entity.pattern.trim().toUpperCase();
    const angles = pattern === "CROSS" ? [entity.angle ?? 45, (entity.angle ?? 45) + 90] : [entity.angle ?? 45];
    const strokes = angles.flatMap((angle) =>
      hatchPolygon(boundaries[0], { angle, spacing, origin: entity.origin }).filter((segment) => {
        const midpoint = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
        return hatchRegionContainsPoint(boundaries, midpoint, entity.islandStyle ?? "normal");
      }),
    );
    return [
      ...outlines,
      ...strokes.map((segment) => ({ points: [segment.a, segment.b], closed: false })),
    ];
  },
};

const hatchBounds: CadBoundsProvider<CadHatchEntity> = {
  bounds: (entity) => pointsBounds(hatchBoundaries(entity).flat()),
};

export const hatchAdapter: CadEntityAdapter<CadHatchEntity> = {
  type: "hatch",
  renderer: hatchRenderer,
  bounds: hatchBounds,
  hitTester: {
    hitTest: (entity, point, tolerance) =>
      hatchContains(entity, point) || pathHit(hatchRenderer.paths(entity), point, tolerance),
    intersectsWindow: (entity, window, crossing) => {
      const entityBounds = hatchBounds.bounds(entity);
      return crossing ? boundsIntersect(entityBounds, window) : boundsContained(entityBounds, window);
    },
  },
  grips: {
    grips: (entity) => {
      const bounds = hatchBounds.bounds(entity);
      return [
        {
          id: "center",
          kind: "center" as const,
          point: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
          label: "Centro",
        },
        ...entity.boundaries.flatMap((boundary, boundaryIndex) =>
          boundary.map((point, vertexIndex) => ({
            id: `boundary:${boundaryIndex}:vertex:${vertexIndex}`,
            kind: "control" as const,
            point: { x: point.x, y: point.y },
            label: `Contorno ${boundaryIndex + 1} · vértice ${vertexIndex + 1}`,
          })),
        ),
      ];
    },
    moveGrip: (entity, gripId, point) => {
      if (gripId === "center") {
        const bounds = hatchBounds.bounds(entity);
        const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
        return hatchAdapter.commands.transform(entity, {
          translation: { x: point.x - center.x, y: point.y - center.y },
        });
      }
      const match = /^boundary:(\d+):vertex:(\d+)$/.exec(gripId);
      if (!match) return entity;
      const boundaryIndex = Number(match[1]);
      const vertexIndex = Number(match[2]);
      if (!entity.boundaries[boundaryIndex]?.[vertexIndex]) return entity;
      return {
        ...entity,
        boundaries: entity.boundaries.map((boundary, currentBoundary) =>
          boundary.map((vertex, currentVertex) =>
            currentBoundary === boundaryIndex && currentVertex === vertexIndex
              ? point3(point, vertex.z)
              : { ...vertex },
          ),
        ),
      };
    },
  },
  snaps: {
    snaps: (entity) => {
      const bounds = hatchBounds.bounds(entity);
      return [
        {
          kind: "center" as const,
          point: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
          label: "Centro",
        },
        ...entity.boundaries.flatMap((boundary, boundaryIndex) =>
          boundary.map((point, vertexIndex) => ({
            kind: "endpoint" as const,
            point: { x: point.x, y: point.y },
            label: `Contorno ${boundaryIndex + 1} · vértice ${vertexIndex + 1}`,
          })),
        ),
      ];
    },
  },
  properties: {
    read: (entity) => ({
      pattern: entity.pattern,
      solid: entity.solid,
      scale: entity.scale ?? 1,
      angle: entity.angle ?? 0,
      boundaryCount: entity.boundaries.length,
      islandStyle: entity.islandStyle ?? "normal",
      associative: entity.associative ?? false,
      associationStatus: entity.associationStatus ?? (entity.associative ? "associated" : "detached"),
      boundaryReferenceCount: entity.boundaryRefs?.length ?? 0,
      originX: entity.origin?.x ?? 0,
      originY: entity.origin?.y ?? 0,
      layer: entity.layer,
    }),
    write: (entity, patch) => {
      let pattern = typeof patch.pattern === "string" && patch.pattern.trim() ? patch.pattern.trim() : entity.pattern;
      let solid = typeof patch.solid === "boolean" ? patch.solid : entity.solid;
      if (typeof patch.pattern === "string" && patch.pattern.trim())
        solid = pattern.toUpperCase() === "SOLID";
      if (patch.solid === true) pattern = "SOLID";
      else if (patch.solid === false && pattern.toUpperCase() === "SOLID") pattern = "ANSI31";
      return {
        ...entity,
        pattern,
        solid,
        scale: positive(patch.scale, entity.scale ?? 1),
        angle: finite(patch.angle, entity.angle ?? 0),
        origin: {
          x: finite(patch.originX, entity.origin?.x ?? 0),
          y: finite(patch.originY, entity.origin?.y ?? 0),
          z: entity.origin?.z ?? 0,
        },
        islandStyle: patch.islandStyle === "outer" || patch.islandStyle === "ignore" || patch.islandStyle === "normal"
          ? patch.islandStyle
          : entity.islandStyle ?? "normal",
        associative: typeof patch.associative === "boolean" ? patch.associative : entity.associative,
        associationStatus: patch.associative === false ? "detached" : entity.associationStatus,
        layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
      };
    },
  },
  commands: {
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const angleBase = cadTransformAngleBase(transform);
      return {
      ...entity,
      boundaries: entity.boundaries.map((boundary) => boundary.map((point) => transformPoint(point, transform))),
      // Espaciado y ángulo AUSENTES se conservan ausentes, y al escribirlos se
      // parte de los MISMOS valores por defecto que usa el renderizador. Antes
      // no coincidían: se dibuja `angle ?? 45` y `scale ?? diagonal/40`, y esta
      // transformada materializaba `angle ?? 0` y `scale ?? 1`. Mover un
      // sombreado le giraba el patrón 45° y le fijaba el espaciado en 1 unidad
      // — en milímetros, una mancha casi sólida.
      ...(entity.scale === undefined
        ? {}
        : { scale: entity.scale * cadTransformScaleFactor(transform) }),
      // El ángulo del patrón se REFLEJA, no se suma: bajo determinante negativo
      // pasa de α a `φ − α`. Sumarle el giro dejaría un ANSI31 a 45° inclinado
      // hacia el mismo lado después de espejarlo, así que el sombreado de la
      // planta reflejada saldría rayado al revés que su original — la clase de
      // error que sólo se ve en la lámina impresa, al comparar las dos alas.
      //
      // El `!reflecting` del guarda no sobra: un espejo sobre el eje X tiene
      // `angleBase === 0`, así que sin él un sombreado SIN ángulo explícito se
      // saltaba la escritura y conservaba su 45° por defecto — el único caso en
      // que la regla de reflexión se anulaba a sí misma, y justo el más común.
      ...(entity.angle === undefined && angleBase === 0 && !reflecting
        ? {}
        : {
            angle: normalizeAngleDeg(
              reflecting ? angleBase - (entity.angle ?? 45) : (entity.angle ?? 45) + angleBase,
            ),
          }),
      origin: entity.origin ? transformPoint(entity.origin, transform) : undefined,
      context: cloneContext(entity.context),
      };
    },
  },
};
