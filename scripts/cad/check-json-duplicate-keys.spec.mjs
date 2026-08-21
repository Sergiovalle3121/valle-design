#!/usr/bin/env node
/**
 * Spec del gate de claves JSON duplicadas.
 *
 * Lo que hay que probar no es que parsee JSON: es que VEA el duplicado que
 * `JSON.parse` esconde, que no invente duplicados donde no los hay (claves
 * iguales en objetos hermanos son legítimas), y que falle cerrado ante JSON
 * roto. Cada caso feliz tiene su gemelo triste.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  scanJsonForDuplicateKeys,
  watchedManifests,
} from "./check-json-duplicate-keys.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const throws = (fn, message) => {
  assert.throws(fn, SyntaxError, message);
  checks += 1;
};

// ─── Sin duplicados: silencio ────────────────────────────────────────────────

eq(scanJsonForDuplicateKeys(`{"a": 1, "b": 2}`), [], "objeto plano limpio");
eq(scanJsonForDuplicateKeys(`[]`), [], "array vacío");
eq(scanJsonForDuplicateKeys(`{"a": {"x": 1}, "b": {"x": 2}}`), [],
  "la misma clave en objetos HERMANOS no es duplicado");
eq(scanJsonForDuplicateKeys(`[{"x": 1}, {"x": 2}]`), [],
  "la misma clave en elementos distintos de un array no es duplicado");
eq(scanJsonForDuplicateKeys(`{"scripts": {"build": "a"}, "build": "b"}`), [],
  "clave repetida en NIVELES distintos no es duplicado");

// ─── Duplicados que JSON.parse esconde ───────────────────────────────────────

{
  const dups = scanJsonForDuplicateKeys(`{\n  "a": 1,\n  "a": 2\n}`);
  eq(dups.length, 1, "duplicado en la raíz detectado");
  eq(dups[0].key, "a", "reporta la clave");
  eq(dups[0].pointer, "", "el pointer de la raíz es vacío");
  eq(dups[0].line, 3, "reporta la línea de la SEGUNDA aparición");
}

{
  const dups = scanJsonForDuplicateKeys(
    `{"scripts": {"check": "uno", "test": "x", "check": "dos"}}`,
  );
  eq(dups.length, 1, "duplicado anidado detectado");
  eq(dups[0].pointer, "/scripts", "el pointer señala el objeto contenedor");
  eq(dups[0].key, "check", "la clave pisada queda nombrada");
}

{
  const dups = scanJsonForDuplicateKeys(`[{"k": 1, "k": 2}, {"k": 3}]`);
  eq(dups.length, 1, "duplicado dentro de un elemento de array detectado");
  eq(dups[0].pointer, "/0", "el pointer usa el índice del array");
}

{
  const dups = scanJsonForDuplicateKeys(`{"a": 1, "b": 2, "a": 3, "a": 4}`);
  eq(dups.length, 2, "cada reaparición cuenta como un duplicado propio");
}

// El escenario que nos pasó: un merge deja dos bloques "pipeline" y el
// segundo pisa al primero — tres gates mueren en silencio.
{
  const merged = `{
    "pipeline": {"check:cad": {}, "check:dwg": {}, "lint": {}},
    "globalEnv": ["CI"],
    "pipeline": {"lint": {}}
  }`;
  const dups = scanJsonForDuplicateKeys(merged);
  eq(dups.length, 1, "el merge de dos bloques pipeline es rojo");
  ok(JSON.parse(merged).pipeline["check:cad"] === undefined,
    "y JSON.parse, en cambio, se lo traga: la última copia gana");
}

// ─── Escapes: la clave se compara tras resolverlos ───────────────────────────

{
  const dups = scanJsonForDuplicateKeys(`{"a": 1, "\\u0061": 2}`);
  eq(dups.length, 1, '"a" y "\\u0061" son la MISMA clave para todo consumidor');
}
eq(scanJsonForDuplicateKeys(`{"a\\"b": 1, "ab": 2}`), [],
  "una comilla escapada dentro de la clave no confunde al escáner");
eq(scanJsonForDuplicateKeys(`{"tab\\there": 1, "tabhere": 2}`), [],
  "los escapes de control se resuelven sin colisionar");

// ─── JSON roto: fallo cerrado, no silencio ───────────────────────────────────

throws(() => scanJsonForDuplicateKeys(`{"a": 1,}`), "coma colgante es SyntaxError");
throws(() => scanJsonForDuplicateKeys(`{"a" 1}`), "falta de ':' es SyntaxError");
throws(() => scanJsonForDuplicateKeys(`{"a": 1} extra`), "contenido tras el final es SyntaxError");
throws(() => scanJsonForDuplicateKeys(`{"a": undefined}`), "literal no-JSON es SyntaxError");
throws(() => scanJsonForDuplicateKeys(`{"a`), "cadena sin cerrar es SyntaxError");

// ─── watchedManifests: derivado de los globs, no de una lista a mano ─────────

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "valle-dupkeys-"));
  const write = (rel, body) => {
    const file = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  write("package.json", JSON.stringify({ workspaces: ["apps/*", "packages/*"] }));
  write("apps/api/package.json", "{}");
  write("apps/web/package.json", "{}");
  write("packages/sdk/package.json", "{}");
  fs.mkdirSync(path.join(tmp, "apps/sin-manifiesto"), { recursive: true });

  const files = watchedManifests(tmp);
  ok(files.includes("apps/api/package.json"), "descubre el workspace api");
  ok(files.includes("apps/web/package.json"), "descubre el workspace web");
  ok(files.includes("packages/sdk/package.json"), "descubre packages/*");
  ok(!files.some((f) => f.includes("sin-manifiesto")),
    "un directorio sin package.json no entra a la lista");
  ok(files.includes("turbo.json"), "turbo.json siempre vigilado");
  ok(files.includes("docs/competitive/rubric.json"), "la rúbrica siempre vigilada");
  ok(files.includes("scripts/cad/monolith-budget.json"),
    "el presupuesto del monolito siempre vigilado");
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ─── Los manifiestos REALES del repo, hoy, están limpios ─────────────────────

{
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  for (const rel of watchedManifests(repoRoot)) {
    const file = path.join(repoRoot, rel);
    ok(fs.existsSync(file), `${rel} existe`);
    const dups = scanJsonForDuplicateKeys(fs.readFileSync(file, "utf8"));
    eq(dups, [], `${rel} sin claves duplicadas`);
  }
}

console.log(`check-json-duplicate-keys.spec: OK — ${checks} comprobaciones`);
