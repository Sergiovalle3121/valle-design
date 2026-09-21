/**
 * MESHSPLIT real: partir UNA cara de la malla en dos, por una cuerda entre dos
 * puntos designados sobre ella.
 *
 * ## Qué había, y por qué no era esto
 *
 * `MESHSPLIT` cortaba el SÓLIDO ENTERO por un plano infinito y sólo contaba
 * cuántas caras quedaban a cada lado — nunca partía nada; terminaba siempre en
 * «la división geométrica de mallas aún no está implementada». Eso no es lo
 * que hace MESHSPLIT en AutoCAD: ahí se designa una malla y se traza una línea
 * de corte DENTRO de una cara, partiéndola en dos. Es una operación local —una
 * cara— y no global —todo el cuerpo—, y por eso sí es tratable con lo que hay:
 * no hace falta intersecar superficies, sólo partir un polígono plano.
 *
 * ## El algoritmo
 *
 * Los dos puntos que designa el usuario se PROYECTAN cada uno sobre la arista
 * más cercana del contorno de la cara (distancia punto-segmento en 3D, que es
 * válida porque la cara es plana). Si la proyección cae muy cerca de un
 * extremo de esa arista, se reutiliza el vértice existente en vez de crear uno
 * pegado a él. Con los dos puntos ya sobre el contorno —cada uno o un vértice
 * de siempre o uno nuevo insertado en su arista— el lazo de la cara se parte
 * en dos arcos entre esos dos puntos, y cada arco más la cuerda que los une es
 * una cara nueva.
 *
 * La cuerda vive en el plano de la cara original: NINGÚN vértice existente se
 * mueve, así que el volumen y la caja envolvente del sólido no cambian —sólo
 * su topología (una cara se convierte en dos, N caras pasan a N+1).
 *
 * ## La junta en T que casi se coló
 *
 * Insertar un vértice a MITAD de una arista de la cara no basta: esa arista
 * es tambien el borde de la cara VECINA, que sigue teniendo un único vértice
 * donde la cara partida ahora tiene dos. El resultado es una malla no-variedad
 * —dos medias-aristas nuevas sin gemela, más la vieja arista de la vecina
 * también sin gemela— que `attachPlanarSurfaces`/`validateBody` rechaza
 * como «tiene aristas de borde». Por eso, cuando un punto crea un vértice
 * nuevo a mitad de arista, `insertOnMatchingEdge` busca la OTRA cara que
 * comparte esa arista (en sentido opuesto, como exige un B-rep bien orientado)
 * e inserta ahí el MISMO vértice. Si no hay otra cara —la arista era de borde
 * de verdad, como en una lámina abierta— no hay nada que conformar y se deja
 * igual.
 *
 * ## Cuándo se niega
 *
 * Con mensaje honesto y sin tocar el documento cuando:
 *   - los dos puntos proyectan sobre la MISMA arista (no hay cuerda que cruce
 *     la cara, sería una ceja pegada a un borde);
 *   - proyectan sobre el mismo vértice (cuerda de longitud cero);
 *   - el resultado dejaría un lado con menos de 3 vértices (geometría
 *     degenerada que ningún núcleo de caras planas puede validar).
 */
import type { MeshFace, MeshPoint } from "./subdivision";

export interface MeshFaceSplitResult {
  points: MeshPoint[];
  faces: MeshFace[];
}

function closestOnSegment(p: MeshPoint, a: MeshPoint, b: MeshPoint): { t: number; point: MeshPoint; distSq: number } {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  let t = abLenSq > 1e-18 ? (apx * abx + apy * aby + apz * abz) / abLenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
  const dx = p.x - point.x, dy = p.y - point.y, dz = p.z - point.z;
  return { t, point, distSq: dx * dx + dy * dy + dz * dz };
}

interface BoundaryHit {
  /** Índice de la arista (outer[edge] → outer[edge+1]) donde cayó la proyección. */
  edge: number;
  t: number;
  point: MeshPoint;
}

/** La proyección más cercana de `p` sobre el contorno de la cara. */
function nearestOnBoundary(p: MeshPoint, pts: readonly MeshPoint[], outer: readonly number[]): BoundaryHit {
  let best: BoundaryHit | null = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < outer.length; i++) {
    const a = pts[outer[i]];
    const b = pts[outer[(i + 1) % outer.length]];
    const hit = closestOnSegment(p, a, b);
    if (hit.distSq < bestDistSq) {
      bestDistSq = hit.distSq;
      best = { edge: i, t: hit.t, point: hit.point };
    }
  }
  return best!;
}

/**
 * Si `outer` tiene la arista (vb, va) consecutiva —el sentido OPUESTO al que
 * tendría en la cara que se está partiendo, como corresponde a la cara
 * vecina de un B-rep bien orientado—, devuelve `outer` con `newIndex`
 * insertado entre medias. `null` si esta cara no tiene esa arista.
 */
function insertOnMatchingEdge(outer: readonly number[], va: number, vb: number, newIndex: number): number[] | null {
  for (let i = 0; i < outer.length; i++) {
    if (outer[i] === vb && outer[(i + 1) % outer.length] === va) {
      const next = [...outer];
      next.splice(i + 1, 0, newIndex);
      return next;
    }
  }
  return null;
}

/** Longitud media de las aristas de la cara, para una tolerancia de enganche relativa. */
function averageEdgeLength(pts: readonly MeshPoint[], outer: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < outer.length; i++) {
    const a = pts[outer[i]];
    const b = pts[outer[(i + 1) % outer.length]];
    sum += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return outer.length > 0 ? sum / outer.length : 1;
}

