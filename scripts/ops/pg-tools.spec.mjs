import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  pgConnectionWithoutPassword,
  redactUrl,
  runPg,
  sha256File,
  withDatabase,
} from './pg-tools.mjs';

const password = 'mock:password+only';
const url = `postgresql://backup:${encodeURIComponent(password)}@127.0.0.1:55432/valle_test?sslmode=require`;

test('el SHA-256 del dump se calcula por bloques sin cargarlo entero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'valle-pg-hash-test-'));
  const path = join(directory, 'synthetic.dump');
  try {
    const bytes = Buffer.alloc(200_000);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    writeFileSync(path, bytes);
    assert.equal(
      sha256File(path),
      createHash('sha256').update(bytes).digest('hex'),
    );
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});

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

test('los clientes PostgreSQL no heredan la clave del paquete cifrado', () => {
  const before = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  try {
    process.env.BACKUP_ENCRYPTION_PASSPHRASE = 'frase-sintetica-para-prueba-123';
    const capture = 'process.stdout.write(String(process.env.BACKUP_ENCRYPTION_PASSPHRASE || ""))';
    const result = runPg(process.execPath, ['-e', capture], { url });
    assert.equal(result.stdout, '');
  } finally {
    if (before === undefined) delete process.env.BACKUP_ENCRYPTION_PASSPHRASE;
    else process.env.BACKUP_ENCRYPTION_PASSPHRASE = before;
  }
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

test('backup rechaza nombres de salida y esquemas que no puede inventariar antes de abrir PostgreSQL', () => {
  const script = fileURLToPath(new URL('backup.mjs', import.meta.url));
  const env = { ...process.env, DATABASE_URL: 'postgresql://synthetic:fake@127.0.0.1:55432/test' };
  for (const [args, message] of [
    [['--name', '../existing'], /Nombre de respaldo inválido/u],
    [['--schema', 'public,other'], /sólo admite --schema=public/u],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.ok(!result.stderr.includes('synthetic:fake'));
  }
});

test('backup no reemplaza un dump existente con el mismo nombre', () => {
  const directory = mkdtempSync(join(tmpdir(), 'valle-backup-collision-test-'));
  const script = fileURLToPath(new URL('backup.mjs', import.meta.url));
  const existing = join(directory, 'valle-design-existing.dump');
  try {
    writeFileSync(existing, 'copia anterior que debe permanecer');
    const result = spawnSync(process.execPath, [script, '--out', directory, '--name', 'valle-design-existing'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgresql://synthetic:fake@127.0.0.1:55432/test' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no se sobrescribe/u);
    assert.equal(readFileSync(existing, 'utf8'), 'copia anterior que debe permanecer');
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
