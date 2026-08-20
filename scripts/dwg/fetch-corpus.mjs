#!/usr/bin/env node
/**
 * CLI del lado consumidor del corpus de conformidad DWG.
 *
 * `--check` es el modo de CI: verifica lo que haya y sale 0 tanto si el corpus
 * está VACÍO como si no hay origen configurado. Sale 1 —con el código tipado
 * del gate— en cuanto algo no cuadra: commit ausente, hash distinto, bundle sin
 * dos validaciones independientes, artefacto sin manifestar.
 *
 * Sin `--check` hace lo mismo e imprime el informe completo; es lo que consume
 * el generador de evidencia.
 *
 * NO imprime nunca la credencial ni bytes de ningún fixture. Un log de CI es
 * público dentro de la organización y el corpus es privado por definición.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DwgCorpusGateError,
  REPO_ROOT,
  readAdmittedCorpus,
} from "./corpus-consumer.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outIndex = process.argv.indexOf("--out");
const outFile = outIndex > -1 ? process.argv[outIndex + 1] : null;

try {
  const report = readAdmittedCorpus({});
  const summary = {
    status: report.status,
    commit: report.commit,
    indexSha256: report.indexSha256,
    admittedBundleCount: report.admittedBundleCount,
    bundleIds: report.bundles.map((bundle) => bundle.id),
    ...(report.reason ? { reason: report.reason } : {}),
  };
  if (outFile) {
    const target = path.resolve(REPO_ROOT, outFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(checkOnly ? summary : report, null, 2)}\n`);
  if (report.status === "unavailable") {
    process.stdout.write(
      "corpus DWG: sin origen configurado; cero bundles admitidos y ninguna capacidad promovida.\n",
    );
  } else {
    process.stdout.write(
      `corpus DWG: ${report.admittedBundleCount} bundle(s) admitido(s) verificados contra el commit fijado.\n`,
    );
  }
} catch (error) {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(`${JSON.stringify({ code: error.code, detail: error.detail }, null, 2)}\n`);
    process.exit(1);
  }
  throw error;
}
