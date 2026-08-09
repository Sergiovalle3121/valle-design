/**
 * Sólidos primitivos y corpus de referencia.
 *
 * No están aquí por comodidad: son los ORÁCULOS del kernel. El cubo tiene 8
 * vértices, 12 aristas y 6 caras, característica 2 y género 0; el cubo con un
 * agujero pasante tiene 16, 24, 10, dos lazos interiores, característica 0 y
 * género 1. Son números que se pueden contar a mano, así que cuando el
 * validador dice otra cosa el error es del kernel, no del test.
 *
 * El de género 1 se construye A MANO en vez de por extrusión a propósito: si lo
 * generase la extrusión, un fallo en la extrusión produciría un fixture roto y
 * el validador estaría comprobando la extrusión contra sí misma.
 */
import { buildBody, type FaceSpec } from "./body-builder";
import { planeFromPointNormal } from "./surfaces";
import {
  faceCentroid,
  faceGeometricNormal,
  type BrepBody,
} from "./topology";
import { v3Sub, vec3, type Vec3 } from "./vec3";

/**
 * Adjunta a cada cara un plano portador deducido de su propia geometría.
 *
 * Se hace DESPUÉS de construir, no durante: la normal fiable sale de Newell
 * sobre el lazo completo, y el lazo completo no existe hasta que el cuerpo está
 * cosido. Adjuntar el plano antes obligaría a que el llamante lo calculase, y
 * un plano calculado por el llamante es un plano que puede no coincidir con la
 * cara — que es exactamente la incoherencia que el validador busca.
 */
export function attachPlanarSurfaces(body: BrepBody): BrepBody {
  for (let face = 0; face < body.faces.length; face += 1) {
    const normal = faceGeometricNormal(body, face);
    body.faces[face].surface = planeFromPointNormal(faceCentroid(body, face), normal);
    body.faces[face].reversed = false;
  }
  return body;
}

/**
 * Caras laterales de un prisma entre dos anillos de vértices alineados.
 *
 * `inward` invierte el sentido, que es lo que convierte una pared exterior en la
 * pared de un agujero pasante. La regla es simple y vale la pena escribirla: la
 * pared de un agujero mira HACIA el agujero, porque el material está fuera.
 */
export function prismSideFaces(bottomRing: readonly number[], topRing: readonly number[], inward = false): FaceSpec[] {
  const faces: FaceSpec[] = [];
  const count = bottomRing.length;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    faces.push({
      outer: inward
        ? [bottomRing[j], bottomRing[i], topRing[i], topRing[j]]
        : [bottomRing[i], bottomRing[j], topRing[j], topRing[i]],
    });
  }
  return faces;
}

export interface BoxOptions {
  min: Vec3;
  max: Vec3;
}

/**
 * Caja alineada a ejes. V=8, E=12, F=6, χ=2, G=0.
 *
 * Volumen exacto `dx·dy·dz` y área `2(dx·dy + dy·dz + dz·dx)`: dos números
 * cerrados contra los que contrastar tanto la integración por caras como la
 * suma sobre la malla teselada.
 */
export function makeBox(options: BoxOptions): BrepBody {
  const { min, max } = options;
  const points: Vec3[] = [
    vec3(min.x, min.y, min.z),
    vec3(max.x, min.y, min.z),
    vec3(max.x, max.y, min.z),
    vec3(min.x, max.y, min.z),
    vec3(min.x, min.y, max.z),
    vec3(max.x, min.y, max.z),
    vec3(max.x, max.y, max.z),
    vec3(min.x, max.y, max.z),
  ];
  const faces: FaceSpec[] = [
    { outer: [0, 3, 2, 1] }, // z mínima, normal −Z
    { outer: [4, 5, 6, 7] }, // z máxima, normal +Z
    ...prismSideFaces([0, 1, 2, 3], [4, 5, 6, 7]),
  ];
  return attachPlanarSurfaces(buildBody(points, faces));
}

export interface BoxWithHoleOptions {
  min: Vec3;
  max: Vec3;
  /** Rectángulo del agujero pasante en XY. Debe caber estrictamente dentro. */
  holeMin: { x: number; y: number };
  holeMax: { x: number; y: number };
}

/**
 * Caja con un agujero pasante rectangular en Z. V=16, E=24, F=10, R=2, χ=0, G=1.
 *
 * Es el caso que desmonta la fórmula ingenua: `V − E + F` da 2, el mismo número
 * que un cubo macizo, y quien se crea ese 2 concluye género 0 sobre un sólido
 * que tiene un agujero atravesándolo. Restando los dos lazos interiores sale
 * χ = 0 y género 1, que es lo que se ve mirando la pieza.
 */
