#!/usr/bin/env node
/**
 * SMOKE DE ARRANQUE PRODUCTIVO.
 *
 * Arranca el `dist` compilado y comprueba, contra el proceso real, lo que
 * ninguna spec unitaria puede: que el binario que se despliega SE COMPORTA
 * como un servicio operable.
 *
 * Tres bloques, y cada uno cubre un fallo que este repo puede sufrir de
 * verdad:
 *
 *   A · FALLA CERRADA. Una configuración productiva incompleta debe MATAR el
 *       arranque, no degradarlo. El caso concreto que motiva esto está escrito
 *       en `orm.options.ts`: sin PostgreSQL, el runtime caía a SQLite, el
 *       servicio arrancaba, aceptaba escrituras y las perdía en el siguiente
 *       despliegue. Un servicio que arranca mal es peor que uno que no
 *       arranca, porque nadie recibe una alerta.
 *
 *   B · PROBES. `/health` (liveness) responde sin tocar la base y
 *       `/health/ready` (readiness) sólo cuando la base responde y la cadena
 *       de migraciones está al día.
 *
 *   C · MÉTRICAS PROTEGIDAS. `/metrics` exige el bearer; sin credencial, 401.
 *
 *   D · APAGADO ORDENADO. Con SIGTERM, readiness pasa a 503 (el balanceador
 *       saca la réplica) ANTES de que el proceso cierre, y el proceso termina
 *       por decisión propia dentro del plazo.
 *
 * Sobre `NODE_ENV`: el bloque D corre con `NODE_ENV=test` y no `production`, y
 * la razón es material, no comodidad. Con `NODE_ENV=production`, `orm.options`
 * fuerza TLS contra PostgreSQL, y el contenedor efímero de CI (`postgres:16`)
 * no sirve TLS: el smoke moriría por la configuración del entorno de pruebas
 * en vez de por el código. Los guardas exclusivos de producción se ejercen en
 * el bloque A —donde fallan ANTES de tocar la red— y en `orm.options.spec.ts`.
 *
 * Sobre Windows: `SIGTERM` no existe como señal en Win32; Node la emula
 * TERMINANDO el proceso, así que el handler nunca corre. El bloque D informa
 * de esa limitación en vez de fingir que pasó. En CI (Linux) se ejerce entero.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node scripts/deploy/production-startup-smoke.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = join(ROOT, 'apps', 'api', 'dist', 'main.js');
const IS_WINDOWS = process.platform === 'win32';

const PORT = Number(process.env.SMOKE_PORT ?? 4319);
const BASE = `http://127.0.0.1:${PORT}`;
const METRICS_TOKEN = 'smoke-metrics-token-de-32-caracteres-o-mas';
const DATABASE_URL =
  process.env.SMOKE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.TEST_DATABASE_URL;

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

function note(message) {
  results.push({ name: message, ok: true, skipped: true });
  console.log(`  NOTA  ${message}`);
}

if (!existsSync(ENTRY)) {
  console.error(
    `No existe ${ENTRY}. Compila primero: npm run build --workspace=valle-design-api`,
  );
  process.exit(2);
}
if (!DATABASE_URL) {
  console.error(
    'Falta DATABASE_URL (PostgreSQL real). El smoke comprueba readiness contra la cadena de migraciones.',
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, headers = {}) {
  try {
    const response = await fetch(`${BASE}${path}`, { headers });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: String(error.message) };
  }
}

// ── A · falla cerrada ───────────────────────────────────────────────────────
console.log('Smoke de arranque productivo\n');
console.log('A · configuración productiva incompleta debe MATAR el arranque');

/**
 * Arranca con una configuración productiva inválida y exige DOS cosas: que el
 * proceso muera y que el motivo esté escrito. Un arranque que muere sin decir
 * por qué obliga a bisectar variables de entorno a las 3 de la mañana.
 */
