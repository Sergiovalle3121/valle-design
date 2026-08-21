#!/usr/bin/env node
/**
 * Harness de evidencia de la CAPA DE CONTENEDOR R2004 contra el corpus
 * ADMITIDO (familia AC1018/AC1024/AC1027/AC1032).
 *
 * QUÉ RESPONDE. ¿La capa de contenedor del laboratorio abre bytes DWG de la
 * familia R2004 producidos por una implementación INDEPENDIENTE? Por cada
 * fixture de la familia se parsea la cabecera (bloque cifrado + CRC32), se
 * descomprime el mapa de páginas y el mapa de secciones, y se ensamblan los
 * payloads de las CUATRO secciones que el lector de bases necesita:
 * AcDb:Header, AcDb:Classes, AcDb:Handles y AcDb:AcDbObjects.
 *
 * DE DÓNDE SALEN LOS BYTES. Del gate consumidor (`corpus-consumer.mjs`):
 * commit fijado + SHA-256 verificado, como validate-corpus.mjs. Este harness
 * no lee el working tree del repo hermano.
 *
 * REGLA CLEAN-ROOM (ADR-0007). Si un archivo desmiente una certeza, el
 * reporte deja el error tipado con su byte, sin suavizarlo. Corregir código
 * exige registrar antes el hecho en SOURCE_REGISTER.json.
 *
 * FRONTERA DE PRODUCTO. Script de evidencia: importa el laboratorio por su
 * ruta interna de dist a propósito, sin superficie pública ni runtime del
 * producto.
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
  "dwg-r2004-container.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const R2004_VERSIONS = ["AC1018", "AC1024", "AC1027", "AC1032"];
const CORE_SECTIONS = [
  "AcDb:Header",
  "AcDb:Classes",
  "AcDb:Handles",
  "AcDb:AcDbObjects",
];

const hex = (value) => `0x${value.toString(16)}`;

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

function typedError(error) {
  return {
    code: error?.detail?.code ?? error?.code ?? "UNKNOWN",
    category: error?.detail?.category ?? null,
    offset: error?.detail?.offset ?? null,
    message: String(error?.detail?.message ?? error?.message ?? error).slice(0, 500),
  };
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outFile =
    outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;

  const pagesDist = path.join(DIST, "container", "r2004-pages.js");
  if (!fs.existsSync(pagesDist)) {
    process.stderr.write(
      "probe-r2004: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }
  const { BoundedByteCursor } = await import(
    pathToFileURL(path.join(DIST, "binary", "byte-cursor.js")).href
  );
  const { createDwgLimits } = await import(
    pathToFileURL(path.join(DIST, "api", "limits.js")).href
  );
  const { parseR2004FileHeader, readR2004PageMap } = await import(
    pathToFileURL(pagesDist).href
  );
  const { readR2004SectionMap, readR2004SectionPayload, findR2004Section } =
    await import(
      pathToFileURL(path.join(DIST, "container", "r2004-sections.js")).href
    );
  const limits = createDwgLimits();

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    process.stderr.write(
      `probe-r2004: sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.\n`,
    );
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bundles = corpus.bundles.filter((bundle) =>
    R2004_VERSIONS.includes(bundle.dwgVersion),
  );

  const archivos = [];
  for (const bundle of bundles) {
    const fixtures = bundle.artifacts.filter(
      (a) => a.kind === "fixtures" && a.path.endsWith(".dwg"),
    );
    for (const fixture of fixtures) {
      const dwgBytes = new Uint8Array(transport.readFile(pin.commit, fixture.path));
      const record = {
        bundle: bundle.id,
        archivo: path.basename(fixture.path, ".dwg"),
        fixture: fixture.path,
        sha256: fixture.sha256,
        byteLength: dwgBytes.length,
      };
      archivos.push(record);
      try {
        const cursor = new BoundedByteCursor(dwgBytes);
        const fileHeader = parseR2004FileHeader(cursor);
        record.version = fileHeader.version;
        record.cabeceraDescifradaOk = true;
        record.mapaDePaginas = {
          id: fileHeader.header.sectionPageMapId,
          direccion: hex(fileHeader.header.sectionPageMapAddress),
        };
        const pages = readR2004PageMap(cursor, fileHeader, limits);
        record.paginas = pages.length;
        const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
        record.secciones = sections.map((s) => ({
          nombre: s.name || "(vacía)",
          id: s.sectionId,
          bytes: s.size,
          paginas: s.pageCount,
          compresion: s.compression,
          cifrado: s.encryption,
        }));
        record.cuatroSecciones = {};
        let assembled = 0;
        for (const name of CORE_SECTIONS) {
          const section = findR2004Section(sections, name);
          if (!section) {
            record.cuatroSecciones[name] = { ok: false, motivo: "ausente del mapa" };
            continue;
          }
          try {
            const payload = readR2004SectionPayload(cursor, section, pages, limits);
            record.cuatroSecciones[name] = { ok: true, bytes: payload.length };
            assembled += 1;
          } catch (error) {
            record.cuatroSecciones[name] = { ok: false, error: typedError(error) };
          }
        }
        record.cuatroSeccionesOk = assembled === CORE_SECTIONS.length;
      } catch (error) {
        record.cabeceraDescifradaOk = record.cabeceraDescifradaOk ?? false;
        record.cuatroSeccionesOk = false;
        record.error = typedError(error);
      }
    }
  }

  const porVersion = {};
  for (const record of archivos) {
    const version = record.version ?? "sin-abrir";
    const cell = (porVersion[version] ??= { archivos: 0, cuatroSeccionesOk: 0 });
    cell.archivos += 1;
    if (record.cuatroSeccionesOk) cell.cuatroSeccionesOk += 1;
  }
  const completos = archivos.filter((a) => a.cuatroSeccionesOk).length;
  const veredicto =
    completos === archivos.length && archivos.length > 0
      ? `La capa de contenedor R2004 localiza y descomprime las cuatro secciones AcDb:Header/Classes/Handles/AcDbObjects en los ${archivos.length} DWG reales de la familia (${Object.keys(porVersion).sort().join(", ")}).`
      : `La capa de contenedor R2004 completa las cuatro secciones en ${completos} de ${archivos.length} DWG de la familia; ver archivos con error.`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-r2004-container:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-r2004-container-v1",
    generadoPor: "node scripts/dwg/probe-r2004.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Sólo la capa de CONTENEDOR (cabecera cifrada, mapas, descompresión y ensamblado de secciones) sobre los fixtures AC1018/AC1024/AC1027/AC1032 del corpus admitido y verificado por hash. No decodifica objetos: eso es de la siguiente ola.",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundles: bundles.map((b) => b.id),
    },
    resumen: {
      archivos: archivos.length,
      cuatroSeccionesCompletas: completos,
      porVersion,
    },
    archivos,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const w = (s) => process.stdout.write(`${s}\n`);
  w(`probe-r2004: ${archivos.length} fixture(s) de la familia · cuatro secciones completas en ${completos}`);
  for (const [version, cell] of Object.entries(porVersion).sort()) {
    w(`  ${version}: ${cell.cuatroSeccionesOk}/${cell.archivos}`);
  }
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos) {
    if (!record.cuatroSeccionesOk) {
      w(`  FALLO ${record.bundle}/${record.archivo}: ${JSON.stringify(record.error ?? record.cuatroSecciones)}`);
    }
  }
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(`probe-r2004 abortado por el gate del corpus: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
