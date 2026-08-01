import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignAuditLogEntry } from './entities/design-audit-log.entity';
import { DesignAuditLog } from './design-audit-log.service';
import { provideTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';

/**
 * Bitácora de auditoría propia de Design (`design_audit_log`) — sustituye al
 * EventLedger de Enterprise para los asientos CAD y las denegaciones RBAC.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DesignAuditLogEntry])],
  providers: [
    provideTenantScopedRepository(DesignAuditLogEntry, { strict: true }),
    DesignAuditLog,
  ],
  exports: [DesignAuditLog],
})
export class AuditLogModule {}
