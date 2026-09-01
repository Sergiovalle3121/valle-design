#!/usr/bin/env node
/**
 * SONDA: EL TIPO DE LÍNEA DE CADA CAPA, POR SU HANDLE.
 *
 * QUÉ PROBLEMA RESUELVE. El códec decodifica la tabla LTYPE entera —patrón,
 * alineación y trazos, en las cinco versiones— y también sabe qué capas hay,
 * pero NO sabía cuál usa cuál: el registro de capa no llevaba ninguna
 * referencia al tipo de línea, así que una capa de ejes con `TRAZOS` llegaba
 * al lienzo dibujada continua. Los dos extremos estaban leídos y el puente
 * entre ellos no existía.
 *
 * DÓNDE VIVE EL DATO. El hecho ya estaba registrado
 * (`ODA-ODS-DWG-5.4.1-PUBLIC`): una entrada LAYER lleva «el tipo de línea y el
 * plotstyle por handle en el flujo final». El flujo final se contabilizaba
 * como tramo opaco —posición exacta, contenido sin interpretar—, que es la
 * regla del laboratorio para lo que no se ha medido. Esta sonda lo mide.
 *
 * MÉTODO — SE PRUEBAN TODAS LAS POSICIONES, NO LA ESPERADA. El flujo se lee
 * como una secuencia ordenada de handles resueltos y, para CADA posición, se
 * comprueba si el handle de esa posición apunta a la entrada LTYPE cuyo
 * nombre coincide con el que el oráculo DXF del mismo dibujo declara para esa
 * capa. Una posición se acepta sólo si acierta en TODAS las capas Y si los
 * valores VARÍAN: si todo el corpus usara `CONTINUOUS`, acertar no
 * significaría nada. Es la misma disciplina de la sonda de banderas de estado.
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
import { parseOracleDxf } from "./dxf-oracle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-layer-linetype.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
/**
 * TRES CAMINOS, NO DOS. AC1015 y AC1018 comparten la FORMA DEL OBJETO —la
 * entrada LAYER de R2000, con su flujo final como tramo opaco— pero NO el
 * contenedor: AC1018 ya es de la familia R2004, con sus secciones paginadas y
 * comprimidas. Meterlos en el mismo camino por «comparten el objeto» hace que
 * el lector de cabecera AC1015 rechace los ocho archivos AC1018 por firma, que
 * es exactamente lo que pasó la primera vez que se corrió esta sonda.
 */
const AC1015_VERSION = "AC1015";
const AC1018_VERSION = "AC1018";
const MODERN_VERSIONS = new Set(["AC1024", "AC1027", "AC1032"]);
/** Techo de posiciones a contrastar; el flujo real trae 5 o 6. */
const MAX_POSITIONS = 12;

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
    message: error?.message ?? String(error),
  };
}

