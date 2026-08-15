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
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';

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
  for (const candidate of binaryCandidates(name)) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
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
 * Ejecuta un binario de PostgreSQL heredando `PGPASSWORD` desde la URL, para
 * no dejar la contraseña en la línea de comandos (visible en `ps`).
 */
export function runPg(binary, args, { url, input, allowFailure = false } = {}) {
  const env = { ...process.env };
  if (url) {
    const parsed = parseUrl(url);
    if (parsed.password) env.PGPASSWORD = parsed.password;
  }
  // Salida en inglés y sin colores: los mensajes se parsean y se pegan en
  // informes de incidente.
  env.LC_ALL = 'C';
  env.PGCLIENTENCODING = 'UTF8';
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${binary} salió con código ${result.status}:\n${(result.stderr || '').trim()}`,
    );
  }
  return result;
}

export function parseUrl(url) {
  const parsed = new URL(url);
  return {
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || '5432',
    username: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    search: parsed.search,
  };
}

/** Misma conexión, otra base (para crear/borrar la temporal). */
export function withDatabase(url, database) {
  const parsed = new URL(url);
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
      'Falta la URL de la base: pasa --url o define DATABASE_URL. ' +
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
