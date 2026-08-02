import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Arnés de pruebas contra PostgreSQL REAL.
 *
 * Concurrencia y atomicidad no se pueden demostrar con SQLite ni con mocks, y
 * durante varias sesiones se intentó: SQLite serializa TODA escritura, así que
 * dos transacciones que en PostgreSQL se pisan allí pasan en fila india y la
 * prueba queda verde sin haber ejercido nada. Los mocks son peores todavía —
 * afirman el comportamiento que se quería probar.
 *
 * Lo que aquí se ejerce de verdad: MVCC y READ COMMITTED (una transacción NO
 * ve lo no confirmado de la otra), `SELECT … FOR UPDATE`, índices únicos
 * parciales y el error 23505 al violarlos. Ese es exactamente el terreno donde
 * viven los defectos de check-then-save.
 *
 * Cada suite recibe su PROPIO esquema, así que las suites pueden correr en
 * paralelo sin verse entre ellas, y el esquema se destruye al terminar.
 */

/** URL de la base de pruebas, o null si el entorno no la ofrece. */
export function postgresTestUrl(): string | null {
  return (
    process.env.TEST_DATABASE_URL ||
    process.env.TEST_PG_URL ||
    process.env.DATABASE_URL_TEST ||
    null
  );
}

/**
 * `describe` que sólo corre con PostgreSQL disponible.
 *
 * Sin base configurada la suite se SALTA con un motivo legible, en vez de
 * fallar el CI de quien no tiene PostgreSQL a mano. Lo que NO hace es caer a
 * SQLite: una prueba de concurrencia que corre sobre otro motor no es una
 * versión reducida de la prueba, es una prueba distinta que afirma algo falso.
 *
 * En CI, donde el servicio SÍ existe, `REQUIRE_POSTGRES_TESTS=true` convierte
 * la ausencia en fallo — así el gate no se vuelve verde por saltarse todo.
 */
export function describePostgres(name: string, fn: () => void): void {
  const url = postgresTestUrl();
  if (url) {
    describe(name, fn);
    return;
  }
  if (process.env.REQUIRE_POSTGRES_TESTS === 'true') {
    describe(name, () => {
      it('requiere PostgreSQL y no se encontró TEST_DATABASE_URL', () => {
        throw new Error(
          'REQUIRE_POSTGRES_TESTS=true pero no hay TEST_DATABASE_URL. ' +
            'Estas pruebas de concurrencia/atomicidad NO tienen equivalente en SQLite.',
        );
      });
    });
    return;
  }
  describe.skip(`${name} [omitida: sin TEST_DATABASE_URL]`, fn);
}

export interface PostgresHarness {
  dataSource: DataSource;
  schema: string;
  /** Vacía todas las tablas del esquema conservando el DDL. */
  truncateAll(): Promise<void>;
  destroy(): Promise<void>;
}

type EntityList = DataSourceOptions['entities'];

/**
 * DataSource contra PostgreSQL real, en un esquema propio y desechable.
 *
 * `synchronize` se usa a propósito y sólo aquí: el objeto de estas suites son
 * los INVARIANTES DE CONCURRENCIA de las entidades (índices únicos parciales
 * incluidos), no el historial de migraciones, que se verifica por separado.
 */
export async function createPostgresHarness(
  entities: EntityList,
  options: { schemaPrefix?: string } = {},
): Promise<PostgresHarness> {
  const url = postgresTestUrl();
  if (!url) {
    throw new Error(
      'createPostgresHarness requiere TEST_DATABASE_URL (PostgreSQL real).',
    );
  }
  // Las entidades eligen `timestamp`/`jsonb` vs `datetime`/`simple-json` al
  // CARGARSE, leyendo DATABASE_URL/DB_HOST (date-column-type.ts). Sin eso, el
  // mapeo queda en el dialecto de SQLite y PostgreSQL rechaza el DDL con un
  // error que no dice nada de la causa. Se comprueba aquí para que el motivo
  // sea explícito y accionable.
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    throw new Error(
      'Las suites PostgreSQL necesitan DATABASE_URL (o DB_HOST) definido ANTES de ' +
        'cargar las entidades: de él dependen los tipos de columna (timestamp/jsonb). ' +
        'Ejecútalas con `npm run test:pg`.',
    );
  }
  const prefix = (options.schemaPrefix ?? 'vtest').replace(/[^a-z0-9_]/gi, '_');
  const schema = `${prefix}_${randomBytes(6).toString('hex')}`.toLowerCase();

  // El esquema se crea con una conexión aparte: el DataSource de la suite ya
  // arranca apuntando a él.
  const bootstrap = new DataSource({ type: 'postgres', url });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await bootstrap.destroy();

  const dataSource = new DataSource({
    type: 'postgres',
    url,
    schema,
    entities: entities as never,
    synchronize: true,
    dropSchema: false,
    logging: false,
  });
  await dataSource.initialize();

  const tableNames = () =>
    dataSource.entityMetadatas
      .filter((m) => m.tableType === 'regular')
      .map((m) => `"${schema}"."${m.tableName}"`);

  return {
    dataSource,
    schema,
    async truncateAll() {
      const tables = tableNames();
      if (!tables.length) return;
      await dataSource.query(
        `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
      );
    },
    async destroy() {
      if (dataSource.isInitialized) await dataSource.destroy();
      const cleanup = new DataSource({ type: 'postgres', url });
      await cleanup.initialize();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await cleanup.destroy();
    },
  };
}

/**
 * TODAS las entidades de la aplicación, por el mismo glob que usa el
 * DataSource real.
 *
 * Enumerar a mano las entidades de una suite es una carrera perdida: TypeORM
 * exige el grafo COMPLETO de relaciones, así que pedir `Plan` arrastra `Kit`,
 * que arrastra `Advance`, `Resupply` y `KitException`, y una relación nueva en
 * producción rompe suites que ni la mencionan.
 *
 * Requiere que cada `@Column()` declare `type:` cuando su tipo TypeScript es
 * un alias de unión: `tsconfig.json` fija `isolatedModules: true`, así que
 * ts-jest transpila archivo por archivo, no puede resolver un alias importado
 * con `import type` y emite `design:type = Object`, que PostgreSQL rechaza.
 * `entity-graph.pg.spec.ts` vigila esa condición para todo el grafo.
 */
export function allApplicationEntities(): string[] {
  // `__dirname` es src/common/testing (o dist/…), así que modules/ está dos
  // niveles arriba — la misma forma que arma orm.options.ts.
  return [join(__dirname, '..', '..', 'modules', '**', '*.entity.{ts,js}')];
}
