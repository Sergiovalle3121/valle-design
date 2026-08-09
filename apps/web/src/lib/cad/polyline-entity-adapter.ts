/**
 * Adaptador de POLYLINE.
 *
 * Sale de `entity-runtime.ts` por el mismo camino que los de cota, sombreado y
 * directriz. Aquí vive la aritmética del `bulge` —el arco de cada tramo— y,
 * desde el esquema 4, el GROSOR por tramo.
 *
 * ## Las dos reglas que si se olvidan dan un dibujo plausible y falso
 *
 * 1. **`bulge` se NIEGA bajo reflexión.** Vale `tan(θ/4)` y su signo es lo
 *    único que codifica hacia qué lado de la cuerda se comba el arco. Reflejar
 *    sin negarlo deja los arcos combados al revés, con la misma silueta general
 *    y las esquinas invertidas.
 * 2. **El índice del vértice no se toca.** Reflejar invirtiendo la lista daría
 *    la misma silueta y rompería todo lo que apunta a un vértice por su
 *    posición: grips, cotas asociativas y el propio `bulge`, que vive en el
 *    vértice de ARRANQUE de cada tramo.
 *
 * ## El grosor
 *
 * `startWidth`/`endWidth` son longitudes, así que escalan con el factor de
 * escala de la transformada y no cambian bajo giro ni reflexión. Su AUSENCIA
 * se conserva: un vértice sin grosor sigue sin grosor después de moverse, o
 * cada traslación materializaría un grosor por defecto en todo el dibujo y
 * dispararía un guardado espurio (la versión de una entidad se calcula con
 * `JSON.stringify`).
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
// De `entity-hit-geometry` y NO de `entity-runtime`: aquél importa este módulo,
// así que pedirle un VALOR de vuelta cierra un ciclo que revienta al cargar.
import { commonHitTester } from "./entity-hit-geometry";
import { cadTransformIsReflecting, cadTransformPoint3, cadTransformScaleFactor } from "./transform2d";
import type {
  CadBoundsProvider,
  CadEntityAdapter,
  CadEntityRenderer,
  CadNativeEntity,
  CadPropertyValue,
  CadSnapPoint,
} from "./entity-runtime";

export type CadPolylineEntity = Extract<CadNativeEntity, { type: "polyline" }>;
export type CadPolylineVertex = CadPolylineEntity["vertices"][number];

export interface CadPolylineArc {
  center: CadPoint2;
  radius: number;
  startAngle: number;
  sweep: number;
}

function finite(value: CadPropertyValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Arco de un segmento con `bulge`, en la convención DXF: `bulge = tan(θ/4)`,
 * positivo = sentido antihorario. Devuelve `null` cuando el segmento es recto
 * o degenerado para que el llamador use la recta.
 *
 * El centro se sitúa a `R·cos(θ/2)` de la mitad de la cuerda, sobre la
 * perpendicular girada +90°; con esa elección barrer `+θ` desde el vértice
 * inicial aterriza exactamente en el final.
 */
export function polylineArc(
  start: CadPolylineVertex,
  end: CadPoint3,
): CadPolylineArc | null {
  const bulge =
    typeof start.bulge === "number" && Number.isFinite(start.bulge)
      ? start.bulge
      : 0;
  if (Math.abs(bulge) < 1e-12) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return null;
  const theta = 4 * Math.atan(bulge);
  const halfSin = Math.sin(theta / 2);
  if (Math.abs(halfSin) < 1e-12) return null;
  const radius = chord / (2 * halfSin);
  const offset = radius * Math.cos(theta / 2);
  const center = {
    x: (start.x + end.x) / 2 + (-dy / chord) * offset,
    y: (start.y + end.y) / 2 + (dx / chord) * offset,
  };
  return {
    center,
    radius: Math.abs(radius),
    startAngle: Math.atan2(start.y - center.y, start.x - center.x),
    sweep: theta,
  };
}

/** Segmentos (inicio, fin) recorridos por la polilínea, cerrando si procede. */
export function polylineSegments(
  entity: CadPolylineEntity,
): { start: CadPolylineVertex; end: CadPolylineVertex }[] {
  const vertices = entity.vertices;
  if (vertices.length < 2) return [];
  const count = entity.closed ? vertices.length : vertices.length - 1;
  return Array.from({ length: count }, (_, index) => ({
    start: vertices[index],
    end: vertices[(index + 1) % vertices.length],
  }));
}

export function polylinePoints(
  entity: CadPolylineEntity,
  segments = 96,
): CadPoint2[] {
  const vertices = entity.vertices;
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return [{ x: vertices[0].x, y: vertices[0].y }];
  const perArc = Math.max(
    2,
    Math.ceil(segments / Math.max(1, vertices.length)),
  );
  const points: CadPoint2[] = [];
  for (const { start, end } of polylineSegments(entity)) {
    points.push({ x: start.x, y: start.y });
    const arc = polylineArc(start, end);
    if (!arc) continue;
    for (let step = 1; step < perArc; step += 1) {
      const angle = arc.startAngle + (arc.sweep * step) / perArc;
      points.push({
        x: arc.center.x + Math.cos(angle) * arc.radius,
        y: arc.center.y + Math.sin(angle) * arc.radius,
      });
    }
  }
  if (!entity.closed) {
    const tail = vertices[vertices.length - 1];
    points.push({ x: tail.x, y: tail.y });
  }
  return points;
}

const polylineRenderer: CadEntityRenderer<CadPolylineEntity> = {
  paths: (entity, segments = 96) => {
    const points = polylinePoints(entity, segments);
    if (points.length === 0) return [];
    return [{ points, closed: entity.closed }];
  },
};

