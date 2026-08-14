import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DomainOutbox,
  EmailOutbox,
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
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';
import {
  PostgresCadEventPublisher,
  PostgresEmailService,
  PostgresEntitlementService,
  PostgresSubscriptionProvider,
  PostgresUsageMeter,
} from './adapters/postgres.adapters';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import { EmailOutboxController } from './controllers/email-outbox.controller';
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
    ]),
  ],
  controllers: [CommercialController, EmailOutboxController],
  providers: [
    { provide: ENTITLEMENT_SERVICE, useClass: PostgresEntitlementService },
    { provide: SUBSCRIPTION_PROVIDER, useClass: PostgresSubscriptionProvider },
    { provide: USAGE_METER, useClass: PostgresUsageMeter },
    { provide: CAD_EVENT_PUBLISHER, useClass: PostgresCadEventPublisher },
    { provide: EMAIL_SERVICE, useClass: PostgresEmailService },
    // Adaptador de pagos por defecto: NO hay pasarela. El cobro del piloto es
    // externo/asistido (upgrade-intents); la ola 2 sustituye este binding.
    { provide: PAYMENT_PROVIDER, useClass: NullPaymentProvider },
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
