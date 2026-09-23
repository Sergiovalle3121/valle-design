import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { EmailService } from '../commercial/ports/commercial.ports';
import { SupportService } from './support.service';

describe('soporte sin buzón configurado', () => {
  it('rechaza el reporte sin prometer una vía alternativa inexistente', async () => {
    const before = process.env.SUPPORT_EMAIL;
    delete process.env.SUPPORT_EMAIL;
    try {
      const service = new SupportService(
        {} as DataSource,
        {} as EmailService,
      );
      await expect(
        service.report(
          {
            summary: 'No puedo crear un muro',
            appVersion: '2026.09.23',
            userAgent: 'Mozilla/5.0',
            uiMode: 'esencial',
            documentAuthorized: false,
          },
          { reportedBy: 'test@example.invalid', organizationId: null },
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'support_channel_unavailable',
          message:
            'El canal de reportes no está disponible todavía. Conserva tu texto e inténtalo más tarde.',
        },
      });
    } finally {
      if (before === undefined) delete process.env.SUPPORT_EMAIL;
      else process.env.SUPPORT_EMAIL = before;
    }
  });
});