/**
 * Bounds EXACTOS: los vértices no bastan cuando un segmento tiene `bulge`,
 * porque el arco puede sobresalir de la cuerda. Se añaden los puntos
 * cardinales del arco que caen dentro del barrido.
 *
 * El GROSOR no ensancha estos bounds a propósito: es un atributo de trazado,
 * igual que el lineweight, y meterlo aquí haría que el índice espacial y el
 * encuadre dependieran del estilo de dibujo y no de la geometría.
 */
const polylineBounds: CadBoundsProvider<CadPolylineEntity> = {
  bounds: (entity) => {
    const vertices = entity.vertices;
    if (vertices.length === 0)
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const include = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const vertex of vertices) include(vertex.x, vertex.y);
    const twoPi = Math.PI * 2;
    for (const { start, end } of polylineSegments(entity)) {
      const arc = polylineArc(start, end);
      if (!arc) continue;
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const cardinal = (quadrant * Math.PI) / 2;
        const raw = cardinal - arc.startAngle;
        const delta = ((raw % twoPi) + twoPi) % twoPi;
        const inSweep =
          arc.sweep >= 0
            ? delta <= arc.sweep + 1e-9
            : delta - twoPi >= arc.sweep - 1e-9;
        if (!inSweep) continue;
        include(
          arc.center.x + Math.cos(cardinal) * arc.radius,
          arc.center.y + Math.sin(cardinal) * arc.radius,
        );
      }
    }
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  },
};

/** Grosor uniforme declarado, o `null` si los tramos no coinciden. */
function uniformWidth(entity: CadPolylineEntity): number | null {
  const widths = entity.vertices.flatMap((vertex) =>
    [vertex.startWidth, vertex.endWidth].filter(
      (value): value is number => typeof value === "number",
    ),
  );
  if (widths.length === 0) return null;
  return widths.every((width) => Math.abs(width - widths[0]) < 1e-9) ? widths[0] : null;
}

export const polylineAdapter: CadEntityAdapter<CadPolylineEntity> = {
  type: "polyline",
  renderer: polylineRenderer,
  bounds: polylineBounds,
  hitTester: commonHitTester(polylineRenderer, polylineBounds),
  grips: {
    grips: (entity) =>
      entity.vertices.map((vertex, index) => ({
        id: `vertex:${index}`,
        kind: "endpoint" as const,
        point: { x: vertex.x, y: vertex.y },
        label: `Vértice ${index + 1}`,
      })),
    moveGrip: (entity, gripId, point) => {
      const index = Number(gripId.split(":")[1]);
      if (!Number.isInteger(index) || !entity.vertices[index]) return entity;
      return {
        ...entity,
        vertices: entity.vertices.map((vertex, current) =>
          current === index
            ? { ...vertex, x: point.x, y: point.y }
            : { ...vertex },
        ),
      };
    },
  },
  snaps: {
    snaps: (entity) => {
      const points: CadSnapPoint[] = entity.vertices.map((vertex, index) => ({
        kind: "endpoint" as const,
        point: { x: vertex.x, y: vertex.y },
        label: `Vértice ${index + 1}`,
      }));
      polylineSegments(entity).forEach(({ start, end }, index) => {
        const arc = polylineArc(start, end);
        if (arc) {
          points.push({
            kind: "center",
            point: arc.center,
            label: `Centro del arco ${index + 1}`,
          });
          const mid = arc.startAngle + arc.sweep / 2;
          points.push({
            kind: "control",
            point: {
              x: arc.center.x + Math.cos(mid) * arc.radius,
              y: arc.center.y + Math.sin(mid) * arc.radius,
            },
            label: `Punto medio del arco ${index + 1}`,
          });
          return;
        }
        points.push({
          kind: "control",
          point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          label: `Punto medio ${index + 1}`,
        });
      });
      return points;
    },
  },
  properties: {
    read: (entity) => ({
      vertexCount: entity.vertices.length,
      segmentCount: polylineSegments(entity).length,
      arcSegments: polylineSegments(entity).filter(
        ({ start, end }) => polylineArc(start, end) !== null,
      ).length,
      closed: entity.closed,
      // `-1` significa «grosor variable»: el panel no puede mostrar UN número
      // cuando cada tramo tiene el suyo, y fingir el primero sería mentir.
      width: uniformWidth(entity) ?? -1,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      // Escribir el grosor lo aplica a TODOS los tramos, que es lo que hace
      // PEDIT > Grosor. Un valor negativo se ignora: es el código de «variable»
      // que devuelve `read`, no una orden.
      ...(typeof patch.width === "number" && patch.width >= 0
        ? {
            vertices: entity.vertices.map((vertex) => ({
              ...vertex,
              startWidth: finite(patch.width, 0),
              endWidth: finite(patch.width, 0),
            })),
          }
        : {}),
      closed: typeof patch.closed === "boolean" ? patch.closed : entity.closed,
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const factor = cadTransformScaleFactor(transform);
      return {
        ...entity,
        vertices: entity.vertices.map((vertex) => ({
          ...cadTransformPoint3(vertex, transform),
          ...(vertex.bulge !== undefined
            ? { bulge: reflecting ? -vertex.bulge : vertex.bulge }
            : {}),
          ...(vertex.startWidth === undefined ? {} : { startWidth: vertex.startWidth * factor }),
          ...(vertex.endWidth === undefined ? {} : { endWidth: vertex.endWidth * factor }),
        })),
        context: entity.context ? structuredClone(entity.context) : undefined,
      };
    },
  },
};
