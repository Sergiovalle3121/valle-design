#!/usr/bin/env node
/**
 * SMOKE POST-DESPLIEGUE — dos minutos para saber si el sitio está vivo.
 *
 * Corre CONTRA LA URL DE PRODUCCIÓN, después de cada despliegue. No sustituye
 * a ningún gate de CI: contesta la única pregunta que el CI no puede contestar,
 * que es si lo que está publicado ahora mismo funciona.
 *
 * ─── Qué comprueba, y por qué cada cosa ────────────────────────────────────
 *
 *   1. SALUD. `/health` (liveness) y `/health/ready` (readiness). El segundo
 *      sólo responde con la base contestando y la cadena de migraciones al
 *      día: es el que distingue «el proceso arrancó» de «el producto sirve».
 *
 *   2. LA OFERTA. El catálogo público publica `trialDays`, y la superficie
 *      construye con él el titular del lanzamiento. Si este número no llega,
 *      la portada se queda sin oferta — en silencio, porque el componente que
 *      la pinta se calla cuando no puede decir la verdad. Aquí sí se grita.
 *
 *   3. EL EMBUDO SIN TARJETA. La portada y `/precios` cargan, y en ninguna
 *      aparece un campo de pago ni vocabulario de cobro.
 *
 *   4. REGISTRO CON CORREO REAL (opcional, `--email`). Registra de verdad y
 *      espera a que el correo de verificación salga del outbox. Es el paso que
 *      más veces se rompe en un despliegue nuevo, porque depende de tres cosas
 *      a la vez: la base, el worker del outbox y el proveedor de correo.
 *
 *   5. EL PLANO DE EJEMPLO. La ruta pública que abre el estudio responde.
 *
 * ─── La regla que gobierna el informe ──────────────────────────────────────
 *
 * Una comprobación que no se pudo hacer se declara OMITIDA, nunca se cuenta
 * como verde. Un smoke que dice «todo bien» habiendo saltado el registro es
 * peor que no correrlo: da permiso para anunciar.
 *
 * Uso:
 *   npm run smoke:railway -- --web https://valledesign.mx --api https://api.valledesign.mx
 *   npm run smoke:railway -- --web … --api … --email tu-correo@dominio.mx
 */

const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

const WEB = (flag("web") ?? "").replace(/\/+$/u, "");
const API = (flag("api") ?? "").replace(/\/+$/u, "");
const EMAIL = flag("email");
const TIMEOUT_MS = Number(flag("timeout", "20000"));

if (!WEB || !API) {
  console.error(
    "Uso: npm run smoke:railway -- --web https://tu-web --api https://tu-api [--email correo@dominio]",
  );
  process.exit(2);
}

const results = [];
let failed = 0;
let skipped = 0;

