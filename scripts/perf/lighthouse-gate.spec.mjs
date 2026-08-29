#!/usr/bin/env node
/**
 * Spec del gate de Lighthouse — la red bajo el medidor.
 *
 * Existe por un fallo concreto: `lhci collect` NO admite `--outputDir` —esa
 * opción es de `lhci upload --target=filesystem`— y yargs la ignora sin
 * protestar. Durante dos commits el gate midió bien y archivó nada, y el paso
 * de CI que subía los informes terminó en verde, en un segundo, con las manos
 * vacías. Un gate que mide y no publica no sirve, y aquí no había nada que
 * fallara al rojo para decirlo.
 *
 * Lo que se comprueba abajo es exactamente eso: que archivar SIN informes
 * fracasa, que el resumen sale de los informes de verdad y que la mediana es
 * mediana. Nada de esto necesita Chrome ni un build — son funciones puras sobre
 * ficheros, y por eso corre en un segundo delante del gate largo.
 *
 *   node --test scripts/perf/lighthouse-gate.spec.mjs
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { archivarPasada, mediana, resumirPasada } from "./lighthouse-gate.mjs";

const temporales = [];
function directorioTemporal() {
  const d = mkdtempSync(join(tmpdir(), "lh-gate-"));
  temporales.push(d);
  return d;
}
after(() => {
  for (const d of temporales) rmSync(d, { recursive: true, force: true });
});

/** Un informe de Lighthouse con lo justo que lee el resumen. */
function informe({ url, rendimiento, lcp, cls = 0, tbt = 0 }) {
  return JSON.stringify({
    requestedUrl: url,
    categories: {
      performance: { score: rendimiento },
      accessibility: { score: 1 },
      "best-practices": { score: 0.96 },
      seo: { score: 1 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "cumulative-layout-shift": { numericValue: cls },
      "total-blocking-time": { numericValue: tbt },
    },
  });
}

function crudoCon(informes) {
  const d = directorioTemporal();
  let n = 0;
  for (const contenido of informes) {
    writeFileSync(join(d, `lhr-${1788000000000 + n}.json`), contenido, "utf8");
    n += 1;
  }
  // `collect` deja siempre este fichero al lado; no es un informe.
  writeFileSync(join(d, "flags-abc.json"), '{"preset":"desktop"}', "utf8");
  return d;
}

describe("mediana", () => {
  it("con un número impar de valores devuelve el de en medio", () => {
    assert.equal(mediana([3, 1, 2]), 2);
  });

  it("con un número par promedia los dos centrales", () => {
    assert.equal(mediana([1, 2, 3, 4]), 2.5);
  });

  it("sin valores devuelve null en vez de NaN", () => {
    assert.equal(mediana([]), null);
  });

  it("no se lleva el pico de una corrida mala, que es para lo que se eligió", () => {
    // Tres corridas y una que se cruza con el recolector de basura del runner.
    const corridas = [0.92, 0.9, 0.2];
    assert.equal(mediana(corridas), 0.9);
    const media = corridas.reduce((a, b) => a + b, 0) / corridas.length;
    assert.ok(media < 0.7, "la media sí se lleva el pico: por eso no se publica");
  });
});

describe("resumirPasada", () => {
  it("agrupa por ruta y publica la mediana de las corridas", () => {
    const crudo = crudoCon([
      informe({ url: "http://127.0.0.1:3141/precios", rendimiento: 0.95, lcp: 1500 }),
      informe({ url: "http://127.0.0.1:3141/precios", rendimiento: 0.91, lcp: 1700 }),
      informe({ url: "http://127.0.0.1:3141/precios", rendimiento: 0.93, lcp: 1600 }),
    ]);
    const filas = resumirPasada("escritorio", crudo);
    assert.equal(filas.length, 1);
    const [fila] = filas;
    assert.equal(fila.pasada, "escritorio");
    assert.equal(fila.ruta, "/precios");
    assert.equal(fila.corridas, 3, "el `flags-*.json` no cuenta como corrida");
    assert.equal(fila.rendimiento, 0.93);
    assert.equal(fila.lcpMs, 1600);
    assert.equal(fila.accesibilidad, 1);
  });

  it("devuelve una fila por ruta, ordenadas", () => {
    const crudo = crudoCon([
      informe({ url: "http://127.0.0.1:3141/precios", rendimiento: 0.95, lcp: 1500 }),
      informe({ url: "http://127.0.0.1:3141/", rendimiento: 0.9, lcp: 1800 }),
      informe({ url: "http://127.0.0.1:3141/register", rendimiento: 0.92, lcp: 1700 }),
    ]);
    const filas = resumirPasada("móvil", crudo);
    assert.deepEqual(
      filas.map((f) => f.ruta),
      ["/", "/precios", "/register"],
    );
  });

  it("un informe ilegible no tumba el resumen de los demás", () => {
    const crudo = crudoCon([
      informe({ url: "http://127.0.0.1:3141/", rendimiento: 0.9, lcp: 1800 }),
      "{ esto no es JSON",
    ]);
    const filas = resumirPasada("escritorio", crudo);
    assert.equal(filas.length, 1);
    assert.equal(filas[0].corridas, 1);
  });

  it("sin informes no inventa filas", () => {
    assert.deepEqual(resumirPasada("escritorio", crudoCon([])), []);
  });
});

describe("archivarPasada", () => {
  it("copia los informes a su directorio y lo confirma", () => {
    const crudo = crudoCon([informe({ url: "http://127.0.0.1:3141/", rendimiento: 0.9, lcp: 1800 })]);
    const salida = join(directorioTemporal(), ".lighthouseci-escritorio");
    const filas = resumirPasada("escritorio", crudo);
    assert.equal(archivarPasada(salida, filas, crudo), true);
    assert.equal(readdirSync(salida).filter((f) => f.startsWith("lhr-")).length, 1);
  });

  it("FRACASA si lo archivado no trae informes — el fallo que esto existe para atrapar", () => {
    // El estado exacto del defecto: `collect` escribió en otro sitio y aquí sólo
    // quedó el `flags-*.json`. Antes esto salía en verde y subía un artefacto vacío.
    const crudo = crudoCon([]);
    const salida = join(directorioTemporal(), ".lighthouseci-escritorio");
    assert.equal(archivarPasada(salida, resumirPasada("escritorio", crudo), crudo), false);
  });

  it("borra lo que hubiera antes: la pasada de hoy no hereda la de ayer", () => {
    const crudo = crudoCon([informe({ url: "http://127.0.0.1:3141/", rendimiento: 0.9, lcp: 1800 })]);
    const salida = join(directorioTemporal(), ".lighthouseci-movil");
    mkdirSync(salida, { recursive: true });
    writeFileSync(join(salida, "lhr-viejo.json"), "{}", "utf8");
    archivarPasada(salida, resumirPasada("móvil", crudo), crudo);
    assert.ok(
      !readdirSync(salida).includes("lhr-viejo.json"),
      "un informe de una corrida anterior falsearía la tabla publicada",
    );
  });
});
