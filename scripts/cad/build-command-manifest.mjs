#!/usr/bin/env node
/**
 * EL MANIFIESTO DE METADATOS DE COMANDOS, GENERADO — NO ESCRITO A MANO.
 *
 * ## Qué problema resuelve
 *
 * `apps/web/src/lib/cad/engine/index.ts` hacía 106 `import` ESTÁTICOS de
 * `./commands/*` sólo para construir `CAD_COMMAND_DESCRIPTORS`, y eso metía las
 * 291 implementaciones en el primer chunk del estudio (la cifra medida está en
 * `apps/web/src/lib/cad/benchmark/frontend-load-baseline.json`). Pero la cinta,
 * la paleta Ctrl+K, la asistencia de la línea y los tres gates que cuentan
 * comandos NO necesitan la máquina de estados: leen `name`, `aliases` y `kind`.
 *
 * Así que los metadatos se quedan estáticos —en `command-manifest.ts`— y la
 * implementación llega a demanda (`lazy-commands.ts`). Es el mismo reparto que
 * dejó escrito `lib/cad/commands/lazy.ts` un piso más arriba.
 *
 * ## Por qué generado y no copiado
 *
 * Regla 4 de la campaña de cimientos: ninguna cifra vive en dos lugares. Un
 * manifiesto escrito a mano sería 291 copias de metadatos que ya existen en los
 * descriptores reales, y se desincronizaría el primer día. Este script tiene la
 * forma exacta de `scripts/cad/ui-command-reach.mjs` y de
 * `scripts/brand/build-brand-assets.mjs --check`: una sonda `tsx` importa el
 * código REAL en Node —donde cargar los 106 módulos es gratis—, emite el
 * artefacto, y `--check` falla si lo committeado no coincide con lo que los
 * descriptores dicen hoy. Un comando nuevo no puede entrar sin aparecer aquí.
 *
 * Uso: `node scripts/cad/build-command-manifest.mjs --write` regenera;
 * `--check` (por defecto) verifica.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const outPath = path.join(web, "src/lib/cad/engine/command-manifest.ts");

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const probePath = path.join(web, ".command-manifest-probe.mts");
  writeFileSync(
    probePath,
    `
import { pathToFileURL } from "node:url";
import { CAD_COMMAND_MODULE_LOADERS } from "./src/lib/cad/engine/lazy-commands";

// Los módulos se importan por RUTA ABSOLUTA, no llamando a los thunks de
// \`lazy-commands.ts\`. Los thunks son correctos —el empaquetador los necesita
// literales para partir 106 chunks— pero esta sonda los ejecuta bajo \`tsx\`, que
// envuelve el módulo en una URL \`data:\` para inyectar su shim de \`require\`; desde
// esa base un \`import("./commands/x")\` RELATIVO no tiene dónde resolverse y Node 20
// lanza ERR_INVALID_URL. Node 22 lo tolera, así que el fallo sólo aparecía en CI,
// que corre el 20 del \`.nvmrc\`. La sonda es una herramienta de construcción: puede
// resolver rutas ella misma, y así no depende de cómo tsx cargue el módulo.
const BASE = pathToFileURL(process.cwd() + "/src/lib/cad/engine/");

type Bruto = Record<string, unknown>;
const entradas: Bruto[] = [];
// Orden determinista: por id de módulo, y dentro del módulo por el orden en que
// el propio módulo los exporta. El orden de \`CAD_COMMAND_DESCRIPTORS\` no decide
// nada aguas abajo —la cinta ordena con \`compareDeclared\`, que cae en
// \`localeCompare\`, y el registro ordena \`all()\` por nombre—, así que se elige el
// que un generador puede reproducir siempre igual.
for (const id of Object.keys(CAD_COMMAND_MODULE_LOADERS).sort()) {
  const modulo = (await import(new URL(id + ".ts", BASE).href)) as Bruto;
  const vistos = new Set<string>();
  for (const valor of Object.values(modulo)) {
    if (!Array.isArray(valor)) continue;
    for (const candidato of valor) {
      if (!candidato || typeof candidato !== "object") continue;
      const d = candidato as Bruto;
      if (typeof d.name !== "string") continue;
      if (typeof d.begin !== "function" || typeof d.step !== "function") continue;
      if (vistos.has(d.name)) continue;
      vistos.add(d.name);
      entradas.push({
        name: d.name,
        aliases: [...((d.aliases as string[] | undefined) ?? [])],
        kind: d.kind,
        transparent: d.transparent === true,
        selection: d.selection,
        repeatable: d.repeatable === true,
        mutates: d.mutates === true,
        ...(d.spatial === undefined ? {} : { spatial: d.spatial }),
        ...(d.cursor === undefined ? {} : { cursor: d.cursor }),
        module: id,
      });
    }
  }
}
process.stdout.write(JSON.stringify(entradas));
`,
    "utf8",
  );
  try {
    const stdout = execFileSync(process.execPath, [tsx, probePath], {
      cwd: web,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 32 * 1024 * 1024,
      timeout: 240_000,
    });
    return JSON.parse(stdout);
  } finally {
    rmSync(probePath, { force: true });
  }
}

const entradas = runProbe();

// Un nombre en dos módulos haría que `loadCadCommand` cargase el equivocado, y
// el registro reventaría por duplicado. Se comprueba aquí para que falle con el
// nombre delante y no en un import lejano.
const porNombre = new Map();
for (const entrada of entradas) {
  const previo = porNombre.get(entrada.name);
  if (previo)
    throw new Error(
      `build-command-manifest: «${entrada.name}» lo implementan dos módulos (${previo} y ${entrada.module}).`,
    );
  porNombre.set(entrada.name, entrada.module);
}

const modulos = new Set(entradas.map((entrada) => entrada.module)).size;

function literal(value) {
  return JSON.stringify(value);
}

function renderEntrada(entrada) {
  const campos = [
    `name: ${literal(entrada.name)}`,
    `aliases: ${entrada.aliases.length === 0 ? "[]" : `[${entrada.aliases.map(literal).join(", ")}]`}`,
    `kind: ${literal(entrada.kind)}`,
    `transparent: ${entrada.transparent}`,
    `selection: ${literal(entrada.selection)}`,
    `repeatable: ${entrada.repeatable}`,
    `mutates: ${entrada.mutates}`,
    ...(entrada.spatial === undefined ? [] : [`spatial: ${literal(entrada.spatial)}`]),
    ...(entrada.cursor === undefined ? [] : [`cursor: ${literal(entrada.cursor)}`]),
    `module: ${literal(entrada.module)}`,
  ];
  return `  { ${campos.join(", ")} },`;
}

const cabecera = `/**
 * METADATOS de los ${entradas.length} comandos del registro. GENERADO — no se edita a mano.
 *
 * Lo escribe \`node scripts/cad/build-command-manifest.mjs --write\` importando los
 * ${modulos} módulos REALES de \`./commands/*\` en Node, y \`--check\` —enganchado en
 * \`npm run check:cad\`— falla si lo committeado deja de coincidir con lo que los
 * descriptores dicen hoy. Regla 4 de la campaña de cimientos: ninguna cifra vive
 * en dos lugares, y un comando nuevo no puede entrar sin aparecer aquí.
 *
 * ## Qué hace aquí
 *
 * La cinta (\`ribbon.ts\`), la paleta Ctrl+K (\`command-palette.ts\`), la asistencia
 * de la línea de comandos y los tres gates que cuentan comandos leen \`name\`,
 * \`aliases\` y \`kind\` AL ABRIR el estudio. La máquina de estados \`begin\`/\`step\`
 * no la necesita nadie hasta que alguien teclea una orden. Así que los
 * metadatos viajan estáticos y la implementación llega por
 * \`lazy-commands.ts\` — el mismo reparto que \`lib/cad/commands/lazy.ts\`.
 *
 * \`module\` es el id del módulo que implementa el comando: lo que
 * \`loadCadCommand(nombre)\` necesita para saber qué \`import()\` disparar.
 */
