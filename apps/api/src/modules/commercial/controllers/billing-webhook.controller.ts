import {
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import {
  BillingWebhookNotCorrelatedError,
  BillingWebhookService,
} from '../billing-webhook.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from '../ports/payment-provider.port';

/**
 * Entrada de webhooks de la pasarela: la única ruta PÚBLICA del módulo
 * comercial.
 *
 * Es pública porque el emisor es Stripe, que no tiene sesión ni cookie ni
 * token CSRF; su credencial es la FIRMA sobre los bytes crudos, y esa es la
 * única autenticación que se acepta aquí. El cuerpo llega como Buffer porque
 * `stripeWebhookRawBody` está montado en esta ruta exacta antes del parser
 * JSON global.
 *
 * El mapa de respuestas es deliberado, porque de él depende si el proveedor
 * reintenta:
 * - 200: procesado, duplicado o tipo desconocido — nada que reintentar.
 * - 400: firma ausente, inválida o vieja, o cuerpo no verificable. Reintentar
 *   no lo arreglaría y aceptar sería fabricar un cobro.
 * - 409: legítimo pero aún no correlacionable; se PIDE el reintento.
 * - 503: no hay pasarela configurada, así que nadie debería estar llamando.
 *
 * Un tipo de evento desconocido JAMÁS produce un 500: se apunta y se acepta.
 */
@Public()
@Controller('v1/commercial/webhooks')
export class BillingWebhookController {
  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly payments: PaymentProvider,
    private readonly webhooks: BillingWebhookService,
  ) {}

  // 200, no el 201 por defecto de Nest: aquí no se crea un recurso para el
  // llamante, se ACUSA RECIBO. Es además el código que el contrato declara.
  @HttpCode(HttpStatus.OK)
  @Post('stripe')
  async receiveStripeWebhook(@Req() request: Request) {
    if (this.payments.descriptor().name !== 'stripe') {
      // Con el adaptador nulo no existe emisor legítimo. Se rechaza sin
      // intentar verificar nada: un 503 dice la verdad («aquí no hay
      // pasarela») sin insinuar que la firma estaba mal.
      throw new ServiceUnavailableException({
        code: 'payment_provider_unavailable',
        message: 'No hay pasarela de pagos configurada en este despliegue.',
      });
    }

    // `unknown` a propósito: Express tipa `body` como `any` y aquí lo que
    // importa es justo lo contrario — que nada se use sin comprobar que es un
    // Buffer con los bytes crudos.
    const rawBody: unknown = request.body;
    if (!Buffer.isBuffer(rawBody)) {
      // Sin los bytes crudos la firma no se puede verificar. Fallar aquí es
      // preferible a re-serializar el JSON y verificar otra cosa.
      throw new BadRequestException({
        code: 'raw_body_required',
        message:
          'El webhook requiere el cuerpo crudo; el body parser de la ruta no está montado.',
      });
    }

    let event: PaymentWebhookEvent;
    try {
      event = await this.payments.verifyWebhook(request.headers, rawBody);
    } catch {
      // Nunca se propaga el motivo exacto: distinguir «firma inválida» de
      // «timestamp viejo» ayudaría a quien esté probando firmas.
      throw new BadRequestException({
        code: 'invalid_signature',
        message: 'La firma del webhook no es válida.',
      });
    }

    try {
      const result = await this.webhooks.process(event, rawBody);
      return { received: true, status: result.status, outcome: result.outcome };
    } catch (error) {
      if (error instanceof BillingWebhookNotCorrelatedError) {
        throw new ConflictException({
          code: 'event_not_correlated',
          message:
            'El evento aún no se puede atribuir a una organización; reintenta.',
        });
      }
      throw error;
    }
  }
}
