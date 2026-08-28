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
 *   E · ACTIVOS ESTÁTICOS DEL WEB (opcional — requiere SMOKE_WEB_BASE_URL).
 *       Caso concreto que motiva esto (hallazgo P0-D): el stage de runtime de
 *       `apps/web/Dockerfile` copiaba `.next/standalone` y `.next/static`
 *       pero NO `apps/web/public`. La imagen construía, arrancaba y pasaba
 *       CUALQUIER healthcheck que sólo pidiera `/` — y devolvía 404 para el
 *       kernel WASM y los SVG de marca que la página SÍ referencia. Ni
 *       `docker build` ni un healthcheck de liveness detectan eso: hace falta
 *       pedir los activos reales. Este bloque es opcional porque necesita un
 *       servidor web YA LEVANTADO (contenedor o `node server.js` local) —
 *       `apps/api/dist/main.js`, que es lo que arranca el resto de este
 *       script, no es ese servidor. Sin `SMOKE_WEB_BASE_URL` el bloque se
 *       anota como no ejercido, nunca como aprobado.
 *
 *       Sub-chequeo de `NEXT_PUBLIC_API_URL`: busca el literal en TODOS los
 *       chunks bajo `apps/web/.next/static` (ver `discoverStaticChunkUrls`),
 *       NO en los `<script src>` que enlaza `/`. La variable sólo la leen
 *       `apiFetch.ts` y sus importadores (dashboard/CAD/comercial); la
 *       landing pública nunca los importa, así que parsear `/` producía un
 *       falso negativo permanente — fallaba incluso contra un build
 *       correcto, porque el chunk con la URL nunca está entre los que `/`
 *       referencia.
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
 *
 *   # Bloque E, además, contra un web ya levantado (contenedor o local):
 *   SMOKE_WEB_BASE_URL=http://127.0.0.1:3000 \
 *   NEXT_PUBLIC_API_URL=https://api.tu-dominio.com \
 *   DATABASE_URL=postgres://... node scripts/deploy/production-startup-smoke.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
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

// ── E · funciones puras (exportadas para la spec, sin red) ──────────────────

export const WEB_PUBLIC_DIR = join(ROOT, 'apps', 'web', 'public');

/**
 * Content-Type esperado por extensión. Es exactamente el filtro que el
 * hallazgo P0-D dejó sin cubrir: `.next/standalone` sirve JS y HTML, pero
 * `apps/web/public` — sin su propia copia en el runtime — nunca respondía
 * ninguno de estos tipos.
 */
export const ASSET_CONTENT_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

/**
 * Recorre `apps/web/public` y devuelve la ruta pública (`/brand/x.svg`) y el
 * Content-Type esperado de cada archivo cuya extensión es servible. NO
 * incluye todo lo que hay bajo `public/`: `product/MANIFIESTO.md`, por
 * ejemplo, no tiene extensión servible aquí ni lo referencia ninguna página,
 * y `.dockerignore` lo excluye del build a propósito (regla `*.md`).
 * Tratarlo como "activo esperado" produciría un rojo que no es un bug.
 */
