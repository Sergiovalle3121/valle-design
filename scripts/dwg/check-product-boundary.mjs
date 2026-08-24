import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "..", "..");
const detectorPath = join(
  repositoryRoot,
  "apps",
  "web",
  "src",
  "components",
  "cad",
  "interop",
  "cad-format-detect.ts",
);
const codecEntry = join(
  repositoryRoot,
  "packages",
  "dwg-codec",
  "dist",
  "index.js",
);
const expectedSpecs = [
  "src/components/cad/interop/cad-format-detect.spec.ts",
  "src/lib/cad/interop-provider.spec.ts",
  "src/lib/cad/document-import.spec.ts",
  "src/lib/cad/dwg-document-bridge.spec.ts",
  "src/lib/cad/dwg-native-reader.spec.ts",
];
const forbiddenCodecReferences = [
  "@valle-design/dwg-codec",
  "packages/dwg-codec",
  "packages\\dwg-codec",
  "../dwg-codec",
  "..\\dwg-codec",
];
/**
 * La beta (ADR-0009 §6-bis, firmada 2026-08-24; perfil ampliado a
 * `AC1015_MODELSPACE_2D_V3` por §6-ter y §6-quater el mismo día) autoriza
 * EXACTAMENTE un punto de importación runtime: `dwg-native-reader.ts`
 * y su propia spec. Ningún otro archivo del árbol runtime puede referenciar
 * el códec — si mañana otro perfil necesita otro punto, este array crece con
 * su propia ADR, nunca por comodidad.
 */
const authorizedCodecReferenceFiles = new Set([
  join("apps", "web", "src", "lib", "cad", "dwg-native-reader.ts"),
  join("apps", "web", "src", "lib", "cad", "dwg-native-reader.spec.ts"),
]);
/**
 * Y exactamente estos archivos pueden IMPORTAR ese punto autorizado: el
 * worker de importación (el `apps/web/src/lib/cad/**` fuera del worker no
 * puede tocar bytes hostiles de DWG por diseño) y la propia spec del
 * adaptador. Ni un componente de React ni ningún otro módulo aparecen aquí.
 */
const authorizedDwgNativeReaderImporters = new Set([
  join("apps", "web", "src", "lib", "cad", "dwg-native-reader.ts"),
  join("apps", "web", "src", "lib", "cad", "dwg-native-reader.spec.ts"),
  join("apps", "web", "src", "lib", "cad", "document-import.worker.ts"),
]);
/**
 * `apps/web/package.json` declara la dependencia real hacia el códec (así
 * npm la enlaza en `node_modules`); es la única manifiesto autorizada.
 */
const authorizedManifestFiles = new Set([join("apps", "web", "package.json")]);
const ignoredRuntimeDirectories = new Set([
  // Worktrees efímeros del harness de agentes: copias del árbol dentro del repo.
  ".claude",
  ".next",
  ".report",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const runtimeSourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".graphql",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

function fail(message) {
  throw new Error(`DWG product boundary: ${message}`);
}

async function readWebVersionRegistry() {
  const source = await readFile(detectorPath, "utf8");
  const object = source.match(
    /export const ACAD_VERSION_NAMES:[^{]+\{([\s\S]*?)\n\};/,
  );
  if (!object)
    fail("could not locate ACAD_VERSION_NAMES in the first-party detector");

  const versions = new Map();
  // Insensible al estilo de comillas: el registro es un dato, no un formato.
  // Con comilla simple el gate se caía en cuanto prettier tocaba el archivo.
  const entryPattern = /^\s*(AC10\d{2}):\s*['"]([^'"]+)['"],?\s*$/gm;
  for (const match of object[1].matchAll(entryPattern)) {
    versions.set(match[1], match[2]);
  }
  if (versions.size === 0)
    fail("the product detector version registry is empty");
  return versions;
}

function hasCodecReference(source) {
  return forbiddenCodecReferences.some((needle) => source.includes(needle));
}

async function collectRuntimeSourceFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (ignoredRuntimeDirectories.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await collectRuntimeSourceFiles(path)));
    } else if (
      entry.isFile() &&
      entry.name !== "package.json" &&
      runtimeSourceExtensions.has(extname(entry.name))
    ) {
      output.push(path);
    }
  }
  return output;
}

