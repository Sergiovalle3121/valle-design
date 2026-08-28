#!/usr/bin/env node
/**
 * EL GATE DEL GATE.
 *
 * Un gate de contraste que calcula mal es peor que no tener gate: da permiso
 * escrito para publicar una paleta ilegible. Estas pruebas fijan la aritmética
 * contra valores que no dependen de esta implementación —los ejemplos
 * canónicos de WCAG 2.1 y los tres números que la campaña de diseño anterior
 * midió a mano y dejó escritos en `globals.css`— y comprueban que el gate
 * DETECTA una regresión, que es la mitad que casi nunca se prueba.
 *
 * Corre con `node --test scripts/design/check-contrast.spec.mjs`.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  composite,
  contrastRatio,
  extractBlock,
  formatRatio,
  hslChannelsToRgb,
  relativeLuminance,
  resolveToken,
} from "./contrast.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

test("los extremos de la escala son 21:1 y 1:1", () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2), "21.00");
  assert.equal(contrastRatio([18, 52, 86], [18, 52, 86]).toFixed(2), "1.00");
});

test("la luminancia relativa sigue la fórmula de WCAG 2.1", () => {
  // Blanco = 1, negro = 0, y el gris medio sRGB #808080 = 0,2159 (valor
  // publicado; si esta cifra se mueve, el umbral de linealización se rompió).
  assert.equal(relativeLuminance([255, 255, 255]).toFixed(4), "1.0000");
  assert.equal(relativeLuminance([0, 0, 0]).toFixed(4), "0.0000");
  assert.equal(relativeLuminance([128, 128, 128]).toFixed(4), "0.2159");
});

test("HSL en canales sueltos se convierte como lo hace el navegador", () => {
  assert.deepEqual(hslChannelsToRgb(0, 0, 100), [255, 255, 255]);
  assert.deepEqual(hslChannelsToRgb(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(hslChannelsToRgb(0, 100, 50), [255, 0, 0]);
  assert.deepEqual(hslChannelsToRgb(120, 100, 50), [0, 255, 0]);
  assert.deepEqual(hslChannelsToRgb(240, 100, 50), [0, 0, 255]);
  // Un tono cualquiera fuera de los primarios, para que el reparto por sextos
  // no pueda estar bien sólo en los seis vértices.
  assert.deepEqual(hslChannelsToRgb(30, 50, 60), [204, 153, 102]);
});

test("reproduce los números que la campaña de diseño midió a mano", () => {
  // Estos tres estaban escritos en los comentarios de globals.css antes de que
  // existiera este módulo. Que coincidan es la prueba de que el metro nuevo
  // mide lo mismo que la cinta métrica vieja.
  const indigo = [0x63, 0x66, 0xf1];
  const indigoStrong = [0x4f, 0x46, 0xe5];
  const white = [255, 255, 255];
  assert.equal(contrastRatio(indigo, white).toFixed(1), "4.5"); // «4,46:1»
  assert.equal(contrastRatio(white, indigoStrong).toFixed(1), "6.3"); // «6,29:1»
  assert.equal(contrastRatio(white, [0x43, 0x38, 0xca]).toFixed(1), "7.9"); // «7,90:1»
});

test("componer con alfa mide contra lo que hay debajo", () => {
  assert.deepEqual(composite([255, 255, 255], [0, 0, 0], 0.5), [128, 128, 128]);
  assert.deepEqual(composite([255, 255, 255], [0, 0, 0], 1), [255, 255, 255]);
  assert.deepEqual(composite([255, 255, 255], [0, 0, 0], 0), [0, 0, 0]);
});

test("el parseo lee los tokens de la hoja real y sigue la indirección", () => {
  const css = readFileSync(path.join(root, "apps/web/src/app/globals.css"), "utf8");
  const light = extractBlock(css, ":root {");
  assert.ok(Object.keys(light).length > 30, "el bloque :root debería traer decenas de tokens");
  // `--brand-primary` es `var(--valle-accent)`: si la indirección se rompe, el
  // gate mediría el token equivocado sin decirlo.
  assert.deepEqual(
    resolveToken(light, "--brand-primary"),
    resolveToken(light, "--valle-accent"),
  );
  const dark = { ...light, ...extractBlock(css, "  .dark {") };
  assert.notDeepEqual(
    resolveToken(dark, "--background"),
    resolveToken(light, "--background"),
    "el oscuro tiene que redefinir el fondo",
  );
  // Los comentarios dentro del bloque no pueden colarse como tokens.
  assert.equal(light["--esto-no-existe"], undefined);
});

test("un valor de color no medible falla ruidoso en vez de inventarse", () => {
  assert.throws(() => resolveToken({ "--x": "papaya" }, "--x"), /no medible/);
  assert.throws(() => resolveToken({}, "--y"), /inexistente/);
  assert.throws(
    () => resolveToken({ "--a": "var(--b)", "--b": "var(--a)" }, "--a"),
    /circular/,
  );
});

test("formatRatio escribe la coma decimal del informe", () => {
  assert.equal(formatRatio(4.5), "4,50");
  assert.equal(formatRatio(21), "21,00");
});

test("el gate PASA sobre la hoja vigente", () => {
  const output = execFileSync(
    process.execPath,
    [path.join(here, "check-contrast.mjs")],
    { encoding: "utf8" },
  );
  assert.match(output, /Gate de contraste OK/);
});

test("el gate DETECTA una paleta ilegible", () => {
  // LA PRUEBA QUE DE VERDAD IMPORTA: se degrada el texto secundario hasta
  // fundirlo con la tarjeta y se ejecuta EL GATE, no su aritmética. Sin
  // ejecutarlo, un gate que perdiera su `process.exit(1)` seguiría imprimiendo
  // «OK» y esta prueba lo habría bendecido para siempre.
  //
  // La hoja degradada se escribe en un fichero temporal y el gate se apunta a
  // ella con `VALLE_CONTRAST_CSS`: mutar `globals.css` en el árbol de trabajo
  // es lo que la versión anterior quiso evitar —con razón— renunciando a
  // ejecutar el gate. No hacía falta renunciar: hacía falta un parámetro.
  const cssPath = path.join(root, "apps/web/src/app/globals.css");
  const original = readFileSync(cssPath, "utf8");
  const broken = original.replace(
    "--muted-foreground: 30 8% 38%;",
    "--muted-foreground: 30 8% 92%;",
  );
  assert.notEqual(broken, original, "no se encontró el token que había que degradar");

  const temporal = path.join(
    mkdtempSync(path.join(tmpdir(), "valle-contraste-")),
    "globals.css",
  );
  writeFileSync(temporal, broken, "utf8");

  let fallo = null;
  try {
    execFileSync(process.execPath, [path.join(here, "check-contrast.mjs")], {
      encoding: "utf8",
      env: { ...process.env, VALLE_CONTRAST_CSS: temporal },
    });
  } catch (error) {
    fallo = error;
  } finally {
    rmSync(path.dirname(temporal), { recursive: true, force: true });
  }

  assert.ok(fallo, "el gate NO falló sobre una paleta ilegible");
  assert.equal(fallo.status, 1, "el gate tiene que salir con código 1");
  const salida = `${fallo.stdout ?? ""}${fallo.stderr ?? ""}`;
  assert.match(salida, /--muted-foreground/);
  // Y el árbol queda intacto: es la mitad del motivo de existir del parámetro.
  assert.equal(readFileSync(cssPath, "utf8"), original);
});
