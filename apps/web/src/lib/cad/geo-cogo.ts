/**
 * COGO: la aritmética de un levantamiento (Ola I, 3er entregable, 2026-09-04).
 *
 * Medido antes (`distancia-autocad-completo-20260903.md`, §4 3º MAP 3D): el
 * dibujo ya sabía DÓNDE está (`georeference.ts`, Ola G) y sabía meter un
 * predio de un shapefile (`geo-cad-document.ts`), y seguía sin saber la única
 * cuenta que un topógrafo hace todos los días: levantar una poligonal a partir
 * de rumbos y distancias, decir con cuánto cierra y cuánta superficie encierra.
 * Sin eso, el cuadro de construcción —la lámina que en México se protocoliza
 * ante el Registro Público— se teclea a mano en una tabla, y AutoCAD sin
 * Civil 3D tampoco la hace.
 *
 * Este módulo es aritmética PURA: no conoce entidades, ni comandos, ni
 * unidades de dibujo. Recibe números y devuelve números. Quien traduce entre
 * metros y unidades del documento es el comando (`engine/commands/geo-cogo.ts`),
 * y quien sabe dónde cae el predio en el mundo es `georeference.ts`.
 *
 * ## Las tres convenciones, escritas para que no se discutan
 *
 * 1. **El azimut se mide desde el NORTE y en sentido HORARIO**, de 0 a 360.
 *    Es la convención de topografía, y es la CONTRARIA a la del resto del
 *    motor, donde un ángulo son grados antihorarios desde el este (+X). Las
 *    dos conviven en `cadAzimuthToRadians` y su inversa, que son la única
 *    frontera entre los dos mundos: fuera de esas dos funciones, en este
 *    archivo «ángulo» siempre significa azimut.
 * 2. **El rumbo se mide desde el meridiano hacia el este o el oeste**, nunca
 *    más de 90°: `N 45°30'20" E`. Es lo que trae la libreta de campo y lo que
 *    el Registro lee. El azimut es la forma de calcular; el rumbo, la de
 *    escribir.
 * 3. **X es el este y Y el norte.** Un punto de este módulo es un punto del
 *    plano con esa lectura, así que `dx = d·sen(az)` y `dy = d·cos(az)` —el
 *    seno en la X, que es justo al revés de lo que sale de memoria.
 *
 * ## Lo que NO hace, dicho aquí
 *
 * - No convierte distancia de cuadrícula a distancia en el terreno: el factor
 *   de escala de la proyección UTM (0,9996 en el meridiano central) y la
 *   reducción al nivel del mar quedan fuera, igual que en el propio marcador
 *   geográfico. Una poligonal medida con cinta y una calculada sobre la
 *   cuadrícula no son la misma longitud, y fingir que sí lo son es el error
 *   que mueve un lindero cuatro centímetros por kilómetro.
 * - No compensa por mínimos cuadrados. La compensación que sí hay es la REGLA
 *   DEL COMPÁS (Bowditch), que es la que se enseña y la que un cuadro de
 *   construcción declara; y no se aplica sola: hay que pedirla.
 * - No lee ángulos de un aparato ni corrige por convergencia de meridianos.
 */
import type { CadPoint2 } from "./cad-document";
import { cadRingArea } from "./engine/commands/architecture-support";
import { DEFAULT_REGION_PROFILE, formatRegionNumber, type RegionProfile } from "./region";

/* ── Grados, minutos y segundos ─────────────────────────────────────────── */

/** Grados, minutos y segundos. El signo, si lo hay, va en `degrees`. */
export interface CadDms {
  degrees: number;
  minutes: number;
  seconds: number;
}

/** Lo que devuelve todo lo que LEE texto: el valor, o el motivo del rechazo. */
export type CadCogoParse<T> = { ok: true; value: T } | { ok: false; reason: string };

const fail = (reason: string): CadCogoParse<never> => ({ ok: false, reason });

