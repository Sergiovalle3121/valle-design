/**
 * El techo del contrato, para los comandos que pueden crear muchas entidades
 * de golpe (T-24·1): `ARRAY`, `COPY` múltiple y `DIVIDE` con bloque.
 *
 * `ARRAY 500×500` sobre diez objetos son 2 500 000 entidades: sin
 * confirmación, sin tope, sin cancelación, y el documento resultante ya no
 * se puede volver a guardar nunca —`CAD_DOCUMENT_LIMITS.maxEntities` es
 * justo el límite que el servidor aplica al guardar—. AutoCAD lleva treinta
 * años preguntando «va a crear N elementos, ¿continúa?» antes de eso.
 *
 * El número no se escribe a mano aquí: se importa del contrato
 * (`@valle-design/contracts`), que es LA fuente — `cad-document-validation.ts`
 * y `cad-document-storage.ts` (apps/api) importan el mismo valor en vez de
 * redeclararlo, y este módulo hace lo mismo para no volver a abrir el hueco
 * que esa campaña ya cerró (el contrato prometiendo un número y el servidor
 * aplicando otro).
 */
import { CAD_DOCUMENT_LIMITS } from "@valle-design/contracts";

export const CAD_BATCH_CONFIRM_YES = { keyword: "Sí", shortcut: "S" } as const;
export const CAD_BATCH_CONFIRM_NO = { keyword: "No", shortcut: "N" } as const;

/**
 * `null` si el lote no necesita confirmación; si no, el mensaje exacto a
 * mostrar, con el conteo REAL —nunca redondeado ni aproximado, porque lo que
 * se le pide al usuario es que decida sobre un número concreto.
 */
export function cadBatchConfirmationPrompt(
  currentEntityCount: number,
  entitiesToCreate: number,
): string | null {
  if (entitiesToCreate <= 0) return null;
  const total = currentEntityCount + entitiesToCreate;
  if (total <= CAD_DOCUMENT_LIMITS.maxEntities) return null;
  return (
    `Esto va a crear ${entitiesToCreate.toLocaleString("es-MX")} elemento(s); el documento pasaría a ` +
    `${total.toLocaleString("es-MX")}, por encima del límite de ` +
    `${CAD_DOCUMENT_LIMITS.maxEntities.toLocaleString("es-MX")}. ¿Continuar? [Sí/No]`
  );
}
