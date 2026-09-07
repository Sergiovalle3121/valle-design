import { isDocumentId } from "@/lib/cad/document-identity";
import { documentIdCache } from "./layout-http-adapter";

/**
 * La identidad del documento SIN red ni creación: la caché que llenó la primera
 * carga del editor, o el propio UUID cuando `/studio/[documentId]` lo pasa como
 * alcance. `null` mientras el editor no haya abierto nada — quien pregunte
 * antes de eso no tiene documento del que hablar. Vive fuera del adaptador
 * porque ese fichero sólo puede encoger (presupuesto del monolito).
 */
export function peekLegacyDocumentId(
  model: string,
  revision: string,
): string | null {
  if (revision === "DOCUMENT" && isDocumentId(model)) return model;
  return documentIdCache.get(`${model}|${revision}`) ?? null;
}
