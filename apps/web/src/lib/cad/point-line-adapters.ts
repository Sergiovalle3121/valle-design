/**
 * Adaptadores de POINT, XLINE y RAY — el esquema 4 estrena estas tres.
 *
 * ## Lo que hace especiales a XLINE y RAY
 *
 * No tienen cota. Una recta de construcción es infinita en los dos sentidos y
 * una semirrecta lo es en uno, así que su `bounds()` contiene infinitos DE
 * VERDAD. No es una licencia: es lo que son, y fingir una caja finita
 * convertiría «¿cruza esta ventana?» en una mentira en cuanto la ventana
 * cayera fuera de la caja inventada.
 *
 * Eso obliga a dos cosas, y ninguna es opcional:
 *
 *  1. `CadSpatialIndex` enruta los bounds no finitos a su conjunto de
 *     DESBORDAMIENTO. Sin ese guardia la rejilla uniforme intenta recorrer de
 *     `-Infinity` a `+Infinity` y cuelga el editor entero, no sólo esa entidad.
 *  2. El `hitTester` NO puede delegar en la caja: se calcula la distancia a la
 *     recta (o a la semirrecta, proyectando y recortando en `t ≥ 0`) y la
 *     intersección REAL con la ventana. Con la caja infinita, toda XLINE del
 *     documento saldría seleccionada en cualquier ventana de captura.
 *
 * Los bounds se declaran además con SIGNO: un RAY que apunta a +X no es
 * infinito hacia −X, y decirlo mantiene el encuadre y las búsquedas tan
 * precisas como se pueda sin mentir.
 *
 * ## Reflexión
 *
 * `basePoint` es un PUNTO y `direction` es un VECTOR: el primero va por la
 * transformada completa y el segundo sólo por la parte lineal. Pasar la
 * dirección por la transformada de punto le sumaría la traslación y giraría la
 * recta en proporción a lo lejos que estuviera del origen. Con esta separación
 * la reflexión sale gratis y correcta: el vector reflejado ES la dirección
 * reflejada, sin casos especiales.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import { cadTransformPoint3, cadTransformScaleFactor, cadTransformVector3 } from "./transform2d";
import type {
  CadBounds,
  CadEntityAdapter,
  CadGrip,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
  CadSnapPoint,
} from "./entity-runtime";

type CadPointEntity = Extract<CadNativeEntity, { type: "point" }>;
type CadXLineEntity = Extract<CadNativeEntity, { type: "xline" }>;
type CadRayEntity = Extract<CadNativeEntity, { type: "ray" }>;
type CadInfiniteEntity = CadXLineEntity | CadRayEntity;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });

/**
 * Longitud del trazo con que se DIBUJA una recta infinita.
 *
 * Es una decisión de renderizado y nada más: los bounds, el impacto y la
 * selección por ventana usan la recta de verdad. Se elige un valor muy por
 * encima de cualquier plano real (100 km en milímetros) para que el trazo salga
 * siempre del viewport.
 */
const INFINITE_RENDER_REACH = 100_000_000;

/** Tamaño por defecto de la marca de un POINT, en unidades de dibujo. */
const DEFAULT_POINT_MARKER = 50;

function unitDirection(entity: CadInfiniteEntity): CadPoint2 | null {
  const length = Math.hypot(entity.direction.x, entity.direction.y);
  if (!(length > 1e-12)) return null;
  return { x: entity.direction.x / length, y: entity.direction.y / length };
}

// ---------------------------------------------------------------------------
// POINT
// ---------------------------------------------------------------------------

/**
 * Trazos de la marca según `style`, con los códigos de `PDMODE`:
 * el resto módulo 32 elige la figura central (0 punto, 1 nada, 2 cruz, 3 aspa,
 * 4 tick hacia arriba) y los bits 32 y 64 añaden círculo y cuadrado.
 */
