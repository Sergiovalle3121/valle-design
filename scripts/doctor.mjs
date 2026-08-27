#!/usr/bin/env node
/**
 * `npm run doctor` — diagnóstico de entorno para quien acaba de clonar el
 * repositorio, antes de gastar media hora adivinando por qué `npm run dev`
 * o un gate no arrancan.
 *
 * Puramente de LECTURA: nunca instala nada, nunca escribe `.env`, nunca
 * inicia un servidor. Cada comprobación reporta su propio veredicto — "OK",
 * "AVISO" o "FALTA" — con la causa y el siguiente paso, nunca sólo un
 * síntoma. El código de salida es 1 sólo si algo de la lista OBLIGATORIA
 * falla; un "AVISO" (opcional, como el espejo del corpus DWG) nunca lo hace
 * fallar, porque partes reales del flujo de trabajo (el primer día,
 * `PRIMER-DIA.md`) no lo necesitan.
 *
 * Qué cubre, y por qué exactamente esto (R.5 del backlog de campañas
 * anteriores): versión de Node, si los workspaces están instalados, si
 * PostgreSQL declarado en `.env` responde (con su SQLite de respaldo
 * documentado), si los puertos de `npm run dev` están libres, si el
 * espejo del corpus DWG está configurado, y el aviso de Control de
 * aplicaciones de Windows que `PRIMER-DIA.md` ya documenta en prosa.
 *
 * `runDiagnostics(options)` recibe TODO lo que depende del entorno real
 * (raíz, variables, versión de Node, plataforma, puertos a probar) para que
 * `doctor.spec.mjs` pueda ejercitar cada rama con un entorno FALSO, sin
 * tocar el `.env` real ni depender de qué esté escuchando en la máquina que
 * corre la spec.
 */
import { readFileSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/** `true` si el host:puerto acepta conexión dentro de `timeoutMs`. */
function tcpReachable(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Corre las seis comprobaciones y devuelve la lista de resultados, sin
 * imprimir nada ni llamar `process.exit`. `options` inyecta todo lo que
 * varía por entorno; los valores por defecto son los reales.
 */
export async function runDiagnostics(options = {}) {
  const {
    root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    env = process.env,
    envFile,
    nodeVersion = process.version,
    platform = process.platform,
    devPorts = [
      [3000, "web (Next)"],
      [4000, "api (Nest)"],
    ],
  } = options;
  const fileEnv = readEnvFile(envFile ?? path.join(root, ".env"));
  const merged = { ...fileEnv, ...env };
  const results = [];
  const report = (status, title, detail) => results.push({ status, title, detail });

  // 1 · Versión de Node.
  const [major] = nodeVersion.replace(/^v/, "").split(".").map(Number);
  if (major >= 22) report("OK", "Node", `${nodeVersion} (≥22 requerido)`);
  else
    report(
      "FALTA",
      "Node",
      `${nodeVersion} es menor a 22 — el repo asume ≥22 (@types/node alineado). Instala Node 22.x antes de \`npm ci\`.`,
    );

  // 2 · Workspaces instalados.
  const workspaces = ["node_modules", "apps/web/node_modules", "apps/api/node_modules"];
  const missingWorkspaces = workspaces.filter((dir) => !existsSync(path.join(root, dir)));
  if (missingWorkspaces.length === 0)
    report("OK", "Dependencias", "los tres workspaces tienen node_modules");
  else
    report(
      "FALTA",
      "Dependencias",
      `sin instalar: ${missingWorkspaces.join(", ")}. Corre \`npm ci\` desde la raíz (~3-4 min).`,
    );

  // 3 · PostgreSQL / SQLite.
  const url = merged.DATABASE_URL;
  if (!url && !merged.DB_HOST) {
    report(
      "OK",
      "Base de datos",
      "sin DATABASE_URL/DB_HOST: la API usa SQLite local en desarrollo (documentado en PRIMER-DIA.md) — normal para el primer día.",
    );
  } else {
    let host = merged.DB_HOST;
    let port = Number(merged.DB_PORT) || 5432;
    let malformed = false;
    if (url) {
      try {
        const parsed = new URL(url);
        host = parsed.hostname;
        port = Number(parsed.port) || 5432;
      } catch {
        report("FALTA", "Base de datos", `DATABASE_URL no es una URL válida: "${url}".`);
        malformed = true;
      }
    }
    if (!malformed) {
      const reachable = await tcpReachable(host, port, 1500);
      if (reachable) report("OK", "Base de datos", `PostgreSQL responde en ${host}:${port}`);
      else
        report(
          "AVISO",
          "Base de datos",
          `${host}:${port} no respondió en 1.5 s — si esperabas PostgreSQL real, confirma que está arrancado; si no, quita DATABASE_URL/DB_HOST del .env para usar SQLite.`,
        );
    }
  }

  // 4 · Puertos de `npm run dev`.
  for (const [port, who] of devPorts) {
    const occupied = await tcpReachable("127.0.0.1", port, 500);
    if (!occupied) report("OK", `Puerto ${port}`, `libre para ${who}`);
    else
      report(
        "AVISO",
        `Puerto ${port}`,
        "algo ya escucha ahí — si es una corrida anterior de `npm run dev` que no cerró bien, ciérrala antes de arrancar otra.",
      );
  }

  // 5 · Espejo del corpus DWG (opcional).
  if (merged.VALLE_DWG_CORPUS_MIRROR || merged.VALLE_DWG_CORPUS_TOKEN)
    report("OK", "Corpus DWG", "VALLE_DWG_CORPUS_MIRROR/VALLE_DWG_CORPUS_TOKEN configurado");
  else
    report(
      "AVISO",
      "Corpus DWG",
      'sin espejo ni token: check:dwg-evidence/check:dwg-corpus reportarán "unavailable" honestamente (no es un fallo del repo) — normal fuera de CI. Ver docs/guides/donar-corpus-dwg.md.',
    );

  // 6 · Windows: Control de aplicaciones.
  if (platform === "win32")
    report(
      "AVISO",
      "Windows",
      "si el equipo tiene Smart App Control/WDAC, la primera instalación puede bloquear binarios nativos recién extraídos (esbuild, SWC). Ver PRIMER-DIA.md antes de sospechar del repo si `esbuild` da spawn UNKNOWN.",
    );

  return results;
}

function printReport(results) {
  const width = Math.max(...results.map((r) => r.title.length));
  for (const { status, title, detail } of results) {
    const icon = status === "OK" ? "✅" : status === "AVISO" ? "⚠️ " : "❌";
    console.log(`${icon} ${title.padEnd(width)}  ${detail}`);
  }
  const blocking = results.filter((r) => r.status === "FALTA");
  console.log(
    blocking.length === 0
      ? "\ndoctor: nada obligatorio falta. Los avisos (si hay) son opcionales para el primer día."
      : `\ndoctor: ${blocking.length} cosa(s) obligatoria(s) por resolver antes de continuar.`,
  );
  return blocking.length;
}

const isEntryPoint = (() => {
  try {
    return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  const results = await runDiagnostics();
  const blockingCount = printReport(results);
  process.exit(blockingCount > 0 ? 1 : 0);
}
