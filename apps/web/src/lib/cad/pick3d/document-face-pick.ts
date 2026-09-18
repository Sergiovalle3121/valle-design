/**
 * De un rayo de cámara a «esta cara de este sólido».
 *
 * `face-ray.ts` responde por UN cuerpo B-rep; esto responde por el DOCUMENTO:
 * recorre los `solid3d`, lanza el rayo contra cada uno y devuelve el impacto
 * más cercano, ya con la huella de cara que el nodo `push` va a persistir.
 *
 * ## Aritmética pura, a propósito
 *
 * No conoce THREE, ni la cámara, ni el evento del ratón. Recibe un rayo ya
 * construido y una lista de sólidos. Así el gesto completo se puede probar en
 * Node —dos sólidos superpuestos, el rayo entra por el de delante— sin montar
 * un lienzo ni un navegador, que es la diferencia entre un spec que corre en
 * cada push y un golden que corre cuando alguien se acuerda.
 *
 * ## Por qué devuelve la huella y no el índice
 *
 * El índice de cara es válido para el cuerpo que se acaba de evaluar y para
 * ninguno más: en cuanto el sólido se reconstruye —y empujar una cara lo
 * reconstruye— apunta a otra cosa, en silencio. Lo que viaja al documento es la
 * huella geométrica, con el índice dentro sólo como vía rápida que
 * `cadResolveFaceRef` comprueba antes de creerse.
 */
import type { CadDocument, CadEntity, CadPoint2, CadPoint3 } from "../cad-document";
import type { CadSolid3dEntity, CadSolidFaceRef, CadSolidPlacement } from "../cad-entities-v5";
import { halfEdgeSegment } from "../../brep";
import { solid3dBody, evaluateSolidTree, resolveSolidPlacement } from "../solid3d-build";
import { cadFaceRayHit, type CadPickRay } from "./face-ray";
import { hitEdge } from "./edge-ray";
import { cadFaceRefFromBody } from "./solid-face-ref";

export interface CadDocumentFacePick {
  /** Entidad `solid3d` a la que pertenece la cara. */
  entityId: string;
  /** Huella de la cara: lo que se persiste. */
  face: CadSolidFaceRef;
  /** Punto exacto donde el rayo tocó la cara, en coordenadas de mundo. */
  point: CadPoint3;
  /** Normal unitaria de la cara: la dirección positiva del empujón. */
  normal: CadPoint3;
  /** Distancia sobre el rayo. Se expone para poder ordenar entre anfitriones. */
  distance: number;
}

function isSolid(entity: CadEntity): entity is CadSolid3dEntity {
  return entity.type === "solid3d";
}

/**
 * Transforma un rayo a coordenadas locales del sólido invirtiendo la colocación.
 * Necesario para que el índice de arista coincida con el cuerpo del operando
 * (sin colocar), que es lo que el kernel usa al resolver edges.
 */
function rayToLocal(ray: CadPickRay, placement?: CadSolidPlacement): CadPickRay {
  const m = resolveSolidPlacement(placement);
  const etx = m.e + m.tx;
  const ety = m.f + m.ty;
  const etz = m.dz + m.tz;

  // Traslación: origin - translation
  const ox = ray.origin.x - etx;
  const oy = ray.origin.y - ety;
  const oz = ray.origin.z - etz;

  // Inversa de la 3x3: adjunta / determinante
  const a = m.a, b = m.b, c = m.c, d = m.d;
  const m02 = m.m02, m12 = m.m12, m20 = m.m20, m21 = m.m21, m22 = m.m22;

  const det =
    a * (d * m22 - m12 * m21) -
    c * (b * m22 - m12 * m20) +
    m02 * (b * m21 - d * m20);

  if (Math.abs(det) < 1e-12) return ray; // singular: no invertible

  const invDet = 1 / det;

  // Cofactores de la transpuesta = inversa
  const i00 = (d * m22 - m12 * m21) * invDet;
  const i01 = (m02 * m21 - c * m22) * invDet;
  const i02 = (c * m12 - m02 * d) * invDet;
  const i10 = (m12 * m20 - b * m22) * invDet;
  const i11 = (a * m22 - m02 * m20) * invDet;
  const i12 = (m02 * b - a * m12) * invDet;
  const i20 = (b * m21 - d * m20) * invDet;
  const i21 = (c * m20 - a * m21) * invDet;
  const i22 = (a * d - c * b) * invDet;

  return {
    origin: {
      x: i00 * ox + i01 * oy + i02 * oz,
      y: i10 * ox + i11 * oy + i12 * oz,
      z: i20 * ox + i21 * oy + i22 * oz,
    },
    direction: {
      x: i00 * ray.direction.x + i01 * ray.direction.y + i02 * ray.direction.z,
      y: i10 * ray.direction.x + i11 * ray.direction.y + i12 * ray.direction.z,
      z: i20 * ray.direction.x + i21 * ray.direction.y + i22 * ray.direction.z,
    },
  };
}