/** Grados en `[0, 360)`. Un azimut de −30 es 330, no un error del que rotula. */
export function cadNormalizeAzimuth(degrees: number): number {
  if (!Number.isFinite(degrees)) return NaN;
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Los grados decimales de un `d m s`. */
export function cadDmsToDegrees(dms: CadDms): number {
  const magnitude = Math.abs(dms.degrees) + Math.abs(dms.minutes) / 60 + Math.abs(dms.seconds) / 3600;
  return dms.degrees < 0 ? -magnitude : magnitude;
}

/**
 * Grados decimales → `d m s`, ya REDONDEADO a los decimales de segundo que se
 * van a escribir.
 *
 * El redondeo va aquí y no en el formateador porque es donde puede producir un
 * acarreo: `44.99999°` con segundos enteros son `45°00'00"`, no `44°59'60"`.
 * Un campo de 60 en un cuadro de construcción es una errata que el Registro
 * devuelve.
 */
export function cadDegreesToDms(degrees: number, secondsDecimals = 0): CadDms {
  const total = Math.abs(degrees);
  let whole = Math.floor(total);
  const minutesReal = (total - whole) * 60;
  let minutes = Math.floor(minutesReal);
  const factor = 10 ** secondsDecimals;
  let seconds = Math.round((minutesReal - minutes) * 60 * factor) / factor;
  if (seconds >= 60) {
    seconds -= 60;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes -= 60;
    whole += 1;
  }
  return { degrees: degrees < 0 ? -whole : whole, minutes, seconds };
}

function padSeconds(seconds: number, decimals: number): string {
  const text = seconds.toFixed(decimals);
  return Number(seconds) < 10 ? `0${text}` : text;
}

/** `45°30'20"`, con minutos y segundos a dos cifras, como se lee en un plano. */
export function cadFormatDms(degrees: number, secondsDecimals = 0): string {
  const dms = cadDegreesToDms(degrees, secondsDecimals);
  const sign = degrees < 0 ? "-" : "";
  const minutes = String(dms.minutes).padStart(2, "0");
  return `${sign}${Math.abs(dms.degrees)}°${minutes}'${padSeconds(dms.seconds, secondsDecimals)}"`;
}

/**
 * Lee `45°30'20"` y todas las formas con que se teclea de verdad: `45d30m20s`,
 * `45-30-20`, `45 30 20`, `45°30'`, `45.5`.
 *
 * Rechaza con MOTIVO en vez de degradar a 0. Un rumbo que se lee mal y sale
 * como cero no se detecta mirando el número: se detecta cuando el lindero ya
 * está trazado noventa grados fuera de sitio.
 */
export function cadParseDms(text: string): CadCogoParse<number> {
  const raw = text.trim();
  if (!raw) return fail("no hay ángulo que leer: se escribe «45°30'20\"», «45d30m20s» o «45.5».");
  const negative = raw.startsWith("-");
  const body = (negative ? raw.slice(1) : raw)
    .replace(/[°º′″'"dDmMsS:\-]/g, " ")
    .trim();
  const fields = body.split(/\s+/).filter(Boolean);
  if (fields.length === 0) return fail(`«${raw}» no tiene ninguna cifra: un ángulo son grados, y si acaso minutos y segundos.`);
  if (fields.length > 3) return fail(`«${raw}» trae ${fields.length} campos: un ángulo son tres como mucho (grados, minutos y segundos).`);
  const numbers: number[] = [];
  for (const field of fields) {
    if (!/^\d+(?:\.\d+)?$/.test(field)) return fail(`«${field}» no es una cifra de un ángulo, en «${raw}».`);
    numbers.push(Number(field));
  }
  const [degrees, minutes = 0, seconds = 0] = numbers;
  if (fields.length > 1 && minutes >= 60) return fail(`los minutos van de 0 a 59; «${raw}» trae ${minutes}.`);
  if (fields.length > 2 && seconds >= 60) return fail(`los segundos van de 0 a menos de 60; «${raw}» trae ${seconds}.`);
  const value = degrees + minutes / 60 + seconds / 3600;
  return { ok: true, value: negative ? -value : value };
}

/* ── Rumbos por cuadrante ───────────────────────────────────────────────── */

export type CadBearingQuadrant = "NE" | "SE" | "SW" | "NW";

/**
 * Un rumbo: el cuadrante y el ángulo desde el meridiano, en `[0, 90]`.
 *
 * Los cuatro ejes tienen forma canónica —norte es `NE` con ángulo 0, este es
 * `NE` con 90, sur es `SE` con 0 y oeste es `SW` con 90— para que
 * azimut → rumbo → texto → rumbo → azimut vuelva EXACTO también en los
 * límites, que es donde un rumbo con dos escrituras posibles pierde una cifra.
 */
export interface CadBearing {
  quadrant: CadBearingQuadrant;
  angleDeg: number;
}

/** Azimut (horario desde el norte) del rumbo. */
export function cadBearingAzimuth(bearing: CadBearing): number {
  const angle = bearing.angleDeg;
  switch (bearing.quadrant) {
    case "NE":
      return cadNormalizeAzimuth(angle);
    case "SE":
      return cadNormalizeAzimuth(180 - angle);
    case "SW":
      return cadNormalizeAzimuth(180 + angle);
    case "NW":
      return cadNormalizeAzimuth(360 - angle);
  }
}

/** Rumbo del azimut, en la forma canónica de los ejes. */
export function cadAzimuthBearing(azimuthDeg: number): CadBearing {
  const azimuth = cadNormalizeAzimuth(azimuthDeg);
  if (azimuth <= 90) return { quadrant: "NE", angleDeg: azimuth };
  if (azimuth <= 180) return { quadrant: "SE", angleDeg: 180 - azimuth };
  if (azimuth <= 270) return { quadrant: "SW", angleDeg: azimuth - 180 };
  return { quadrant: "NW", angleDeg: 360 - azimuth };
}

export interface CadBearingFormat {
  /** Decimales del campo de segundos. 0 en un cuadro de construcción. */
  secondsDecimals?: number;
  /**
   * `true` (de fábrica): los cuatro ejes se escriben `N`, `S`, `E` y `W` a
   * secas, como en una libreta de campo y como hace `unit-angle.ts` con
   * `AUNITS 4`. `false` escribe siempre los tres campos —`N 0°00'00" E`—, que
   * es lo que algunas notarías piden para que la columna quede pareja.
   */
  cardinal?: boolean;
}

const AXIS_EPSILON = 1e-9;

/** `N 45°30'20" E`. La forma en que un rumbo se escribe en un plano. */
export function cadFormatBearing(bearing: CadBearing, options: CadBearingFormat = {}): string {
  const decimals = options.secondsDecimals ?? 0;
  const cardinal = options.cardinal ?? true;
  const north = bearing.quadrant === "NE" || bearing.quadrant === "NW";
  const east = bearing.quadrant === "NE" || bearing.quadrant === "SE";
  if (cardinal) {
    if (Math.abs(bearing.angleDeg) < AXIS_EPSILON) return north ? "N" : "S";
    if (Math.abs(bearing.angleDeg - 90) < AXIS_EPSILON) return east ? "E" : "W";
  }
  return `${north ? "N" : "S"} ${cadFormatDms(bearing.angleDeg, decimals)} ${east ? "E" : "W"}`;
}

const CARDINALS: Readonly<Record<string, CadBearing>> = {
  N: { quadrant: "NE", angleDeg: 0 },
  NORTE: { quadrant: "NE", angleDeg: 0 },
  S: { quadrant: "SE", angleDeg: 0 },
  SUR: { quadrant: "SE", angleDeg: 0 },
  E: { quadrant: "NE", angleDeg: 90 },
  ESTE: { quadrant: "NE", angleDeg: 90 },
  ORIENTE: { quadrant: "NE", angleDeg: 90 },
  W: { quadrant: "SW", angleDeg: 90 },
  O: { quadrant: "SW", angleDeg: 90 },
  OESTE: { quadrant: "SW", angleDeg: 90 },
  PONIENTE: { quadrant: "SW", angleDeg: 90 },
};

/**
 * Lee un rumbo escrito como se escribe: `N 45°30'20" E`, `N45d30m20sE`,
 * `S 12-04-10 O`, `N`, `SUR`. La `O` de oeste se acepta junto a la `W`, porque
 * las dos aparecen en cuadros mexicanos y rechazar una sería rechazar la mitad
 * de las libretas.
 *
 * Cada rechazo dice qué falla. Nunca devuelve un rumbo «por defecto»: un cero
 * inventado es un lindero al norte.
 */
export function cadParseBearing(text: string): CadCogoParse<CadBearing> {
  const raw = text.trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw) return fail("un rumbo vacío no es un rumbo: se escribe «N 45°30'20\" E».");
  const cardinal = CARDINALS[raw];
  if (cardinal) return { ok: true, value: { ...cardinal } };
  const first = raw[0];
  if (first !== "N" && first !== "S")
    return fail(`un rumbo empieza por N o por S —el meridiano desde el que se mide—, y «${text.trim()}» empieza por «${first}».`);
  const last = raw[raw.length - 1];
  if (last !== "E" && last !== "W" && last !== "O")
    return fail(`un rumbo termina en E, W u O —hacia dónde se abre—, y «${text.trim()}» termina en «${last}».`);
  // Sin compactar los espacios: «N 45 30 20 E» es una escritura legítima y
  // pegar sus campos daría el ángulo 453020, que no es de este mundo.
  const middle = raw.slice(1, -1).trim();
  if (!middle) return fail(`«${text.trim()}» no trae ángulo entre el meridiano y el cuadrante: se escribe «N 45°30'20\" E».`);
  const angle = cadParseDms(middle);
  if (!angle.ok) return fail(`en «${text.trim()}»: ${angle.reason}`);
  if (angle.value < 0 || angle.value > 90)
    return fail(`el ángulo de un rumbo va de 0° a 90° porque se mide desde el meridiano; «${text.trim()}» trae ${angle.value.toFixed(4)}°. Un valor mayor cabe en un azimut, no en un rumbo.`);
  const quadrant = (first === "N" ? "N" : "S") + (last === "E" ? "E" : "W");
  return { ok: true, value: { quadrant: quadrant as CadBearingQuadrant, angleDeg: angle.value } };
}

/* ── El puente con el ángulo del motor ──────────────────────────────────── */

/**
 * Azimut → radianes del DIBUJO (antihorario desde +X), que es como el motor
 * guarda cualquier giro. Es la única frontera entre las dos convenciones.
 */
export function cadAzimuthToRadians(azimuthDeg: number): number {
  return ((90 - cadNormalizeAzimuth(azimuthDeg)) * Math.PI) / 180;
}

/** La vuelta: radianes del dibujo → azimut de topografía. */
export function cadRadiansToAzimuth(radians: number): number {
  return cadNormalizeAzimuth(90 - (radians * 180) / Math.PI);
}

/* ── Tramos y poligonal ─────────────────────────────────────────────────── */

/** Un tramo del levantamiento: hacia dónde y cuánto. */
export interface CadCourse {
  bearing: CadBearing;
  /** Longitud, en la unidad en que venga la lista. Este módulo no la traduce. */
  distance: number;
  /** Lo que traía el renglón antes del rumbo (la estación, si venía). */
  label?: string;
}

/**
 * Área con signo de un anillo, por Gauss, TRASLADADA al primer vértice.
 *
 * El traslado no es un adorno: sobre coordenadas UTM de siete cifras los
 * productos `x·y` de la fórmula valen 1,4 × 10¹² y el área que sale de
 * restarlos vale unos miles, así que el `float64` —dieciséis cifras
 * significativas— se come seis y la superficie de un predio baila en la quinta
 * décima. Restar el primer vértice es exactamente reversible, no cambia el
 * área ni un ápice y devuelve las seis cifras. La suma en sí es `cadRingArea`,
 * que ya existía y ya tiene spec: aquí sólo se le da bien condicionado el
 * anillo.
 */
function signedRingArea(points: readonly CadPoint2[]): number {
  const origin = points[0];
  return cadRingArea(points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })));
}

