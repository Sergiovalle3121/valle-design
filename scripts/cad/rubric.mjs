#!/usr/bin/env node
/**
 * Calculadora de la rúbrica competitiva frente a AutoCAD 2027.
 *
 * POR QUÉ EXISTE. `docs/competitive/autocad-2027-gap-matrix.md` era una tabla
 * escrita a mano, y una tabla escrita a mano envejece en silencio: la ola 1
 * construyó un kernel B-rep y un intérprete AutoLISP completos y la matriz
 * seguía diciendo «Ausente», mientras citaba benchmarks de 25 s que ya no eran
 * ciertos. Un documento que sólo se actualiza cuando alguien se acuerda no
 * sirve para responderle a un cliente «¿cuánto os falta para AutoCAD?».
 *
 * LA REGLA. Sin evidencia, cero. No hay puntos de oficio. Cada punto de
 * `docs/competitive/rubric.json` declara qué lo demuestra, y este script va a
 * verlo al árbol de hoy: que el archivo exista, que la spec esté en el runner,
 * que el comando esté en el registro, que ALGUIEN IMPORTE el módulo. Esa última
 * la enseñó la ola 1: tres subsistemas terminados, probados y que nadie
 * enchufaba. Un módulo que nadie importa no es una capacidad del producto.
 *
 * LO QUE NO PUEDE AUTOMATIZARSE se declara `manual` con fecha y firma de quien
 * lo comprobó, y CADUCA. Una rúbrica que se autoevalúa sin evidencia es peor
 * que ninguna: da una cifra con la que discutir sin nada que la sostenga.
 *
 * NO ES UN GATE. `npm run check:cad` lo ejecuta como informativo y este script
 * sale con 0 aunque la puntuación baje. Una rúbrica que bloquea el merge se
 * convierte, en dos semanas, en una rúbrica que la gente infla para poder
 * mergear. Sólo `--strict` (lo usa su propia spec) convierte fallos en salida
 * distinta de cero, y aun así sólo por errores de DEFINICIÓN, nunca por la nota.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const DEFAULT_RUBRIC = path.join(
  REPO_ROOT,
  "docs/competitive/rubric.json",
);
export const HISTORY_DIR = path.join(REPO_ROOT, "docs/competitive/history");
const PROBE = path.join(here, "rubric-registry-probe.mts");
const WEB = "apps/web";
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Definición
// ---------------------------------------------------------------------------

/** Lee la rúbrica. Un JSON ilegible es un error de definición, no una nota. */
export function loadRubric(file = DEFAULT_RUBRIC) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Errores que invalidan la rúbrica ENTERA, no un punto.
 *
 * El denominador es público: si la suma de los puntos por categoría no da el
 * total declarado, la nota que salga es aritmética inventada y no se publica.
 */
export function validateRubric(rubric) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(rubric?.categories) || rubric.categories.length === 0)
    return ["La rúbrica no declara categorías."];
  let declared = 0;
  for (const category of rubric.categories) {
    if (!category.id) errors.push("Categoría sin id.");
    if (ids.has(category.id))
      errors.push(`Categoría duplicada: ${category.id}`);
    ids.add(category.id);
    declared += category.points ?? 0;
    const sum = (category.criteria ?? []).reduce(
      (acc, c) => acc + (c.points ?? 0),
      0,
    );
    if (sum !== category.points)
      errors.push(
        `${category.id}: los criterios suman ${sum} y la categoría declara ${category.points}.`,
      );
    for (const criterion of category.criteria ?? []) {
      if (ids.has(criterion.id))
        errors.push(`Criterio duplicado: ${criterion.id}`);
      ids.add(criterion.id);
      if (!(criterion.points > 0))
        errors.push(`${criterion.id}: puntos no positivos.`);
      if (!Array.isArray(criterion.evidence) || criterion.evidence.length === 0)
        errors.push(
          `${criterion.id}: sin evidencia declarada (sería un punto de oficio).`,
        );
      for (const item of criterion.evidence ?? [])
        if (!CHECKERS[item?.kind])
          errors.push(
            `${criterion.id}: evidencia desconocida "${item?.kind}".`,
          );
    }
  }
  if (declared !== rubric.totalPoints)
    errors.push(
      `El denominador publicado es ${rubric.totalPoints} y las categorías suman ${declared}.`,
    );
  return errors;
}