function pointMarkerPaths(entity: CadPointEntity): CadRenderPath[] {
  const style = Number.isFinite(entity.style) ? Math.trunc(entity.style!) : 0;
  const radius = Math.abs(
    typeof entity.size === "number" && entity.size !== 0 ? entity.size : DEFAULT_POINT_MARKER,
  );
  const { x, y } = entity.position;
  const paths: CadRenderPath[] = [];
  const figure = ((style % 32) + 32) % 32;
  if (figure === 0)
    // Un punto no tiene trazo; se dibuja una cruz diminuta para que exista algo
    // que seleccionar y que el usuario vea dónde está.
    paths.push(
      { points: [{ x: x - radius * 0.06, y }, { x: x + radius * 0.06, y }], closed: false },
      { points: [{ x, y: y - radius * 0.06 }, { x, y: y + radius * 0.06 }], closed: false },
    );
  if (figure === 2)
    paths.push(
      { points: [{ x: x - radius, y }, { x: x + radius, y }], closed: false },
      { points: [{ x, y: y - radius }, { x, y: y + radius }], closed: false },
    );
  if (figure === 3)
    paths.push(
      { points: [{ x: x - radius, y: y - radius }, { x: x + radius, y: y + radius }], closed: false },
      { points: [{ x: x - radius, y: y + radius }, { x: x + radius, y: y - radius }], closed: false },
    );
  if (figure === 4) paths.push({ points: [{ x, y }, { x, y: y + radius }], closed: false });
  if (style >= 0 && (style & 32) !== 0)
    paths.push({
      points: Array.from({ length: 32 }, (_, index) => {
        const angle = (index / 32) * Math.PI * 2;
        return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
      }),
      closed: true,
    });
  if (style >= 0 && (style & 64) !== 0)
    paths.push({
      points: [
        { x: x - radius, y: y - radius },
        { x: x + radius, y: y - radius },
        { x: x + radius, y: y + radius },
        { x: x - radius, y: y + radius },
      ],
      closed: true,
    });
  return paths;
}

export const pointAdapter: CadEntityAdapter<CadPointEntity> = {
  type: "point",
  renderer: { paths: pointMarkerPaths },
  /**
   * La cota de un POINT es el PUNTO, no su marca. La marca es decoración de
   * viewport —`PDMODE 1` no dibuja nada en absoluto— y meterla aquí ataría el
   * encuadre del dibujo al estilo de visualización elegido.
   */
  bounds: {
    bounds: (entity) => ({
      minX: entity.position.x,
      minY: entity.position.y,
      maxX: entity.position.x,
      maxY: entity.position.y,
    }),
  },
  hitTester: {
    // Contra la POSICIÓN, no contra los trazos de la marca: con `PDMODE 1` no
    // hay trazos y el punto seguiría teniendo que poder seleccionarse.
    hitTest: (entity, point, tolerance) =>
      Math.hypot(point.x - entity.position.x, point.y - entity.position.y) <= tolerance,
    intersectsWindow: (entity, window) =>
      entity.position.x >= window.minX && entity.position.x <= window.maxX &&
      entity.position.y >= window.minY && entity.position.y <= window.maxY,
  },
  grips: {
    grips: (entity) => [
      { id: "position", kind: "endpoint", point: entity.position, label: "Punto" },
    ],
    moveGrip: (entity, gripId, point) =>
      gripId === "position" ? { ...entity, position: point3(point, entity.position.z) } : entity,
  },
  snaps: {
    snaps: (entity) => [{ kind: "endpoint", point: entity.position, label: "Nodo" }],
  },
  properties: {
    read: (entity) => ({
      x: entity.position.x,
      y: entity.position.y,
      style: entity.style ?? 0,
      size: entity.size ?? 0,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      position: {
        x: finite(patch.x, entity.position.x),
        y: finite(patch.y, entity.position.y),
        z: entity.position.z,
      },
      style: Math.trunc(finite(patch.style, entity.style ?? 0)),
      size: finite(patch.size, entity.size ?? 0),
      layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
    }),
  },
  commands: {
    transform: (entity, transform) => ({
      ...entity,
      position: cadTransformPoint3(entity.position, transform),
      // Un `size` NEGATIVO es un porcentaje del viewport en la convención de
      // `PDSIZE`, no una longitud: escalarlo no significaría nada. Sólo escala
      // el tamaño absoluto, y su ausencia se conserva ausente.
      ...(typeof entity.size === "number" && entity.size > 0
        ? { size: entity.size * cadTransformScaleFactor(transform) }
        : {}),
      context: entity.context ? structuredClone(entity.context) : undefined,
    }),
  },
};

