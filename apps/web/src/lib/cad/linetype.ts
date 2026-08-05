/**
 * Tipos de línea (linetypes) del CAD (VD-CAD-DEPTH-A5).
 *
 * Una línea a trazos, de eje o de detalle oculto (DASHED / CENTER / HIDDEN) es
 * geometría, no un estilo cosmético: hay que trocear la polilínea en los trazos
 * reales para medir, exportar (LTYPE en DXF) e imprimir con fidelidad. Este
 * módulo aplica un patrón de guiones/huecos/puntos a lo largo de una polilínea,
 * de forma CONTINUA a través de las esquinas (la fase se arrastra de un tramo al
 * siguiente) y partiendo los trazos que cruzan un vértice. Geometría pura.
 */
import type { CadVec2 } from "./primitives";

/**
 * Patrón estilo AutoCAD .lin: número > 0 = guión (pluma abajo), < 0 = hueco
 * (pluma arriba), 0 = punto. Las longitudes se multiplican por `scale`.
 */
export type Linetype = number[];

export const LINETYPES: Record<string, Linetype> = {
  CONTINUOUS: [],
  DASHED: [0.5, -0.25],
  HIDDEN: [0.25, -0.125],
  CENTER: [1.25, -0.25, 0.25, -0.25],
  DASHDOT: [0.5, -0.25, 0, -0.25],
  DOTTED: [0, -0.25],
};

export interface LinetypeSegment {
  a: CadVec2;
  b: CadVec2;
}

const EPS = 1e-9;

function sub(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function len(a: CadVec2): number {
  return Math.hypot(a.x, a.y);
}

interface PatternElement {
  length: number;
  kind: "dash" | "gap" | "dot";
}

function buildPattern(pattern: Linetype, scale: number): PatternElement[] {
  return pattern.map((value) => ({
    length: Math.abs(value) * scale,
    kind: value > 0 ? "dash" : value < 0 ? "gap" : "dot",
  }));
}

/**
 * Aplica un tipo de línea a una polilínea y devuelve los trazos resultantes
 * (los guiones como segmentos, los puntos como segmentos de longitud cero).
 * Con patrón vacío o escala no positiva devuelve la polilínea sólida (un
 * segmento por arista). La fase se arrastra entre aristas para que el patrón
 * sea continuo en las esquinas.
 */
export function applyLinetype(
  points: CadVec2[],
  pattern: Linetype,
  scale = 1,
  closed = false,
): LinetypeSegment[] {
  const edges: [CadVec2, CadVec2][] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    edges.push([points[i], points[i + 1]]);
  }
  if (closed && points.length > 2) {
    edges.push([points[points.length - 1], points[0]]);
  }
  if (edges.length === 0) return [];

  const scaled = buildPattern(pattern, scale);
  const total = scaled.reduce((sum, e) => sum + e.length, 0);
  if (scaled.length === 0 || scale <= 0 || total <= EPS) {
    return edges.map(([a, b]) => ({ a, b }));
  }

  const segments: LinetypeSegment[] = [];
  const n = scaled.length;
  let pi = 0;
  let rem = scaled[0].length;

  for (const [a, b] of edges) {
    const edgeLen = len(sub(b, a));
    if (edgeLen <= EPS) continue;
    const dir = { x: (b.x - a.x) / edgeLen, y: (b.y - a.y) / edgeLen };
    const pointAt = (d: number): CadVec2 => ({
      x: a.x + dir.x * d,
      y: a.y + dir.y * d,
    });
    let pos = 0;
    while (pos < edgeLen - EPS) {
      const element = scaled[pi];
      if (element.kind === "dot") {
        const p = pointAt(pos);
        segments.push({ a: p, b: p });
        pi = (pi + 1) % n;
        rem = scaled[pi].length;
        continue;
      }
      const take = Math.min(rem, edgeLen - pos);
      if (element.kind === "dash") {
        segments.push({ a: pointAt(pos), b: pointAt(pos + take) });
      }
      pos += take;
      rem -= take;
      if (rem <= EPS) {
        pi = (pi + 1) % n;
        rem = scaled[pi].length;
      }
    }
  }
  return segments;
}

/** ¿Es un trazo de longitud cero (un punto del patrón)? */
export function isDot(segment: LinetypeSegment): boolean {
  return len(sub(segment.b, segment.a)) <= EPS;
}
