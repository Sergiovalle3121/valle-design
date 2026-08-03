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
});
