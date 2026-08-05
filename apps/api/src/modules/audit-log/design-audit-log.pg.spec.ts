import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type MigrationInterface } from 'typeorm';
import {
  describePostgres,
  postgresTestUrl,
} from '../../common/testing/postgres-harness';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { DesignAuditLog } from './design-audit-log.service';
import { DesignAuditLogEntry } from './entities/design-audit-log.entity';
import { AddCadBlocks20260706180000 } from '../../migrations/20260706180000-AddCadBlocks';
import { AddCanonicalCadDocument20260724010000 } from '../../migrations/20260724010000-AddCanonicalCadDocument';
import { ProfessionalCadBlockLibrary20260728110000 } from '../../migrations/20260728110000-ProfessionalCadBlockLibrary';
import { CreateCadDocumentsFoundation20260801090000 } from '../../migrations/20260801090000-CreateCadDocumentsFoundation';
import { CreateDesignBlobs20260801120000 } from '../../migrations/20260801120000-CreateDesignBlobs';
import { DesignFoundation20260801121000 } from '../../migrations/20260801121000-DesignFoundation';
import { MigrationLegacyImport20260802090000 } from '../../migrations/20260802090000-MigrationLegacyImport';
import { ReviewLinkOwnership20260802120000 } from '../../migrations/20260802120000-ReviewLinkOwnership';
import { PurgeReviewLinkTokens20260802140000 } from '../../migrations/20260802140000-PurgeReviewLinkTokens';
import { FirstPartyIdentity20260802160000 } from '../../migrations/20260802160000-FirstPartyIdentity';
import { CommercialFoundation20260802170000 } from '../../migrations/20260802170000-CommercialFoundation';
import { NormalizeCadIdentifiers20260802180000 } from '../../migrations/20260802180000-NormalizeCadIdentifiers';
import { DesignAuditLogIdentity20260805120000 } from '../../migrations/20260805120000-DesignAuditLogIdentity';

/**
 * Fase 3 — la bitácora de auditoría CAD escribe de verdad sobre el esquema
 * MIGRADO.
 *
 * La entidad declaraba `@PrimaryGeneratedColumn('uuid')`, que en PostgreSQL
 * significa «la BASE genera el id»: TypeORM emite `DEFAULT` en el INSERT. Pero
 * la migración aplicada creó la columna como `varchar(36) PRIMARY KEY NOT NULL`
 * SIN default — la única tabla del repositorio así. Resultado en producción:
 *
 *   null value in column "id" of relation "design_audit_log"
 *     violates not-null constraint
 *
 * y el adaptador lo tragaba como un `warn`, de modo que la aplicación seguía y
 * la auditoría CAD no registraba absolutamente nada.
 *
 * Por qué CI no lo veía: TODAS las pruebas pg que tocaban esta tabla corrían
 * con `synchronize: true`, es decir contra el esquema DERIVADO de la entidad
 * (uuid + default), no contra el DDL de las migraciones. La suite estaba verde
 * midiendo un esquema que producción nunca tiene.
 *
 * Esta prueba corre la CADENA REAL de migraciones con `synchronize: false`.
 */

const PREVIOUS_MIGRATIONS: Array<new () => MigrationInterface> = [
  AddCadBlocks20260706180000,
  AddCanonicalCadDocument20260724010000,
  ProfessionalCadBlockLibrary20260728110000,
  CreateCadDocumentsFoundation20260801090000,
  CreateDesignBlobs20260801120000,
  DesignFoundation20260801121000,
  MigrationLegacyImport20260802090000,
  ReviewLinkOwnership20260802120000,
  PurgeReviewLinkTokens20260802140000,
  FirstPartyIdentity20260802160000,
  CommercialFoundation20260802170000,
  NormalizeCadIdentifiers20260802180000,
];

const ALL_MIGRATIONS: Array<new () => MigrationInterface> = [
  ...PREVIOUS_MIGRATIONS,
  DesignAuditLogIdentity20260805120000,
];

