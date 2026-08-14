import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CommercialController } from './modules/commercial/controllers/commercial.controller';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
  SubscriptionUpgradeIntent,
} from './modules/commercial/entities/commercial.entities';
import {
  CAD_EVENT_PUBLISHER,
  EMAIL_SERVICE,
} from './modules/commercial/ports/commercial.ports';
import { SubscriptionLifecycleService } from './modules/commercial/subscription-lifecycle.service';
import { User } from './modules/identity/entities/identity.entity';
import { IdentityController } from './modules/identity/identity.controller';
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
      SubscriptionUpgradeIntent,
    ];
    const moduleRef = await Test.createTestingModule({
      controllers: [
        IdentityController,
        OrganizationsController,
        CommercialController,
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
        { provide: SubscriptionLifecycleService, useValue: {} },
        { provide: IDENTITY_RATE_LIMIT_STORE, useValue: {} },
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

    expect(expected).toHaveLength(24);
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
