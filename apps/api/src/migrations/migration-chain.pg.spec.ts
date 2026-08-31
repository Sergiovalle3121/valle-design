import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { DataSource, type MigrationInterface } from 'typeorm';
import {
  describePostgres,
  postgresTestUrl,
} from '../common/testing/postgres-harness';
import { AddCadBlocks20260706180000 } from './20260706180000-AddCadBlocks';
import { AddCanonicalCadDocument20260724010000 } from './20260724010000-AddCanonicalCadDocument';
import { ProfessionalCadBlockLibrary20260728110000 } from './20260728110000-ProfessionalCadBlockLibrary';
import { CreateCadDocumentsFoundation20260801090000 } from './20260801090000-CreateCadDocumentsFoundation';
import { CreateDesignBlobs20260801120000 } from './20260801120000-CreateDesignBlobs';
import { DesignFoundation20260801121000 } from './20260801121000-DesignFoundation';
import { MigrationLegacyImport20260802090000 } from './20260802090000-MigrationLegacyImport';
import { ReviewLinkOwnership20260802120000 } from './20260802120000-ReviewLinkOwnership';
import { PurgeReviewLinkTokens20260802140000 } from './20260802140000-PurgeReviewLinkTokens';
import { FirstPartyIdentity20260802160000 } from './20260802160000-FirstPartyIdentity';
import { CommercialFoundation20260802170000 } from './20260802170000-CommercialFoundation';
import { NormalizeCadIdentifiers20260802180000 } from './20260802180000-NormalizeCadIdentifiers';
import { DesignAuditLogIdentity20260805120000 } from './20260805120000-DesignAuditLogIdentity';
import { CreateCadSheetSets20260809100000 } from './20260809100000-CreateCadSheetSets';
import { CommercialSellableCatalog20260812100000 } from './20260812100000-CommercialSellableCatalog';
import { SubscriptionUpgradeIntents20260812110000 } from './20260812110000-SubscriptionUpgradeIntents';
import { PlanPrices20260814100000 } from './20260814100000-PlanPrices';
import { StripeBilling20260815100000 } from './20260815100000-StripeBilling';
import { LegalAcceptances20260815140000 } from './20260815140000-LegalAcceptances';
import { MexicanPublicCatalog20260816120000 } from './20260816120000-MexicanPublicCatalog';
import { ArchitecturalBlockLibrarySeed20260817090000 } from './20260817090000-ArchitecturalBlockLibrarySeed';
import { MexicanFiscalAndSeats20260817100000 } from './20260817100000-MexicanFiscalAndSeats';
import { WebhookReceipts20260820100000 } from './20260820100000-WebhookReceipts';
import { TenantIntegrityRls20260820120000 } from './20260820120000-TenantIntegrityRls';
import { CfdiReceipts20260820140000 } from './20260820140000-CfdiReceipts';
import { TenantRuntimeRoleAndDesignBlobsRls20260823120000 } from './20260823120000-TenantRuntimeRoleAndDesignBlobsRls';
import { IdentityMfaAndLoginActivity20260828120000 } from './20260828120000-IdentityMfaAndLoginActivity';
import { ProductFeedback20260828140000 } from './20260828140000-ProductFeedback';
import { TeamMessaging20260831090000 } from './20260831090000-TeamMessaging';
import { CadPresenceBeats20260831092000 } from './20260831092000-CadPresenceBeats';
import { CadPresenceBeatsRls20260831093000 } from './20260831093000-CadPresenceBeatsRls';

const LEGACY_MIGRATIONS: Array<new () => MigrationInterface> = [
  AddCadBlocks20260706180000,
  AddCanonicalCadDocument20260724010000,
  ProfessionalCadBlockLibrary20260728110000,
  CreateCadDocumentsFoundation20260801090000,
  CreateDesignBlobs20260801120000,
  DesignFoundation20260801121000,
  MigrationLegacyImport20260802090000,
  ReviewLinkOwnership20260802120000,
  PurgeReviewLinkTokens20260802140000,
];

