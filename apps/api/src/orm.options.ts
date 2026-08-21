import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

/**
 * Entero positivo desde el entorno, con default. Un valor ilegible LANZA en
 * vez de caer al default: `DB_POOL_SIZE=2O` (letra O) aplicando 20 en
 * silencio es una configuración que miente — mejor un arranque que no llega.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `${name}="${raw}" no es un entero positivo. Corrige o elimina la variable ` +
        `(default: ${fallback}).`,
    );
  }
  return value;
}

/**
 * Estrategia de base de datos:
 *
 * - DATABASE_URL usa PostgreSQL con synchronize desactivado y migraciones
 *   activadas por defecto. MIGRATIONS_RUN=false sólo sirve para herramientas
 *   administrativas que controlan la cadena de forma explícita.
 * - DB_HOST conserva el modo PostgreSQL de desarrollo; puede habilitarse
 *   synchronize explícitamente fuera de producción.
 * - Sin configuración de BD, desarrollo local usa SQLite auto-creado.
 * - Producción nunca permite SQLite ni synchronize.
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
          ? false
          : !isProd;

  const pgBase: Partial<TypeOrmModuleOptions> = {
    type: 'postgres',
    autoLoadEntities: true,
    synchronize,
    migrationsRun:
      !synchronize &&
      (url
        ? process.env.MIGRATIONS_RUN !== 'false'
        : isProd || process.env.MIGRATIONS_RUN === 'true'),
    migrations: [join(__dirname, 'migrations', '!(*.spec).{ts,js}')],
    // SSL: en PRODUCCIÓN la validación del certificado es el default — un
    // TLS que no valida al servidor protege del sniffing pero no del MITM,
    // y el silencio de `rejectUnauthorized: false` es exactamente el tipo de
    // default que nadie revisa hasta el incidente. La válvula de escape para
    // hosts sin CA verificable existe pero es EXPLÍCITA: DB_SSL_STRICT=false
    // queda escrito en la configuración del despliegue, delante de quien lo
    // opere. Fuera de producción el estricto sigue siendo opt-in.
    ssl:
      isProd || url?.includes('sslmode=require')
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_STRICT === 'false'
                ? false
                : process.env.DB_SSL_STRICT === 'true' || isProd,
          }
        : false,
    // Presupuestos de conexión (node-postgres los aplica por sesión). Sin
    // ellos, una query degenerada retiene su conexión para siempre y una
    // transacción olvidada retiene sus locks: los timeouts convierten ambos
    // en un error ruidoso y acotado en vez de una degradación silenciosa.
    extra: {
      max: positiveIntFromEnv('DB_POOL_SIZE', 20),
      statement_timeout: positiveIntFromEnv('DB_STATEMENT_TIMEOUT_MS', 30_000),
      idle_in_transaction_session_timeout: positiveIntFromEnv(
        'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS',
        30_000,
      ),
      lock_timeout: positiveIntFromEnv('DB_LOCK_TIMEOUT_MS', 10_000),
    },
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
