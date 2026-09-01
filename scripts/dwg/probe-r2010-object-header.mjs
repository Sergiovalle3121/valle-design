#!/usr/bin/env node
/**
 * Harness del ENCABEZADO DE OBJETO R2010+ (AC1024/AC1027/AC1032) contra el
 * corpus ADMITIDO — intake 2026-08-31.
 *
 * QUÉ RESPONDE. El intake de 2026-08-23 dejó la codificación del tipo de
 * objeto R2010+ marcada `BLOCKED_BY_SOURCE_GATE`: buscó el tipo asumiéndolo
 * al frente del cuerpo, probó tres anchos contra una LINE conocida y no lo
 * reprodujo. Este harness responde la misma pregunta por otra vía —la que el
 * corpus permite y aquélla no usó— y publica el resultado con su falsación.
 *
 * LA VÍA. Los cinco bundles fundacionales son LOS MISMOS OCHO DIBUJOS
 * convertidos a cinco contenedores desde un DXF fuente byte-idéntico. AC1015
 * ya se decodifica con cero discrepancias contra su oráculo DXF, así que para
 * cada handle se sabe de antemano qué tipo debe tener su gemelo moderno. Con
 * la respuesta conocida, la codificación deja de adivinarse y se RESUELVE.
 *
 * POR QUÉ EL RESULTADO SE PUEDE FALSAR. El handle propio del objeto viaja
 * pegado detrás del campo de tipo, y el mapa de handles ya dice cuál debe ser.
 * Si el tamaño, el tamaño del flujo de handles o el tipo tuvieran el ancho
 * equivocado, ese handle saldría desalineado y basura. Que salga EXACTO en
 * todos los objetos de los 24 fixtures es lo que sostiene la medición; el
 * porcentaje de tipos que coinciden con el gemelo es la segunda comprobación,
 * independiente de la primera.
 *
 * LO QUE ESTE HARNESS NO AFIRMA. Decodificar el encabezado no es decodificar
 * el cuerpo. `readR2004Database` sigue fallando cerrado para estas tres
 * versiones y este reporte no mueve ninguna capacidad de CAPABILITIES.md.
 *
 * DE DÓNDE SALEN LOS BYTES. Del gate consumidor (`corpus-consumer.mjs`):
 * commit fijado + SHA-256 verificado. No se lee el working tree del repo
 * hermano.
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
  "dwg-r2010-object-header.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const MODERN_VERSIONS = ["AC1024", "AC1027", "AC1032"];
const REFERENCE_VERSION = "AC1015";
/** Umbral en que empiezan los números de clase: por debajo el tipo es fijo. */
const FIRST_CLASS_NUMBER = 0x1f0;

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
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(path.join(DIST, "container", "r2004-pages.js"))) {
    process.stderr.write(
      "probe-r2010-object-header: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }
  const load = (...p) => import(pathToFileURL(path.join(DIST, ...p)).href);
  const { BoundedByteCursor } = await load("binary", "byte-cursor.js");
  const { createDwgLimits } = await load("api", "limits.js");
  const { parseAc1015FileHeader } = await load("container", "ac1015-file-header.js");
  const { readAc1015ObjectMap } = await load("container", "ac1015-object-map.js");
  const { readAc1015ObjectEnvelope } = await load(
    "container",
    "ac1015-object-envelope.js",
  );
  const { parseR2004FileHeader, readR2004PageMap } = await load(
    "container",
    "r2004-pages.js",
  );
  const { readR2004SectionMap, readR2004SectionPayload, findR2004Section } =
    await load("container", "r2004-sections.js");
  const { pairR2010ObjectBounds, readR2010ObjectBody, readR2010ObjectHeader } =
    await load("container", "r2010-object-envelope.js");
  const limits = createDwgLimits();

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    // Sin corpus no se mide nada. En modo `--check` eso NO es un fallo: el
    // gate corre en máquinas sin credencial ni espejo, y un gate que revienta
    // ahí acaba desactivado. Lo que no puede pasar es afirmar algo sin medir,
    // y por eso el generador sí falla: producir evidencia exige los bytes.
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-r2010-object-header --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-r2010-object-header: ${message}\n`);
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bundleFor = (version) =>
    corpus.bundles.find(
      (bundle) =>
        bundle.dwgVersion === version && bundle.id.startsWith("valle.fundacional."),
    ) ?? null;
  const fixturesOf = (bundle) =>
    bundle.artifacts.filter((a) => a.kind === "fixtures" && a.path.endsWith(".dwg"));
  const bytesOf = (artifact) =>
    new Uint8Array(transport.readFile(pin.commit, artifact.path));

  /** handle → tipo de TODOS los objetos del gemelo AC1015, por su envoltura. */
  const referenceTypes = (artifact) => {
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const header = parseAc1015FileHeader(cursor);
    const objectMapRecord = header.records.find((record) => record.id === 2);
    if (!objectMapRecord) throw new Error("el gemelo AC1015 no trae mapa de objetos");
    const types = new Map();
    for (const entry of readAc1015ObjectMap(cursor, objectMapRecord, limits)) {
      const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
      types.set(entry.handle, envelope.type);
    }
    return types;
  };

  /** Encabezado decodificado de cada objeto de un fixture R2010+. */
  const modernHeaders = (artifact) => {
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const fileHeader = parseR2004FileHeader(cursor);
    const pages = readR2004PageMap(cursor, fileHeader, limits);
    const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
    const payloadOf = (name) =>
      readR2004SectionPayload(cursor, findR2004Section(sections, name), pages, limits);
    const handlesPayload = payloadOf("AcDb:Handles");
    const objectsPayload = payloadOf("AcDb:AcDbObjects");
    const mapEntries = readAc1015ObjectMap(
      new BoundedByteCursor(handlesPayload),
      { start: 0, size: handlesPayload.length },
      limits,
      objectsPayload.length,
    );
    const bounds = pairR2010ObjectBounds(
      mapEntries.map((entry) => ({ handle: entry.handle, offset: entry.offset })),
      objectsPayload.length,
    );
    return bounds.map((bound) => {
      const body = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
      // Sin `expectedHandle`: el contraste se REPORTA, no se impone. Un
      // harness que aborta al primer desacuerdo no mide, sólo se protege.
      return { mapHandle: bound.handle, header: readR2010ObjectHeader(body) };
    });
  };

  const referenceBundle = bundleFor(REFERENCE_VERSION);
  if (!referenceBundle) throw new Error("el corpus admitido no trae el bundle AC1015");
  const referenceByName = new Map(
    fixturesOf(referenceBundle).map((a) => [path.basename(a.path), a]),
  );

  const archivos = [];
  const porVersion = {};
  let totalObjetos = 0;
  let totalHandleExacto = 0;
  let totalTipoFijoComparado = 0;
  let totalTipoFijoIgual = 0;
  const selectoresNoObservados = [];

  for (const version of MODERN_VERSIONS) {
    const bundle = bundleFor(version);
    if (!bundle) continue;
    porVersion[version] = {
      archivos: 0,
      objetos: 0,
      handleExacto: 0,
      tipoFijoComparado: 0,
      tipoFijoIgual: 0,
    };
    for (const artifact of fixturesOf(bundle)) {
      const name = path.basename(artifact.path);
      const record = {
        bundle: bundle.id,
        archivo: path.basename(name, ".dwg"),
        fixture: artifact.path,
        sha256: artifact.sha256,
        version,
      };
      archivos.push(record);
      porVersion[version].archivos += 1;
      try {
        const reference = referenceByName.get(name);
        if (!reference) throw new Error("sin gemelo AC1015 con el mismo nombre");
        const expected = referenceTypes(reference);
        const headers = modernHeaders(artifact);
        let handleExacto = 0;
        let tipoFijoComparado = 0;
        let tipoFijoIgual = 0;
        const discrepancias = [];
        for (const { mapHandle, header } of headers) {
          if (header.handle === mapHandle) handleExacto += 1;
          const reference = expected.get(mapHandle);
          if (reference === undefined) continue;
          // Un número de CLASE lo asigna cada archivo en su propia sección de
          // clases: comparar el número crudo entre dos archivos distintos no
          // significa nada. Sólo se contrastan los tipos FIJOS.
          if (reference >= FIRST_CLASS_NUMBER || header.type >= FIRST_CLASS_NUMBER)
            continue;
          tipoFijoComparado += 1;
          if (reference === header.type) tipoFijoIgual += 1;
          else if (discrepancias.length < 20)
            discrepancias.push({
              handle: mapHandle,
              gemeloAc1015: reference,
              decodificado: header.type,
            });
        }
        record.objetos = headers.length;
        record.handleExacto = handleExacto;
        record.tipoFijoComparado = tipoFijoComparado;
        record.tipoFijoIgual = tipoFijoIgual;
        if (discrepancias.length) record.discrepanciasDeTipoFijo = discrepancias;
        totalObjetos += headers.length;
        totalHandleExacto += handleExacto;
        totalTipoFijoComparado += tipoFijoComparado;
        totalTipoFijoIgual += tipoFijoIgual;
        porVersion[version].objetos += headers.length;
        porVersion[version].handleExacto += handleExacto;
        porVersion[version].tipoFijoComparado += tipoFijoComparado;
        porVersion[version].tipoFijoIgual += tipoFijoIgual;
      } catch (error) {
        record.error = typedError(error);
        if (/never observed/.test(record.error.message))
          selectoresNoObservados.push(`${version}/${record.archivo}`);
      }
    }
  }

  const veredicto =
    totalObjetos > 0 && totalHandleExacto === totalObjetos
      ? `El encabezado de objeto R2010+ (MS tamaño · UMC bits de flujo de handles · BOT tipo · H handle propio) decodifica el handle propio EXACTO en ${totalHandleExacto}/${totalObjetos} objetos de los ${archivos.length} fixtures AC1024/AC1027/AC1032 del corpus admitido. El CUERPO sigue sin decodificarse.`
      : `El encabezado de objeto R2010+ NO reproduce el handle propio en todos los objetos (${totalHandleExacto}/${totalObjetos}): la medición NO sostiene la estructura.`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-r2010-object-header:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-r2010-object-header-v1",
    generadoPor: "node scripts/dwg/probe-r2010-object-header.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Sólo el ENCABEZADO del cuerpo de objeto (tamaño MS, tamaño del flujo de handles UMC, tipo BOT y handle propio H) sobre los fixtures AC1024/AC1027/AC1032 del corpus admitido y verificado por hash. No decodifica el cuerpo: cuando se midio esto, readR2004Database fallaba cerrado para las tres. [ACTUALIZADO EL 2026-09-01: ya no. Las tres se leen enteras y el corpus queda en cero discrepancias en las cinco versiones; esta sonda mide un ESCALON anterior y se conserva porque su medicion del encabezado sigue siendo la que sostiene todo lo que vino despues.]",
    metodo:
      "Los cinco bundles fundacionales son los mismos ocho dibujos en cinco contenedores desde un DXF fuente byte-idéntico. El gemelo AC1015 —ya validado con cero discrepancias contra su oráculo DXF— da el tipo esperado de cada handle. La falsación primaria es que el handle propio, que viaja pegado tras el tipo, aterrice exacto: un ancho equivocado en cualquiera de los tres campos previos lo desalinearía.",
    limiteDeLaEvidencia:
      "Los tipos que superan 0x1F0 son NÚMEROS DE CLASE asignados por cada archivo en su propia sección de clases; comparar el número crudo entre dos archivos distintos no significa nada y por eso no se cuenta. Las discrepancias de tipo fijo que quedan son pares DICTIONARY/XRECORD en handles contiguos: el conversor los numeró en distinto orden en cada versión, de modo que el gemelo no es la misma pieza. Los selectores 2 y 3 del BOT no aparecen ni una vez en este corpus y por eso fallan cerrados en el códec.",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundles: MODERN_VERSIONS.map((v) => bundleFor(v)?.id).filter(Boolean),
      referencia: referenceBundle.id,
    },
    resumen: {
      archivos: archivos.length,
      objetos: totalObjetos,
      handlePropioExacto: totalHandleExacto,
      tipoFijoComparado: totalTipoFijoComparado,
      tipoFijoIgualAlGemelo: totalTipoFijoIgual,
      selectoresNoObservados: selectoresNoObservados.length,
      porVersion,
    },
    archivos,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const w = (s) => process.stdout.write(`${s}\n`);

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-r2010-object-header --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    // Se comparan las CIFRAS, no el archivo entero: `generadoEn` y la máquina
    // cambian en cada corrida y no son el hecho que este gate vigila.
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-r2010-object-header --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(report.resumen)}\n`);
      process.exit(1);
    }
    w(`probe-r2010-object-header --check: la evidencia coincide (${totalHandleExacto}/${totalObjetos} handles exactos).`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-r2010-object-header: ${archivos.length} fixture(s) · ${totalObjetos} objetos`);
  w(`  handle propio exacto      : ${totalHandleExacto}/${totalObjetos}`);
  w(`  tipo fijo igual al gemelo : ${totalTipoFijoIgual}/${totalTipoFijoComparado}`);
  for (const [version, cell] of Object.entries(porVersion).sort()) {
    w(`  ${version}: handles ${cell.handleExacto}/${cell.objetos} · tipos fijos ${cell.tipoFijoIgual}/${cell.tipoFijoComparado}`);
  }
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos) {
    if (record.error) w(`  FALLO ${record.version}/${record.archivo}: ${JSON.stringify(record.error)}`);
  }
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-r2010-object-header abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