// ---------------------------------------------------------------------------
// XLINE y RAY: lo que comparten
// ---------------------------------------------------------------------------

/** Distancia de un punto a la recta (XLINE) o a la semirrecta (RAY). */
function distanceToInfinite(entity: CadInfiniteEntity, point: CadPoint2): number {
  const unit = unitDirection(entity);
  const base = entity.basePoint;
  if (!unit) return Math.hypot(point.x - base.x, point.y - base.y);
  let t = (point.x - base.x) * unit.x + (point.y - base.y) * unit.y;
  // La semirrecta empieza en su punto base: un punto «detrás» se mide contra el
  // origen, no contra la prolongación que no existe.
  if (entity.type === "ray" && t < 0) t = 0;
  return Math.hypot(point.x - (base.x + unit.x * t), point.y - (base.y + unit.y * t));
}

/**
 * Bounds con SIGNO. Una XLINE vertical no es infinita en x, y un RAY que apunta
 * a +X no es infinito hacia −X. Decirlo con precisión mantiene útiles el
 * encuadre y las búsquedas; el infinito sólo aparece donde de verdad lo hay.
 */
function infiniteBounds(entity: CadInfiniteEntity): CadBounds {
  const base = entity.basePoint;
  const unit = unitDirection(entity);
  // Dirección degenerada: no define recta alguna. Se comporta como un punto en
  // vez de propagar `NaN` por el índice espacial y por todo el encuadre.
  if (!unit) return { minX: base.x, minY: base.y, maxX: base.x, maxY: base.y };
  const both = entity.type === "xline";
  const span = (component: number, origin: number) => {
    const forward = component > 1e-12;
    const backward = component < -1e-12;
    return {
      min: backward || (both && forward) ? -Infinity : origin,
      max: forward || (both && backward) ? Infinity : origin,
    };
  };
  const x = span(unit.x, base.x);
  const y = span(unit.y, base.y);
  return { minX: x.min, minY: y.min, maxX: x.max, maxY: y.max };
}

/** ¿La recta o semirrecta corta el rectángulo? Recorte de Liang–Barsky. */
function crossesWindow(entity: CadInfiniteEntity, window: CadBounds): boolean {
  const unit = unitDirection(entity);
  const base = entity.basePoint;
  if (!unit)
    return base.x >= window.minX && base.x <= window.maxX &&
      base.y >= window.minY && base.y <= window.maxY;
  let enter = entity.type === "ray" ? 0 : -Infinity;
  let exit = Infinity;
  const clip = (component: number, origin: number, min: number, max: number): boolean => {
    if (Math.abs(component) < 1e-12) return origin >= min && origin <= max;
    const first = (min - origin) / component;
    const second = (max - origin) / component;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    return true;
  };
  if (!clip(unit.x, base.x, window.minX, window.maxX)) return false;
  if (!clip(unit.y, base.y, window.minY, window.maxY)) return false;
  return enter <= exit;
}

function infiniteRenderPaths(entity: CadInfiniteEntity): CadRenderPath[] {
  const unit = unitDirection(entity);
  const base = entity.basePoint;
  if (!unit) return [];
  const back = entity.type === "xline" ? -INFINITE_RENDER_REACH : 0;
  return [
    {
      points: [
        { x: base.x + unit.x * back, y: base.y + unit.y * back },
        { x: base.x + unit.x * INFINITE_RENDER_REACH, y: base.y + unit.y * INFINITE_RENDER_REACH },
      ],
      closed: false,
    },
  ];
}

