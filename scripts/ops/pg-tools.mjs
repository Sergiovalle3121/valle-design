/**
 * Utilidades compartidas por `backup.mjs` y `restore-verify.mjs`.
 *
 * Localizar los binarios es la mitad del trabajo real: en un runner de Linux
 * `pg_dump` está en el PATH, en una máquina Windows con PostgreSQL portable
 * está en un directorio suelto, y en un contenedor puede haber DOS versiones
 * instaladas. Un backup tomado con `pg_dump` 15 contra un servidor 16 falla —
 * y falla tarde, cuando ya se creía tener copia.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';

/** Hash a dump in bounded memory, independent of the backup size. */
export function sha256File(path) {
  const digest = createHash('sha256');
  const file = openSync(path, 'r');
  const chunk = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const count = readSync(file, chunk, 0, chunk.length, null);
      if (!count) break;
      digest.update(chunk.subarray(0, count));
    }
  } finally {
    closeSync(file);
  }
  return digest.digest('hex');
}

/** Candidatos por orden de precedencia explícita. */
function binaryCandidates(name) {
  const executable = IS_WINDOWS ? `${name}.exe` : name;
  const dirs = [];
  if (process.env.PG_BIN) dirs.push(process.env.PG_BIN);
  if (process.env.PGBIN) dirs.push(process.env.PGBIN);
  // Instalación portable habitual en las máquinas de desarrollo de este repo.
  dirs.push('D:/dev/pg16/pgsql/bin');
  dirs.push('/usr/lib/postgresql/16/bin');
  dirs.push('/usr/bin');
  return [
    ...dirs.map((dir) => join(dir, executable)).filter((p) => existsSync(p)),
    // Último recurso: el PATH.
    executable,
  ];
}

export function resolveBinary(name) {
  const env = { ...process.env };
  delete env.BACKUP_ENCRYPTION_PASSPHRASE;
  for (const candidate of binaryCandidates(name)) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', env });
    if (probe.status === 0) {
      return { path: candidate, version: probe.stdout.trim() };
    }
  }
  throw new Error(
    `No se encontró ${name}. Define PG_BIN con el directorio de binarios de PostgreSQL 16 ` +
      `(por ejemplo PG_BIN=D:/dev/pg16/pgsql/bin) o añádelo al PATH.`,
  );
}

/**
 * La URI de libpq mantiene host, base y opciones (por ejemplo sslmode), pero
 * nunca lleva la contraseña en argv. PostgreSQL la recibe por PGPASSWORD.
 * Opciones de contraseña distintas de `password` fallan cerradas: dejarlas en
 * la query de la URI volvería a exponerlas en la lista de procesos.
 */
export function pgConnectionWithoutPassword(url) {
  const parsed = parseDatabaseUrl(url);
  let password = decodeURIComponent(parsed.password);
  for (const [key, value] of parsed.searchParams) {
    if (!/password/i.test(key)) continue;
    if (key !== 'password') {
      throw new Error(
        'DATABASE_URL contiene una opción de contraseña no compatible con una invocación segura de PostgreSQL.',
      );
    }
    password = value;
  }
  parsed.password = '';
  parsed.searchParams.delete('password');
  return { connection: parsed.toString(), password };
}

function parseDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error();
    return parsed;
  } catch {
    // `ERR_INVALID_URL` puede llevar la URI original en `.input`: jamás se
    // propaga a un log o a la consola cuando contiene una credencial.
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida.');
  }
}

function redactPassword(text, password, url) {
  const variants = [url, password, encodeURIComponent(password)];
  return variants.reduce(
    (safe, variant) => (variant ? safe.replaceAll(variant, '[REDACTED]') : safe),
    text,
  );
}

/** Ejecuta PostgreSQL sin una contraseña en argumentos ni en errores. */
export function runPg(binary, args, { url, input, allowFailure = false } = {}) {
  const env = { ...process.env };
  delete env.BACKUP_ENCRYPTION_PASSPHRASE;
  let safeArgs = args;
  let password = '';
  if (url) {
    const safe = pgConnectionWithoutPassword(url);
    password = safe.password;
    if (password) env.PGPASSWORD = password;
    // Cubre el argumento posicional de psql/pg_dump y la forma
    // `--dbname=<URI>` de pg_restore en un solo lugar.
    safeArgs = args.map((arg) => arg.replaceAll(url, () => safe.connection));
  }
  // Salida en inglés y sin colores: los mensajes se parsean y se pegan en
  // informes de incidente.
  env.LC_ALL = 'C';
  env.PGCLIENTENCODING = 'UTF8';
  const result = spawnSync(binary, safeArgs, {
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(redactPassword(result.error.message, password, url));
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${binary} salió con código ${result.status}:\n${redactPassword((result.stderr || '').trim(), password, url)}`,
    );
  }
  return result;
}

export function parseUrl(url) {
  const parsed = parseDatabaseUrl(url);
  return {
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || '5432',
    username: decodeURIComponent(parsed.username || ''),
    password: parsed.searchParams.get('password') ?? decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    search: parsed.search,
  };
}

/** Misma conexión, otra base (para crear/borrar la temporal). */
export function withDatabase(url, database) {
  const parsed = parseDatabaseUrl(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** URL sin credenciales, apta para imprimir en un informe. */
export function redactUrl(url) {
  const parsed = parseUrl(url);
  return `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ''}${parsed.host}:${parsed.port}/${parsed.database}`;
}

/** `psql -At` devuelve filas separadas por salto y columnas por `|`. */
export function query(psql, url, sql) {
  const result = runPg(psql, ['--no-psqlrc', '-At', '-F', '|', '-c', sql, url], {
    url,
  });
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split('|'));
}

export function requireDatabaseUrl(explicit) {
  const url =
    explicit ||
    process.env.DATABASE_URL ||
    process.env.BACKUP_DATABASE_URL ||
    process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta la URL de la base: define DATABASE_URL en el entorno. ' +
        'Un backup no puede adivinar contra qué base debe correr.',
    );
  }
  return url;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const [key, inlineValue] = item.slice(2).split('=');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