/**
 * La cara más cercana al origen del rayo, o `null` si no toca ninguna.
 *
 * Un sólido cuyo árbol no evalúa —una referencia de cara rota, un operando que
 * desapareció— se SALTA en vez de tumbar la designación entera: el usuario está
 * apuntando a otra cosa y no tiene por qué pagar el defecto de un vecino. El
 * sólido roto ya se anuncia por su cuenta en el panel de diagnóstico.
 */
export function cadDocumentFaceUnderRay(
  document: CadDocument,
  ray: CadPickRay,
): CadDocumentFacePick | null {
  let best: CadDocumentFacePick | null = null;
  for (const entity of document.entities) {
    if (!isSolid(entity)) continue;
    let body;
    let hit;
    try {
      body = solid3dBody(entity);
      hit = cadFaceRayHit(body, ray);
    } catch {
      continue;
    }
    if (!hit) continue;
    if (best && hit.t >= best.distance) continue;
    best = {
      entityId: entity.id,
      face: cadFaceRefFromBody(body, hit.face),
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: hit.t,
    };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Edge picking: la arista más cercana al rayo en todo el documento
// ---------------------------------------------------------------------------

export interface CadDocumentEdgePick {
  entityId: string;
  edge: number;
  from: CadPoint3;
  to: CadPoint3;
  point: CadPoint2;
  distance: number;
}

/**
 * La arista más cercana al rayo en todo el documento, o `null`.
 *
 * Mismo patrón que `cadDocumentFaceUnderRay`: recorre los `solid3d`, lanza el
 * rayo contra cada uno y devuelve el impacto más cercano. Un sólido cuyo árbol
 * no evalúa se salta.
 */
export function cadDocumentEdgeUnderRay(
  document: CadDocument,
  ray: CadPickRay,
): CadDocumentEdgePick | null {
  let best: CadDocumentEdgePick | null = null;
  for (const entity of document.entities) {
    if (!isSolid(entity)) continue;
    let body;
    let hit;
    try {
      // Usar el cuerpo SIN colocar para que el índice de arista coincida con
      // lo que el kernel usa al resolver edges (evaluate(node.operand)).
      // El rayo se transforma a coordenadas locales con la inversa de la
      // colocación.
      body = evaluateSolidTree(entity, { skipPlacement: true });
      const localRay = rayToLocal(ray, entity.placement);
      hit = hitEdge(body, localRay);
    } catch {
      continue;
    }
    if (!hit) continue;
    // Comparar usando la distancia en coordenadas de mundo (la del rayo original).
    // hitEdge devuelve la distancia en coordenadas locales, que puede diferir si
    // la colocación escala. Para ordenar entre sólidos, usamos la distancia
    // perpendicular del rayo original al punto colocado.
    const m = resolveSolidPlacement(entity.placement);
    const etx = m.e + m.tx;
    const ety = m.f + m.ty;
    const etz = m.dz + m.tz;
    const worldPoint = {
      x: m.a * hit.point.x + m.c * hit.point.y + m.m02 * hit.point.z + etx,
      y: m.b * hit.point.x + m.d * hit.point.y + m.m12 * hit.point.z + ety,
      z: m.m20 * hit.point.x + m.m21 * hit.point.y + m.m22 * hit.point.z + etz,
    };
    // Distancia perpendicular del rayo original al punto colocado
    const dx = worldPoint.x - ray.origin.x;
    const dy = worldPoint.y - ray.origin.y;
    const dz = worldPoint.z - ray.origin.z;
    const dot = dx * ray.direction.x + dy * ray.direction.y + dz * ray.direction.z;
    const worldDist = Math.sqrt(
      (dx - dot * ray.direction.x) ** 2 +
      (dy - dot * ray.direction.y) ** 2 +
      (dz - dot * ray.direction.z) ** 2,
    );
    if (best && worldDist >= best.distance) continue;
    const seg = halfEdgeSegment(body, body.edges[hit.edge].a);
    best = {
      entityId: entity.id,
      edge: hit.edge,
      from: { x: seg.from.x, y: seg.from.y, z: seg.from.z },
      to: { x: seg.to.x, y: seg.to.y, z: seg.to.z },
      point: { x: hit.point.x, y: hit.point.y },
      distance: worldDist,
    };
  }
  return best;
}