import type { CadCommandKind, CadSelectionRule } from "./command-types";
import type { CadCommandModuleId } from "./lazy-commands";

export interface CadCommandManifestEntry {
  name: string;
  aliases: readonly string[];
  kind: CadCommandKind;
  transparent: boolean;
  selection: CadSelectionRule;
  repeatable: boolean;
  mutates: boolean;
  spatial?: boolean | "elevation";
  cursor?: "crosshair" | "pick" | "none";
  /** Módulo que trae \`begin\`/\`step\`. Su \`import()\` vive en \`lazy-commands.ts\`. */
  module: CadCommandModuleId;
}

export const CAD_COMMAND_MANIFEST: readonly CadCommandManifestEntry[] = [
`;

const rendered = `${cabecera}${entradas.map(renderEntrada).join("\n")}\n];\n`;

/**
 * El SEGUNDO artefacto: los 106 módulos con `import` ESTÁTICO, para Node.
 *
 * Los `.spec.ts` de este repo se cargan como CommonJS —`tsx` los transpila así—
 * y por tanto NO admiten `await` de nivel superior: un spec no puede esperar a
 * que llegue un `import()`. Con este archivo le basta una línea (`import
 * "./all-commands"`) para tener las 291 implementaciones, igual que antes de la
 * carga a demanda. El navegador nunca lo importa, y quien lo importara desde el
 * estudio lo vería en el acto: `e2e/performance/frontend-load-budget.spec.ts`
 * mide lo que se descarga de verdad y el techo no se toca para pasar.
 */
const ids = [...new Set(entradas.map((entrada) => entrada.module))].sort();
const alias = (index) => `m${String(index).padStart(3, "0")}`;
const allCommands = `/**
 * Los ${ids.length} módulos de comandos, con \`import\` ESTÁTICO. GENERADO — no se edita a mano.
 *
 * Lo escribe \`node scripts/cad/build-command-manifest.mjs --write\` y \`--check\`
 * lo verifica, del mismo tirón que \`command-manifest.ts\`.
 *
 * ## Para qué, y para qué NO
 *
 * PARA NODE: los specs y las sondas que ejecutan comandos de verdad. Un
 * \`.spec.ts\` se carga como CommonJS y no admite \`await\` de nivel superior, así
 * que no puede pedir \`cadWarmAllCommands()\`; con una línea —\`import
 * "../all-commands"\`— tiene las 291 implementaciones y sigue probando lo mismo
 * que probaba. En Node cargarlas todas no cuesta bytes de red.
 *
 * NO PARA EL NAVEGADOR. Importar esto desde el estudio deshace entero el arreglo
 * de carga del 2026-09-04 y devuelve las 291 implementaciones al primer chunk.
 * Lo impiden dos gates: \`build-command-manifest.mjs --check\`, que nombra el
 * fichero culpable en segundos, y \`e2e/performance/frontend-load-budget.spec.ts\`,
 * que mide lo que el navegador descarga de verdad contra un techo que sólo baja.
 */
