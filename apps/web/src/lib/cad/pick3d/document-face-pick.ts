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
import type { CadDocument, CadEntity, CadPoint3 } from "../cad-document";
import type { CadSolid3dEntity, CadSolidFaceRef } from "../cad-entities-v5";
import { solid3dBody } from "../solid3d-build";
import { cadFaceRayHit, type CadPickRay } from "./face-ray";
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
