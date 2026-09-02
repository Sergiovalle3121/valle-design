#!/usr/bin/env node
/**
 * SONDA: LA SEPARACIÓN ENTRE PAPER SPACE Y EL ESPACIO MODELO.
 *
 * QUÉ PROBLEMA RESUELVE. Hasta el 2026-09-02 el ensamblado volcaba las
 * entidades de PRESENTACIÓN dentro de `modelSpaceEntities` con un
 * diagnóstico: el marco, la carátula y los VIEWPORT de una lámina llegaban al
 * consumidor como si fueran geometría del dibujo. El modo de entidad ya era
 * un hecho registrado de la fuente —«modo de entidad BB (0 con propietario en
 * el flujo, 1 paper space, 2 model space)»—, así que separarlas no exigía
 * medir nada nuevo. Lo que esta sonda mide es otra cosa: que la separación
 * COINCIDE con lo que dice el oráculo independiente.
 *
 * POR QUÉ HACE FALTA MEDIRLO APARTE. El oráculo del harness de corpus
 * (`dxf-oracle.mjs`) NO lee el grupo 67 del DXF —el que marca una entidad
 * como de presentación—, así que enumera los dos espacios juntos y no puede
 * falsar la separación: con él, separar bien y no separar dan el mismo
 * resultado. Esta sonda lee ese grupo 67 directamente del DXF fuente y
 * compara conjunto contra conjunto.
 *
 * MÉTODO — SE PRUEBAN LAS RIVALES, NO LA ESPERADA. Se evalúan tres hipótesis:
 * la identidad (modo 1 = paper space), la INVERTIDA (modo 2 = paper space) y
 * la de NO SEPARAR (todo al modelo). Una sobrevive sólo si acierta en todos
 * los archivos Y si el corpus la distingue de las rivales: en un dibujo sin
 * ninguna entidad de presentación las tres aciertan, y acertar ahí no
 * significa nada.
 *
 * COBERTURA, DICHA ENTERA. El corpus admitido trae UNA sola presentación, en
 * un solo archivo, con DOS entidades. Es suficiente para falsar las rivales
 * —lo hace— pero no es un corpus de láminas: no hay varias presentaciones con
 * nombre, ni entidades de paper space en las versiones modernas. El informe
 * lo declara en vez de dejar que el número de aciertos sugiera más.
 *
 * FRONTERA DE PRODUCTO. Script de evidencia: importa el laboratorio por su
 * ruta interna de dist a propósito, sin superficie pública ni runtime.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  DwgCorpusGateError,
  fetchAdmittedCorpus,
  loadCorpusPin,
  resolveCorpusSource,
} from "./corpus-consumer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-paper-space.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");

/** Las entidades de primer nivel del DXF y si llevan el grupo 67. */
function dxfTopEntities(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let current = null;
  let inEntities = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === "2" && value === "ENTITIES") inEntities = true;
    if (code === "0" && value === "ENDSEC" && inEntities) {
      if (current) out.push(current);
      break;
    }
    if (!inEntities) continue;
    if (code === "0") {
      if (current) out.push(current);
      current = value === "SECTION" || value === "ENDSEC" ? null : { tipo: value, paper: false };
      continue;
    }
    if (!current) continue;
    // 67 = 1 declara la entidad en el espacio papel; ausente o 0 es modelo.
    if (code === "67") current.paper = value === "1";
  }
  return out;
}

