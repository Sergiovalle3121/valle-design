import { strict as assert } from "node:assert";
import {
  browserErrorReporter,
  buildEnvelope,
  createClientErrorReporter,
  envelopeEndpoint,
  isNoise,
  parseSentryDsn,
  REDACTED,
  scrubPageUrl,
  scrubText,
  sentryOrigin,
  toClientErrorReport,
} from "./client-error-reporter";

/**
 * El reporte de errores del navegador: apagado sin DSN, saneado siempre y con
 * techo. Lo que se afirma aquí es lo que no puede fallar en producción —que
 * un token de enlace o un correo no salgan, y que un error en bucle no se
 * vuelva mil peticiones—, sin red: `fetch` se inyecta.
 *
 * Correr:  npx tsx src/lib/observability/client-error-reporter.spec.ts
 */

const DSN_RAW = "https://clavepublica123@o42.ingest.sentry.io/4507";
const dsn = parseSentryDsn(DSN_RAW)!;

// ── El DSN ────────────────────────────────────────────────────────────────
assert.deepEqual(dsn, { publicKey: "clavepublica123", host: "o42.ingest.sentry.io", projectId: "4507", protocol: "https", path: "" });
assert.equal(parseSentryDsn(""), null);
assert.equal(parseSentryDsn(undefined), null);
assert.equal(parseSentryDsn("no es una url"), null);
assert.equal(parseSentryDsn("https://o42.ingest.sentry.io/4507"), null, "sin clave pública no hay DSN");
assert.equal(parseSentryDsn("https://clave@o42.ingest.sentry.io/proyecto"), null, "el proyecto es numérico");
assert.equal(parseSentryDsn("https://k@sentry.midominio.mx/interno/12")!.path, "/interno");
assert.equal(sentryOrigin(DSN_RAW), "https://o42.ingest.sentry.io");
assert.equal(sentryOrigin(""), "");

// La autenticación va en la query y la petición es «simple» (sin preflight).
assert.equal(
  envelopeEndpoint(dsn),
  "https://o42.ingest.sentry.io/api/4507/envelope/?sentry_key=clavepublica123&sentry_version=7&sentry_client=vallecad-web%2F1",
);

// ── Sin DSN no hay reporter (y en Node no hay `window`) ──────────────────
assert.equal(browserErrorReporter(), null);

// ── El saneo ──────────────────────────────────────────────────────────────
const sucio = [
  "No se pudo abrir el enlace vdrl_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  "de ana.lopez@despacho.mx",
  "documento 3f2c9a1e-8b7d-4c6e-9f0a-1b2c3d4e5f60",
  "manage vddm_q1w2e3r4t5y6u7i8o9p0asdfghjk",
  "Authorization: Bearer abcdefghijklmnop",
  "token=secreto-de-verdad",
].join(" · ");
const limpio = scrubText(sucio);
for (const fuga of ["vdrl_", "ana.lopez", "despacho.mx", "3f2c9a1e", "vddm_", "abcdefghijklmnop", "secreto-de-verdad"]) {
  assert.ok(!limpio.includes(fuga), `«${fuga}» no puede salir: ${limpio}`);
}
assert.ok(limpio.includes(REDACTED));
assert.ok(scrubText("x".repeat(5_000)).length < 2_100, "un mensaje enorme se trunca");

// De la página sólo sale la ruta: el token de revisión vive en el fragmento.
assert.equal(scrubPageUrl("https://vallecad.com/revision#t=vdrl_AbCdEfGhIjKlMnOpQrSt"), "https://vallecad.com/revision");
assert.equal(scrubPageUrl("https://vallecad.com/login?returnTo=/studio/x&email=a@b.mx"), "https://vallecad.com/login");
assert.equal(
  scrubPageUrl("https://vallecad.com/studio/3f2c9a1e-8b7d-4c6e-9f0a-1b2c3d4e5f60"),
  `https://vallecad.com/studio/${REDACTED}`,
);
assert.equal(scrubPageUrl("no es url"), "");

// ── El ruido ──────────────────────────────────────────────────────────────
assert.ok(isNoise(toClientErrorReport(new Error("ResizeObserver loop completed with undelivered notifications."), "window.error")));
assert.ok(isNoise(toClientErrorReport("Script error.", "window.error")));
const deExtension = new Error("boom");
deExtension.stack = "Error: boom\n    at x (chrome-extension://abcdef/content.js:1:1)";
assert.ok(isNoise(toClientErrorReport(deExtension, "window.error")));
const abortada = new Error("The operation was aborted.");
abortada.name = "AbortError";
assert.ok(isNoise(toClientErrorReport(abortada, "unhandledrejection")));
assert.ok(!isNoise(toClientErrorReport(new TypeError("Cannot read properties of undefined"), "window.error")));

