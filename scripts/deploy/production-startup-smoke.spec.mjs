#!/usr/bin/env node
/**
 * Spec del bloque E del smoke de arranque — activos estáticos del web.
 *
 * El bloque A-D de este smoke arranca un proceso real (`apps/api/dist`) y no
 * se puede probar sin él; esta spec cubre la parte que SÍ es lógica pura:
 * qué activos hay que pedir, qué respuesta cuenta como "sirvió el archivo" y
 * si el bundle servido lleva la URL del API correcta.
 *
 * El caso rojo concreto (hallazgo P0-D): un contenedor construido con el
 * `apps/web/Dockerfile` original respondía 200 en `/` — el healthcheck que
 * ya existía pasaba — y 404 en `/wasm/valle-cad-kernel.wasm` y en
 * `/brand/*.svg`. `runWebAssetsSmoke` se ejercita aquí con un `fetchImpl`
 * falso que reproduce EXACTAMENTE esa respuesta, sin Docker ni red.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ASSET_CONTENT_TYPES,
  WEB_PUBLIC_DIR,
  bundleContainsApiUrl,
  discoverExpectedWebAssets,
  discoverStaticChunkUrls,
  evaluateAssetResponse,
  runWebAssetsSmoke,
  selectSmokeAssets,
} from './production-startup-smoke.mjs';

/**
 * Fixture aislada para `discoverStaticChunkUrls` / `runWebAssetsSmoke`: un
 * directorio temporal con la forma de `apps/web/.next/static` (subcarpeta
 * `chunks/` con los `.js` que se piden). Aislada del build real del repo a
 * propósito — esta spec no debe depender de si `apps/web/.next/static`
 * existe o de qué contiene en la máquina donde corre.
 */
function makeFixtureStaticDir(chunkNames) {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-static-'));
  const chunksDir = join(dir, 'chunks');
  mkdirSync(chunksDir, { recursive: true });
  for (const name of chunkNames) {
    writeFileSync(join(chunksDir, name), '// fixture — el contenido real lo pone fetchImpl');
  }
  return dir;
}

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

// ─── discoverExpectedWebAssets: contra el árbol REAL del repo ──────────────

{
  const assets = discoverExpectedWebAssets(WEB_PUBLIC_DIR);
  const paths = assets.map((a) => a.urlPath);

  ok(
    paths.includes('/wasm/valle-cad-kernel.wasm'),
    'descubre el kernel WASM real bajo apps/web/public/wasm',
  );
  ok(
    assets.find((a) => a.urlPath === '/wasm/valle-cad-kernel.wasm').contentType ===
      'application/wasm',
    'el kernel WASM se etiqueta application/wasm',
  );
  ok(
    paths.includes('/brand/isotipo-oscuro.svg'),
    'descubre el SVG de marca que layout.tsx y manifest.ts referencian',
  );
  ok(
    assets.find((a) => a.urlPath === '/brand/isotipo-oscuro.svg').contentType ===
      'image/svg+xml',
    'un SVG se etiqueta image/svg+xml',
  );
  ok(
    paths.includes('/product/estudio-dark.png'),
    'descubre las capturas de producto (page.tsx, FirstMinute.tsx las sirven)',
  );
  ok(
    !paths.includes('/product/MANIFIESTO.md'),
    'MANIFIESTO.md NO se marca "esperado": ninguna página lo referencia y .dockerignore lo excluye a propósito — tratarlo como activo produciría un rojo que no es un bug',
  );
}

{
  // Directorio inexistente: no explota, devuelve vacío.
  eq(
    discoverExpectedWebAssets('/ruta/que/no/existe/en/ningun/lado'),
    [],
    'un publicDir inexistente devuelve lista vacía, no lanza',
  );
}

// ─── selectSmokeAssets ───────────────────────────────────────────────────────

