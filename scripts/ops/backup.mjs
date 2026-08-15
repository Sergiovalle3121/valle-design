#!/usr/bin/env node
/**
 * BACKUP CONSISTENTE DE POSTGRESQL + INVENTARIO VERIFICABLE.
 *
 * Lo que distingue esto de «ejecutar pg_dump» es el INVENTARIO. Un `.dump`
 * suelto no permite responder la única pregunta que importa el día del
 * incidente: *¿lo que restauré es lo que había?* Sin recuentos por tabla y sin
 * la migración más reciente grabadas EN EL MOMENTO del backup, una
 * restauración que devuelve la mitad de las filas parece exitosa —`pg_restore`
 * termina en 0— y nadie lo nota hasta que un cliente abre un plano que ya no
 * está.
 *
 * Por eso se emiten cuatro artefactos junto al dump:
 *   · `<nombre>.dump`          — copia en formato custom (comprimida, con
 *                                 orden de restauración selectivo);
 *   · `<nombre>.dump.sha256`   — integridad del archivo;
 *   · `<nombre>.contents`      — `pg_restore --list`, el índice de objetos;
 *   · `<nombre>.manifest.json` — recuentos por tabla, migración más reciente,
 *                                 versión del servidor e instante UTC.
 *
 * Decisiones y su porqué:
 * - `--format=custom`: permite restaurar objeto a objeto y comprime. Un dump
 *   SQL plano sólo se puede aplicar entero.
 * - `--no-owner --no-acl`: la base restaurada suele tener otro rol. Conservar
 *   propietarios convierte cada restauración en una carrera de permisos.
 * - `--schema=public` por defecto: el runtime materializa TODO su esquema ahí
 *   (TypeORM no configura `schema`, así que usa el predeterminado). Acotarlo
 *   no es una economía, es correctitud: en una base compartida con suites de
 *   prueba —que crean y destruyen esquemas efímeros— un dump de la base
 *   entera FALLA a mitad, porque `pg_dump` bloquea la lista de tablas que vio
 *   al empezar y para entonces un esquema de prueba ya se destruyó. Ocurrió
 *   en la primera ejecución real de este script. Si un despliegue usa otros
 *   esquemas, pásalos con `--schema`; el script avisa de los que encuentra y
 *   no incluye.
 * - snapshot MVCC único: `pg_dump` es consistente por definición. NO se hacen
 *   dumps por módulo — una operación de identidad y otra comercial pueden
 *   pertenecer a la misma transacción y restaurarlas de instantes distintos
 *   rompe FKs, CAS, punteros a blobs e idempotencia.
 * - la contraseña viaja por `PGPASSWORD`, nunca en argv (`ps` la vería).
 *
 * Uso:
 *   node scripts/ops/backup.mjs --url postgres://... [--out dir] [--name x]
 *   DATABASE_URL=postgres://... node scripts/ops/backup.mjs
 *
 * Variables: PG_BIN (directorio de binarios de PostgreSQL 16).
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  humanBytes,
  parseArgs,
  query,
  redactUrl,
  requireDatabaseUrl,
  resolveBinary,
  runPg,
} from './pg-tools.mjs';

const args = parseArgs(process.argv.slice(2));
const url = requireDatabaseUrl(typeof args.url === 'string' ? args.url : null);
const outDir = resolve(
  typeof args.out === 'string' ? args.out : process.env.BACKUP_DIR || 'backups',
);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const name = typeof args.name === 'string' ? args.name : `valle-design-${stamp}`;
const schemas = (typeof args.schema === 'string' ? args.schema : 'public')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const pgDump = resolveBinary('pg_dump');
const pgRestore = resolveBinary('pg_restore');
const psql = resolveBinary('psql');

mkdirSync(outDir, { recursive: true });
const dumpPath = join(outDir, `${name}.dump`);
const contentsPath = join(outDir, `${name}.contents`);
const checksumPath = join(outDir, `${name}.dump.sha256`);
const manifestPath = join(outDir, `${name}.manifest.json`);

console.log('Backup de Valle Design');
console.log(`  origen : ${redactUrl(url)}`);
console.log(`  destino: ${dumpPath}`);
console.log(`  ${pgDump.version}`);

// ── 1 · inventario ANTES del dump ───────────────────────────────────────────
// Se captura primero porque es lo que permitirá afirmar que la restauración
// devolvió lo mismo. Un inventario tomado después describiría otro instante.
const serverVersion = query(psql.path, url, 'SHOW server_version')[0][0];
const schemaList = schemas.map((s) => `'${s}'`).join(', ');
const tables = query(
  psql.path,
  url,
  `SELECT tablename FROM pg_tables WHERE schemaname IN (${schemaList}) ORDER BY 1`,
).map(([table]) => table);

// Esquemas que existen y NO entran en el dump. No es un fallo (el runtime
// vive en `public`), pero callarlo convertiría una copia parcial en una copia
// que parece completa.
const excludedSchemas = query(
  psql.path,
  url,
  `SELECT nspname FROM pg_namespace
   WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
     AND nspname NOT IN (${schemaList})
   ORDER BY 1`,
).map(([schema]) => schema);

if (tables.length === 0) {
  console.error(
    'La base no tiene ninguna tabla en el esquema public. Un backup vacío no es un backup: revisa la URL.',
  );
  process.exit(1);
}

const rowCounts = {};
for (const table of tables) {
  // COUNT(*) exacto, no la estimación de `reltuples`: el recuento es la
  // prueba de la restauración y una estimación no prueba nada.
  const [[count]] = query(psql.path, url, `SELECT count(*) FROM "${table}"`);
  rowCounts[table] = Number(count);
}

const migrationsTable = tables.includes('migrations') ? 'migrations' : null;
const migrations = migrationsTable
  ? query(
      psql.path,
      url,
      `SELECT name FROM "${migrationsTable}" ORDER BY timestamp DESC, id DESC LIMIT 1`,
    )
  : [];
const latestMigration = migrations.length ? migrations[0][0] : null;
const migrationCount = migrationsTable
  ? Number(query(psql.path, url, `SELECT count(*) FROM "${migrationsTable}"`)[0][0])
  : 0;

// ── 2 · dump consistente ────────────────────────────────────────────────────
const startedAt = Date.now();
try {
  runPg(
    pgDump.path,
    [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      ...schemas.map((schema) => `--schema=${schema}`),
      `--file=${dumpPath}`,
      url,
    ],
    { url },
  );
} catch (error) {
  // `pg_dump` CREA el archivo antes de fallar. Un `.dump` de cero bytes
  // conservado en el directorio de backups es peor que no tener nada: la
  // siguiente persona lo encuentra, ve un archivo con fecha reciente y cree
  // que hay copia.
  try {
    rmSync(dumpPath, { force: true });
  } catch {
    /* el aviso de abajo ya es suficiente */
  }
  console.error('');
  console.error('BACKUP FALLIDO; se eliminó el archivo parcial.');
  console.error(String(error.message).trim());
  process.exit(1);
}
const dumpSeconds = (Date.now() - startedAt) / 1000;

