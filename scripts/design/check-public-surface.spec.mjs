#!/usr/bin/env node
/**
 * EL GATE DEL GATE DE SUPERFICIE.
 *
 * `check-public-surface.mjs` decide si el producto se está describiendo solo o
 * se está describiendo contra otro. Es una regla de posicionamiento con
 * consecuencias comerciales, así que su mecánica tiene que estar probada: un
 * gate de contenido que se equivoca en un sentido bloquea a quien escribe, y en
 * el otro deja pasar exactamente lo que vino a impedir.
 *
 * Lo que se prueba aquí es el COMPORTAMIENTO del gate, no el contenido de la
 * portada — eso lo comprueba el gate mismo cuando corre. En particular la
 * pieza frágil: el borrado de comentarios, que es lo que permite documentar
 * POR QUÉ se retiró una comparación sin que documentarlo la reintroduzca.
 *
 * Corre con `node --test scripts/design/check-public-surface.spec.mjs`.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const gateSource = readFileSync(path.join(here, "check-public-surface.mjs"), "utf8");

/**
 * El gate no exporta nada (es un ejecutable), así que la función de borrado de
 * comentarios se reconstruye aquí desde su propia definición. Reescribirla a
 * mano habría probado una copia, no el gate; extraerla del fuente prueba EL
 * CÓDIGO QUE CORRE, y si alguien la cambia sin actualizar esta prueba, la
 * extracción falla ruidosamente en vez de aprobar una versión vieja.
 */
function loadStripComments() {
  const match = gateSource.match(
    /function stripComments\(source\) \{[\s\S]*?\n\}/,
  );
  assert.ok(match, "no se encontró stripComments en el gate: ¿se renombró?");
  // eslint-disable-next-line no-new-func
  return new Function(`${match[0]}; return stripComments;`)();
}

test("el borrado de comentarios quita bloques, líneas y comentarios de JSX", () => {
  const strip = loadStripComments();
  assert.equal(strip("/* AutoCAD */ hola").trim(), "hola");
  assert.equal(strip("hola // AutoCAD").trim(), "hola");
  assert.equal(strip("{/* Autodesk */}").trim(), "{}");
  assert.equal(
    strip("/**\n * AutoCAD, retirado en 2026.\n */\nconst a = 1;").trim(),
    "const a = 1;",
  );
});

test("una URL sobrevive al borrado de comentarios", () => {
  // La guarda que evita el fallo silencioso: sin ella, `//` de un protocolo se
  // come media línea y el gate deja de ver texto que sí es público.
  const strip = loadStripComments();
  const linea = 'const x = "https://valle.design/precios";';
  assert.equal(strip(linea), linea);
  assert.ok(strip('href="http://ejemplo.mx/a"').includes("ejemplo.mx"));
});

test("el gate declara una única excepción y es un archivo, no un patrón", () => {
  const match = gateSource.match(/const TRADEMARK_MODULE = "([^"]+)";/);
  assert.ok(match, "el gate debe declarar el módulo autorizado por su ruta");
  assert.equal(match[1], "components/marketing/TrademarkNotice.tsx");
  // Una sola excepción: si mañana hubiera dos, la regla dejaría de significar
  // «un sitio» y volvería a ser «donde haga falta».
  assert.equal(gateSource.match(/TRADEMARK_MODULE\s*=/g).length, 1);
});

test("el gate exige que el aviso de marcas SIGA existiendo", () => {
  // La mitad que se olvida siempre: un gate que sólo prohíbe se satisface
  // borrando el aviso legal, que es peor que el problema que vino a resolver.
  assert.match(gateSource, /no est\[áa\]a? afiliad|no est\[áa\] afiliad/u);
  assert.match(gateSource, /TrademarkNotice/);
});

test("la superficie vigilada incluye portada, precios y embudo de alta", () => {
  for (const zona of [
    "app/page.tsx",
    "app/precios/**/*.tsx",
    "app/register/**/*.tsx",
    "app/login/**/*.tsx",
    "components/marketing/**/*.tsx",
  ]) {
    assert.ok(
      gateSource.includes(`"${zona}"`),
      `la superficie pública debería vigilar ${zona}`,
    );
  }
});

