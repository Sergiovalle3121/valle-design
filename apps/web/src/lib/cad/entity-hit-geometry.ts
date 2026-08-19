/**
 * Geometría compartida de impacto y encuadre.
 *
 * Vive fuera de `entity-runtime.ts` para romper un **ciclo de importación
 * real**: `entity-runtime` importa los adaptadores de cada entidad, así que un
 * adaptador que necesite estas funciones no puede pedírselas de vuelta. Con
 * tipos no pasaba nada —se borran al compilar— pero en cuanto un adaptador
 * importó un VALOR, el módulo reventó al cargarse con «Cannot access
 * 'hatchAdapter' before initialization».
 *
 * El `typecheck` no lo vio: TypeScript acepta los ciclos sin rechistar y el
 * fallo sólo existe en tiempo de ejecución. Lo cazó el benchmark de CAD, que es
 * lo que ocurre cuando un gate ejecuta código de verdad en vez de mirarlo.
 */
import type { CadPoint2 } from "./cad-document";
import type {
  CadBounds,
  CadBoundsProvider,
  CadEntityRenderer,
  CadHitTester,
  CadNativeEntity,
  CadRenderPath,
} from "./entity-runtime";

export function pointsBounds(points: CadPoint2[]): CadBounds {
  if (!points.length)
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  // Recorrido y NO `Math.min(...puntos)`. El operador de propagación convierte
  // cada punto en un ARGUMENTO de llamada, y toda máquina de JavaScript tiene un
  // tope de argumentos: medido en este árbol, Node v22 revienta con
  // «Maximum call stack size exceeded» entre 125.000 y 200.000, y el tope no es
  // el mismo en cada navegador. Un sombreado importado con una curva de nivel de
  // 200.000 puntos —geometría perfectamente legítima en un plano topográfico—
  // tiraba el editor entero con un desbordamiento de pila la primera vez que se
  // dibujaba, y no en Node: en la máquina del arquitecto. El recorrido no tiene
  // tope y cuesta lo mismo.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsContained(inner: CadBounds, outer: CadBounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

export function boundsIntersect(a: CadBounds, b: CadBounds): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY
  );
}

function distanceToSegment(
  point: CadPoint2,
  start: CadPoint2,
  end: CadPoint2,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-18) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / length2,
    ),
  );
  return Math.hypot(
    point.x - (start.x + t * dx),
    point.y - (start.y + t * dy),
  );
}

export function pathHit(paths: CadRenderPath[], point: CadPoint2, tolerance: number): boolean {
  return paths.some((path) => {
    for (let index = 1; index < path.points.length; index += 1) {
      if (
        distanceToSegment(point, path.points[index - 1], path.points[index]) <=
        tolerance
      )
        return true;
    }
    if (
      path.closed &&
      path.points.length > 2 &&
      distanceToSegment(
        point,
        path.points[path.points.length - 1],
        path.points[0],
      ) <= tolerance
    )
      return true;
    return false;
  });
}

/**
 * Impacto genérico: descarta por caja envolvente y luego mide contra el
 * trazado teselado. Vale para toda entidad cuya silueta ES su renderizado.
 *
 * Vive aquí y no en `entity-runtime.ts` porque lo usan los adaptadores, y un
 * adaptador no puede pedirle un valor al registro que los importa.
 */
export function commonHitTester<E extends CadNativeEntity>(
  renderer: CadEntityRenderer<E>,
  boundsProvider: CadBoundsProvider<E>,
): CadHitTester<E> {
  return {
    hitTest: (entity, point, tolerance) =>
      boundsIntersect(boundsProvider.bounds(entity), {
        minX: point.x - tolerance,
        minY: point.y - tolerance,
        maxX: point.x + tolerance,
        maxY: point.y + tolerance,
      }) && pathHit(renderer.paths(entity, 96), point, tolerance),
    intersectsWindow: (entity, window, crossing) => {
      const entityBounds = boundsProvider.bounds(entity);
      return crossing
        ? boundsIntersect(entityBounds, window)
        : boundsContained(entityBounds, window);
    },
  };
}

export function pointInPolygon(point: CadPoint2, polygon: CadPoint2[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Delega en `cadTransformPoint3`. Había dos copias y no coincidían en `z`. */
