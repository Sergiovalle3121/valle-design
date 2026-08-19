/**
 * Sistemas de coordenadas personales (SCU/UCS): origen y tres ejes, en 3D.
 *
 * ## Por qué esto no es una preferencia cosmética
 *
 * Un edificio girado 23,5 grados respecto del norte se dibuja girando el
 * SISTEMA, no la geometría. A partir de ahí, todo lo que el CAD dice de un
 * punto —lo que imprime ID, los deltas de DIST, las coordenadas de LIST— tiene
 * que estar en ESE sistema, porque es en el que el dibujante piensa y en el que
 * están acotados sus planos. Un CAD que sabe girar la vista pero sigue
 * informando en coordenadas del mundo obliga a hacer la conversión a mano cada
 * vez, que es cuando aparecen los errores caros.
 *
 * ## Por qué un SCU 2D no bastaba, y qué se decidió
 *
 * Hasta esta ola un SCU era `origen 2D + giro alrededor de Z`. Con eso se
 * dibuja un edificio girado, y nada más: **no se puede dibujar sobre la cara de
 * un sólido**, que es la operación con la que empieza cualquier trabajo en tres
 * dimensiones —una perforación en una pieza inclinada, un faldón de cubierta,
 * una losa en pendiente—. Un giro alrededor de Z no puede expresar un plano
 * inclinado por definición: le faltan dos grados de libertad.
 *
 * Había dos caminos. **Extender** `CadNamedUcs` con ejes opcionales que, al
 * faltar, se derivan de `rotationDeg`; o **migrar** la firma a un marco 3D
 * completo y arrastrar a sus consumidores. Se eligió MIGRAR, y la razón es que
 * la primera deja dos representaciones del mismo hecho conviviendo dentro del
 * mismo objeto: un SCU con ejes Y con `rotationDeg` admite estados
 * contradictorios que ninguna función puede resolver sin adivinar, y la
 * adivinanza acabaría en ID informando una coordenada y DIST otra. Aquí el
 * marco es la ÚNICA verdad y `cadUcsRotationDeg` devuelve el giro en planta
 * cuando existe y `null` cuando el SCU está inclinado — que es un dato honesto,
 * no un campo muerto.
 *
 * El giro sigue existiendo donde sí es la forma natural de decirlo: la variable
 * `UCSANGLE` y `cadUcsFromRotation`. Lo que ya no existe es un `rotationDeg`
 * guardado al lado de unos ejes que podrían desmentirlo.
 *
 * ## Fallo cerrado
 *
 * Construir un SCU puede ser imposible —tres puntos alineados, un eje de
 * longitud cero, una normal degenerada—. Ninguna de esas funciones devuelve un
 * SCU «aproximado»: devuelven un `CadUcsFailure` con código y mensaje. Un SCU
 * mal construido no rompe nada al crearse; rompe tres horas después, cuando la
 * geometría dibujada sobre él aparece a un metro de donde debía.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";

/**
 * Un SCU: dónde está el origen y hacia dónde miran sus tres ejes, todo en
 * coordenadas del MUNDO. Los ejes son ortonormales y forman triedro directo;
 * las funciones de construcción de este archivo son las únicas que los fabrican
 * y todas garantizan esa condición.
 */
export interface CadNamedUcs {
  name: string;
  origin: CadPoint3;
  xAxis: CadPoint3;
  yAxis: CadPoint3;
  zAxis: CadPoint3;
}

export type CadUcsErrorCode =
  /** Un vector director de longitud prácticamente nula. */
  | "eje-nulo"
  /** Dos direcciones paralelas: no definen un plano. */
  | "ejes-paralelos"
  /** Tres puntos alineados: no definen un plano. */
  | "puntos-alineados"
  /** El plano del SCU se ve de canto desde la vista: no hay proyección única. */
  | "plano-de-canto"
  /** Se pidió el giro en planta de un SCU que no es paralelo al plano del mundo. */
  | "sin-planta";

export interface CadUcsFailure {
  ok: false;
  code: CadUcsErrorCode;
  message: string;
}

export type CadUcsOutcome = { ok: true; ucs: CadNamedUcs } | CadUcsFailure;

/**
 * Aritmética de vectores, local y mínima.
 *
 * No se importa `lib/brep/vec3` a propósito: de este módulo cuelgan la línea de
 * comandos y las consultas, y arrastrar hasta ellas el kernel de sólidos las
 * ataría a nueve mil líneas de geometría que no necesitan para girar un punto.
 * Son veinte líneas; la dependencia costaría mucho más que copiarlas.
 */