function bootExpectingFailure(label, env, reasonPattern) {
  const result = spawnSync(process.execPath, [ENTRY], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT + 1),
      METRICS_TOKEN: '',
      // Los guardas se evalúan en cadena y el del secreto de rate limiting
      // salta al CARGAR el módulo, antes que ninguno de la base. Se
      // proporciona salvo cuando es justo el guarda bajo prueba, para que
      // cada caso muera por el motivo que dice medir.
      IDENTITY_RATE_LIMIT_KEY_SECRET:
        'smoke-rate-limit-secret-de-32-caracteres',
      OUTBOX_DISPATCHER_ENABLED: 'true',
      OUTBOX_EMAIL_WEBHOOK_URL: 'https://receptor.invalido/valle/outbox',
      OUTBOX_DOMAIN_WEBHOOK_URL: 'https://receptor.invalido/valle/outbox',
      OUTBOX_WEBHOOK_SECRET: 'smoke-outbox-webhook-secret-de-32-chars',
      ...env,
    },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  check(
    label,
    result.status !== 0,
    result.status === 0
      ? 'el proceso ARRANCÓ con configuración inválida'
      : `salió con código ${result.status}`,
  );
  check(
    `  ...y el motivo queda escrito en el log de arranque`,
    reasonPattern.test(output),
    reasonPattern.source,
  );
}

bootExpectingFailure(
  'sin DATABASE_URL ni DB_HOST no arranca (nada de SQLite en producción)',
  { DATABASE_URL: '', DB_HOST: '', SYNCHRONIZE: 'false' },
  /PostgreSQL|SQLite/i,
);

bootExpectingFailure(
  'SYNCHRONIZE=true está prohibido en producción',
  { DATABASE_URL, SYNCHRONIZE: 'true' },
  /SYNCHRONIZE/,
);

bootExpectingFailure(
  'SYNCHRONIZE sin declarar no se asume',
  { DATABASE_URL, SYNCHRONIZE: '' },
  /SYNCHRONIZE/,
);

bootExpectingFailure(
  'sin IDENTITY_RATE_LIMIT_KEY_SECRET no arranca (rate limiting multi-réplica)',
  {
    DATABASE_URL,
    SYNCHRONIZE: 'false',
    IDENTITY_RATE_LIMIT_KEY_SECRET: '',
  },
  /IDENTITY_RATE_LIMIT_KEY_SECRET/,
);

// El guarda de `OUTBOX_DISPATCHER_ENABLED` NO se puede ejercer aquí: vive en
// `onApplicationBootstrap`, o sea DESPUÉS de conectar, y con NODE_ENV=production
// la conexión exige TLS que el PostgreSQL efímero no sirve. Lo que se
// observaría sería un error de conexión, no el guarda. Está cubierto por
// `modules/commercial/outbox-worker.service.spec.ts`; fingir aquí una
// comprobación que en realidad mide otra cosa sería peor que no tenerla.

// ── B, C, D · proceso vivo ──────────────────────────────────────────────────
console.log('\nB · probes de liveness y readiness');

