/**
 * Formato de ÁNGULOS (la mitad de UNITS que `unit-format.ts` no cubre).
 *
 * `unit-format.ts` sabe escribir longitudes en los cinco sistemas de AutoCAD.
 * Un plano necesita además escribir ángulos, y ahí AutoCAD tiene otros cinco
 * modos que no se parecen en nada entre sí: 90 grados decimales son también
 * `90d0'0"`, `100g`, `1.5708r` y `N 0d0'0" E`. Quien trabaja en topografía lee
 * el último y ninguno de los otros cuatro.
 *
 * Se separa de `unit-format.ts` a propósito: aquel es un módulo probado que ya
 * existía y que esta ola pone por fin en uso; añadirle un segundo tema habría
 * mezclado dos historias en un archivo y dos sesiones en un diff.
 *
 * ## Las dos variables que mandan
 *
 * `ANGBASE` dice qué dirección es el ángulo cero y `ANGDIR` si se mide en
 * sentido antihorario (0, el de siempre) u horario (1). Van aquí y no en quien
 * llama porque un ángulo mal referenciado no se detecta mirando el número: se
 * detecta cuando la pieza ya está fabricada.
 */

/** Los cinco modos de `AUNITS`, con el número que usa AutoCAD. */
export type AngleSystem =
  /** 0 — grados decimales: `45.00`. */
  | "decimal"
  /** 1 — grados/minutos/segundos: `45d30'15"`. */
  | "dms"
  /** 2 — gradianes (400 en la vuelta): `50.00g`. */
  | "grads"
  /** 3 — radianes: `0.7854r`. */
  | "radians"
  /** 4 — rumbos de topografía: `N 45d0'0" E`. */
  | "surveyor";

export interface AngleFormatOptions {
  system: AngleSystem;
  /** Decimales; en `dms` y `surveyor` son los del campo de segundos. */
  precision?: number;
  /** Dirección del cero, en grados medidos desde el este. `ANGBASE`. */
  base?: number;
  /** `0` antihorario (por defecto), `1` horario. `ANGDIR`. */
  direction?: 0 | 1;
}

/** Grados en `[0, 360)`. Un `-90` que se imprime como `-90` es un error. */
export function normalizeDegrees(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Pasa un ángulo del MUNDO al sistema del usuario aplicando `ANGBASE` y
 * `ANGDIR`. Es la única conversión: todo lo demás de este módulo escribe.
 */
export function toUserAngle(worldDeg: number, options: AngleFormatOptions): number {
  const relative = worldDeg - (options.base ?? 0);
  return normalizeDegrees(options.direction === 1 ? -relative : relative);
}

/** Descompone grados en `d`, `m`, `s` sin dejar `60` en ningún campo. */
function sexagesimal(
  degrees: number,
  precision: number,
): { d: number; m: number; s: string } {
  const total = Math.abs(degrees);
  let d = Math.floor(total);
  const minutes = (total - d) * 60;
  let m = Math.floor(minutes);
  const seconds = (minutes - m) * 60;
  // Redondear los segundos puede dar 60: sin arrastrar el acarreo saldría
  // `44d59'60"`, que no es una hora del reloj ni un ángulo de un plano.
  let s = seconds.toFixed(precision);
  if (Number.parseFloat(s) >= 60) {
    s = (0).toFixed(precision);
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  return { d, m, s };
}

function formatDms(degrees: number, precision: number): string {
  const { d, m, s } = sexagesimal(degrees, precision);
  return `${degrees < 0 ? "-" : ""}${d}d${m}'${s}"`;
}

/**
 * Rumbo topográfico: `N 30d0'0" E`.
 *
 * Se mide desde el norte o desde el sur hacia el este o el oeste, nunca más de
 * 90 grados. Los cuatro ejes son casos aparte —`N`, `S`, `E`, `W` a secas—
 * porque `N 0d0'0" E` no es como se escribe el norte en una libreta de campo.
 */
function formatSurveyor(degrees: number, precision: number): string {
  const angle = normalizeDegrees(degrees);
  if (Math.abs(angle - 0) < 1e-9 || Math.abs(angle - 360) < 1e-9) return "E";
  if (Math.abs(angle - 90) < 1e-9) return "N";
  if (Math.abs(angle - 180) < 1e-9) return "W";
  if (Math.abs(angle - 270) < 1e-9) return "S";
  // El ángulo se mide desde el este; el rumbo, desde el norte o el sur.
  const northSouth = angle < 180 ? "N" : "S";
  const eastWest = angle < 90 || angle > 270 ? "E" : "W";
  const fromAxis =
    angle < 90 ? 90 - angle : angle < 180 ? angle - 90 : angle < 270 ? 270 - angle : angle - 270;
  return `${northSouth} ${formatDms(fromAxis, precision)} ${eastWest}`;
}

/**
 * Escribe un ángulo del MUNDO (grados desde el este, antihorario) tal y como lo
 * espera el usuario según su configuración de UNITS.
 */
export function formatAngle(worldDeg: number, options: AngleFormatOptions): string {
  const precision = options.precision ?? 0;
  const user = toUserAngle(worldDeg, options);
  switch (options.system) {
    case "decimal":
      return `${user.toFixed(precision)}`;
    case "dms":
      return formatDms(user, precision);
    case "grads":
      return `${((user * 400) / 360).toFixed(precision)}g`;
    case "radians":
      return `${((user * Math.PI) / 180).toFixed(precision)}r`;
    case "surveyor":
      return formatSurveyor(user, precision);
  }
}

/** `AUNITS` → sistema. Un valor fuera de rango cae en grados decimales. */
export const ANGLE_SYSTEM_BY_AUNITS: readonly AngleSystem[] = [
  "decimal",
  "dms",
  "grads",
  "radians",
  "surveyor",
];

export function angleSystemFromAunits(aunits: number): AngleSystem {
  return ANGLE_SYSTEM_BY_AUNITS[aunits] ?? "decimal";
}
