/**
 * La marca que dice «esta imagen es un sustrato de PDF», y nada más.
 *
 * ## Por qué es un módulo aparte de 20 líneas
 *
 * `pdf-underlay.ts` arrastra el parser de PDF completo: objetos, contenidos,
 * `inflate`, fuentes, páginas, curvas y geometría de imantado. El editor
 * necesitaba UNA cosa de todo eso antes de saber si el plano trae un sustrato:
 * mirar si la entidad lleva la ficha. Preguntarlo importando `pdf-underlay.ts`
 * traía el parser entero a la primera carga de CUALQUIER plano, tuviera PDF o
 * no.
 *
 * Así que la pregunta barata vive aquí y el parser llega por `pdf/lazy.ts`
 * cuando la respuesta es que sí. La clave sigue definiéndose UNA vez —regla 4
 * de la campaña de cimientos—: `pdf-underlay.ts` la reexporta desde aquí.
 */
import type { CadEntity } from "../cad-document";

/** Clave de metadatos donde vive la ficha del sustrato. */
export const CAD_PDF_UNDERLAY_METADATA_KEY = "cad:pdf-underlay";

/**
 * `true` si la entidad lleva ficha de sustrato. NO la valida —eso es trabajo de
 * `cadPdfUnderlayOf`, que ya está en el parser—: sólo dice si hay algo que leer,
 * que es lo que decide si hace falta traerlo.
 */
export function cadEntityCarriesPdfUnderlay(entity: Pick<CadEntity, "context">): boolean {
  const raw = entity.context?.metadata?.[CAD_PDF_UNDERLAY_METADATA_KEY];
  return typeof raw === "string" && raw.length > 0;
}
