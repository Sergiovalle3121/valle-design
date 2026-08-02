import { runExport } from './export';
import { runImport } from './import';
import { runRollback } from './rollback';
import { runVerify } from './verify';

/**
 * CLI de MIGRACIÓN DE DATOS enterprise → design (Fase 4).
 *
 * Uso (desde apps/api):
 *   npm run migrate:from-enterprise -- export  --out <dir> [--tenant t]... [--dry-run] [--delta-base manifest.json]
 *   npm run migrate:from-enterprise -- import  --archive <dir> [--tenant t]... [--project-id id] [--dry-run] [--resume]
 *   npm run migrate:from-enterprise -- verify  [--tenant t]...
 *   npm run migrate:from-enterprise -- rollback --archive <dir> [--tenant t]... [--dry-run]
 *
 * Conexiones (variables de entorno, override por flag):
 *   DATABASE_URL_SOURCE (--source) — BD enterprise; se abre READ ONLY
 *   DATABASE_URL_TARGET (--target) — BD design
 *
 * Parsing de argv a mano — mismo patrón sin dependencias del resto de
 * herramientas del workspace (seed, scripts/*.js).
 */

interface ParsedArgs {
  command: string | null;
  flags: Map<string, string[]>;
  booleans: Set<string>;
  errors: string[];
}

const VALUE_FLAGS = new Set([
  '--source',
  '--target',
  '--out',
  '--archive',
  '--tenant',
  '--project-id',
  '--delta-base',
]);
const BOOLEAN_FLAGS = new Set(['--dry-run', '--resume', '--help']);

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: null,
    flags: new Map(),
    booleans: new Set(),
    errors: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      if (parsed.command) {
        parsed.errors.push(`Argumento inesperado: ${token}`);
      } else {
        parsed.command = token;
      }
      continue;
    }
    const [flag, inlineValue] = token.includes('=')
      ? [
          token.slice(0, token.indexOf('=')),
          token.slice(token.indexOf('=') + 1),
        ]
      : [token, null];
    if (BOOLEAN_FLAGS.has(flag)) {
      parsed.booleans.add(flag);
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) {
      parsed.errors.push(`Flag desconocida: ${flag}`);
      continue;
    }
    let value = inlineValue;
    if (value === null) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        parsed.errors.push(`La flag ${flag} requiere un valor.`);
        continue;
      }
      value = next;
      i += 1;
    }
    const list = parsed.flags.get(flag) ?? [];
    list.push(value);
    parsed.flags.set(flag, list);
  }
  return parsed;
}

function single(parsed: ParsedArgs, flag: string): string | null {
  const values = parsed.flags.get(flag);
  if (!values?.length) return null;
  if (values.length > 1) {
    parsed.errors.push(`La flag ${flag} solo admite un valor.`);
  }
  return values[values.length - 1];
}

function tenants(parsed: ParsedArgs): string[] | null {
  const values = parsed.flags.get('--tenant');
  return values?.length ? [...new Set(values)] : null;
}

function requireEnvUrl(
  parsed: ParsedArgs,
  flag: '--source' | '--target',
  envVar: 'DATABASE_URL_SOURCE' | 'DATABASE_URL_TARGET',
): string | null {
  const value = single(parsed, flag) ?? process.env[envVar] ?? null;
  if (!value) {
    parsed.errors.push(`Falta ${flag} o la variable ${envVar}.`);
  }
  return value;
}

const HELP = `CLI de migración de datos enterprise → design (Fase 4)

Comandos:
  export    Lee la BD enterprise (READ ONLY estructural) y produce el archivo
            de exportación versionado (manifest + NDJSON + blobs por sha256).
            Flags: --out <dir> (obligatoria), --source <url>|DATABASE_URL_SOURCE,
                   --tenant <id> (repetible; omitir = todos), --dry-run,
                   --delta-base <manifest.json previo> (export delta).
  import    Escribe el archivo en la BD design de forma idempotente (upsert por
            tenant+legacy_source_id; hashes de blobs verificados al escribir).
            Flags: --archive <dir> (obligatoria), --target <url>|DATABASE_URL_TARGET,
                   --tenant <id> (repetible), --project-id <uuid>, --dry-run,
                   --resume (salta lo ya importado sin re-verificar bytes).
  verify    Paridad origen vs destino (conteos, versiones CAS, hashes de
            documentos y blobs re-calculados). Exit 1 ante discrepancias.
            Flags: --source, --target, --tenant.
  rollback  Borra del destino EXACTAMENTE lo importado según el manifiesto
            (filas con legacy_source_id del archivo y blobs huérfanos
            resultantes). Flags: --archive, --target, --tenant, --dry-run.

Ver docs/product-split/DATA-MIGRATION.md para la semántica completa.`;

