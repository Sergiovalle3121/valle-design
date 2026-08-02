/**
 * Smoke de la CLI de migración enterprise→design (Fase 4).
 *
 * Siempre: valida que la CLI arranca (--help) y que rechaza flags inválidas.
 * Con DATABASE_URL_SOURCE + DATABASE_URL_TARGET definidas corre además el
 * ciclo REAL contra esas bases (pensadas DESECHABLES/de staging):
 *   export --dry-run → export → import --dry-run → import → verify
 * y exige exit code 0 en cada paso (verify limpio incluido).
 *
 * Sin las variables, el ciclo con base se OMITE con aviso (mismo criterio que
 * `npm test` con las suites pg): el gate duro con BD es `smoke:migration` en
 * un entorno con ambas URLs, como hace la validación 4.c documentada en
 * docs/product-split/DATA-MIGRATION.md.
 *
 * Uso: npm run smoke:migration --workspace=valle-design-api
 */
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const apiDir = path.join(__dirname, '..');

function runCli(args, expectExit = 0) {
  const result = spawnSync(
    'npx',
    ['ts-node', '-r', 'tsconfig-paths/register', 'src/migration-cli/main.ts', ...args],
    { cwd: apiDir, encoding: 'utf8', env: process.env },
  );
  const label = `migrate:from-enterprise -- ${args.join(' ')}`;
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status !== expectExit) {
    console.error(
      `[migration-smoke] FAIL: «${label}» salió con ${result.status} (esperado ${expectExit}).`,
    );
    process.exit(1);
  }
  console.log(`[migration-smoke] OK (exit ${result.status}): ${label}`);
}

// 1) La CLI arranca y documenta sus comandos.
runCli(['--help'], 0);
// 2) Flags inválidas → exit 2 (errores de uso, no de datos).
runCli(['export', '--flag-inexistente'], 2);

const source = process.env.DATABASE_URL_SOURCE;
const target = process.env.DATABASE_URL_TARGET;
if (!source || !target) {
  console.log(
    '[migration-smoke] SKIP ciclo con BD: define DATABASE_URL_SOURCE y DATABASE_URL_TARGET (bases desechables) para el ciclo completo.',
  );
  process.exit(0);
}

const out = mkdtempSync(path.join(tmpdir(), 'migracion-smoke-'));
try {
  runCli(['export', '--dry-run', '--out', out], 0);
  runCli(['export', '--out', out], 0);
  runCli(['import', '--dry-run', '--archive', out], 0);
  runCli(['import', '--archive', out], 0);
  runCli(['verify'], 0);
  console.log('[migration-smoke] OK — ciclo export→import→verify limpio.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
