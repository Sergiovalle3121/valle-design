import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ormOptions } from './orm.options';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantModule } from './common/tenant/tenant.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CadAuthGuard } from './modules/auth/guards/cad-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { BlobStoreModule } from './modules/blob-store/blob-store.module';
import { CadDocumentsModule } from './modules/cad-documents/cad-documents.module';
import { CadModule } from './modules/cad/cad.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { CommercialModule } from './modules/commercial/commercial.module';

/**
 * Aplicación del producto Valle Design (CAD).
 *
 * Guards globales (en orden): CadAuthGuard valida la sesión first-party y
 * puebla `req.user` desde datos verificados por el servidor;
 * PermissionsGuard impone el entitlement `design.cad` + RBAC `cad:*` sobre
 * las rutas anotadas. El TenantInterceptor (TenantModule, global) vierte la
 * identidad en TenantContextService para el scoping por tenant de TypeORM.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot(ormOptions()),
    TenantModule,
    IdentityModule,
    OrganizationsModule,
    AuthModule,
    AuditLogModule,
    BlobStoreModule,
    CommercialModule,
    CadDocumentsModule,
    CadModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: CadAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
