import type {
  CadSheetSet as CadSheetSetResource,
  CadSheetSetCreate,
  CadSheetSetSave,
} from "@valle/design-sdk";
import { designClient } from "./client";
import type { CadSheetSet } from "../sheet-set/sheet-set";

/**
 * Conjuntos de planos contra la API.
 *
 * El conjunto NO vive dentro del documento canónico: es su propia tabla y su
 * propia versión, como el `.dst` de AutoCAD. Por eso tiene repositorio propio y
 * no un campo más en el de documentos.
 *
 * ## Disciplina CAS, sin excepciones
 *
 * `save` manda siempre `expectedVersion`. Un 409 se resuelve recargando y
 * volviendo a aplicar el cambio sobre lo que hay — nunca reintentando con la
 * versión nueva a ciegas, que es sobrescribir con un paso extra.
 */
export const sheetSetsRepository = {
  list: (query?: { projectId?: string; limit?: number; offset?: number }) =>
    designClient.sheetSets.list(query),
  create: (input: CadSheetSetCreate) => designClient.sheetSets.create(input),
  get: (sheetSetId: string) => designClient.sheetSets.get(sheetSetId),
  save: (sheetSetId: string, input: CadSheetSetSave) =>
    designClient.sheetSets.save(sheetSetId, input),
  remove: (sheetSetId: string) => designClient.sheetSets.remove(sheetSetId),
};

/**
 * Recurso de la API → modelo del editor.
 *
 * Las dos formas existen a propósito y no se funden: la de la API es el
 * contrato —lo que el servidor promete— y la del editor lleva además los
 * invariantes que las funciones puras dan por hechos (`schema`, `order`
 * contiguo). Convertir en un sitio explícito deja el punto donde comprobarlos.
 */
export function toCadSheetSet(resource: CadSheetSetResource): CadSheetSet {
  return {
    schema: 1,
    id: resource.id,
    name: resource.name,
    ...(resource.description ? { description: resource.description } : {}),
    fields: resource.fields ?? {},
    numbering: resource.numbering,
    sheets: (resource.sheets ?? []).map((sheet, order) => ({
      id: sheet.id,
      order: sheet.order ?? order,
      documentId: sheet.documentId,
      layoutId: sheet.layoutId,
      title: sheet.title,
      number: sheet.number,
      ...(sheet.numberLocked !== undefined ? { numberLocked: sheet.numberLocked } : {}),
      revision: sheet.revision,
      ...(sheet.fields ? { fields: sheet.fields } : {}),
      ...(sheet.includeInPublish !== undefined
        ? { includeInPublish: sheet.includeInPublish }
        : {}),
    })),
    ...(resource.subsets ? { subsets: resource.subsets.map((subset) => ({ ...subset })) } : {}),
    version: resource.version,
    ...(resource.updatedAt ? { updatedAt: resource.updatedAt } : {}),
  };
}

/** Modelo del editor → cuerpo de `PUT`, con el CAS ya puesto. */
export function toCadSheetSetSave(set: CadSheetSet): CadSheetSetSave {
  return {
    expectedVersion: set.version,
    name: set.name,
    description: set.description ?? null,
    fields: set.fields,
    numbering: set.numbering,
    sheets: set.sheets.map((sheet) => ({ ...sheet })),
    ...(set.subsets ? { subsets: set.subsets.map((subset) => ({ ...subset })) } : {}),
  };
}
