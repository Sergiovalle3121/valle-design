#!/usr/bin/env node
/**
 * VERIFICACIÓN DE RESTAURACIÓN: restaura en una base TEMPORAL, comprueba
 * integridad y la BORRA.
 *
 * La tesis de este archivo es una sola frase: **un backup que no se ha
 * restaurado no es un backup, es un archivo**. `pg_dump` puede terminar en 0
 * sobre una base a la que le falta la mitad de las tablas; un `.dump` puede
 * corromperse en el almacenamiento; una restauración puede omitir objetos y
 * salir en 0 si no se le pide `--exit-on-error`. Ninguna de esas tres cosas se
 * nota hasta el día del incidente, que es el peor momento para descubrirlas.
 *
 * Qué comprueba, en orden, y por qué cada una:
 *   1. SHA-256 contra el `.sha256` — un archivo corrupto no merece más pasos.
 *   2. `pg_restore --exit-on-error` sobre una base RECIÉN CREADA — cualquier
 *      objeto que no se pueda recrear es un fallo, no una advertencia.
 *   3. Tablas esperadas presentes — las del manifiesto, más un núcleo crítico
 *      (identidad, organizaciones, comercial, CAD, blobs) sin el cual la
 *      restauración no reconstruye el negocio aunque el dump esté íntegro.
 *   4. Cadena de migraciones — mismo recuento y misma última migración. Una
 *      base restaurada en otro punto del esquema no es compatible con el
 *      binario que se va a desplegar.
 *   5. Recuentos por tabla — fila a fila contra el manifiesto. Es la única
 *      comprobación que detecta una restauración parcial silenciosa.
 *
 * Y BORRA la base temporal SIEMPRE, incluso si falla: dejar bases
 * `..._verify_*` colgando llena el disco del servidor de producción, que es
 * un incidente nuevo creado por la herramienta que debía prevenirlos.
 *
 * Uso:
 *   node scripts/ops/restore-verify.mjs --dump backups/x.dump [--url postgres://...]
 *
 * La URL sólo se usa para CONECTAR al servidor y crear la base temporal; la
 * base de producción no se toca en ningún momento.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, basename, resolve } from 'node:path';
import {
  humanBytes,
  parseArgs,
  query,
  redactUrl,
  requireDatabaseUrl,
  resolveBinary,
  runPg,
  withDatabase,
} from './pg-tools.mjs';

/**
 * Núcleo crítico: sin estas tablas el servicio no arranca ni sirve a nadie.
 * Se listan a mano a propósito — derivarlas del propio dump haría que un dump
 * incompleto se validara contra sí mismo.
 */
const CRITICAL_TABLES = [
  'identity_users',
  'identity_credentials',
  'identity_sessions',
  'organizations',
  'organization_memberships',
  'subscriptions',
  'plan_catalog',
  'cad_projects',
  'cad_documents',
  'cad_document_versions',
  'design_blobs',
  'domain_outbox',
  'email_outbox',
  'migrations',
];

const args = parseArgs(process.argv.slice(2));
const dumpPath = resolve(
  typeof args.dump === 'string' ? args.dump : args._ || '',
);
if (!args.dump || !existsSync(dumpPath)) {
  console.error(
    'Falta --dump con la ruta del archivo a verificar (el que produjo scripts/ops/backup.mjs).',
  );
  process.exit(2);
}

const url = requireDatabaseUrl(typeof args.url === 'string' ? args.url : null);
const psql = resolveBinary('psql');
const pgRestore = resolveBinary('pg_restore');
const maintenanceUrl = withDatabase(url, args.maintenance || 'postgres');

const base = basename(dumpPath).replace(/\.dump$/, '');
const manifestPath = join(dirname(dumpPath), `${base}.manifest.json`);
const checksumPath = `${dumpPath}.sha256`;

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

console.log('Verificación de restauración');
console.log(`  dump    : ${dumpPath}`);
console.log(`  servidor: ${redactUrl(maintenanceUrl)}`);
console.log(`  ${pgRestore.version}`);
console.log('');

