#!/usr/bin/env node
/** Portable AES-256-GCM envelope for the four artifacts from backup.mjs.
 * The passphrase is read ONLY from BACKUP_ENCRYPTION_PASSPHRASE. Never pass it
 * on the command line or write it to the repository. The final .vbk contains
 * the dump, checksum, object list and inventory; all four are encrypted.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { closeSync, existsSync, fstatSync, fsyncSync, openSync, readSync, rmSync, statSync, writeSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const MAGIC = Buffer.from('VDBK1\n');
const PREFIX_BYTES = MAGIC.length + 16 + 12;
const TAG_BYTES = 16;
const CHUNK_BYTES = 64 * 1024;
const SUFFIXES = ['.dump', '.dump.sha256', '.contents', '.manifest.json'];

function passphrase() {
  const value = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (!value || value.length < 20) throw new Error('Define BACKUP_ENCRYPTION_PASSPHRASE fuera del repositorio (mínimo 20 caracteres).');
  return value;
}

function safeName(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value) || value.includes('..')) {
    throw new Error('Nombre de respaldo inválido.');
  }
  return value;
}

function writeAll(fd, data) {
  let offset = 0;
  while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
}

function sha256(path) {
  const hash = createHash('sha256');
  const fd = openSync(path, 'r');
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally { closeSync(fd); }
  return hash.digest('hex');
}

function pack(directory, name, output) {
  name = safeName(name);
  if (existsSync(output)) throw new Error('El archivo cifrado ya existe; no se sobrescribe.');
  const files = SUFFIXES.map((suffix) => {
    const file = `${name}${suffix}`;
    const path = join(directory, file);
    const info = statSync(path);
    if (!info.isFile() || info.size < 1) throw new Error(`Artefacto vacío o inválido: ${file}`);
    return { file, path, bytes: info.size };
  });
  const header = Buffer.from(JSON.stringify({ format: 1, name, files: files.map(({ file, bytes }) => ({ file, bytes })) }), 'utf8');
  if (header.length > 4096) throw new Error('Cabecera del respaldo demasiado grande.');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase(), salt, 32), iv);
  let target;
  let created = false;
  try {
    target = openSync(output, 'wx', 0o600);
    created = true;
    writeAll(target, Buffer.concat([MAGIC, salt, iv]));
    writeAll(target, cipher.update(length));
    writeAll(target, cipher.update(header));
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    for (const file of files) {
      const source = openSync(file.path, 'r');
      try {
        for (;;) {
          const count = readSync(source, buffer, 0, buffer.length, null);
          if (!count) break;
          writeAll(target, cipher.update(buffer.subarray(0, count)));
        }
      } finally { closeSync(source); }
    }
    writeAll(target, cipher.final());
    writeAll(target, cipher.getAuthTag());
    fsyncSync(target);
    closeSync(target);
    target = undefined;
  } catch (error) {
    if (target !== undefined) closeSync(target);
    if (created) rmSync(output, { force: true });
    throw error;
  }
  return { name, bytes: statSync(output).size, sha256: sha256(output) };
}

function unpack(input, directory) {
  const source = openSync(input, 'r');
  const temporary = join(directory, '.valle-backup-decrypted.part');
  let target;
  let header;
  try {
    const size = fstatSync(source).size;
    if (size < PREFIX_BYTES + TAG_BYTES + 4) throw new Error('Respaldo cifrado incompleto.');
    header = Buffer.alloc(PREFIX_BYTES);
    if (readSync(source, header, 0, header.length, 0) !== header.length || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Formato de respaldo cifrado no reconocido.');
    }
    const tag = Buffer.alloc(TAG_BYTES);
    if (readSync(source, tag, 0, tag.length, size - TAG_BYTES) !== TAG_BYTES) throw new Error('Etiqueta de integridad ausente.');
    const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
    const iv = header.subarray(MAGIC.length + 16);
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase(), salt, 32), iv);
    decipher.setAuthTag(tag);
    target = openSync(temporary, 'wx', 0o600);
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let offset = PREFIX_BYTES;
    while (offset < size - TAG_BYTES) {
      const count = readSync(source, buffer, 0, Math.min(buffer.length, size - TAG_BYTES - offset), offset);
      if (!count) throw new Error('Respaldo cifrado truncado.');
      writeAll(target, decipher.update(buffer.subarray(0, count)));
      offset += count;
    }
    writeAll(target, decipher.final()); // Authenticity before extracting files.
    fsyncSync(target);
    closeSync(target);
    target = undefined;
  } catch {
    if (target !== undefined) {
      closeSync(target);
      target = undefined;
    }
    rmSync(temporary, { force: true });
    throw new Error('No se pudo autenticar o leer el respaldo cifrado. Comprueba archivo y clave.');
  } finally {
    if (target !== undefined) closeSync(target);
    closeSync(source);
  }

  const extracted = [];
  const bundle = openSync(temporary, 'r');
  try {
    const size = fstatSync(bundle).size;
    const length = Buffer.alloc(4);
    if (readSync(bundle, length, 0, 4, 0) !== 4 || length.readUInt32BE() > 4096) throw new Error('Cabecera autenticada inválida.');
    const headerBytes = Buffer.alloc(length.readUInt32BE());
    if (readSync(bundle, headerBytes, 0, headerBytes.length, 4) !== headerBytes.length) throw new Error('Cabecera truncada.');
    const manifest = JSON.parse(headerBytes.toString('utf8'));
    const name = safeName(manifest.name);
    if (manifest.format !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== SUFFIXES.length) throw new Error('Inventario cifrado inválido.');
    let position = 4 + headerBytes.length;
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    for (let index = 0; index < SUFFIXES.length; index += 1) {
      const file = manifest.files[index];
      if (file.file !== `${name}${SUFFIXES[index]}` || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || position + file.bytes > size) {
        throw new Error('Archivo o tamaño inválido en el inventario cifrado.');
      }
      const output = join(directory, file.file);
      const fd = openSync(output, 'wx', 0o600);
      extracted.push(output);
      try {
        let remaining = file.bytes;
        while (remaining) {
          const count = readSync(bundle, buffer, 0, Math.min(buffer.length, remaining), position);
          if (!count) throw new Error('Contenido autenticado truncado.');
          writeAll(fd, buffer.subarray(0, count));
          remaining -= count;
          position += count;
        }
        fsyncSync(fd);
      } finally { closeSync(fd); }
    }
    if (position !== size) throw new Error('Contenido inesperado al final del respaldo.');
    return { name, dump: join(directory, `${name}.dump`), bytes: statSync(input).size, sha256: sha256(input) };
  } catch (error) {
    for (const file of extracted) rmSync(file, { force: true });
    throw error;
  } finally {
    closeSync(bundle);
    rmSync(temporary, { force: true });
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'backup-envelope.mjs') {
  try {
    const [command, first, second, third] = process.argv.slice(2);
    const result = command === 'pack' && first && second && third
      ? pack(resolve(first), second, resolve(third))
      : command === 'unpack' && first && second && !third
        ? unpack(resolve(first), resolve(second))
        : null;
    if (!result) throw new Error('Uso: pack <directorio> <nombre> <archivo.vbk> | unpack <archivo.vbk> <directorio>.');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Fallo del respaldo cifrado.');
    process.exitCode = 1;
  }
}

export { pack, unpack };
