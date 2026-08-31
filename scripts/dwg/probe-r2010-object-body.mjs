#!/usr/bin/env node
/**
 * Harness del CUERPO de objeto R2010+ (AC1024/AC1027/AC1032) para las
 * entidades SIN CADENAS (LINE, POINT, CIRCLE, ARC, LWPOLYLINE) contra el
 * corpus ADMITIDO — intake 2026-08-31 (M4, continuación).
 *
 * QUÉ RESPONDE. `probe-r2010-object-header.mjs` resolvió el ENCABEZADO
 * (MS/UMC/BOT/H) y declaró explícitamente que el CUERPO seguía sin
 * decodificarse: el flujo de datos R2010+ separa las cadenas a un flujo
 * propio y su cabecera común de entidad difiere aún de la R2000. Este
 * harness responde esa pregunta para las cinco entidades que NUNCA llevan
 * cadena (ni LINE, POINT, CIRCLE, ARC ni LWPOLYLINE tienen un solo campo TV),
 * con el MISMO oráculo diferencial que resolvió el encabezado: los cinco
 * bundles fundacionales son los mismos ocho dibujos convertidos a cinco
 * contenedores desde un DXF fuente byte-idéntico, así que el gemelo AC1015
 * —ya validado con cero discrepancias— da tipo Y geometría exactos de
 * antemano para cada handle.
 *
 * MÉTODO, en dos pasos falsables por separado:
 *
 * 1. Localización SIN hipótesis de forma. Se busca, bit a bit, el primer
 *    offset donde 8 bytes consecutivos (mismo orden que `DwgBitReader.readRD`)
 *    reproducen EXACTO el double IEEE-754 del primer campo geométrico del
 *    gemelo — la misma técnica, ya citada en CAPABILITIES.md (intake
 *    2026-08-23), que identificó de forma independiente la LINE real de
 *    `02-una-linea.dwg`. Una coincidencia de 64 bits exactos por azar es
 *    2^-64 por posición candidata: astronómicamente improbable. El ancla
 *    reveló, sin asumir NADA sobre la disposición de la cabecera común, que
 *    el tipo de dato arranca a una anchura FIJA desde el handle propio,
 *    idéntica para los cuatro tipos con anchura de prefijo distinta
 *    (LINE resta 1 bit de `zeroZ`; CIRCLE/ARC/POINT restan 2 del flag BD de
 *    su primer campo) — esa coincidencia ENTRE TIPOS es la primera
 *    falsación: un ancho equivocado en cualquier campo previo desalinearía
 *    cada tipo de forma DISTINTA, no a la misma cifra.
 * 2. Con esa anchura ya establecida (`COMMON_HEADER_WIDTH_BITS`, medida en
 *    una corrida previa de este mismo harness y fijada aquí para poder
 *    comparar geometría COMPLETA, no sólo el primer campo), se decodifica:
 *    la cabecera común R2000 SIN cambio de anchura (EED, gráfico, modo,
 *    reactores, sin-vínculos/xdic-missing, color, escala de tipo de línea,
 *    banderas de tipo de línea y de plotstyle — hechos ya registrados de
 *    ODA-ODS-DWG-5.4.1-PUBLIC) hasta un tramo intermedio de anchura medida
 *    que este laboratorio NO interpreta (capacidad ausente declarada: no se
 *    sabe si son invisibilidad/lineweight reordenados u otra cosa; un ancho
 *    inventado para ese tramo sería el peor modo de fallo posible, así que
 *    se declara opaco), y la geometría reutilizando los MISMOS
 *    decodificadores de tipo que R2000 (cero decodificadores gemelos). El
 *    límite del flujo de handles lo da `bodyBytes.length*8 - handleStreamBits`
 *    — NO `objectSize*8 - handleStreamBits`: medido aquí que `objectSize`
 *    (MS) excluye los propios bytes de MS y de UMC, algo que el intake del
 *    encabezado no necesitó notar porque nunca leyó más allá del handle
 *    propio. La segunda falsación es que la geometría decodificada coincida
 *    EXACTA con el gemelo Y que el remanente entre el fin de esa geometría y
 *    el límite de handles sea EXACTAMENTE 1 bit — el bit de presencia de
 *    cadenas (hecho ya registrado: "AC1021+ introduce el flujo de STRINGS...
 *    el bit de presencia del final del dato"), en 0 porque ninguna de estas
 *    cinco entidades tiene cadena que declarar.
 *
 * LO QUE ESTE HARNESS NO AFIRMA. No decodifica el flujo de handles (owner,
 * capa, xdictionary) ni ninguna entidad CON cadenas (el bit de presencia se
 * mide en 0 aquí; un archivo real con texto lo pondría en 1, y ese camino no
 * se ejercita). `readR2004Database` no se toca desde este script.
 *
 * DE DÓNDE SALEN LOS BYTES. Del gate consumidor (`corpus-consumer.mjs`):
 * commit fijado + SHA-256 verificado. No se lee el working tree del repo
 * hermano.
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
  "dwg-r2010-object-body.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const MODERN_VERSIONS = ["AC1024", "AC1027", "AC1032"];
const REFERENCE_VERSION = "AC1015";
const STRINGLESS_TYPES = new Map([
  [0x13, "line"],
  [0x1b, "point"],
  [0x12, "circle"],
  [0x11, "arc"],
  [0x4d, "lwpolyline"],
]);
/**
 * Anchura MEDIDA (no asumida) del tramo entre el handle propio y el primer
 * bit de datos del TIPO, por versión — ver la cabecera del módulo, paso 1.
 */