function environment() {
  const cpu = os.cpus()[0]?.model ?? "desconocida";
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpu,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    declaredMachine: `${cpu.trim()} (${os.cpus().length} hilos lógicos), ${(os.totalmem() / 1e9).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const outIndex = args.indexOf("--out");
  const outFile =
    outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;

  const { readDwg } = await import(pathToFileURL(path.join(DIST, "index.js")).href);

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-paper-space --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-paper-space: ${message}\n`);
    process.exit(1);
  }

  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bytesOf = (a) => new Uint8Array(transport.readFile(pin.commit, a.path));
  const textOf = (a) =>
    new TextDecoder("latin1").decode(new Uint8Array(transport.readFile(pin.commit, a.path)));

  const archivos = [];
  for (const bundle of corpus.bundles) {
    const oracles = new Map(
      bundle.artifacts
        .filter((a) => a.path.endsWith(".dxf"))
        .map((a) => [path.basename(a.path, ".dxf"), a]),
    );
    for (const artifact of bundle.artifacts.filter(
      (a) => a.kind === "fixtures" && a.path.endsWith(".dwg"),
    )) {
      const stem = path.basename(artifact.path, ".dwg");
      const oracle = oracles.get(stem);
      if (!oracle) continue;
      const esperadas = dxfTopEntities(textOf(oracle));
      const record = {
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        sha256: artifact.sha256,
        dxfPaper: esperadas.filter((e) => e.paper).length,
        dxfModelo: esperadas.filter((e) => !e.paper).length,
      };
      archivos.push(record);
      try {
        const db = readDwg(bytesOf(artifact));
        record.leidoPaper = db.paperSpaceEntities.length;
        record.leidoModelo = db.modelSpaceEntities.length;
        record.tiposEnPaper = [
          ...new Set(db.paperSpaceEntities.map((r) => r.entity.kind)),
        ].sort();
      } catch (error) {
        record.error = error?.detail?.code ?? error?.message ?? String(error);
      }
    }
  }

  const utiles = archivos.filter((a) => !a.error && a.leidoPaper !== undefined);
  // Los archivos que EJERCEN la separación: sin ninguna entidad de
  // presentación, las tres hipótesis aciertan y el caso no distingue nada.
  const ejercen = utiles.filter((a) => a.dxfPaper > 0);
  const hipotesis = [
    {
      nombre: "modo-1-es-paper",
      aciertos: utiles.filter((a) => a.leidoPaper === a.dxfPaper).length,
    },
    {
      nombre: "invertida-modo-2-es-paper",
      aciertos: utiles.filter((a) => a.leidoPaper === a.dxfModelo).length,
    },
    {
      nombre: "no-separar-todo-al-modelo",
      aciertos: utiles.filter((a) => a.dxfPaper === 0).length,
    },
  ].map((h) => ({
    ...h,
    comparados: utiles.length,
    sobrevive: utiles.length > 0 && h.aciertos === utiles.length && ejercen.length > 0,
  }));
  const supervivientes = hipotesis.filter((h) => h.sobrevive).map((h) => h.nombre);
  const medido = supervivientes.length === 1;

  const veredicto = medido
    ? `La separación coincide con el grupo 67 del DXF en ${utiles.length}/${utiles.length} archivos, y ${ejercen.length} de ellos EJERCE la presentación (${ejercen.map((a) => `${a.archivo}: ${a.dxfPaper}`).join(", ")}), que es lo que descarta a las rivales. COBERTURA: una sola presentación en todo el corpus, sin láminas con nombre y sin entidades de paper space en las versiones modernas.`
    : ejercen.length === 0
      ? "Ningún archivo del corpus ejerce el espacio papel: separar y no separar dan el mismo resultado, así que NO se afirma nada."
      : `Sobreviven ${supervivientes.length} hipótesis (${supervivientes.join(", ") || "ninguna"}): no se afirma la separación.`;

  const report = {
    generadoPor: "scripts/dwg/probe-paper-space.mjs",
    corpus: { commit: pin.commit, origen: transport.kind ?? "espejo" },
    entorno: environment(),
    veredicto,
    resumen: {
      archivosComparados: utiles.length,
      archivosQueEjercenPaperSpace: ejercen.length,
      entidadesEnPaperSpace: ejercen.reduce((n, a) => n + a.dxfPaper, 0),
      hipotesisSupervivientes: supervivientes,
      medido,
      // Lo que el corpus NO cubre, dicho donde se lee el resultado.
      sinCubrir: [
        "varias presentaciones con nombre en un mismo archivo",
        "la asociación entidad → LAYOUT concreto",
        "entidades de paper space en AC1018 y en la familia R2010+",
      ],
    },
    hipotesis,
    archivos,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const w = (s) => process.stdout.write(`${s}\n`);

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-paper-space --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-paper-space --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(report.resumen)}\n`);
      process.exit(1);
    }
    w(`probe-paper-space --check: la evidencia coincide (${utiles.length} archivos).`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-paper-space: ${utiles.length} archivos · ${ejercen.length} ejercen presentación`);
  for (const h of hipotesis)
    w(`  ${h.nombre.padEnd(28)}: ${h.aciertos}/${h.comparados} · sobrevive=${h.sobrevive}`);
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-paper-space abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
