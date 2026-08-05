/**
 * Directriz con nota (MLEADER) — CAD-NEXT-111.
 *
 * La flecha con texto que apunta a un detalle del plano: "NOTA: muro
 * cortafuego 2 h", "ver detalle 3", "pendiente 2%". Todo plano profesional las
 * lleva; AutoCAD las hace con MLEADER. Valle Design tenía texto suelto y cotas, pero no
 * la directriz (punta de flecha → línea directriz → codo horizontal → texto).
 *
 * Este módulo calcula la GEOMETRÍA pura de una directriz a partir de dos
 * puntos —la punta (dónde apunta) y el codo (dónde se ancla el texto)— más un
 * estilo. Determinista: no dibuja ni depende del DOM. El codo horizontal se
 * extiende ALEJÁNDOSE de la punta para que el texto no pise la línea.
 */

import type { CadVec2 } from "./primitives";

export interface MleaderStyle {
  /** Longitud de la punta de flecha (mm). */
  arrowSize: number;
  /** Longitud del codo horizontal que sostiene el texto (mm). */
  doglegLength: number;
}

export const DEFAULT_MLEADER_STYLE: MleaderStyle = {
  arrowSize: 180,
  doglegLength: 600,
};

export interface MleaderGeometry {
  /** Triángulo de la punta de flecha (3 vértices), con la punta en `tip`. */
  arrow: CadVec2[];
  /** Línea directriz: de la punta al codo. */
  leaderLine: [CadVec2, CadVec2];
  /** Codo horizontal: del codo al punto de anclaje del texto. */
  dogleg: [CadVec2, CadVec2];
  /** Punto donde arranca el texto (extremo del codo). */
  textAnchor: CadVec2;
  /** +1 si el texto se extiende hacia la derecha del ancla, −1 hacia la izquierda. */
  textDir: 1 | -1;
}

const norm = (v: CadVec2): CadVec2 => {
  const m = Math.hypot(v.x, v.y);
  return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
};

/**
 * Construye la geometría de la directriz.
 * @param tip     Punto al que apunta la flecha (el detalle señalado).
 * @param elbow   Punto donde la directriz se quiebra y arranca el codo del texto.
 * @param style   Tamaños de flecha y codo.
 *
 * El codo se extiende en horizontal alejándose de la punta: si la punta queda a
 * la izquierda del codo, el texto va a la derecha (y viceversa), de modo que la
 * nota nunca se encima con la línea directriz.
 */
export function buildMleader(
  tip: CadVec2,
  elbow: CadVec2,
  style: MleaderStyle = DEFAULT_MLEADER_STYLE,
): MleaderGeometry {
  // Dirección de la punta: del codo hacia la punta (hacia dónde "clava").
  const dir = norm({ x: tip.x - elbow.x, y: tip.y - elbow.y });
  // Triángulo de flecha: punta en `tip`, base a `arrowSize` en dirección al codo.
  const base = { x: tip.x - dir.x * style.arrowSize, y: tip.y - dir.y * style.arrowSize };
  const perp = { x: -dir.y, y: dir.x };
  const half = style.arrowSize * 0.35;
  const arrow: CadVec2[] = [
    { x: tip.x, y: tip.y },
    { x: base.x + perp.x * half, y: base.y + perp.y * half },
    { x: base.x - perp.x * half, y: base.y - perp.y * half },
  ];

  // El texto va del lado opuesto a la punta. Si la punta está a la izquierda
  // (o justo encima) del codo, el codo va a la derecha.
  const textDir: 1 | -1 = tip.x <= elbow.x ? 1 : -1;
  const textAnchor: CadVec2 = { x: elbow.x + textDir * style.doglegLength, y: elbow.y };

  return {
    arrow,
    leaderLine: [{ x: tip.x, y: tip.y }, { x: elbow.x, y: elbow.y }],
    dogleg: [{ x: elbow.x, y: elbow.y }, textAnchor],
    textAnchor,
    textDir,
  };
}