{
  const assets = [
    { urlPath: '/product/a.png', contentType: 'image/png' },
    { urlPath: '/product/b.png', contentType: 'image/png' },
    { urlPath: '/wasm/valle-cad-kernel.wasm', contentType: 'application/wasm' },
    { urlPath: '/brand/x.svg', contentType: 'image/svg+xml' },
    { urlPath: '/brand/y.svg', contentType: 'image/svg+xml' },
  ];
  const selected = selectSmokeAssets(assets, 2).map((a) => a.urlPath);
  ok(
    selected.includes('/wasm/valle-cad-kernel.wasm'),
    'el WASM siempre entra aunque el límite sea menor que la lista completa',
  );
  ok(
    selected.includes('/brand/x.svg'),
    'al menos un SVG siempre entra aunque el límite sea menor que la lista completa',
  );
}

{
  eq(selectSmokeAssets([], 8), [], 'sin activos, selecciona lista vacía sin lanzar');
}

// ─── evaluateAssetResponse ────────────────────────────────────────────────────

const wasmAsset = { urlPath: '/wasm/valle-cad-kernel.wasm', contentType: 'application/wasm' };

{
  // ROJO reproducido: exactamente lo que el Dockerfile pre-arreglo producía.
  const result = evaluateAssetResponse(wasmAsset, 404, undefined, 0);
  eq(
    result,
    { ok: false, detail: '/wasm/valle-cad-kernel.wasm respondió 404' },
    '404 se marca como fallo — el rojo del hallazgo P0-D',
  );
}

{
  const result = evaluateAssetResponse(wasmAsset, 200, 'application/wasm', 31435);
  eq(result, { ok: true, detail: '' }, '200 + Content-Type correcto + cuerpo no vacío es un pase');
}

{
  const result = evaluateAssetResponse(wasmAsset, 200, 'application/wasm', 0);
  ok(!result.ok, 'un 200 con cuerpo vacío no es un pase (el archivo "existe" pero está truncado/vacío)');
}

{
  const result = evaluateAssetResponse(wasmAsset, 200, 'text/html; charset=utf-8', 512);
  ok(
    !result.ok,
    'un 200 con Content-Type equivocado no es un pase (típico de un fallback SPA que sirve index.html para todo)',
  );
}

{
  const result = evaluateAssetResponse(wasmAsset, 500, 'application/wasm', 31435);
  ok(!result.ok, 'un 500 no es un 404 pero tampoco es un pase');
}

// ─── discoverStaticChunkUrls / bundleContainsApiUrl ──────────────────────────

