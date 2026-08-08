/**
 * Presupuesto de tamaño de archivo — trinquete anti-retroceso.
 *
 * `Layout3DEditor.tsx` tiene 23.560 líneas en una sola función de ~21.000, con
 * 73 `useState` y 4 `useMemo`. El plan de paridad lo desmonta por olas, pero un
 * plan de descomposición sin gate es una intención: basta con que una ola
 * añada "sólo un panel más" para que el monolito vuelva a crecer y el trabajo
 * de la ola anterior se pierda.
 *
 * Este gate impone tres reglas:
 *
 *   1. Un archivo NUEVO no puede pasar de `maxLines` líneas (800 por defecto).
 *   2. Los archivos que hoy ya lo superan están en `allowances` con su tamaño
 *      real. Ese número sólo puede BAJAR: si un archivo crece por encima de su
 *      asignación, falla.
 *   3. Si un archivo adelgaza `ratchetSlack` líneas o más por debajo de su
 *      asignación, TAMBIÉN falla — pidiendo que se baje el número. Así el
 *      manifiesto siempre dice la verdad sobre el tamaño real, y el progreso
 *      de cada extracción queda visible en el diff en vez de diluirse.
 *
 * Además vigila el número de `useState` del monolito: la descomposición mueve
 * estado fuera, nunca dentro.
 *
 * Uso:
 *   node scripts/cad/check-monolith-budget.mjs                  # comprueba
 *   node scripts/cad/check-monolith-budget.mjs --update         # baja los techos alcanzados
 *   node scripts/cad/check-monolith-budget.mjs --update --allow-growth
 *
 * `--update` por sí solo SÓLO baja números. Subir el techo de un archivo exige
 * `--allow-growth`, que además imprime cuánto creció cada uno: así el
 * crecimiento nunca es silencioso — queda en el comando que se tecleó y en el
 * diff del manifiesto, delante de quien revisa.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(root, "scripts/cad/monolith-budget.json");
const update = process.argv.includes("--update");
const allowGrowth = process.argv.includes("--allow-growth");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const {
  maxLines,
  ratchetSlack,
  extensions,
  ignoredDirectories,
  ignoredFiles,
  allowances,
  stateCeilings,
} = manifest;

const ignoredDirectorySet = new Set(ignoredDirectories);
const ignoredFileSet = new Set(ignoredFiles);
const extensionSet = new Set(extensions);

/**
 * Archivos VERSIONADOS que participan del presupuesto.
 *
 * Se pregunta a git en vez de recorrer el disco. Recorrer el disco metió en el
 * manifiesto un artefacto de Playwright —`e2e/.test-results/…/traces/…js`, 2.236
 * líneas de código generado— que está en `.gitignore` y no existe en un clon
 * limpio. Presupuestar lo que no está versionado no significa nada: el número
 * depende de si alguien corrió los tests antes.
 *
 * Si git no está disponible se recorre el disco, que es mejor que no comprobar
 * nada, y se avisa de que el resultado puede incluir generados.
 */
function trackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return output
      .split("\0")
      .filter(Boolean)
      .filter((file) => extensionSet.has(path.extname(file)))
      .filter((file) => !ignoredFileSet.has(file))
      .filter((file) => !file.split("/").some((segment) => ignoredDirectorySet.has(segment)))
      // Un archivo borrado pero aún indexado no se puede medir.
      .filter((file) => fs.existsSync(path.join(root, file)));
  } catch {
    console.warn(
      "Aviso: git no disponible; se recorre el disco y el resultado puede incluir archivos generados.",
    );
    return walk(root);
  }
}

/** Recorre el árbol devolviendo rutas relativas al raíz, con `/` siempre. */
function walk(directory, into = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (ignoredDirectorySet.has(entry.name)) continue;
      walk(absolute, into);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoredFileSet.has(relative)) continue;
    if (!extensionSet.has(path.extname(entry.name))) continue;
    into.push(relative);
  }
  return into;
}

/**
 * Cuenta líneas como lo hace `wc -l`: el número de saltos de línea. Un archivo
 * sin salto final cuenta su última línea igual, para que el número coincida con
 * lo que ve quien abre el archivo en un editor.
 */
function countLines(source) {
  if (source.length === 0) return 0;
  let lines = 0;
  for (let index = 0; index < source.length; index += 1)
    if (source.charCodeAt(index) === 10) lines += 1;
  return source.endsWith("\n") ? lines : lines + 1;
}