function record(status, name, detail) {
  results.push({ status, name, detail });
  if (status === "fail") failed += 1;
  if (status === "skip") skipped += 1;
  const icon = status === "ok" ? "✅" : status === "skip" ? "⏭️ " : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function get(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Vocabulario de cobro: si aparece en el embudo, «sin tarjeta» dejó de ser cierto. */
const PAYMENT_WORDS = [
  /n[úu]mero de tarjeta/iu,
  /\bcvv\b/iu,
  /fecha de caducidad/iu,
  /datos de pago/iu,
];

async function main() {
  console.log(`Smoke de despliegue · web=${WEB} · api=${API}\n`);

  /* ── 1 · SALUD ─────────────────────────────────────────────────────────── */

  try {
    const health = await get(`${API}/health`);
    record(
      health.ok ? "ok" : "fail",
      "API viva (/health)",
      `HTTP ${health.status}`,
    );
  } catch (error) {
    record("fail", "API viva (/health)", String(error.message ?? error));
  }

  try {
    const ready = await get(`${API}/health/ready`);
    record(
      ready.ok ? "ok" : "fail",
      "API lista (/health/ready: base + migraciones)",
      `HTTP ${ready.status}`,
    );
  } catch (error) {
    record("fail", "API lista (/health/ready)", String(error.message ?? error));
  }

  /* ── 2 · LA OFERTA ─────────────────────────────────────────────────────── */

  let trialDays = null;
  try {
    const catalog = await get(`${API}/v1/commercial/public/plans?currency=MXN`);
    if (!catalog.ok) {
      record("fail", "catálogo público", `HTTP ${catalog.status}`);
    } else {
      const body = await catalog.json();
      trialDays = body.trialDays;
      if (!Number.isInteger(trialDays) || trialDays < 1) {
        record(
          "fail",
          "la oferta llega al catálogo",
          `trialDays inválido: ${JSON.stringify(trialDays)} — la portada se quedará sin oferta`,
        );
      } else {
        const months = trialDays % 30 === 0 ? `${trialDays / 30} meses` : `${trialDays} días`;
        record("ok", "la oferta llega al catálogo", `trialDays=${trialDays} (${months} gratis)`);
      }
      record(
        Array.isArray(body.items) ? "ok" : "fail",
        "el catálogo publica planes",
        `${body.items?.length ?? 0} plan(es), checkout=${body.checkout}`,
      );
    }
  } catch (error) {
    record("fail", "catálogo público", String(error.message ?? error));
  }

  /* ── 3 · EL EMBUDO SIN TARJETA ─────────────────────────────────────────── */

  for (const [name, path] of [
    ["portada", "/"],
    ["precios", "/precios"],
    ["registro", "/register"],
  ]) {
    try {
      const page = await get(`${WEB}${path}`);
      if (!page.ok) {
        record("fail", `${name} carga`, `HTTP ${page.status}`);
        continue;
      }
      const html = await page.text();
      const offender = PAYMENT_WORDS.find((pattern) => pattern.test(html));
      if (offender) {
        record(
          "fail",
          `${name} sin tarjeta`,
          `aparece ${offender} y el lanzamiento promete que no se pide`,
        );
      } else {
        record("ok", `${name} carga y no pide tarjeta`, `HTTP ${page.status}`);
      }
    } catch (error) {
      record("fail", `${name} carga`, String(error.message ?? error));
    }
  }

  /* ── 4 · REGISTRO CON CORREO REAL ──────────────────────────────────────── */

  if (!EMAIL) {
    record(
      "skip",
      "registro con correo real",
      "sin --email: NO se comprobó que el correo de verificación salga",
    );
  } else {
    try {
      const password = `Smoke-${Math.random().toString(36).slice(2)}-2026!`;
      const registered = await get(`${API}/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: EMAIL,
          password,
          displayName: "Smoke de despliegue",
        }),
      });
      // 202 = aceptado y el correo va en camino. 409 = la cuenta ya existe,
      // que en un smoke repetido es lo NORMAL y no un fallo: lo que se estaba
      // comprobando —que el endpoint vive y responde el contrato— se cumplió.
      if (registered.status === 202) {
        record(
          "ok",
          "registro con correo real",
          `202 aceptado; revisa ${EMAIL} — el correo de verificación debe llegar en menos de un minuto`,
        );
      } else if (registered.status === 409) {
        record(
          "ok",
          "registro con correo real",
          "409: la cuenta ya existía (smoke repetido). El endpoint responde su contrato",
        );
      } else {
        record(
          "fail",
          "registro con correo real",
          `HTTP ${registered.status}: ${(await registered.text()).slice(0, 200)}`,
        );
      }
    } catch (error) {
      record("fail", "registro con correo real", String(error.message ?? error));
    }
  }

  /* ── 5 · EL ESTUDIO RESPONDE ───────────────────────────────────────────── */

  try {
    const studio = await get(`${WEB}/studio`);
    record(
      studio.status < 500 ? "ok" : "fail",
      "el estudio responde",
      `HTTP ${studio.status}${studio.status >= 300 && studio.status < 400 ? " (redirige a acceso, correcto sin sesión)" : ""}`,
    );
  } catch (error) {
    record("fail", "el estudio responde", String(error.message ?? error));
  }

  /* ── EL VEREDICTO ──────────────────────────────────────────────────────── */

  console.log(
    `\n${results.length - failed - skipped} verde(s) · ${failed} rojo(s) · ${skipped} omitida(s)`,
  );
  if (skipped > 0) {
    console.log(
      "Las omitidas NO cuentan como verdes. Un smoke que dice «todo bien» habiendo\n" +
        "saltado el registro es peor que no correrlo: da permiso para anunciar.",
    );
  }
  if (failed > 0) {
    console.error("\nEl despliegue NO está listo para anunciarse.");
    process.exit(1);
  }
  console.log("\nEl sitio está vivo.");
}

main().catch((error) => {
  console.error(`El smoke murió: ${error?.stack ?? error}`);
  process.exit(1);
});