export function splitMeshFace(
  pts: readonly MeshPoint[],
  faces: readonly MeshFace[],
  faceIndex: number,
  pointA: MeshPoint,
  pointB: MeshPoint,
): MeshFaceSplitResult | string {
  if (faceIndex < 0 || faceIndex >= faces.length)
    return `MESHSPLIT: la cara ${faceIndex} ya no existe en esta malla.`;
  const outer = faces[faceIndex].outer;
  if (outer.length < 3) return "MESHSPLIT: la cara designada no es un polígono válido.";

  const snapTol = averageEdgeLength(pts, outer) * 1e-4;
  const hitA = nearestOnBoundary(pointA, pts, outer);
  const hitB = nearestOnBoundary(pointB, pts, outer);

  const newPoints: MeshPoint[] = [...pts];

  // Resuelve un punto del contorno a un índice de vértice: reutiliza uno
  // existente si la proyección cae a menos de `snapTol` de un extremo, o crea
  // uno nuevo en medio de la arista si no.
  function resolve(hit: BoundaryHit): { vertexIndex: number; created: boolean } {
    const va = outer[hit.edge];
    const vb = outer[(hit.edge + 1) % outer.length];
    const distToA = Math.hypot(hit.point.x - pts[va].x, hit.point.y - pts[va].y, hit.point.z - pts[va].z);
    const distToB = Math.hypot(hit.point.x - pts[vb].x, hit.point.y - pts[vb].y, hit.point.z - pts[vb].z);
    if (distToA <= snapTol) return { vertexIndex: va, created: false };
    if (distToB <= snapTol) return { vertexIndex: vb, created: false };
    const idx = newPoints.length;
    newPoints.push(hit.point);
    return { vertexIndex: idx, created: true };
  }

  // Construye el lazo AUMENTADO: el contorno original con los puntos nuevos
  // insertados en su arista, y recuerda en qué posición del lazo quedó cada
  // uno de los dos puntos designados.
  const resolvedA = resolve(hitA);
  const resolvedB = resolve(hitB);

  if (!resolvedA.created && !resolvedB.created && resolvedA.vertexIndex === resolvedB.vertexIndex)
    return "MESHSPLIT: los dos puntos designados caen en el mismo vértice; no hay cuerda que trazar.";
  if (resolvedA.created && resolvedB.created && hitA.edge === hitB.edge)
    return "MESHSPLIT: los dos puntos designados caen en la misma arista; no cruzan la cara.";

  type AugEntry = { vertexIndex: number; insertAfterEdge: number | null };
  const augmented: AugEntry[] = [];
  let posA = -1;
  let posB = -1;
  for (let i = 0; i < outer.length; i++) {
    augmented.push({ vertexIndex: outer[i], insertAfterEdge: null });
    if (!resolvedA.created && outer[i] === resolvedA.vertexIndex) posA = augmented.length - 1;
    if (!resolvedB.created && outer[i] === resolvedB.vertexIndex) posB = augmented.length - 1;
    if (resolvedA.created && hitA.edge === i) {
      augmented.push({ vertexIndex: resolvedA.vertexIndex, insertAfterEdge: i });
      posA = augmented.length - 1;
    }
    if (resolvedB.created && hitB.edge === i) {
      augmented.push({ vertexIndex: resolvedB.vertexIndex, insertAfterEdge: i });
      posB = augmented.length - 1;
    }
  }
  if (posA < 0 || posB < 0 || posA === posB)
    return "MESHSPLIT: no se pudo situar la cuerda sobre el contorno de la cara.";

  const n = augmented.length;
  const chain = (from: number, to: number): number[] => {
    const out: number[] = [];
    let i = from;
    while (true) {
      out.push(augmented[i].vertexIndex);
      if (i === to) break;
      i = (i + 1) % n;
    }
    return out;
  };

  const arc1 = chain(posA, posB);
  const arc2 = chain(posB, posA);

  if (arc1.length < 3 || arc2.length < 3)
    return "MESHSPLIT: la cuerda designada deja un lado con menos de 3 vértices; no divide la cara en dos caras válidas.";

  // Conformar las caras VECINAS: si un punto creó un vértice a mitad de
  // arista, la cara del otro lado de esa misma arista necesita el mismo
  // vértice insertado, o la malla deja de ser variedad (ver cabecera).
  const otherFaces = faces.map((f, i) => (i === faceIndex ? f : { outer: [...f.outer] }));
  if (resolvedA.created) {
    const va = outer[hitA.edge];
    const vb = outer[(hitA.edge + 1) % outer.length];
    for (let i = 0; i < otherFaces.length; i++) {
      if (i === faceIndex) continue;
      const conformed = insertOnMatchingEdge(otherFaces[i].outer, va, vb, resolvedA.vertexIndex);
      if (conformed) otherFaces[i] = { outer: conformed };
    }
  }
  if (resolvedB.created) {
    const va = outer[hitB.edge];
    const vb = outer[(hitB.edge + 1) % outer.length];
    for (let i = 0; i < otherFaces.length; i++) {
      if (i === faceIndex) continue;
      const conformed = insertOnMatchingEdge(otherFaces[i].outer, va, vb, resolvedB.vertexIndex);
      if (conformed) otherFaces[i] = { outer: conformed };
    }
  }

  const newFaces: MeshFace[] = [
    ...otherFaces.slice(0, faceIndex),
    { outer: arc1 },
    { outer: arc2 },
    ...otherFaces.slice(faceIndex + 1),
  ];

  return { points: newPoints, faces: newFaces };
}
