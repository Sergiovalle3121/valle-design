import type { ErrorReport, ErrorReporter } from '../error-reporter.port';

/**
 * Adaptador INERTE por defecto (mismo patrón que `NullPaymentProvider`).
 *
 * No hace red, no acumula memoria y no falla nunca. Es el binding que sirve
 * cuando no hay `SENTRY_DSN`, es decir: en desarrollo, en cada spec y en
 * cualquier despliegue que todavía no haya elegido proveedor.
 *
 * Guarda el último reporte porque las specs necesitan poder afirmar que el
 * filtro de excepciones REPORTA — el tope de uno evita convertir el adaptador
 * nulo en una fuga de memoria en producción.
 */
export class NullErrorReporter implements ErrorReporter {
  private lastReport: ErrorReport | null = null;
  private reportCount = 0;

  report(report: ErrorReport): void {
    this.lastReport = report;
    this.reportCount += 1;
  }

  /** Sólo para specs y diagnóstico local. */
  get last(): ErrorReport | null {
    return this.lastReport;
  }

  get count(): number {
    return this.reportCount;
  }
}