function v(x: number, y: number, z: number): CadPoint3 {
  return { x, y, z };
}

function toVec3(point: CadPoint2 | CadPoint3): CadPoint3 {
  return { x: point.x, y: point.y, z: "z" in point ? point.z : 0 };
}

function sub(a: CadPoint3, b: CadPoint3): CadPoint3 {
  return v(a.x - b.x, a.y - b.y, a.z - b.z);
}

function add(a: CadPoint3, b: CadPoint3): CadPoint3 {
  return v(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(a: CadPoint3, k: number): CadPoint3 {
  return v(a.x * k, a.y * k, a.z * k);
}

function dot(a: CadPoint3, b: CadPoint3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: CadPoint3, b: CadPoint3): CadPoint3 {
  return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function length(a: CadPoint3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: CadPoint3): CadPoint3 | null {
  const len = length(a);
  if (!(len > CAD_UCS_EPSILON)) return null;
  return scale(a, 1 / len);
}

/**
 * Umbral de degeneración. No es una tolerancia de dibujo: es el punto a partir
 * del cual normalizar un vector deja de tener sentido numérico. Los milímetros
 * del usuario se miden con la tolerancia de cada comando, no con esta.
 */
export const CAD_UCS_EPSILON = 1e-12;

/** Cuándo dos direcciones se consideran la misma a efectos de ortonormalizar. */
const PARALLEL_LIMIT = 1e-9;

const WORLD_X: CadPoint3 = { x: 1, y: 0, z: 0 };
const WORLD_Y: CadPoint3 = { x: 0, y: 1, z: 0 };
const WORLD_Z: CadPoint3 = { x: 0, y: 0, z: 1 };

export const CAD_WORLD_UCS: CadNamedUcs = {
  name: "*MUNDO*",
  origin: { x: 0, y: 0, z: 0 },
  xAxis: WORLD_X,
  yAxis: WORLD_Y,
  zAxis: WORLD_Z,
};

function fail(code: CadUcsErrorCode, message: string): CadUcsFailure {
  return { ok: false, code, message };
}

function nearlyEqual(a: CadPoint3, b: CadPoint3, tolerance: number): boolean {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.z - b.z) < tolerance
  );
}

export function isCadWorldUcs(ucs: CadNamedUcs, tolerance = 1e-9): boolean {
  return (
    Math.abs(ucs.origin.x) < tolerance &&
    Math.abs(ucs.origin.y) < tolerance &&
    Math.abs(ucs.origin.z) < tolerance &&
    nearlyEqual(ucs.xAxis, WORLD_X, tolerance) &&
    nearlyEqual(ucs.yAxis, WORLD_Y, tolerance) &&
    nearlyEqual(ucs.zAxis, WORLD_Z, tolerance)
  );
}

/**
 * ¿Es un SCU de PLANTA? Es decir: ¿su plano XY es el plano XY del mundo, con la
 * Z hacia el mismo lado?
 *
 * La pregunta no es académica. El visor 2D mira siempre a lo largo de la Z del
 * mundo, así que sólo estos SCU se pueden mostrar de frente girando la vista;
 * cualquier otro exige mover la cámara en tres dimensiones. Quien no distinga
 * los dos casos acaba enseñando un plano inclinado como si fuera una planta.
 */
export function isCadUcsPlanar(ucs: CadNamedUcs, tolerance = 1e-9): boolean {
  return dot(ucs.zAxis, WORLD_Z) > 1 - tolerance;
}

/**
 * El giro en planta del SCU, o `null` si el SCU está inclinado.
 *
 * El `null` es el sustituto honesto del antiguo campo `rotationDeg`: cuando el
 * SCU no es de planta, «su giro» no es un número pequeño ni un cero, es una
 * pregunta mal formulada. Quien lo pida tiene que decidir qué hace en ese caso.
 */
export function cadUcsRotationDeg(ucs: CadNamedUcs, tolerance = 1e-9): number | null {
  if (!isCadUcsPlanar(ucs, tolerance)) return null;
  const degrees = (Math.atan2(ucs.xAxis.y, ucs.xAxis.x) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

/**
 * El SCU 2D de siempre: origen y giro alrededor de la Z del mundo.
 *
 * Sigue siendo la forma natural de decirlo para el 95 % de los planos, y es lo
 * que escribe `UCSANGLE`. Lo que cambia respecto de la ola anterior es que ya
 * no se GUARDA así: se convierte a marco en el momento de construirlo, y a
 * partir de ahí sólo hay una representación.
 */
export function cadUcsFromRotation(
  name: string,
  origin: CadPoint2 | CadPoint3,
  rotationDeg: number,
): CadNamedUcs {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    name,
    origin: toVec3(origin),
    xAxis: v(cos, sin, 0),
    yAxis: v(-sin, cos, 0),
    zAxis: WORLD_Z,
  };
}

/** Mueve el origen y conserva los ejes. Es la opción «Origen» del comando UCS. */
export function cadUcsMoveOrigin(
  base: CadNamedUcs,
  origin: CadPoint2 | CadPoint3,
  name = base.name,
): CadNamedUcs {
  return { ...base, name, origin: toVec3(origin) };
}

/**
 * Ejes a partir de una normal, con el ALGORITMO DEL EJE ARBITRARIO.
 *
 * No se inventa: es el mismo que fija DXF para las entidades con extrusión, y
 * usar otro haría que la misma cara diera un SCU distinto aquí y al exportar.
 * El umbral de 1/64 es literal del formato: por debajo de él la normal se
 * considera «casi vertical» y el eje auxiliar pasa a ser la Y del mundo, para
 * que el resultado no dependa de ruido de coma flotante cerca del polo.
 */
export function cadUcsAxesFromNormal(
  normal: CadPoint3,
): { ok: true; xAxis: CadPoint3; yAxis: CadPoint3; zAxis: CadPoint3 } | CadUcsFailure {
  const z = normalize(normal);
  if (!z) return fail("eje-nulo", "La normal del plano tiene longitud cero: no define un SCU.");
  const auxiliary =
    Math.abs(z.x) < 1 / 64 && Math.abs(z.y) < 1 / 64 ? WORLD_Y : WORLD_Z;
  const x = normalize(cross(auxiliary, z));
  if (!x)
    return fail("eje-nulo", "No se pudo derivar el eje X del plano: la normal es degenerada.");
  return { ok: true, xAxis: x, yAxis: cross(z, x), zAxis: z };
}

/**
 * SCU sobre un plano dado por origen y normal, con una pista opcional de hacia
 * dónde debe mirar la X.
 *
 * La pista es lo que hace utilizable el SCU de cara: sin ella la X sale del
 * algoritmo del eje arbitrario y el dibujante se encuentra con unos ejes que no
 * se parecen a ninguna arista de la pieza. Con ella —la arista más larga de la
 * cara, por ejemplo— el sistema se alinea con lo que se está mirando.
 */
export function cadUcsFromPlane(
  name: string,
  origin: CadPoint2 | CadPoint3,
  normal: CadPoint3,
  xHint?: CadPoint3,
): CadUcsOutcome {
  const axes = cadUcsAxesFromNormal(normal);
  if (!axes.ok) return axes;
  if (!xHint) return { ok: true, ucs: { name, origin: toVec3(origin), ...axesOf(axes) } };

  // La pista se PROYECTA sobre el plano: pedir que la X mire hacia una arista
  // que no está contenida en el plano es lo normal (la arista viene de la
  // topología, no de una medición exacta), y rechazarlo obligaría al usuario a
  // afinar un dato que el programa puede corregir sin ambigüedad.
  const projected = sub(xHint, scale(axes.zAxis, dot(xHint, axes.zAxis)));
  const x = normalize(projected);
  if (!x)
    return fail(
      "ejes-paralelos",
      "La dirección propuesta para el eje X es perpendicular al plano del SCU.",
    );
  return {
    ok: true,
    ucs: { name, origin: toVec3(origin), xAxis: x, yAxis: cross(axes.zAxis, x), zAxis: axes.zAxis },
  };
}

function axesOf(axes: { xAxis: CadPoint3; yAxis: CadPoint3; zAxis: CadPoint3 }) {
  return { xAxis: axes.xAxis, yAxis: axes.yAxis, zAxis: axes.zAxis };
}

/**
 * SCU por TRES PUNTOS: origen, un punto sobre el eje X positivo y un punto del
 * semiplano XY positivo. Es la opción más usada del comando UCS porque se
 * responde señalando tres esquinas de lo que ya está dibujado.
 */
export function cadUcsFrom3Points(
  name: string,
  origin: CadPoint2 | CadPoint3,
  onXAxis: CadPoint2 | CadPoint3,
  onXYPlane: CadPoint2 | CadPoint3,
): CadUcsOutcome {
  const o = toVec3(origin);
  const x = normalize(sub(toVec3(onXAxis), o));
  if (!x)
    return fail("eje-nulo", "El punto del eje X coincide con el origen: no define una dirección.");
  const inPlane = sub(toVec3(onXYPlane), o);
  const z = normalize(cross(x, inPlane));
  if (!z)
    return fail(
      "puntos-alineados",
      "Los tres puntos están alineados: no definen un plano. Precise un tercer punto fuera del eje X.",
    );
  return { ok: true, ucs: { name, origin: o, xAxis: x, yAxis: cross(z, x), zAxis: z } };
}

/** SCU por su eje Z: el origen y un punto sobre la Z positiva. */
export function cadUcsFromZAxis(
  name: string,
  origin: CadPoint2 | CadPoint3,
  onZAxis: CadPoint2 | CadPoint3,
): CadUcsOutcome {
  const o = toVec3(origin);
  return cadUcsFromPlane(name, o, sub(toVec3(onZAxis), o));
}

/**
 * Gira el SCU alrededor de uno de SUS PROPIOS ejes.
 *
 * Alrededor del suyo y no del mundo: es lo que hace el comando UCS con sus
 * opciones X/Y/Z, y es lo único que permite encadenar dos giros y llegar donde
 * se quiere. Girar alrededor de los ejes del mundo haría que el segundo giro
 * deshiciera parte del primero.
 */
export function cadUcsRotateAbout(
  base: CadNamedUcs,
  axis: "x" | "y" | "z",
  degrees: number,
  name = base.name,
): CadNamedUcs {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotate = (u: CadPoint3, k: CadPoint3): CadPoint3 =>
    add(
      add(scale(u, cos), scale(cross(k, u), sin)),
      scale(k, dot(k, u) * (1 - cos)),
    );
  const k = axis === "x" ? base.xAxis : axis === "y" ? base.yAxis : base.zAxis;
  return {
    name,
    origin: base.origin,
    xAxis: rotate(base.xAxis, k),
    yAxis: rotate(base.yAxis, k),
    zAxis: rotate(base.zAxis, k),
  };
}

/**
 * SCU paralelo a la PANTALLA: la Z apunta hacia el observador.
 *
 * `forward` es la dirección en la que MIRA la cámara, y `up` la vertical de la
 * pantalla. La opción «Vista» del comando UCS existe para rotular: el texto que
 * se escriba en este SCU se lee de frente sea cual sea el punto de vista.
 */
export function cadUcsFromView(
  name: string,
  origin: CadPoint2 | CadPoint3,
  forward: CadPoint3,
  up: CadPoint3,
): CadUcsOutcome {
  const z = normalize(scale(forward, -1));
  if (!z) return fail("eje-nulo", "La dirección de vista tiene longitud cero.");
  const projected = sub(up, scale(z, dot(up, z)));
  const y = normalize(projected);
  if (!y)
    return fail(
      "ejes-paralelos",
      "La vertical de la pantalla es paralela a la dirección de vista: no define un SCU.",
    );
  return { ok: true, ucs: { name, origin: toVec3(origin), xAxis: cross(y, z), yAxis: y, zAxis: z } };
}

// ---------------------------------------------------------------------------
// Conversiones
// ---------------------------------------------------------------------------

/** Punto del mundo → punto en el SCU. Siempre 3D: un SCU inclinado tiene cota. */
export function worldToUcs(point: CadPoint2 | CadPoint3, ucs: CadNamedUcs): CadPoint3 {
  const d = sub(toVec3(point), ucs.origin);
  return v(dot(d, ucs.xAxis), dot(d, ucs.yAxis), dot(d, ucs.zAxis));
}

/** Punto en el SCU → punto del mundo. La `z` ausente significa «sobre el plano». */
export function ucsToWorld(point: CadPoint2 | CadPoint3, ucs: CadNamedUcs): CadPoint3 {
  const p = toVec3(point);
  return add(
    ucs.origin,
    add(add(scale(ucs.xAxis, p.x), scale(ucs.yAxis, p.y)), scale(ucs.zAxis, p.z)),
  );
}

/**
 * Un DESPLAZAMIENTO del mundo al SCU. No es lo mismo que convertir un punto: un
 * delta no se traslada, sólo se gira. Convertir un delta como si fuera un punto
 * le sumaría el origen y daría un `Delta X` desplazado — el error clásico.
 */
export function worldVectorToUcs(vector: CadPoint2 | CadPoint3, ucs: CadNamedUcs): CadPoint3 {
  const d = toVec3(vector);
  return v(dot(d, ucs.xAxis), dot(d, ucs.yAxis), dot(d, ucs.zAxis));
}

/** Un desplazamiento del SCU al mundo. */
export function ucsVectorToWorld(vector: CadPoint2 | CadPoint3, ucs: CadNamedUcs): CadPoint3 {
  const d = toVec3(vector);
  return add(add(scale(ucs.xAxis, d.x), scale(ucs.yAxis, d.y)), scale(ucs.zAxis, d.z));
}

/**
 * Ángulo del plano XY del MUNDO → ángulo en el plano XY del SCU.
 *
 * Se resuelve girando un vector unitario y midiendo su proyección sobre el
 * plano del SCU, no restando números: para un SCU de planta sale exactamente el
 * `ángulo − giro` de siempre, y para uno inclinado sale la proyección, que es
 * lo que AutoCAD informa. Restar el giro habría exigido que el giro existiera.
 */
export function worldAngleToUcs(degrees: number, ucs: CadNamedUcs): number {
  const radians = (degrees * Math.PI) / 180;
  const local = worldVectorToUcs(v(Math.cos(radians), Math.sin(radians), 0), ucs);
  return (Math.atan2(local.y, local.x) * 180) / Math.PI;
}

/** Ángulo de un desplazamiento del mundo, medido en el plano XY del SCU. */
export function cadUcsVectorAngle(vector: CadPoint2 | CadPoint3, ucs: CadNamedUcs): number {
  const local = worldVectorToUcs(vector, ucs);
  return (Math.atan2(local.y, local.x) * 180) / Math.PI;
}

/**
 * Un punto señalado en el LIENZO 2D, llevado al plano del SCU.
 *
 * El visor 2D entrega una coordenada `(x, y)` del mundo, sin cota: es una recta
 * vertical, no un punto. El punto que el usuario quiere es donde esa recta corta
 * el plano del SCU, que es exactamente lo que hace cualquier CAD al designar
 * sobre un SCU inclinado.
 *
 * Cuando el plano se ve de canto —su normal es perpendicular a la dirección de
 * vista— la recta no lo corta o lo corta entero, y no hay respuesta. Ahí se
 * FALLA CERRADO: devolver el punto sin cota parecería correcto en pantalla y
 * dejaría la geometría a metros de su sitio.
 */
export function cadUcsPointFromPlanPick(
  point: CadPoint2,
  ucs: CadNamedUcs,
): { ok: true; point: CadPoint3 } | CadUcsFailure {
  const denominator = dot(ucs.zAxis, WORLD_Z);
  if (Math.abs(denominator) < PARALLEL_LIMIT)
    return fail(
      "plano-de-canto",
      "El plano del SCU se ve de canto desde la vista en planta: no se puede designar un punto sobre él. " +
        "Gire la vista o fije un SCU distinto.",
    );
  const base = v(point.x, point.y, 0);
  const t = dot(sub(ucs.origin, base), ucs.zAxis) / denominator;
  return { ok: true, point: v(base.x, base.y, t) };
}

/** Distancia con signo de un punto del mundo al plano del SCU. */
export function cadUcsPlaneDistance(point: CadPoint2 | CadPoint3, ucs: CadNamedUcs): number {
  return dot(sub(toVec3(point), ucs.origin), ucs.zAxis);
}

/** Describe un SCU en un renglón, para `-UCSMAN` y para el propio comando UCS. */
export function describeCadUcs(ucs: CadNamedUcs, digits = 4): string {
  const n = (value: number) => Number(value.toFixed(digits));
  const origin = `origen (${n(ucs.origin.x)}, ${n(ucs.origin.y)}, ${n(ucs.origin.z)})`;
  const rotation = cadUcsRotationDeg(ucs);
  if (rotation !== null) return `${ucs.name}: ${origin}, giro ${n(rotation)}°`;
  return (
    `${ucs.name}: ${origin}, eje Z (${n(ucs.zAxis.x)}, ${n(ucs.zAxis.y)}, ${n(ucs.zAxis.z)})` +
    " — SCU inclinado, no tiene giro en planta"
  );
}

export class CadUcsCatalog {
  private items: CadNamedUcs[] = [];

  list = (): readonly CadNamedUcs[] => this.items;

  get = (name: string): CadNamedUcs | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadNamedUcs): void => {
    const key = item.name.trim().toUpperCase();
    const index = this.items.findIndex((entry) => entry.name.toUpperCase() === key);
    if (index >= 0) this.items = this.items.map((entry, at) => (at === index ? item : entry));
    else this.items = [...this.items, item].sort((a, b) => a.name.localeCompare(b.name));
  };

  remove = (name: string): boolean => {
    const key = name.trim().toUpperCase();
    const next = this.items.filter((entry) => entry.name.toUpperCase() !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  };
}