async function assertNoRuntimeIntegration() {
  const workspaceParents = [
    join(repositoryRoot, "apps"),
    join(repositoryRoot, "packages"),
  ];
  const codecRoot = resolve(repositoryRoot, "packages", "dwg-codec");
  let manifestCount = 0;
  let sourceFileCount = 0;
  let workspaceCount = 0;

  for (const parent of workspaceParents) {
    const entries = await readdir(parent, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspaceRoot = resolve(parent, entry.name);
      if (workspaceRoot === codecRoot) continue;
      workspaceCount += 1;

      const manifestPath = join(workspaceRoot, "package.json");
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (error) {
        fail(
          `could not read runtime workspace manifest ${relative(repositoryRoot, manifestPath)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      manifestCount += 1;
      const manifestRelPath = relative(repositoryRoot, manifestPath);
      if (
        hasCodecReference(JSON.stringify(manifest)) &&
        !authorizedManifestFiles.has(manifestRelPath)
      ) {
        fail(`runtime manifest references the laboratory: ${manifestRelPath}`);
      }

      const sourceFiles = await collectRuntimeSourceFiles(workspaceRoot);
      sourceFileCount += sourceFiles.length;
      for (const path of sourceFiles) {
        const relPath = relative(repositoryRoot, path);
        const source = await readFile(path, "utf8");
        if (hasCodecReference(source) && !authorizedCodecReferenceFiles.has(relPath)) {
          fail(
            `runtime import/reference found in ${relPath} (only dwg-native-reader.ts ` +
              "is authorized by ADR-0009 §6-bis)",
          );
        }
        if (
          source.includes("dwg-native-reader") &&
          !authorizedDwgNativeReaderImporters.has(relPath)
        ) {
          fail(
            `${relPath} references the authorized DWG adapter, but only the import ` +
              "worker and the adapter's own spec may do so",
          );
        }
      }
    }
  }

  for (const authorized of authorizedCodecReferenceFiles) {
    const fullPath = join(repositoryRoot, authorized);
    if (!existsSync(fullPath)) {
      fail(`authorized DWG adapter file is missing: ${authorized}`);
    }
  }

  if (workspaceCount === 0 || manifestCount !== workspaceCount) {
    fail("runtime workspace discovery did not cover every manifest");
  }
  return { manifestCount, sourceFileCount, workspaceCount };
}

function runProductSpecs() {
  const webRoot = join(repositoryRoot, "apps", "web");
  for (const spec of expectedSpecs) {
    const result = spawnSync(
      process.execPath,
      [join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"), spec],
      {
        cwd: webRoot,
        encoding: "utf8",
        env: process.env,
        stdio: "pipe",
      },
    );
    if (result.status !== 0) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
      fail(`${spec} exited with ${result.status ?? "no status"}`);
    }
    process.stdout.write(result.stdout ?? "");
  }
}

const codec = await import(pathToFileURL(codecEntry).href);
if (!Array.isArray(codec.DWG_VERSION_REGISTRY)) {
  fail("codec does not export DWG_VERSION_REGISTRY");
}

const webVersions = await readWebVersionRegistry();
const codecVersions = new Map(
  codec.DWG_VERSION_REGISTRY.map(({ code, label }) => [code, label]),
);
if (webVersions.size !== codecVersions.size) {
  fail(
    `version registry size differs: product=${webVersions.size}, codec=${codecVersions.size}`,
  );
}
for (const [code, label] of webVersions) {
  if (codecVersions.get(code) !== label) {
    fail(
      `version label differs for ${code}: product=${label}, codec=${codecVersions.get(code)}`,
    );
  }
}

const runtimeBoundary = await assertNoRuntimeIntegration();
runProductSpecs();
console.log(
  `DWG product boundary OK: ${codecVersions.size} signatures, ${expectedSpecs.length} product specs, ` +
    `${runtimeBoundary.workspaceCount} runtime workspaces, ${runtimeBoundary.manifestCount} manifests, ` +
    `${runtimeBoundary.sourceFileCount} source files, ${authorizedCodecReferenceFiles.size} authorized ` +
    "runtime import site(s) (ADR-0009 §6-bis), 0 unauthorized",
);
