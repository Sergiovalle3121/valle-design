import { Raw } from 'typeorm';
import type { CadProject } from '../cad-documents/entities/cad-project.entity';
import type { CadDocument } from '../cad-documents/entities/cad-document.entity';

/**
 * Piezas de los LISTADOS del repositorio CAD: ventana de página, búsqueda por
 * nombre en SQL y las proyecciones explícitas de columnas.
 */

export interface PageQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * Columnas que viajan en los LISTADOS. Nunca el documento canónico
 * (`cadDocument`, jsonb que puede pesar decenas de MB), ni el DXF crudo
 * (`dxfData`), ni `legacyMetadata`: un listado de 200 filas arrastrando eso
 * es transferencia y heap por una respuesta que sólo muestra nombre y
 * versión. Son exactamente las columnas que `documentSummary`/
 * `projectResource` serializan.
 */
export const DOCUMENT_LIST_COLUMNS = [
  'id',
  'projectId',
  'name',
  'model',
  'revision',
  'cadDocumentVersion',
  'layers',
  'legacySourceId',
  'created_at',
  'updated_at',
  'created_by',
] as const satisfies readonly (keyof CadDocument)[];

export const PROJECT_LIST_COLUMNS = [
  'id',
  'name',
  'description',
  'status',
  'legacySourceId',
  'created_at',
  'updated_at',
  'created_by',
] as const satisfies readonly (keyof CadProject)[];

/** Ventana de página del contrato v1: default 50, máximo 200. */
export function pageWindow(query: PageQuery): {
  offset: number;
  limit: number;
} {
  return {
    offset: Math.max(0, query.offset ?? 0),
    limit: Math.min(Math.max(1, query.limit ?? 50), 200),
  };
}

/**
 * Búsqueda `q` por nombre EN SQL, portable entre PostgreSQL y SQLite:
 * `LOWER(col) LIKE LOWER(:q)` con comodines escapados — un nombre con `%` o
 * `_` literales no es un patrón. Sustituye a la paginación en memoria con
 * tope de 1000 filas que hacía mentir a `total` por encima del tope y volvía
 * inalcanzable todo documento más viejo que las 1000 filas más recientes.
 * Como FindOperator dentro de `find`, conserva el scoping de tenant del
 * TenantScopedRepository (un QueryBuilder lo perdería).
 */
export function nameContains(term: string) {
  const escaped = term.replace(/[\\%_]/gu, (ch) => `\\${ch}`);
  return Raw((alias) => `LOWER(${alias}) LIKE LOWER(:q) ESCAPE '\\'`, {
    q: `%${escaped}%`,
  });
}