/** El desplazamiento de un tramo: `X` al este, `Y` al norte. */
export function cadCourseDelta(course: CadCourse): { dx: number; dy: number } {
  const azimuth = (cadBearingAzimuth(course.bearing) * Math.PI) / 180;
  return { dx: course.distance * Math.sin(azimuth), dy: course.distance * Math.cos(azimuth) };
}

/** Rumbo y distancia entre dos puntos. `null` si coinciden: no hay rumbo que dar. */
export function cadBearingBetween(from: CadPoint2, to: CadPoint2): { bearing: CadBearing; distance: number; azimuthDeg: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return null;
  const azimuthDeg = cadNormalizeAzimuth((Math.atan2(dx, dy) * 180) / Math.PI);
  return { bearing: cadAzimuthBearing(azimuthDeg), distance, azimuthDeg };
}

export interface CadTraverseClosure {
  /** Del último punto calculado de vuelta a la estación 1. */
  dx: number;
  dy: number;
  distance: number;
  /** Rumbo del error de cierre; `null` cuando el cierre es exactamente cero. */
  bearing: CadBearing | null;
  /** Perímetro ÷ cierre. `Infinity` si cierra exacto. Es el «1:N» del cuadro. */
  precision: number;
}

export interface CadTraverseResult {
  start: CadPoint2;
  /** `n + 1` puntos: la estación 1 y el punto que produce cada tramo. */
  points: CadPoint2[];
  /** Las `n` estaciones del polígono: `points` sin el punto de retorno. */
  stations: CadPoint2[];
  courses: readonly CadCourse[];
  perimeter: number;
  closure: CadTraverseClosure;
  /** Superficie por Gauss sobre las estaciones. `null` en poligonal abierta. */
  area: number | null;
  /** Sentido del recorrido por el signo del área. `null` si no cierra figura. */
  orientation: "ccw" | "cw" | null;
}