// ── 1 · integridad del archivo ──────────────────────────────────────────────
const bytes = readFileSync(dumpPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (existsSync(checksumPath)) {
  const expected = readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0];
  if (expected !== sha256) {
    fail(
      `SHA-256 no coincide: el archivo se corrompió o no es el que se registró (esperado ${expected}, obtenido ${sha256}).`,
    );
  } else {
    console.log(`  [1/5] sha256 OK  ${sha256}`);
  }
} else {
  notes.push(
    `Sin ${basename(checksumPath)}: no se pudo comprobar integridad del archivo.`,
  );
}

const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;
if (!manifest) {
  notes.push(
    `Sin ${basename(manifestPath)}: se verifica la restaurabilidad, pero NO que el contenido coincida con el origen.`,
  );
}

// ── 2 · restauración en base temporal ───────────────────────────────────────
const temporary = `valle_restore_verify_${randomBytes(4).toString('hex')}`;
const temporaryUrl = withDatabase(url, temporary);
let created = false;
const startedAt = Date.now();

function dropTemporary() {
  if (!created) return;
  try {
    // Se cierran las conexiones antes de borrar: un `psql` que quedara
    // colgado impediría el DROP y dejaría la base huérfana.
    runPg(
      psql.path,
      [
        '--no-psqlrc',
        '-At',
        '-c',
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${temporary}' AND pid <> pg_backend_pid()`,
        maintenanceUrl,
      ],
      { url: maintenanceUrl, allowFailure: true },
    );
    runPg(
      psql.path,
      ['--no-psqlrc', '-c', `DROP DATABASE IF EXISTS "${temporary}"`, maintenanceUrl],
      { url: maintenanceUrl },
    );
    console.log(`  limpieza: base temporal ${temporary} eliminada`);
  } catch (error) {
    console.error(
      `  AVISO: no se pudo borrar la base temporal ${temporary}: ${error.message}`,
    );
    console.error('  Bórrala a mano; una base de verificación olvidada llena el disco.');
  }
}

