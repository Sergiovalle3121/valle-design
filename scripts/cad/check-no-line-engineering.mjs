import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const ignoredDirectories = new Set([
  // .claude aloja worktrees efímeros que el harness de agentes crea DENTRO del
  // repo; su contenido es una copia del árbol y barrerla duplica cada hallazgo.
  ".claude",
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const permittedLegacyBoundaries = [
  "apps/web/src/lib/cad/legacy/",
  // Definition only. Product call sites must use the typed design SDK.
  "apps/web/src/lib/apiFetch.ts",
];
const findings = [];
let scannedFiles = 0;

function relativePath(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function isPermittedBoundary(relative) {
  return permittedLegacyBoundaries.some((prefix) =>
    relative.startsWith(prefix),
  );
}

function isLegacyHttpRoute(text) {
  const value = text.trimStart();
  return (
    /^\/line-engineering(?:\/|\?|$)/.test(value) ||
    /^https?:\/\/[^\s/]+(?:\/[^\s/]*)*\/line-engineering(?:\/|\?|$)/i.test(
      value,
    )
  );
}

function inspectSource(file) {
  const relative = relativePath(file);
  if (isPermittedBoundary(relative)) return;
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    relative,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith(".tsx") || relative.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  scannedFiles += 1;

  const report = (node, text) => {
    if (!isLegacyHttpRoute(text)) return;
    const { line, character } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    findings.push(`${relative}:${line + 1}:${character + 1}`);
  };

  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "rawApiFetch") {
      const { line, character } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      findings.push(
        `${relative}:${line + 1}:${character + 1} (rawApiFetch fuera del límite legacy)`,
      );
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      report(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      report(node.head, node.head.text);
      for (const span of node.templateSpans)
        report(span.literal, span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      inspectSource(file);
    }
  }
}

walk(root);
if (findings.length) {
  console.error(
    [
      "URLs HTTP legacy prohibidas fuera del límite apps/web/src/lib/cad/legacy/:",
      ...findings,
    ].join("\n"),
  );
  process.exit(1);
}
console.log(
  `Gate legacy OK: ${scannedFiles} fuentes sin URLs HTTP /line-engineering/* fuera del adaptador permitido.`,
);