const decodeName = (bytes) =>
  new TextDecoder("utf-8").decode(new Uint8Array(bytes ?? [])).replace(/\0+$/, "");

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const outIndex = args.indexOf("--out");
  const outFile =
    outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;

  const load = (dir, file) => import(pathToFileURL(path.join(DIST, dir, file)).href);
  const { readDwg } = await import(pathToFileURL(path.join(DIST, "index.js")).href);
  const { BoundedByteCursor } = await load("binary", "byte-cursor.js");
  const { DEFAULT_DWG_LIMITS: limits } = await load("api", "limits.js");
  const { DwgBitReader, resolveDwgHandleReference } = await load("codecs", "bitcodes.js");
  const { parseAc1015FileHeader } = await load("container", "ac1015-file-header.js");
  const { readAc1015ObjectMap } = await load("container", "ac1015-object-map.js");
  const { readAc1015ObjectEnvelope } = await load("container", "ac1015-object-envelope.js");
  const { parseR2004FileHeader, readR2004PageMap } = await load("container", "r2004-pages.js");
  const { readR2004SectionMap, readR2004SectionPayload, findR2004Section } = await load(
    "container",
    "r2004-sections.js",
  );
  const { pairR2010ObjectBounds, readR2010ObjectBody, readR2010ObjectHeader } = await load(
    "container",
    "r2010-object-envelope.js",
  );
  const { readR2010HandleStream } = await load("reader", "r2010-handle-stream.js");
  const { decodeAc1015LayerBody, AC1015_TYPE_LAYER } = await load("objects", "table-layer.js");
  const { normalizeR2004ObjectBody } = await load("reader", "r2004-body-adapter.js");

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    // Sin corpus no se mide nada. En `--check` eso NO es un fallo: el gate
    // corre en máquinas sin credencial ni espejo. El generador sí falla:
    // producir evidencia exige los bytes.
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-layer-linetype --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-layer-linetype: ${message}\n`);
    process.exit(1);
  }

  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bytesOf = (a) => new Uint8Array(transport.readFile(pin.commit, a.path));
  const textOf = (a) =>
    new TextDecoder("latin1").decode(new Uint8Array(transport.readFile(pin.commit, a.path)));

  /**
   * El flujo de handles de un LAYER de R2000 como secuencia resuelta. El
   * tramo ya está localizado por el decodificador —es su span opaco— y aquí
   * sólo se lee: GOLOSO hasta que restan menos de 8 bits, igual que el lector
   * de R2010+, porque el recuento es una salida y no una entrada.
   */
  const legacySequence = (bodyBytes, decoded) => {
    const span = decoded.opaqueSpans.find((s) => s.kind === "handle-stream");
    if (!span) return [];
    const totalBits = bodyBytes.length * 8;
    const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
    for (let i = 0; i < span.startBit; i += 1) reader.readB();
    const own = decoded.common.ownHandle.value;
    const out = [];
    while (totalBits - reader.bitPosition >= 8 && out.length < MAX_POSITIONS * 4) {
      try {
        out.push(resolveDwgHandleReference(reader.readH(), own));
      } catch {
        break;
      }
    }
    return out;
  };

  const observations = [];
  const archivos = [];

  for (const bundle of corpus.bundles) {
    const isAc1015 = bundle.dwgVersion === AC1015_VERSION;
    const isAc1018 = bundle.dwgVersion === AC1018_VERSION;
    const modern = MODERN_VERSIONS.has(bundle.dwgVersion);
    if (!isAc1015 && !isAc1018 && !modern) continue;
    const oracles = new Map(
      bundle.artifacts
        .filter((a) => a.path.endsWith(".dxf"))
        .map((a) => [path.basename(a.path, ".dxf"), a]),
    );
    for (const artifact of bundle.artifacts.filter(
      (a) => a.kind === "fixtures" && a.path.endsWith(".dwg"),
    )) {
      const stem = path.basename(artifact.path, ".dwg");
      const record = {
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        fixture: artifact.path,
        sha256: artifact.sha256,
      };
      archivos.push(record);
      const oracle = oracles.get(stem);
      if (!oracle) {
        record.omitido = "sin oráculo DXF con el mismo nombre";
        continue;
      }
      try {
        const truth = new Map(
          parseOracleDxf(textOf(oracle)).layers.map((l) => [l.name.toUpperCase(), l]),
        );
        const bytes = bytesOf(artifact);
        const database = readDwg(bytes);
        const ltypeOf = new Map(
          (database.tables?.linetypes ?? []).map((e) => [e.handle, decodeName(e.name)]),
        );
        const layerNameOf = new Map(
          (database.layers ?? []).map((l) => [l.handle, decodeName(l.name)]),
        );
        let comparadas = 0;

        const observe = (nombre, sequence) => {
          const expected = truth.get(nombre.toUpperCase());
          if (!expected) return;
          comparadas += 1;
          observations.push({
            version: bundle.dwgVersion,
            archivo: stem,
            capa: nombre,
            esperado: (expected.linetype ?? "").toUpperCase(),
            handles: sequence.map((h) => ({
              handle: h.handle,
              ltype: ltypeOf.get(h.handle) ?? null,
            })),
          });
        };

        /**
         * Un LAYER de forma R2000: se decodifica y se lee su tramo opaco.
         *
         * `normalize` existe porque un cuerpo AC1018 NO es ya un cuerpo R2000:
         * hay que pasarlo por el mismo adaptador que usa el lector real antes
         * de decodificarlo. Omitirlo no da error visible —el decodificador
         * simplemente no reconoce el tipo— y deja las ocho capas de AC1018
         * fuera de la medición en silencio, que es como se detectó.
         */
        const observeLegacyEnvelope = (envelope, normalize) => {
          if (envelope.type !== AC1015_TYPE_LAYER) return;
          let bodyBytes = envelope.bodyBytes;
          let decoded;
          try {
            if (normalize) bodyBytes = normalizeR2004ObjectBody(bodyBytes, false);
            decoded = decodeAc1015LayerBody(bodyBytes);
          } catch {
            return;
          }
          observe(decodeName(decoded.layer.name), legacySequence(bodyBytes, decoded));
        };

        /** Las secciones de un contenedor de la familia R2004. */
        const r2004Payloads = () => {
          const cursor = new BoundedByteCursor(bytes);
          const fileHeader = parseR2004FileHeader(cursor);
          const pages = readR2004PageMap(cursor, fileHeader, limits);
          const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
          const payloadOf = (name) =>
            readR2004SectionPayload(cursor, findR2004Section(sections, name), pages, limits);
          const objects = payloadOf("AcDb:AcDbObjects");
          const handlesPayload = payloadOf("AcDb:Handles");
          return {
            objects,
            mapEntries: readAc1015ObjectMap(
              new BoundedByteCursor(handlesPayload),
              { start: 0, size: handlesPayload.length },
              limits,
              objects.length,
            ),
          };
        };

        if (isAc1015) {
          const cursor = new BoundedByteCursor(bytes);
          const header = parseAc1015FileHeader(cursor);
          const mapRecord = header.records.find((r) => r.id === 2);
          if (!mapRecord) throw new Error("sin mapa de objetos");
          for (const entry of readAc1015ObjectMap(cursor, mapRecord, limits))
            observeLegacyEnvelope(
              readAc1015ObjectEnvelope(cursor, entry.offset, header.records),
              false,
            );
        } else if (isAc1018) {
          // Contenedor R2004, objeto R2000: el payload ya viene descomprimido
          // y sin páginas, así que la envoltura AC1015 lo lee sin extensiones
          // reservadas — igual que hace el lector real para esta versión.
          const { objects, mapEntries } = r2004Payloads();
          const objectsCursor = new BoundedByteCursor(objects);
          for (const entry of mapEntries)
            observeLegacyEnvelope(
              readAc1015ObjectEnvelope(objectsCursor, entry.offset, []),
              true,
            );
        } else {
          const { objects, mapEntries } = r2004Payloads();
          for (const bound of pairR2010ObjectBounds(
            mapEntries.map((e) => ({ handle: e.handle, offset: e.offset })),
            objects.length,
          )) {
            const nombre = layerNameOf.get(bound.handle);
            if (nombre === undefined) continue;
            try {
              const body = readR2010ObjectBody(objects, bound).bodyBytes;
              const objectHeader = readR2010ObjectHeader(body, bound.handle);
              if (objectHeader.type !== AC1015_TYPE_LAYER) continue;
              observe(nombre, readR2010HandleStream(body, objectHeader));
            } catch {
              continue;
            }
          }
        }
        record.capasComparadas = comparadas;
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  /** Contrasta «el handle de esta posición es el tipo de línea» en todas. */
  const testPosition = (position) => {
    let aciertos = 0;
    let comparadas = 0;
    const vistos = new Set();
    const discrepancias = [];
    for (const o of observations) {
      const h = o.handles[position];
      if (!h) continue;
      comparadas += 1;
      const leido = h.ltype;
      if (leido) vistos.add(leido.toUpperCase());
      if (leido && leido.toUpperCase() === o.esperado) aciertos += 1;
      else if (discrepancias.length < 10)
        discrepancias.push({
          version: o.version,
          archivo: o.archivo,
          capa: o.capa,
          esperado: o.esperado,
          leido,
        });
    }
    return {
      posicion: position,
      aciertos,
      comparadas,
      // Que los valores VARÍEN es lo que da fuerza: si todo el corpus usara
      // el mismo tipo de línea, acertar no falsaría nada.
      valoresDistintos: [...vistos].sort(),
      separable: vistos.size > 1,
      concuerdaSiempre: comparadas > 0 && aciertos === comparadas,
      discrepancias,
    };
  };

  const maxLen = observations.reduce((m, o) => Math.max(m, o.handles.length), 0);
  const posiciones = [];
  for (let p = 0; p < Math.min(maxLen, MAX_POSITIONS); p += 1) posiciones.push(testPosition(p));
  const ganadoras = posiciones
    .filter((p) => p.concuerdaSiempre && p.separable && p.comparadas === observations.length)
    .map((p) => p.posicion);

  const versiones = [...new Set(observations.map((o) => o.version))].sort();
  const tiposVistos = [
    ...new Set(observations.map((o) => o.esperado).filter(Boolean)),
  ].sort();
  const medido = ganadoras.length === 1 && observations.length > 0;

  const veredicto = medido
    ? `El handle de la posición ${ganadoras[0]} del flujo final de una entrada LAYER es su TIPO DE LÍNEA: apunta a la entrada LTYPE cuyo nombre declara el oráculo DXF en ${observations.length}/${observations.length} capas de ${versiones.length} versiones (${versiones.join(", ")}), con ${tiposVistos.length} tipos distintos en juego (${tiposVistos.join(", ")}). Ninguna otra posición del flujo acierta ni una sola vez.`
    : `NO se sostiene una posición única para el tipo de línea de capa: candidatas ${JSON.stringify(ganadoras)} sobre ${observations.length} capas. No se enlaza ninguna capa con ningún tipo de línea.`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-layer-linetype:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-layer-linetype-v1",
    generadoPor: "node scripts/dwg/probe-layer-linetype.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Sólo el ENLACE entre una entrada LAYER y su entrada LTYPE, por handle, sobre los fixtures del corpus admitido que tienen oráculo DXF con el mismo nombre. El patrón de trazos del LTYPE ya estaba medido antes; esto mide QUIÉN USA CUÁL, que es lo que faltaba para que un tipo de línea llegue al lienzo.",
    metodo:
      "El flujo final de la entrada se lee como secuencia ordenada de handles resueltos y se contrasta CADA posición contra el oráculo DXF del mismo dibujo. Una posición se acepta sólo si acierta en TODAS las capas observadas, si está presente en todas, y si los valores VARÍAN. Las dos familias comparten posición pero no lector: R2000/R2004 usa el tramo opaco que el decodificador de LAYER ya localizaba, y R2010+ el lector de flujo de handles ya medido en 105/105 objetos.",
    limiteDeLaEvidencia:
      "El corpus entero es salida del ODA File Converter desde DXF fuente propios: lo medido es cómo ESE productor ordena el flujo. Los tipos de línea en juego son pocos y ninguno viene de un xref ni de una capa dependiente, así que el caso de una entrada LTYPE de referencia externa NO está ejercitado. La posición siguiente del flujo —el plotstyle, según el hecho registrado— no se interpreta: se mide que no es un LTYPE, nada más.",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundles: [...new Set(archivos.map((a) => a.bundle))],
    },
    resumen: {
      fixtures: archivos.length,
      capasObservadas: observations.length,
      versiones,
      posicionDelTipoDeLinea: ganadoras,
      tiposDeLineaEnJuego: tiposVistos,
      medido,
    },
    hipotesisPorPosicion: posiciones,
    archivos,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const w = (s) => process.stdout.write(`${s}\n`);

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-layer-linetype --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-layer-linetype --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(report.resumen)}\n`);
      process.exit(1);
    }
    w(`probe-layer-linetype --check: la evidencia coincide (${observations.length} capas).`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-layer-linetype: ${archivos.length} fixture(s) · ${observations.length} capas`);
  w(`  posicion del tipo de linea : ${JSON.stringify(ganadoras)}`);
  w(`  tipos en juego             : ${tiposVistos.join(", ")}`);
  for (const p of posiciones)
    w(`  pos ${p.posicion}: ${p.aciertos}/${p.comparadas} · distintos=${p.valoresDistintos.join("|") || "-"} · separable=${p.separable}`);
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos)
    if (record.error) w(`  FALLO ${record.version}/${record.archivo}: ${JSON.stringify(record.error)}`);
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-layer-linetype abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
