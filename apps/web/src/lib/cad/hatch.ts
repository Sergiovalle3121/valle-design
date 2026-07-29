/**
 * Achurado (hatch) de regiones cerradas del CAD (AXOS-CAD-DEPTH-A4).
 *
 * Rellenar un cuarto o una pieza con líneas a 45° (ANSI31), con rayado cruzado
 * o a cualquier ángulo/espaciado, es pan de cada día en un CAD real y el modelo
 * de caja jamás lo tuvo. Este módulo genera los segmentos del achurado con el
 * algoritmo clásico de líneas de barrido (scanline) recortadas contra el
 * polígono. Geometría pura, sin dependencias del editor; alimenta el render y,
 * más adelante, la exportación (HATCH o líneas explícitas) en DXF.
 *
 * Convención de ángulos: GRADOS, CCW desde +X, como el resto de lib/cad.
 */
import type { CadVec2 } from "./primitives";

export interface HatchOptions {
  /** Ángulo de las líneas en grados. 0 = horizontal, 45 = ANSI31. */
  angle: number;
  /** Separación perpendicular entre líneas, en unidades reales (> 0). */
  spacing: number;
  /** Origen local del patrón; desplaza la rejilla sin mover el boundary. */
  origin?: CadVec2;
}

export interface HatchSegment {
  a: CadVec2;
  b: CadVec2;
}

const EPS = 1e-9;

function rotate(p: CadVec2, angleDeg: number): CadVec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/**
 * Achurado simple: líneas paralelas a `angle`, separadas `spacing`, recortadas
 * al interior del polígono `boundary` (regla par-impar). Devuelve [] si el
 * polígono tiene menos de 3 vértices o el espaciado no es positivo.
 *
 * El polígono puede ser convexo o cóncavo; una línea de barrido que entra y
 * sale varias veces produce varios segmentos (uno por tramo interior).
 */
export function hatchPolygon(
  boundary: CadVec2[],
  options: HatchOptions,
): HatchSegment[] {
  if (boundary.length < 3 || options.spacing <= 0) return [];
  const { angle, spacing } = options;
  const origin = options.origin ?? { x: 0, y: 0 };

  // Trabajamos en un marco rotado donde las líneas de achurado son
  // horizontales; al final rotamos los segmentos de vuelta.
  const rotated = boundary.map((p) => rotate({ x: p.x - origin.x, y: p.y - origin.y }, -angle));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rotated) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const segments: HatchSegment[] = [];
  // Líneas de barrido alineadas a una rejilla global (múltiplos de spacing),
  // estrictamente en el interior para no dibujar sobre el borde.
  const startK = Math.floor(minY / spacing) + 1;
  for (let k = startK; k * spacing < maxY - EPS; k += 1) {
    const y = k * spacing;
    const crossings: number[] = [];
    for (let i = 0; i < rotated.length; i += 1) {
      const a = rotated[i];
      const b = rotated[(i + 1) % rotated.length];
      // Intervalo semiabierto [min, max) para no contar dos veces los vértices.
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (y >= lo && y < hi) {
        const t = (y - a.y) / (b.y - a.y);
        crossings.push(a.x + t * (b.x - a.x));
      }
    }
    crossings.sort((m, n) => m - n);
    for (let j = 0; j + 1 < crossings.length; j += 2) {
      const x0 = crossings[j];
      const x1 = crossings[j + 1];
      if (x1 - x0 <= EPS) continue;
      const rotatedA = rotate({ x: x0, y }, angle);
      const rotatedB = rotate({ x: x1, y }, angle);
      segments.push({
        a: { x: rotatedA.x + origin.x, y: rotatedA.y + origin.y },
        b: { x: rotatedB.x + origin.x, y: rotatedB.y + origin.y },
      });
    }
  }
  return segments;
}

/**
 * Rayado cruzado: dos pasadas de achurado, a `angle` y a `angle + 90`, con el
 * mismo espaciado. Concatena los segmentos de ambas.
 */
export function crossHatchPolygon(
  boundary: CadVec2[],
  options: HatchOptions,
): HatchSegment[] {
  return [
    ...hatchPolygon(boundary, options),
    ...hatchPolygon(boundary, { ...options, angle: options.angle + 90 }),
  ];
}