export interface CadTraverseOptions {
  /**
   * `true` de fábrica: la lista describe un predio y el último tramo vuelve a
   * la estación 1, así que el polígono son las `n` estaciones y la superficie
   * significa algo. Con `false` no se calcula superficie —una poligonal de
   * apoyo no encierra nada— pero el cierre se informa igual, porque saber a
   * qué distancia quedó el último punto del primero sirve en las dos.
   */
  closed?: boolean;
}

/**
 * Levanta la poligonal: parte de un punto y encadena los tramos.
 *
 * No cierra nada a la fuerza. El último punto queda donde las cuentas lo
 * dejan y el error de cierre se DECLARA, que es lo que hace un topógrafo antes
 * de decidir si compensa o si vuelve al campo.
 */
export function cadTraverse(start: CadPoint2, courses: readonly CadCourse[], options: CadTraverseOptions = {}): CadTraverseResult {
  const closed = options.closed ?? true;
  const points: CadPoint2[] = [{ x: start.x, y: start.y }];
  let perimeter = 0;
  for (const course of courses) {
    const previous = points[points.length - 1];
    const delta = cadCourseDelta(course);
    points.push({ x: previous.x + delta.dx, y: previous.y + delta.dy });
    perimeter += course.distance;
  }
  const last = points[points.length - 1];
  const dx = start.x - last.x;
  const dy = start.y - last.y;
  const distance = Math.hypot(dx, dy);
  const closure: CadTraverseClosure = {
    dx,
    dy,
    distance,
    bearing: distance > 0 ? cadAzimuthBearing(cadNormalizeAzimuth((Math.atan2(dx, dy) * 180) / Math.PI)) : null,
    precision: distance > 0 ? perimeter / distance : Number.POSITIVE_INFINITY,
  };
  const stations = closed ? points.slice(0, points.length - 1) : [...points];
  const signed = closed && stations.length >= 3 ? signedRingArea(stations) : null;
  return {
    start: { x: start.x, y: start.y },
    points,
    stations,
    courses,
    perimeter,
    closure,
    area: signed === null ? null : Math.abs(signed),
    orientation: signed === null ? null : signed >= 0 ? "ccw" : "cw",
  };
}

