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
import {
  ASSET_CONTENT_TYPES,
  WEB_PUBLIC_DIR,
  bundleContainsApiUrl,
  discoverExpectedWebAssets,
  evaluateAssetResponse,
  extractScriptUrls,
  runWebAssetsSmoke,
  selectSmokeAssets,
} from './production-startup-smoke.mjs';

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

// ─── extractScriptUrls / bundleContainsApiUrl ────────────────────────────────

{
  const html = `<!doctype html><html><head>
    <script src="/_next/static/chunks/main-abc123.js"></script>
    <script src="https://cdn.example.com/otro.js" defer></script>
  </head><body></body></html>`;
  const urls = extractScriptUrls(html, 'http://127.0.0.1:3000');
  eq(
    urls,
    [
      'http://127.0.0.1:3000/_next/static/chunks/main-abc123.js',
      'https://cdn.example.com/otro.js',
    ],
    'resuelve src relativos contra baseUrl y conserva los absolutos',
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
    const fetchImpl = async (url) => {
      if (url === 'http://web.invalido') {
        return { status: 200, text: async () => '<html><body>ok, sin bundle</body></html>' };
      }
      return {
        status: 404,
        text: async () => 'Not Found',
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    await runWebAssetsSmoke({
      baseUrl: 'http://web.invalido',
      expectedApiUrl: 'https://api.tu-dominio.com',
      publicDir: WEB_PUBLIC_DIR,
      fetchImpl,
      checkFn,
      noteFn,
      assetLimit: 3,
    });
    const assetChecks = calls.filter((c) => c.name.includes('Content-Type'));
    ok(assetChecks.length > 0, 'se intentó al menos un activo');
    ok(
      assetChecks.every((c) => !c.ok),
      'CADA activo bajo apps/web/public reporta fallo cuando el servidor los 404ea — el rojo del hallazgo P0-D reproducido sin Docker',
    );
  }

  // VERDE: servidor que SÍ sirve public/ y embebe la URL del API correcta.
  {
    const { calls, checkFn, noteFn } = fakeCollector();
    const fetchImpl = async (url) => {
      if (url === 'http://web.arreglado') {
        return {
          status: 200,
          text: async () =>
            '<html><body><script src="/_next/static/chunks/main.js"></script></body></html>',
        };
      }
      if (url === 'http://web.arreglado/_next/static/chunks/main.js') {
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
    await runWebAssetsSmoke({
      baseUrl: 'http://web.arreglado',
      expectedApiUrl: 'https://api.tu-dominio.com',
      publicDir: WEB_PUBLIC_DIR,
      fetchImpl,
      checkFn,
      noteFn,
      assetLimit: 3,
    });
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
