/**
 * Puerto neutral de eventos de dominio del CAD (WP2c).
 *
 * Reservado para los futuros eventos `design.*` (Fase 2): publicación de
 * documentos, versiones, revisiones, etc. Hoy el adaptador por defecto es un
 * no-op (`NoopCadEventPublisher`); Fase 2 lo sustituye por un publicador real
 * (bus/outbox) sin tocar el dominio.
 */

/** Evento de dominio CAD; `type` usará el namespace `design.*` en Fase 2. */
export interface CadDomainEvent {
  type: string;
  payload: unknown;
}

export interface CadEventPublisher {
  publish(event: CadDomainEvent): void;
}

/** Token de inyección del puerto. */
export const CAD_EVENT_PUBLISHER = Symbol('CAD_EVENT_PUBLISHER');