/* ── Compensación por la regla del compás (Bowditch) ────────────────────── */

export interface CadCompensatedTraverse {
  /** Las `n` estaciones ya corregidas: el polígono cierra EXACTO. */
  stations: CadPoint2[];
  /** Rumbos y distancias recalculados sobre las estaciones corregidas. */
  courses: CadCourse[];
  /** Cuánto se movió cada estación, en la unidad de las distancias. */
  shifts: number[];
  maxShift: number;
  perimeter: number;
  area: number;
}

/**
 * Reparte el error de cierre entre los tramos EN PROPORCIÓN A SU LONGITUD.
 *
 * Es la regla del compás: supone que el error se acumula por igual a lo largo
 * de la cinta, que es la hipótesis razonable cuando los ángulos están mejor
 * medidos que las distancias. No se aplica sola —hay que pedirla— y quien la
 * pide se lleva escrito cuánto se movió cada vértice: un cuadro compensado sin
 * decir cuánto se compensó es un cuadro que oculta la calidad del
 * levantamiento.
 *
 * `null` si la poligonal no llega a polígono o si su perímetro es cero.
 */
export function cadCompensateTraverse(traverse: CadTraverseResult): CadCompensatedTraverse | null {
  const courses = traverse.courses;
  if (courses.length < 3 || !(traverse.perimeter > 0)) return null;
  const stations: CadPoint2[] = [{ ...traverse.start }];
  const shifts: number[] = [0];
  let accumulated = 0;
  for (let index = 0; index < courses.length - 1; index += 1) {
    accumulated += courses[index].distance;
    const share = accumulated / traverse.perimeter;
    const raw = traverse.points[index + 1];
    const corrected = { x: raw.x + traverse.closure.dx * share, y: raw.y + traverse.closure.dy * share };
    stations.push(corrected);
    shifts.push(Math.hypot(corrected.x - raw.x, corrected.y - raw.y));
  }
  const adjusted: CadCourse[] = [];
  let perimeter = 0;
  for (let index = 0; index < stations.length; index += 1) {
    const from = stations[index];
    const to = stations[(index + 1) % stations.length];
    const leg = cadBearingBetween(from, to);
    if (!leg) return null;
    adjusted.push({ bearing: leg.bearing, distance: leg.distance, label: courses[index]?.label });
    perimeter += leg.distance;
  }
  return { stations, courses: adjusted, shifts, maxShift: Math.max(...shifts), perimeter, area: Math.abs(signedRingArea(stations)) };
}

