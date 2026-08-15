import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsRegistry } from './metrics.registry';

/**
 * Mide cada petición y la registra al terminar la respuesta.
 *
 * Mismo criterio de privacidad que `HttpStatusTelemetryMiddleware`: la
 * etiqueta es el PATRÓN de ruta que resolvió Express
 * (`/v1/cad/documents/:documentId`), nunca la URL con parámetros reales. Una
 * URL contiene identificadores de documento y de organización; una métrica
 * que los lleva es un exportador de PII con otro nombre — y además hace
 * explotar la cardinalidad del TSDB.
 *
 * Una petición que NO casó ninguna ruta (404 del router) se agrupa bajo
 * `(sin ruta)`: su path crudo es entrada del atacante y de cardinalidad
 * ilimitada, pero el RECUENTO de 404 sí es una señal operativa (un escaneo,
 * un cliente desplegado contra la versión equivocada del API).
 *
 * Se mide en `finish` con `process.hrtime.bigint()`: `Date.now()` tiene
 * resolución de milisegundos y la mayoría de estas rutas responden en pocos,
 * así que la mitad de las muestras caerían en el mismo bucket.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly registry: MetricsRegistry) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const elapsedNs = Number(process.hrtime.bigint() - startedAt);
      const route = (request as { route?: { path?: unknown } }).route?.path;
      this.registry.observeHttp({
        method: request.method,
        route: typeof route === 'string' && route ? route : '(sin ruta)',
        statusCode: response.statusCode,
        durationSeconds: elapsedNs / 1e9,
      });
    });
    next();
  }
}
