import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { cookie } from '../identity/identity.controller';
import { IdentityService, SESSION_COOKIE } from '../identity/identity.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { DesignAuditLog } from './design-audit-log.service';

/**
 * T-62(a) — LA BITÁCORA QUE SE ESCRIBÍA Y NADIE PODÍA LEER.
 *
 * `DesignAuditLog.record()` llevaba desde Fase 3 escribiendo cada guardado,
 * archivado y denegación CAD; no existía ninguna ruta HTTP que lo devolviera.
 * «El cliente no puede ver quién tocó sus planos» era el bloqueante que esta
 * ficha cierra.
 *
 * El tenant NO sale de la sesión activa (`CadAuthGuard` lo resuelve así,
 * pensado para el estudio: la organización con la que se está trabajando
 * ahora mismo) sino del `:organizationId` de la URL, verificado contra la
 * membresía real — el mismo patrón que `listMemberships`. Alguien con dos
 * organizaciones tiene que poder mirar la bitácora de la que NO tiene activa
 * sin cambiarse primero. Por eso este controlador abre el contexto de tenant
 * a mano (`tenantContext.run`) en vez de depender de `CadAuthGuard`.
 */
@Controller('v1/organizations')
export class AuditLogController {
  constructor(
    private readonly identity: IdentityService,
    private readonly access: OrganizationAccessService,
    private readonly auditLog: DesignAuditLog,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':organizationId/audit-log')
  async list(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Query('limit') limitRaw: string | undefined,
    @Req() req: Request,
  ) {
    const auth = await this.identity.authenticate(cookie(req, SESSION_COOKIE));
    if (!auth) throw new ForbiddenException();
    const access = await this.access.resolve(auth.user.id, organizationId);
    if (!access) throw new NotFoundException();

    const parsedLimit = limitRaw !== undefined ? Number(limitRaw) : NaN;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

    const entries = await this.tenantContext.run(
      {
        tenant_id: access.tenantId,
        organization_id: access.organization.id,
        plant_id: null,
        user_email: auth.user.email,
        role: access.membership.role,
        permissions: access.permissions,
        scopes: null,
      },
      () => this.auditLog.recent(limit),
    );

    return {
      items: entries.map((entry) => ({
        id: entry.id,
        actor: entry.actor,
        action: entry.action,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }
}
