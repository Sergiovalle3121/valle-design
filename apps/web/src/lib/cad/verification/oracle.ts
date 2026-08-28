/**
 * EL ORÁCULO INDEPENDIENTE.
 *
 * Este módulo resuelve, por FUERZA BRUTA, los mismos problemas que el núcleo
 * geométrico del producto resuelve con álgebra cerrada. Existe para poder
 * responder a una pregunta que ninguna suite de regresión responde: no «¿sigue
 * dando lo mismo que ayer?», sino «¿está bien?».
 *
 * ─── La regla que hace que esto valga algo ─────────────────────────────────
 *
 * **Este archivo no importa NADA de `../`.** Ni un tipo, ni una constante, ni
 * una función auxiliar. En cuanto un oráculo comparte código con lo que
 * verifica, deja de ser un oráculo y pasa a ser un espejo: un error en la
 * pieza compartida sale verde en los dos lados. Las coordenadas se declaran
 * aquí con su propia forma (`P`), la conversión de grados se escribe otra vez,
 * y sí, es duplicación deliberada.
 *
 * Un gate de esta carpeta que empiece con `import { algo } from "../algo"`
 * está roto aunque pase.
 *
 * ─── El método ─────────────────────────────────────────────────────────────
 *
 * Muestreo denso + refinamiento. Donde el producto resuelve una cuadrática,
 * aquí se recorren N puntos de cada curva, se localizan los mínimos de la
 * distancia y se afinan por búsqueda ternaria hasta el límite del doble. Es
 * lento —milisegundos donde el producto tarda microsegundos— y ésa es
 * exactamente la razón por la que vive en un gate y no en el runtime.
 */

/** Punto del oráculo. Deliberadamente NO es el `CadVec2` del producto. */
export interface P {
  x: number;
  y: number;
}

/** Curvas que el oráculo sabe muestrear. Forma propia, sin herencia. */
export type OracleCurve =
  | { kind: "segment"; a: P; b: P }
  | {
      kind: "arc";
      center: P;
      radius: number;
      /** Grados. */
      startAngle: number;
      /** Grados, con signo. ±360 es la circunferencia entera. */
      sweep: number;
    };

const TAU = Math.PI * 2;

/** Grados → radianes, escrito aquí a propósito. Ver la cabecera. */
export function rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function deg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function dist(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Punto de la curva en `t ∈ [0, 1]`. Parametrización uniforme en el ángulo
 * para el arco y en la longitud para el segmento.
 */
export function pointAt(curve: OracleCurve, t: number): P {
  if (curve.kind === "segment") {
    return {
      x: curve.a.x + (curve.b.x - curve.a.x) * t,
      y: curve.a.y + (curve.b.y - curve.a.y) * t,
    };
  }
  const angle = rad(curve.startAngle + curve.sweep * t);
  return {
    x: curve.center.x + curve.radius * Math.cos(angle),
    y: curve.center.y + curve.radius * Math.sin(angle),
  };
}

/**
 * Longitud por suma de cuerdas, con el número de tramos declarado.
 *
 * Para un segmento es exacta. Para un arco converge por debajo (una poligonal
 * inscrita siempre mide menos que su arco), así que quien la use debe declarar
 * una tolerancia RELATIVA: con 200 000 tramos el defecto de un arco completo
 * es del orden de 1e-11 relativo, suficiente para verificar seis cifras.
 */
export function bruteLength(curve: OracleCurve, steps = 200_000): number {
  let total = 0;
  let previous = pointAt(curve, 0);
  for (let index = 1; index <= steps; index += 1) {
    const current = pointAt(curve, index / steps);
    total += dist(previous, current);
    previous = current;
  }
  return total;
}

/**
 * Intersecciones por fuerza bruta: dónde la distancia entre las dos curvas
 * toca el cero.
 *
 * Se recorre la primera curva y, para cada muestra, se busca el punto más
 * cercano de la segunda; los mínimos locales de esa distancia son los
 * candidatos, y cada uno se afina por ternaria anidada. Es un camino
 * completamente distinto del que usa el producto (cuadrática / eje radical), y
 * ésa es la gracia.
 *
 * `tolerance` es la distancia máxima que se acepta como «se tocan». Un cruce
 * transversal converge muy por debajo de 1e-9; una TANGENCIA no: cerca del
 * toque la distancia es cuadrática en el parámetro, así que el error del
 * refinamiento va con la raíz de la resolución. Por eso quien busque
 * tangencias debe pasar una tolerancia mayor y declararlo.
 */
export function bruteIntersections(
  a: OracleCurve,
  b: OracleCurve,
  options: { samples?: number; tolerance?: number } = {},
): P[] {
  const samples = options.samples ?? 4000;
  const tolerance = options.tolerance ?? 1e-7;

  /** Distancia de un punto a la curva `b`, afinada por ternaria. */
  const distanceToB = (point: P): { d: number; t: number } => {
    let bestT = 0;
    let best = Infinity;
    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      const d = dist(point, pointAt(b, t));
      if (d < best) {
        best = d;
        bestT = t;
      }
    }
    let lo = Math.max(0, bestT - 1 / samples);
    let hi = Math.min(1, bestT + 1 / samples);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const third = (hi - lo) / 3;
      if (dist(point, pointAt(b, lo + third)) <= dist(point, pointAt(b, hi - third))) {
        hi -= third;
      } else {
        lo += third;
      }
    }
    const t = (lo + hi) / 2;
    return { d: dist(point, pointAt(b, t)), t };
  };

  const values: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    values.push(distanceToB(pointAt(a, index / samples)).d);
  }

  const hits: P[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const current = values[index];
    const previous = index === 0 ? Infinity : values[index - 1];
    const next = index === samples ? Infinity : values[index + 1];
    if (current > previous || current > next) continue;
    // Mínimo local: se afina el parámetro sobre `a`.
    let lo = Math.max(0, (index - 1) / samples);
    let hi = Math.min(1, (index + 1) / samples);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const third = (hi - lo) / 3;
      if (
        distanceToB(pointAt(a, lo + third)).d <=
        distanceToB(pointAt(a, hi - third)).d
      ) {
        hi -= third;
      } else {
        lo += third;
      }
    }
    const t = (lo + hi) / 2;
    const point = pointAt(a, t);
    if (distanceToB(point).d > tolerance) continue;
    // El mismo cruce puede salir de dos muestras vecinas.
    if (hits.some((seen) => dist(seen, point) <= Math.max(tolerance, 1e-6) * 10)) {
      continue;
    }
    hits.push(point);
  }
  return hits.sort((left, right) => left.x - right.x || left.y - right.y);
}

