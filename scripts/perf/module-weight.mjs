#!/usr/bin/env node
/**
 * Peso transitivo de un módulo del frontend, en bytes de fuente.
 *
 * No sustituye a un analizador de bundle: no minifica, no aplica tree-shaking y
 * no sabe de código compartido. Sirve para lo que sí hace falta antes de tocar
 * nada — saber QUÉ subsistema arrastra QUÉ, y cuánto pesa el árbol que cuelga
 * de cada import. Con eso se decide dónde poner un `import()` y con qué
 * expectativa; la cifra que cuenta después es la del navegador, que la mide
 * `e2e/performance/frontend-load-budget.spec.ts`.
 *
 *   node scripts/perf/module-weight.mjs <fichero> [<fichero> ...]
 *   node scripts/perf/module-weight.mjs --exclusivo <a> <b>   # lo que SÓLO cuelga de <a>
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
const SRC = join(RAIZ, "apps", "web", "src");

const EXT = [".ts", ".tsx", ".js", ".jsx"];

function resolver(especificador, desde) {
  if (especificador.startsWith("@/")) {
    const base = join(SRC, especificador.slice(2));
    return probar(base);
  }
  if (especificador.startsWith(".")) {
    return probar(resolve(dirname(desde), especificador));
  }
  return null; // node_modules: fuera del alcance de esta medida
}

function probar(base) {
  const limpio = base.replace(/\.js$/, "");
  for (const candidato of [base, ...EXT.map((e) => limpio + e), ...EXT.map((e) => join(limpio, `index${e}`))]) {
    if (existsSync(candidato) && statSync(candidato).isFile()) return candidato;
  }
  return null;
}

const RE_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^;'"]*?from\s+["']([^"']+)["']/g;
const RE_DINAMICO = /\bimport\(\s*["']([^"']+)["']/g;
const RE_SOLO_TIPO = /(?:^|\n)\s*(?:import|export)\s+type\s/;

/** Alcance transitivo de un fichero: sólo imports de valor (los de tipo se borran al compilar). */
export function alcance(entrada, { incluirDinamicos = false } = {}) {
  const vistos = new Set();
  const cola = [entrada];
  while (cola.length > 0) {
    const actual = cola.pop();
    if (!actual || vistos.has(actual)) continue;
    if (/\.spec\.[tj]sx?$/.test(actual)) continue;
    vistos.add(actual);
    const texto = readFileSync(actual, "utf8");
    for (const m of texto.matchAll(RE_IMPORT)) {
      const linea = texto.slice(Math.max(0, m.index), m.index + m[0].length);
      if (RE_SOLO_TIPO.test(linea)) continue; // `import type` no llega al bundle
      const destino = resolver(m[1], actual);
      if (destino) cola.push(destino);
    }
    if (incluirDinamicos) {
      for (const m of texto.matchAll(RE_DINAMICO)) {
        const destino = resolver(m[1], actual);
        if (destino) cola.push(destino);
      }
    }
  }
  return vistos;
}

function bytes(conjunto) {
  let total = 0;
  for (const f of conjunto) total += statSync(f).size;
  return total;
}

function main() {
  const args = process.argv.slice(2);
  const exclusivo = args[0] === "--exclusivo";
  const ficheros = (exclusivo ? args.slice(1) : args).map((a) => resolve(a));
  if (ficheros.length === 0) {
    console.error("uso: module-weight.mjs [--exclusivo] <fichero> [<fichero> ...]");
    process.exit(1);
  }
  if (exclusivo) {
    const [a, b] = ficheros;
    const soloA = alcance(a);
    const desdeB = alcance(b);
    const propios = [...soloA].filter((f) => !desdeB.has(f));
    console.log(
      `Sólo alcanzable desde ${a.replace(RAIZ + "/", "")} y no desde ${b.replace(RAIZ + "/", "")}:`,
    );
    console.log(`  ${propios.length} ficheros, ${(bytes(new Set(propios)) / 1024).toFixed(1)} KB de fuente`);
    for (const f of propios.sort((x, y) => statSync(y).size - statSync(x).size).slice(0, 15)) {
      console.log(`    ${(statSync(f).size / 1024).toFixed(1).padStart(8)} KB  ${f.replace(RAIZ + "/", "")}`);
    }
    return;
  }
  for (const f of ficheros) {
    const conjunto = alcance(f);
    console.log(
      `${(bytes(conjunto) / 1024).toFixed(1).padStart(9)} KB  ${String(conjunto.size).padStart(4)} ficheros  ${f.replace(RAIZ + "/", "")}`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("module-weight.mjs")) main();
