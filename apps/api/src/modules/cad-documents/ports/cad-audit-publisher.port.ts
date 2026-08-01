/**
 * Puerto neutral de auditoría del CAD (WP2c).
 *
 * La forma del evento espeja lo que line-engineering registra hoy al auditar
 * acciones CAD sobre el event ledger (actor + acción + referencia + estados
 * antes/después), sin arrastrar tipos del módulo event-ledger. En este WP el
 * puerto sólo queda definido y cableado: los call sites del ledger que WP2b
 * dejó en line-engineering NO se migran (son parte del ciclo legacy). En el
 * repo Design (Fase 3) el adaptador enterprise se sustituye por la bitácora
 * propia del producto.
 */

/** Asiento de auditoría de una acción CAD (forma neutral, sin ORM). */
export interface CadAuditEvent {
  /** Acción registrada, p. ej. `cad_document_saved`. */
  action: string;
  /** Tipo de la entidad referenciada, p. ej. `SF_LINE_ENGINEERING`. */
  referenceType: string;
  referenceId: string;
  /** Actor humano (email) que ejecutó la acción, si se conoce. */
  actorName?: string;
  program?: string;
  plant?: string;
  /** Estados antes/después y cualquier contexto adicional del asiento. */
  metadata?: {
    beforeState?: unknown;
    afterState?: unknown;
    [key: string]: unknown;
  };
}

export interface CadAuditPublisher {
  /** Registra el asiento; puede ser síncrono o asíncrono según el backend. */
  record(event: CadAuditEvent): void | Promise<void>;
}

/** Token de inyección del puerto. */
export const CAD_AUDIT_PUBLISHER = Symbol('CAD_AUDIT_PUBLISHER');
