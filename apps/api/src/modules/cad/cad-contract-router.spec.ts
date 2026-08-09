import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CadBlocksService } from '../cad-documents/cad-blocks.service';
import { CadDocumentsService } from '../cad-documents/cad-documents.service';
import { CadIntentService } from '../cad-documents/cad-intent.service';
import { CadVisionService } from '../cad-documents/cad-vision.service';
import { CadController } from './cad.controller';
import { CadDocumentsRepository } from './cad-documents.repository';
import { CadReviewLinkController } from './cad-review-link.controller';
import { CadReviewController } from './cad-review.controller';
import { CadReviewRepository } from './cad-review.repository';
import { CadSheetSetController } from './cad-sheet-set.controller';
import { CadSheetSetsRepository } from './cad-sheet-sets.repository';

interface ExpressRouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
}

describe('contrato OpenAPI contra el router Nest real', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        CadController,
        CadReviewController,
        CadReviewLinkController,
        CadSheetSetController,
      ],
      providers: [
        CadDocumentsRepository,
        CadReviewRepository,
        CadSheetSetsRepository,
        CadDocumentsService,
        CadBlocksService,
        CadIntentService,
        CadVisionService,
      ].map((provide) => ({ provide, useValue: {} })),
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra exactamente las operaciones literales /v1/cad/* del spec', () => {
    const instance = app.getHttpAdapter().getInstance() as {
      router?: { stack?: ExpressRouteLayer[] };
      _router?: { stack?: ExpressRouteLayer[] };
    };
    const stack = instance.router?.stack ?? instance._router?.stack ?? [];
    const actual = new Set<string>();
    for (const layer of stack) {
      if (typeof layer.route?.path !== 'string') continue;
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

    expect(expected.size).toBeGreaterThan(0);
    expect([...actual].sort()).toEqual([...expected].sort());
    expect([...actual].every((entry) => entry.includes(' /v1/cad/'))).toBe(
      true,
    );
  });
});

function openApiOperations(source: string): Set<string> {
  const operations = new Set<string>();
  let path: string | null = null;
  for (const line of source.split('\n')) {
    const pathMatch = line.match(/^ {2}(\/[^:]+):\s*$/);
    if (pathMatch) {
      path = pathMatch[1].startsWith('/v1/cad/')
        ? pathMatch[1].replaceAll(/\{([^}]+)\}/g, ':$1')
        : null;
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (path && methodMatch) {
      operations.add(`${methodMatch[1].toUpperCase()} ${path}`);
    }
  }
  return operations;
}
