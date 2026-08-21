import { ormOptions } from './orm.options';

const ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'SYNCHRONIZE',
  'MIGRATIONS_RUN',
  'DB_SSL_STRICT',
  'DB_POOL_SIZE',
  'DB_STATEMENT_TIMEOUT_MS',
  'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS',
  'DB_LOCK_TIMEOUT_MS',
] as const;

describe('production database configuration', () => {
  const original = new Map(
    ENVIRONMENT_KEYS.map((key) => [key, process.env[key]] as const),
  );

  beforeEach(() => {
    for (const key of ENVIRONMENT_KEYS) delete process.env[key];
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    for (const key of ENVIRONMENT_KEYS) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('never falls back to an ephemeral SQLite database in production', () => {
    expect(() => ormOptions()).toThrow(/PostgreSQL/u);
  });

  it('requires an explicit migration-safe synchronize setting', () => {
    process.env.DB_HOST = '127.0.0.1';
    expect(() => ormOptions()).toThrow(/SYNCHRONIZE="false"/u);

    process.env.SYNCHRONIZE = 'true';
    expect(() => ormOptions()).toThrow(/prohibido en producci/u);
  });

  it('uses PostgreSQL migrations and disables schema synchronization when valid', () => {
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'valle';
    process.env.DB_PASSWORD = 'not-used-by-this-read-only-test';
    process.env.DB_DATABASE = 'valle';
    process.env.SYNCHRONIZE = 'false';

    expect(ormOptions()).toMatchObject({
      type: 'postgres',
      synchronize: false,
      migrationsRun: true,
      host: '127.0.0.1',
      port: 5432,
      username: 'valle',
      database: 'valle',
    });
  });

  it('treats a development DATABASE_URL as a migrated database by default', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://valle:test@localhost:5432/valle';

    expect(ormOptions()).toMatchObject({
      type: 'postgres',
      synchronize: false,
      migrationsRun: true,
      url: process.env.DATABASE_URL,
    });
  });

  it('validates the PostgreSQL certificate by DEFAULT in production', () => {
    process.env.DATABASE_URL = 'postgres://valle:x@db.internal:5432/valle';
    process.env.SYNCHRONIZE = 'false';

    // Sin declarar DB_SSL_STRICT: estricto. El TLS que no valida al servidor
    // no protege del MITM, y ese default nadie lo revisa hasta el incidente.
    expect(ormOptions()).toMatchObject({
      ssl: { rejectUnauthorized: true },
    });

    // La válvula de escape existe pero es EXPLÍCITA.
    process.env.DB_SSL_STRICT = 'false';
    expect(ormOptions()).toMatchObject({
      ssl: { rejectUnauthorized: false },
    });
    delete process.env.DB_SSL_STRICT;
  });

  it('keeps strict SSL as opt-in outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgres://valle:x@db.internal:5432/valle?sslmode=require';

    expect(ormOptions()).toMatchObject({ ssl: { rejectUnauthorized: false } });

    process.env.DB_SSL_STRICT = 'true';
    expect(ormOptions()).toMatchObject({ ssl: { rejectUnauthorized: true } });
    delete process.env.DB_SSL_STRICT;
  });

  it('applies connection budgets with sane defaults and env overrides', () => {
    process.env.DATABASE_URL = 'postgres://valle:x@db.internal:5432/valle';
    process.env.SYNCHRONIZE = 'false';

    // Defaults: pool 20, statement 30s, idle-in-tx 30s, lock 10s.
    expect(ormOptions()).toMatchObject({
      extra: {
        max: 20,
        statement_timeout: 30_000,
        idle_in_transaction_session_timeout: 30_000,
        lock_timeout: 10_000,
      },
    });

    process.env.DB_POOL_SIZE = '5';
    process.env.DB_STATEMENT_TIMEOUT_MS = '60000';
    process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS = '15000';
    process.env.DB_LOCK_TIMEOUT_MS = '2000';
    expect(ormOptions()).toMatchObject({
      extra: {
        max: 5,
        statement_timeout: 60_000,
        idle_in_transaction_session_timeout: 15_000,
        lock_timeout: 2_000,
      },
    });
    delete process.env.DB_POOL_SIZE;
    delete process.env.DB_STATEMENT_TIMEOUT_MS;
    delete process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS;
    delete process.env.DB_LOCK_TIMEOUT_MS;
  });

  it('rejects unreadable connection budgets instead of silently defaulting', () => {
    process.env.DATABASE_URL = 'postgres://valle:x@db.internal:5432/valle';
    process.env.SYNCHRONIZE = 'false';

    // `2O` (letra O) aplicando 20 en silencio es configuración que miente.
    process.env.DB_POOL_SIZE = '2O';
    expect(() => ormOptions()).toThrow(/DB_POOL_SIZE/u);
    process.env.DB_POOL_SIZE = '0';
    expect(() => ormOptions()).toThrow(/entero positivo/u);
    delete process.env.DB_POOL_SIZE;
  });
});