export function discoverExpectedWebAssets(publicDir = WEB_PUBLIC_DIR) {
  const found = [];
  function walk(dir, urlPrefix) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const urlPath = `${urlPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(abs, urlPath);
        continue;
      }
      const contentType = ASSET_CONTENT_TYPES[extname(entry.name).toLowerCase()];
      if (!contentType) continue;
      found.push({ urlPath, contentType, abs });
    }
  }
  walk(publicDir, '');
  return found.sort((a, b) => a.urlPath.localeCompare(b.urlPath));
}

/**
 * Recorta la lista de activos a un tope de peticiones HTTP para el smoke,
 * garantizando que el WASM y al menos un SVG de marca —los dos ejemplos que
 * motivaron el hallazgo— siempre están incluidos aunque el tope sea bajo.
 */
export function selectSmokeAssets(assets, limit = 8) {
  const wasm = assets.find((a) => a.contentType === 'application/wasm');
  const svg = assets.find((a) => a.contentType === 'image/svg+xml');
  const mustHave = [wasm, svg].filter(Boolean);
  const mustHavePaths = new Set(mustHave.map((a) => a.urlPath));
  const rest = assets.filter((a) => !mustHavePaths.has(a.urlPath));
  return [...mustHave, ...rest].slice(0, Math.max(limit, mustHave.length));
}

/**
 * Compara la respuesta HTTP real de un activo contra lo que se espera. Un
 * 404, un 200 con cuerpo vacío o un Content-Type distinto son, los tres, el
 * mismo fallo que produjo el hallazgo P0-D: el archivo no llegó a la imagen.
 */
export function evaluateAssetResponse(asset, status, contentType, bodyLength) {
  if (status === 404) {
    return { ok: false, detail: `${asset.urlPath} respondió 404` };
  }
  if (status !== 200) {
    return {
      ok: false,
      detail: `${asset.urlPath} respondió ${status}, se esperaba 200`,
    };
  }
  if (!bodyLength) {
    return { ok: false, detail: `${asset.urlPath} respondió 200 con cuerpo vacío` };
  }
  if (!(contentType ?? '').toLowerCase().startsWith(asset.contentType)) {
    return {
      ok: false,
      detail: `${asset.urlPath} respondió Content-Type "${contentType ?? '<ninguno>'}", se esperaba "${asset.contentType}"`,
    };
  }
  return { ok: true, detail: '' };
}

export const WEB_STATIC_DIR = join(ROOT, 'apps', 'web', '.next', 'static');

/**
 * Recorre `apps/web/.next/static` — el directorio de chunks con hash que
 * `apps/web/Dockerfile` copia aparte de `standalone` (ver su cabecera) — y
 * devuelve la ruta pública (`/_next/static/...`) de cada `.js` que contiene.
 *
 * Por qué el directorio entero y no los `<script src>` que referencia `/`:
 * `NEXT_PUBLIC_API_URL` sólo la leen `apiFetch.ts` y sus tres importadores
 * (`layout-http-adapter.ts`, `cad/repositories/client.ts`,
 * `commercial/public-catalog.ts`) — código de dashboard/CAD/comercial que la
 * landing pública no importa nunca. Parsear el HTML de `/` sólo puede ver
 * los chunks que ESA página concreta enlaza, así que ese chequeo fallaba
 * SIEMPRE — incluso contra un build correctamente construido — sin medir
 * nada real. Recorrer `.next/static` no asume qué ruta usa la variable: es
 * el conjunto completo de chunks que Next generó para TODAS las páginas, así
 * que si `apiFetch.ts` incrustó la URL en algún bundle, ese bundle está en
 * esta lista sin importar qué página lo carga ni si esa página exige sesión.
 * Cada URL, además, se pide contra el servidor real (`baseUrl`) más abajo —
 * no se lee el archivo del disco — así que esto sigue midiendo lo que el
 * proceso levantado sirve, igual que el resto del bloque E.
 */
export function discoverStaticChunkUrls(staticDir = WEB_STATIC_DIR) {
  const urls = [];
  function walk(dir, urlPrefix) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const urlPath = `${urlPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(abs, urlPath);
        continue;
      }
      if (extname(entry.name).toLowerCase() !== '.js') continue;
      urls.push(urlPath);
    }
  }
  walk(staticDir, '/_next/static');
  return urls.sort();
}

/** ¿Aparece `apiUrl` literalmente en alguno de los bundles servidos? */
export function bundleContainsApiUrl(scriptTexts, apiUrl) {
  return scriptTexts.some((text) => text.includes(apiUrl));
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function get(path, headers = {}) {
  try {
    const response = await fetch(`${BASE}${path}`, { headers });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: String(error.message) };
  }
}

/**
 * Bloque E: activos estáticos de un web YA LEVANTADO. Aislado del resto del
 * smoke (no depende del proceso API que arranca `main`) porque mide un
 * servidor distinto. `fetchImpl` es inyectable para que la spec pueda
 * ejercer la lógica de verificación sin red real.
 */
