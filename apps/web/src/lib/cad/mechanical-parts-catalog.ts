/**
 * EL CATÁLOGO DE MEDIDAS de los normalizados que no son tornillería
 * (2026-09-04): rodamientos rígidos de bolas y chavetas paralelas.
 *
 * Vive aparte de `mechanical-parts.ts` por una razón medida y no por gusto:
 * ese archivo dibuja, y el presupuesto de monolito le da 800 líneas. Dos
 * tablas normalizadas —veintiséis rodamientos y dieciséis anchos de chaveta—
 * son datos, no geometría; meterlas donde se dibuja acercaría al techo un
 * archivo que todavía tiene que crecer con las piezas que faltan. Aquí las
 * tablas se leen de corrido y se cotejan contra la norma en papel sin
 * atravesar el código que las dibuja.
 *
 * ## Rodamientos: ISO 15
 *
 * Series 62 y 63 (designaciones 62xx y 63xx), que son las dos que un plano de
 * conjunto mexicano lleva casi siempre: la 6200 «ligera» y la 6300 «media»
 * para la misma serie de diámetros. `d` es el agujero, `D` el exterior y `B`
 * el ancho, en milímetros, tal como los da la tabla de ISO 15 para rodamientos
 * radiales rígidos de una hilera de bolas.
 *
 * ## Chavetas: ISO 773 (equivalente a DIN 6885)
 *
 * La tabla NO se indexa por la chaveta sino por el DIÁMETRO DEL EJE, que es lo
 * que el proyectista tiene delante: el eje manda la sección b × h, y con ella
 * vienen las dos profundidades del cuñero —`t1` en el eje y `t2` en el cubo—,
 * que son las cotas que se mecanizan y las que faltan en el 90 % de los planos
 * que llegan al taller. El intervalo es «mayor que … y hasta …»: un eje de
 * Ø30 exacto cae en la fila de 22 a 30 (8 × 7) y no en la siguiente. Esa
 * trampa es la misma que la de «sin exceder de» en la Tabla 250-122 y se
 * codifica igual, con `>` en el mínimo y `<=` en el máximo.
 */

// ---------------------------------------------------------------------------
// Rodamientos rígidos de bolas — ISO 15, series 62 y 63
// ---------------------------------------------------------------------------

/** Las tres medidas principales de un rodamiento radial, en milímetros. */
export interface CadBearingSize {
  /** Diámetro del agujero (el del eje). */
  d: number;
  /** Diámetro exterior (el del alojamiento). */
  D: number;
  /** Ancho. */
  B: number;
}

export const CAD_BEARING_SIZES: Readonly<Record<string, CadBearingSize>> = {
  // Serie 62 — ligera.
  "6200": { d: 10, D: 30, B: 9 },
  "6201": { d: 12, D: 32, B: 10 },
  "6202": { d: 15, D: 35, B: 11 },
  "6203": { d: 17, D: 40, B: 12 },
  "6204": { d: 20, D: 47, B: 14 },
  "6205": { d: 25, D: 52, B: 15 },
  "6206": { d: 30, D: 62, B: 16 },
  "6207": { d: 35, D: 72, B: 17 },
  "6208": { d: 40, D: 80, B: 18 },
  "6209": { d: 45, D: 85, B: 19 },
  "6210": { d: 50, D: 90, B: 20 },
  "6211": { d: 55, D: 100, B: 21 },
  "6212": { d: 60, D: 110, B: 22 },
  // Serie 63 — media: mismo agujero, más exterior y más ancho.
  "6300": { d: 10, D: 35, B: 11 },
  "6301": { d: 12, D: 37, B: 12 },
  "6302": { d: 15, D: 42, B: 13 },
  "6303": { d: 17, D: 47, B: 14 },
  "6304": { d: 20, D: 52, B: 15 },
  "6305": { d: 25, D: 62, B: 17 },
  "6306": { d: 30, D: 72, B: 19 },
  "6307": { d: 35, D: 80, B: 21 },
  "6308": { d: 40, D: 90, B: 23 },
  "6309": { d: 45, D: 100, B: 25 },
  "6310": { d: 50, D: 110, B: 27 },
  "6311": { d: 55, D: 120, B: 29 },
  "6312": { d: 60, D: 130, B: 31 },
};

/** Las designaciones del catálogo, en orden: es lo que se enumera al negar. */
export const CAD_BEARING_LIST: readonly string[] = Object.keys(CAD_BEARING_SIZES);

/**
 * Las medidas de una designación tecleada, o `null` si no está en el catálogo.
 *
 * Se normalizan el espacio sobrante y la caja —« 6204 » es 6204—, y nada más:
 * una designación es un código, y un catálogo que adivina qué quiso teclearse
 * acaba insertando un rodamiento que nadie pidió.
 */
export function cadBearingSizeFor(designation: string): CadBearingSize | null {
  const key = designation.trim().toUpperCase();
  return CAD_BEARING_SIZES[key] ?? null;
}

// ---------------------------------------------------------------------------
// Chavetas paralelas — ISO 773 / DIN 6885 forma A
// ---------------------------------------------------------------------------

