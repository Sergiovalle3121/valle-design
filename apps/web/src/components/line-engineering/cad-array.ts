/**
 * Arreglos (array) de elementos para el CAD (Fase 73 — patrones).
 *
 * Helpers PUROS para replicar un elemento en patrón: rectangular (filas×cols),
 * polar (alrededor de un centro) y a lo largo de una ruta (polilínea). Devuelven
 * posiciones + rotación que el editor aplica al duplicar assets/estaciones.
 * Coordenadas en unidades del footprint.
 *
 * Correr tests:  npx tsx src/components/line-engineering/cad-array.spec.ts
 */
import { Point, distance, angleDeg, polarPoint, normalizeDeg } from './precision-input';

export interface ArrayItem {
  point: Point;
  rotationDeg: number;
}

/** Arreglo rectangular: rejilla de cols×rows con pasos dx/dy desde `base`. */
export function rectangularArray(
  base: Point,
  opts: { cols: number; rows: number; dx: number; dy: number },
): ArrayItem[] {
  const cols = Math.max(1, Math.floor(opts.cols));
  const rows = Math.max(1, Math.floor(opts.rows));
  const out: ArrayItem[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ point: { x: base.x + c * opts.dx, y: base.y + r * opts.dy }, rotationDeg: 0 });
    }
  }
  return out;
}

/**
 * Arreglo polar: `count` copias del `item` alrededor de `center`. Con span 360°
 * reparte el círculo completo (sin duplicar en 360); con span parcial reparte de
 * forma inclusiva (primera y última en los extremos). `rotateItems` gira cada
 * copia con el ángulo para que "miren" igual respecto al centro.
 */
export function polarArray(
  center: Point,
  item: Point,
  opts: { count: number; angleSpanDeg?: number; rotateItems?: boolean },
): ArrayItem[] {
  const count = Math.max(1, Math.floor(opts.count));
  const span = opts.angleSpanDeg ?? 360;
  const rotate = opts.rotateItems ?? true;
  const radius = distance(center, item);
  const start = angleDeg(center, item);
  const full = Math.abs(span % 360) < 1e-9 && span !== 0;
  const step = count <= 1 ? 0 : full ? span / count : span / (count - 1);

  const out: ArrayItem[] = [];
  for (let i = 0; i < count; i++) {
    const delta = i * step;
    out.push({
      point: polarPoint(center, radius, start + delta),
      rotationDeg: rotate ? normalizeDeg(delta) : 0,
    });
  }
  return out;
}

/**
 * Arreglo sobre ruta: distribuye `count` copias equiespaciadas a lo largo de la
 * polilínea (incluyendo extremos). La rotación de cada copia sigue la tangente
 * del tramo donde cae. Con count=1 devuelve el punto inicial.
 */
export function pathArray(points: Point[], count: number): ArrayItem[] {
  const n = Math.max(1, Math.floor(count));
  if (points.length < 2) return points[0] ? [{ point: points[0], rotationDeg: 0 }] : [];

  // longitudes acumuladas
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = distance(points[i], points[i + 1]);
    segLen.push(l);
    total += l;
  }
  if (total < 1e-12) return [{ point: points[0], rotationDeg: 0 }];

  const at = (d: number): ArrayItem => {
    let acc = 0;
    for (let i = 0; i < segLen.length; i++) {
      if (d <= acc + segLen[i] || i === segLen.length - 1) {
        const t = segLen[i] < 1e-12 ? 0 : (d - acc) / segLen[i];
        const a = points[i];
        const b = points[i + 1];
        return {
          point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          rotationDeg: angleDeg(a, b),
        };
      }
      acc += segLen[i];
    }
    return { point: points[points.length - 1], rotationDeg: 0 };
  };

  if (n === 1) return [at(0)];
  const out: ArrayItem[] = [];
  for (let i = 0; i < n; i++) out.push(at((total * i) / (n - 1)));
  return out;
}
