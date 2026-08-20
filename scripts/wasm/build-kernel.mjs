#!/usr/bin/env node
/**
 * Compila el kernel Rust a WebAssembly y publica su MANIFIESTO.
 *
 * ## Por qué el binario se versiona y el manifiesto va a su lado
 *
 * `apps/web/public/wasm/valle-cad-kernel.wasm` entra en el árbol. Un binario
 * versionado es un objeto que nadie puede leer, así que sin un manifiesto que
 * diga de dónde salió es una caja negra con permiso de residencia. El
 * manifiesto declara las tres cosas que hacen falta para volver a fabricarlo
 * —qué fuentes, qué compilador, qué banderas— y el sha256 de lo que salió, de
 * modo que `--check` responde sin Rust instalado a la única pregunta que
 * importa en CI: ¿el binario del árbol es el que dice el manifiesto?
 *
 * ## Por qué `--offline` y sin dependencias
 *
 * Para que la reproducibilidad no dependa de que crates.io siga contestando
 * dentro de cinco años. El crate no tiene grafo de dependencias: `cargo build
 * --offline` basta y no hay lockfile de terceros que resolver.
 *
 * ## Por qué el directorio de compilación se sale del repositorio
 *
 * `CARGO_TARGET_DIR` apunta fuera del árbol a propósito. Los verificadores de
 * frontera del repositorio recorren el árbol del producto buscando cadenas en
 * TODO fichero de código o de datos, y el directorio de compilación de Cargo
 * está lleno de `.json` de huellas que no son código de nadie. Sacarlo del
 * árbol evita que un artefacto de compilación conteste una pregunta sobre el
 * producto.
 *
 * Uso:
 *   node scripts/wasm/build-kernel.mjs           compila y reescribe manifiesto
 *   node scripts/wasm/build-kernel.mjs --check   verifica sin compilar
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const crate = path.join(root, "crates/valle-cad-kernel");
const manifestPath = path.join(crate, "kernel-manifest.json");
const publishedWasm = path.join(root, "apps/web/public/wasm/valle-cad-kernel.wasm");
const TARGET = "wasm32-unknown-unknown";
const PROFILE = "release";

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const posix = (file) => path.relative(root, file).replaceAll(path.sep, "/");

/**
 * Bytes de una FUENTE DE TEXTO en su forma LF.
 *
 * Cargo.toml y lib.rs son texto: git los entrega con CRLF en un checkout
 * Windows y con LF en Linux, así que un hash de bytes crudos hace que el MISMO
 * árbol "no coincida con su manifiesto" según quién lo haya clonado — el
 * manifiesto generado en Windows rompía el gate en CI. Se hashea siempre la
 * forma LF, que es única. El binario .wasm se sigue hasheando crudo.
 */
function textSourceBytes(file) {
  const raw = fs.readFileSync(file, "utf8");
  return Buffer.from(raw.replaceAll("\r\n", "\n"), "utf8");
}

/** Ejecuta una herramienta y devuelve su salida, o `null` si no está. */
function tool(command, args) {
  const run = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
  if (run.error || run.status !== 0) return null;
  return String(run.stdout ?? "").trim();
}

/**
 * Fuentes que entran en el binario, con su hash.
 *
 * Se listan una a una en vez de hashear el directorio: así el manifiesto dice
 * QUÉ se compiló, y no sólo que algo se compiló.
 */
function sourceInventory() {
  const files = ["Cargo.toml", "src/lib.rs"];
  return files.map((relative) => {
    const bytes = textSourceBytes(path.join(crate, relative));
    return { path: `crates/valle-cad-kernel/${relative}`, bytes: bytes.length, sha256: sha256(bytes) };
  });
}

/** Los exports del módulo, leídos del binario. El contrato, no la promesa. */
async function readExports(bytes) {
  const module = await WebAssembly.compile(bytes);
  return WebAssembly.Module.exports(module)
    .map((entry) => `${entry.name}:${entry.kind}`)
    .sort();
}

function toolchain() {
  const rustc = tool("rustc", ["--version"]);
  if (!rustc) return null;
  return {
    rustc,
    cargo: tool("cargo", ["--version"]),
    rustup: tool("rustup", ["--version"])?.split("\n")[0] ?? null,
    host: tool("rustc", ["-vV"])
      ?.split("\n")
      .find((line) => line.startsWith("host:"))
      ?.slice("host:".length)
      .trim() ?? null,
    targetsInstalled: tool("rustup", ["target", "list", "--installed"])?.split(/\r?\n/) ?? null,
  };
}

