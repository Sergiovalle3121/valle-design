/**
 * Spec del gate anti-recaída de marca.
 *
 * Ejecuta el gate contra un directorio temporal con contenido conocido
 * para verificar que el camino de FALLO funciona de verdad.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const gate = path.join(here, "check-brand-literal.mjs");

function makeTmpDir() {
  const tmp = path.join(
    process.env.TEMP || "/tmp",
    `brand-literal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmp, { recursive: true });
  return tmp;
}

test("detecta «valle design» en minúsculas", () => {
  const tmp = makeTmpDir();
  mkdirSync(path.join(tmp, "app"), { recursive: true });
  writeFileSync(
    path.join(tmp, "app/page.tsx"),
    'export default function Page() { return <h1>valle design es genial</h1>; }',
  );
  try {
    assert.throws(
      () => execFileSync("node", [gate], { env: { ...process.env, VALLE_BRAND_SRC: tmp }, encoding: "utf8" }),
      (error) => error.status === 1,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("detecta «VALLE Design» en mixto", () => {
  const tmp = makeTmpDir();
  mkdirSync(path.join(tmp, "app"), { recursive: true });
  writeFileSync(
    path.join(tmp, "app/page.tsx"),
    'export default function Page() { return <p>VALLE Design CAD</p>; }',
  );
  try {
    assert.throws(
      () => execFileSync("node", [gate], { env: { ...process.env, VALLE_BRAND_SRC: tmp }, encoding: "utf8" }),
      (error) => error.status === 1,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("no detecta «VALLECAD» (no es el patrón)", () => {
  const tmp = makeTmpDir();
  mkdirSync(path.join(tmp, "app"), { recursive: true });
  writeFileSync(
    path.join(tmp, "app/page.tsx"),
    'export default function Page() { return <h1>VALLECAD</h1>; }',
  );
  try {
    // No debe fallar: VALLECAD no coincide con /valle\s*design/i
    execFileSync("node", [gate], { env: { ...process.env, VALLE_BRAND_SRC: tmp }, encoding: "utf8" });
  } catch {
    assert.fail("VALLECAD no debería activar el gate");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ignora el literal dentro de comentarios", () => {
  const tmp = makeTmpDir();
  mkdirSync(path.join(tmp, "app"), { recursive: true });
  writeFileSync(
    path.join(tmp, "app/page.tsx"),
    '// Valle Design no tiene IA\nexport default function Page() { return <p>ok</p>; }',
  );
  try {
    // stripComments quita el comentario → no falla
    execFileSync("node", [gate], { env: { ...process.env, VALLE_BRAND_SRC: tmp }, encoding: "utf8" });
  } catch {
    assert.fail("El literal en comentario no debería activar el gate");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
