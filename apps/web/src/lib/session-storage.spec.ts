/**
 * LA SESIÓN NO VIVE EN EL NAVEGADOR.
 *
 * La cookie de sesión es opaca, `HttpOnly` y first-party: ni `session.ts` ni el
 * contexto de identidad pueden leerla, y ése es justamente el punto. Un token
 * en `localStorage` es legible por cualquier script que entre en la página; una
 * cabecera `Authorization: Bearer` construida en el cliente implica que el
 * cliente tiene el secreto. Este spec impide que ninguna de las dos formas
 * vuelva por la puerta de atrás, ni en el producto ni en los fixtures.
 *
 * ── POR QUÉ LA REGLA DE LOS FIXTURES SE AFINÓ (2026-08-29) ──────────────────
 *
 * La versión anterior prohibía la palabra `localStorage` en TODO `e2e/`, sin
 * mirar qué se guardaba. Es una red de arrastre: pesca el token de sesión, que
 * es lo que se busca, y también la preferencia de tema — que vive en
 * `localStorage` por diseño del producto (`valle_theme`, la misma clave que lee
 * el script anti-flash de `layout.tsx`) y que un spec de accesibilidad necesita
 * fijar antes de la primera pintura para poder medir los dos temas.
 *
 * La regla no se relaja: se hace PRECISA. Sigue prohibido cualquier uso de
 * `localStorage` en los fixtures herméticos, con UNA excepción nombrada y
 * medida — la clave del tema. Cualquier otra clave, incluida una que se llame
 * `valle_session`, falla igual que antes.
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const session = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
const context = readFileSync(
  new URL("../contexts/DesignAuthContext.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(session, /localStorage|refresh_token|Authorization:\s*Bearer/);
assert.doesNotMatch(context, /localStorage|refresh_token|Authorization:\s*Bearer/);

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const e2eFiles = globSync("e2e/**/*.ts", {
  cwd: webRoot,
  ignore: ["e2e/real/**"],
});
const mockE2eSources = e2eFiles
  .map((file) => readFileSync(`${webRoot}/${file}`, "utf8"))
  .join("\n");

assert.doesNotMatch(
  mockE2eSources,
  /AXOS_SESSION_SECRET|axos_access_token|\bmasterJwt\b|\bloginAsMaster\b|Authorization:\s*Bearer/i,
  "Los fixtures Playwright herméticos deben usar cookies first-party y CSRF standalone.",
);

/**
 * La única clave de `localStorage` autorizada en los fixtures. No es una lista
 * abierta a propósito: cada entrada nueva tiene que justificarse aquí, y la
 * justificación de ésta es que el tema es una preferencia de presentación que
 * el propio producto guarda ahí, no una credencial.
 */
const CLAVES_PERMITIDAS = ["valle_theme"];

const usosDeStorage = e2eFiles.flatMap((file) => {
  const texto = readFileSync(`${webRoot}/${file}`, "utf8");
  return [...texto.matchAll(/\blocalStorage\b[^\n]{0,80}/g)].map((m) => ({
    file,
    fragmento: m[0],
  }));
});

const noAutorizados = usosDeStorage.filter(
  ({ fragmento }) => !CLAVES_PERMITIDAS.some((clave) => fragmento.includes(clave)),
);

assert.deepEqual(
  noAutorizados.map(({ file, fragmento }) => `${file}: ${fragmento.trim()}`),
  [],
  `Los fixtures herméticos sólo pueden tocar localStorage para ${CLAVES_PERMITIDAS.join(", ")}. ` +
    "La sesión viaja en cookie first-party; cualquier otra clave es una credencial escondida.",
);

console.log(
  `session-storage: la sesión no toca localStorage ni cabeceras Bearer ` +
    `(${usosDeStorage.length} uso(s) de storage en fixtures, todos de tema)`,
);
