import { Global, Module } from '@nestjs/common';
import { CommercialModule } from '../modules/commercial/commercial.module';
import { createErrorReporter } from './error-reporter.factory';
import { ERROR_REPORTER } from './error-reporter.port';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { MetricsGaugesProvider } from './metrics-gauges.provider';
import { MetricsRegistry } from './metrics.registry';

/**
 * Observabilidad del proceso: reporte de errores (puerto + adaptador inerte)
 * y métricas Prometheus.
 *
 * `@Global` porque el consumidor natural del reporter es el filtro global de
 * excepciones, que Nest instancia fuera de cualquier módulo concreto.
 *
 * Importa `CommercialModule` sólo para LEER `CommercialTelemetryService`, que
 * ya exporta: el backlog y los contadores del dispatcher se miden allí, y
 * medirlos otra vez aquí produciría dos verdades con el mismo nombre.
 */
@Global()
@Module({
  imports: [CommercialModule],
  controllers: [MetricsController],
  providers: [
    MetricsRegistry,
    MetricsGaugesProvider,
    HttpMetricsMiddleware,
    {
      provide: ERROR_REPORTER,
      // Sin `SENTRY_DSN` esto devuelve `NullErrorReporter`: cero red, mismo
      // comportamiento en specs y en un despliegue sin proveedor elegido.
      useFactory: () => createErrorReporter(),
    },
  ],
  exports: [ERROR_REPORTER, MetricsRegistry, HttpMetricsMiddleware],
})
export class ObservabilityModule {}