export async function runWebAssetsSmoke({
  baseUrl,
  expectedApiUrl,
  publicDir = WEB_PUBLIC_DIR,
  staticDir = WEB_STATIC_DIR,
  fetchImpl = fetch,
  checkFn = check,
  noteFn = note,
  assetLimit = 8,
  scriptFetchLimit = 200,
}) {
  if (!baseUrl) {
    noteFn(
      'Bloque E (activos estáticos del web) no se ejerció: falta SMOKE_WEB_BASE_URL. ' +
        'No es un "aprobado" — es "no medido". Pásala apuntando a un contenedor o `node server.js` levantado.',
    );
    return;
  }

  console.log(`\nE · activos estáticos del web contra ${baseUrl}`);

  const root = await fetchImpl(baseUrl).then(
    (r) => ({ status: r.status }),
    () => ({ status: 0 }),
  );
  checkFn(
    'GET / no responde 404',
    root.status !== 0 && root.status !== 404,
    `status=${root.status}`,
  );

  const assets = selectSmokeAssets(discoverExpectedWebAssets(publicDir), assetLimit);
  if (assets.length === 0) {
    checkFn(
      'apps/web/public tiene al menos un activo servible que verificar',
      false,
      `${publicDir} no contiene .svg/.png/.wasm — el smoke no puede probar nada real`,
    );
  }
  for (const asset of assets) {
    let status = 0;
    let contentType;
    let bodyLength = 0;
    try {
      const response = await fetchImpl(`${baseUrl}${asset.urlPath}`);
      status = response.status;
      contentType = response.headers.get('content-type');
      bodyLength = (await response.arrayBuffer()).byteLength;
    } catch (error) {
      checkFn(`GET ${asset.urlPath}`, false, String(error.message));
      continue;
    }
    const evaluation = evaluateAssetResponse(asset, status, contentType, bodyLength);
    checkFn(
      `GET ${asset.urlPath} responde 200 con Content-Type ${asset.contentType}`,
      evaluation.ok,
      evaluation.detail,
    );
  }

  // NEXT_PUBLIC_API_URL se INCRUSTA en el bundle en tiempo de build (ver
  // cabecera de apps/web/Dockerfile): la única forma de comprobar que el
  // servidor que responde en `baseUrl` se construyó con el origen correcto
  // es buscar ese literal en el JS que realmente sirve. Se busca en TODOS
  // los chunks bajo `.next/static` (ver `discoverStaticChunkUrls`), no sólo
  // en los que `/` referencia: la variable la usan `apiFetch.ts` y sus
  // importadores de dashboard/CAD/comercial, código que la landing pública
  // nunca carga.
  if (!expectedApiUrl) {
    checkFn(
      'NEXT_PUBLIC_API_URL embebida en el bundle servido',
      false,
      'falta NEXT_PUBLIC_API_URL en el entorno del smoke: sin el valor esperado no se puede confirmar que el bundle servido apunta al API correcto',
    );
    return;
  }

  const chunkPaths = discoverStaticChunkUrls(staticDir).slice(0, scriptFetchLimit);
  const scriptTexts = [];
  for (const chunkPath of chunkPaths) {
    try {
      const response = await fetchImpl(new URL(chunkPath, baseUrl).toString());
      scriptTexts.push(await response.text());
    } catch {
      // un chunk individual que no responde no es lo que esta comprobación
      // mide — si NINGUNO contiene la URL, el chequeo de abajo lo atrapa.
    }
  }
  checkFn(
    `NEXT_PUBLIC_API_URL (${expectedApiUrl}) embebida en el bundle servido`,
    bundleContainsApiUrl(scriptTexts, expectedApiUrl),
    chunkPaths.length === 0
      ? `${staticDir} no contiene chunks .js — ¿falta compilar el web (NEXT_OUTPUT=standalone) antes de correr este smoke?`
      : `revisados ${scriptTexts.length}/${chunkPaths.length} chunks bajo /_next/static`,
  );
}

async function main() {
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

  // ── A · falla cerrada ─────────────────────────────────────────────────────
  console.log('Smoke de arranque productivo\n');
  console.log('A · configuración productiva incompleta debe MATAR el arranque');

  /**
   * Arranca con una configuración productiva inválida y exige DOS cosas: que
   * el proceso muera y que el motivo esté escrito. Un arranque que muere sin
   * decir por qué obliga a bisectar variables de entorno a las 3 de la
   * mañana.
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

  bootExpectingFailure(
    'sin IDENTITY_MFA_ENCRYPTION_KEY no arranca (el secreto TOTP quedaría legible en un volcado)',
    {
      DATABASE_URL,
      SYNCHRONIZE: 'false',
      IDENTITY_MFA_ENCRYPTION_KEY: '',
    },
    /IDENTITY_MFA_ENCRYPTION_KEY/,
  );

  // El guarda de `OUTBOX_DISPATCHER_ENABLED` NO se puede ejercer aquí: vive en
  // `onApplicationBootstrap`, o sea DESPUÉS de conectar, y con
  // NODE_ENV=production la conexión exige TLS que el PostgreSQL efímero no
  // sirve. Lo que se observaría sería un error de conexión, no el guarda.
  // Está cubierto por `modules/commercial/outbox-worker.service.spec.ts`;
  // fingir aquí una comprobación que en realidad mide otra cosa sería peor
  // que no tenerla.

  // ── B, C, D · proceso vivo ────────────────────────────────────────────────
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

  // ── E · activos estáticos del web (opcional) ─────────────────────────────
  await runWebAssetsSmoke({
    baseUrl: process.env.SMOKE_WEB_BASE_URL,
    expectedApiUrl: process.env.NEXT_PUBLIC_API_URL,
  });

  console.log('');
  if (failed) {
    console.error(`${failed} comprobación(es) fallidas. Log del API:`);
    console.error(log.join('').slice(-4000));
    process.exit(1);
  }
  console.log(
    `${results.filter((r) => !r.skipped).length} comprobaciones OK. Arranque productivo verificado.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
