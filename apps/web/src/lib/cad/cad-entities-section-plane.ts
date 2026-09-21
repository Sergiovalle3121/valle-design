/**
 * SECTIONPLANE — el plano de corte como objeto del documento, no como un
 * gesto efímero de una orden.
 *
 * Se declara aquí y no en `cad-document.ts` por las mismas dos razones que
 * justifican `cad-entities-v5.ts` y `cad-entities-v6.ts`: el fichero está en
 * el trinquete de tamaño, y este módulo es una HOJA del grafo de carga —sólo
 * `import type` hacia `cad-document.ts`, y un único valor de `../brep`, que no
 * importa nada de `lib/cad`—, así que no puede cerrar ningún ciclo.
 *
 * ## Por qué esto no es «esquema 8» ni exige migración
 *
 * Un esquema nuevo existe para cuando un documento VIEJO necesita ponerse al
 * día —un campo que antes no estaba, una sección que hay que inicializar—.
 * Un SECTIONPLANE no reescribe nada que ya existiera: un documento sin
 * ninguno es exactamente tan válido como uno con tres, igual que un documento
 * sin una sola REGION lo es. No hay nada que migrar.
 *
 * ## Por qué guarda CUATRO PUNTOS y no un {origen, normal}
 *
 * `CadSolidPlane` —el `{origin, normal}` que ya usan SLICE y SECTION— es
 * perfecto para CALCULAR y pésimo para PERSISTIR bajo una transformada: un
 * MIRROR3D o un giro no uniforme tienen que transformar la normal con la
 * inversa traspuesta, no con la misma regla que un punto, y el día que
 * alguien reutilizara `cadTransformPoint3` para «mover» la normal el plano
 * saldría girado mal en silencio. Guardando el rectángulo como sus CUATRO
 * ESQUINAS —la misma solución que ya eligió `CadRegionEntity` para su
 * contorno— transformar el plano es transformar cuatro puntos con la regla de
 * siempre, y el plano se DERIVA de ellos con Newell cada vez que hace falta:
 * no hay un campo `normal` que pueda desincronizarse del rectángulo que se ve.
 */
import type { CadEntityContext, CadPoint3 } from "./cad-document";
import type { CadSolidPlane } from "./cad-entities-v5";
import { newellNormal } from "../brep";

export interface CadSectionPlaneEntity {
  id: string;
  type: "sectionplane";
  /**
   * Las cuatro esquinas del rectángulo, en sentido antihorario visto desde el
   * lado positivo de la normal. Coplanares por construcción: nada las obliga
   * a seguir siéndolo tras una edición a mano, y `planeOfSectionPlane` no lo
   * comprueba — es la MISMA laxitud que `CadRegionEntity.outer` ya acepta.
   */
  corners: readonly [CadPoint3, CadPoint3, CadPoint3, CadPoint3];
  /** Nombre legible, como el que ya pide SOLVIEW para una ventana. */
  name?: string;
  layer: string;
  context?: CadEntityContext;
}

/**
 * El plano de corte que representa la entidad, derivado de sus esquinas.
 *
 * Newell y no «el producto vectorial de los dos primeros lados» por la misma
 * razón que ya documenta `newellNormal`: cuatro esquinas casi colineales por
 * un redondeo de coma flotante no deben voltear el sentido del corte. El
 * origen es la PRIMERA esquina — cualquiera del rectángulo sirve como origen
 * de un plano infinito, y fijar «la primera» es lo único que hace el
 * resultado determinista entre dos llamadas.
 */
export function planeOfSectionPlane(entity: CadSectionPlaneEntity): CadSolidPlane {
  return { origin: entity.corners[0], normal: newellNormal(entity.corners) };
}
