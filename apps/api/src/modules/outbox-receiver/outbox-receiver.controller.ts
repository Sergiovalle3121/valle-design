import {
  BadGatewayException,
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import {
  parseDomainOutboxDelivery,
  parseEmailOutboxDelivery,
} from './outbox-delivery';
import { OutboxReceiverService } from './outbox-receiver.service';
import { verifyOutboxSignature } from './outbox-signature';
import {
  EMAIL_SENDER,
  EmailSendError,
  type EmailSender,
} from './ports/email-sender.port';

const MIN_SECRET_LENGTH = 32; // el mismo mínimo que exige el emisor

/**
 * Receptor de los webhooks del outbox PROPIO (ADR-0006/ADR-0008): la API se
 * recibe a sí misma. Rutas públicas porque el emisor es el worker de outbox,
 * que no tiene sesión ni cookie ni token CSRF; su credencial es la FIRMA
 * sobre los bytes crudos, y esa es la única autenticación que se acepta aquí.
 * El cuerpo llega como Buffer porque `outboxReceiverRawBody` está montado en
 * `/v1/outbox` antes del parser JSON global.
 *
 * El mapa de respuestas es deliberado, porque de él depende si el worker
 * reintenta (cualquier no-2xx = reintento con backoff):
 * - 200: procesado, duplicado o plantilla desconocida — nada que reintentar.
 * - 400: firma ausente, inválida o vieja, o cuerpo no verificable.
 *   Reintentar no lo arreglaría y aceptar sería enviar correo sin verificar.
 * - 502: el proveedor de correo falló; el recibo NO quedó apuntado y se PIDE
 *   el reintento.
 * - 503: falta configuración (secreto o proveedor); el correo espera en el
 *   outbox del worker hasta que la haya, sin perderse.
 */
@Public()
@Controller('v1/outbox')
export class OutboxReceiverController {
  constructor(
    private readonly receiver: OutboxReceiverService,
    @Inject(EMAIL_SENDER)
    private readonly sender: EmailSender,
  ) {}

  // 200, no el 201 por defecto de Nest: aquí no se crea un recurso para el
  // llamante, se ACUSA RECIBO.
  @HttpCode(HttpStatus.OK)
  @Post('email')
  async receiveEmail(@Req() request: Request) {
    const rawBody = requireRawBody(request);
    const secret = this.requireSecret();
    if (!this.sender.descriptor().available) {
      // Sin proveedor no existe nada útil que hacer con la entrega. Se
      // rechaza sin intentar verificar: un 503 dice la verdad («aquí no hay
      // correo») sin insinuar que la firma estaba mal, y el worker conserva
      // la fila con reintentos en vez de perderla.
      throw new ServiceUnavailableException({
        code: 'email_sender_unavailable',
        message: 'No hay proveedor de correo configurado en este despliegue.',
      });
    }
    this.verify(request, rawBody, secret);
    const delivery = parseDelivery(() => parseEmailOutboxDelivery(rawBody));
    try {
      const result = await this.receiver.processEmail(delivery, rawBody);
      return { received: true, status: result.status, outcome: result.outcome };
    } catch (error) {
      if (error instanceof EmailSendError) {
        // El recibo se revirtió junto con la transacción: pedir el reintento
        // es seguro y es lo único honesto — el correo NO salió.
        throw new BadGatewayException({
          code: 'email_provider_failed',
          message:
            'El proveedor de correo no aceptó el envío; reintenta la entrega.',
        });
      }
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('domain')
  async receiveDomain(@Req() request: Request) {
    const rawBody = requireRawBody(request);
    const secret = this.requireSecret();
    this.verify(request, rawBody, secret);
    const delivery = parseDelivery(() => parseDomainOutboxDelivery(rawBody));
    const result = await this.receiver.processDomain(delivery, rawBody);
    return { received: true, status: result.status, outcome: result.outcome };
  }

  private verify(request: Request, rawBody: Buffer, secret: string): void {
    try {
      verifyOutboxSignature({ headers: request.headers, rawBody, secret });
    } catch {
      // Nunca se propaga el motivo exacto: distinguir «firma inválida» de
      // «timestamp viejo» ayudaría a quien esté probando firmas.
      throw new BadRequestException({
        code: 'invalid_signature',
        message: 'La firma del webhook no es válida.',
      });
    }
  }

  /**
   * El secreto es el MISMO OUTBOX_WEBHOOK_SECRET del emisor: receptores y
   * worker comparten despliegue (los dos receptores pueden apuntar a este
   * mismo servicio, .env.example lo dice desde antes de existir este módulo).
   * Se lee por petición y no en el constructor por la misma razón que el
   * transporte lo hace por entrega: rotar el secreto no debe exigir tocar
   * código ni esperar un reciclado de proceso completo.
   */
  private requireSecret(): string {
    const secret = process.env.OUTBOX_WEBHOOK_SECRET?.trim() ?? '';
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new ServiceUnavailableException({
        code: 'outbox_receiver_not_configured',
        message:
          'El receptor de outbox no tiene OUTBOX_WEBHOOK_SECRET configurado.',
      });
    }
    return secret;
  }
}

function requireRawBody(request: Request): Buffer {
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
  return rawBody;
}

function parseDelivery<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new BadRequestException({
      code: 'invalid_delivery',
      message: 'El cuerpo firmado no tiene la forma esperada.',
    });
  }
}
