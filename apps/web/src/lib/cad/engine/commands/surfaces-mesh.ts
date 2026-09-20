/**
 * Geometría de malla para SURFNETWORK y SURFEXTEND — la parte que la auditoría
 * del 19-sep midió como el rectángulo envolvente de las curvas designadas,
 * extruido 0,001 mm. Ninguna de las dos leía la FORMA de lo que se le daba:
 * un SURFNETWORK entre una recta y una "V" devolvía el mismo rectángulo que
 * entre dos rectas paralelas, y un SURFEXTEND no dependía de la distancia
 * pedida hacia un lado u otro del sólido, sólo de su caja.
 *
 * ## SURFNETWORK: superficie REGLADA de verdad (no una caja)
 *
 * Con N≥2 curvas (rieles, en el orden en que se designaron) se construye una
 * malla que las UNE por interpolación LINEAL entre rieles consecutivos —cada
 * panel es un cuadrilátero partido en dos triángulos, siempre planos— y se le
 * da un espesor mínimo para que sea un SÓLIDO cerrado, la misma convención
 * que ya usa SURFPATCH. Esto es una superficie REGLADA/solevada a lo largo de
 * UNA familia de curvas, no la red bidireccional completa de Gordon (rieles
 * cruzados con curvas transversales, cada panel un parche de Coons): esta
 * orden no distingue "primera dirección" de "segunda" en su designación, así
 * que no hay con qué construir esa red. Con dos curvas es exactamente una
 * superficie REGLADA, sin aproximar nada.
 *
 * ## SURFEXTEND: desplazamiento del contorno en su propio plano
 *
 * Extender tangente a una superficie PLANA es, literalmente, seguir en el
 * mismo plano: `offsetPlanarPolygonOutward` desplaza cada arista del contorno
 * hacia fuera por la distancia pedida y recalcula los vértices como la
 * intersección de las aristas desplazadas vecinas —el "offset" clásico de un
 * polígono—. Sólo se garantiza para contornos CONVEXOS: en uno cóncavo una
 * esquina reflejada puede invertirse, y se detecta (área que no crece) en vez
 * de devolver una malla retorcida.
 */
import type { CadPoint2 } from "../../cad-document";
import { lineLineIntersection } from "../../intersect";
import { v3Cross, v3Dot, v3Normalize, v3Scale, v3Sub, type Vec3 } from "../../../brep/vec3";
import { newellNormal } from "../../../brep/topology";

export interface MeshFace {
  outer: number[];
}

export interface RuledMesh {
  points: Vec3[];
  faces: MeshFace[];
}

/** Remuestrea una polilínea ABIERTA a `count` puntos, repartidos por longitud de arco. */
export function resampleOpenPolylineByArcLength(points: readonly Vec3[], count: number): Vec3[] {
  if (points.length === 0) return [];
  if (points.length === 1 || count <= 1) return Array.from({ length: Math.max(1, count) }, () => ({ ...points[0] }));
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1)
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z));
  const total = cumulative[cumulative.length - 1];
  if (!(total > 1e-9)) return Array.from({ length: count }, () => ({ ...points[0] }));
  const out: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const target = (total * i) / (count - 1);
    let segment = 0;
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < target) segment += 1;
    const segmentLength = cumulative[segment + 1] - cumulative[segment];
    const t = segmentLength > 1e-12 ? (target - cumulative[segment]) / segmentLength : 0;
    const a = points[segment];
    const b = points[segment + 1];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

/** Triángulo orientado para que su normal apunte HACIA FUERA de `centroid`. */
function pushTriangle(faces: MeshFace[], points: readonly Vec3[], centroid: Vec3, i: number, j: number, k: number) {
  const a = points[i];
  const b = points[j];
  const c = points[k];
  const normal = v3Cross(v3Sub(b, a), v3Sub(c, a));
  const mid = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
  const outward = v3Sub(mid, centroid);
  faces.push({ outer: v3Dot(normal, outward) < 0 ? [i, k, j] : [i, j, k] });
}

function pushQuad(faces: MeshFace[], points: readonly Vec3[], centroid: Vec3, a: number, b: number, c: number, d: number) {
  pushTriangle(faces, points, centroid, a, b, c);
  pushTriangle(faces, points, centroid, a, c, d);
}

/**
 * Malla reglada entre N rieles (cada uno YA remuestreado al mismo número de
 * puntos `M`), como un casco cerrado de espesor `thickness`: cara superior
 * (los propios rieles), cara inferior (desplazada a lo largo de la normal
 * media del parche) y cuatro paredes laterales —los dos rieles extremos y las
 * dos "costillas" que conectan un mismo índice a través de todos los
 * rieles—. Cerrado y triangulado: cada cara es plana, así que el validador
 * del kernel (`requirePlanarFaces`) nunca es el que dice que no.
 */
