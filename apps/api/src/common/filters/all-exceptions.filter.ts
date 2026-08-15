import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import {
  ERROR_REPORTER,
  type ErrorReporter,
} from '../../observability/error-reporter.port';
import { scrubStack, scrubText } from '../../observability/scrub';

/**
 * Global catch-all exception filter.
 *
 * Goals:
 *  - **Correlation:** assign/propagate an `x-request-id` on every error so a
 *    client-facing failure can be tied to a server log line.
 *  - **No internal leaks:** unexpected (non-HTTP) errors always return a generic
 *    500 body — never a stack trace or driver message — while the full error +
 *    stack is logged server-side.
 *  - **Contract stability:** for `HttpException`s the standard Nest response body
 *    is preserved as-is (only `requestId` is added), so existing frontend error
 *    handling keeps working.
 *
 * WebSocket/RPC contexts are left to their own handling (the filter only acts on
 * HTTP requests).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  /**
   * Puerto de reporte, OPCIONAL a propósito: las specs que construyen el
   * filtro a mano (y cualquier módulo de prueba que no importe
   * `ObservabilityModule`) siguen funcionando sin binding, y el reporte no
   * se convierte en un requisito de arranque.
   */
  constructor(
    @Optional()
    @Inject(ERROR_REPORTER)
    private readonly reporter?: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Only handle HTTP; rethrow anything else so Nest's default ws/rpc handling
    // (and gateway-level handlers) still applies.
    if (host.getType() !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId =
      (req.headers['x-request-id'] as string | undefined)?.trim() ||
      randomUUID();
    res.setHeader('x-request-id', requestId);

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const message =
      exception instanceof Error ? exception.message : String(exception);

    // Log server errors with the stack for diagnosis; 4xx are expected client
    // errors and are left unlogged to avoid noise (the requestId is still
    // returned, so they remain traceable if needed).
    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      this.report(exception, req, requestId, status, message);
    }

    if (isHttp) {
      // Preserve Nest's standard body; only enrich it with the requestId.
      const body = exception.getResponse();
      if (body !== null && typeof body === 'object') {
        res.status(status).json({ ...body, requestId });
      } else {
        res
          .status(status)
          .json({ statusCode: status, message: body, requestId });
      }
      return;
    }

    // Unexpected error: never leak internals to the client.
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      requestId,
    });
  }

  /**
   * Envía el fallo al puerto de observabilidad.
   *
   * Se reporta EL MISMO conjunto que ya se escribe en el log del servidor
   * (clase, mensaje, traza, correlación), pero saneado: el `message` de un
   * `QueryFailedError` incluye la sentencia con sus parámetros, y ahí viajan
   * correos, UUID de tenant y hashes. El log del servidor vive en la
   * infraestructura del operador; un reporte sale del perímetro, así que la
   * barra es más alta.
   *
   * La ruta que se etiqueta es el PATRÓN (`req.route.path`), nunca
   * `originalUrl`: la URL real contiene identificadores.
   *
   * Nunca lanza: un reporter roto no puede convertir un 500 en dos.
   */
  private report(
    exception: unknown,
    req: Request,
    requestId: string,
    status: number,
    message: string,
  ): void {
    if (!this.reporter) return;
    try {
      const route = (req as { route?: { path?: unknown } }).route?.path;
      this.reporter.report({
        kind: exception instanceof Error ? exception.name : 'UnknownError',
        message: scrubText(message),
        level: status >= 500 ? 'error' : 'warning',
        source: 'AllExceptionsFilter',
        requestId,
        method: req.method,
        route: typeof route === 'string' && route ? route : undefined,
        statusCode: status,
        stack:
          exception instanceof Error ? scrubStack(exception.stack) : undefined,
      });
    } catch {
      // Best effort: la observabilidad no puede degradar la respuesta.
    }
  }
}
