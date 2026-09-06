import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignAuditLogEntry } from './entities/design-audit-log.entity';
import { DesignAuditLog } from './design-audit-log.service';
import { provideTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { AuditLogController } from './audit-log.controller';
import { AuditLogRetentionService } from './audit-log-retention.service';
import { OrganizationsModule } from '../organizations/organizations.module';

/**
 * Bitácora de auditoría propia de Design (`design_audit_log`) — sustituye al
 * EventLedger de Enterprise para los asientos CAD y las denegaciones RBAC.
 *
 * T-62(a) le añade lo que le faltaba para dejar de ser sólo un escritor:
 * `AuditLogController` (la ruta de lectura, por fin) y
 * `AuditLogRetentionService` (la purga — sin esto crecía para siempre).
 * `OrganizationsModule` entra sólo por `OrganizationAccessService`, que
 * verifica la membresía real antes de dejar leer nada.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DesignAuditLogEntry]),
    OrganizationsModule,
  ],
  controllers: [AuditLogController],
  providers: [
    provideTenantScopedRepository(DesignAuditLogEntry, { strict: true }),
    DesignAuditLog,
    AuditLogRetentionService,
  ],
  exports: [DesignAuditLog],
})
export class AuditLogModule {}
