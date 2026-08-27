import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  API_RATE_LIMITS,
  ApiRateLimitService,
} from '../identity/api-rate-limit.service';
import { ReportSupportIncidentDto } from './support-incident.dto';
import { SupportService } from './support.service';

/**
 * EL BOTÓN «ALGO SALIÓ MAL» — la única forma de enterarse.
 *
 * Los primeros arquitectos van a chocar con cosas que ninguna prueba de este
 * repositorio ha imaginado. Sin un camino de vuelta, esa información se pierde:
 * la persona cierra la pestaña, no vuelve, y nadie sabe por qué. Este endpoint
 * es ese camino.
 *
 * ── Permiso ────────────────────────────────────────────────────────────────
 *
 * `cad:view`, a propósito el más bajo. Reportar un problema no puede exigir
 * poder editar: quien está en solo-lectura tras expirar su prueba —o quien
 * mira un plano compartido— es exactamente quien más necesita poder decir que
 * algo no funciona.
 */
@Controller('v1/support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly rateLimits: ApiRateLimitService,
  ) {}

  @Post('incidents')
  @HttpCode(202)
  @RequirePermissions('cad:view')
  async report(@Body() dto: ReportSupportIncidentDto, @Req() request: Request) {
    const user = (
      request as Request & {
        user?: { id?: string; email?: string; organization_id?: string | null };
      }
    ).user;
    const reportedBy = user?.email ?? user?.id ?? 'desconocido';
    await this.rateLimits.enforce(
      'support-incidents',
      [reportedBy],
      API_RATE_LIMITS.supportIncidentsPerAccount,
    );
    await this.support.report(dto, {
      reportedBy,
      organizationId: user?.organization_id ?? null,
    });
    return { accepted: true as const };
  }
}