test("las guías técnicas quedan FUERA del veto, a propósito", () => {
  // Ahí el lector ya entró y viene con una pregunta concreta que no se puede
  // responder sin nombrar formatos ni programas. Callar sería dejar sin
  // respuesta a quien está a punto de pagar.
  const zonas = gateSource.match(/const PUBLIC_GLOBS = \[[\s\S]*?\];/);
  assert.ok(zonas, "no se encontró la lista de zonas públicas");
  assert.doesNotMatch(zonas[0], /app\/docs/);
});

test("el gate PASA sobre el árbol vigente", () => {
  const salida = execFileSync(
    process.execPath,
    [path.join(here, "check-public-surface.mjs")],
    { encoding: "utf8", cwd: root },
  );
  assert.match(salida, /Gate de superficie pública OK/);
});

test("el gate FALLA cuando una zona pública nombra la marca", () => {
  // EL CAMINO QUE FALTABA. Los otros siete casos leen el texto fuente del gate
  // con expresiones regulares: comprueban lo que el gate DICE, no lo que hace.
  // Un gate que hubiera perdido su código de salida los habría pasado todos.
  //
  // Se monta un árbol mínimo en un temporal y se apunta el gate a él con
  // `VALLE_SURFACE_SRC`. Mínimo pero COMPLETO: lleva su aviso de marcas real,
  // porque si no el gate fallaría por la otra mitad —«el aviso desapareció»— y
  // la prueba pasaría por el motivo equivocado.
  const raiz = mkdtempSync(path.join(tmpdir(), "valle-superficie-"));
  const avisoReal = readFileSync(
    path.join(root, "apps/web/src/components/marketing/TrademarkNotice.tsx"),
    "utf8",
  );
  mkdirSync(path.join(raiz, "components/marketing"), { recursive: true });
  mkdirSync(path.join(raiz, "app"), { recursive: true });
  writeFileSync(
    path.join(raiz, "components/marketing/TrademarkNotice.tsx"),
    avisoReal,
    "utf8",
  );
  writeFileSync(
    path.join(raiz, "app/page.tsx"),
    'export default function P() {\n  return <p>La alternativa a AutoCAD en la nube.</p>;\n}\n',
    "utf8",
  );

  let fallo = null;
  try {
    execFileSync(
      process.execPath,
      [path.join(here, "check-public-surface.mjs")],
      { encoding: "utf8", cwd: root, env: { ...process.env, VALLE_SURFACE_SRC: raiz } },
    );
  } catch (error) {
    fallo = error;
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }

  assert.ok(fallo, "el gate NO falló con una marca ajena en la portada");
  assert.equal(fallo.status, 1, "el gate tiene que salir con código 1");
  const salida = `${fallo.stdout ?? ""}${fallo.stderr ?? ""}`;
  assert.match(salida, /app\/page\.tsx/);
  assert.match(salida, /AutoCAD/i);
});

test("el gate FALLA si el aviso de marcas deja de declarar la no afiliación", () => {
  // La otra mitad, también ejecutada de verdad: un gate que sólo prohíbe se
  // satisface borrando el aviso legal.
  const raiz = mkdtempSync(path.join(tmpdir(), "valle-superficie-"));
  mkdirSync(path.join(raiz, "components/marketing"), { recursive: true });
  mkdirSync(path.join(raiz, "app"), { recursive: true });
  writeFileSync(
    path.join(raiz, "components/marketing/TrademarkNotice.tsx"),
    'export function TrademarkNotice() {\n  return <p>Sin declaración.</p>;\n}\n',
    "utf8",
  );
  writeFileSync(
    path.join(raiz, "app/page.tsx"),
    "export default function P() {\n  return <p>Hola.</p>;\n}\n",
    "utf8",
  );

  let fallo = null;
  try {
    execFileSync(
      process.execPath,
      [path.join(here, "check-public-surface.mjs")],
      { encoding: "utf8", cwd: root, env: { ...process.env, VALLE_SURFACE_SRC: raiz } },
    );
  } catch (error) {
    fallo = error;
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }

  assert.ok(fallo, "el gate NO falló con el aviso mutilado");
  assert.match(`${fallo.stdout ?? ""}${fallo.stderr ?? ""}`, /no afiliaci|NO afiliaci/i);
});
