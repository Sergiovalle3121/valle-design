/**
 * EL TIPO DE COLUMNA JSON, decidido al CARGARSE el módulo.
 *
 * PostgreSQL tiene `jsonb`; SQLite no tiene JSON nativo y TypeORM lo emula con
 * `simple-json` (texto serializado). El mismo código corre contra los dos
 * motores —PostgreSQL en producción y en las suites `*.pg.spec.ts`, SQLite en
 * memoria en la suite de unidad— así que el tipo se deduce del entorno en vez
 * de escribirse a mano en cada entidad.
 *
 * ── LA COUPLING ES DELIBERADA. NO LA AMPLÍES. ───────────────────────────────
 * Sólo cuentan `DATABASE_URL` y `DB_HOST`, que significan «este proceso HABLA
 * con PostgreSQL». `TEST_DATABASE_URL` significa otra cosa: «hay un PostgreSQL
 * DISPONIBLE para las suites que lo exigen», y la mayoría de las suites del
 * mismo proceso siguen corriendo sobre SQLite en memoria.
 *
 * Durante la campaña de firma propia (2026-08-28) esto se «arregló» añadiendo
 * `TEST_DATABASE_URL` a la lista, tras ver morir la cadena de migraciones
 * contra PostgreSQL con un «syntax error at or near "-"». El resultado fue
 * peor que el problema: 51 suites en rojo con
 *
 *     DataTypeNotSupportedError: Data type "jsonb" … is not supported by
 *     "better-sqlite3"
 *
 * porque las entidades pasaron a mapearse a `jsonb` para TODO el proceso,
 * incluidas las suites que corren sobre SQLite. Se revirtió en el acto.
 *
 * La causa real no estaba aquí: estaba en invocar `npx jest` a mano en vez del
 * comando documentado. `apps/api/scripts/jest-postgres.js` (`npm run test:pg`)
 * ya define `DATABASE_URL` a partir de `TEST_DATABASE_URL` justo por esto, y
 * `createPostgresHarness` ya falla con un mensaje que lo dice y nombra el
 * comando correcto. El repositorio tenía la trampa señalizada; lo que faltaba
 * era que `migration-chain.pg.spec.ts` —que construye su propio DataSource en
 * vez de usar el arnés— pasara por esa misma señal. Ahora pasa.
 *
 * `json-column-type.spec.ts` fija esta frontera para que el próximo intento de
 * ampliarla se encuentre una prueba en rojo con esta explicación al lado.
 */
export const JSON_COLUMN_TYPE: 'jsonb' | 'simple-json' =
  process.env.DATABASE_URL || process.env.DB_HOST ? 'jsonb' : 'simple-json';
