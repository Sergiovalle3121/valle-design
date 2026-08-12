import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
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
  PostgresCadEventPublisher,
  PostgresEmailService,
  PostgresEntitlementService,
  PostgresSubscriptionProvider,
  PostgresUsageMeter,
} from './adapters/postgres.adapters';
import { EmailOutboxController } from './controllers/email-outbox.controller';
import { CommercialController } from './controllers/commercial.controller';
import {
  COMMERCIAL_OUTBOX_TRANSPORT,
  CommercialOutboxDispatcher,
} from './outbox-dispatcher.service';
import { CommercialOutboxWorker } from './outbox-worker.service';
import { WebhookCommercialOutboxTransport } from './webhook-outbox.transport';
import { CommercialCatalogBootstrap } from './commercial-catalog.bootstrap';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanCatalog,
      PlanEntitlement,
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
    WebhookCommercialOutboxTransport,
    {
      provide: COMMERCIAL_OUTBOX_TRANSPORT,
      useExisting: WebhookCommercialOutboxTransport,
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
    CommercialOutboxDispatcher,
    SubscriptionLifecycleService,
  ],
})
export class CommercialModule {}