const ALL_MIGRATIONS: Array<new () => MigrationInterface> = [
  ...LEGACY_MIGRATIONS,
  FirstPartyIdentity20260802160000,
  CommercialFoundation20260802170000,
  NormalizeCadIdentifiers20260802180000,
  DesignAuditLogIdentity20260805120000,
  CreateCadSheetSets20260809100000,
  CommercialSellableCatalog20260812100000,
  SubscriptionUpgradeIntents20260812110000,
  PlanPrices20260814100000,
  StripeBilling20260815100000,
  // Faltaba en la cadena aunque lleva aplicada desde la ola 6: una migración
  // ausente de esta lista nunca se ejecuta aquí, así que su up/down y sus
  // interacciones con las vecinas quedaban sin probar en el encadenado.
  LegalAcceptances20260815140000,
  MexicanPublicCatalog20260816120000,
  ArchitecturalBlockLibrarySeed20260817090000,
  MexicanFiscalAndSeats20260817100000,
  WebhookReceipts20260820100000,
  TenantIntegrityRls20260820120000,
  CfdiReceipts20260820140000,
  TenantRuntimeRoleAndDesignBlobsRls20260823120000,
  IdentityMfaAndLoginActivity20260828120000,
  ProductFeedback20260828140000,
  TeamMessaging20260831090000,
  CadPresenceBeats20260831092000,
  CadPresenceBeatsRls20260831093000,
];

/**
 * La lista de arriba se mantiene con imports explícitos porque TypeORM
 * necesita las CLASES, pero su contenido ya no se fía de la memoria de nadie:
 * este bloque deriva del DIRECTORIO la lista esperada y falla si ambas
 * difieren. `LegalAcceptances` faltó de la cadena una temporada entera y nadie
 * lo vio — una migración ausente de la lista simplemente nunca se prueba, que
 * es el modo de fallo más silencioso posible.
 *
 * Corre SIN PostgreSQL (es puro filesystem), así que vigila también en
 * `npm test`, no sólo en `test:pg`.
 */
describe('la cadena de migraciones es exactamente el directorio', () => {
  it('cada archivo de migración está en ALL_MIGRATIONS, en orden y sin extras', () => {
    const files = readdirSync(__dirname)
      .filter((file) => /^\d{14}-.+\.ts$/u.test(file))
      .filter((file) => !file.endsWith('.spec.ts'))
      .sort();
    const expected = files.map((file) => {
      const match = /^(\d{14})-(.+)\.ts$/u.exec(file)!;
      return `${match[2]}${match[1]}`;
    });
    expect(ALL_MIGRATIONS.map((migration) => migration.name)).toEqual(expected);
  });
});