try {
  runPg(
    psql.path,
    ['--no-psqlrc', '-c', `CREATE DATABASE "${temporary}"`, maintenanceUrl],
    { url: maintenanceUrl },
  );
  created = true;
  // Una base recién creada YA trae el esquema `public`, y un dump acotado con
  // `--schema=public` empieza por `CREATE SCHEMA public`: sin esto,
  // `--exit-on-error` aborta en la primera sentencia con «schema already
  // exists». Se elimina para que la restauración construya el esquema entero
  // desde el dump, que es además el procedimiento de emergencia real:
  // restaurar sobre una base VACÍA, nunca sobre una con objetos previos.
  runPg(
    psql.path,
    ['--no-psqlrc', '-c', 'DROP SCHEMA IF EXISTS public CASCADE', temporaryUrl],
    { url: temporaryUrl },
  );
  console.log(`  [2/5] base temporal creada y vaciada: ${temporary}`);

  // `--exit-on-error` es el punto entero: sin él, `pg_restore` acumula
  // errores, omite objetos y termina en 0. Una restauración "con errores
  // ignorados" es exactamente la que parece buena y no lo es.
  runPg(
    pgRestore.path,
    [
      '--exit-on-error',
      '--no-owner',
      '--no-acl',
      `--dbname=${temporaryUrl}`,
      dumpPath,
    ],
    { url: temporaryUrl },
  );
  const restoreSeconds = (Date.now() - startedAt) / 1000;
  console.log(`  [2/5] pg_restore --exit-on-error OK (${restoreSeconds.toFixed(2)} s)`);

  // ── 3 · tablas esperadas ─────────────────────────────────────────────────
  const restoredTables = query(
    psql.path,
    temporaryUrl,
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  ).map(([table]) => table);
  const restoredSet = new Set(restoredTables);

  const missingCritical = CRITICAL_TABLES.filter((t) => !restoredSet.has(t));
  if (missingCritical.length) {
    fail(
      `Faltan tablas críticas tras restaurar: ${missingCritical.join(', ')}. ` +
        'El dump se restaura pero no reconstruye el servicio.',
    );
  } else {
    console.log(
      `  [3/5] ${restoredTables.length} tablas restauradas, incluidas las ${CRITICAL_TABLES.length} críticas`,
    );
  }

  if (manifest) {
    const missingFromManifest = Object.keys(manifest.recuentos).filter(
      (t) => !restoredSet.has(t),
    );
    if (missingFromManifest.length) {
      fail(
        `Tablas presentes en el origen y ausentes tras restaurar: ${missingFromManifest.join(', ')}.`,
      );
    }
  }

  // ── 4 · cadena de migraciones ────────────────────────────────────────────
  if (restoredSet.has('migrations')) {
    const applied = Number(
      query(psql.path, temporaryUrl, 'SELECT count(*) FROM "migrations"')[0][0],
    );
    const latestRows = query(
      psql.path,
      temporaryUrl,
      'SELECT name FROM "migrations" ORDER BY timestamp DESC, id DESC LIMIT 1',
    );
    const latest = latestRows.length ? latestRows[0][0] : null;
    console.log(
      `  [4/5] migraciones: ${applied}${latest ? ` (última: ${latest})` : ''}`,
    );
    if (manifest) {
      if (applied !== manifest.migraciones.aplicadas) {
        fail(
          `Migraciones aplicadas ${applied}, el origen tenía ${manifest.migraciones.aplicadas}: el esquema restaurado NO corresponde al binario que se va a desplegar.`,
        );
      }
      if (latest !== manifest.migraciones.ultima) {
        fail(
          `Última migración "${latest}" frente a "${manifest.migraciones.ultima}" en el origen.`,
        );
      }
    }
    if (applied === 0) {
      fail(
        'La tabla de migraciones está vacía: el esquema no proviene de la cadena versionada.',
      );
    }
  } else {
    fail('No existe la tabla de migraciones tras restaurar.');
  }

  // ── 5 · recuentos fila a fila ────────────────────────────────────────────
  if (manifest) {
    const differences = [];
    let totalRows = 0;
    for (const [table, expected] of Object.entries(manifest.recuentos)) {
      if (!restoredSet.has(table)) continue;
      const actual = Number(
        query(psql.path, temporaryUrl, `SELECT count(*) FROM "${table}"`)[0][0],
      );
      totalRows += actual;
      if (actual !== expected) {
        differences.push(`${table}: ${actual} != ${expected}`);
      }
    }
    if (differences.length) {
      fail(
        `Recuentos distintos del origen (restauración PARCIAL): ${differences.join('; ')}.`,
      );
    } else {
      console.log(
        `  [5/5] recuentos idénticos al origen en ${Object.keys(manifest.recuentos).length} tablas (${totalRows} filas)`,
      );
    }
  } else {
    notes.push('Sin manifiesto no se pudieron comparar recuentos.');
  }

  // ── informe ──────────────────────────────────────────────────────────────
  const elapsed = (Date.now() - startedAt) / 1000;
  console.log('');
  console.log(`  tamaño del dump : ${humanBytes(bytes.length)}`);
  console.log(`  RTO medido      : ${elapsed.toFixed(2)} s (crear + restaurar + verificar)`);
  if (manifest) {
    console.log(`  RPO del artefacto: instantánea de ${manifest.creadoEn}`);
  }
} catch (error) {
  // Un fallo de `pg_restore` es EL resultado de esta herramienta, no una
  // excepción sin manejar: se convierte en veredicto para que la salida sea
  // legible en un informe de incidente.
  fail(String(error.message).trim());
} finally {
  dropTemporary();
}

console.log('');
for (const note of notes) console.log(`  NOTA: ${note}`);
if (failures.length) {
  console.error('');
  console.error('BACKUP NO VALIDADO:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('BACKUP VALIDADO: restaurado, verificado y base temporal eliminada.');