export function ruledShellMesh(rails: readonly (readonly Vec3[])[], thickness: number): RuledMesh | { error: string } {
  const railCount = rails.length;
  if (railCount < 2) return { error: "hacen falta al menos dos curvas para una superficie reglada." };
  const pointCount = rails[0].length;
  if (rails.some((rail) => rail.length !== pointCount) || pointCount < 2)
    return { error: "las curvas remuestreadas no tienen el mismo número de puntos." };

  const boundary: Vec3[] = [];
  for (let i = 0; i < pointCount; i += 1) boundary.push(rails[0][i]);
  for (let c = 1; c < railCount; c += 1) boundary.push(rails[c][pointCount - 1]);
  for (let i = pointCount - 2; i >= 0; i -= 1) boundary.push(rails[railCount - 1][i]);
  for (let c = railCount - 2; c >= 1; c -= 1) boundary.push(rails[c][0]);
  const rawNormal = newellNormal(boundary);
  const normal = v3Normalize(rawNormal);
  if (!(Math.hypot(normal.x, normal.y, normal.z) > 0.5))
    return { error: "las curvas son degeneradas (sin área): no definen un plano ni una dirección para el espesor." };
  const offset = v3Scale(normal, thickness);

  const points: Vec3[] = [];
  const topIndex = (c: number, i: number) => c * pointCount + i;
  const bottomIndex = (c: number, i: number) => railCount * pointCount + c * pointCount + i;
  for (let c = 0; c < railCount; c += 1) for (let i = 0; i < pointCount; i += 1) points.push({ ...rails[c][i] });
  for (let c = 0; c < railCount; c += 1)
    for (let i = 0; i < pointCount; i += 1) points.push({ x: rails[c][i].x + offset.x, y: rails[c][i].y + offset.y, z: rails[c][i].z + offset.z });

  let centroid = { x: 0, y: 0, z: 0 };
  for (const p of points) centroid = { x: centroid.x + p.x, y: centroid.y + p.y, z: centroid.z + p.z };
  centroid = { x: centroid.x / points.length, y: centroid.y / points.length, z: centroid.z / points.length };

  const faces: MeshFace[] = [];
  for (let c = 0; c < railCount - 1; c += 1)
    for (let i = 0; i < pointCount - 1; i += 1) {
      pushQuad(faces, points, centroid, topIndex(c, i), topIndex(c, i + 1), topIndex(c + 1, i + 1), topIndex(c + 1, i));
      pushQuad(faces, points, centroid, bottomIndex(c, i), bottomIndex(c + 1, i), bottomIndex(c + 1, i + 1), bottomIndex(c, i + 1));
    }
  const wallChain = (chain: readonly number[]) => {
    for (let n = 0; n < chain.length - 1; n += 1) {
      const [t0, t1] = [chain[n], chain[n + 1]];
      pushQuad(faces, points, centroid, t0, t1, t1 + railCount * pointCount, t0 + railCount * pointCount);
    }
  };
  wallChain(Array.from({ length: pointCount }, (_, i) => topIndex(0, i)));
  wallChain(Array.from({ length: pointCount }, (_, i) => topIndex(railCount - 1, i)));
  wallChain(Array.from({ length: railCount }, (_, c) => topIndex(c, 0)));
  wallChain(Array.from({ length: railCount }, (_, c) => topIndex(c, pointCount - 1)));

  return { points, faces };
}

/**
 * Desplaza el contorno CONVEXO `points` hacia fuera por `distance`, en su
 * propio plano 2D. `null` si el contorno no es utilizable (menos de 3 puntos,
 * dos aristas consecutivas paralelas, o el área NO crece —la señal de una
 * esquina cóncava que se invierte—).
 */
export function offsetPlanarPolygonOutward(points: readonly CadPoint2[], distance: number): CadPoint2[] | null {
  const n = points.length;
  if (n < 3 || !(distance > 0)) return null;
  const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }), { x: 0, y: 0 });
  const offsetLines: { a: CadPoint2; b: CadPoint2 }[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(length > 1e-9)) return null;
    let normal = { x: (q.y - p.y) / length, y: -(q.x - p.x) / length };
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if ((mid.x - centroid.x) * normal.x + (mid.y - centroid.y) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
    offsetLines.push({
      a: { x: p.x + normal.x * distance, y: p.y + normal.y * distance },
      b: { x: q.x + normal.x * distance, y: q.y + normal.y * distance },
    });
  }
  const result: CadPoint2[] = [];
  for (let i = 0; i < n; i += 1) {
    const previous = offsetLines[(i - 1 + n) % n];
    const current = offsetLines[i];
    const vertex = lineLineIntersection(previous.a, previous.b, current.a, current.b);
    if (!vertex) return null;
    result.push(vertex);
  }
  const areaOf = (poly: readonly CadPoint2[]) => {
    let sum = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  };
  // Crecer hacia fuera SIEMPRE aumenta el área de un contorno convexo; que no
  // crezca es la señal de una esquina reflejada invirtiéndose.
  if (!(areaOf(result) > areaOf(points))) return null;
  return result;
}