/** Una fila de la tabla de ISO 773, indexada por el diámetro del eje. */
export interface CadKeySize {
  /** El eje debe ser MAYOR que este diámetro (mm). */
  overShaft: number;
  /** …y menor o igual que este (mm). */
  upToShaft: number;
  /** Ancho de la chaveta b (mm). */
  b: number;
  /** Altura de la chaveta h (mm). */
  h: number;
  /** Profundidad del cuñero en el EJE, t1 (mm). */
  t1: number;
  /** Profundidad del cuñero en el CUBO, t2 (mm). */
  t2: number;
}

export const CAD_KEY_SIZES: readonly CadKeySize[] = [
  { overShaft: 6, upToShaft: 8, b: 2, h: 2, t1: 1.2, t2: 1 },
  { overShaft: 8, upToShaft: 10, b: 3, h: 3, t1: 1.8, t2: 1.4 },
  { overShaft: 10, upToShaft: 12, b: 4, h: 4, t1: 2.5, t2: 1.8 },
  { overShaft: 12, upToShaft: 17, b: 5, h: 5, t1: 3, t2: 2.3 },
  { overShaft: 17, upToShaft: 22, b: 6, h: 6, t1: 3.5, t2: 2.8 },
  { overShaft: 22, upToShaft: 30, b: 8, h: 7, t1: 4, t2: 3.3 },
  { overShaft: 30, upToShaft: 38, b: 10, h: 8, t1: 5, t2: 3.3 },
  { overShaft: 38, upToShaft: 44, b: 12, h: 8, t1: 5, t2: 3.3 },
  { overShaft: 44, upToShaft: 50, b: 14, h: 9, t1: 5.5, t2: 3.8 },
  { overShaft: 50, upToShaft: 58, b: 16, h: 10, t1: 6, t2: 4.3 },
  { overShaft: 58, upToShaft: 65, b: 18, h: 11, t1: 7, t2: 4.4 },
  { overShaft: 65, upToShaft: 75, b: 20, h: 12, t1: 7.5, t2: 4.9 },
  { overShaft: 75, upToShaft: 85, b: 22, h: 14, t1: 9, t2: 5.4 },
  { overShaft: 85, upToShaft: 95, b: 25, h: 14, t1: 9, t2: 5.4 },
  { overShaft: 95, upToShaft: 110, b: 28, h: 16, t1: 10, t2: 6.4 },
  { overShaft: 110, upToShaft: 130, b: 32, h: 18, t1: 11, t2: 7.4 },
];

/** El eje más delgado y el más grueso que la tabla cubre (mm). */
export const CAD_KEY_SHAFT_MIN = CAD_KEY_SIZES[0].overShaft;
export const CAD_KEY_SHAFT_MAX = CAD_KEY_SIZES[CAD_KEY_SIZES.length - 1].upToShaft;

/**
 * La sección que la tabla asigna a un eje, o `null` fuera de sus límites.
 *
 * El intervalo se lee «mayor que `overShaft` y hasta `upToShaft`»: Ø30 exacto
 * es 8 × 7 y Ø30,5 ya es 10 × 8. Si se escribiera con `>=` en el mínimo, cada
 * diámetro frontera saldría con la chaveta del intervalo siguiente —una
 * chaveta más ancha de la que el cuñero del eje admite—, que es la clase de
 * error que sólo se ve cuando la pieza ya está mecanizada.
 */
export function cadKeySizeFor(shaftDiameter: number): CadKeySize | null {
  if (!Number.isFinite(shaftDiameter)) return null;
  return (
    CAD_KEY_SIZES.find(
      (row) => shaftDiameter > row.overShaft && shaftDiameter <= row.upToShaft,
    ) ?? null
  );
}

/**
 * La serie de longitudes normalizadas de ISO 773 (idéntica a la de DIN 6885).
 *
 * No se impone: una chaveta se corta a la medida que el cuñero pide y hay
 * montajes que exigen una longitud fuera de serie. Sirve para AVISAR —el mismo
 * criterio que la capacidad estándar del Art. 240-6(A) en la revisión
 * eléctrica—: se dice que la tecleada no es de catálogo y se ponen las dos
 * vecinas, sin elegir por el proyectista.
 */
export const CAD_KEY_LENGTHS: readonly number[] = [
  6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 80, 90, 100, 110, 125,
  140, 160, 180, 200, 220, 250, 280, 320, 360, 400,
];

export function cadKeyIsStandardLength(length: number): boolean {
  return CAD_KEY_LENGTHS.includes(length);
}

/** Las dos longitudes de serie que rodean a una que no lo es. */
export function cadKeyNearestLengths(length: number): { below: number | null; above: number | null } {
  const menores = CAD_KEY_LENGTHS.filter((value) => value < length);
  const mayores = CAD_KEY_LENGTHS.filter((value) => value > length);
  return {
    below: menores.length > 0 ? menores[menores.length - 1] : null,
    above: mayores.length > 0 ? mayores[0] : null,
  };
}
