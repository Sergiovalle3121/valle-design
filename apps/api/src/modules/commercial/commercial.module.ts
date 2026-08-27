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
  TaxProfile,
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
import { CFDI_PROVIDER, type CfdiProvider } from './ports/cfdi-provider.port';
import {
  PostgresCadEventPublisher,
  PostgresEmailService,
  PostgresEntitlementService,
  PostgresSubscriptionProvider,
  PostgresUsageMeter,
} from './adapters/postgres.adapters';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import {
  CfdiConfigurationError,
  NullCfdiProvider,
  resolveCfdiConfiguration,
} from './adapters/null-cfdi.provider';
import {
  FacturamaCfdiProvider,
  globalFacturamaHttpClient,
  resolveFacturamaConfiguration,
} from './adapters/facturama-cfdi.provider';
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
import { TaxProfileController } from './controllers/tax-profile.controller';
import { PublicCatalogController } from './controllers/public-catalog.controller';
import {
  COMMERCIAL_OUTBOX_OBSERVER,
  COMMERCIAL_OUTBOX_TRANSPORT,
  CommercialOutboxDispatcher,
} from './outbox-dispatcher.service';
import { CommercialOutboxWorker } from './outbox-worker.service';
import { CfdiIssuanceService } from './cfdi-issuance.service';
import { CfdiController } from './controllers/cfdi.controller';
import { CfdiReceipt } from './entities/cfdi-receipt.entity';
import { RenewalReminderService } from './renewal-reminder.service';
import { TrialExpiryReminderService } from './trial-expiry-reminder.service';
import { WebhookCommercialOutboxTransport } from './webhook-outbox.transport';
import { CommercialCatalogBootstrap } from './commercial-catalog.bootstrap';
import { CommercialTelemetryService } from './commercial-telemetry.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SeatEntitlementService } from './seat-entitlement.service';
import { OrganizationCommercialConfiguration } from '../organizations/organization-commercial.configuration';

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
      TaxProfile,
      CfdiReceipt,
    ]),
  ],
  controllers: [
    CommercialController,
    PublicCatalogController,
    BillingController,
    BillingWebhookController,
    TaxProfileController,
    CfdiController,
    EmailOutboxController,
  ],
  providers: [
    // El catálogo público publica `trialDays` leyéndolo de aquí: la duración
    // de la oferta la resuelve UNA clase, al arrancar, y falla el arranque si
    // el valor no es válido. Nadie la escribe a mano en una pantalla.
    OrganizationCommercialConfiguration,
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
    // Selección del PAC por CONFIGURACIÓN, con la misma regla rígida.
    //
    // Sin variables CFDI_PAC_* el adaptador es el NULO: el producto captura y
    // valida datos fiscales y el CFDI lo emite una persona (modo `manual`, y
    // la interfaz lo dice así). Con CFDI_PAC_NAME=facturama el adaptador real
    // se enchufa (y su propia resolución exige además el CP del emisor). Un
    // PAC DESCONOCIDO sigue reventando el arranque: arrancar en modo manual
    // con credenciales puestas haría creer que el producto ya timbra.
    {
      provide: CFDI_PROVIDER,
      useFactory: (): CfdiProvider => {
        const configuration = resolveCfdiConfiguration(process.env);
        if (!configuration) return new NullCfdiProvider();
        if (configuration.pacName.trim().toLowerCase() === 'facturama') {
          return new FacturamaCfdiProvider(
            resolveFacturamaConfiguration(configuration, process.env),
            globalFacturamaHttpClient,
          );
        }
        throw new CfdiConfigurationError(
          `Hay configuración para el PAC "${configuration.pacName}" pero el ` +
            'único adaptador implementado es "facturama". Usa ' +
            'CFDI_PAC_NAME=facturama, o vacía las variables CFDI_PAC_* para ' +
            'seguir con emisión manual.',
        );
      },
    },
    SeatEntitlementService,
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
    // Antes que el worker: el tick lo invoca tras cada lote (compuerta
    // horaria dentro del servicio). OXXO/SPEI no se renuevan solos; sin este
    // aviso el cliente de efectivo descubre el vencimiento cuando ya venció.
    RenewalReminderService,
    TrialExpiryReminderService,
    CfdiIssuanceService,
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
    CFDI_PROVIDER,
    SeatEntitlementService,
    CommercialOutboxDispatcher,
    CommercialTelemetryService,
    SubscriptionLifecycleService,
  ],
})
export class CommercialModule {}