// Un rechazo con algo que no es Error sigue siendo legible.
assert.deepEqual(toClientErrorReport({ code: 42 }, "unhandledrejection"), {
  kind: "NonError",
  message: '{"code":42}',
  source: "unhandledrejection",
});

// ── El envelope ───────────────────────────────────────────────────────────
const error = new TypeError("Cannot read properties of undefined (reading 'layer') de ana@x.mx");
const envelope = buildEnvelope(toClientErrorReport(error, "error-boundary", { zone: "Propiedades", digest: "123abc" }), {
  dsn,
  environment: "production",
  pageUrl: scrubPageUrl("https://vallecad.com/studio/3f2c9a1e-8b7d-4c6e-9f0a-1b2c3d4e5f60?x=1"),
  userAgent: "Mozilla/5.0",
  now: new Date("2026-09-25T06:00:00Z"),
  eventId: "0".repeat(32),
});
const [cabecera, item, payload, final] = envelope.split("\n");
assert.equal(final, "", "el envelope termina en salto de línea");
assert.deepEqual(JSON.parse(cabecera), { event_id: "0".repeat(32), sent_at: "2026-09-25T06:00:00.000Z" });
assert.equal(JSON.parse(item).type, "event");
assert.equal(JSON.parse(item).length, new TextEncoder().encode(payload).length);
const event = JSON.parse(payload);
assert.equal(event.platform, "javascript");
assert.equal(event.exception.values[0].type, "TypeError");
assert.ok(!event.exception.values[0].value.includes("ana@x.mx"));
assert.equal(event.request.url, `https://vallecad.com/studio/${REDACTED}`);
assert.deepEqual(event.tags, { source: "error-boundary", route: `/studio/${REDACTED}`, digest: "123abc", zona: "Propiedades" });
assert.ok(!envelope.includes("clavepublica123"), "la clave va en la URL, no en el cuerpo");

// ── El reporter: sin repetidos, con techo, sin lanzar ─────────────────────
void (async () => {
  const envios: Array<{ url: string; body: string; keepalive?: boolean; headers: Record<string, string> }> = [];
  const reporter = createClientErrorReporter({
    dsn,
    environment: "production",
    maxPerPage: 3,
    fetchImpl: async (url, init) => {
      envios.push({ url, ...init });
      return { ok: true };
    },
    pageUrl: () => "https://vallecad.com/dashboard?tab=1",
    now: () => new Date("2026-09-25T06:00:00Z"),
    eventId: () => "f".repeat(32),
  });
  const mismo = new Error("fallo en bucle");
  assert.equal(reporter.report(toClientErrorReport(mismo, "window.error")), true);
  assert.equal(reporter.report(toClientErrorReport(mismo, "window.error")), false, "el mismo error no se repite");
  assert.equal(reporter.report(toClientErrorReport("Script error.", "window.error")), false, "el ruido no sale");
  assert.equal(reporter.report(toClientErrorReport(new Error("dos"), "window.error")), true);
  assert.equal(reporter.report(toClientErrorReport(new Error("tres"), "window.error")), true);
  assert.equal(reporter.report(toClientErrorReport(new Error("cuatro"), "window.error")), false, "techo por página");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(envios.length, 3);
  assert.equal(envios[0].url, envelopeEndpoint(dsn));
  assert.equal(envios[0].keepalive, true);
  assert.equal(envios[0].headers["Content-Type"], "text/plain;charset=UTF-8");
  assert.ok(envios[0].body.includes('"url":"https://vallecad.com/dashboard"'));

  // Si Sentry no contesta, nadie se entera.
  const caido = createClientErrorReporter({
    dsn,
    environment: "production",
    fetchImpl: async () => {
      throw new Error("Failed to fetch");
    },
  });
  assert.equal(caido.report(toClientErrorReport(new Error("x"), "window.error")), true);
  const sincrono = createClientErrorReporter({
    dsn,
    environment: "production",
    fetchImpl: () => {
      throw new Error("fetch síncrono roto");
    },
  });
  assert.equal(sincrono.report(toClientErrorReport(new Error("y"), "window.error")), true);
  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log("client-error-reporter: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