// ---------------------------------------------------------------------------
// Contexto de verificación
// ---------------------------------------------------------------------------

/**
 * Estado compartido por todas las comprobaciones de una corrida.
 *
 * El registro de comandos y el índice de importadores se calculan como mucho
 * una vez: el primero cuesta arrancar `tsx`, el segundo leer el árbol entero.
 */
export function createContext({
  root = REPO_ROOT,
  now = new Date(),
  runSpecs = false,
} = {}) {
  return {
    root,
    now,
    runSpecs,
    registry: undefined,
    importIndex: new Map(),
    specRuns: new Map(),
  };
}

const abs = (ctx, rel) => path.resolve(ctx.root, rel);
const exists = (ctx, rel) => fs.existsSync(abs(ctx, rel));
const read = (ctx, rel) => fs.readFileSync(abs(ctx, rel), "utf8");

/**
 * Registro de comandos real, no adivinado.
 *
 * Si falla (sin `npm ci`, sin `tsx`), devuelve `null` y las comprobaciones que
 * dependen de él quedan NO VERIFICABLES. No conceden el punto: preferimos una
 * nota baja y explicada a una nota alta y falsa.
 */
function commandRegistry(ctx) {
  if (ctx.registry !== undefined) return ctx.registry;
  ctx.registry = null;
  try {
    const require = createRequire(import.meta.url);
    const tsx = require.resolve("tsx/cli", {
      paths: [path.join(ctx.root, WEB), ctx.root],
    });
    const out = execFileSync(process.execPath, [tsx, PROBE], {
      cwd: path.join(ctx.root, WEB),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    ctx.registry = JSON.parse(out);
  } catch {
    ctx.registry = null;
  }
  return ctx.registry;
}

// `import "./x"` sin `from` cuenta igual: es un import por efecto secundario, y
// para «¿alguien usa esto?» un efecto secundario es uso de pleno derecho.
const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** Ficheros bajo `dir` (recursivo), saltando lo que no es fuente. */
function sourceFiles(root, dir, out = []) {
  const full = path.resolve(root, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    // Siempre en forma POSIX: la evidencia de la rúbrica y los importadores se
    // publican con `/`, y en Windows `path.join` produciría `\`.
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(root, rel, out);
    else if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/**
 * ¿Quién importa este módulo desde FUERA de él?
 *
 * Resuelve el especificador contra el fichero que importa y contra el alias
 * `@/` del web, porque las dos formas conviven en el árbol. Los ficheros del
 * propio módulo no cuentan: un subsistema que sólo se importa a sí mismo es
 * exactamente el caso que esta comprobación existe para detectar.
 *
 * Las specs TAMPOCO cuentan salvo que se pidan. Un módulo probado por su propia
 * suite y no usado por ninguna pantalla sigue sin ser una capacidad del
 * producto; contar la spec como uso convertiría la comprobación en un espejo.
 */
export function findImporters(
  ctx,
  moduleDir,
  { scope = `${WEB}/src`, includeSpecs = false } = {},
) {
  const key = `${scope}::${moduleDir}::${includeSpecs}`;
  if (ctx.importIndex.has(key)) return ctx.importIndex.get(key);
  const target = path.resolve(ctx.root, moduleDir);
  // `./repositories/client` y `repositories/client.ts` son el mismo módulo: los
  // imports del árbol se escriben sin extensión.
  const targetNoExt = target.replace(/\.(tsx?|mts|mjs|jsx?)$/, "");
  const webSrc = path.resolve(ctx.root, WEB, "src");
  const importers = [];
  for (const rel of sourceFiles(ctx.root, scope)) {
    const file = path.resolve(ctx.root, rel);
    if (file === target || file.startsWith(`${target}${path.sep}`)) continue;
    if (!includeSpecs && /\.spec\.[a-z]+$/.test(rel)) continue;
    let source;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1];
      const resolved = spec.startsWith("@/")
        ? path.resolve(webSrc, spec.slice(2))
        : spec.startsWith(".")
          ? path.resolve(path.dirname(file), spec)
          : null;
      if (!resolved) continue;
      if (
        resolved === targetNoExt ||
        resolved === target ||
        resolved.startsWith(`${target}${path.sep}`)
      ) {
        importers.push(rel);
        break;
      }
    }
  }
  ctx.importIndex.set(key, importers);
  return importers;
}

/** Ejecuta una spec con `tsx`. El runner del web exige salida por stdout. */
function runSpec(ctx, rel) {
  if (ctx.specRuns.has(rel)) return ctx.specRuns.get(rel);
  const require = createRequire(import.meta.url);
  let outcome;
  try {
    const tsx = require.resolve("tsx/cli", {
      paths: [path.join(ctx.root, WEB), ctx.root],
    });
    const run = spawnSync(
      process.execPath,
      [tsx, path.resolve(ctx.root, rel)],
      {
        cwd: path.join(ctx.root, WEB),
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    outcome =
      run.status !== 0
        ? { ok: false, detail: "la spec falló" }
        : !String(run.stdout ?? "").trim()
          ? {
              ok: false,
              detail: "la spec no imprimió nada (el runner la da por fallida)",
            }
          : { ok: true, detail: "spec verde" };
  } catch {
    outcome = { ok: null, detail: "no se pudo ejecutar (¿falta npm ci?)" };
  }
  ctx.specRuns.set(rel, outcome);
  return outcome;
}

// ---------------------------------------------------------------------------
// Comprobadores de evidencia
// ---------------------------------------------------------------------------

const pass = (detail) => ({ ok: true, detail });
const fail = (detail) => ({ ok: false, detail });
/** `ok: null` = no verificable aquí. NO concede el punto; sólo lo explica. */
const unknown = (detail) => ({ ok: null, detail });

function readPointer(value, pointer) {
  let current = value;
  for (const step of pointer.split("/").filter(Boolean)) {
    if (current === null || typeof current !== "object") return undefined;
    current = current[step];
  }
  return current;
}

const CHECKERS = {
  /** El archivo existe (y, si se pide, tiene cuerpo suficiente). */
  file(item, ctx) {
    if (!exists(ctx, item.path)) return fail(`no existe ${item.path}`);
    if (item.minLines) {
      const lines = read(ctx, item.path).split("\n").length;
      if (lines < item.minLines)
        return fail(
          `${item.path} tiene ${lines} líneas, se esperaban ≥${item.minLines}`,
        );
      return pass(`${item.path} (${lines} líneas)`);
    }
    return pass(item.path);
  },

  /**
   * La spec existe, está donde el runner la ve y —con `--run-specs`— pasa.
   *
   * Sin la primera condición una spec «de evidencia» puede vivir fuera del
   * glob y no ejecutarse jamás; eso es peor que no tenerla, porque parece que
   * la hay.
   */
  spec(item, ctx) {
    if (!exists(ctx, item.path)) return fail(`no existe ${item.path}`);
    if (!item.path.startsWith(`${WEB}/src/`) || !item.path.endsWith(".spec.ts"))
      return fail(`${item.path} no está en el glob de run-specs.mjs`);
    if (!ctx.runSpecs)
      return pass(`${item.path} (existencia; --run-specs la ejecuta)`);
    const result = runSpec(ctx, item.path);
    return result.ok === null
      ? unknown(`${item.path}: ${result.detail}`)
      : result.ok
        ? pass(`${item.path}: ${result.detail}`)
        : fail(`${item.path}: ${result.detail}`);
  },

  /** Golden de Playwright. Existencia: ejecutarlo aquí costaría media hora. */
  golden(item, ctx) {
    if (!item.path.startsWith(`${WEB}/e2e/`))
      return fail(`${item.path} no está en e2e/`);
    return exists(ctx, item.path)
      ? pass(item.path)
      : fail(`no existe ${item.path}`);
  },

  /** El comando es tecleable: está en el registro del motor. */
  command(item, ctx) {
    const registry = commandRegistry(ctx);
    if (!registry) return unknown(`registro no consultable para ${item.name}`);
    return registry.commands.includes(item.name)
      ? pass(`${item.name} está en el registro`)
      : fail(`${item.name} NO está en el registro de comandos`);
  },

  /** El alias resuelve a un comando registrado (`TR` recorta de verdad). */
  alias(item, ctx) {
    const registry = commandRegistry(ctx);
    if (!registry) return unknown(`registro no consultable para ${item.alias}`);
    const dangling = registry.unresolvedAliases.some((entry) =>
      entry.startsWith(`${item.alias}→`),
    );
    return dangling
      ? fail(`el alias ${item.alias} no resuelve a ningún comando`)
      : pass(`el alias ${item.alias} resuelve`);
  },

  /** Alguien fuera del módulo lo importa. La lección cara de la ola 1. */
  imported(item, ctx) {
    const scope = item.scope ?? `${WEB}/src`;
    const importers = findImporters(ctx, item.module, {
      scope,
      includeSpecs: item.includeSpecs === true,
    });
    const min = item.min ?? 1;
    return importers.length >= min
      ? pass(
          `${item.module}: ${importers.length} importador(es), p. ej. ${importers[0]}`,
        )
      : fail(
          `${item.module}: NADIE lo importa desde ${scope} (sin contar specs)`,
        );
  },

  /** El texto aparece en el archivo. Para contratos escritos en la fuente. */
  grep(item, ctx) {
    if (!exists(ctx, item.path)) return fail(`no existe ${item.path}`);
    const matches =
      read(ctx, item.path).match(new RegExp(item.pattern, item.flags ?? "g")) ??
      [];
    const min = item.min ?? 1;
    return matches.length >= min
      ? pass(
          `${item.path}: ${matches.length} coincidencia(s) de /${item.pattern}/`,
        )
      : fail(
          `${item.path}: ${matches.length} coincidencia(s) de /${item.pattern}/, se pedían ≥${min}`,
        );
  },

  /**
   * Un número medido, con su umbral, leído del artefacto de evidencia.
   *
   * La regla del documento —si citas rendimiento, cita la máquina— se cumple
   * exigiendo que el artefacto declare su entorno; un número sin máquina no es
   * evidencia, es una anécdota.
   */
  metric(item, ctx) {
    if (!exists(ctx, item.path)) return fail(`no existe ${item.path}`);
    let data;
    try {
      data = JSON.parse(read(ctx, item.path));
    } catch {
      return fail(`${item.path} no es JSON`);
    }
    if (
      item.requireEnvironment !== false &&
      !readPointer(data, item.environmentPointer ?? "environment")
    )
      return fail(
        `${item.path} no declara la máquina; un número sin máquina no es evidencia`,
      );
    const value = readPointer(data, item.pointer);
    if (typeof value !== "number")
      return fail(`${item.path}${item.pointer} no es un número`);
    if (item.max !== undefined && value > item.max)
      return fail(`${item.pointer} = ${value} > ${item.max}`);
    if (item.min !== undefined && value < item.min)
      return fail(`${item.pointer} = ${value} < ${item.min}`);
    return pass(`${item.pointer} = ${value} (${item.unit ?? "u"})`);
  },

  /**
   * Comprobación humana, con firma y fecha, y con caducidad.
   *
   * Caduca porque un «lo verifiqué yo» de hace un año no dice nada del árbol de
   * hoy, y porque sin caducidad la casilla manual es la puerta por la que la
   * rúbrica se convierte en autobombo.
   */
  manual(item, ctx, rubric) {
    if (!item.verifiedBy || !item.verifiedAt)
      return fail("evidencia manual sin firma o sin fecha");
    const when = Date.parse(item.verifiedAt);
    if (Number.isNaN(when))
      return fail(`fecha manual ilegible: ${item.verifiedAt}`);
    const maxAge = item.maxAgeDays ?? rubric.manualMaxAgeDays ?? 180;
    const ageDays = Math.floor((ctx.now.getTime() - when) / DAY_MS);
    if (ageDays > maxAge)
      return fail(
        `comprobación manual caducada (${ageDays} d > ${maxAge} d), refírmala`,
      );
    return pass(
      `MANUAL · ${item.verifiedBy} · ${item.verifiedAt} (${ageDays} d)`,
    );
  },
};

// ---------------------------------------------------------------------------
// Puntuación
// ---------------------------------------------------------------------------

/**
 * Puntúa la rúbrica contra el árbol.
 *
 * Un criterio se concede sólo si TODA su evidencia verifica. No hay crédito
 * parcial dentro de un criterio: un punto de HATCH que tiene motor pero no
 * comando tecleable no es «medio HATCH», es un punto que no está.
 */
export function scoreRubric(rubric, ctx = createContext()) {
  const categories = rubric.categories.map((category) => {
    const criteria = (category.criteria ?? []).map((criterion) => {
      const evidence = (criterion.evidence ?? []).map((item) => {
        const checker = CHECKERS[item.kind];
        const outcome = checker
          ? checker(item, ctx, rubric)
          : fail(`evidencia desconocida "${item.kind}"`);
        return { kind: item.kind, ...outcome };
      });
      const granted =
        evidence.length > 0 && evidence.every((e) => e.ok === true);
      const blocked = evidence.some((e) => e.ok === null);
      return {
        id: criterion.id,
        text: criterion.text,
        points: criterion.points,
        earned: granted ? criterion.points : 0,
        status: granted
          ? "otorgado"
          : blocked
            ? "no-verificable"
            : "no-otorgado",
        evidence,
      };
    });
    const earned = criteria.reduce((acc, c) => acc + c.earned, 0);
    return {
      id: category.id,
      group: category.group,
      name: category.name,
      points: category.points,
      earned,
      ratio: category.points ? earned / category.points : 0,
      gap: category.gap,
      criteria,
    };
  });
  const earned = categories.reduce((acc, c) => acc + c.earned, 0);
  return {
    schemaVersion: 1,
    rubricVersion: rubric.version ?? null,
    cutoffDate: rubric.cutoffDate ?? null,
    totalPoints: rubric.totalPoints,
    earned,
    percentage: Number(((earned / rubric.totalPoints) * 100).toFixed(1)),
    definitionErrors: validateRubric(rubric),
    categories,
  };
}

/**
 * Los diez puntos más baratos por unidad de valor comercial.
 *
 * Sale de los datos, no de la intuición: entre los criterios NO otorgados,
 * ordena por coste declarado dividido por puntos. Cuando un criterio no declara
 * coste, se ordena al final —no se inventa un número para que salga barato.
 */
export function cheapestWins(rubric, scored, limit = 10) {
  const byId = new Map();
  for (const category of rubric.categories)
    for (const criterion of category.criteria ?? [])
      byId.set(criterion.id, { criterion, category });
  const pending = [];
  for (const category of scored.categories)
    for (const criterion of category.criteria) {
      if (criterion.status === "otorgado") continue;
      const cost = byId.get(criterion.id)?.criterion.costDays;
      pending.push({
        id: criterion.id,
        category: category.name,
        text: criterion.text,
        points: criterion.points,
        costDays: typeof cost === "number" ? cost : null,
        ratio:
          typeof cost === "number" && cost > 0 ? criterion.points / cost : null,
      });
    }
  return pending
    .sort(
      (a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

const bar = (ratio) => {
  const filled = Math.round(ratio * 20);
  return `${"█".repeat(filled)}${"·".repeat(20 - filled)}`;
};

export function formatReport(scored, { verbose = false } = {}) {
  const lines = [];
  lines.push("RÚBRICA COMPETITIVA CAD — Valle Design frente a AutoCAD 2027");
  lines.push(`Corte de la rúbrica: ${scored.cutoffDate ?? "sin fecha"}`);
  lines.push("");
  for (const error of scored.definitionErrors)
    lines.push(`❌ DEFINICIÓN: ${error}`);
  if (scored.definitionErrors.length) lines.push("");
  for (const category of scored.categories) {
    lines.push(
      `${bar(category.ratio)} ${String(category.earned).padStart(3)}/${String(category.points).padEnd(3)} ${category.name}`,
    );
    for (const criterion of category.criteria) {
      if (criterion.status === "otorgado" && !verbose) continue;
      const mark =
        criterion.status === "otorgado"
          ? "✅"
          : criterion.status === "no-verificable"
            ? "❓"
            : "⬜";
      lines.push(`      ${mark} ${criterion.points} pt · ${criterion.text}`);
      for (const item of criterion.evidence)
        if (item.ok !== true || verbose)
          lines.push(
            `           ${item.ok === true ? "·" : item.ok === null ? "?" : "×"} ${item.detail}`,
          );
    }
  }
  lines.push("");
  // La coletilla se CALCULA. Decía «ninguna fila llega a su tope» como texto
  // fijo, y el día que una llegó siguió diciéndolo: una rúbrica que se escribe
  // a sí misma una frase que ya no es cierta es la misma tabla escrita a mano
  // que este script existe para sustituir.
  const capped = scored.categories.filter(
    (category) => category.earned >= category.points,
  );
  lines.push(
    `TOTAL ${scored.earned}/${scored.totalPoints} (${scored.percentage} %) — el denominador es ` +
      `público y ${
        capped.length === 0
          ? "ninguna fila llega a su tope"
          : `${capped.length} fila(s) llegan a su tope: ${capped
              .map((category) => category.name ?? category.id)
              .join(", ")}`
      }.`,
  );
  const blocked = scored.categories
    .flatMap((c) => c.criteria)
    .filter((c) => c.status === "no-verificable");
  if (blocked.length)
    lines.push(
      `${blocked.length} criterio(s) NO VERIFICABLES en este entorno; no se conceden. Instala dependencias (npm ci) para resolverlos.`,
    );
  lines.push(
    "Informativo: este script nunca bloquea el CI. Una rúbrica que bloquea se infla.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

function currentCommit(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Guarda la corrida con su fecha y su commit.
 *
 * «¿Cuánto hemos avanzado este mes?» no se responde con una foto; hace falta la
 * serie. Se guarda el desglose por categoría, no sólo el total, porque un total
 * plano puede esconder que una categoría subió y otra se cayó.
 */
export function writeHistory(
  scored,
  { root = REPO_ROOT, dir = HISTORY_DIR, now = new Date() } = {},
) {
  const commit = currentCommit(root);
  const stamp = now.toISOString().slice(0, 10);
  const short = commit ? commit.slice(0, 7) : "sin-commit";
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stamp}-${short}.json`);
  const entry = {
    $schema: "urn:valle-design:schema:cad-competitive-rubric-history:v1",
    schemaVersion: 1,
    measuredAt: now.toISOString(),
    commit,
    totalPoints: scored.totalPoints,
    earned: scored.earned,
    percentage: scored.percentage,
    categories: scored.categories.map((category) => ({
      id: category.id,
      name: category.name,
      points: category.points,
      earned: category.earned,
      notGranted: category.criteria
        .filter((c) => c.status !== "otorgado")
        .map((c) => c.id),
    })),
  };
  fs.writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  return file;
}

/** Serie temporal ordenada, para responder «¿cuánto hemos avanzado?». */
export function readHistory(dir = HISTORY_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    verbose: false,
    runSpecs: false,
    strict: false,
    history: false,
    json: null,
    priorities: false,
  };
  let rubric = DEFAULT_RUBRIC;
  let root = REPO_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--verbose") options.verbose = true;
    else if (arg === "--run-specs") options.runSpecs = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--history") options.history = true;
    else if (arg === "--priorities") options.priorities = true;
    else if (arg === "--json") options.json = argv[++i];
    else if (arg === "--rubric") rubric = path.resolve(argv[++i]);
    else if (arg === "--root") root = path.resolve(argv[++i]);
  }
  return { ...options, rubric, root };
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2));
  const rubric = loadRubric(options.rubric);
  const scored = scoreRubric(
    rubric,
    createContext({ root: options.root, runSpecs: options.runSpecs }),
  );
  console.log(formatReport(scored, { verbose: options.verbose }));
  if (options.priorities) {
    console.log(
      "\nDiez puntos más baratos por valor comercial (orden sugerido de la ola 3):",
    );
    for (const [index, win] of cheapestWins(rubric, scored).entries())
      console.log(
        `${String(index + 1).padStart(2)}. ${win.points} pt / ${win.costDays ?? "?"} d · ${win.category} — ${win.text}`,
      );
  }
  if (options.json) {
    fs.mkdirSync(path.dirname(path.resolve(options.json)), { recursive: true });
    fs.writeFileSync(
      path.resolve(options.json),
      `${JSON.stringify(scored, null, 2)}\n`,
    );
    console.log(`Desglose completo en ${options.json}`);
  }
  if (options.history)
    console.log(`Histórico: ${writeHistory(scored, { root: options.root })}`);
  // La nota NUNCA cambia el código de salida. Sólo un error de definición lo
  // hace, y sólo con --strict: es un fallo del documento, no del producto.
  process.exit(options.strict && scored.definitionErrors.length ? 1 : 0);
}