/**
 * Área encerrada por una poligonal, por la fórmula del zapato (shoelace).
 *
 * Es el único punto donde el oráculo y el producto podrían coincidir en el
 * MÉTODO, porque para un polígono no hay otro camino razonable. La
 * independencia se mantiene porque los casos que se le pasan tienen área
 * conocida en papel (un cuadrado de lado 10 mide 100) y porque las áreas
 * curvas se verifican con la fórmula cerrada del segmento circular, no con
 * esta función.
 */
export function shoelaceArea(points: readonly P[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twice += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * Área de un SEGMENTO CIRCULAR (la tajada entre la cuerda y el arco), por su
 * fórmula cerrada: `r²(θ − sen θ)/2`, con θ el ángulo central en radianes.
 *
 * Es el oráculo analítico para el área de una polilínea con `bulge`: la de la
 * poligonal de sus vértices más (o menos) esta tajada por cada tramo curvo.
 * Ninguna aproximación por teselado puede dar este número exacto, así que es
 * justo la clase de caso que delata un área calculada sobre la poligonal.
 */
export function circularSegmentArea(radius: number, sweepDegrees: number): number {
  const theta = Math.abs(rad(sweepDegrees));
  return (radius * radius * (theta - Math.sin(theta))) / 2;
}

/**
 * Rotación de un punto alrededor de un centro, calculada DIRECTAMENTE con
 * senos y cosenos en vez de componiendo una matriz. Sirve de contraste para la
 * ruta matricial del producto.
 */
export function rotatePoint(point: P, center: P, degrees: number): P {
  const angle = rad(degrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Normaliza a [0, 360) sin usar el helper del producto. */
export function norm360(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Diferencia angular mínima entre dos ángulos en grados, en [0, 180]. */
export function angleGap(a: number, b: number): number {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Distancia mínima de un punto a un segmento, por muestreo + ternaria. El
 * producto la resuelve proyectando; aquí se busca.
 */
export function bruteDistanceToSegment(point: P, a: P, b: P): number {
  let lo = 0;
  let hi = 1;
  const at = (t: number) => dist(point, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const third = (hi - lo) / 3;
    if (at(lo + third) <= at(hi - third)) hi -= third;
    else lo += third;
  }
  return at((lo + hi) / 2);
}

/** π·2 expuesto para quien lo necesite sin volver a escribirlo. */
export const TWO_PI = TAU;
