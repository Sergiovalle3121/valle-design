import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NullEmailSender } from './adapters/null-email.sender';
import { ResendEmailSender } from './adapters/resend-email.sender';
import {
  EMAIL_SENDER_CONFIGURATION,
  resolveEmailSenderConfiguration,
  type EmailSenderConfiguration,
} from './email-sender.config';
import { WebhookReceipt } from './entities/webhook-receipt.entity';
import { OutboxReceiverController } from './outbox-receiver.controller';
import { OutboxReceiverService } from './outbox-receiver.service';
import { EMAIL_SENDER, type EmailSender } from './ports/email-sender.port';

/**
 * Receptor del outbox propio (ADR-0008): el módulo que faltaba entre
 * «la API encola correo» y «alguien lo envía». El worker de outbox ya firmaba
 * y entregaba a OUTBOX_EMAIL_WEBHOOK_URL; este módulo es ese receptor,
 * viviendo en la MISMA API para que un solo despliegue cierre el circuito.
 *
 * Selección del proveedor de correo POR CONFIGURACIÓN, jamás a medias — el
 * mismo patrón rígido que Stripe y el PAC en commercial.module.ts:
 *
 * - Sin variables EMAIL_SENDER_* el adaptador es el NULO: el receptor
 *   responde 503 y el worker conserva cada correo en su outbox con
 *   reintentos. Nada se pierde; nada finge enviarse.
 * - Con la configuración COMPLETA (las cuatro variables) se enchufa Resend.
 * - Con una configuración incompleta el arranque FALLA
 *   (resolveEmailSenderConfiguration lanza), porque un despliegue que cree
 *   enviar correo pero manda enlaces rotos — o que tiene API key sin
 *   remitente válido — falla en el peor momento posible: cuando el primer
 *   usuario real intenta verificar su cuenta.
 *
 * Enchufar el proveedor real es, por tanto, configuración; no toca código.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WebhookReceipt])],
  controllers: [OutboxReceiverController],
  providers: [
    {
      provide: EMAIL_SENDER_CONFIGURATION,
      useFactory: (): EmailSenderConfiguration | null =>
        resolveEmailSenderConfiguration(process.env),
    },
    {
      provide: EMAIL_SENDER,
      useFactory: (
        configuration: EmailSenderConfiguration | null,
      ): EmailSender =>
        configuration
          ? new ResendEmailSender(configuration)
          : new NullEmailSender(),
      inject: [EMAIL_SENDER_CONFIGURATION],
    },
    {
      provide: OutboxReceiverService,
      useFactory: (
        database: DataSource,
        configuration: EmailSenderConfiguration | null,
        sender: EmailSender,
      ): OutboxReceiverService =>
        new OutboxReceiverService(
          database,
          sender,
          configuration?.linkBaseUrl ?? null,
        ),
      inject: [DataSource, EMAIL_SENDER_CONFIGURATION, EMAIL_SENDER],
    },
  ],
})
export class OutboxReceiverModule {}
