/**
 * PUERTO de reporte de errores.
 *
 * Mismo principio que `PAYMENT_PROVIDER`: el dominio no conoce proveedor
 * alguno. Aquí se declara QUÉ se reporta; quién lo recibe (nadie, por defecto)
 * es una decisión de configuración, no de código.
 *
 * Por qué un puerto y no una dependencia de Sentry:
 * - el repo debe seguir verde y sin red en tests — el adaptador por defecto es
 *   inerte y no hace una sola llamada;
 * - el árbol de producción no gana una dependencia (ni su licencia, ni su
 *   superficie, ni sus transitivas) para una capacidad que un despliegue
 *   puede no querer;
 * - cambiar de proveedor no toca el filtro de excepciones ni el worker.
 */

export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

/** Severidad, con los mismos nombres que entiende el protocolo de Sentry. */
export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info';

export interface ErrorReport {
  /** Clase del fallo (`TypeError`, `QueryFailedError`, …). Nunca datos. */
  kind: string;
  /** Mensaje YA saneado por el emisor; el adaptador vuelve a sanear. */
  message: string;
  level: ErrorLevel;
  /** Dónde ocurrió: `AllExceptionsFilter`, `CommercialOutboxWorker`, … */
  source: string;
  /** Correlación con el log del servidor. */
  requestId?: string;
  /** PATRÓN de ruta de Express, jamás la URL real. */
  route?: string;
  method?: string;
  statusCode?: number;
  /** Traza; el adaptador la sanea antes de enviarla. */
  stack?: string;
  /** Etiquetas de baja cardinalidad. Sin PII, sin identificadores. */
  tags?: Record<string, string>;
}

export interface ErrorReporter {
  /**
   * Reporta un error. NUNCA lanza y NUNCA bloquea el camino de la petición:
   * un backend de telemetría caído no puede convertir un 500 en dos.
   */
  report(report: ErrorReport): void;
  /** Vacía lo pendiente durante el apagado ordenado. */
  flush?(): Promise<void>;
}
