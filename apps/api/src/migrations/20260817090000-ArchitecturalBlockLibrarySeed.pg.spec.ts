import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { SfCadBlock } from '../modules/cad-documents/entities/sf-cad-block.entity';
import { ArchitecturalBlockLibrarySeed20260817090000 } from './20260817090000-ArchitecturalBlockLibrarySeed';
import {
  ARCHITECTURAL_SEED_ROWS,
  seedBlockBounds,
  type SeedShape,
} from './seed/architectural-blocks';

/**
 * El sembrado se prueba contra PostgreSQL REAL, y no sólo «que aplique».
 *
 * Que una migración termine sin excepción no dice nada de lo único que
 * importa aquí: que la puerta que se lee de vuelta de la base mida noventa
 * centímetros y se inserte en su quicial. Un error de unidad, un punto de
 * inserción en el centro de la caja o un `jsonb` que se guarda a medias
 * producen exactamente el mismo «aplicó sin error» y un producto inservible.
 *
 * Además, la idempotencia de este sembrado NO vive en el código: vive en el
 * índice único parcial del carril de sistema, que SQLite no tiene. Probarla
 * fuera de PostgreSQL sería probar otra cosa.
 */
describePostgres('ArchitecturalBlockLibrarySeed (biblioteca real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await createPostgresHarness([SfCadBlock], {
      schemaPrefix: 'arq_blocks',
    });
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new ArchitecturalBlockLibrarySeed20260817090000();
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  }

  interface StoredRow {
    name: string;
    version: number;
    tenant_id: string | null;
    definition: {
      id: string;
      name: string;
      basePoint: { x: number; y: number; z: number };
      entities: Array<SeedShape & { id: string; layer: string }>;
      attributes: Record<string, { defaultValue: string }>;
    };
  }

  /** Lee la fila SEMBRADA, no el catálogo en memoria: esa es la evidencia. */
  async function stored(slug: string): Promise<StoredRow> {
    const rows = await harness.dataSource.query<StoredRow[]>(
      `SELECT "name", "version", "tenant_id", "definition"
         FROM "${harness.schema}"."sf_cad_blocks"
        WHERE "legacy_source_id" = $1`,
      [`valle:arq:${slug}`],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  /** Cuenta filas: siempre por consulta tipada, nunca por aserción sobre any. */
  async function contar(where: string): Promise<number> {
    const rows = await harness.dataSource.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count
         FROM "${harness.schema}"."sf_cad_blocks" ${where}`,
    );
    return rows[0].count;
  }

  const medidas = (entities: readonly SeedShape[]) => {
    const bounds = seedBlockBounds(entities);
    return {
      ancho: Math.round((bounds.maxX - bounds.minX) * 10) / 10,
      fondo: Math.round((bounds.maxY - bounds.minY) * 10) / 10,
      bounds,
    };
  };

  it('siembra la biblioteca completa en el carril de sistema', async () => {
    await run('up');

    const count = await contar(
      `WHERE "tenant_id" IS NULL AND "legacy_source_id" LIKE 'valle:arq:%'`,
    );
    expect(count).toBe(ARCHITECTURAL_SEED_ROWS.length);
    expect(count).toBeGreaterThanOrEqual(30);

    const puerta = await stored('puerta-abatible-90');
    expect(puerta.tenant_id).toBeNull();
    expect(puerta.version).toBe(1);
    expect(puerta.name).toBe('Puerta abatible 0.90 m');
  });

  it('guarda las medidas en milímetros reales', async () => {
    await run('up');

    // Puerta de acceso: 0,90 m de claro. La envolvente añade el barrido de la
    // hoja (0,90 m) y el batiente del muro (0,15 m) hacia el otro lado.
    const puerta = await stored('puerta-abatible-90');
    expect(medidas(puerta.definition.entities)).toMatchObject({
      ancho: 900,
      fondo: 1050,
    });
    expect(puerta.definition.attributes.ANCHO.defaultValue).toBe('0.90');
    expect(puerta.definition.attributes.ALTO.defaultValue).toBe('2.10');

    // WC de tanque bajo: 0,38 × 0,70 m, la pieza de catálogo mexicana.
    expect(
      medidas((await stored('wc-tanque-bajo')).definition.entities),
    ).toMatchObject({ ancho: 380, fondo: 700 });

    // Cama matrimonial: 1,35 × 1,90 m, la talla que se vende en México.
    expect(
      medidas((await stored('cama-matrimonial')).definition.entities),
    ).toMatchObject({ ancho: 1350, fondo: 1900 });

    // Cajón de estacionamiento para auto grande: 2,40 × 5,00 m (NTC-PA CDMX).
    expect(
      medidas((await stored('cajon-auto-grande')).definition.entities),
    ).toMatchObject({ ancho: 2400, fondo: 5000 });

    // Escalera: 0,90 m de ancho y 15 huellas de 0,28 m de desarrollo.
    expect(
      medidas((await stored('escalera-recta-16')).definition.entities),
    ).toMatchObject({ ancho: 900, fondo: 4200 });
  });

  it('deja el punto de inserción donde la pieza toca la obra', async () => {
    await run('up');

    // La puerta se inserta en el QUICIAL: origen del bloque, centro del arco
    // de barrido y esquina del claro son el mismo punto.
    const puerta = await stored('puerta-abatible-90');
    expect(puerta.definition.basePoint).toEqual({ x: 0, y: 0, z: 0 });
    const arco = puerta.definition.entities.find(
      (entity) => entity.type === 'arc',
    );
    if (arco?.type !== 'arc') throw new Error('la puerta perdió su barrido');
    expect(arco.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(arco.radius).toBe(900);

    // El WC se inserta CONTRA EL MURO: el origen está en el borde posterior,
    // no en el centro de la pieza. Si estuviera al centro, colocarlo exigiría
    // estimar 0,35 m a ojo en cada baño del plano.
    const wc = await stored('wc-tanque-bajo');
    expect(wc.definition.basePoint).toEqual({ x: 0, y: 0, z: 0 });
    const wcBounds = medidas(wc.definition.entities).bounds;
    expect(wcBounds.minY).toBe(0);
    expect(wcBounds.minX).toBe(-190);
    expect(wcBounds.maxX).toBe(190);

    // La cama se inserta por el centro de su CABECERA.
    const cama = await stored('cama-matrimonial');
    const camaBounds = medidas(cama.definition.entities).bounds;
    expect(cama.definition.basePoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(camaBounds.minY).toBe(0);
    expect(camaBounds.minX + camaBounds.maxX).toBe(0);

    // La regadera se inserta en la ESQUINA: el origen es una esquina del plato.
    const regadera = await stored('regadera-90');
    const regaderaBounds = medidas(regadera.definition.entities).bounds;
    expect(regaderaBounds.minX).toBe(0);
    expect(regaderaBounds.minY).toBe(0);
  });

  it('no duplica nada al aplicarse dos veces', async () => {
    await run('up');
    await run('up');

    expect(await contar('')).toBe(ARCHITECTURAL_SEED_ROWS.length);
    // Y sigue habiendo UNA sola fila por llave: la idempotencia la impone el
    // índice único parcial del carril, no una comprobación optimista.
    await expect(stored('puerta-abatible-90')).resolves.toBeDefined();
  });

  it('revierte su propio sembrado sin tocar los bloques del inquilino', async () => {
    const blocks = harness.dataSource.getRepository(SfCadBlock);
    const propio = await blocks.save(
      blocks.create({
        tenant_id: 'tenant-a',
        name: 'Celda del cliente',
        assets: [],
        definition: { id: 'propio', name: 'Celda del cliente' },
        version: 3,
        legacySourceId: null,
      }),
    );
    // Y uno del carril SIN inquilino que no es del producto: tampoco es nuestro
    // para borrarlo.
    const ajeno = await blocks.save(
      blocks.create({
        tenant_id: null,
        name: 'Importado del sistema anterior',
        assets: [],
        definition: { id: 'legacy-77', name: 'Importado' },
        version: 1,
        legacySourceId: 'legacy-77',
      }),
    );

    await run('up');
    await run('down');

    await expect(
      blocks.findOneByOrFail({ id: propio.id }),
    ).resolves.toMatchObject({ name: 'Celda del cliente', version: 3 });
    await expect(
      blocks.findOneByOrFail({ id: ajeno.id }),
    ).resolves.toMatchObject({ legacySourceId: 'legacy-77' });
    expect(await contar(`WHERE "legacy_source_id" LIKE 'valle:arq:%'`)).toBe(0);

    // Y vuelve a sembrarse idéntica: un rollback ensayable exige que el `up`
    // posterior no dependa de lo que quedó.
    await run('up');
    expect(
      medidas((await stored('puerta-abatible-90')).definition.entities),
    ).toMatchObject({ ancho: 900, fondo: 1050 });
  });

  it('falla cerrado si la cadena de migraciones está incompleta', async () => {
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await runner.query(
        `ALTER TABLE "sf_cad_blocks" DROP COLUMN "legacy_source_id"`,
      );
      await expect(
        new ArchitecturalBlockLibrarySeed20260817090000().up(runner),
      ).rejects.toThrow(/legacy_source_id/);
    } finally {
      // La columna y SUS DOS índices vuelven con sus nombres reales: dejar el
      // esquema distinto de como estaba haría que el siguiente que añada una
      // prueba aquí depurase un fallo que no es suyo.
      await runner.query(
        `ALTER TABLE "sf_cad_blocks" ADD COLUMN "legacy_source_id" varchar(64) NULL`,
      );
      await runner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_sf_cad_block_tenant_legacy"
           ON "sf_cad_blocks" ("tenant_id", "legacy_source_id")
           WHERE "legacy_source_id" IS NOT NULL`,
      );
      await runner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_sf_cad_block_legacy_lane"
           ON "sf_cad_blocks" ("legacy_source_id")
           WHERE "tenant_id" IS NULL AND "legacy_source_id" IS NOT NULL`,
      );
      await runner.release();
    }
  });
});
