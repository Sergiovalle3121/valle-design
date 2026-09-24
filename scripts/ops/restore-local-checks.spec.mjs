import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalRestoreTarget, isolatedEnvironment } from './restore-local-checks.mjs';

test('las comprobaciones posteriores sólo aceptan PostgreSQL 16 local en 55432', () => {
  assert.equal(assertLocalRestoreTarget('postgresql://user:synthetic@127.0.0.1:55432/valle_design_test').port, '55432');
  for (const url of [
    'postgresql://user:synthetic@db.railway.internal:5432/production',
    'postgresql://user:synthetic@127.0.0.1:5432/production',
    'postgresql://user:synthetic@127.0.0.1:55432/production?hostaddr=203.0.113.8',
  ]) {
    assert.throws(() => assertLocalRestoreTarget(url), /sólo acepta PostgreSQL local/u);
  }
});

test('el smoke no hereda la clave del paquete ni otra conexión de respaldo', () => {
  const before = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  const beforeBackupUrl = process.env.BACKUP_DATABASE_URL;
  try {
    process.env.BACKUP_ENCRYPTION_PASSPHRASE = 'frase-sintetica-fuera-del-smoke';
    process.env.BACKUP_DATABASE_URL = 'postgresql://synthetic:fake@remote.invalid:5432/db';
    const env = isolatedEnvironment('postgresql://synthetic:fake@127.0.0.1:55432/valle_restore_verify_12345678');
    assert.equal(env.BACKUP_ENCRYPTION_PASSPHRASE, undefined);
    assert.equal(env.BACKUP_DATABASE_URL, undefined);
    assert.equal(env.OUTBOX_DISPATCHER_ENABLED, 'false');
    assert.match(env.DATABASE_URL, /valle_restore_verify_12345678/u);
  } finally {
    if (before === undefined) delete process.env.BACKUP_ENCRYPTION_PASSPHRASE;
    else process.env.BACKUP_ENCRYPTION_PASSPHRASE = before;
    if (beforeBackupUrl === undefined) delete process.env.BACKUP_DATABASE_URL;
    else process.env.BACKUP_DATABASE_URL = beforeBackupUrl;
  }
});
