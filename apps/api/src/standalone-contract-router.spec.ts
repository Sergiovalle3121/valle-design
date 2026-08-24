import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BillingWebhookService } from './modules/commercial/billing-webhook.service';
import { BillingController } from './modules/commercial/controllers/billing.controller';
import { BillingWebhookController } from './modules/commercial/controllers/billing-webhook.controller';
import { CommercialController } from './modules/commercial/controllers/commercial.controller';
import { PublicCatalogController } from './modules/commercial/controllers/public-catalog.controller';
import { TaxProfileController } from './modules/commercial/controllers/tax-profile.controller';
import { CfdiController } from './modules/commercial/controllers/cfdi.controller';
import {
  Invoice,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
  TaxProfile,
} from './modules/commercial/entities/commercial.entities';
import { CfdiReceipt } from './modules/commercial/entities/cfdi-receipt.entity';
import {
  CAD_EVENT_PUBLISHER,
  EMAIL_SERVICE,
} from './modules/commercial/ports/commercial.ports';
import { PAYMENT_PROVIDER } from './modules/commercial/ports/payment-provider.port';
import { CFDI_PROVIDER } from './modules/commercial/ports/cfdi-provider.port';
import { SubscriptionLifecycleService } from './modules/commercial/subscription-lifecycle.service';
import { SeatEntitlementService } from './modules/commercial/seat-entitlement.service';
import { User } from './modules/identity/entities/identity.entity';
import { IdentityController } from './modules/identity/identity.controller';
import { ApiRateLimitService } from './modules/identity/api-rate-limit.service';
import { IDENTITY_RATE_LIMIT_STORE } from './modules/identity/identity-rate-limit.store';
import { IdentityService } from './modules/identity/identity.service';
import {
  Invitation,
  Membership,
  Organization,
} from './modules/organizations/entities/organization.entity';
import { OrganizationAccessService } from './modules/organizations/organization-access.service';
import { OrganizationCommercialConfiguration } from './modules/organizations/organization-commercial.configuration';
import { OrganizationsController } from './modules/organizations/organizations.controller';
import { LegalAcceptance } from './modules/legal/entities/legal-acceptance.entity';
import { LegalController } from './modules/legal/legal.controller';

interface ExpressRouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
}

const STANDALONE_PREFIXES = [
  '/v1/auth/',
  '/v1/organizations',
  '/v1/commercial/',
  '/v1/legal/',
] as const;

describe('standalone OpenAPI contract against the real Nest router', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const repositoryEntities = [
      User,
      Organization,
      Membership,
      Invitation,
      Subscription,
      PlanCatalog,
      PlanEntitlement,
      PlanPrice,
      SubscriptionUpgradeIntent,
      Invoice,
      TaxProfile,
      CfdiReceipt,
      LegalAcceptance,
    ];
    const moduleRef = await Test.createTestingModule({
      controllers: [
        IdentityController,
        OrganizationsController,
        CommercialController,
        PublicCatalogController,
        BillingController,
        BillingWebhookController,
        TaxProfileController,
        CfdiController,
        LegalController,
      ],
      providers: [
        { provide: IdentityService, useValue: {} },
        { provide: OrganizationAccessService, useValue: {} },
        {
          provide: OrganizationCommercialConfiguration,
          useValue: { trialDays: 14 },
        },
        { provide: DataSource, useValue: {} },
        { provide: EMAIL_SERVICE, useValue: {} },
        { provide: CAD_EVENT_PUBLISHER, useValue: {} },
        { provide: PAYMENT_PROVIDER, useValue: {} },
        { provide: CFDI_PROVIDER, useValue: {} },
        { provide: SubscriptionLifecycleService, useValue: {} },
        { provide: SeatEntitlementService, useValue: {} },
        { provide: BillingWebhookService, useValue: {} },
        { provide: IDENTITY_RATE_LIMIT_STORE, useValue: {} },
        { provide: ApiRateLimitService, useValue: {} },
        ...repositoryEntities.map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('registers exactly the identity, organization and commercial operations', () => {
    const instance = app.getHttpAdapter().getInstance() as {
      router?: { stack?: ExpressRouteLayer[] };
      _router?: { stack?: ExpressRouteLayer[] };
    };
    const stack = instance.router?.stack ?? instance._router?.stack ?? [];
    const actual = new Set<string>();
    for (const layer of stack) {
      if (
        typeof layer.route?.path !== 'string' ||
        !isStandalonePath(layer.route.path)
      ) {
        continue;
      }
      for (const [method, enabled] of Object.entries(
        layer.route.methods ?? {},
      )) {
        if (enabled) actual.add(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }

    const spec = readFileSync(
      join(
        process.cwd(),
        '..',
        '..',
        'packages',
        'contracts',
        'specs',
        'design-api.v1.yaml',
      ),
      'utf8',
    ).replaceAll('\r\n', '\n');
    const expected = openApiOperations(spec);

    // 25 de la ola 1 + las 4 de la compra autoservicio (checkout, facturas,
    // baja y el webhook público de la pasarela) + el catálogo público que
    // alimenta la página de precios sin exigir sesión + las 4 de la ola
    // mexicana: los catálogos del SAT, leer y guardar los datos fiscales del
    // CFDI 4.0, y el portal del proveedor para arreglar el medio de pago
    // + las 2 del rastro fiscal (listado de CFDI y descarga de archivos)
    // + las 3 de /v1/legal (documentos, listar y registrar aceptación).
    expect(expected).toHaveLength(39);
    expect([...actual].sort()).toEqual(expected.sort());
  });
});

function isStandalonePath(path: string): boolean {
  return STANDALONE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function openApiOperations(source: string): string[] {
  const operations: string[] = [];
  let path: string | null = null;
  for (const line of source.split('\n')) {
    const pathMatch = line.match(/^ {2}(\/[^:]+):\s*$/);
    if (pathMatch) {
      path = isStandalonePath(pathMatch[1])
        ? pathMatch[1].replaceAll(/\{([^}]+)\}/g, ':$1')
        : null;
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (path && methodMatch) {
      operations.push(`${methodMatch[1].toUpperCase()} ${path}`);
    }
  }
  return operations;
}