/* ── Ángulos interiores y cierre angular ────────────────────────────────── */

export interface CadTraverseAngles {
  /** Ángulo interior en cada estación, en grados, en el orden del recorrido. */
  angles: number[];
  orientation: "ccw" | "cw";
  sum: number;
  /** `(n − 2) · 180`, que es lo que suman los interiores de todo polígono. */
  expected: number;
}

/**
 * Los ángulos INTERIORES que implican los rumbos de una poligonal cerrada.
 *
 * Aviso que importa y que se dice aquí para que nadie lo lea como lo que no
 * es: esta suma cierra por CONSTRUCCIÓN. Los azimutes ya arrastran el ángulo
 * de cada estación, así que la suma sólo puede apartarse de `(n − 2)·180` en
 * múltiplos de 360°, y eso ocurre exactamente cuando la poligonal se cruza o
 * da dos vueltas —que es lo que este cálculo sí detecta—. El error de cierre
 * ANGULAR de campo se mide contra los ángulos LEÍDOS en el aparato, y para eso
 * está `cadAngularClosure`, que recibe esas lecturas.
 */
export function cadInteriorAngles(courses: readonly CadCourse[], stations?: readonly CadPoint2[]): CadTraverseAngles | null {
  const count = courses.length;
  if (count < 3) return null;
  const azimuths = courses.map((course) => cadBearingAzimuth(course.bearing));
  // Ángulo a la IZQUIERDA del recorrido en cada estación: del azimut inverso
  // del tramo que llega al azimut del tramo que sale.
  const left = azimuths.map((azimuth, index) => cadNormalizeAzimuth(azimuth - (azimuths[(index - 1 + count) % count] + 180)));
  const ring = stations ?? cadTraverse({ x: 0, y: 0 }, courses).stations;
  const orientation = signedRingArea(ring) >= 0 ? "ccw" : "cw";
  // En un recorrido antihorario el interior queda a la izquierda; en uno
  // horario, a la derecha, y el ángulo interior es el suplemento a la vuelta.
  const angles = left.map((angle) => (orientation === "ccw" ? angle : cadNormalizeAzimuth(360 - angle)));
  const sum = angles.reduce((total, angle) => total + angle, 0);
  return { angles, orientation, sum, expected: (count - 2) * 180 };
}

export interface CadAngularClosure {
  count: number;
  sum: number;
  expected: number;
  errorDeg: number;
  errorSeconds: number;
  /** El reparto que tocaría a cada estación si se compensara el ángulo. */
  perStationSeconds: number;
}

/**
 * El cierre ANGULAR de verdad: la suma de los ángulos LEÍDOS contra los
 * `(n − 2)·180` que suman los interiores de un polígono de `n` lados.
 *
 * Esta es la cuenta que decide si se vuelve al campo. Un tránsito de 20"
 * en una poligonal de cinco lados que suma 1'40" de error está en tolerancia;
 * uno que suma 3' no, y ningún reparto lo arregla.
 */
export function cadAngularClosure(anglesDeg: readonly number[]): CadAngularClosure {
  const count = anglesDeg.length;
  const sum = anglesDeg.reduce((total, angle) => total + angle, 0);
  const expected = (count - 2) * 180;
  const errorDeg = sum - expected;
  return {
    count,
    sum,
    expected,
    errorDeg,
    errorSeconds: errorDeg * 3600,
    perStationSeconds: count > 0 ? (errorDeg * 3600) / count : 0,
  };
}

/**
 * De la libreta de tránsito a los tramos: el azimut del primer lado más el
 * ángulo interior de cada estación siguiente.
 *
 * Es el camino que hace REAL el cierre angular: con los ángulos leídos, un
 * error de 20" en una estación se propaga a los rumbos siguientes y aparece
 * como error de cierre lineal, que es exactamente lo que pasa en campo.
 */
export function cadCoursesFromAngles(
  firstAzimuthDeg: number,
  legs: readonly { distance: number; interiorAngleDeg?: number; label?: string }[],
  options: { orientation?: "ccw" | "cw" } = {},
): CadCourse[] {
  const orientation = options.orientation ?? "ccw";
  const courses: CadCourse[] = [];
  let azimuth = cadNormalizeAzimuth(firstAzimuthDeg);
  legs.forEach((leg, index) => {
    if (index > 0) {
      const interior = leg.interiorAngleDeg ?? 0;
      azimuth = cadNormalizeAzimuth(azimuth + 180 + (orientation === "ccw" ? interior : -interior));
    }
    courses.push({ bearing: cadAzimuthBearing(azimuth), distance: leg.distance, label: leg.label });
  });
  return courses;
}

