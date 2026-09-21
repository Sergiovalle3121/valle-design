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
 * polígono—. El sentido de "hacia fuera" de cada arista sale del SENTIDO
 * GLOBAL del contorno (una sola vez), no de comparar cada arista contra el
 * centroide medio de los vértices —esa comparación por arista es sólo válida
 * para un contorno CONVEXO; en uno cóncavo el centroide de los vértices puede
 * caer del lado equivocado de una arista reflex e invertir ESA arista en
 * silencio sin que el área deje de crecer (ver el comentario de la función)—,
 * así que ahora funciona igual para un contorno cóncavo simple. Una
 * `distance` tan grande que invierta una esquina reflejada más allá de lo
 * que el contorno da de sí se rechaza en dos capas: el área que no crece
 * (una sola reflex invertida) y, para una muesca ESTRECHA entre DOS reflex
 * —donde sus dos paredes pueden cambiar de orden sin que el área deje de
 * crecer—, que ninguna arista del resultado se cruce o se solape con otra no
 * vecina (`polygonSelfIntersects`).
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
 * `true` si los segmentos `[p1,p2]` y `[q1,q2]` se cruzan de verdad O quedan
 * SOLAPADOS siendo colineales. El caso colineal importa aquí: un contorno con
 * DOS esquinas reflex enmarcando una muesca ESTRECHA (una "U") puede, con una
 * `distance` mayor que la mitad de esa muesca, hacer que las dos paredes de
 * la muesca CAMBIEN DE ORDEN —la que era la pared IZQUIERDA acaba a la
 * derecha de la que era la pared DERECHA—. El área del contorno resultante
 * SIGUE creciendo en ese caso (`areaOf` de abajo no lo distingue: sigue
 * siendo un polígono simple en apariencia, cada arista con su vecina), pero
 * dos tramos del borde acaban SUPERPUESTOS en la misma recta en vez de
 * delimitar un hueco — exactamente el contorno inválido que esta función
 * promete no devolver. Una intersección "propia" (cruce en X) también se
 * cubre, aunque en la práctica el caso que se cuela por el área es el
 * colineal.
 */
function segmentsCrossOrOverlap(p1: CadPoint2, p2: CadPoint2, q1: CadPoint2, q2: CadPoint2): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = q2.x - q1.x;
  const d2y = q2.y - q1.y;
  const denom = d1x * d2y - d1y * d2x;
  const scale = Math.max(Math.hypot(d1x, d1y), Math.hypot(d2x, d2y), 1);
  if (Math.abs(denom) > scale * scale * 1e-12) {
    const t = ((q1.x - p1.x) * d2y - (q1.y - p1.y) * d2x) / denom;
    const u = ((q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x) / denom;
    return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
  }
  // Paralelos: colineales sólo si q1 (proyectado sobre la recta de p1→p2) cae
  // exactamente encima de ella.
  const cross = (q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x;
  if (Math.abs(cross) > scale * 1e-6) return false;
  const len1sq = d1x * d1x + d1y * d1y;
  if (len1sq < 1e-18) return false;
  const proj = (pt: CadPoint2) => ((pt.x - p1.x) * d1x + (pt.y - p1.y) * d1y) / len1sq;
  const lo = Math.max(0, Math.min(proj(q1), proj(q2)));
  const hi = Math.min(1, Math.max(proj(q1), proj(q2)));
  return hi - lo > 1e-9;
}

/** `true` si algún par de aristas NO adyacentes de `poly` se cruza o se solapa (ver arriba). */
function polygonSelfIntersects(poly: readonly CadPoint2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // aristas vecinas: comparten vértice, no cuenta.
      if (segmentsCrossOrOverlap(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  return false;
}

/** Área CON SIGNO (shoelace): positiva si `points` va antihorario (CCW), negativa si horario. */
function signedArea(points: readonly CadPoint2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Desplaza el contorno `points` hacia fuera por `distance`, en su propio
 * plano 2D. `null` si el contorno no es utilizable (menos de 3 puntos, área
 * nula, dos aristas consecutivas paralelas, el área NO crece, o el resultado
 * se autointerseca —las dos señales de que `distance` invierte una esquina
 * reflejada, o dos, más allá de lo que el contorno da de sí—).
 *
 * El signo de cada normal sale del SENTIDO GLOBAL del contorno (shoelace una
 * sola vez), no de comparar cada arista con el centroide medio de los
 * vértices: ese centroide es sólo el promedio de los vértices, no el
 * centroide de área, y para un contorno CÓNCAVO puede caer del lado
 * equivocado de una arista reflex —invirtiendo esa arista en concreto en vez
 * de desplazarla hacia fuera— sin que la esquina resultante se autointersecte
 * ni el área deje de crecer, así que la comprobación de abajo no lo detecta.
 * El sentido global (CCW ⇒ normal `(dy,-dx)`, CW ⇒ su opuesto) es correcto
 * arista por arista para CUALQUIER polígono simple, convexo o no.
 */
export function offsetPlanarPolygonOutward(points: readonly CadPoint2[], distance: number): CadPoint2[] | null {
  const n = points.length;
  if (n < 3 || !(distance > 0)) return null;
  const area = signedArea(points);
  if (Math.abs(area) < 1e-9) return null;
  const ccw = area > 0;
  const offsetLines: { a: CadPoint2; b: CadPoint2 }[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(length > 1e-9)) return null;
    const raw = { x: (q.y - p.y) / length, y: -(q.x - p.x) / length };
    const normal = ccw ? raw : { x: -raw.x, y: -raw.y };
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
  // crezca es la señal de una esquina reflejada invirtiéndose. No basta sola
  // para una muesca ESTRECHA entre dos reflex (ver `segmentsCrossOrOverlap`):
  // ahí el área sigue creciendo aunque las dos paredes de la muesca hayan
  // cambiado de orden, así que se comprueba también que ningún par de
  // aristas no vecinas del resultado se cruce o se solape.
  if (!(areaOf(result) > areaOf(points))) return null;
  if (polygonSelfIntersects(result)) return null;
  return result;
}
