import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "src");

const forbiddenModules = new Set([
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "fs",
  "http",
  "http2",
  "https",
  "net",
  "tls",
]);

const forbiddenCallNames = new Set(["Function", "fetch"]);
const forbiddenConstructorNames = new Set([
  "EventSource",
  "Function",
  "WebSocket",
  "XMLHttpRequest",
]);
const forbiddenGlobalMembers = new Set([
  ...forbiddenCallNames,
  ...forbiddenConstructorNames,
  "caches",
  "console",
  "indexedDB",
  "localStorage",
  "navigator",
  "process",
  "sessionStorage",
]);
const forbiddenGlobalNames = new Set([
  "Bun",
  "Deno",
  "EventSource",
  "Function",
  "WebSocket",
  "XMLHttpRequest",
  "caches",
  "console",
  "fetch",
  "globalThis",
  "indexedDB",
  "localStorage",
  "navigator",
  "process",
  "sessionStorage",
  "global",
  "window",
]);

function fail(message: string): never {
  throw new Error(`DWG no-I/O violation: ${message}`);
}

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectTypeScriptFiles(entryPath)));
    else if (entry.isFile() && extname(entry.name) === ".ts")
      files.push(entryPath);
  }
  return files;
}

function literalModule(node: ts.Node): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression !== undefined &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) &&
        node.expression.text === "require")) &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0]!)
  ) {
    return node.arguments[0]!.text;
  }
  return undefined;
}

function normalizedBuiltin(specifier: string): string {
  const withoutNode = specifier.startsWith("node:")
    ? specifier.slice(5)
    : specifier;
  return withoutNode.split("/")[0] ?? withoutNode;
}

function forbiddenGlobalMember(node: ts.Node): string | undefined {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ["globalThis", "global", "window"].includes(node.expression.text) &&
    forbiddenGlobalMembers.has(node.name.text)
  ) {
    return `${node.expression.text}.${node.name.text}`;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ["globalThis", "global", "window"].includes(node.expression.text) &&
    node.argumentExpression !== undefined &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    forbiddenGlobalMembers.has(node.argumentExpression.text)
  ) {
    return `${node.expression.text}[${JSON.stringify(node.argumentExpression.text)}]`;
  }
  return undefined;
}

function checkStaticSource(file: string, text: string): void {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node): void => {
    const specifier = literalModule(node);
    if (
      specifier !== undefined &&
      forbiddenModules.has(normalizedBuiltin(specifier))
    ) {
      fail(
        `${relative(packageRoot, file)} imports forbidden I/O module ${JSON.stringify(specifier)}`,
      );
    }
    const globalMember = forbiddenGlobalMember(node);
    if (globalMember !== undefined) {
      fail(
        `${relative(packageRoot, file)} accesses forbidden I/O or telemetry global ${globalMember}`,
      );
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenCallNames.has(node.expression.text)
    ) {
      fail(
        `${relative(packageRoot, file)} calls forbidden global ${node.expression.text}`,
      );
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenConstructorNames.has(node.expression.text)
    ) {
      fail(
        `${relative(packageRoot, file)} constructs forbidden global ${node.expression.text}`,
      );
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "navigator" &&
      node.expression.name.text === "sendBeacon"
    ) {
      fail(
        `${relative(packageRoot, file)} calls forbidden navigator.sendBeacon`,
      );
    }
    if (ts.isIdentifier(node) && forbiddenGlobalNames.has(node.text)) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent)) &&
          parent.name === node);
      if (!isPropertyName) {
        fail(
          `${relative(packageRoot, file)} references forbidden I/O or telemetry global ${node.text}`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function runStaticNegativeControls(): number {
  const hostileSources = [
    "globalThis['fetch']('https://invalid.example')",
    "globalThis.fetch('https://invalid.example')",
    "global['fetch']('https://invalid.example')",
    "window.fetch('https://invalid.example')",
    "new globalThis.WebSocket('wss://invalid.example')",
    "globalThis['console'].log('secret')",
    'Function("return 1")',
    'new Function("return 1")',
  ];
  for (const [index, source] of hostileSources.entries()) {
    let rejected = false;
    try {
      checkStaticSource(
        resolve(sourceRoot, `negative-control-${index}.ts`),
        source,
      );
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`static analyzer accepted negative control ${index}`);
  }
  checkStaticSource(
    resolve(sourceRoot, "positive-control.ts"),
    "new Uint8Array(6);",
  );
  return hostileSources.length;
}

type Restore = () => void;

function installGlobalTrap(name: string, calls: string[]): Restore {
  const target = globalThis as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  if (descriptor !== undefined && descriptor.configurable === false) {
    fail(`cannot instrument non-configurable global ${name}`);
  }
  const targetFunction = function ioTrap(): never {
    calls.push(name);
    throw new Error(`forbidden dynamic I/O through ${name}`);
  };
  const trap: unknown = new Proxy(targetFunction, {
    apply(): never {
      return targetFunction();
    },
    construct(): never {
      return targetFunction();
    },
    get(_target, property): unknown {
      calls.push(`${name}.${String(property)}`);
      throw new Error(
        `forbidden dynamic I/O through ${name}.${String(property)}`,
      );
    },
  });
  Object.defineProperty(target, name, {
    configurable: true,
    value: trap,
    writable: true,
  });
  return () => {
    if (descriptor === undefined) delete target[name];
    else Object.defineProperty(target, name, descriptor);
  };
}

async function checkDynamicBoundary(): Promise<number> {
  const calls: string[] = [];
  const restores = [
    "fetch",
    "WebSocket",
    "EventSource",
    "XMLHttpRequest",
    "console",
    "navigator",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
  ].map((name) => installGlobalTrap(name, calls));
  try {
    const api = (await import(
      pathToFileURL(resolve(sourceRoot, "index.ts")).href
    )) as {
      probeDwg?: (bytes: Uint8Array) => unknown;
    };
    if (typeof api.probeDwg !== "function")
      fail("src/index.ts must export probeDwg");
    const samples = [
      new Uint8Array(),
      Uint8Array.of(65, 67, 49, 48, 49, 53),
      Uint8Array.of(0, 255, 47, 128, 1, 2, 3),
      new Uint8Array(1024).fill(0xa5),
    ];
    for (const sample of samples) api.probeDwg!(sample);
    if (calls.length > 0) fail(`dynamic probe attempted ${calls.join(", ")}`);
    return samples.length;
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

const files = await collectTypeScriptFiles(sourceRoot);
if (files.length === 0) fail("src must contain the TypeScript baseline");
for (const file of files) checkStaticSource(file, await readFile(file, "utf8"));
const negativeControls = runStaticNegativeControls();
const dynamicCases = await checkDynamicBoundary();
process.stdout.write(
  `${JSON.stringify({ check: "dwg-no-io", dynamicCases, negativeControls, sourceFiles: files.length, status: "ok" })}\n`,
);
