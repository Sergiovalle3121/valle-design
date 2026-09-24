import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import type { ApiRateLimitService } from '../identity/api-rate-limit.service';
import { API_RATE_LIMITS } from '../identity/api-rate-limit.service';
import { SupportController } from './support.controller';
import type { ReportSupportIncidentDto } from './support-incident.dto';
import type { SupportService } from './support.service';

const user: AuthenticatedUser = {
  userId: '11111111-2222-4333-8444-555555555555',
  email: 'arquitecta@ejemplo.mx',
  role: 'member',
  tenant_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  organization_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  plant_id: null,
  permissions: ['cad:view'],
  scopes: null,
};

const dto: ReportSupportIncidentDto = {
  summary: 'La cota de mi muro salió del revés.',
  appVersion: '2026.09.23',
  userAgent: 'Mozilla/5.0',
  uiMode: 'esencial',
  documentAuthorized: false,
};

describe('SupportController · antiabuso por cuenta autenticada', () => {
  const request = { user } as unknown as Request;

  it('usa el userId estable del guard para el límite y conserva el correo como remitente', async () => {
    const enforce = jest.fn(async () => undefined);
    const report = jest.fn(async () => undefined);
    const controller = new SupportController(
      { report } as unknown as SupportService,
      { enforce } as unknown as ApiRateLimitService,
    );

    await expect(controller.report(dto, request)).resolves.toEqual({
      accepted: true,
    });
    expect(enforce).toHaveBeenCalledWith(
      'support-incidents',
      [user.userId],
      API_RATE_LIMITS.supportIncidentsPerAccount,
    );
    expect(report).toHaveBeenCalledWith(dto, {
      reportedBy: user.email,
      organizationId: user.organization_id,
    });
  });

  it('un 429 no llega al outbox', async () => {
    const enforce = jest.fn(async () => {
      throw new HttpException({ code: 'rate_limited' }, 429);
    });
    const report = jest.fn(async () => undefined);
    const controller = new SupportController(
      { report } as unknown as SupportService,
      { enforce } as unknown as ApiRateLimitService,
    );

    await expect(controller.report(dto, request)).rejects.toMatchObject({
      status: 429,
    });
    expect(report).not.toHaveBeenCalled();
  });

  it('sin identidad del guard falla antes de consumir cuota o encolar', async () => {
    const enforce = jest.fn(async () => undefined);
    const report = jest.fn(async () => undefined);
    const controller = new SupportController(
      { report } as unknown as SupportService,
      { enforce } as unknown as ApiRateLimitService,
    );

    await expect(controller.report(dto, {} as Request)).rejects.toMatchObject({
      status: 401,
    });
    expect(enforce).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