function infiniteGrips(entity: CadInfiniteEntity): CadGrip[] {
  const unit = unitDirection(entity) ?? { x: 1, y: 0 };
  // Los tiradores de dirección viven a una distancia FIJA y modesta del punto
  // base: si se pusieran al final del trazo de dibujo estarían a 100 km y el
  // usuario no podría alcanzarlos nunca.
  const reach = 1_000;
  const grips: CadGrip[] = [
    { id: "base", kind: "center", point: entity.basePoint, label: "Punto base" },
    {
      id: "direction",
      kind: "control",
      point: { x: entity.basePoint.x + unit.x * reach, y: entity.basePoint.y + unit.y * reach },
      label: "Dirección",
    },
  ];
  if (entity.type === "xline")
    grips.push({
      id: "direction:back",
      kind: "control",
      point: { x: entity.basePoint.x - unit.x * reach, y: entity.basePoint.y - unit.y * reach },
      label: "Dirección",
    });
  return grips;
}

function infiniteSnaps(entity: CadInfiniteEntity): CadSnapPoint[] {
  return [{ kind: "control", point: entity.basePoint, label: "Punto base" }];
}

function infiniteAdapter<E extends CadInfiniteEntity>(type: E["type"]): CadEntityAdapter<E> {
  return {
    type,
    renderer: { paths: (entity) => infiniteRenderPaths(entity) },
    bounds: { bounds: (entity) => infiniteBounds(entity) },
    hitTester: {
      hitTest: (entity, point, tolerance) => distanceToInfinite(entity, point) <= tolerance,
      intersectsWindow: (entity, window, crossing) => {
        // Una entidad SIN COTA nunca está CONTENIDA en una ventana finita, así
        // que la selección por ventana la deja fuera y la de captura la coge
        // sólo si de verdad la cruza. Delegar en `boundsContained` con bounds
        // infinitos daría siempre `false` por casualidad, y en
        // `boundsIntersect` daría siempre `true`, que es el error visible:
        // cualquier ventana seleccionaría todas las rectas del documento.
        if (!crossing) return false;
        return crossesWindow(entity, window);
      },
    },
    grips: {
      grips: (entity) => infiniteGrips(entity),
      moveGrip: (entity, gripId, point) => {
        if (gripId === "base") return { ...entity, basePoint: point3(point, entity.basePoint.z) };
        if (!gripId.startsWith("direction")) return entity;
        const sign = gripId === "direction:back" ? -1 : 1;
        const next = {
          x: (point.x - entity.basePoint.x) * sign,
          y: (point.y - entity.basePoint.y) * sign,
          z: entity.direction.z,
        };
        return Math.hypot(next.x, next.y) > 1e-12 ? { ...entity, direction: next } : entity;
      },
    },
    snaps: { snaps: (entity) => infiniteSnaps(entity) },
    properties: {
      read: (entity) => ({
        baseX: entity.basePoint.x,
        baseY: entity.basePoint.y,
        angle: (Math.atan2(entity.direction.y, entity.direction.x) * 180) / Math.PI,
        layer: entity.layer,
      }),
      write: (entity, patch) => {
        const degrees = finite(
          patch.angle,
          (Math.atan2(entity.direction.y, entity.direction.x) * 180) / Math.PI,
        );
        const radians = (degrees * Math.PI) / 180;
        const length = Math.hypot(entity.direction.x, entity.direction.y) || 1;
        return {
          ...entity,
          basePoint: {
            x: finite(patch.baseX, entity.basePoint.x),
            y: finite(patch.baseY, entity.basePoint.y),
            z: entity.basePoint.z,
          },
          direction: {
            x: Math.cos(radians) * length,
            y: Math.sin(radians) * length,
            z: entity.direction.z,
          },
          layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
        };
      },
    },
    commands: {
      transform: (entity, transform) => ({
        ...entity,
        basePoint: cadTransformPoint3(entity.basePoint, transform),
        // VECTOR: sólo la parte lineal. Bajo reflexión sale ya reflejado, sin
        // ningún caso especial que se pueda olvidar.
        direction: cadTransformVector3(entity.direction, transform),
        context: entity.context ? structuredClone(entity.context) : undefined,
      }),
    },
  };
}

export const xlineAdapter = infiniteAdapter<CadXLineEntity>("xline");
export const rayAdapter = infiniteAdapter<CadRayEntity>("ray");

/** Se exportan para las specs: la geometría de una recta infinita no es obvia. */
export const __testables = { crossesWindow, distanceToInfinite, infiniteBounds };
