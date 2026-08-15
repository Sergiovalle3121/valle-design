import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DomainOutbox,
  EmailOutbox,
  Invoice,
  PaymentEvent,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
  UsageLedger,
} from './entities/commercial.entities';
import {
  CAD_EVENT_PUBLISHER,
  EMAIL_SERVICE,
  ENTITLEMENT_SERVICE,
  SUBSCRIPTION_PROVIDER,
  USAGE_METER,
} from './ports/commercial.ports';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './ports/payment-provider.port';
import {
  PostgresCadEventPublisher,
  PostgresEmailService,
  PostgresEntitlementService,
  PostgresSubscriptionProvider,
  PostgresUsageMeter,
} from './adapters/postgres.adapters';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import {
  globalStripeHttpClient,
  resolveStripeConfiguration,
  StripePaymentProvider,
} from './adapters/stripe-payment.provider';
import { BillingWebhookService } from './billing-webhook.service';
import { EmailOutboxController } from './controllers/email-outbox.controller';
import { BillingController } from './controllers/billing.controller';
import { BillingWebhookController } from './controllers/billing-webhook.controller';
import { CommercialController } from './controllers/commercial.controller';
import {
  COMMERCIAL_OUTBOX_OBSERVER,
  COMMERCIAL_OUTBOX_TRANSPORT,
  CommercialOutboxDispatcher,
} from './outbox-dispatcher.service';
import { CommercialOutboxWorker } from './outbox-worker.service';
import { WebhookCommercialOutboxTransport } from './webhook-outbox.transport';
import { CommercialCatalogBootstrap } from './commercial-catalog.bootstrap';
import { CommercialTelemetryService } from './commercial-telemetry.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanCatalog,
      PlanEntitlement,
      PlanPrice,
      Subscription,
      SubscriptionUpgradeIntent,
      UsageLedger,
      DomainOutbox,
      EmailOutbox,
      PaymentEvent,
      Invoice,
    ]),
  ],
  controllers: [
    CommercialController,
    BillingController,
    BillingWebhookController,
    EmailOutboxController,
  ],
  providers: [
    { provide: ENTITLEMENT_SERVICE, useClass: PostgresEntitlementService },
    { provide: SUBSCRIPTION_PROVIDER, useClass: PostgresSubscriptionProvider },
    { provide: USAGE_METER, useClass: PostgresUsageMeter },
    { provide: CAD_EVENT_PUBLISHER, useClass: PostgresCadEventPublisher },
    { provide: EMAIL_SERVICE, useClass: PostgresEmailService },
    // Selección del proveedor de pagos POR CONFIGURACIÓN, jamás a medias.
    //
    // Sin variables de Stripe el producto sigue exactamente como en la ola 1:
    // adaptador nulo, cobro externo/asistido vía upgrade-intents. Con la
    // configuración COMPLETA se enchufa el adaptador real. Y con una
    // configuración incompleta el arranque FALLA (resolveStripeConfiguration
    // lanza), porque un despliegue que puede cobrar pero no puede verificar el
    // webhook cobraría sin enterarse — el peor de los tres mundos y el único
    // que no se nota hasta que hay dinero de por medio.
    //
    // Enchufar claves reales es, por tanto, configuración; no toca código.
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (): PaymentProvider => {
        const configuration = resolveStripeConfiguration(process.env);
        return configuration
          ? new StripePaymentProvider(configuration, globalStripeHttpClient)
          : new NullPaymentProvider();
      },
    },
    WebhookCommercialOutboxTransport,
    {
      provide: COMMERCIAL_OUTBOX_TRANSPORT,
      useExisting: WebhookCommercialOutboxTransport,
    },
    CommercialTelemetryService,
    // El dispatcher inyecta el observer como Optional; sin este binding la
    // telemetría del runbook queda muda sin que ningún test lo note.
    {
      provide: COMMERCIAL_OUTBOX_OBSERVER,
      useExisting: CommercialTelemetryService,
    },
    SubscriptionLifecycleService,
    BillingWebhookService,
    CommercialOutboxDispatcher,
    CommercialOutboxWorker,
    CommercialCatalogBootstrap,
  ],
  exports: [
    ENTITLEMENT_SERVICE,
    SUBSCRIPTION_PROVIDER,
    USAGE_METER,
    CAD_EVENT_PUBLISHER,
    EMAIL_SERVICE,
    PAYMENT_PROVIDER,
    CommercialOutboxDispatcher,
    CommercialTelemetryService,
    SubscriptionLifecycleService,
  ],
})
export class CommercialModule {}
