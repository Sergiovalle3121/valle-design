/** Extra checks on the disposable database created by restore-verify.mjs. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUrl } from './pg-tools.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const api = join(root, 'apps', 'api');

export function assertLocalRestoreTarget(url) {
  const target = parseUrl(url);
  // libpq accepts transport overrides such as ?hostaddr= and ?service=.
  // A loopback hostname alone is therefore not enough to prove isolation.
  if (
    !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(target.host) ||
    target.port !== '55432' ||
    target.search
  ) {
    throw new Error(
      'La restauración con migraciones y smoke sólo acepta PostgreSQL local en 127.0.0.1:55432.',
    );
  }
  return target;
}

export function isolatedEnvironment(temporaryUrl) {
  const env = { ...process.env };
  for (const key of [
    'BACKUP_ENCRYPTION_PASSPHRASE',
    'BACKUP_DATABASE_URL',
    'TEST_DATABASE_URL',
    'PGPASSWORD',
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_DATABASE',
    'EMAIL_SENDER_PROVIDER',
    'EMAIL_SENDER_API_KEY',
    'EMAIL_SENDER_FROM',
    'OUTBOX_EMAIL_LINK_BASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ]) delete env[key];
  env.DATABASE_URL = temporaryUrl;
  env.NODE_ENV = 'development';
  env.OUTBOX_DISPATCHER_ENABLED = 'false';
  return env;
}

export function runLocalPostChecks(temporaryUrl) {
  const target = assertLocalRestoreTarget(temporaryUrl);
  if (!/^valle_restore_verify_[a-f0-9]{8}$/.test(target.database)) {
    throw new Error(
      'Las migraciones sólo corren en una base temporal creada por restore-verify.',
    );
  }
  if (!existsSync(join(api, 'dist', 'app.module.js'))) {
    throw new Error(
      'Falta la API compilada para el smoke. Ejecuta npm run build --workspace=valle-design-api antes del restore local.',
    );
  }
  const env = isolatedEnvironment(temporaryUrl);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const migration = spawnSync(npm, ['run', 'migration:run', '--workspace=valle-design-api'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    shell: process.platform === 'win32',
  });
  if (migration.error || migration.status !== 0) {
    throw new Error(
      `Migraciones sobre la base temporal fallaron (código ${migration.status ?? 'sin proceso'}). Salida omitida para no registrar credenciales.`,
    );
  }
  const smoke = spawnSync(process.execPath, [join(api, 'scripts', 'bootstrap-smoke.js')], {
    cwd: api,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (smoke.error || smoke.status !== 0) {
    throw new Error(
      `Smoke de API sobre la base temporal falló (código ${smoke.status ?? 'sin proceso'}). Salida omitida para no registrar credenciales.`,
    );
  }
  return { migrations: true, apiSmoke: true };
}