export function makeBoxWithThroughHole(options: BoxWithHoleOptions): BrepBody {
  const { min, max, holeMin, holeMax } = options;
  if (holeMin.x <= min.x || holeMin.y <= min.y || holeMax.x >= max.x || holeMax.y >= max.y) {
    throw new Error("El agujero pasante tiene que caber ESTRICTAMENTE dentro de la caja.");
  }
  if (holeMin.x >= holeMax.x || holeMin.y >= holeMax.y) {
    throw new Error("El rectángulo del agujero está invertido o es degenerado.");
  }
  const points: Vec3[] = [
    vec3(min.x, min.y, min.z),
    vec3(max.x, min.y, min.z),
    vec3(max.x, max.y, min.z),
    vec3(min.x, max.y, min.z),
    vec3(min.x, min.y, max.z),
    vec3(max.x, min.y, max.z),
    vec3(max.x, max.y, max.z),
    vec3(min.x, max.y, max.z),
    vec3(holeMin.x, holeMin.y, min.z),
    vec3(holeMax.x, holeMin.y, min.z),
    vec3(holeMax.x, holeMax.y, min.z),
    vec3(holeMin.x, holeMax.y, min.z),
    vec3(holeMin.x, holeMin.y, max.z),
    vec3(holeMax.x, holeMin.y, max.z),
    vec3(holeMax.x, holeMax.y, max.z),
    vec3(holeMin.x, holeMax.y, max.z),
  ];
  const faces: FaceSpec[] = [
    // Tapa inferior (normal −Z): contorno horario en XY, agujero antihorario.
    { outer: [0, 3, 2, 1], inners: [[8, 9, 10, 11]] },
    // Tapa superior (normal +Z): contorno antihorario, agujero horario.
    { outer: [4, 5, 6, 7], inners: [[15, 14, 13, 12]] },
    ...prismSideFaces([0, 1, 2, 3], [4, 5, 6, 7]),
    ...prismSideFaces([8, 9, 10, 11], [12, 13, 14, 15], true),
  ];
  return attachPlanarSurfaces(buildBody(points, faces));
}

/** Tetraedro regular inscrito en el cubo unidad escalado. V=4, E=6, F=4, χ=2. */
export function makeTetrahedron(size = 1): BrepBody {
  const s = size;
  const points: Vec3[] = [vec3(s, s, s), vec3(s, -s, -s), vec3(-s, s, -s), vec3(-s, -s, s)];
  const faces: FaceSpec[] = [
    { outer: [0, 1, 2] },
    { outer: [0, 2, 3] },
    { outer: [0, 3, 1] },
    { outer: [1, 3, 2] },
  ];
  return attachPlanarSurfaces(buildBody(points, faces));
}

/**
 * Prisma recto de base poligonal arbitraria, con agujeros opcionales.
 * La base llega en XY y se levanta en Z; es el ladrillo con el que se arman los
 * casos adversariales sin depender todavía de la extrusión general.
 */
export function makePrism(
  profile: readonly { x: number; y: number }[],
  z0: number,
  z1: number,
  holes: readonly (readonly { x: number; y: number }[])[] = [],
): BrepBody {
  if (profile.length < 3) throw new Error("Un prisma necesita un perfil de al menos 3 puntos.");
  if (z1 <= z0) throw new Error("La altura del prisma tiene que ser positiva.");
  const points: Vec3[] = [];
  const push = (ring: readonly { x: number; y: number }[], z: number): number[] =>
    ring.map((point) => {
      points.push(vec3(point.x, point.y, z));
      return points.length - 1;
    });
  const outerBottom = push(profile, z0);
  const outerTop = push(profile, z1);
  const holeBottoms = holes.map((hole) => push(hole, z0));
  const holeTops = holes.map((hole) => push(hole, z1));

  const faces: FaceSpec[] = [
    { outer: [...outerBottom].reverse(), inners: holeBottoms.map((ring) => [...ring]) },
    { outer: [...outerTop], inners: holeTops.map((ring) => [...ring].reverse()) },
    ...prismSideFaces(outerBottom, outerTop),
    ...holeBottoms.flatMap((ring, index) => prismSideFaces(ring, holeTops[index], true)),
  ];
  return attachPlanarSurfaces(buildBody(points, faces));
}

/** Volumen exacto de una caja, para contrastar contra el calculado. */
export function boxVolume(options: BoxOptions): number {
  const size = v3Sub(options.max, options.min);
  return size.x * size.y * size.z;
}

/** Área exacta de una caja. */
export function boxArea(options: BoxOptions): number {
  const size = v3Sub(options.max, options.min);
  return 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
}