const child = spawn(process.execPath, [ENTRY], {
  env: {
    ...process.env,
    // Ver la cabecera: production forzaría TLS contra un PostgreSQL efímero
    // que no lo sirve, y el smoke moriría por el entorno, no por el código.
    NODE_ENV: 'test',
    PORT: String(PORT),
    DATABASE_URL,
    SYNCHRONIZE: 'false',
    MIGRATIONS_RUN: 'true',
    ALLOWED_ORIGIN: 'https://design.example.com',
    IDENTITY_RATE_LIMIT_KEY_SECRET: 'smoke-rate-limit-secret-de-32-caracteres',
    METRICS_TOKEN,
    OUTBOX_DISPATCHER_ENABLED: 'false',
    SHUTDOWN_DRAIN_DELAY_MS: '1500',
    SHUTDOWN_GRACE_MS: '15000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const log = [];
child.stdout.on('data', (chunk) => log.push(String(chunk)));
child.stderr.on('data', (chunk) => log.push(String(chunk)));

let exitCode = null;
let exitSignal = null;
child.on('exit', (code, signal) => {
  exitCode = code;
  exitSignal = signal;
});

async function waitForBoot(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitCode !== null) return false;
    const health = await get('/health');
    if (health.status === 200) return true;
    await sleep(500);
  }
  return false;
}

function abort(reason) {
  console.error(`\n${reason}`);
  console.error(log.join('').slice(-4000));
  if (exitCode === null) child.kill('SIGKILL');
  process.exit(1);
}

try {
  if (!(await waitForBoot())) {
    abort('El API no llegó a responder /health.');
  }

  const liveness = await get('/health');
  check(
    'GET /health responde 200',
    liveness.status === 200 && liveness.body.includes('"status":"ok"'),
  );

  const readiness = await get('/health/ready');
  check(
    'GET /health/ready responde 200 con la cadena de migraciones al día',
    readiness.status === 200 && readiness.body.includes('"up-to-date"'),
    `status=${readiness.status}`,
  );

  console.log('\nC · /metrics protegido');
  const anonymous = await get('/metrics');
  check(
    'sin credencial responde 401',
    anonymous.status === 401,
    `status=${anonymous.status}`,
  );

  const wrongToken = await get('/metrics', {
    authorization: 'Bearer token-equivocado-pero-largo-igual',
  });
  check(
    'con un bearer incorrecto responde 401',
    wrongToken.status === 401,
    `status=${wrongToken.status}`,
  );

  const authorized = await get('/metrics', {
    authorization: `Bearer ${METRICS_TOKEN}`,
  });
  check(
    'con el bearer correcto expone el formato Prometheus',
    authorized.status === 200 &&
      authorized.body.includes('# TYPE valle_http_requests_total counter') &&
      authorized.body.includes('valle_http_request_duration_seconds_bucket'),
    `status=${authorized.status}`,
  );
  check(
    'las métricas cuentan las peticiones que este smoke acaba de hacer',
    /valle_http_requests_total\{method="GET",route="\/health"/.test(
      authorized.body,
    ),
  );

  console.log('\nD · apagado ordenado');
  if (IS_WINDOWS) {
    note(
      'SIGTERM no es una señal real en Windows: Node TERMINA el proceso y el handler nunca corre. ' +
        'El drenaje se verifica en bootstrap/graceful-shutdown.spec.ts y en CI (Linux).',
    );
    child.kill();
    const deadline = Date.now() + 15_000;
    while (exitCode === null && Date.now() < deadline) await sleep(200);
    check('el proceso termina', exitCode !== null || exitSignal !== null);
  } else {
    child.kill('SIGTERM');
    // Durante el drenaje (1500 ms configurados) el proceso SIGUE atendiendo:
    // liveness en 200 —si respondiera 503 el supervisor lo mataría a mitad—
    // y readiness en 503 para que el balanceador lo saque de rotación.
    await sleep(400);
    const draining = await get('/health/ready');
    check(
      'durante el drenaje readiness responde 503',
      draining.status === 503 && draining.body.includes('draining'),
      `status=${draining.status}`,
    );
    const aliveWhileDraining = await get('/health');
    check(
      'durante el drenaje liveness sigue en 200 (un 503 aquí mataría el contenedor)',
      aliveWhileDraining.status === 200,
      `status=${aliveWhileDraining.status}`,
    );

    const deadline = Date.now() + 20_000;
    while (exitCode === null && Date.now() < deadline) await sleep(200);
    check(
      'el proceso sale por decisión propia con código 0',
      exitCode === 0,
      `code=${exitCode} signal=${exitSignal}`,
    );
  }
} finally {
  if (exitCode === null) child.kill('SIGKILL');
}

console.log('');
if (failed) {
  console.error(`${failed} comprobación(es) fallidas. Log del API:`);
  console.error(log.join('').slice(-4000));
  process.exit(1);
}
console.log(
  `${results.filter((r) => !r.skipped).length} comprobaciones OK. Arranque productivo verificado.`,
);
