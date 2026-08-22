/**
 * Histórico de la rúbrica: una corrida = un archivo con fecha y commit.
 *
 * Vive aparte de `rubric.mjs` por el tope de 800 líneas para archivos no
 * presupuestados — el mismo trinquete que este repositorio aplica al
 * monolito se aplica a sus propios scripts. La calculadora lo re-exporta,
 * así que sus consumidores (spec y CLI) no cambian.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Recomputadas y no importadas de rubric.mjs: un ciclo de imports entre la
// calculadora y su histórico sería frágil gratis.
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const HISTORY_DIR = path.join(REPO_ROOT, "docs/competitive/history");

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