// ── 3 · integridad e índice de objetos ──────────────────────────────────────
const bytes = readFileSync(dumpPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
writeFileSync(checksumPath, `${sha256}  ${name}.dump\n`, 'utf8');

const contents = runPg(pgRestore.path, ['--list', dumpPath]);
writeFileSync(contentsPath, contents.stdout, 'utf8');

const manifest = {
  formato: 1,
  creadoEn: new Date().toISOString(),
  origen: redactUrl(url),
  servidor: serverVersion,
  esquemas: schemas,
  esquemasExcluidos: excludedSchemas,
  herramientas: { pg_dump: pgDump.version, pg_restore: pgRestore.version },
  dump: {
    archivo: `${name}.dump`,
    bytes: statSync(dumpPath).size,
    sha256,
    segundos: dumpSeconds,
  },
  migraciones: {
    tabla: migrationsTable,
    aplicadas: migrationCount,
    ultima: latestMigration,
  },
  tablas: tables.length,
  recuentos: rowCounts,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

// ── 4 · informe ─────────────────────────────────────────────────────────────
console.log('');
console.log(`  servidor        : PostgreSQL ${serverVersion}`);
console.log(`  esquemas        : ${schemas.join(', ')}`);
console.log(`  tablas          : ${tables.length}`);
console.log(
  `  filas           : ${Object.values(rowCounts).reduce((a, b) => a + b, 0)}`,
);
console.log(
  `  migraciones     : ${migrationCount}${latestMigration ? ` (última: ${latestMigration})` : ''}`,
);
console.log(`  tamaño          : ${humanBytes(manifest.dump.bytes)}`);
console.log(`  sha256          : ${sha256}`);
console.log(`  duración        : ${dumpSeconds.toFixed(2)} s`);
if (excludedSchemas.length) {
  console.log('');
  console.log(
    `  AVISO: ${excludedSchemas.length} esquema(s) NO incluidos en el dump: ${excludedSchemas.join(', ')}.`,
  );
  console.log(
    '  El runtime materializa su esquema en `public`; si tu despliegue usa otros,',
  );
  console.log('  vuelve a ejecutar con --schema=public,otro.');
}
console.log('');
console.log('Artefactos:');
for (const path of [dumpPath, checksumPath, contentsPath, manifestPath]) {
  console.log(`  ${path}`);
}
console.log('');
console.log(
  'ESTE BACKUP NO ESTÁ VALIDADO todavía. Ejecuta ahora, contra el mismo servidor:',
);
console.log(`  node scripts/ops/restore-verify.mjs --dump ${dumpPath}`);