describePostgres('migration chain (previous main -> latest)', () => {
  jest.setTimeout(120_000);

  const url = postgresTestUrl()!;
  const schema = `migration_chain_${randomBytes(6).toString('hex')}`;

  /**
   * Esta suite construye su PROPIO DataSource —necesita controlar qué
   * migraciones corren— y por eso se saltaba la señal que `createPostgresHarness`
   * pone para todas las demás. Sin ella, invocar `npx jest` a mano con sólo
   * `TEST_DATABASE_URL` deja las entidades mapeadas al dialecto de SQLite y la
   * cadena muere en la tercera migración con
   *
   *     QueryFailedError: syntax error at or near "-"
   *
   * que no menciona ninguna variable de entorno y cuesta media hora. La misma
   * comprobación del arnés, aquí.
   */
  beforeAll(() => {
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      throw new Error(
        'La cadena de migraciones necesita DATABASE_URL (o DB_HOST) definido ANTES ' +
          'de cargar las entidades: de él dependen los tipos de columna ' +
          '(timestamp/jsonb). Ejecútala con `npm run test:pg`.',
      );
    }
  });
  let bootstrap: DataSource;
  let dataSource: DataSource;

  function source(migrations: Array<new () => MigrationInterface>): DataSource {
    return new DataSource({
      type: 'postgres',
      url,
      schema,
      migrations,
      migrationsTableName: 'typeorm_migrations',
      migrationsTransactionMode: 'each',
      synchronize: false,
      logging: false,
      extra: { options: `-c search_path=${schema}` },
    });
  }

  beforeAll(async () => {
    bootstrap = new DataSource({ type: 'postgres', url });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap?.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  });

  it('preserves CAD data, supports new up/down/up and enforces new foreign keys', async () => {
    const projectId = randomUUID();
    const documentId = randomUUID();
    const tenantId = randomUUID();

    dataSource = source(LEGACY_MIGRATIONS);
    await dataSource.initialize();
    expect(await dataSource.runMigrations()).toHaveLength(
      LEGACY_MIGRATIONS.length,
    );

    await dataSource.query(
      `INSERT INTO "cad_projects"
         ("id", "tenant_id", "name", "description", "status", "legacy_source_id")
       VALUES ($1, $2, $3, $4, 'active', $5)`,
      [
        projectId,
        tenantId,
        'Proyecto anterior',
        'Debe sobrevivir',
        'old-project',
      ],
    );
    await dataSource.query(
      `INSERT INTO "cad_documents"
         ("id", "tenant_id", "project_id", "name", "cad_document",
          "cad_document_version", "legacy_source_id")
       VALUES ($1, $2, $3, $4, $5::jsonb, 7, $6)`,
      [
        documentId,
        tenantId,
        projectId,
        'Plano anterior',
        JSON.stringify({
          meta: { schema: 3, version: 1, unit: 'mm' },
          entities: [{ id: 'line-before-upgrade', type: 'line' }],
        }),
        'old-document',
      ],
    );
    await dataSource.destroy();

    dataSource = source(ALL_MIGRATIONS);
    await dataSource.initialize();
    // El número sale de la LISTA, no de una constante escrita a mano: cada
    // migración nueva rompía esta línea con un «esperaba 4, llegaron 5» que no
    // dice nada del cambio que la causó.
    expect(await dataSource.runMigrations()).toHaveLength(
      ALL_MIGRATIONS.length - LEGACY_MIGRATIONS.length,
    );

    expect(
      await dataSource.query(
        `SELECT "data_type", "column_default"
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'cad_documents'
            AND column_name = 'id'`,
        [schema],
      ),
    ).toEqual([
      expect.objectContaining({
        data_type: 'uuid',
        column_default: expect.stringContaining('gen_random_uuid'),
      }),
    ]);
    expect(
      await dataSource.query(
        `SELECT "data_type"
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'cad_documents'
            AND column_name IN ('project_id', 'tenant_id')
          ORDER BY column_name`,
        [schema],
      ),
    ).toEqual([{ data_type: 'uuid' }, { data_type: 'character varying' }]);

    const preserved = await dataSource.query(
      `SELECT "name", "cad_document_version", "cad_document"
         FROM "cad_documents" WHERE "id" = $1`,
      [documentId],
    );
    expect(preserved).toEqual([
      expect.objectContaining({
        name: 'Plano anterior',
        cad_document_version: 7,
        cad_document: expect.objectContaining({
          entities: [{ id: 'line-before-upgrade', type: 'line' }],
        }),
      }),
    ]);

    // Se deshace la ventana NUEVA COMPLETA: la prueba mide up/down/up de todo
    // lo que esta rama añade sobre el main anterior. El número sale de las
    // LISTAS, no de un literal: cada migración nueva rompía esta línea con un
    // «esperaba 5, llegaron 6» que no decía nada del cambio que lo causó.
    const newMigrations = ALL_MIGRATIONS.length - LEGACY_MIGRATIONS.length;
    for (let undone = 0; undone < newMigrations; undone += 1) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }
    expect(
      await dataSource.query(
        `SELECT "name" FROM "cad_documents" WHERE "id" = $1`,
        [documentId],
      ),
    ).toEqual([{ name: 'Plano anterior' }]);

    expect(await dataSource.runMigrations()).toHaveLength(newMigrations);
    expect(
      await dataSource.query(
        `SELECT "entitlement_code" FROM "plan_entitlements"
          WHERE "plan_code" = 'standalone-trial'`,
      ),
    ).toEqual([{ entitlement_code: 'design.cad' }]);
    // El catálogo vendible sobrevive su propio down/up y la reconciliación es
    // idempotente sobre un catálogo ya sembrado (la cadena corrió dos veces).
    expect(
      await dataSource.query(
        `SELECT "plan"."active", "entitlement"."entitlement_code"
           FROM "plan_catalog" AS "plan"
           JOIN "plan_entitlements" AS "entitlement"
             ON "entitlement"."plan_code" = "plan"."code"
          WHERE "plan"."code" = 'standalone-full'`,
      ),
    ).toEqual([{ active: true, entitlement_code: 'design.cad' }]);

    await expect(
      dataSource.query(
        `INSERT INTO "identity_one_time_tokens"
           ("subjectId", "purpose", "tokenHash", "expiresAt")
         VALUES ($1, 'verify_email', $2, now() + interval '1 hour')`,
        [randomUUID(), 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      dataSource.query(
        `INSERT INTO "subscriptions"
           ("organization_id", "tenant_id", "plan_code", "status")
         VALUES ($1, $1, 'standalone-trial', 'active')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    // plan_prices existe tras su down/up y su FK apunta al catálogo sembrado:
    // un precio del plan vendible entra, uno de un plan fantasma no.
    await expect(
      dataSource.query(
        `INSERT INTO "plan_prices" ("plan_code", "currency", "period", "amount_cents")
         VALUES ('standalone-full', 'USD', 'monthly', 2900)`,
      ),
    ).resolves.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO "plan_prices" ("plan_code", "currency", "period", "amount_cents")
         VALUES ('plan-fantasma', 'USD', 'monthly', 2900)`,
      ),
    ).rejects.toMatchObject({ code: '23503' });

    // La facturación de la ola 2 sobrevive su propio down/up: la barrera de
    // idempotencia sigue siendo única y las facturas siguen siendo hijas de
    // una organización real.
    await expect(
      dataSource.query(
        `INSERT INTO "payment_events"
           ("provider", "event_id", "type", "payload_hash", "outcome")
         VALUES ('stripe', 'evt_chain', 'invoice.paid', $1, 'subscription_renewed')`,
        ['b'.repeat(64)],
      ),
    ).resolves.toBeDefined();
    await expect(
      dataSource.query(
        `INSERT INTO "payment_events"
           ("provider", "event_id", "type", "payload_hash", "outcome")
         VALUES ('stripe', 'evt_chain', 'invoice.paid', $1, 'subscription_renewed')`,
        ['b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      dataSource.query(
        `INSERT INTO "invoices"
           ("organization_id", "tenant_id", "provider", "provider_invoice_id",
            "amount_cents", "currency", "status")
         VALUES ($1, $1, 'stripe', 'in_chain', 2900, 'USD', 'paid')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    // Y `subscriptions` conserva el vocabulario del ciclo cobrado.
    expect(
      await dataSource.query(
        `SELECT "column_name"
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'subscriptions'
            AND column_name IN ('cancel_at_period_end', 'current_period_end',
                                'provider_customer_id', 'provider_subscription_id')
          ORDER BY column_name`,
        [schema],
      ),
    ).toEqual([
      { column_name: 'cancel_at_period_end' },
      { column_name: 'current_period_end' },
      { column_name: 'provider_customer_id' },
      { column_name: 'provider_subscription_id' },
    ]);
  });
});
