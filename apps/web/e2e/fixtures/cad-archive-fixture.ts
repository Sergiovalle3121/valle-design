/**
 * Acuse del ARCHIVO DE RECUPERACIÓN (autosave gzip) para el fixture CAD.
 *
 * El editor sube el archivo en caliente cada pocos minutos
 * (`PUT /v1/cad/documents/:id/archive`). El fixture lo ACUSA — 200 con la
 * misma forma que `/content` — SIN tocar la fila: bumpear `version` aquí
 * rompería por CAS los saves explícitos de los goldens, y ningún spec
 * asierta sobre el contenido archivado. Antes esta ruta caía al 404 genérico
 * y cada autosave ensuciaba la consola: el invariante «sin errores de
 * navegador» del estrés denso caía por 7 de esos por corrida (causa raíz 8,
 * COMMERCIAL-RC1). El golden 11 (recovery-journal) enruta esta misma ruta a
 * nivel de página y conserva la precedencia de Playwright.
 */
export function acknowledgeCadArchive(
  row: { id: string; version: number; document: Record<string, unknown> | null },
  json: (body: unknown, status?: number) => Promise<void>,
): Promise<void> {
  const entities = (row.document as { entities?: unknown[] } | null)?.entities;
  return json({
    cadDocumentId: row.id,
    cadDocumentVersion: row.version,
    entityCount: Array.isArray(entities) ? entities.length : 0,
    storedAsBlobPointer: false,
  });
}
