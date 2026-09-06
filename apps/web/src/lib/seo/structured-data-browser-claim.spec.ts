import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { softwareApplicationJsonLd } from "./structured-data";

/**
 * T-18b: el JSON-LD de la portada no puede afirmar un motor de navegador que
 * ningún proyecto de Playwright ejercita. El sitio le decía a Google que
 * Valle Design funciona en Safari sin que un solo proyecto WebKit corriera
 * jamás en CI — el claim más barato de escribir y el más caro de sostener
 * cuando alguien lo comprueba.
 *
 * Chrome, Edge, Brave y Opera comparten el motor Chromium: un único proyecto
 * "chromium" los respalda a todos. Firefox tiene el suyo. Safari corre sobre
 * WebKit y necesita SU PROPIO proyecto — no basta con que exista cualquiera.
 *
 * La regla, en los dos sentidos: si se declara un motor en el JSON-LD, tiene
 * que correr en `playwright.config.ts`; si un proyecto desaparece de la
 * configuración, el navegador correspondiente tiene que desaparecer del
 * claim. NO se soluciona este spec añadiendo un proyecto WebKit que no corre
 * de verdad en CI — eso sería fabricar la evidencia que el spec existe para
 * exigir.
 */
const ENGINE_OF_BROWSER: Record<string, "chromium" | "firefox" | "webkit"> = {
  Chrome: "chromium",
  Edge: "chromium",
  Firefox: "firefox",
  Safari: "webkit",
};

const config = readFileSync("playwright.config.ts", "utf8");
const projectEngines = new Set<"chromium" | "firefox" | "webkit">();
if (/devices\[["']Desktop Chrome["']\]/u.test(config)) {
  projectEngines.add("chromium");
}
if (/devices\[["']Desktop Firefox["']\]/u.test(config)) {
  projectEngines.add("firefox");
}
if (/devices\[["']Desktop Safari["']\]/u.test(config)) {
  projectEngines.add("webkit");
}
assert.ok(
  projectEngines.size > 0,
  "no se encontró ningún proyecto de Playwright reconocible en playwright.config.ts",
);

const jsonLd = softwareApplicationJsonLd({ description: "x", featureList: [] });
const operatingSystem = String(jsonLd.operatingSystem);
const claimedBrowsers = Object.keys(ENGINE_OF_BROWSER).filter((browser) =>
  operatingSystem.includes(browser),
);
assert.ok(
  claimedBrowsers.length > 0,
  "el claim de operatingSystem debe nombrar al menos un navegador",
);

for (const browser of claimedBrowsers) {
  const engine = ENGINE_OF_BROWSER[browser];
  assert.ok(
    projectEngines.has(engine),
    `el JSON-LD afirma "${browser}" (motor ${engine}) pero playwright.config.ts ` +
      "no declara ningún proyecto de ese motor: recorta el claim o añade el proyecto",
  );
}

// Y al revés: un motor que SÍ corre en CI y que el claim no menciona no es un
// error (el claim puede ser más conservador que la evidencia), así que esa
// dirección no se exige — sólo la que puede convertirse en una mentira.

console.log(
  `structured-data-browser-claim: ${claimedBrowsers.join(", ")} respaldados por proyectos reales de Playwright (${[...projectEngines].join(", ")})`,
);
