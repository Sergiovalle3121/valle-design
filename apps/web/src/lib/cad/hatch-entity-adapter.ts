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

/**
 * Escalones LOD del sombreado, en la misma unidad —`segments`— que ya usa
 * cualquier otro adaptador con curvas. Duplican los valores de tier 0/1 de
 * `CAD_RENDER_LOD_SEGMENTS` (`render/tessellation-cache.ts`) a propósito: esa
 * constante vive detrás de `entity-runtime.ts`, que es quien IMPORTA este
 * adaptador para registrarlo — pedirla de vuelta desde aquí cerraría el mismo
 * ciclo que la nota de imports de la cabecera de este archivo ya advierte para
 * `entity-hit-geometry.ts`. La duplicación queda protegida por
 * `hatch-entity-adapter.spec.ts`, que la compara contra el tier real.
 */
const CAD_HATCH_LOD_OUTLINE_ONLY_MAX_SEGMENTS = 8;
const CAD_HATCH_LOD_COARSE_MAX_SEGMENTS = 32;
/** A tier medio, el espaciado se ensancha: se ve la trama, no cada trazo. */
const CAD_HATCH_LOD_COARSE_SPACING_FACTOR = 4;

const hatchRenderer: CadEntityRenderer<CadHatchEntity> = {
  // `segments` no llegaba a usarse: el patrón costaba lo mismo en un sombreado
  // de tres píxeles en pantalla que en uno a pantalla completa —14.000 hatches
  // × ~256 trazos en `architecture@100k`, iguales en cada escalón de zoom—.
  // Con el LOD real, sólo el tier completo paga el espaciado exacto del
  // patrón.
  paths: (entity, segments = 96) => {
    const boundaries = hatchBoundaries(entity);
    const outlines: CadRenderPath[] = boundaries.map((points) => ({ points, closed: true }));
    if (entity.solid || !boundaries[0]) return outlines;
    // Tier 0 (≤24 px aparentes, `CAD_RENDER_LOD_COARSE_MAX_PX`): un patrón de
    // rayado a ese tamaño es una mancha uniforme para el ojo. Sólo el contorno
    // dice algo; calcular miles de trazos que ni un píxel distingue es puro
    // coste sin ganancia visual, y es EXACTAMENTE el suelo `diagonal/256` que
    // hacía que 14.000 hatches costaran lo mismo abiertos que en detalle.
    if (segments <= CAD_HATCH_LOD_OUTLINE_ONLY_MAX_SEGMENTS) return outlines;
    const bounds = pointsBounds(boundaries.flat());
    const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    // Tier medio (≤320 px aparentes): el espaciado se ENSANCHA en vez de
    // respetar el patrón exacto — se ve la trama, no cada línea, con una
    // fracción de los trazos. Tier completo conserva el espaciado real, igual
    // que antes de que existiera este escalón.
    const coarseFactor =
      segments <= CAD_HATCH_LOD_COARSE_MAX_SEGMENTS ? CAD_HATCH_LOD_COARSE_SPACING_FACTOR : 1;
    const spacing = Math.max(entity.scale ?? diagonal / 40, diagonal / 256, 1e-6) * coarseFactor;
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
    // El `pathHit` de respaldo es para el clic AL BORDE, cuando el punto cae
    // fuera del polígono por el margen que decide `tolerance` — no necesita
    // los trazos de relleno para eso, sólo el contorno: cualquier trazo de
    // relleno vive DENTRO del área que `hatchRegionContainsPoint` ya acaba de
    // decir que no contiene al punto. Pedir tier 0 (`segments` bajo el umbral
    // de `CAD_HATCH_LOD_OUTLINE_ONLY_MAX_SEGMENTS`) regenera sólo el contorno
    // en vez de la trama entera —miles de trazos, sin uno solo que pudiera
    // haber cambiado el resultado— en cada fallo de contención.
    hitTest: (entity, point, tolerance) =>
      hatchContains(entity, point) ||
      pathHit(hatchRenderer.paths(entity, CAD_HATCH_LOD_OUTLINE_ONLY_MAX_SEGMENTS), point, tolerance),
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