{
  const dir = makeFixtureStaticDir(['main-abc123.js', 'polyfills-xyz.js']);
  try {
    const urls = discoverStaticChunkUrls(dir);
    eq(
      urls,
      ['/_next/static/chunks/main-abc123.js', '/_next/static/chunks/polyfills-xyz.js'],
      'descubre cada .js bajo staticDir y arma la ruta pública /_next/static/... — sin mirar qué página los enlaza',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  // El build-id vive en su propia subcarpeta (junto a `chunks/`) y también
  // puede llevar .js — discoverStaticChunkUrls debe bajar ahí también, y
  // debe ignorar lo que no es .js (p. ej. un .js.map).
  const dir = makeFixtureStaticDir([]);
  mkdirSync(join(dir, 'abuildid123'), { recursive: true });
  writeFileSync(join(dir, 'abuildid123', '_buildManifest.js'), '//');
  writeFileSync(join(dir, 'abuildid123', '_buildManifest.js.map'), '//');
  try {
    eq(
      discoverStaticChunkUrls(dir),
      ['/_next/static/abuildid123/_buildManifest.js'],
      'recorre subdirectorios (el del buildId) y descarta archivos que no son .js',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  eq(
    discoverStaticChunkUrls('/ruta/que/no/existe/en/ningun/lado'),
    [],
    'un staticDir inexistente devuelve lista vacía, no lanza',
  );
}

{
  ok(
    bundleContainsApiUrl(
      ['const x=1;', 'fetch("https://api.tu-dominio.com/v1/health")'],
      'https://api.tu-dominio.com',
    ),
    'encuentra la URL embebida cuando SÍ está en alguno de los bundles',
  );
  ok(
    !bundleContainsApiUrl(['const x=1;', 'fetch("https://otro-host.example/v1")'], 'https://api.tu-dominio.com'),
    'no la encuentra cuando ningún bundle la contiene',
  );
}

for (const [ext, mime] of Object.entries(ASSET_CONTENT_TYPES)) {
  ok(typeof mime === 'string' && mime.includes('/'), `${ext} declara un MIME válido`);
}

// ─── runWebAssetsSmoke: integración con fetchImpl falso (sin red) ───────────

function fakeCollector() {
  const calls = [];
  const notes = [];
  return {
    calls,
    notes,
    checkFn: (name, passed, detail) => calls.push({ name, ok: passed, detail }),
    noteFn: (message) => notes.push(message),
  };
}

async function run() {
  // Sin SMOKE_WEB_BASE_URL: se anota como no ejercido, no se llama checkFn.
  {
    const { calls, notes, checkFn, noteFn } = fakeCollector();
    await runWebAssetsSmoke({ baseUrl: undefined, expectedApiUrl: 'https://api.x', checkFn, noteFn });
    eq(calls, [], 'sin baseUrl no se ejecuta ninguna comprobación');
    ok(notes.length === 1, 'sin baseUrl se deja UNA nota explicando por qué no se midió nada');
  }

  // ROJO reproducido de punta a punta: el contenedor construido con el
  // Dockerfile original — `/` responde 200 (pasa el healthcheck existente),
  // pero todo lo que vive bajo `apps/web/public` responde 404.
  {
    const { calls, checkFn, noteFn } = fakeCollector();
    // staticDir vacío a propósito: esta spec no depende de si
    // apps/web/.next/static existe (o qué contiene) en la máquina que corre.
    const staticDir = makeFixtureStaticDir([]);
    const fetchImpl = async (url) => {
      if (url === 'http://web.invalido') {
        return { status: 200 };
      }
      return {
        status: 404,
        text: async () => 'Not Found',
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    try {
      await runWebAssetsSmoke({
        baseUrl: 'http://web.invalido',
        expectedApiUrl: 'https://api.tu-dominio.com',
        publicDir: WEB_PUBLIC_DIR,
        staticDir,
        fetchImpl,
        checkFn,
        noteFn,
        assetLimit: 3,
      });
    } finally {
      rmSync(staticDir, { recursive: true, force: true });
    }
    const assetChecks = calls.filter((c) => c.name.includes('Content-Type'));
    ok(assetChecks.length > 0, 'se intentó al menos un activo');
    ok(
      assetChecks.every((c) => !c.ok),
      'CADA activo bajo apps/web/public reporta fallo cuando el servidor los 404ea — el rojo del hallazgo P0-D reproducido sin Docker',
    );
  }

  // VERDE: servidor que SÍ sirve public/ y embebe la URL del API correcta —
  // en un chunk que `/` NO enlaza (su HTML no trae ningún <script src>), tal
  // como pasa de verdad: NEXT_PUBLIC_API_URL sólo la usa código de
  // dashboard/CAD/comercial, nunca la landing. Si este caso pasa es porque
  // el chequeo ya no depende de qué referencia `/`.
  {
    const { calls, checkFn, noteFn } = fakeCollector();
    const staticDir = makeFixtureStaticDir(['main-abc123.js']);
    const fetchImpl = async (url) => {
      if (url === 'http://web.arreglado') {
        return { status: 200 }; // sin <script src>: la landing no referencia el chunk
      }
      if (url === 'http://web.arreglado/_next/static/chunks/main-abc123.js') {
        return { status: 200, text: async () => 'fetch("https://api.tu-dominio.com/v1/health")' };
      }
      // cualquier otra cosa es un activo de apps/web/public: se sirve bien,
      // con el Content-Type real según extensión (no una adivinanza fija:
      // qué activo cae en el tope de `assetLimit` depende del contenido real
      // de apps/web/public, y esta spec no debe romperse si ese árbol crece).
      const mimeByExt = { '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
      const ext = url.slice(url.lastIndexOf('.'));
      return {
        status: 200,
        headers: { get: (name) => (name === 'content-type' ? mimeByExt[ext] ?? null : null) },
        arrayBuffer: async () => new ArrayBuffer(128),
      };
    };
    try {
      await runWebAssetsSmoke({
        baseUrl: 'http://web.arreglado',
        expectedApiUrl: 'https://api.tu-dominio.com',
        publicDir: WEB_PUBLIC_DIR,
        staticDir,
        fetchImpl,
        checkFn,
        noteFn,
        assetLimit: 3,
      });
    } finally {
      rmSync(staticDir, { recursive: true, force: true });
    }
    ok(calls.length > 0, 'se ejecutaron comprobaciones');
    ok(
      calls.every((c) => c.ok),
      `con el servidor arreglado todas las comprobaciones pasan: ${JSON.stringify(calls.filter((c) => !c.ok))}`,
    );
    ok(
      calls.some((c) => c.name.includes('NEXT_PUBLIC_API_URL')),
      'se verificó explícitamente la presencia de NEXT_PUBLIC_API_URL embebida',
    );
  }

  // NEGRO: el servidor sirve todos los chunks con 200, pero NINGUNO contiene
  // el literal de NEXT_PUBLIC_API_URL (build apuntado a otro origen, o
  // Dockerfile que perdió el ARG). El chequeo debe FALLAR — este es
  // exactamente el caso que el bug reportado no distinguía del caso VERDE:
  // antes de este fix, el chequeo fallaba SIEMPRE (incluso en el caso VERDE
  // de arriba), así que nunca demostraba nada. Ahora sí depende del
  // contenido real.
  {
    const { calls, checkFn, noteFn } = fakeCollector();
    const staticDir = makeFixtureStaticDir(['main-sinapi.js']);
    const fetchImpl = async (url) => {
      if (url === 'http://web.otro-origen') {
        return { status: 200 };
      }
      if (url === 'http://web.otro-origen/_next/static/chunks/main-sinapi.js') {
        return { status: 200, text: async () => 'fetch("https://otro-origen.example/v1/health")' };
      }
      const mimeByExt = { '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
      const ext = url.slice(url.lastIndexOf('.'));
      return {
        status: 200,
        headers: { get: (name) => (name === 'content-type' ? mimeByExt[ext] ?? null : null) },
        arrayBuffer: async () => new ArrayBuffer(128),
      };
    };
    try {
      await runWebAssetsSmoke({
        baseUrl: 'http://web.otro-origen',
        expectedApiUrl: 'https://api.tu-dominio.com',
        publicDir: WEB_PUBLIC_DIR,
        staticDir,
        fetchImpl,
        checkFn,
        noteFn,
        assetLimit: 3,
      });
    } finally {
      rmSync(staticDir, { recursive: true, force: true });
    }
    const apiCheck = calls.find((c) => c.name.includes('NEXT_PUBLIC_API_URL'));
    ok(
      apiCheck !== undefined && apiCheck.ok === false,
      'con un build que apunta a otro origen (o sin la variable incrustada), el chequeo de NEXT_PUBLIC_API_URL FALLA explícitamente',
    );
  }

  // Adversarial: sin expectedApiUrl (operador olvidó pasar NEXT_PUBLIC_API_URL
  // al smoke) el chequeo del bundle debe FALLAR, no omitirse en silencio.
  {
    const { calls, checkFn, noteFn } = fakeCollector();
    const fetchImpl = async () => ({
      status: 200,
      text: async () => '<html></html>',
      headers: { get: () => 'image/svg+xml' },
      arrayBuffer: async () => new ArrayBuffer(64),
    });
    await runWebAssetsSmoke({
      baseUrl: 'http://web.sin-env',
      expectedApiUrl: undefined,
      publicDir: WEB_PUBLIC_DIR,
      fetchImpl,
      checkFn,
      noteFn,
      assetLimit: 1,
    });
    const apiCheck = calls.find((c) => c.name.includes('NEXT_PUBLIC_API_URL'));
    ok(
      apiCheck !== undefined && apiCheck.ok === false,
      'sin NEXT_PUBLIC_API_URL en el entorno del smoke, la comprobación del bundle FALLA explícitamente en vez de omitirse',
    );
  }

  console.log(`Spec del bloque E del smoke de arranque OK: ${checks} comprobaciones.`);
}

await run();