import { cadRegisterCommandModules } from "./lazy-commands";

${ids.map((id, index) => `import * as ${alias(index)} from "./${id}";`).join("\n")}

cadRegisterCommandModules([
${ids.map((_, index) => `  ${alias(index)},`).join("\n")}
]);
`;
const allCommandsPath = path.join(web, "src/lib/cad/engine/all-commands.ts");

/**
 * `all-commands.ts` es SÓLO para Node. Importarlo desde código de producto
 * devuelve las 291 implementaciones al primer chunk y deshace el arreglo entero.
 *
 * Lo vigila también `e2e/performance/frontend-load-budget.spec.ts` —midiendo lo
 * que el navegador descarga de verdad—, pero esa spec necesita un build de
 * producción y un navegador. Esta comprobación cuesta un recorrido de ficheros y
 * dice el nombre del archivo culpable, que es lo que hace falta para arreglarlo.
 */
function importadoresDeAllCommands() {
  const raiz = path.join(web, "src");
  const culpables = [];
  const visitar = (dir) => {
    for (const entrada of readdirSync(dir)) {
      const absoluto = path.join(dir, entrada);
      if (statSync(absoluto).isDirectory()) {
        visitar(absoluto);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entrada)) continue;
      // Los specs SÍ deben importarlo: es su forma de tener el registro entero
      // sin `await` de nivel superior, que un `.spec.ts` no admite.
      if (entrada.endsWith(".spec.ts") || entrada.endsWith(".spec.tsx")) continue;
      if (absoluto === allCommandsPath) continue;
      const fuente = readFileSync(absoluto, "utf8");
      if (/\bfrom\s+"[^"]*all-commands"|\bimport\s+"[^"]*all-commands"/.test(fuente))
        culpables.push(path.relative(root, absoluto));
    }
  };
  visitar(raiz);
  return culpables;
}

const culpables = importadoresDeAllCommands();
if (culpables.length > 0) {
  console.error(
    `command-manifest: ${culpables.join(", ")} importa(n) all-commands.ts desde código de producto. ` +
      "Eso devuelve las 291 implementaciones al primer chunk del estudio. Use `loadCadCommand(nombre)` " +
      "(o `cadWarmAllCommands()` en un contexto que pueda esperar) en su lugar.",
  );
  process.exit(1);
}

const artefactos = [
  { file: outPath, content: rendered },
  { file: allCommandsPath, content: allCommands },
];

if (process.argv.includes("--write")) {
  for (const { file, content } of artefactos) writeFileSync(file, content, "utf8");
  console.log(
    `command-manifest: escritos ${artefactos.map(({ file }) => path.relative(root, file)).join(" y ")} — ` +
      `${entradas.length} comandos en ${modulos} módulos.`,
  );
} else {
  for (const { file, content } of artefactos) {
    if (!existsSync(file)) {
      console.error(`command-manifest: falta ${path.relative(root, file)}. Corre con --write.`);
      process.exit(1);
    }
    if (readFileSync(file, "utf8") !== content) {
      console.error(
        `command-manifest: ${path.relative(root, file)} está desactualizado respecto a los descriptores reales. ` +
          "Corre `node scripts/cad/build-command-manifest.mjs --write` y commitea el resultado.",
      );
      process.exit(1);
    }
  }
  console.log(
    `command-manifest OK — ${entradas.length} comandos en ${modulos} módulos, metadatos idénticos a los descriptores reales.`,
  );
}
