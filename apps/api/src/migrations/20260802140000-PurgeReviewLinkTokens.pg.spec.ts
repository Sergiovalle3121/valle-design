import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  allApplicationEntities,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { CadDocument } from '../modules/cad-documents/entities/cad-document.entity';
import { CadDocumentVersion } from '../modules/cad-documents/entities/cad-document-version.entity';
import { PurgeReviewLinkTokens20260802140000 } from './20260802140000-PurgeReviewLinkTokens';

/**
 * PURGA REAL sobre PostgreSQL: la migración se ejecuta contra datos SEMBRADOS
 * que contienen tokens de review link en claro dentro del JSON del documento —
 * el esquema heredado que esta rama elimina.
 *
 * Se hace contra PostgreSQL de verdad y no con un `QueryRunner` de mentira
 * porque lo que hay que demostrar es la SEMÁNTICA JSONB (jsonb_set sobre un
 * arreglo, preservación del orden, `-` de clave, guardas `jsonb_typeof`), no
 * que se emitieron unas cadenas SQL. Un runner capturador afirmaría el texto,
 * no el borrado.
 */
describePostgres('PurgeReviewLinkTokens (purga JSONB real)', () => {
  jest.setTimeout(120_000);

  let harness: PostgresHarness;

  const SECRET_A = 'vdrl_token_en_claro_del_navegador_A';
  const SECRET_B = 'vdrl_token_en_claro_del_navegador_B';

  const legacyDocument = (token: string, extraLink = false) => ({
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [{ id: 'line-1', type: 'line' }],
    collaboration: {
      versions: [],
      threads: [],
      audit: [],
      reviewLinks: [
        {
          id: 'link-1',
          token,
          label: 'Cliente',
          readOnly: true,
          createdAt: '2026-07-28T20:04:00.000Z',
          createdBy: 'ana',
          expiresAt: '2026-08-04T20:04:00.000Z',
        },
        ...(extraLink
          ? [{ id: 'link-2', token: `${token}-2`, label: 'QA', readOnly: true }]
          : []),
      ],
    },
  });

  /** Documento SIN token (flujo server-owned nuevo): no debe tocarse. */
  const cleanDocument = () => ({
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [{ id: 'line-1', type: 'line' }],
    collaboration: {
      versions: [],
      threads: [],
      audit: [],
      reviewLinks: [{ id: 'link-9', label: 'Server owned', readOnly: true }],
    },
  });

  /** Puntero a blob: el JSON real vive comprimido fuera de SQL. */
  const blobPointer = () => ({
    _storage: {
      kind: 'document_blob',
      blobKey: 'cad/abc123',
      sha256: 'f'.repeat(64),
      bytes: 2_000_000,
    },
  });

  const countTokens = async (table: string): Promise<number> => {
    const rows = await harness.dataSource.query(`
      SELECT count(*)::int AS total
      FROM "${harness.schema}"."${table}" AS t
      WHERE jsonb_typeof(t."cad_document") = 'object'
        AND jsonb_typeof(t."cad_document"->'collaboration'->'reviewLinks') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
                 t."cad_document"->'collaboration'->'reviewLinks'
               ) AS link
          WHERE jsonb_typeof(link) = 'object' AND link ? 'token'
        )
    `);
    return Number(rows[0]?.total ?? 0);
  };

  /** Rastreo BRUTO del secreto: si aparece en el texto de la tabla, sigue ahí. */
  const rawContains = async (
    table: string,
    needle: string,
  ): Promise<number> => {
    const rows = await harness.dataSource.query(
      `SELECT count(*)::int AS total
       FROM "${harness.schema}"."${table}" AS t
       WHERE t."cad_document"::text LIKE '%' || $1 || '%'`,
      [needle],
    );
    return Number(rows[0]?.total ?? 0);
  };

  beforeAll(async () => {
    harness = await createPostgresHarness(allApplicationEntities(), {
      schemaPrefix: 'purge_review_tokens',
    });
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('borra token de reviewLinks en cad_documents y cad_document_versions, es idempotente y respeta lo demás', async () => {
    const documents = harness.dataSource.getRepository(CadDocument);
    const versions = harness.dataSource.getRepository(CadDocumentVersion);

    const withTokens = await documents.save(
      documents.create({
        tenant_id: 'tenant-a',
        name: 'Plano heredado',
        cadDocument: legacyDocument(SECRET_A, true),
        cadDocumentVersion: 2,
      }),
    );
    const clean = await documents.save(
      documents.create({
        tenant_id: 'tenant-a',
        name: 'Plano server-owned',
        cadDocument: cleanDocument(),
        cadDocumentVersion: 1,
      }),
    );
    const blob = await documents.save(
      documents.create({
        tenant_id: 'tenant-a',
        name: 'Plano grande en blob',
        cadDocument: blobPointer(),
        cadDocumentVersion: 3,
      }),
    );
    const empty = await documents.save(
      documents.create({
        tenant_id: 'tenant-a',
        name: 'Plano sin contenido',
        cadDocument: null,
        cadDocumentVersion: 0,
      }),
    );
    await versions.save(
      versions.create({
        tenant_id: 'tenant-a',
        documentId: withTokens.id,
        version: 1,
        cadDocument: legacyDocument(SECRET_B),
        sha256: null,
        label: null,
        legacySourceId: null,
      }),
    );
    await versions.save(
      versions.create({
        tenant_id: 'tenant-a',
        documentId: withTokens.id,
        version: 2,
        cadDocument: cleanDocument(),
        sha256: null,
        label: null,
        legacySourceId: null,
      }),
    );

    // ── CONTEO ANTES ────────────────────────────────────────────────────────
    expect(await countTokens('cad_documents')).toBe(1);
    expect(await countTokens('cad_document_versions')).toBe(1);
    expect(await rawContains('cad_documents', SECRET_A)).toBe(1);
    expect(await rawContains('cad_document_versions', SECRET_B)).toBe(1);

    const migration = new PurgeReviewLinkTokens20260802140000();
    const runner = harness.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await migration.up(runner);
    } finally {
      await runner.release();
    }

    // ── CONTEO DESPUÉS ──────────────────────────────────────────────────────
    expect(await countTokens('cad_documents')).toBe(0);
    expect(await countTokens('cad_document_versions')).toBe(0);
    expect(await rawContains('cad_documents', SECRET_A)).toBe(0);
    expect(await rawContains('cad_documents', `${SECRET_A}-2`)).toBe(0);
    expect(await rawContains('cad_document_versions', SECRET_B)).toBe(0);

    // El resto del enlace sobrevive intacto, con el metadato no sensible.
    const purged = await documents.findOneByOrFail({ id: withTokens.id });
    const links = (
      purged.cadDocument!.collaboration as {
        reviewLinks: Record<string, unknown>[];
      }
    ).reviewLinks;
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      id: 'link-1',
      label: 'Cliente',
      readOnly: true,
      createdAt: '2026-07-28T20:04:00.000Z',
      createdBy: 'ana',
      expiresAt: '2026-08-04T20:04:00.000Z',
      hasToken: true,
    });
    // Orden preservado (jsonb_agg ... ORDER BY ord).
    expect(links[1]).toMatchObject({ id: 'link-2', hasToken: true });
    // Lo NO relacionado no se toca.
    expect(purged.cadDocumentVersion).toBe(2);
    expect(purged.cadDocument!.entities).toEqual([
      { id: 'line-1', type: 'line' },
    ]);

    const untouchedClean = await documents.findOneByOrFail({ id: clean.id });
    expect(untouchedClean.cadDocument).toEqual(cleanDocument());
    const untouchedBlob = await documents.findOneByOrFail({ id: blob.id });
    expect(untouchedBlob.cadDocument).toEqual(blobPointer());
    const untouchedEmpty = await documents.findOneByOrFail({ id: empty.id });
    expect(untouchedEmpty.cadDocument).toBeNull();

    // ── IDEMPOTENCIA: segunda pasada = mismo estado ─────────────────────────
    const snapshot = JSON.stringify(
      await documents.find({ order: { name: 'ASC' } }),
    );
    const runner2 = harness.dataSource.createQueryRunner();
    try {
      await runner2.connect();
      await runner2.query(`SET search_path TO "${harness.schema}"`);
      await migration.up(runner2);
    } finally {
      await runner2.release();
    }
    expect(
      JSON.stringify(await documents.find({ order: { name: 'ASC' } })),
    ).toBe(snapshot);
    expect(await countTokens('cad_documents')).toBe(0);

    // ── down: no-op que NO reintroduce secretos ─────────────────────────────
    await migration.down();
    expect(await rawContains('cad_documents', SECRET_A)).toBe(0);
    expect(await countTokens('cad_documents')).toBe(0);
  });

  it('sobre base virgen (sin filas) no falla y deja los conteos en cero', async () => {
    const migration = new PurgeReviewLinkTokens20260802140000();
    const runner = harness.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await expect(migration.up(runner)).resolves.toBeUndefined();
    } finally {
      await runner.release();
    }
    expect(await countTokens('cad_documents')).toBe(0);
    expect(await countTokens('cad_document_versions')).toBe(0);
    // Un id inventado no existe: la purga no crea filas.
    await expect(
      harness.dataSource
        .getRepository(CadDocument)
        .findOneBy({ id: randomUUID() }),
    ).resolves.toBeNull();
  });
});
