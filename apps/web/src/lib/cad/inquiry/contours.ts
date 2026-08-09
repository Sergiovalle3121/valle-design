/**
 * Geometría de las consultas: contornos, áreas y momentos.
 *
 * AREA, MASSPROP, REGION y OVERKILL necesitan lo mismo —convertir una entidad
 * en polígonos y medirlos— y lo necesitan igual. Escrito una vez aquí, los
 * cuatro comandos coinciden por construcción; escrito cuatro veces, el área que
 * imprime AREA y la que imprime MASSPROP acabarían discrepando en el cuarto
 * decimal y nadie sabría cuál creer.
 *
 * ## De dónde salen los contornos
 *
 * Del REGISTRO de adaptadores, no de un `switch` por tipo. `renderer.paths` ya
 * sabe teselar un arco de polilínea con `bulge`, una elipse recortada y una
 * NURBS, y sabrá hacerlo con lo que registren las olas siguientes. Un `switch`
 * aquí significaría que el día que T7 añada un tipo, AREA lo ignore en
 * silencio.
 *
 * ## Dónde SÍ hay un caso especial, y por qué
 *
 * Círculo y elipse. Su área tiene forma cerrada —`πr²`, `πab`— y la del
 * polígono de 192 lados que los aproxima no: se queda un 0,014 % corta. Para
 * dibujar da igual; para una medición que alguien va a facturar, no. El área se
 * toma exacta y los MOMENTOS se integran sobre la teselación, que es lo que
 * hace cualquier CAD y lo que este módulo dice en voz alta en vez de fingir
 * precisión analítica que no tiene.
 */
import type { CadDocument, CadEntity, CadPoint2 } from "../cad-document";
import { CAD_ENTITY_REGISTRY, type CadEntityRegistry } from "../entity-runtime";

/** Lados con los que se tesela una curva al medirla. */
export const CAD_MEASURE_SEGMENTS = 192;

export interface CadContour {
  points: readonly CadPoint2[];
  closed: boolean;
}

/**
 * Los contornos de una entidad, tal y como los dibuja su adaptador.
 *
 * Devuelve `[]` para lo que no tiene contorno medible: un MTEXT, una cota, una
 * directriz. Medir el área de una cota no es un error del usuario, es una
 * pregunta sin respuesta, y quien llama decide cómo decirlo.
 */
export function cadEntityContours(
  entity: CadEntity,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
  document?: CadDocument,
): CadContour[] {
  if (!registry.supports(entity)) return [];
  if (entity.type === "mtext" || entity.type === "dimension" || entity.type === "mleader")
    return [];
  if (entity.type === "attdef" || entity.type === "table" || entity.type === "image") return [];
  if (entity.type === "xline" || entity.type === "ray" || entity.type === "point") return [];
  if (entity.type === "hatch")
    return entity.boundaries.map((points) => ({ points, closed: true }));
  return registry
    .adapter(entity)
    .renderer.paths(entity, CAD_MEASURE_SEGMENTS, document)
    .filter((path) => path.points.length >= 2)
    .map((path) => ({ points: path.points, closed: path.closed }));
}

/**
 * Área con signo (positiva en sentido antihorario). El signo importa: es lo que
 * permite a MASSPROP restar un agujero sin pedirle al usuario que declare cuál
 * es el agujero.
 */
