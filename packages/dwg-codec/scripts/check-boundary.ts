import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "src");

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`DWG package boundary violation: ${message}`);
}

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonObject;
}

function isInside(parent: string, child: string): boolean {
  const candidate = relative(parent, child);
  return (
    candidate === "" ||
    (!candidate.startsWith(`..${sep}`) &&
      candidate !== ".." &&
      !isAbsolute(candidate))
  );
}

function asciiOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function collectTypeScriptFiles(
  directory: string,
  containmentRoot = sourceRoot,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    asciiOrder(left.name, right.name),
  )) {
    const entryPath = resolve(directory, entry.name);
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink()) {
      fail(
        `symlinks are not allowed in the laboratory: ${relative(packageRoot, entryPath)}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath, containmentRoot)));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      const canonical = await realpath(entryPath);
      if (!isInside(await realpath(containmentRoot), canonical)) {
        fail(
          `TypeScript file escapes its expected root: ${relative(packageRoot, entryPath)}`,
        );
      }
      files.push(entryPath);
    }
  }
  return files;
}

function moduleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      values.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      values.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]!)
    ) {
      values.push(node.arguments[0]!.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function rejectOpaqueModuleLoads(
  sourceFile: ts.SourceFile,
  file: string,
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      (node.arguments.length !== 1 ||
        !ts.isStringLiteralLike(node.arguments[0]!))
    ) {
      fail(`${relative(packageRoot, file)} uses a non-literal module load`);
    }
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "eval") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "process" &&
          node.expression.name.text === "getBuiltinModule"))
    ) {
      fail(
        `${relative(packageRoot, file)} uses an indirect code or module loader`,
      );
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Function"
    ) {
      fail(`${relative(packageRoot, file)} constructs dynamic code`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Function"
    ) {
      fail(`${relative(packageRoot, file)} calls the dynamic Function loader`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function runDynamicCodeNegativeControls(): number {
  const hostileSources = ['Function("return 1")', 'new Function("return 1")'];
  for (const [index, source] of hostileSources.entries()) {
    const parsed = ts.createSourceFile(
      resolve(sourceRoot, `dynamic-code-negative-control-${index}.ts`),
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let rejected = false;
    try {
      rejectOpaqueModuleLoads(parsed, parsed.fileName);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      fail(`dynamic-code analyzer accepted negative control ${index}`);
    }
  }
  return hostileSources.length;
}

function checkPackageManifest(manifest: JsonObject): void {
  if (manifest.private !== true) fail("package.json must keep private:true");
  if (manifest.license !== "UNLICENSED")
    fail("package.json must keep license UNLICENSED");
  if (manifest.sideEffects !== false)
    fail("package.json must keep sideEffects:false");
  if ("publishConfig" in manifest)
    fail("publishConfig is forbidden for the private laboratory");
  if ("bin" in manifest) fail("an executable publication surface is forbidden");

  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ]) {
    const value = manifest[field];
    if (value === undefined) continue;
    if (
      Array.isArray(value)
        ? value.length > 0
        : Object.keys(asObject(value, field)).length > 0
    ) {
      fail(
        `${field} must be absent or empty; the codec has zero runtime dependencies`,
      );
    }
  }

  const files = manifest.files;
  // Dos superficies publicables admitidas, y ninguna otra: "dist" a solas
  // (el laboratorio, siempre), o "dist" más "dist-cjs" — el build CJS
  // secundario del único consumidor runtime autorizado (ADR-0009 §6-bis).
  // Ambos son build output del mismo `src/`, nunca una fuente nueva.
  const allowedFileSets = [["dist"], ["dist", "dist-cjs"]];
  const matchesAllowedSet =
    Array.isArray(files) &&
    allowedFileSets.some(
      (allowed) =>
        allowed.length === files.length &&
        allowed.every((entry) => files.includes(entry)),
    );
  if (!matchesAllowedSet) {
    fail('package files must expose only "dist", optionally plus "dist-cjs"');
  }
}

async function checkSourceImports(): Promise<number> {
  const files = await collectTypeScriptFiles(sourceRoot);
  if (files.length === 0) fail("src must contain the TypeScript baseline");

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const parsed = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    rejectOpaqueModuleLoads(parsed, file);
    for (const specifier of moduleSpecifiers(parsed)) {
      if (!specifier.startsWith(".")) {
        fail(
          `${relative(packageRoot, file)} imports external or product module ${JSON.stringify(specifier)}`,
        );
      }
      const target = resolve(dirname(file), specifier);
      if (!isInside(sourceRoot, target)) {
        fail(
          `${relative(packageRoot, file)} import escapes src: ${JSON.stringify(specifier)}`,
        );
      }
    }
  }
  return files.length;
}

async function checkLaboratoryImports(): Promise<number> {
  const roots = [
    "tests",
    "scripts",
    "fuzz",
    "benchmarks",
    "fixtures/generators",
  ];
  let checkedFiles = 0;
  for (const root of roots) {
    const directory = resolve(packageRoot, root);
    let files: string[];
    try {
      files = await collectTypeScriptFiles(directory, directory);
    } catch (error) {
      const detail = error as NodeJS.ErrnoException;
      if (detail.code === "ENOENT") continue;
      throw error;
    }
    for (const file of files) {
      checkedFiles += 1;
      const parsed = ts.createSourceFile(
        file,
        await readFile(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      for (const specifier of moduleSpecifiers(parsed)) {
        if (specifier.startsWith(".")) {
          if (!isInside(packageRoot, resolve(dirname(file), specifier))) {
            fail(
              `${relative(packageRoot, file)} import escapes the laboratory: ${JSON.stringify(specifier)}`,
            );
          }
          continue;
        }
        if (
          specifier.startsWith("@valle/") ||
          specifier.startsWith("@valle-design/") ||
          specifier.startsWith("@nestjs/") ||
          specifier === "react" ||
          specifier.startsWith("react/") ||
          specifier === "next" ||
          specifier.startsWith("next/") ||
          specifier.includes("valle-design-api")
        ) {
          fail(
            `${relative(packageRoot, file)} imports product module ${JSON.stringify(specifier)}`,
          );
        }
      }
    }
  }
  return checkedFiles;
}

const manifest = asObject(
  JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  ) as unknown,
  "package.json",
);
checkPackageManifest(manifest);
const dynamicCodeNegativeControls = runDynamicCodeNegativeControls();
const checkedFiles = await checkSourceImports();
const laboratoryFiles = await checkLaboratoryImports();
process.stdout.write(
  `${JSON.stringify({ check: "dwg-boundary", dynamicCodeNegativeControls, laboratoryFiles, runtimeDependencies: 0, sourceFiles: checkedFiles, status: "ok" })}\n`,
);
