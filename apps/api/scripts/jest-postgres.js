/**
 * Lanzador de las suites que EXIGEN PostgreSQL real (`*.pg.spec.ts`).
 *
 * Viven en su propio comando por una razón de contrato, no de comodidad: los
 * tipos de columna de las entidades se deciden al CARGARSE el módulo, leyendo
 * `DATABASE_URL`/`DB_HOST` (common/database/date-column-type.ts). Sin esa
 * variable presente desde el arranque del proceso, las entidades se mapean al
 * dialecto de SQLite (`datetime`, `simple-json`) y PostgreSQL rechaza el DDL
 * con un error que no menciona la causa.
 *
 * Además fija `REQUIRE_POSTGRES_TESTS=true`: cuando este comando corre, la
 * ausencia de base es un FALLO, no un salto silencioso. El salto sólo es
 * aceptable en `npm test` (la suite de unidad de quien no tiene PostgreSQL a
 * mano); aquí volvería verde justo el gate que existe para no confiar.
 *
 * Uso:
 *   TEST_DATABASE_URL=postgres://user@host:5432/db npm run test:pg --workspace=valle-design-api
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const url =
  process.env.TEST_DATABASE_URL ||
  process.env.TEST_PG_URL ||
  process.env.DATABASE_URL_TEST;

if (!url) {
  console.error(
    'Falta TEST_DATABASE_URL (PostgreSQL real). Estas suites demuestran\n' +
      'concurrencia y atomicidad: no tienen equivalente en SQLite, donde el\n' +
      'motor serializa toda escritura y la carrera que se quiere probar\n' +
      'sencillamente no ocurre.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  TEST_DATABASE_URL: url,
  // Las entidades leen esto al cargarse para elegir timestamp/jsonb.
  DATABASE_URL: url,
  REQUIRE_POSTGRES_TESTS: 'true',
  NODE_OPTIONS: [process.env.NODE_OPTIONS ?? '', '--experimental-vm-modules']
    .join(' ')
    .trim(),
};

const args = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [
    require.resolve('jest/bin/jest'),
    '--testRegex',
    '.*\\.pg\\.spec\\.ts$',
    // Cada suite usa su PROPIO esquema, así que pueden correr en paralelo;
    // `runInBand` sólo se impone si quien invoca lo pide.
    ...args,
  ],
  { cwd: path.join(__dirname, '..'), env, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
