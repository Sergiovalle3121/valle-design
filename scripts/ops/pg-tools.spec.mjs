import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  pgConnectionWithoutPassword,
  redactUrl,
  runPg,
  withDatabase,
} from './pg-tools.mjs';

const password = 'mock:password+only';
const url = `postgresql://backup:${encodeURIComponent(password)}@127.0.0.1:55432/valle_test?sslmode=require`;

test('pg_dump y pg_restore reciben URI sin contraseña; PGPASSWORD conserva la conexión', () => {
  const capture =
    'process.stdout.write(JSON.stringify({ argv: process.argv.slice(1), password: process.env.PGPASSWORD }))';
  const result = runPg(process.execPath, ['-e', capture, '--', url], { url });
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.password, password);
  assert.equal(observed.argv[0], pgConnectionWithoutPassword(url).connection);
  assert.ok(!JSON.stringify(observed.argv).includes(password));
  assert.ok(
    !JSON.stringify(observed.argv).includes(encodeURIComponent(password)),
  );

  const restoreUrl = withDatabase(url, 'valle_restore_test');
  const restore = runPg(
    process.execPath,
    ['-e', capture, '--', `--dbname=${restoreUrl}`],
    { url: restoreUrl },
  );
  const restored = JSON.parse(restore.stdout);
  assert.equal(restored.password, password);
  assert.equal(
    restored.argv[0],
    `--dbname=${pgConnectionWithoutPassword(restoreUrl).connection}`,
  );
  assert.ok(!JSON.stringify(restored.argv).includes(password));
  assert.ok(
    !JSON.stringify(restored.argv).includes(encodeURIComponent(password)),
  );
});

test('la contraseña en query tampoco llega a argv ni al origen del manifiesto', () => {
  const queryUrl =
    'postgresql://backup@127.0.0.1:55432/valle_test?sslmode=verify-full&password=mock%20query';
  const { connection, password: queryPassword } =
    pgConnectionWithoutPassword(queryUrl);
  assert.equal(queryPassword, 'mock query');
  assert.equal(
    connection,
    'postgresql://backup@127.0.0.1:55432/valle_test?sslmode=verify-full',
  );
  assert.ok(!redactUrl(queryUrl).includes('mock'));
  assert.throws(
    () => pgConnectionWithoutPassword(`${queryUrl}&sslpassword=otra-clave`),
    (error) => !error.message.includes('otra-clave'),
  );
});

test('un error del proceso hijo no registra la contraseña', () => {
  const fail = 'process.stderr.write(process.env.PGPASSWORD); process.exit(7)';
  assert.throws(
    () => runPg(process.execPath, ['-e', fail], { url }),
    (error) =>
      error.message.includes('[REDACTED]') &&
      !error.message.includes(password) &&
      !error.message.includes(encodeURIComponent(password)),
  );
});

test('backup y restore rechazan --url antes de abrir PostgreSQL', () => {
  for (const script of ['backup.mjs', 'restore-verify.mjs']) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(script, import.meta.url)), '--url', url],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 2, script);
    assert.match(result.stderr, /No pases --url/u);
    assert.ok(!(result.stdout + result.stderr).includes(password));
    assert.ok(
      !(result.stdout + result.stderr).includes(encodeURIComponent(password)),
    );
  }
});