/* ── Lectura de un cuadro pegado ────────────────────────────────────────── */

export interface CadCourseLineError {
  /** Número de renglón, base 1, tal y como se pegó. */
  line: number;
  text: string;
  reason: string;
}

export interface CadCourseBlock {
  courses: CadCourse[];
  errors: CadCourseLineError[];
}

const AZIMUTH_PREFIX = /^(AZ|AZIMUT|AZIMUTH)\b/i;
/** Un campo que puede ser la etiqueta de una estación: ni ángulo ni distancia. */
const LABEL_FIELD = /^[A-Za-z0-9._]+$/;

/**
 * Un renglón: `[etiqueta] RUMBO DISTANCIA`.
 *
 * La distancia es SIEMPRE el último campo, porque es lo único que no cambia
 * entre las mil maneras de escribir un cuadro. El rumbo se busca hacia atrás
 * desde ahí, y lo que quede por delante es la etiqueta de la estación, que se
 * conserva. `AZ 125°30'00" 25.40` da el mismo tramo por azimut, para quien
 * trabaja con el aparato y no con la libreta.
 */
export function cadParseCourse(line: string): CadCogoParse<CadCourse> {
  // La coma separa campos (`1, 2, N 45°30'20" E, 25.40`) y por eso se recorta
  // de las puntas de cada campo; lo que NO se hace es quitarla de DENTRO de un
  // número. «25,401» es 25 401 para quien escribe millares y 25,401 para quien
  // escribe decimales con coma, y no hay forma de distinguirlos: se rechaza
  // diciéndolo, que es la única salida que no se equivoca por mil.
  const tokens = line
    .trim()
    .split(/[\s;\t]+/)
    .map((token) => token.replace(/^,+|,+$/g, ""))
    .filter(Boolean);
  if (tokens.length < 2) return fail(`«${line.trim()}» no es un tramo: hacen falta un rumbo y una distancia.`);
  const distanceText = tokens[tokens.length - 1];
  if (distanceText.includes(","))
    return fail(`la distancia se escribe sin separador de millares: «${distanceText}» se escribe «${distanceText.replaceAll(",", "")}».`);
  const distance = Number(distanceText);
  if (!Number.isFinite(distance)) return fail(`el último campo de un tramo es la distancia, y «${distanceText}» no es un número.`);
  if (!(distance > 0)) return fail(`una distancia de ${distanceText} no levanta ningún lado: tiene que ser mayor que cero.`);
  const head = tokens.slice(0, tokens.length - 1);
  let reason = "";
  // Se prueba con todos los campos y se van soltando etiquetas por delante:
  // «1 2 N 45°30'20" E 25.40» y «N45°30'20"E 25.40» entran por el mismo sitio.
  for (let skip = 0; skip < head.length; skip += 1) {
    // Sólo se sueltan por delante campos que PARECEN etiqueta. Sin esta
    // condición, «X 12°00'00" E 10» acabaría leyéndose como el rumbo «E»
    // después de tirar el ángulo entero: un renglón roto que se dibuja.
    if (skip > 0 && !LABEL_FIELD.test(head[skip - 1])) break;
    const text = head.slice(skip).join(" ");
    const azimuth = AZIMUTH_PREFIX.test(text) ? cadParseDms(text.replace(AZIMUTH_PREFIX, "").trim()) : null;
    if (azimuth) {
      if (!azimuth.ok) return fail(`en «${line.trim()}»: ${azimuth.reason}`);
      const label = head.slice(0, skip).join(" ") || undefined;
      return { ok: true, value: { bearing: cadAzimuthBearing(azimuth.value), distance, label } };
    }
    const bearing = cadParseBearing(text);
    if (bearing.ok) {
      const label = head.slice(0, skip).join(" ") || undefined;
      return { ok: true, value: { bearing: bearing.value, distance, label } };
    }
    if (skip === 0) reason = bearing.reason;
  }
  return fail(`en «${line.trim()}»: ${reason}`);
}

/**
 * El cuadro entero, un tramo por renglón. Los renglones vacíos y los que
 * empiezan por `#` se saltan; los que no se entienden se DEVUELVEN con su
 * motivo y su número, nunca se descartan en silencio: un lado que desaparece
 * de una poligonal la cierra sola y con la superficie equivocada.
 */
