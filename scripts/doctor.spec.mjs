#!/usr/bin/env node
/**
 * `npm run doctor` — cada rama con un entorno FALSO, no el real de la
 * máquina que corre la spec (un puerto libre hoy en CI puede estar ocupado
 * mañana en un laptop, y la spec no puede depender de eso).
 */
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readEnvFile, runDiagnostics } from "./doctor.mjs";

const scratch = mkdtempSync(path.join(tmpdir(), "doctor-spec-"));
function fakeRoot(workspaces = ["node_modules", "apps/web/node_modules", "apps/api/node_modules"]) {
  const root = mkdtempSync(path.join(scratch, "root-"));
  for (const dir of workspaces) {
    const full = path.join(root, dir);
    mkdirSync(full, { recursive: true });
  }
  return root;
}

function statusOf(results, title) {
  return results.find((r) => r.title === title)?.status;
}

async function withServer(fn) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  // --- 1 · readEnvFile: parseo real, comentarios y líneas vacías se ignoran --
  {
    const file = path.join(scratch, ".env");
    writeFileSync(file, "# comentario\n\nA=1\nB = con espacios \nSIN_IGUAL\n");
    const env = readEnvFile(file);
    assert.deepEqual(env, { A: "1", B: "con espacios" }, "parseo mínimo de .env");
    assert.deepEqual(readEnvFile(path.join(scratch, "no-existe.env")), {}, "archivo ausente = objeto vacío");
  }

  // --- 2 · Node: FALTA por debajo de 22, OK en 22 y por encima -----------------
  {
    const root = fakeRoot();
    const old = await runDiagnostics({ root, env: {}, nodeVersion: "v18.20.0", devPorts: [] });
    assert.equal(statusOf(old, "Node"), "FALTA", "Node 18 es FALTA");
    const current = await runDiagnostics({ root, env: {}, nodeVersion: "v22.18.0", devPorts: [] });
    assert.equal(statusOf(current, "Node"), "OK", "Node 22 es OK");
  }

  // --- 3 · Dependencias: FALTA si falta un workspace --------------------------
  {
    const partial = fakeRoot(["node_modules"]);
    const results = await runDiagnostics({ root: partial, env: {}, nodeVersion: "v22.0.0", devPorts: [] });
    const dep = results.find((r) => r.title === "Dependencias");
    assert.equal(dep.status, "FALTA");
    assert.ok(dep.detail.includes("apps/web/node_modules"), "nombra el workspace que falta");
  }

  // --- 4 · Base de datos: sin declarar = OK (SQLite); declarada y alcanzable
  //     = OK; declarada e inalcanzable = AVISO, nunca FALTA (no bloquea) -----
  {
    const root = fakeRoot();
    const none = await runDiagnostics({ root, env: {}, nodeVersion: "v22.0.0", devPorts: [] });
    assert.equal(statusOf(none, "Base de datos"), "OK", "sin DATABASE_URL: SQLite, OK");

    await withServer(async (port) => {
      const reachable = await runDiagnostics({
        root,
        env: { DATABASE_URL: `postgres://x:x@127.0.0.1:${port}/db` },
        nodeVersion: "v22.0.0",
        devPorts: [],
      });
      assert.equal(statusOf(reachable, "Base de datos"), "OK", "puerto real alcanzable: OK");
    });

    const unreachable = await runDiagnostics({
      root,
      env: { DATABASE_URL: "postgres://x:x@127.0.0.1:1/db" },
      nodeVersion: "v22.0.0",
      devPorts: [],
    });
    assert.equal(statusOf(unreachable, "Base de datos"), "AVISO", "puerto inalcanzable: AVISO, no bloquea");

    const malformed = await runDiagnostics({
      root,
      env: { DATABASE_URL: "no es una url" },
      nodeVersion: "v22.0.0",
      devPorts: [],
    });
    assert.equal(statusOf(malformed, "Base de datos"), "FALTA", "DATABASE_URL inválida SÍ bloquea");
  }

  // --- 5 · Puertos: libre = OK, ocupado = AVISO -------------------------------
  {
    const root = fakeRoot();
    await withServer(async (port) => {
      const results = await runDiagnostics({
        root,
        env: {},
        nodeVersion: "v22.0.0",
        devPorts: [[port, "prueba"]],
      });
      assert.equal(statusOf(results, `Puerto ${port}`), "AVISO", "puerto ocupado: AVISO");
    });
    const freePort = 39217; // improbable que esté ocupado en la máquina de CI
    const free = await runDiagnostics({
      root,
      env: {},
      nodeVersion: "v22.0.0",
      devPorts: [[freePort, "prueba"]],
    });
    assert.equal(statusOf(free, `Puerto ${freePort}`), "OK", "puerto libre: OK");
  }

  // --- 6 · Corpus DWG y Windows: informativos, nunca FALTA --------------------
  {
    const root = fakeRoot();
    const withoutCorpus = await runDiagnostics({ root, env: {}, nodeVersion: "v22.0.0", devPorts: [] });
    assert.equal(statusOf(withoutCorpus, "Corpus DWG"), "AVISO");
    const withCorpus = await runDiagnostics({
      root,
      env: { VALLE_DWG_CORPUS_MIRROR: "/tmp/mirror" },
      nodeVersion: "v22.0.0",
      devPorts: [],
    });
    assert.equal(statusOf(withCorpus, "Corpus DWG"), "OK");
    const onWindows = await runDiagnostics({
      root,
      env: {},
      nodeVersion: "v22.0.0",
      platform: "win32",
      devPorts: [],
    });
    assert.equal(statusOf(onWindows, "Windows"), "AVISO");
    const onLinux = await runDiagnostics({
      root,
      env: {},
      nodeVersion: "v22.0.0",
      platform: "linux",
      devPorts: [],
    });
    assert.equal(statusOf(onLinux, "Windows"), undefined, "fuera de Windows no aparece la fila");
  }

  console.log(
    "doctor.spec: parseo de .env, versión de Node, workspaces, base de datos, puertos, corpus DWG y aviso de Windows — todos discriminan correctamente",
  );
}

await main();
rmSync(scratch, { recursive: true, force: true });