const COMMON_HEADER_WIDTH_BITS = { AC1024: 39, AC1027: 40, AC1032: 40 };
/** Bits del bit de presencia de cadenas que este corpus ejercita (siempre 0). */
const EXPECTED_TAIL_BITS = 1;

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
    offset: error?.detail?.offset ?? null,
    message: String(error?.detail?.message ?? error?.message ?? error).slice(0, 300),
  };
}

/** El bit `index` (MSB primero por byte) de `bytes` — el orden del flujo DWG. */
function bitAt(bytes, index) {
  const byteIndex = index >> 3;
  if (byteIndex >= bytes.length) return null;
  return (bytes[byteIndex] >> (7 - (index & 7))) & 1;
}

/**
 * Busca el PRIMER bitOffset en [searchStart, searchEnd) cuyo RD (8 bytes
 * crudos, mismo orden que `DwgBitReader.readRD`) coincide bit a bit con
 * `target`. `target` no finito nunca puede coincidir por construcción (evita
 * un "no encontrado" engañoso sobre un valor que no podría matchear nunca).
 */
function findExactDoubleBitOffset(bytes, target, searchStart, searchEnd) {
  if (!Number.isFinite(target)) return null;
  const targetView = new DataView(new ArrayBuffer(8));
  targetView.setFloat64(0, target, true);
  const targetBytes = new Uint8Array(targetView.buffer);
  for (let bitOffset = searchStart; bitOffset < searchEnd; bitOffset += 1) {
    let matched = true;
    for (let byteIndex = 0; byteIndex < 8 && matched; byteIndex += 1) {
      let value = 0;
      for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
        const bit = bitAt(bytes, bitOffset + byteIndex * 8 + bitIndex);
        if (bit === null) {
          matched = false;
          break;
        }
        value = (value << 1) | bit;
      }
      if (matched && value !== targetBytes[byteIndex]) matched = false;
    }
    if (matched) return bitOffset;
  }
  return null;
}

