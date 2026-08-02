#!/usr/bin/env node
/**
 * Runner de los specs script-style del web (node assert / contadores ok()):
 * ejecuta cada src/**\/*.spec.ts con tsx; un exit≠0 o un throw marca el spec
 * como fallido. Eran 47 suites escritas SIN runner (tests muertos que se
 * pudrían en silencio) — este script las convierte en gate de CI. ADR §149.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { globSync } from "glob";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specs = globSync("src/**/*.spec.ts", { cwd: root }).sort();
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

if (specs.length === 0) {
  console.error("No se encontró ningún spec — ¿glob roto?");
  process.exit(1);
}

const failures = [];
for (const spec of specs) {
  try {
    execFileSync(process.execPath, [tsxCli, spec], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    console.log(`✅ ${spec}`);
  } catch (err) {
    failures.push(spec);
    console.error(`❌ ${spec}`);
    const out = `${err.message ?? ""}\n${err.stdout ?? ""}${err.stderr ?? ""}`;
    console.error(
      out
        .split("\n")
        .slice(-15)
        .map((l) => `   ${l}`)
        .join("\n"),
    );
  }
}

console.log(`\n${specs.length - failures.length}/${specs.length} specs verdes`);
if (failures.length) {
  console.error(`Fallaron: ${failures.join(", ")}`);
  process.exit(1);
}
