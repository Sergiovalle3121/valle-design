import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ormOptions } from './orm.options';
import { ReadinessState } from './bootstrap/readiness.state';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpStatusTelemetryMiddleware } from './common/telemetry/http-status-telemetry.middleware';
import { TenantModule } from './common/tenant/tenant.module';
import { HttpMetricsMiddleware } from './observability/http-metrics.middleware';
import { ObservabilityModule } from './observability/observability.module';
import { CommercialMetricsController } from './health/commercial-metrics.controller';
import { ActivationMetricsController } from './health/activation-metrics.controller';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CadAuthGuard } from './modules/auth/guards/cad-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { BlobStoreModule } from './modules/blob-store/blob-store.module';
import { CadDocumentsModule } from './modules/cad-documents/cad-documents.module';
import { CadModule } from './modules/cad/cad.module';
import { IdentityModule } from './modules/identity/identity.module';
import { LegalModule } from './modules/legal/legal.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { SupportModule } from './modules/support/support.module';
import { OutboxReceiverModule } from './modules/outbox-receiver/outbox-receiver.module';

/**
 * Aplicación del producto Valle Design (CAD).
 *
 * Guards globales (en orden): CadAuthGuard valida la sesión first-party y
 * puebla `req.user` desde datos verificados por el servidor;
 * PermissionsGuard impone el entitlement `design.cad` + RBAC `cad:*` sobre
 * las rutas anotadas. El TenantInterceptor (TenantModule, global) vierte la
 * identidad en TenantContextService para el scoping por tenant de TypeORM.
 * HttpStatusTelemetryMiddleware cuenta 401/403/409/429 por patrón de ruta
 * para el runbook (GET /health/metrics/commercial), sin URLs reales, y
 * HttpMetricsMiddleware mide todas las peticiones para `GET /metrics`
 * (Prometheus). Ambos etiquetan por PATRÓN de ruta, nunca por URL real.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot(ormOptions()),
    ObservabilityModule,
    TenantModule,
    IdentityModule,
    OrganizationsModule,
    AuthModule,
    AuditLogModule,
    LegalModule,
    BlobStoreModule,
    CommercialModule,
    SupportModule,
    OutboxReceiverModule,
    CadDocumentsModule,
    CadModule,
  ],
  controllers: [
    HealthController,
    CommercialMetricsController,
    // Activación: conteos agregados derivados de lo que ya se guarda. Mismo
    // bearer que las otras métricas; sin METRICS_TOKEN no existe.
    ActivationMetricsController,
  ],
  providers: [
    HttpStatusTelemetryMiddleware,
    ReadinessState,
    { provide: APP_GUARD, useClass: CadAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Sintaxis de comodín de Express 5 ('*' está deprecado en Nest 11).
    consumer
      .apply(HttpStatusTelemetryMiddleware, HttpMetricsMiddleware)
      .forRoutes('{*path}');
  }
}
