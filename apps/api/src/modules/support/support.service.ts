import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  EMAIL_SERVICE,
  type EmailService,
} from '../commercial/ports/commercial.ports';
import {
  buildSupportIncidentPayload,
  supportIncidentIdempotencyKey,
  type SupportIncidentInput,
} from './support-incident.payload';

/** La plantilla del outbox. Misma familia que el resto del correo del producto. */
export const SUPPORT_INCIDENT_TEMPLATE = 'support.incident';

/**
 * Entrega de los reportes del botón «algo salió mal».
 *
 * Va por el OUTBOX transaccional que ya existe —con su idempotencia, sus
 * reintentos y su cola de fallidos— y no por una llamada directa al proveedor
 * de correo. La razón es la de siempre: un reporte que se pierde porque el
 * proveedor estaba caído en ese segundo es exactamente el reporte que hacía
 * falta.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly db: DataSource,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  async report(
    input: SupportIncidentInput,
    context: { reportedBy: string; organizationId: string | null },
  ): Promise<void> {
    const recipient = process.env.SUPPORT_EMAIL?.trim();
    if (!recipient)
      // Se dice, no se traga. Un 202 sin buzón configurado sería el peor de
      // los mundos: la persona cree que reportó y nadie lo lee jamás.
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'support_channel_unavailable',
        message:
          'El canal de reportes no está configurado todavía. Escríbenos desde la página de soporte y llegará igual.',
      });

    const payload = buildSupportIncidentPayload(input, {
      ...context,
      reportedAt: new Date(),
    });
    const idempotencyKey = supportIncidentIdempotencyKey(payload, (value) =>
      createHash('sha256').update(value).digest('hex').slice(0, 16),
    );

    await this.db.transaction(async (manager) => {
      await this.email.enqueue(
        {
          // El correo de soporte NO pertenece a un inquilino: es del producto.
          // Marcarlo con la organización lo dejaría fuera del alcance de quien
          // tiene que leerlo, que es justo lo contrario de lo que hace falta.
          organizationId: null,
          tenantId: null,
          to: recipient,
          template: SUPPORT_INCIDENT_TEMPLATE,
          payload,
          idempotencyKey,
        },
        { native: manager },
      );
    });
  }
}
