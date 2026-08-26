import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  describePostgres,
  postgresTestUrl,
} from '../../common/testing/postgres-harness';
import { LegalAcceptances20260815140000 } from '../../migrations/20260815140000-LegalAcceptances';
import {
  currentLegalDocument,
  isKnownLegalVersion,
  LEGAL_DOCUMENTS,
} from './legal-documents';

/**
 * El registro de aceptación legal se prueba contra PostgreSQL REAL porque lo
 * que se afirma vive en el ESQUEMA, no en el código: los CHECK, el índice
 * único parcial y el default del servidor. Un mock del repositorio afirmaría
 * exactamente lo que se quiere demostrar.
 */
describePostgres('legal_acceptances (migración e invariantes)', () => {
  jest.setTimeout(60_000);

  const url = postgresTestUrl()!;
  const schema = `legal_${randomBytes(6).toString('hex')}`;
  let bootstrap: DataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    bootstrap = new DataSource({ type: 'postgres', url });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await bootstrap.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      url,
      schema,
      migrations: [LegalAcceptances20260815140000],
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
      logging: false,
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    const cleanup = new DataSource({ type: 'postgres', url });
    await cleanup.initialize();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.destroy();
  });

  const tenant = () => randomUUID();

  /**
   * `DataSource.query` está tipado como `Promise<any>`. Pasar por `unknown`
   * hace que la aserción sea REAL —y que ESLint no la borre por «innecesaria»,
   * que es lo que ocurre cuando se asierta directamente sobre `any`—.
   */
  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result: unknown = await dataSource.query(sql, params);
    return result as T[];
  }

  async function insert(row: {
    tenant: string;
    organization?: string;
    user: string;
    document?: string;
    version?: string;
  }): Promise<void> {
    await rows(
      `INSERT INTO "legal_acceptances"
         ("id", "tenant_id", "organization_id", "user_id", "document", "version")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        row.tenant,
        row.organization ?? row.tenant,
        row.user,
        row.document ?? 'terms',
        row.version ?? '2026-08-15',
      ],
    );
  }

  it('la migración crea la tabla con sus índices', async () => {
    const [table] = await rows<{ existe: string | null }>(
      `SELECT to_regclass('${schema}.legal_acceptances') AS existe`,
    );
    expect(table.existe).not.toBeNull();

    const indexes = await rows<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'legal_acceptances' ORDER BY 1`,
      [schema],
    );
    expect(indexes.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'idx_legal_acceptances_user',
        'uq_legal_acceptances_version',
      ]),
    );
  });

  it('registra una aceptación con el instante puesto por el SERVIDOR', async () => {
    const t = tenant();
    const user = randomUUID();
    const before = new Date();
    await insert({ tenant: t, user });

    const [row] = await rows<{
      accepted_at: string | Date;
      document: string;
      version: string;
    }>(
      `SELECT "accepted_at", "document", "version" FROM "legal_acceptances" WHERE "user_id" = $1`,
      [user],
    );

    expect(row.document).toBe('terms');
    expect(row.version).toBe('2026-08-15');
    // El default `now()` de la base: el cliente no puede fechar su propia
    // aceptación, que es lo único que la hace acreditable.
    expect(new Date(row.accepted_at).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 5_000,
    );
  });

  it('aceptar dos veces la MISMA versión viola el único: el registro es idempotente', async () => {
    const t = tenant();
    const user = randomUUID();
    await insert({ tenant: t, user });
    await expect(insert({ tenant: t, user })).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('el mismo usuario SÍ puede aceptar una versión nueva del mismo documento', async () => {
    const t = tenant();
    const user = randomUUID();
    await insert({ tenant: t, user, version: '2026-08-15' });
    await insert({ tenant: t, user, version: '2027-01-01' });

    const counted = await rows<{ total: number }>(
      `SELECT count(*)::int AS total FROM "legal_acceptances" WHERE "user_id" = $1`,
      [user],
    );
    expect(counted[0].total).toBe(2);
  });

  it('rechaza un documento que nadie publicó (CHECK, no validación de aplicación)', async () => {
    await expect(
      insert({ tenant: tenant(), user: randomUUID(), document: 'inventado' }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rechaza tenant_id distinto de organization_id (ADR-0005)', async () => {
    await expect(
      insert({
        tenant: tenant(),
        organization: randomUUID(),
        user: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('el down de la migración borra la tabla y se puede volver a aplicar', async () => {
    await dataSource.undoLastMigration();
    const [after] = await rows<{ existe: string | null }>(
      `SELECT to_regclass('${schema}.legal_acceptances') AS existe`,
    );
    expect(after.existe).toBeNull();

    await dataSource.runMigrations();
    const [again] = await rows<{ existe: string | null }>(
      `SELECT to_regclass('${schema}.legal_acceptances') AS existe`,
    );
    expect(again.existe).not.toBeNull();
  });
});

describe('registro versionado de documentos legales', () => {
  it('cada documento declara versión, fecha de publicación y URL', () => {
    expect(LEGAL_DOCUMENTS.length).toBeGreaterThan(0);
    for (const documento of LEGAL_DOCUMENTS) {
      expect(documento.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(documento.publicadoEn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(documento.url.startsWith('/')).toBe(true);
    }
  });

  it('no hay dos entradas para el mismo par documento+versión', () => {
    const keys = LEGAL_DOCUMENTS.map((d) => `${d.documento}@${d.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sólo los términos requieren aceptación explícita', () => {
    // El aviso de privacidad acredita ENTREGA, no consentimiento: marcarlo
    // como aceptable induciría a tratarlo como base jurídica.
    expect(currentLegalDocument('terms')?.requiereAceptacion).toBe(true);
    expect(currentLegalDocument('privacy')?.requiereAceptacion).toBe(false);
  });

  it('una versión desconocida no se reconoce como aceptable', () => {
    // La versión VIGENTE se lee del propio registro en vez de fijarse aquí:
    // publicar una versión nueva (regla del candado legal, COMMERCIAL-RC1) no
    // debe exigir tocar este spec. Una versión RETIRADA deja de reconocerse —
    // 2026-08-15 fue la inicial y ya no está en el registro, así que sirve de
    // caso real de versión conocida-en-su-día que hoy obliga a re-aceptar.
    const vigente = currentLegalDocument('terms')?.version;
    expect(vigente).toBeDefined();
    expect(isKnownLegalVersion('terms', vigente as string)).toBe(true);
    expect(isKnownLegalVersion('terms', '2026-08-15')).toBe(false);
    expect(isKnownLegalVersion('terms', '1999-01-01')).toBe(false);
    expect(isKnownLegalVersion('inventado', vigente as string)).toBe(false);
  });
});