export function cadParseCourses(block: string): CadCourseBlock {
  const courses: CadCourse[] = [];
  const errors: CadCourseLineError[] = [];
  block.split(/\r?\n/).forEach((line, index) => {
    const text = line.trim();
    if (!text || text.startsWith("#")) return;
    const parsed = cadParseCourse(text);
    if (parsed.ok) courses.push(parsed.value);
    else errors.push({ line: index + 1, text, reason: parsed.reason });
  });
  return { courses, errors };
}

/* ── El cuadro de construcción ──────────────────────────────────────────── */

/** Las siete columnas que pide el Registro Público, en su orden. */
export const CAD_CONSTRUCTION_TABLE_HEADER: readonly string[] = ["EST", "PV", "RUMBO", "DISTANCIA", "V", "X", "Y"];

export interface CadConstructionTableOptions {
  /** Etiqueta de cada vértice. Por omisión `1`, `2`, `3`… */
  labels?: readonly string[];
  distanceDecimals?: number;
  coordinateDecimals?: number;
  areaDecimals?: number;
  secondsDecimals?: number;
  /** Separador de millares y decimal. Es configuración regional, no constante. */
  region?: RegionProfile;
}

export interface CadConstructionTable {
  header: readonly string[];
  /** Un renglón por lado, con las siete celdas ya escritas. */
  rows: string[][];
  courses: CadCourse[];
  /** Superficie por Gauss, en la unidad de las coordenadas al cuadrado. */
  area: number;
  perimeter: number;
  orientation: "ccw" | "cw";
  areaLabel: string;
  perimeterLabel: string;
}

function number(value: number, decimals: number, region: RegionProfile): string {
  return formatRegionNumber(value, region, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * El cuadro de construcción de un polígono ya cerrado: `EST · PV · RUMBO ·
 * DISTANCIA · V · X · Y`, un renglón por lado, y la superficie por Gauss.
 *
 * Las coordenadas entran YA en metros y ya en el sistema en que se van a
 * publicar —el este/norte de verdad si el dibujo está georreferenciado— porque
 * este módulo no sabe de unidades de dibujo ni de marcadores: eso lo resuelve
 * el comando antes de llamar.
 */
export function cadConstructionTable(coordinates: readonly CadPoint2[], options: CadConstructionTableOptions = {}): CadConstructionTable | null {
  const count = coordinates.length;
  if (count < 3) return null;
  const region = options.region ?? DEFAULT_REGION_PROFILE;
  const distanceDecimals = options.distanceDecimals ?? 3;
  const coordinateDecimals = options.coordinateDecimals ?? 3;
  const areaDecimals = options.areaDecimals ?? 2;
  const secondsDecimals = options.secondsDecimals ?? 0;
  const labels = Array.from({ length: count }, (_unused, index) => options.labels?.[index] ?? String(index + 1));
  const courses: CadCourse[] = [];
  const rows: string[][] = [];
  let perimeter = 0;
  for (let index = 0; index < count; index += 1) {
    const from = coordinates[index];
    const to = coordinates[(index + 1) % count];
    const leg = cadBearingBetween(from, to);
    if (!leg) return null;
    courses.push({ bearing: leg.bearing, distance: leg.distance, label: labels[index] });
    perimeter += leg.distance;
    rows.push([
      labels[index],
      labels[(index + 1) % count],
      cadFormatBearing(leg.bearing, { secondsDecimals }),
      number(leg.distance, distanceDecimals, region),
      labels[index],
      number(from.x, coordinateDecimals, region),
      number(from.y, coordinateDecimals, region),
    ]);
  }
  const signed = signedRingArea(coordinates);
  const area = Math.abs(signed);
  return {
    header: CAD_CONSTRUCTION_TABLE_HEADER,
    rows,
    courses,
    area,
    perimeter,
    orientation: signed >= 0 ? "ccw" : "cw",
    areaLabel: `${number(area, areaDecimals, region)} m²`,
    perimeterLabel: `${number(perimeter, distanceDecimals, region)} m`,
  };
}

/** «1:348 787», el número con el que se juzga un levantamiento. */
export function cadFormatPrecision(precision: number, region: RegionProfile = DEFAULT_REGION_PROFILE): string {
  if (!Number.isFinite(precision)) return "cierre exacto";
  return `1:${formatRegionNumber(Math.round(precision), region, { maximumFractionDigits: 0 })}`;
}
