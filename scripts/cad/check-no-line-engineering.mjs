import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const ignored = new Set([".git", "node_modules", ".next", "dist"]);
const bad = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (
      relative.startsWith("docs/") ||
      relative.includes("/legacy/") ||
      relative === "scripts/cad/check-no-line-engineering.mjs"
    )
      continue;
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (line.includes("/line-engineering/"))
        bad.push(`${relative}:${index + 1}`);
    });
  }
}
walk(root);
if (bad.length) {
  console.error(`Rutas HTTP legacy prohibidas:\n${bad.join("\n")}`);
  process.exit(1);
}
console.log(
  "Gate legacy OK: ninguna ruta HTTP prohibida fuera de docs/ y legacy/.",
);