function printReportTable(
  rows: { entity: string; archivo: number; destino: number }[],
): void {
  for (const row of rows) {
    const ok = row.archivo === row.destino ? 'OK ' : '≠≠ ';
    console.log(
      `  ${ok}${row.entity.padEnd(14)} archivo=${row.archivo}  destino=${row.destino}`,
    );
  }
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.booleans.has('--help') || !parsed.command) {
    console.log(HELP);
    return parsed.command ? 0 : parsed.booleans.has('--help') ? 0 : 2;
  }
  if (parsed.errors.length) {
    for (const error of parsed.errors) console.error(`ERROR: ${error}`);
    return 2;
  }

  switch (parsed.command) {
    case 'export': {
      const sourceUrl = requireEnvUrl(
        parsed,
        '--source',
        'DATABASE_URL_SOURCE',
      );
      const outDir = single(parsed, '--out');
      const dryRun = parsed.booleans.has('--dry-run');
      if (!outDir && !dryRun) parsed.errors.push('Falta --out <dir>.');
      if (parsed.errors.length || !sourceUrl) {
        for (const error of parsed.errors) console.error(`ERROR: ${error}`);
        return 2;
      }
      const result = await runExport({
        sourceUrl,
        outDir: outDir ?? '/nonexistent-dry-run',
        tenants: tenants(parsed),
        dryRun,
        deltaBasePath: single(parsed, '--delta-base'),
      });
      console.log(
        `${dryRun ? '[dry-run] ' : ''}export → documentos=${result.counts.documents} versiones=${result.counts.versions} publicaciones=${result.counts.publications} bloques=${result.counts.blocks} blobs=${result.counts.blobs}`,
      );
      console.log(
        `  omitidos: sin_documento=${result.skippedNoDocument} sin_cambios(delta)=${result.skippedUnchanged}`,
      );
      if (result.manifest) {
        for (const [lane, counts] of Object.entries(
          result.manifest.countsByTenant,
        )) {
          console.log(
            `  tenant ${lane}: documentos=${counts.documents} versiones=${counts.versions} publicaciones=${counts.publications} bloques=${counts.blocks} blobs=${counts.blobs}`,
          );
        }
      }
      for (const warning of result.warnings) {
        console.warn(`AVISO [${warning.code}] ${warning.detail}`);
      }
      for (const error of result.errors) console.error(`ERROR: ${error}`);
      return result.exitCode;
    }

    case 'import': {
      const targetUrl = requireEnvUrl(
        parsed,
        '--target',
        'DATABASE_URL_TARGET',
      );
      const archiveDir = single(parsed, '--archive');
      if (!archiveDir) parsed.errors.push('Falta --archive <dir>.');
      if (parsed.errors.length || !targetUrl || !archiveDir) {
        for (const error of parsed.errors) console.error(`ERROR: ${error}`);
        return 2;
      }
      const dryRun = parsed.booleans.has('--dry-run');
      const result = await runImport({
        targetUrl,
        archiveDir,
        tenants: tenants(parsed),
        projectId: single(parsed, '--project-id'),
        dryRun,
        resume: parsed.booleans.has('--resume'),
      });
      console.log(`${dryRun ? '[dry-run] ' : ''}import ${archiveDir}`);
      for (const [entity, counts] of Object.entries(result.report)) {
        console.log(
          `  ${entity.padEnd(14)} archivo=${counts.archivo} insertados=${counts.insertados} actualizados=${counts.actualizados} sin_cambios=${counts.sinCambios} omitidos=${counts.omitidos}`,
        );
      }
      if (result.parity.length) {
        console.log('Paridad archivo vs destino:');
        printReportTable(result.parity);
      }
      for (const item of result.discrepancies)
        console.error(`DISCREPANCIA: ${item}`);
      for (const error of result.errors) console.error(`ERROR: ${error}`);
      return result.exitCode;
    }

    case 'verify': {
      const sourceUrl = requireEnvUrl(
        parsed,
        '--source',
        'DATABASE_URL_SOURCE',
      );
      const targetUrl = requireEnvUrl(
        parsed,
        '--target',
        'DATABASE_URL_TARGET',
      );
      if (parsed.errors.length || !sourceUrl || !targetUrl) {
        for (const error of parsed.errors) console.error(`ERROR: ${error}`);
        return 2;
      }
      const result = await runVerify({
        sourceUrl,
        targetUrl,
        tenants: tenants(parsed),
      });
      console.log('verify — paridad origen vs destino:');
      for (const [lane, counts] of Object.entries(result.countsByLane)) {
        console.log(`  tenant ${lane}:`);
        for (const entity of [
          'documents',
          'versions',
          'publications',
          'blocks',
          'blobs',
        ] as const) {
          const source = counts.source[entity];
          const targetCount = counts.target[entity];
          const ok = source === targetCount ? 'OK ' : '≠≠ ';
          console.log(
            `    ${ok}${entity.padEnd(14)} origen=${source}  destino=${targetCount}`,
          );
        }
      }
      for (const item of result.discrepancies)
        console.error(`DISCREPANCIA: ${item}`);
      console.log(
        result.exitCode === 0
          ? 'Paridad LIMPIA (0 discrepancias).'
          : `Paridad ROTA: ${result.discrepancies.length} discrepancias.`,
      );
      return result.exitCode;
    }

    case 'rollback': {
      const targetUrl = requireEnvUrl(
        parsed,
        '--target',
        'DATABASE_URL_TARGET',
      );
      const archiveDir = single(parsed, '--archive');
      if (!archiveDir) parsed.errors.push('Falta --archive <dir>.');
      if (parsed.errors.length || !targetUrl || !archiveDir) {
        for (const error of parsed.errors) console.error(`ERROR: ${error}`);
        return 2;
      }
      const dryRun = parsed.booleans.has('--dry-run');
      const result = await runRollback({
        targetUrl,
        archiveDir,
        tenants: tenants(parsed),
        dryRun,
      });
      console.log(
        `${dryRun ? '[dry-run] ' : ''}rollback ${archiveDir} → documentos=${result.deleted.documents} versiones=${result.deleted.versions} publicaciones=${result.deleted.publications} bloques=${result.deleted.blocks} blobs=${result.deleted.blobs} proyectos=${result.deleted.projects} (blobs conservados por referencias vivas: ${result.keptBlobs})`,
      );
      for (const error of result.errors) console.error(`ERROR: ${error}`);
      return result.exitCode;
    }

    default:
      console.error(`Comando desconocido: ${parsed.command}\n`);
      console.log(HELP);
      return 2;
  }
}

/* istanbul ignore next — punto de entrada real */
if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error('ERROR FATAL:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
