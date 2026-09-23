import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import test from 'node:test';
import { pack, unpack } from './backup-envelope.mjs';

test('el paquete portable cifra los cuatro artefactos, autentica y no deja claro con clave errónea', () => {
  const base = mkdtempSync(join(tmpdir(), 'valle-envelope-test-'));
  const before = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  const name = 'valle-design-20260923T010203Z';
  const plain = join(base, 'plain');
  const restored = join(base, 'restored');
  const wrong = join(base, 'wrong');
  mkdirSync(plain);
  mkdirSync(restored);
  mkdirSync(wrong);
  const values = ['PGDMP\u0000contenido sintético', 'sha256 simulado', 'TABLE public.cad_documents', '{"recuentos":{"cad_documents":1}}'];
  const suffixes = ['.dump', '.dump.sha256', '.contents', '.manifest.json'];
  const archive = join(base, `${name}.vbk`);
  try {
    process.env.BACKUP_ENCRYPTION_PASSPHRASE = 'frase-sintetica-sin-secreto-real-12345';
    suffixes.forEach((suffix, index) => writeFileSync(join(plain, `${name}${suffix}`), values[index]));
    const receipt = pack(plain, name, archive);
    assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => pack(plain, name, archive), /no se sobrescribe/u);
    const cipherBytes = readFileSync(archive);
    assert.ok(!cipherBytes.includes(Buffer.from('contenido sintético')));
    assert.ok(!cipherBytes.includes(Buffer.from('cad_documents')));
    const result = unpack(archive, restored);
    assert.equal(result.name, name);
    suffixes.forEach((suffix, index) => assert.equal(readFileSync(join(restored, `${name}${suffix}`), 'utf8'), values[index]));
    process.env.BACKUP_ENCRYPTION_PASSPHRASE = 'clave-incorrecta-sin-secreto-real-123';
    assert.throws(() => unpack(archive, wrong), /No se pudo autenticar/u);
    assert.deepEqual(readdirSync(wrong), []);
    process.env.BACKUP_ENCRYPTION_PASSPHRASE = 'frase-sintetica-sin-secreto-real-12345';
    const altered = join(base, 'altered.vbk');
    const damaged = Buffer.from(cipherBytes);
    damaged[damaged.length - 20] ^= 1;
    writeFileSync(altered, damaged);
    assert.throws(() => unpack(altered, wrong), /No se pudo autenticar/u);
    assert.deepEqual(readdirSync(wrong), []);
  } finally {
    if (before === undefined) delete process.env.BACKUP_ENCRYPTION_PASSPHRASE;
    else process.env.BACKUP_ENCRYPTION_PASSPHRASE = before;
    assert.ok(resolve(base).startsWith(resolve(tmpdir()) + sep));
    assert.match(basename(base), /^valle-envelope-test-/u);
    rmSync(base, { recursive: true, force: true });
  }
});