function countStateHooks(source) {
  return (source.match(/\buseState\s*[<(]/g) ?? []).length;
}

const files = trackedFiles().sort();
const sizes = new Map();
const sources = new Map();
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  sources.set(file, source);
  sizes.set(file, countLines(source));
}

if (update) {
  const nextAllowances = {};
  const growth = [];
  for (const file of files) {
    const lines = sizes.get(file);
    if (lines <= maxLines) continue;
    const previous = allowances[file];
    if (previous !== undefined && lines > previous) growth.push({ file, previous, lines });
    nextAllowances[file] = lines;
  }
  const nextCeilings = {};
  for (const file of Object.keys(stateCeilings)) {
    const source = sources.get(file);
    if (source === undefined) {
      console.error(`El manifiesto vigila ${file}, que ya no existe.`);
      process.exit(1);
    }
    const hooks = countStateHooks(source);
    if (hooks > stateCeilings[file])
      growth.push({ file: `${file} (useState)`, previous: stateCeilings[file], lines: hooks });
    nextCeilings[file] = hooks;
  }

  if (growth.length > 0 && !allowGrowth) {
    console.error(
      "\nEste `--update` SUBIRÍA techos, y el trinquete sólo baja. Si el crecimiento" +
        " está justificado, repite con `--allow-growth` y explícalo en el PR:\n",
    );
    for (const entry of growth)
      console.error(`  - ${entry.file}: ${entry.previous} → ${entry.lines} (+${entry.lines - entry.previous})`);
    process.exit(1);
  }

  const next = { ...manifest, allowances: nextAllowances, stateCeilings: nextCeilings };
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  for (const entry of growth)
    console.warn(`Techo SUBIDO a mano: ${entry.file} ${entry.previous} → ${entry.lines} (+${entry.lines - entry.previous}).`);
  console.log(
    `monolith-budget.json actualizado: ${Object.keys(nextAllowances).length} asignaciones, ${Object.keys(nextCeilings).length} techos de estado.`,
  );
  process.exit(0);
}

const errors = [];

for (const file of files) {
  const lines = sizes.get(file);
  const allowance = allowances[file];

  if (allowance === undefined) {
    if (lines > maxLines)
      errors.push(
        `${file}: ${lines} líneas supera el máximo de ${maxLines} para un archivo no presupuestado. ` +
          `Divídelo; no lo añadas al manifiesto salvo que exista una razón escrita.`,
      );
    continue;
  }

  if (lines > allowance)
    errors.push(
      `${file}: ${lines} líneas supera su asignación de ${allowance}. ` +
        `Este archivo sólo puede encoger — mueve el código nuevo a un módulo aparte.`,
    );
  else if (lines <= allowance - ratchetSlack)
    errors.push(
      `${file}: bajó a ${lines} líneas y su asignación sigue en ${allowance}. ` +
        `Ejecuta \`node scripts/cad/check-monolith-budget.mjs --update\` para fijar el nuevo techo.`,
    );
}

for (const [file, ceiling] of Object.entries(stateCeilings)) {
  const source = sources.get(file);
  if (source === undefined) {
    errors.push(`${file}: el manifiesto lo vigila pero el archivo no existe.`);
    continue;
  }
  const hooks = countStateHooks(source);
  if (hooks > ceiling)
    errors.push(
      `${file}: ${hooks} llamadas a useState superan el techo de ${ceiling}. ` +
        `La descomposición saca estado del monolito; no mete más.`,
    );
  else if (hooks < ceiling)
    errors.push(
      `${file}: bajó a ${hooks} llamadas a useState y el techo sigue en ${ceiling}. ` +
        `Ejecuta \`node scripts/cad/check-monolith-budget.mjs --update\`.`,
    );
}

// Referencia de progreso: sale siempre, falle o no, para que el número del
// monolito esté delante de quien mira el log de CI.
for (const file of Object.keys(stateCeilings))
  if (sizes.has(file))
    console.log(`Presupuesto: ${file} → ${sizes.get(file)} líneas, ${countStateHooks(sources.get(file))} useState.`);

if (errors.length > 0) {
  console.error(`\nPresupuesto de monolito: ${errors.length} problema(s).\n`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Presupuesto de monolito OK: ${files.length} archivos, ${Object.keys(allowances).length} con asignación explícita.`,
);
