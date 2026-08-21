#!/usr/bin/env node
/**
 * Gate contra claves JSON duplicadas en manifiestos versionados.
 *
 * `JSON.parse` acepta claves duplicadas en silencio: la última gana y las
 * anteriores desaparecen sin error. Eso ya nos costó una vez — un merge dejó
 * claves duplicadas en un manifiesto y tres gates murieron en silencio porque
 * su configuración quedó pisada por la copia fusionada. Un manifiesto que
 * gobierna gates no puede tener dos verdades para la misma clave.
 *
 * Este gate escanea el TEXTO de cada manifiesto (no el objeto ya parseado,
 * donde el duplicado es invisible) con un recorrido JSON propio que registra
 * cada clave por objeto y reporta duplicados con línea y ruta. Falla cerrado:
 * un manifiesto ausente o mal formado también es rojo.
 *
 * Archivos vigilados: package.json raíz, el package.json de cada workspace
 * (derivados de los globs de `workspaces`, no de una lista a mano),
 * turbo.json, la rúbrica competitiva y el presupuesto del monolito.
 *
 * Uso:
 *   node scripts/cad/check-json-duplicate-keys.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

/**
 * Escanea texto JSON y devuelve los duplicados como
 * `[{ pointer, key, line }]`. Lanza `SyntaxError` si el texto no es JSON
 * válido — el gate no debe "pasar" sobre un archivo que ni siquiera parsea.
 *
 * Las claves se comparan DESPUÉS de resolver escapes (`"a"` y `"a"` son
 * la misma clave para cualquier consumidor del JSON, así que también lo son
 * para este gate).
 */
export function scanJsonForDuplicateKeys(text) {
  const duplicates = [];
  let index = 0;

  const lineAt = (position) => {
    let line = 1;
    for (let i = 0; i < position && i < text.length; i += 1) {
      if (text[i] === "\n") line += 1;
    }
    return line;
  };

  const fail = (message) => {
    throw new SyntaxError(`${message} (línea ${lineAt(index)})`);
  };

  const skipWhitespace = () => {
    while (index < text.length && /[ \t\n\r]/.test(text[index])) index += 1;
  };

  const parseString = () => {
    if (text[index] !== '"') fail("Se esperaba una cadena");
    const start = index;
    index += 1;
    let value = "";
    while (index < text.length) {
      const ch = text[index];
      if (ch === '"') {
        index += 1;
        return { value, start };
      }
      if (ch === "\\") {
        const esc = text[index + 1];
        if (esc === "u") {
          const hex = text.slice(index + 2, index + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Escape \\u inválido");
          value += String.fromCharCode(parseInt(hex, 16));
          index += 6;
        } else {
          const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (!(esc in map)) fail(`Escape inválido: \\${esc}`);
          value += map[esc];
          index += 2;
        }
      } else if (ch === "\n") {
        fail("Salto de línea dentro de una cadena");
      } else {
        value += ch;
        index += 1;
      }
    }
    fail("Cadena sin cerrar");
  };

  const parseValue = (pointer) => {
    skipWhitespace();
    if (index >= text.length) fail("JSON truncado");
    const ch = text[index];
    if (ch === "{") return parseObject(pointer);
    if (ch === "[") return parseArray(pointer);
    if (ch === '"') return void parseString();
    const literal = text.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!literal) fail(`Token inesperado: ${JSON.stringify(ch)}`);
    index += literal[0].length;
  };

  const parseObject = (pointer) => {
    index += 1; // {
    const seen = new Map();
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    for (;;) {
      skipWhitespace();
      const { value: key, start } = parseString();
      if (seen.has(key)) {
        duplicates.push({ pointer, key, line: lineAt(start) });
      } else {
        seen.set(key, start);
      }
      skipWhitespace();
      if (text[index] !== ":") fail("Se esperaba ':'");
      index += 1;
      parseValue(`${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "}") {
        index += 1;
        return;
      }
      fail("Se esperaba ',' o '}'");
    }
  };

  const parseArray = (pointer) => {
    index += 1; // [
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    let item = 0;
    for (;;) {
      parseValue(`${pointer}/${item}`);
      item += 1;
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "]") {
        index += 1;
        return;
      }
      fail("Se esperaba ',' o ']'");
    }
  };

  parseValue("");
  skipWhitespace();
  if (index < text.length) fail("Contenido tras el final del JSON");
  return duplicates;
}

/**
 * Manifiestos vigilados. Los workspaces se derivan de los globs del
 * package.json raíz (`apps/*`, `packages/*`): una lista a mano se
 * desincroniza; el glob no.
 */
export function watchedManifests(repoRoot) {
  const files = [
    "package.json",
    "turbo.json",
    "docs/competitive/rubric.json",
    "scripts/cad/monolith-budget.json",
  ];
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  for (const glob of rootPkg.workspaces ?? []) {
    if (!glob.endsWith("/*")) {
      files.push(path.posix.join(glob, "package.json"));
      continue;
    }
    const parent = glob.slice(0, -2);
    const parentDir = path.join(repoRoot, parent);
    if (!fs.existsSync(parentDir)) continue;
    for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.posix.join(parent, entry.name, "package.json");
      if (fs.existsSync(path.join(repoRoot, candidate))) files.push(candidate);
    }
  }
  return files;
}

function main() {
  const errors = [];
  const files = watchedManifests(root);
  for (const rel of files) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      errors.push(`${rel}: manifiesto vigilado AUSENTE`);
      continue;
    }
    let duplicates;
    try {
      duplicates = scanJsonForDuplicateKeys(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${rel}: JSON inválido — ${error.message}`);
      continue;
    }
    for (const dup of duplicates) {
      errors.push(
        `${rel}:${dup.line}: clave duplicada ${JSON.stringify(dup.key)} en ${dup.pointer || "la raíz"}`,
      );
    }
  }

  if (errors.length > 0) {
    console.error("check-json-duplicate-keys: ROJO");
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      "\nUna clave duplicada significa que la última copia PISA a las demás en",
    );
    console.error("silencio. Resuelve el merge dejando una sola verdad por clave.");
    process.exit(1);
  }

  console.log(
    `check-json-duplicate-keys: OK — ${files.length} manifiestos sin claves duplicadas`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