describePostgres(
  'design_audit_log sobre el esquema migrado (PostgreSQL)',
  () => {
    jest.setTimeout(120_000);

    const url = postgresTestUrl()!;
    const schema = `design_audit_${randomBytes(6).toString('hex')}`;
    let bootstrap: DataSource;
    let dataSource: DataSource;

    const source = (migrations: Array<new () => MigrationInterface>) =>
      new DataSource({
        type: 'postgres',
        url,
        schema,
        entities: [DesignAuditLogEntry],
        migrations,
        migrationsTableName: 'typeorm_migrations',
        migrationsTransactionMode: 'each',
        // El punto entero de esta prueba: NADA de `synchronize`. El esquema sale
        // de las migraciones, como en producción.
        synchronize: false,
        logging: false,
        extra: { options: `-c search_path=${schema}` },
      });

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

    const columnShape = async (): Promise<
      Array<{
        data_type: string;
        column_default: string | null;
        is_nullable: string;
      }>
    > =>
      dataSource.query(
        `SELECT "data_type", "column_default", "is_nullable"
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'design_audit_log'
            AND column_name = 'id'`,
        [schema],
      );

    const serviceFor = (tenantId: string | null) => {
      const tenant = new TenantContextService();
      tenant.getTenantId = () => tenantId;
      return new DesignAuditLog(
        createTenantScopedRepository(
          DesignAuditLogEntry,
          dataSource.manager,
          tenant,
          { strict: false },
        ),
        tenant,
      );
    };

    it('migra desde el esquema anterior, conserva las filas y deja la columna con identidad propia', async () => {
      dataSource = source(PREVIOUS_MIGRATIONS);
      await dataSource.initialize();
      await dataSource.runMigrations();

      // Estado ANTERIOR: varchar(36) sin default. Es lo que rompía el INSERT.
      const [before] = await columnShape();
      expect(before.data_type).toBe('character varying');
      expect(before.column_default).toBeNull();

      // Una fila histórica con un id que NO es un UUID: el migrador no puede
      // tirarla ni inventarle otro valor.
      const legacyId = 'legacy-audit-entry-0001';
      const tenantId = randomUUID();
      await dataSource.query(
        `INSERT INTO "design_audit_log"
         ("id", "tenant_id", "actor", "action", "reference_type", "reference_id")
       VALUES ($1, $2, $3, 'cad_document_saved', 'CAD_DOCUMENT', $4)`,
        [legacyId, tenantId, 'antiguo@test.invalid', randomUUID()],
      );
      await dataSource.destroy();

      dataSource = source(ALL_MIGRATIONS);
      await dataSource.initialize();
      expect(await dataSource.runMigrations()).toHaveLength(1);

      // Estado NUEVO: la columna genera su propio id.
      const [upgraded] = await columnShape();
      expect(upgraded.column_default ?? '').toContain('gen_random_uuid');
      expect(upgraded.is_nullable).toBe('NO');

      // La fila histórica sigue ahí, con su id textual intacto.
      const preserved: Array<{ id: string; actor: string }> =
        await dataSource.query(
          `SELECT "id", "actor" FROM "design_audit_log" WHERE "id" = $1`,
          [legacyId],
        );
      expect(preserved).toHaveLength(1);
      expect(preserved[0].actor).toBe('antiguo@test.invalid');
    });

    it('`record()` escribe de verdad: genera el id, deriva el tenant del contexto y `recent()` lo recupera', async () => {
      const tenantId = randomUUID();
      const audit = serviceFor(tenantId);
      const referenceId = randomUUID();

      // ESTA es la llamada que en producción lanzaba 23502 y se tragaba el
      // adaptador. Si vuelve a fallar, esta prueba falla: ya no hay `catch`.
      const entry = await audit.record({
        action: 'cad_document_saved',
        referenceType: 'CAD_DOCUMENT',
        referenceId,
        actor: 'nuevo@test.invalid',
        payload: { metadata: { entityCount: 1 } },
      });

      expect(entry.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(entry.tenantId).toBe(tenantId);
      expect(entry.createdAt).toBeInstanceOf(Date);

      const recent = await audit.recent(10);
      expect(recent.some((row) => row.id === entry.id)).toBe(true);
    });

    it('aísla por organización: `recent()` de un tenant no ve los asientos de otro', async () => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      await serviceFor(tenantA).record({
        action: 'cad_document_created',
        referenceType: 'CAD_DOCUMENT',
        referenceId: randomUUID(),
        actor: 'a@test.invalid',
      });
      await serviceFor(tenantB).record({
        action: 'cad_document_created',
        referenceType: 'CAD_DOCUMENT',
        referenceId: randomUUID(),
        actor: 'b@test.invalid',
      });

      const seenByA = await serviceFor(tenantA).recent(50);
      expect(seenByA.length).toBeGreaterThan(0);
      expect(seenByA.every((row) => row.tenantId === tenantA)).toBe(true);
      expect(seenByA.some((row) => row.actor === 'b@test.invalid')).toBe(false);
    });

    it('varias escrituras seguidas no colisionan de id', async () => {
      const audit = serviceFor(randomUUID());
      const written = await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          audit.record({
            action: 'cad_document_saved',
            referenceType: 'CAD_DOCUMENT',
            referenceId: randomUUID(),
            actor: `lote-${index}@test.invalid`,
          }),
        ),
      );
      expect(new Set(written.map((row) => row.id)).size).toBe(25);
    });

    it('el upgrade es repetible: volver a correr la migración no rompe nada', async () => {
      // `runMigrations` ya no tiene nada pendiente, y el DDL sigue siendo el
      // esperado. Una migración que sólo funciona la primera vez no es
      // desplegable.
      expect(await dataSource.runMigrations()).toHaveLength(0);
      const [stable] = await columnShape();
      expect(stable.column_default ?? '').toContain('gen_random_uuid');
    });
  },
);
