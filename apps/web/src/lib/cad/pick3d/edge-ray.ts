/**
 * Qué ARISTA de un sólido hay bajo el puntero — con un rayo de verdad.
 *
 * La pregunta es: dado un rayo que sale de la cámara, ¿qué arista del cuerpo
 * B-rep está más cerca del rayo en pantalla? No es un hit-test contra triángulos
 * (eso es `face-ray.ts`): es la distancia mínima entre un rayo y un segmento
 * de media arista.
 *
 * ## Por qué es necesario
 *
 * `FILLETEDGE` y `CHAMFEREDGE` eligen las aristas por `preferredFeatureEdges`,
 * que clasifica por verticalidad y disyunción de vértices. En un perfil en L
 * eso incluye la arista cóncava que el kernel rechaza, y el comando falla
 * entero. Con designación de arista, el usuario pincha la que quiere.
 *
 * ## Cómo funciona
 *
 * Para cada arista del cuerpo, se calcula la distancia mínima entre el rayo y
 * el segmento de la media arista. Se devuelve la más cercana dentro de un
 * umbral en píxeles (proyectado a unidades de dibujo con la distancia de la
 * cámara).
 *
 * La fórmula distancia(rayo, segmento) es la estándar: se parametriza el rayo
 * como `P = origin + t·direction` y el segmento como `Q = from + u·(to-from)`
 * con `u ∈ [0,1]`, y se minimiza `|P - Q|²` sobre `t` y `u`.
 */
import {
  aabbDiagonal,
  bodyBounds,
  halfEdgeSegment,
  type BrepBody,
  type Vec3,
} from "../../brep";

export interface CadPickRay {
  origin: Vec3;
  direction: Vec3;
}

export interface CadEdgeHit {
  /** Índice de arista en `body.edges`, base 0. */
  edge: number;
  /** Punto más cercano sobre la arista. */
  point: Vec3;
  /** Parámetro sobre el rayo. */
  t: number;
  /** Distancia entre el rayo y la arista, en unidades de dibujo. */
  distance: number;
}

export interface CadEdgeRayOptions {
  /** Umbral máximo de distancia en unidades de dibujo. */
  maxDistance?: number;
  /** Escala del mundo para los epsilon. */
  scale?: number;
}

const RELATIVE_EPSILON = 1e-9;
const MIN_SCALE = 1e-12;

function scaleOf(body: BrepBody, options: CadEdgeRayOptions): number {
  if (options.scale !== undefined && Number.isFinite(options.scale) && options.scale > 0)
    return options.scale;
  const diagonal = aabbDiagonal(bodyBounds(body));
  return diagonal > MIN_SCALE ? diagonal : 1;
}

/**
 * Distancia mínima entre un rayo y un segmento.
 *
 * Retorna `{ t, u, distance }` donde:
 * - `t`: parámetro sobre el rayo (puede ser negativo)
 * - `u`: parámetro sobre el segmento, acotado a [0, 1]
 * - `distance`: distancia euclidiana
 */
function raySegmentDistance(
  rayOrigin: Vec3,
  rayDir: Vec3,
  segFrom: Vec3,
  segTo: Vec3,
): { t: number; u: number; distance: number } {
  // Vector del origen del rayo al inicio del segmento
  const w0x = rayOrigin.x - segFrom.x;
  const w0y = rayOrigin.y - segFrom.y;
  const w0z = rayOrigin.z - segFrom.z;

  // Dirección del segmento
  const ux = segTo.x - segFrom.x;
  const uy = segTo.y - segFrom.y;
  const uz = segTo.z - segFrom.z;

  const a = rayDir.x * rayDir.x + rayDir.y * rayDir.y + rayDir.z * rayDir.z; // |rayDir|²
  const b = rayDir.x * ux + rayDir.y * uy + rayDir.z * uz; // rayDir · segDir
  const c = ux * ux + uy * uy + uz * uz; // |segDir|²
  const d = rayDir.x * w0x + rayDir.y * w0y + rayDir.z * w0z; // rayDir · w0
  const e = ux * w0x + uy * w0y + uz * w0z; // segDir · w0

  const denom = a * c - b * b;

  let t: number;
  let u: number;

  if (Math.abs(denom) < RELATIVE_EPSILON * a * c) {
    // Rayos casi paralelos: usar el punto medio del segmento
    t = 0;
    u = 0.5;
  } else {
    t = (b * e - c * d) / denom;
    u = (a * e - b * d) / denom;
    // Acotar u a [0, 1] (el segmento tiene extremos)
    u = Math.max(0, Math.min(1, u));
  }

  // Punto más cercano sobre el rayo
  const px = rayOrigin.x + t * rayDir.x;
  const py = rayOrigin.y + t * rayDir.y;
  const pz = rayOrigin.z + t * rayDir.z;

  // Punto más cercano sobre el segmento
  const qx = segFrom.x + u * ux;
  const qy = segFrom.y + u * uy;
  const qz = segFrom.z + u * uz;

  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return { t, u, distance };
}

/**
 * Encuentra la arista más cercana al rayo dentro del umbral.
 *
 * Devuelve `null` si ninguna arista está dentro del umbral. El umbral se
 * expresa en unidades de dibujo; la UI lo calcula a partir de píxeles y la
 * distancia de la cámara.
 */
export function hitEdge(
  body: BrepBody,
  ray: CadPickRay,
  options: CadEdgeRayOptions = {},
): CadEdgeHit | null {
  const scale = scaleOf(body, options);
  const maxDist = options.maxDistance ?? scale * 0.02; // 2% de la diagonal por defecto

  let best: CadEdgeHit | null = null;

  for (let i = 0; i < body.edges.length; i++) {
    const seg = halfEdgeSegment(body, body.edges[i].a);
    const result = raySegmentDistance(ray.origin, ray.direction, seg.from, seg.to);

    if (result.distance < maxDist && result.t > 0) {
      if (!best || result.distance < best.distance) {
        const point: Vec3 = {
          x: seg.from.x + result.u * (seg.to.x - seg.from.x),
          y: seg.from.y + result.u * (seg.to.y - seg.from.y),
          z: seg.from.z + result.u * (seg.to.z - seg.from.z),
        };
        best = { edge: i, point, t: result.t, distance: result.distance };
      }
    }
  }

  return best;
}
