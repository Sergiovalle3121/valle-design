/**
 * Diferenciación automática hacia delante sobre vectores pequeños.
 *
 * Cada restricción tiene que aportar su residuo Y sus derivadas parciales
 * respecto de las variables. Escribir el jacobiano a mano para 17 tipos de
 * restricción por 6 parametrizaciones de entidad son cientos de fórmulas, y una
 * derivada mal copiada no rompe el test: sólo hace que Newton converja peor, que
 * es exactamente la clase de error que nadie encuentra.
 *
 * Con números duales la derivada se calcula SOLA a partir del residuo, es exacta
 * (no una diferencia finita) y sólo hay una fórmula que mantener. El gradiente
 * es local: sus componentes son las variables de las entidades que participan en
 * esa restricción, no las del documento entero, así que el vector es corto
 * aunque el dibujo tenga cien mil entidades.
 */

/** Valor con su gradiente respecto de las variables locales. */
export interface Dual {
  readonly v: number;
  readonly g: Float64Array;
}

export function dualConst(value: number, size: number): Dual {
  return { v: value, g: new Float64Array(size) };
}

/** Variable independiente `index` del vector local. */
export function dualVar(value: number, index: number, size: number): Dual {
  const g = new Float64Array(size);
  g[index] = 1;
  return { v: value, g };
}

function combine(a: Dual, b: Dual, value: number, da: number, db: number): Dual {
  const g = new Float64Array(a.g.length);
  for (let i = 0; i < g.length; i += 1) g[i] = da * a.g[i] + db * b.g[i];
  return { v: value, g };
}

function chain(a: Dual, value: number, derivative: number): Dual {
  const g = new Float64Array(a.g.length);
  for (let i = 0; i < g.length; i += 1) g[i] = derivative * a.g[i];
  return { v: value, g };
}

export const dAdd = (a: Dual, b: Dual): Dual => combine(a, b, a.v + b.v, 1, 1);
export const dSub = (a: Dual, b: Dual): Dual => combine(a, b, a.v - b.v, 1, -1);
export const dMul = (a: Dual, b: Dual): Dual => combine(a, b, a.v * b.v, b.v, a.v);
export const dDiv = (a: Dual, b: Dual): Dual =>
  combine(a, b, a.v / b.v, 1 / b.v, -a.v / (b.v * b.v));
export const dScale = (a: Dual, k: number): Dual => chain(a, a.v * k, k);
export const dShift = (a: Dual, k: number): Dual => chain(a, a.v + k, 1);
export const dNeg = (a: Dual): Dual => chain(a, -a.v, -1);
export const dSin = (a: Dual): Dual => chain(a, Math.sin(a.v), Math.cos(a.v));
export const dCos = (a: Dual): Dual => chain(a, Math.cos(a.v), -Math.sin(a.v));
export const dSquare = (a: Dual): Dual => chain(a, a.v * a.v, 2 * a.v);

/**
 * Raíz cuadrada con el cero protegido. Un radicando nulo aparece de verdad
 * —dos puntos coincidentes, un círculo de radio cero— y su derivada es
 * infinita; devolverla propagaría `NaN` por todo el jacobiano y el solucionador
 * dejaría de saber ni siquiera que ha fallado.
 */
export function dSqrt(a: Dual): Dual {
  const value = Math.sqrt(Math.max(a.v, 0));
  return chain(a, value, value > 1e-12 ? 0.5 / value : 0);
}

/** Distancia euclídea entre dos puntos duales. */
export function dHypot(dx: Dual, dy: Dual): Dual {
  return dSqrt(dAdd(dSquare(dx), dSquare(dy)));
}

/** Producto vectorial 2D (escalar): `ax * by - ay * bx`. */
export function dCross(ax: Dual, ay: Dual, bx: Dual, by: Dual): Dual {
  return dSub(dMul(ax, by), dMul(ay, bx));
}

/** Producto escalar 2D. */
export function dDot(ax: Dual, ay: Dual, bx: Dual, by: Dual): Dual {
  return dAdd(dMul(ax, bx), dMul(ay, by));
}

/**
 * Envuelve un ángulo (en radianes) a `[-π/2, π/2)` conservando la derivada 1.
 *
 * Las restricciones de dirección —paralelo, horizontal, ángulo entre rectas—
 * valen módulo π: una recta no distingue su sentido. Usar `sin(Δθ)` como residuo
 * parece natural y es una trampa: en Δθ = ±90° la derivada de `sin` es CERO, así
 * que Newton se queda clavado exactamente en el caso en el que más falta hace
 * (girar un muro que está perpendicular al de referencia). El residuo angular
 * envuelto tiene derivada 1 en todo el intervalo y resuelve ese caso en un paso.
 *
 * El intervalo es semiabierto por abajo a propósito: en el empate exacto
 * (perpendicular) fija el giro en sentido ANTIHORARIO, que es el mismo desempate
 * que hacía el aplicador anterior. Sin un desempate declarado, dos ejecuciones
 * podrían elegir sentidos distintos.
 */
export function wrapToHalfPi(angle: number): number {
  const pi = Math.PI;
  let wrapped = (angle + pi / 2) % pi;
  if (wrapped < 0) wrapped += pi;
  return wrapped - pi / 2;
}

/** Envuelve a `(-π, π]`, para las restricciones que sí distinguen el sentido. */
export function wrapToPi(angle: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = (angle + Math.PI) % twoPi;
  if (wrapped <= 0) wrapped += twoPi;
  return wrapped - Math.PI;
}

/** Residuo angular módulo π: `wrap(a - b)`, con derivada exacta ±1. */
export function dAngleDiffHalfPi(a: Dual, b: Dual): Dual {
  const raw = dSub(a, b);
  return { v: wrapToHalfPi(raw.v), g: raw.g };
}

/** Residuo angular módulo 2π. */
export function dAngleDiffPi(a: Dual, b: Dual): Dual {
  const raw = dSub(a, b);
  return { v: wrapToPi(raw.v), g: raw.g };
}