const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  if (!fs.existsSync(manifestPath)) {
    console.error(`kernel wasm: falta ${posix(manifestPath)} — ejecuta node scripts/wasm/build-kernel.mjs`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const problems = [];
  if (!fs.existsSync(publishedWasm)) problems.push(`falta ${posix(publishedWasm)}`);
  else {
    const bytes = fs.readFileSync(publishedWasm);
    if (bytes.length !== manifest.binary.bytes)
      problems.push(`${posix(publishedWasm)} mide ${bytes.length} B y el manifiesto declara ${manifest.binary.bytes} B`);
    const digest = sha256(bytes);
    if (digest !== manifest.binary.sha256)
      problems.push(`sha256 del binario ${digest} ≠ ${manifest.binary.sha256} del manifiesto`);
  }
  for (const source of manifest.sources) {
    const file = path.join(root, source.path);
    if (!fs.existsSync(file)) {
      problems.push(`falta la fuente ${source.path}`);
      continue;
    }
    const digest = sha256(textSourceBytes(file));
    if (digest !== source.sha256)
      problems.push(`${source.path} cambió (sha256 ${digest} ≠ ${source.sha256}): recompila el kernel`);
  }
  if (problems.length > 0) {
    console.error("kernel wasm: el árbol NO coincide con su manifiesto");
    for (const problem of problems) console.error(`  × ${problem}`);
    process.exit(1);
  }
  console.log(`kernel wasm OK · ${manifest.binary.bytes} B · sha256 ${manifest.binary.sha256.slice(0, 16)}…`);
  process.exit(0);
}

const chain = toolchain();
if (!chain) {
  console.error(
    "kernel wasm: no hay `rustc` en esta máquina. El binario y el manifiesto del árbol\n" +
      "se dejan como están: sobrescribirlos sin compilar sería inventar evidencia.\n" +
      "Instala el toolchain con:  rustup target add wasm32-unknown-unknown",
  );
  process.exit(1);
}
if (chain.targetsInstalled && !chain.targetsInstalled.includes(TARGET)) {
  console.error(`kernel wasm: falta el target ${TARGET}. Ejecuta: rustup target add ${TARGET}`);
  process.exit(1);
}

// Fuera del árbol: ver la cabecera.
const targetDir =
  process.env.VALLE_WASM_TARGET_DIR ?? path.join(os.tmpdir(), "valle-wasm-target");
process.stderr.write(`· cargo build --${PROFILE} --target ${TARGET} --offline\n`);
execFileSync(
  "cargo",
  ["build", `--${PROFILE}`, "--target", TARGET, "--offline", "--quiet"],
  {
    cwd: crate,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
    shell: process.platform === "win32",
  },
);

const built = path.join(targetDir, TARGET, PROFILE, "valle_cad_kernel.wasm");
if (!fs.existsSync(built)) {
  console.error(`kernel wasm: cargo terminó pero no hay binario en ${built}`);
  process.exit(1);
}
const bytes = fs.readFileSync(built);
fs.mkdirSync(path.dirname(publishedWasm), { recursive: true });
fs.writeFileSync(publishedWasm, bytes);

const manifest = {
  $schema: "urn:valle-design:schema:cad-wasm-kernel-manifest:v1",
  schemaVersion: 1,
  kernelId: "valle-cad-kernel",
  abi: 1,
  rebuildWith: "node scripts/wasm/build-kernel.mjs",
  verifyWith: "node scripts/wasm/build-kernel.mjs --check",
  toolchain: {
    ...chain,
    target: TARGET,
    profile: PROFILE,
    cargoFlags: ["--release", `--target ${TARGET}`, "--offline"],
    profileFlags: {
      optLevel: "z",
      lto: true,
      codegenUnits: 1,
      panic: "abort",
      strip: true,
      overflowChecks: false,
    },
    dependencies: [],
    dependencyRationale:
      "Grafo vacío a propósito: sin wasm-bindgen ni wasm-opt, el binario se reconstruye sin red y sin resolver versiones de terceros.",
  },
  sources: sourceInventory(),
  binary: {
    path: posix(publishedWasm),
    bytes: bytes.length,
    sha256: sha256(bytes),
    exports: await readExports(bytes),
  },
  builtAt: new Date().toISOString(),
  builtOn: {
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
  },
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `kernel wasm publicado · ${bytes.length} B · sha256 ${manifest.binary.sha256.slice(0, 16)}… · ${manifest.binary.exports.length} exports`,
);
console.log(`  binario   ${posix(publishedWasm)}`);
console.log(`  manifiesto ${posix(manifestPath)}`);