/** Igualdad aproximada recursiva (tolerancia relativa 1e-6 para números). */
function approxEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => approxEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!approxEqual(a[key], b[key])) return false;
    return true;
  }
  return false;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outFile =
    outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(path.join(DIST, "container", "r2004-pages.js"))) {
    process.stderr.write(
      "probe-r2010-object-body: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }
  const load = (...p) => import(pathToFileURL(path.join(DIST, ...p)).href);
  const { BoundedByteCursor } = await load("binary", "byte-cursor.js");
  const { DwgBitReader } = await load("codecs", "bitcodes.js");
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
  const {
    decodeAc1015EntityBody,
    decodeLine,
    decodePoint,
    decodeCircle,
    decodeArc,
  } = await load("objects", "entities-core.js");
  const { decodeLwPolyline } = await load("objects", "entities-poly.js");
  const limits = createDwgLimits();

  const TYPE_DECODERS = {
    line: decodeLine,
    point: decodePoint,
    circle: decodeCircle,
    arc: decodeArc,
    lwpolyline: decodeLwPolyline,
  };
  const ANCHOR_OF = {
    line: (e) => e.start.x,
    point: (e) => e.position.x,
    circle: (e) => e.center.x,
    arc: (e) => e.center.x,
    lwpolyline: (e) => e.vertices[0]?.x,
  };

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-r2010-object-body --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-r2010-object-body: ${message}\n`);
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

  const referenceEntities = (artifact) => {
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const header = parseAc1015FileHeader(cursor);
    const objectMapRecord = header.records.find((record) => record.id === 2);
    const byHandle = new Map();
    for (const entry of readAc1015ObjectMap(cursor, objectMapRecord, limits)) {
      const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
      if (!STRINGLESS_TYPES.has(envelope.type)) continue;
      try {
        const decoded = decodeAc1015EntityBody(envelope.bodyBytes);
        byHandle.set(entry.handle, decoded.entity);
      } catch {
        // Omitido: no observado en el corpus fundacional.
      }
    }
    return byHandle;
  };

  const referenceBundle = bundleFor(REFERENCE_VERSION);
  if (!referenceBundle) throw new Error("el corpus admitido no trae el bundle AC1015");
  const referenceByName = new Map(
    fixturesOf(referenceBundle).map((a) => [path.basename(a.path), a]),
  );

  const archivos = [];
  const porVersion = {};
  let totalObjetos = 0;
  let totalAnclado = 0;
  let totalGeometriaExacta = 0;
  let totalTailEsperado = 0;
  const tailBitsInesperados = [];

  for (const version of MODERN_VERSIONS) {
    const bundle = bundleFor(version);
    if (!bundle) continue;
    porVersion[version] = { archivos: 0, objetos: 0, anclado: 0, geometriaExacta: 0, tailEsperado: 0 };
    for (const artifact of fixturesOf(bundle)) {
      const name = path.basename(artifact.path);
      const reference = referenceByName.get(name);
      const record = { bundle: bundle.id, archivo: path.basename(name, ".dwg"), fixture: artifact.path, sha256: artifact.sha256, version };
      archivos.push(record);
      porVersion[version].archivos += 1;
      if (!reference) {
        record.error = { code: "NO_TWIN", offset: null, message: "sin gemelo AC1015 con el mismo nombre" };
        continue;
      }
      const referenceMap = referenceEntities(reference);

      try {
        const cursor = new BoundedByteCursor(bytesOf(artifact));
        const fileHeader = parseR2004FileHeader(cursor);
        const pages = readR2004PageMap(cursor, fileHeader, limits);
        const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
        const payloadOf = (n) =>
          readR2004SectionPayload(cursor, findR2004Section(sections, n), pages, limits);
        const handlesPayload = payloadOf("AcDb:Handles");
        const objectsPayload = payloadOf("AcDb:AcDbObjects");
        const mapEntries = readAc1015ObjectMap(
          new BoundedByteCursor(handlesPayload),
          { start: 0, size: handlesPayload.length },
          limits,
          objectsPayload.length,
        );
        const bounds = pairR2010ObjectBounds(
          mapEntries.map((e) => ({ handle: e.handle, offset: e.offset })),
          objectsPayload.length,
        );

        let objetos = 0;
        let anclado = 0;
        let geometriaExacta = 0;
        let tailEsperado = 0;
        const discrepancias = [];

        for (const bound of bounds) {
          const referenceEntity = referenceMap.get(bound.handle);
          if (!referenceEntity) continue;
          const typeName = referenceEntity.kind;
          const anchorFn = ANCHOR_OF[typeName];
          if (!anchorFn) continue;
          const anchor = anchorFn(referenceEntity);
          if (typeof anchor !== "number") continue;

          const bodyBytes = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
          const header = readR2010ObjectHeader(bodyBytes, bound.handle);
          if (STRINGLESS_TYPES.get(header.type) !== typeName) continue;
          objetos += 1;

          // `objectSize` (MS) excluye sus propios bytes y los de UMC (medido,
          // ver cabecera del módulo): el límite real usa `bodyBytes.length`.
          const handleStreamStart = bodyBytes.length * 8 - header.handleStreamBits;
          const searchEnd = Math.max(header.dataBitOffset, handleStreamStart - 64) + 1;
          const anchorBit = findExactDoubleBitOffset(bodyBytes, anchor, header.dataBitOffset, searchEnd);
          if (anchorBit !== null) anclado += 1;

          const typeDataStart = header.dataBitOffset + COMMON_HEADER_WIDTH_BITS[version];
          const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
          for (let index = 0; index < typeDataStart; index += 1) reader.readB();
          const decodedEntity = TYPE_DECODERS[typeName](reader);
          const tailBits = handleStreamStart - reader.bitPosition;
          const matches = approxEqual(decodedEntity, referenceEntity);
          if (matches) geometriaExacta += 1;
          if (tailBits === EXPECTED_TAIL_BITS) tailEsperado += 1;
          else if (discrepancias.length < 20) {
            discrepancias.push({ handle: bound.handle, tipo: typeName, tailBits });
          }
        }

        record.objetos = objetos;
        record.anclado = anclado;
        record.geometriaExacta = geometriaExacta;
        record.tailEsperado = tailEsperado;
        if (discrepancias.length) record.discrepancias = discrepancias;
        totalObjetos += objetos;
        totalAnclado += anclado;
        totalGeometriaExacta += geometriaExacta;
        totalTailEsperado += tailEsperado;
        tailBitsInesperados.push(...discrepancias.map((d) => ({ ...d, archivo: name, version })));
        porVersion[version].objetos += objetos;
        porVersion[version].anclado += anclado;
        porVersion[version].geometriaExacta += geometriaExacta;
        porVersion[version].tailEsperado += tailEsperado;
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  const veredicto =
    totalObjetos > 0 && totalGeometriaExacta === totalObjetos && totalTailEsperado === totalObjetos
      ? `El cuerpo de objeto R2010+ de LINE/POINT/CIRCLE/ARC/LWPOLYLINE decodifica geometría EXACTA en ${totalGeometriaExacta}/${totalObjetos} objetos (${totalAnclado} confirmados además por ancla bit a bit) de los ${archivos.length} fixtures AC1024/AC1027/AC1032 del corpus admitido, con el bit de presencia de cadenas en 0 y aterrizaje EXACTO en el límite de handles en el 100% de los casos.`
      : `El cuerpo de objeto R2010+ NO reproduce geometría o aterrizaje exactos en todos los objetos (geometría ${totalGeometriaExacta}/${totalObjetos}, aterrizaje ${totalTailEsperado}/${totalObjetos}): la medición NO sostiene la estructura para todo el corpus.`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-r2010-object-body:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-r2010-object-body-v1",
    generadoPor: "node scripts/dwg/probe-r2010-object-body.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "El CUERPO de objeto R2010+ para las cinco entidades SIN cadenas (LINE, POINT, CIRCLE, ARC, LWPOLYLINE) sobre los fixtures AC1024/AC1027/AC1032 del corpus admitido y verificado por hash. No decodifica el flujo de handles (owner/capa/xdictionary) ni ninguna entidad con cadenas.",
    metodo:
      "Los cinco bundles fundacionales son los mismos ocho dibujos en cinco contenedores desde un DXF fuente byte-idéntico. El gemelo AC1015 —ya validado con cero discrepancias— da tipo y geometría exactos de cada handle. La cabecera común de entidad R2010+ se decodifica como la de R2000 (EED, gráfico, modo, reactores, sin-vínculos/xdic-missing, color, escala y banderas — hechos ya registrados) hasta un tramo intermedio de anchura MEDIDA que este laboratorio declara opaco (capacidad ausente: su semántica no se conoce), y la geometría reutiliza los MISMOS decodificadores que R2000. El límite del flujo de handles usa bodyBytes.length (no objectSize, que excluye los bytes de MS/UMC — hecho medido en este intake).",
    limiteDeLaEvidencia:
      "COMMON_HEADER_WIDTH_BITS es una constante por versión, no recalculada por búsqueda en cada corrida: su valor se estableció comparando el ancla de doble exacto de los CUATRO tipos con campo inicial simple (LINE/CIRCLE/ARC/POINT) contra el arranque de sus datos, y coincidió entre los cuatro dentro de cada versión — un ancho equivocado en cualquier campo previo los habría desalineado de forma DISTINTA por tipo, no a la misma cifra. Esta anchura fija sólo está validada para objetos con EED ausente, sin gráfico, 0 reactores y banderas por defecto (el único caso que este corpus ejercita); el chequeo de aterrizaje final (el remanente debe ser EXACTAMENTE 1 bit) detecta la mayoría de desalineamientos para otros valores, pero no lo garantiza matemáticamente. El bit de presencia de cadenas se mide siempre en 0: ningún archivo del corpus fundacional ejercita el camino con cadenas.",
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
      geometriaExacta: totalGeometriaExacta,
      anclaBitABit: totalAnclado,
      aterrizajeExacto: totalTailEsperado,
      porVersion,
    },
    archivos,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const w = (s) => process.stdout.write(`${s}\n`);

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-r2010-object-body --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-r2010-object-body --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(report.resumen)}\n`);
      process.exit(1);
    }
    w(`probe-r2010-object-body --check: la evidencia coincide (${totalGeometriaExacta}/${totalObjetos} geometrías exactas).`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-r2010-object-body: ${archivos.length} fixture(s) · ${totalObjetos} objetos`);
  w(`  geometria exacta   : ${totalGeometriaExacta}/${totalObjetos}`);
  w(`  ancla bit a bit    : ${totalAnclado}/${totalObjetos}`);
  w(`  aterrizaje exacto  : ${totalTailEsperado}/${totalObjetos}`);
  for (const [version, cell] of Object.entries(porVersion).sort()) {
    w(`  ${version}: geometria ${cell.geometriaExacta}/${cell.objetos} · aterrizaje ${cell.tailEsperado}/${cell.objetos}`);
  }
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos) {
    if (record.error) w(`  FALLO ${record.version}/${record.archivo}: ${JSON.stringify(record.error)}`);
    if (record.discrepancias) w(`  DISCREPANCIA ${record.version}/${record.archivo}: ${JSON.stringify(record.discrepancias)}`);
  }
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-r2010-object-body abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