export function contourSignedArea(points: readonly CadPoint2[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

export function contourPerimeter(points: readonly CadPoint2[], closed: boolean): number {
  let total = 0;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export interface CadMassProperties {
  /** Positiva siempre; el signo ya se ha resuelto al sumar los contornos. */
  area: number;
  perimeter: number;
  centroid: CadPoint2;
  /** Segundos momentos respecto de los ejes del ORIGEN: ∫y²dA, ∫x²dA. */
  momentsOfInertia: { x: number; y: number };
  /** Producto de inercia ∫xy dA respecto del origen. */
  productOfInertia: number;
  /** Radios de giro respecto de los ejes del origen. */
  radiiOfGyration: { x: number; y: number };
  /** Momentos principales en el CENTROIDE, mayor primero, y su dirección. */
  principal: { major: number; minor: number; angleDeg: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface RawIntegral {
  area: number;
  ax: number;
  ay: number;
  ixx: number;
  iyy: number;
  ixy: number;
}

/** Integrales de Green sobre un polígono cerrado. Todas con signo. */
function integrate(points: readonly CadPoint2[]): RawIntegral {
  let area = 0;
  let ax = 0;
  let ay = 0;
  let ixx = 0;
  let iyy = 0;
  let ixy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    ax += (a.x + b.x) * cross;
    ay += (a.y + b.y) * cross;
    ixx += (a.y * a.y + a.y * b.y + b.y * b.y) * cross;
    iyy += (a.x * a.x + a.x * b.x + b.x * b.x) * cross;
    ixy += (a.x * b.y + 2 * a.x * a.y + 2 * b.x * b.y + b.x * a.y) * cross;
  }
  return {
    area: area / 2,
    ax: ax / 6,
    ay: ay / 6,
    ixx: ixx / 12,
    iyy: iyy / 12,
    ixy: ixy / 24,
  };
}

function emptyBounds() {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Propiedades de masa de un conjunto de contornos cerrados.
 *
 * Los contornos se suman CON SIGNO, así que un contorno dibujado al revés
 * dentro de otro se comporta como un agujero. Es la misma regla que la de
 * relleno par-impar de un HATCH, y por eso una región con agujeros medida aquí
 * pesa lo que su sombreado dibuja.
 */
export function cadMassProperties(contours: readonly CadContour[]): CadMassProperties | null {
  const closed = contours.filter((contour) => contour.points.length >= 3);
  if (closed.length === 0) return null;

  let total: RawIntegral = { area: 0, ax: 0, ay: 0, ixx: 0, iyy: 0, ixy: 0 };
  let perimeter = 0;
  const bounds = emptyBounds();
  // Los contornos llegan con la orientación con la que se dibujaron. Se toma la
  // del PRIMERO como referencia de «material»: así el signo relativo entre
  // contornos —que es lo que distingue un agujero de una isla— se conserva sin
  // obligar a nadie a dibujar en sentido antihorario.
  const reference = Math.sign(contourSignedArea(closed[0].points)) || 1;
  for (const contour of closed) {
    const raw = integrate(contour.points);
    total = {
      area: total.area + raw.area * reference,
      ax: total.ax + raw.ax * reference,
      ay: total.ay + raw.ay * reference,
      ixx: total.ixx + raw.ixx * reference,
      iyy: total.iyy + raw.iyy * reference,
      ixy: total.ixy + raw.ixy * reference,
    };
    perimeter += contourPerimeter(contour.points, true);
    for (const point of contour.points) {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    }
  }

  const area = total.area;
  if (Math.abs(area) < 1e-12) return null;
  const centroid = { x: total.ax / area, y: total.ay / area };
  const ixxC = total.ixx - area * centroid.y * centroid.y;
  const iyyC = total.iyy - area * centroid.x * centroid.x;
  const ixyC = total.ixy - area * centroid.x * centroid.y;
  const average = (ixxC + iyyC) / 2;
  const half = (ixxC - iyyC) / 2;
  const radius = Math.hypot(half, ixyC);
  return {
    area,
    perimeter,
    centroid,
    momentsOfInertia: { x: total.ixx, y: total.iyy },
    productOfInertia: total.ixy,
    radiiOfGyration: {
      x: Math.sqrt(Math.abs(total.ixx / area)),
      y: Math.sqrt(Math.abs(total.iyy / area)),
    },
    principal: {
      major: average + radius,
      minor: average - radius,
      // Dirección del eje del momento MAYOR. `atan2` de dos ceros da 0, que es
      // la respuesta correcta para una figura con simetría de revolución: no
      // hay dirección privilegiada y cualquiera vale.
      angleDeg: (Math.atan2(-2 * ixyC, ixxC - iyyC) * 90) / Math.PI,
    },
    bounds,
  };
}

export interface CadEntityAreaResult {
  area: number;
  perimeter: number;
  /**
   * `true` cuando la entidad estaba ABIERTA y se ha cerrado para poder medir.
   * Quien llama TIENE que decirlo: un área calculada sobre un contorno que el
   * usuario no cerró es un número correcto para una figura que no dibujó.
   */
  assumedClosed: boolean;
}

const CLOSED_BY_NATURE = new Set(["circle", "ellipse", "hatch", "solid", "wipeout"]);

/**
 * Área y perímetro de UNA entidad.
 *
 * `null` cuando la entidad no encierra nada medible. El arco es el caso que
 * sorprende: AutoCAD mide el área del SEGMENTO circular, no la del sector, y
 * eso es exactamente lo que sale de cerrar el arco por su cuerda.
 */
export function cadEntityArea(
  entity: CadEntity,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
  document?: CadDocument,
): CadEntityAreaResult | null {
  const contours = cadEntityContours(entity, registry, document);
  if (contours.length === 0) return null;
  const measurable = contours.filter((contour) => contour.points.length >= 3);
  if (measurable.length === 0) return null;

  let area = 0;
  let perimeter = 0;
  for (const contour of measurable) {
    area += Math.abs(contourSignedArea(contour.points));
    perimeter += contourPerimeter(contour.points, contour.closed);
  }

  // Forma cerrada donde la hay: la teselación se queda corta y una medición no
  // debe depender de con cuántos lados se dibujó el círculo.
  if (entity.type === "circle") {
    area = Math.PI * entity.radius * entity.radius;
    perimeter = 2 * Math.PI * entity.radius;
  } else if (entity.type === "ellipse") {
    const major = Math.hypot(entity.majorAxis.x, entity.majorAxis.y);
    const minor = major * entity.ratio;
    const full = Math.abs(entity.endParameter - entity.startParameter) >= Math.PI * 2 - 1e-9;
    if (full) {
      area = Math.PI * major * minor;
      // Ramanujan: el perímetro de una elipse no tiene forma cerrada elemental,
      // y esta aproximación yerra menos que la teselación en todo el rango.
      const h = ((major - minor) ** 2) / ((major + minor) ** 2);
      perimeter = Math.PI * (major + minor) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    }
  }

  const closed = CLOSED_BY_NATURE.has(entity.type) || measurable.every((c) => c.closed);
  return { area, perimeter, assumedClosed: !closed };
}

/** Área de un polígono definido por puntos sueltos, como el AREA por puntos. */
export function cadPolygonArea(points: readonly CadPoint2[]): CadEntityAreaResult | null {
  if (points.length < 3) return null;
  return {
    area: Math.abs(contourSignedArea(points)),
    perimeter: contourPerimeter(points, true),
    assumedClosed: true,
  };
}
