/**
 * Lo que este spec defiende es una propiedad de SEGURIDAD, no de comodidad:
 * que el token de un enlace de revisión —una credencial que abre un plano—
 * deje de estar en la barra de direcciones en cuanto se lee, y que nunca se
 * escriba donde sobreviva al cierre de la pestaña.
 */
import assert from "node:assert/strict";
import {
  REVIEW_TOKEN_SESSION_KEY,
  forgetReviewToken,
  peekReviewToken,
  sweepReviewToken,
  takeReviewToken,
  type ReviewTokenEnvironment,
} from "./review-token";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function environment(href: string, seeded: Record<string, string> = {}) {
  const session = new Map(Object.entries(seeded));
  const replaced: string[] = [];
  const env: ReviewTokenEnvironment = {
    href,
    replaceUrl: (next) => replaced.push(next),
    readSession: (key) => session.get(key) ?? null,
    writeSession: (key, value) => void session.set(key, value),
    removeSession: (key) => void session.delete(key),
  };
  return { env, session, replaced };
}

// ── El camino normal: el enlace trae el token en el fragmento ───────────────
const fragment = environment("https://app.valle/revision#cadReview=vdrl_abc123");
ok(takeReviewToken(fragment.env) === "vdrl_abc123", "el token se lee del fragmento");
ok(
  fragment.replaced.length === 1 && !fragment.replaced[0].includes("vdrl_abc123"),
  "y desaparece de la barra de direcciones de inmediato",
);
ok(
  fragment.session.get(REVIEW_TOKEN_SESSION_KEY) === "vdrl_abc123",
  "queda en sessionStorage, que muere con la pestaña",
);
ok(fragment.session.size === 1, "y en ningún otro sitio");

// ── Recargar mantiene la revisión sin volver a exponer nada ─────────────────
const reload = environment("https://app.valle/revision", {
  [REVIEW_TOKEN_SESSION_KEY]: "vdrl_abc123",
});
ok(takeReviewToken(reload.env) === "vdrl_abc123", "una recarga recupera el token");
ok(reload.replaced.length === 0, "sin token en la URL no se toca la barra");

// ── La query string heredada: se acepta SÓLO para borrarla ──────────────────
const query = environment("https://app.valle/revision?cadReview=vdrl_viejo&x=1");
ok(takeReviewToken(query.env) === "vdrl_viejo", "se lee el parámetro heredado");
ok(
  query.replaced.length === 1 &&
    !query.replaced[0].includes("vdrl_viejo") &&
    query.replaced[0].includes("x=1"),
  "se borra de la URL conservando el resto de la query",
);

// Otros parámetros del fragmento sobreviven: la limpieza es quirúrgica.
const mixed = environment("https://app.valle/revision#cadReview=t1&vista=planta");
takeReviewToken(mixed.env);
ok(
  mixed.replaced[0].includes("vista=planta") && !mixed.replaced[0].includes("t1"),
  "sólo se quita el token, no el resto del fragmento",
);

// ── Casos vacíos ────────────────────────────────────────────────────────────
const none = environment("https://app.valle/revision");
ok(takeReviewToken(none.env) === null, "sin token no se inventa ninguno");
const blank = environment("https://app.valle/revision#cadReview=");
ok(takeReviewToken(blank.env) === null, "un token vacío es ningún token");
ok(blank.replaced.length === 1, "y aun así se limpia la barra");
ok(
  blank.session.size === 0,
  "un token vacío NO se guarda: si no, la recarga leería la cadena vacía",
);

// El token se lee tal cual llegó, sin des-escapar de más: los tokens del
// servidor son `vdrl_` + base64url y no llevan caracteres que codificar.
const encoded = environment("https://app.valle/revision#cadReview=vdrl_A-B_c");
ok(takeReviewToken(encoded.env) === "vdrl_A-B_c", "el token no se corrompe al leerlo");

// ── Olvidar ────────────────────────────────────────────────────────────────
const stored = environment("https://app.valle/revision", {
  [REVIEW_TOKEN_SESSION_KEY]: "vdrl_muerto",
});
forgetReviewToken(stored.env);
ok(stored.session.size === 0, "un enlace revocado se olvida por completo");
ok(takeReviewToken(stored.env) === null, "y no vuelve tras olvidarlo");

// ── Una URL rota no revienta la página del cliente ─────────────────────────
const broken = environment("no-es-una-url");
ok(takeReviewToken(broken.env) === null, "una href inservible devuelve null, no una excepción");

// ── Leer NO es limpiar ──────────────────────────────────────────────────────
// El visor de revisión decide su primera pantalla con el token, así que lo lee
// mientras React renderiza. Si esa lectura tocara `history`, estaría
// actualizando el Router de Next en mitad del render de otro componente —React
// lo avisa por consola y en modo concurrente puede repetirlo—. Por eso `peek`
// es puro y el barrido va aparte, en un efecto.
const puro = environment("https://app.valle/revision#cadReview=vdrl_puro");
ok(peekReviewToken(puro.env) === "vdrl_puro", "peek devuelve el token");
ok(puro.replaced.length === 0, "peek NO toca la barra de direcciones");
ok(puro.session.size === 0, "peek NO escribe en la sesión");
ok(
  peekReviewToken(puro.env) === "vdrl_puro",
  "y leer dos veces da lo mismo: no consume nada",
);

sweepReviewToken(puro.env);
ok(puro.replaced.length === 1, "el barrido sí limpia la barra");
ok(puro.session.get(REVIEW_TOKEN_SESSION_KEY) === "vdrl_puro", "y guarda el token");
sweepReviewToken(puro.env);
ok(
  puro.replaced.length === 2,
  "barrer con la misma href vuelve a limpiar (el entorno real ya no lo trae)",
);

// Barrer una URL que nunca tuvo token no toca nada: el visor lo llama siempre.
const limpio = environment("https://app.valle/revision");
sweepReviewToken(limpio.env);
ok(
  limpio.replaced.length === 0 && limpio.session.size === 0,
  "sin token en la URL, barrer es una operación vacía",
);

console.log(`ok collab review-token: ${checks} comprobaciones`);
