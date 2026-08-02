import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

/**
 * Estrategia de base de datos (copiada del monorepo origen):
 *
 *  PRODUCCIÓN (DATABASE_URL definido)
 *    → PostgreSQL vía URL de conexión
 *    → SYNCHRONIZE debe declararse "false" explícitamente; el arranque aplica
 *      la cadena de migraciones (migrationsRun)
 *    → SSL habilitado con sslmode=require o NODE_ENV=production
 *
 *  DESARROLLO con credenciales PG explícitas (DB_HOST definido)
 *    → PostgreSQL vía host/puerto/usuario/clave
 *    → synchronize: true por defecto (override con SYNCHRONIZE=false)
 *
 *  LOCAL / sin variables de BD
 *    → SQLite en apps/api/dev.sqlite (esquema auto-creado al arrancar; cero
 *      setup; el archivo está git-ignored). `better-sqlite3` es devDependency:
 *      este camino NO existe en producción (ver abajo).
 */
export function ormOptions(): TypeOrmModuleOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const url = process.env.DATABASE_URL;
  const dbHost = process.env.DB_HOST;

  // ── SQLite fallback (dev local, sin credenciales PG) ─────────────────────
  if (!url && !dbHost) {
    // En producción, caer a SQLite es una trampa de pérdida de datos: el
    // servicio arranca, acepta escrituras y las pierde en el siguiente
    // despliegue, porque el archivo vive en el contenedor.
    if (isProd) {
      throw new Error(
        'En producción hay que configurar PostgreSQL: define DATABASE_URL o DB_HOST. ' +
          'No hay respaldo a SQLite — sería una base de datos efímera que se pierde en cada despliegue.',
      );
    }
    return {
      type: 'better-sqlite3',
      database: process.env.SQLITE_PATH || 'dev.sqlite',
      autoLoadEntities: true,
      synchronize: true, // seguro: sólo dev, sin datos de producción en riesgo
    };
  }

  // ── Base PostgreSQL compartida ───────────────────────────────────────────
  const syncOverride = process.env.SYNCHRONIZE;

  // En producción `synchronize` queda PROHIBIDO (mismo contrato que el
  // origen): DDL automático sin revisión ni vuelta atrás puentea la cadena de
  // migraciones que CI valida. Hay que declarar SYNCHRONIZE="false" explícito.
  if (isProd) {
    if (syncOverride === 'true') {
      throw new Error(
        'SYNCHRONIZE=true está prohibido en producción: TypeORM alteraría el ' +
          'esquema de una base con datos reales sin revisión, sin versión y sin ' +
          'vuelta atrás, puenteando la cadena de migraciones. Fija ' +
          'SYNCHRONIZE=false; el arranque aplicará las migraciones.',
      );
    }
    if (syncOverride !== 'false') {
      throw new Error(
        'En producción debes definir SYNCHRONIZE="false" explícitamente. ' +
          'Sin declararla, un despliegue podría encender synchronize por ' +
          'omisión y alterar el esquema en caliente.',
      );
    }
  }

  const synchronize =
    syncOverride === 'true'
      ? true
      : syncOverride === 'false'
        ? false
        : url
          ? true
          : !isProd;

  const pgBase: Partial<TypeOrmModuleOptions> = {
    type: 'postgres',
    autoLoadEntities: true,
    synchronize,
    migrationsRun:
      !synchronize && (isProd || process.env.MIGRATIONS_RUN === 'true'),
    migrations: [join(__dirname, 'migrations', '!(*.spec).{ts,js}')],
    // SSL relajado por defecto (PaaS con certs internos/self-signed). Endurecer
    // con DB_SSL_STRICT=true SOLO con un CA verificable, o romperá la conexión.
    ssl:
      isProd || url?.includes('sslmode=require')
        ? { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' }
        : false,
  };

  // ── PostgreSQL vía DATABASE_URL ──────────────────────────────────────────
  if (url) {
    return { ...pgBase, url };
  }

  // ── PostgreSQL vía variables individuales (dev/staging explícito) ────────
  return {
    ...pgBase,
    host: dbHost,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: String(process.env.DB_PASSWORD ?? ''),
    database: process.env.DB_DATABASE,
  };
}
