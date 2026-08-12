import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CommercialTelemetryService } from '../../modules/commercial/commercial-telemetry.service';

/**
 * Cuenta 401/403/409/429 por PATRÓN de ruta para el runbook.
 *
 * Se registra en `finish`, cuando Express ya resolvió la ruta: `req.route`
 * trae el patrón (`/v1/cad/documents/:documentId/content`), nunca la URL con
 * parámetros reales — un identificador en la URL jamás llega a la telemetría.
 * Una petición sin ruta casada (404 de router) se descarta a propósito: su
 * path crudo es entrada del cliente, de cardinalidad y contenido arbitrarios.
 */
@Injectable()
export class HttpStatusTelemetryMiddleware implements NestMiddleware {
  constructor(private readonly telemetry: CommercialTelemetryService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    response.on('finish', () => {
      const route = (request as { route?: { path?: unknown } }).route?.path;
      if (typeof route !== 'string' || !route) return;
      this.telemetry.recordHttpStatus(
        response.statusCode,
        request.method,
        route,
      );
    });
    next();
  }
}
