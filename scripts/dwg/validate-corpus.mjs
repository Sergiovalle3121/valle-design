#!/usr/bin/env node
/**
 * Harness de validación de los decoders DWG contra el corpus ADMITIDO,
 * POR VERSIÓN (AC1015 con el lector R2000; AC1018/AC1024/AC1027/AC1032 con
 * el lector R2004): ¿leen bytes DWG de una implementación INDEPENDIENTE?
 * Por cada fixture se decodifica el DWG, se parsea su DXF fuente (el oráculo
 * de autoría propia del mismo bundle) y se compara: matriz {tipo de entidad
 * → esperado vs leído}, capas, bloques, tablas, no soportados y diagnósticos.
 *
 * DE DÓNDE SALEN LOS BYTES. Del gate consumidor (`corpus-consumer.mjs`):
 * commit fijado + SHA-256 verificado; nunca el working tree del repo hermano.
 *
 * REGLA CLEAN-ROOM (ADR-0007). Un hecho de formato nuevo se REGISTRA aquí
 * como discrepancia y NADA MÁS: corregir el decoder exige registrarlo antes
 * en `packages/dwg-codec/SOURCE_REGISTER.json`. Los `stateFlags` de capa se
 * reportan CRUDOS junto al estado del oráculo, sin interpretar bits.
 *
 * FRONTERA DE PRODUCTO. Script de evidencia: importa el laboratorio por su
 * ruta interna de dist a propósito, sin superficie pública ni runtime del
 * producto. AMBOS RESULTADOS SON ÉXITO DEL HARNESS: leer bien, o un informe
 * de discrepancias que desmienta certezas; fracaso sería suavizar lo visto.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { expectedFromOracle, parseOracleDxf } from "./dxf-oracle.mjs";
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
  "dwg-corpus-validation.json",
);
const READER_DIST = path.join(
  REPO_ROOT,
  "packages",
  "dwg-codec",
  "dist",
  "reader",
  "ac1015-database-reader.js",
);
const R2004_READER_DIST = path.join(
  path.dirname(READER_DIST),
  "r2004-database-reader.js",
);
// Versiones validadas: la familia R2004 completa entra en el reporte; las que
// aún no decodifican objetos (R2010+) quedan como "no abre" con su error
// tipado — la verdad por versión, no un filtro que la esconda.
const VALIDATED_VERSIONS = ["AC1015", "AC1018", "AC1024", "AC1027", "AC1032"];

const TOLERANCE = 1e-6;
// ---------------------------------------------------------------------------
// Lado leído: proyección de la base neutral del laboratorio
// ---------------------------------------------------------------------------

/** CP1252 sobre bytes ASCII coincide con latin1; el corpus fundacional es ASCII. */
const decodeBytes = (bytes) => Buffer.from(bytes ?? []).toString("latin1");

// ---------------------------------------------------------------------------
// Observación first-party del CRC de cabecera (sólo para REGISTRAR)
// ---------------------------------------------------------------------------

// CRC-16 reflejado 0xA001 idéntico al del laboratorio, recalculado aquí para
// CARACTERIZAR una discrepancia sobre bytes propios: cuando una cabecera real
// no pasa el CRC del decoder, el reporte deja los números crudos para que el
// hecho pueda registrarse en SOURCE_REGISTER.json ANTES de tocar el decoder.
const CRC16_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ 0xa001 : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc16(bytes, seed) {
  let crc = seed & 0xffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ byte) & 0xff];
  return crc & 0xffff;
}

const hex16 = (value) => `0x${value.toString(16).padStart(4, "0")}`;

function observeHeaderCrc(dwgBytes) {
  if (dwgBytes.length < 81) return null;
  const stored = dwgBytes[79] | (dwgBytes[80] << 8);
  const raw = crc16(dwgBytes.subarray(0, 79), 0xc0c1);
  const recordCount =
    dwgBytes[0x15] | (dwgBytes[0x16] << 8) | (dwgBytes[0x17] << 16) | (dwgBytes[0x18] << 24);
  return {
    recordCount,
    crcGuardado: hex16(stored),
    crcCalculadoSemilla0xc0c1: hex16(raw),
    xorNecesarioParaCuadrar: hex16(stored ^ raw),
    contexto:
      "Desde el intake 2026-08-20 el decoder valida el CRC de cabecera CRUDO (VALLE-CORPUS-AC1015-INTAKE-DAE5E77 desmintió la máscara XOR de la ODS). Si esta observación aparece, es una discrepancia NUEVA que hay que caracterizar y registrar antes de tocar el código.",
  };
}

/**
 * Proyecta un registro leído al vocabulario de comparación del oráculo: la
 * POLYLINE 2D clásica habla el mismo idioma que la LWPOLYLINE (equivalencia
 * declarada del corpus) y las demás variantes conservan su clase.
 */
function projectRecord(record) {
  const kind =
    record.entity.kind === "polyline2d" ? "lwpolyline" : record.entity.kind;
  return { kind, fields: readFieldsFromEntity(record) };
}

function readFieldsFromEntity(record) {
  const e = record.entity;
  const vertexEntities = (record.vertices ?? []).map((v) => v.entity);
  switch (e.kind) {
    case "line":
      return { start: [e.start.x, e.start.y, e.start.z], end: [e.end.x, e.end.y, e.end.z] };
    case "point":
      return { position: [e.position.x, e.position.y, e.position.z] };
    case "circle":
      return { center: [e.center.x, e.center.y, e.center.z], radius: e.radius };
    case "arc":
      return {
        center: [e.center.x, e.center.y, e.center.z],
        radius: e.radius,
        startAngle: e.startAngle,
        endAngle: e.endAngle,
      };
    case "text":
      return {
        insertion: [e.insertion.x, e.insertion.y],
        height: e.height,
        rotation: e.rotation ?? 0,
        value: decodeBytes(e.valueBytes),
      };
    case "insert":
      return {
        block: decodeBytes(record.insertedBlockName).toUpperCase(),
        position: [e.position.x, e.position.y, e.position.z],
        scale: [e.scale.x, e.scale.y, e.scale.z],
        rotation: e.rotation,
      };
    case "lwpolyline":
      return {
        closed: e.closed,
        vertices: e.vertices.map((v) => [v.x, v.y]),
        bulges: e.bulges ? [...e.bulges] : e.vertices.map(() => 0),
        constantWidth: e.constantWidth ?? 0,
      };
    case "mtext":
      return {
        insertion: [e.insertion.x, e.insertion.y],
        height: e.height,
        value: decodeBytes(e.valueBytes),
      };
    case "attrib":
    case "attdef":
      return {
        insertion: [e.insertion.x, e.insertion.y],
        height: e.height,
        value: decodeBytes(e.valueBytes),
        tag: decodeBytes(e.tagBytes),
      };
    case "polyline2d": {
      const positions = vertexEntities.filter((v) => v.kind === "vertex2d");
      return {
        closed: (e.flags & 1) === 1,
        vertices: positions.map((v) => [v.position.x, v.position.y]),
        bulges: positions.map((v) => v.bulge),
        constantWidth: e.startWidth === e.endWidth ? e.startWidth : 0,
      };
    }
    case "polyline3d": {
      const positions = vertexEntities.filter((v) => v.kind === "vertex3d");
      return {
        closed: (e.closedFlags & 1) === 1,
        vertices: positions.map((v) => [v.position.x, v.position.y, v.position.z]),
      };
    }
    case "polymesh": {
      const positions = vertexEntities.filter((v) => v.kind === "vertexMesh");
      return {
        mSize: e.mVertexCount,
        nSize: e.nVertexCount,
        vertices: positions.map((v) => [v.position.x, v.position.y, v.position.z]),
      };
    }
    case "polyfaceMesh": {
      const positions = vertexEntities.filter((v) => v.kind === "vertexPface");
      const faces = vertexEntities.filter((v) => v.kind === "pfaceFace");
      return {
        vertices: positions.map((v) => [v.position.x, v.position.y, v.position.z]),
        faces: faces.map((v) => [v.index1, v.index2, v.index3, v.index4]),
      };
    }
    case "ellipse":
      return {
        center: [e.center.x, e.center.y, e.center.z],
        majorAxis: [
          e.majorAxisEndpoint.x,
          e.majorAxisEndpoint.y,
          e.majorAxisEndpoint.z,
        ],
        ratio: e.axisRatio,
        startAngle: e.startAngle,
        endAngle: e.endAngle,
      };
    case "spline":
      return {
        degree: e.degree,
        closed: e.closed ?? false,
        knots: [...(e.knots ?? [])],
        controlPoints: (e.controlPoints ?? []).map((p) => [p.x, p.y, p.z]),
      };
    case "ray":
    case "xline":
      return {
        base: [e.basePoint.x, e.basePoint.y, e.basePoint.z],
        direction: [e.direction.x, e.direction.y, e.direction.z],
      };
    case "solid":
    case "trace":
      return { corners: e.corners.map((c) => [c.x, c.y]) };
    case "face3d":
      return {
        corners: e.corners.map((c) => [c.x, c.y, c.z]),
        invisibility: e.invisibilityFlags,
      };
    case "leader": {
      // Extremos del camino: el conversor regenera los vértices intermedios
      // y las cajas del leader (tolerancia declarada en el oráculo).
      const first = e.points[0] ?? { x: 0, y: 0 };
      const last = e.points[e.points.length - 1] ?? { x: 0, y: 0 };
      return {
        firstPoint: [first.x, first.y],
        lastPoint: [last.x, last.y],
      };
    }
    case "tolerance":
      return {
        insertion: [e.insertion.x, e.insertion.y, e.insertion.z],
        text: decodeBytes(e.textBytes),
      };
    case "mline":
      return {
        base: [e.basePoint.x, e.basePoint.y, e.basePoint.z],
        scale: e.scale,
        vertices: e.vertices.map((v) => [
          v.position.x,
          v.position.y,
          v.position.z,
        ]),
      };
    case "viewport":
      return {
        center: [e.center.x, e.center.y],
        width: e.width,
        height: e.height,
      };
    case "hatch": {
      const polylinePaths = e.paths.filter((p) => p.kind === "polyline");
      return {
        name: decodeBytes(e.nameBytes).toUpperCase(),
        solidFill: e.solidFill,
        pathCount: e.paths.length,
        polylineVertices: polylinePaths.map((p) =>
          p.vertices.map((v) => [v.x, v.y]),
        ),
        polylineBulges: polylinePaths.map((p) =>
          p.bulges ? [...p.bulges] : p.vertices.map(() => 0),
        ),
      };
    }
    case "dimension":
      // textMid excluido a propósito: el conversor recoloca el texto al
      // regenerar el bloque anónimo (tolerancia declarada en el oráculo).
      // En las angulares el 10 también es derivado: se comparan 13/14/15.
      if (e.dimensionKind === "angular3pt" || e.dimensionKind === "angular2ln") {
        return {
          dimensionKind: e.dimensionKind,
          point13: [e.point13?.x ?? 0, e.point13?.y ?? 0],
          point14: [e.point14?.x ?? 0, e.point14?.y ?? 0],
          point15: [e.point15?.x ?? 0, e.point15?.y ?? 0],
        };
      }
      return {
        dimensionKind: e.dimensionKind,
        defPoint: [e.definitionPoint.x, e.definitionPoint.y, e.definitionPoint.z],
      };
    default:
      return {};
  }
}

/**
 * Aplana una lista de registros de la base para compararla: los ATTRIB
 * atados a un INSERT vuelven a la lista (el oráculo DXF los ve como
 * entidades que siguen al INSERT) y los SEQEND estructurales se excluyen
 * (el oráculo también los descarta).
 */
function flattenRecords(records) {
  const out = [];
  for (const record of records) {
    if (record.entity.kind === "seqend") continue;
    out.push(record);
    for (const attribute of record.attributes ?? []) {
      if (attribute.entity.kind !== "seqend") out.push(attribute);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comparación con tolerancia
// ---------------------------------------------------------------------------

function fieldDiffs(expected, actual) {
  const diffs = [];
  const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    if (typeof want === "number") {
      if (typeof got !== "number" || !near(want, got)) diffs.push({ campo: key, esperado: want, leido: got ?? null });
    } else if (typeof want === "boolean" || typeof want === "string") {
      if (want !== got) diffs.push({ campo: key, esperado: want, leido: got ?? null });
    } else if (Array.isArray(want)) {
      const flatWant = want.flat(2);
      const flatGot = Array.isArray(got) ? got.flat(2) : [];
      const equal =
        flatWant.length === flatGot.length &&
        flatWant.every((v, i) =>
          typeof v === "number" ? typeof flatGot[i] === "number" && near(v, flatGot[i]) : v === flatGot[i],
        );
      if (!equal) diffs.push({ campo: key, esperado: want, leido: got ?? null });
    }
  }
  return diffs;
}

/**
 * Empareja esperadas y leídas del mismo tipo: primero coincidencia exacta
 * (dentro de la tolerancia), luego el resto por orden, dejando constancia de
 * cada campo que difiere. Lo que no se empareja queda como faltante o
 * inesperado — nunca desaparece del informe.
 */
function compareEntitySets(expectedList, readList) {
  const kinds = [...new Set([...expectedList.map((e) => e.kind), ...readList.map((r) => r.kind)])].sort();
  const porTipo = {};
  const detalles = [];
  for (const kind of kinds) {
    const expected = expectedList.filter((e) => e.kind === kind);
    const read = readList.filter((r) => r.kind === kind);
    const usedRead = new Set();
    let correcto = 0;
    const pendientes = [];
    for (const want of expected) {
      let matched = false;
      for (let i = 0; i < read.length; i += 1) {
        if (usedRead.has(i)) continue;
        if (fieldDiffs(want.fields, read[i].fields).length === 0) {
          usedRead.add(i);
          correcto += 1;
          matched = true;
          break;
        }
      }
      if (!matched) pendientes.push(want);
    }
    let geometriaDistinta = 0;
    for (const want of pendientes) {
      const index = read.findIndex((_, i) => !usedRead.has(i));
      if (index >= 0) {
        usedRead.add(index);
        geometriaDistinta += 1;
        detalles.push({
          tipo: kind,
          problema: "geometria-distinta",
          diferencias: fieldDiffs(want.fields, read[index].fields),
        });
      } else {
        detalles.push({ tipo: kind, problema: "faltante", esperado: want.fields });
      }
    }
    const faltante = pendientes.length - geometriaDistinta;
    const inesperado = read.length - usedRead.size;
    if (inesperado > 0) detalles.push({ tipo: kind, problema: "inesperado", cuantos: inesperado });
    porTipo[kind] = {
      esperado: expected.length,
      leidoCorrecto: correcto,
      geometriaDistinta,
      faltante,
      inesperado,
    };
  }
  return { porTipo, detalles };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

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
  const outIndex = process.argv.indexOf("--out");
  const outFile = outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;

  if (!fs.existsSync(READER_DIST)) {
    process.stderr.write(
      "validate-corpus: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }
  const { readAc1015Database } = await import(pathToFileURL(READER_DIST).href);
  const { readR2004Database } = await import(pathToFileURL(R2004_READER_DIST).href);
  const readerFor = (version) =>
    version === "AC1015" ? readAc1015Database : readR2004Database;

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    process.stderr.write(
      `validate-corpus: sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que validar y no se afirma nada.\n`,
    );
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bundles = corpus.bundles.filter((bundle) =>
    VALIDATED_VERSIONS.includes(bundle.dwgVersion),
  );

  const archivos = [];
  for (const bundle of bundles) {
    const fixtures = bundle.artifacts.filter(
      (a) => a.kind === "fixtures" && a.path.endsWith(".dwg"),
    );
    for (const fixture of fixtures) {
      const stem = path.basename(fixture.path, ".dwg");
      const oracle = bundle.artifacts.find(
        (a) => a.kind === "oracles" && a.path.endsWith(`dxf/${stem}.dxf`),
      );
      const dwgBytes = transport.readFile(pin.commit, fixture.path);
      const record = {
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        fixture: fixture.path,
        sha256: fixture.sha256,
        byteLength: dwgBytes.length,
        oraculo: oracle?.path ?? null,
      };
      archivos.push(record);
      if (!oracle) {
        record.abre = null;
        record.nota = "sin oráculo DXF pareado; no se valida";
        continue;
      }
      const expected = parseOracleDxf(
        Buffer.from(transport.readFile(pin.commit, oracle.path)).toString("utf8"),
      );
      // Lo que el oráculo espera se declara ANTES de intentar decodificar:
      // si el archivo no abre, el reporte igual dice qué quedó sin validar.
      const expectedCounts = {};
      for (const entity of [
        ...expected.topEntities,
        ...[...expected.blocks.values()].flat(),
      ].map(expectedFromOracle)) {
        expectedCounts[entity.kind] = (expectedCounts[entity.kind] ?? 0) + 1;
      }
      record.esperadoSegunOraculo = {
        entidades: expectedCounts,
        capas: expected.layers.map((l) => l.name),
        bloques: [...expected.blocks.keys()],
      };

      let database;
      try {
        database = readerFor(bundle.dwgVersion)(new Uint8Array(dwgBytes));
      } catch (error) {
        record.abre = false;
        record.error = {
          code: error?.detail?.code ?? error?.code ?? "UNKNOWN",
          category: error?.detail?.category ?? null,
          offset: error?.detail?.offset ?? null,
          message: String(error?.detail?.message ?? error?.message ?? error).slice(0, 500),
        };
        if (record.error.message.includes("file-header CRC")) {
          record.observacionCrcCabecera = observeHeaderCrc(dwgBytes);
        }
        continue;
      }
      record.abre = true;

      // --- capas ---
      const readLayers = database.layers.map((layer) => ({
        nombre: decodeBytes(layer.name),
        colorIndex: layer.colorIndex,
        stateFlags: layer.stateFlags,
      }));
      const readLayerNames = new Set(readLayers.map((l) => l.nombre.toUpperCase()));
      const faltantes = expected.layers
        .map((l) => l.name)
        .filter((name) => !readLayerNames.has(name.toUpperCase()));
      const colorProblemas = [];
      for (const want of expected.layers) {
        const got = readLayers.find((l) => l.nombre.toUpperCase() === want.name.toUpperCase());
        if (got && got.colorIndex !== want.color) {
          colorProblemas.push({ capa: want.name, colorEsperado: want.color, colorLeido: got.colorIndex });
        }
      }
      // Observación clean-room: el oráculo declara frozen/locked; los
      // stateFlags del DWG se reportan CRUDOS, sin interpretar bits.
      const observacionesEstado = expected.layers
        .filter((l) => (l.flags & (1 | 4)) !== 0)
        .map((l) => ({
          capa: l.name,
          estadoDeclaradoEnOraculo: {
            frozen: (l.flags & 1) === 1,
            locked: (l.flags & 4) === 4,
          },
          stateFlagsLeidosCrudos:
            readLayers.find((r) => r.nombre.toUpperCase() === l.name.toUpperCase())?.stateFlags ?? null,
        }));
      record.capas = {
        esperadas: expected.layers,
        leidas: readLayers,
        faltantes,
        coloresDistintos: colorProblemas,
        observacionesDeEstado: observacionesEstado,
      };

      // --- tablas de símbolos (fase D5): nombres declarados en el DXF fuente
      // contra las tablas leídas, y el patrón de trazos de cada LTYPE. Misma
      // convención de mayúsculas que la comparación de capas.
      const upper = (bytes) => decodeBytes(bytes).toUpperCase();
      const tablaNombres = (declaradas, leidas) => ({
        esperados: declaradas.map((d) => d.name),
        leidos: leidas.map((l) => decodeBytes(l.name)),
        faltantes: declaradas
          .map((d) => d.name)
          .filter((name) => !leidas.some((l) => upper(l.name) === name.toUpperCase())),
      });
      const t = database.tables;
      const ltype = tablaNombres(expected.ltypes, t.linetypes);
      ltype.trazosDistintos = [];
      for (const want of expected.ltypes) {
        const got = t.linetypes.find((l) => upper(l.name) === want.name.toUpperCase());
        if (!got) continue;
        const leidos = [...(got.fields.dashLengths ?? [])];
        const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
        const iguales =
          leidos.length === want.dashes.length &&
          leidos.every((v, i) => near(v, want.dashes[i])) &&
          near(got.fields.patternLength ?? 0, want.patternLength);
        if (!iguales) {
          ltype.trazosDistintos.push({
            ltype: want.name,
            esperado: { trazos: want.dashes, longitudPatron: want.patternLength },
            leido: { trazos: leidos, longitudPatron: got.fields.patternLength ?? null },
          });
        }
      }
      record.tablas = {
        ltype,
        style: tablaNombres(expected.styles, t.styles),
        dimstyle: tablaNombres(expected.dimstyles, t.dimstyles),
        mlinestyle: tablaNombres(expected.mlinestyles, t.mlinestyles),
      };

      // --- entidades de model space ---
      const modelBlocks = database.blocks.filter((b) =>
        decodeBytes(b.name).toUpperCase().includes("MODEL_SPACE"),
      );
      const readTop = flattenRecords([
        ...database.modelSpaceEntities,
        ...modelBlocks.flatMap((b) => b.entities),
      ]).map(projectRecord);
      const expectedTop = expected.topEntities.map(expectedFromOracle);
      record.entidades = compareEntitySets(expectedTop, readTop);

      // --- bloques definidos ---
      const readBlockNames = database.blocks.map((b) => decodeBytes(b.name));
      const bloques = {};
      for (const [name, entities] of expected.blocks) {
        const found = database.blocks.find((b) => decodeBytes(b.name).toUpperCase() === name);
        if (!found) {
          bloques[name] = { encontrado: false };
          continue;
        }
        const readInside = flattenRecords(found.entities).map(projectRecord);
        bloques[name] = {
          encontrado: true,
          contenido: compareEntitySets(entities.map(expectedFromOracle), readInside),
        };
      }
      record.bloques = {
        esperados: [...expected.blocks.keys()],
        leidosTodos: readBlockNames,
        porBloque: bloques,
      };

      // --- unsupported y diagnósticos (los de clase llevan su nombre DXF) ---
      const unsupportedCounts = new Map();
      for (const item of database.unsupported) {
        const cell = unsupportedCounts.get(item.type) ?? {
          cuantos: 0,
          nombreClase: item.className ? decodeBytes(item.className) : null,
        };
        cell.cuantos += 1;
        unsupportedCounts.set(item.type, cell);
      }
      record.tiposNoSoportados = [...unsupportedCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([type, cell]) => ({
          codigoBs: type,
          cuantos: cell.cuantos,
          ...(cell.nombreClase === null ? {} : { nombreClase: cell.nombreClase }),
        }));
      record.diagnosticos = database.diagnostics.map((d) => ({
        code: d.code,
        severity: d.severity,
        offset: d.offset,
        message: d.message,
      }));
    }
  }

  // --- resumen global y POR VERSIÓN ---
  const matriz = {};
  const porVersion = {};
  const emptyRow = () =>
    ({ esperado: 0, leidoCorrecto: 0, geometriaDistinta: 0, faltante: 0, inesperado: 0 });
  const addRow = (target, kind, row) => {
    const cell = (target[kind] ??= emptyRow());
    for (const key of Object.keys(cell)) cell[key] += row[key] ?? 0;
  };
  let abiertos = 0;
  let fallados = 0;
  const discrepancias = [];
  for (const record of archivos) {
    const cell = (porVersion[record.version] ??=
      { archivos: 0, abiertos: 0, noAbiertos: 0, matrizEntidades: {}, discrepancias: 0 });
    cell.archivos += 1;
    const addDiscrepancia = (entry) => {
      cell.discrepancias += 1;
      discrepancias.push({ archivo: record.archivo, version: record.version, ...entry });
    };
    if (record.abre === true) {
      abiertos += 1;
      cell.abiertos += 1;
    } else if (record.abre === false) {
      fallados += 1;
      cell.noAbiertos += 1;
      addDiscrepancia({ tipo: "no-abre", error: record.error });
      // Lo que quedó SIN validar por no abrir también cuenta en la matriz:
      // un esperado sin leído no desaparece del total.
      for (const [kind, count] of Object.entries(
        record.esperadoSegunOraculo?.entidades ?? {},
      )) {
        for (const target of [matriz, cell.matrizEntidades]) {
          const row = (target[kind] ??= { ...emptyRow(), sinValidarPorNoAbrir: 0 });
          row.esperado += count;
          row.sinValidarPorNoAbrir = (row.sinValidarPorNoAbrir ?? 0) + count;
        }
      }
      continue;
    }
    const collect = (comparison, contexto) => {
      for (const [kind, row] of Object.entries(comparison?.porTipo ?? {})) {
        addRow(matriz, kind, row);
        addRow(cell.matrizEntidades, kind, row);
      }
      for (const detalle of comparison?.detalles ?? []) {
        addDiscrepancia({ contexto, ...detalle });
      }
    };
    collect(record.entidades, "model-space");
    for (const [name, info] of Object.entries(record.bloques?.porBloque ?? {})) {
      if (info.encontrado === false) {
        addDiscrepancia({ tipo: "bloque-faltante", bloque: name });
      } else {
        collect(info.contenido, `bloque:${name}`);
      }
    }
    for (const capa of record.capas?.faltantes ?? []) {
      addDiscrepancia({ tipo: "capa-faltante", capa });
    }
    for (const problema of record.capas?.coloresDistintos ?? []) {
      addDiscrepancia({ tipo: "capa-color-distinto", ...problema });
    }
    for (const [tabla, comparacion] of Object.entries(record.tablas ?? {})) {
      for (const nombre of comparacion.faltantes ?? []) {
        addDiscrepancia({ tipo: `${tabla}-faltante`, nombre });
      }
      for (const problema of comparacion.trazosDistintos ?? []) {
        addDiscrepancia({ tipo: "ltype-trazos-distintos", ...problema });
      }
    }
  }

  const versionSummary = Object.entries(porVersion)
    .sort()
    .map(([v, c]) => `${v} ${c.abiertos}/${c.archivos} abiertos con ${c.discrepancias} discrepancia(s)`)
    .join("; ");
  const veredicto =
    archivos.length === 0
      ? "No hay fixtures de las versiones validadas en el corpus."
      : fallados === 0 && discrepancias.length === 0
        ? `El decoder abre los ${archivos.length} DWG del corpus SIN discrepancias: ${versionSummary}.`
        : `Resultado por versión: ${versionSummary}. Ver discrepancias para el detalle.`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-corpus-validation:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-corpus-validation-v1",
    generadoPor: "node scripts/dwg/validate-corpus.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    reglaCleanRoom:
      "Toda discrepancia se REGISTRA aquí y no se corrige en esta ola: corregir el decoder exige registrar antes el hecho de formato en packages/dwg-codec/SOURCE_REGISTER.json (ADR-0007).",
    alcance:
      "Fixtures AC1015 y de la familia R2004 (AC1018/AC1024/AC1027/AC1032) del corpus admitido y verificado por hash, comparados POR VERSIÓN. El DXF oráculo es la fuente de autoría propia congelada en el mismo bundle; los DWG los produjo una implementación independiente (ver docs/TOOLS.md del repo hermano). Las versiones sin decodificador de objetos quedan como no-abre con su error tipado.",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundles: bundles.map((b) => ({ id: b.id, version: b.dwgVersion })),
    },
    resumen: {
      archivosValidados: archivos.length,
      abiertos,
      noAbiertos: fallados,
      sinOraculo: archivos.filter((a) => a.abre === null).length,
      porVersion,
      matrizEntidades: matriz,
      discrepanciasRegistradas: discrepancias.length,
    },
    porVersion,
    matrizEntidades: matriz,
    discrepancias,
    archivos,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // --- resumen legible ---
  const w = (s) => process.stdout.write(`${s}\n`);
  w(`validate-corpus: ${archivos.length} fixture(s) · abren ${abiertos} · fallan ${fallados}`);
  w(`veredicto: ${veredicto}`);
  for (const [version, cell] of Object.entries(porVersion).sort())
    w(`  ${version}: ${cell.abiertos}/${cell.archivos} abiertos · ${cell.discrepancias} discrepancia(s)`);
  w(`matriz global entidad → esperado/correcto/geomDist/faltante/inesperado:`);
  for (const [kind, row] of Object.entries(matriz).sort()) {
    const blocked = row.sinValidarPorNoAbrir
      ? ` (sin validar por no abrir: ${row.sinValidarPorNoAbrir})`
      : "";
    w(
      `  ${kind.padEnd(12)} ${row.esperado}/${row.leidoCorrecto}/${row.geometriaDistinta}/${row.faltante}/${row.inesperado}${blocked}`,
    );
  }
  w(`discrepancias registradas: ${discrepancias.length} (ver ${path.relative(REPO_ROOT, outFile)})`);
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(`validate-corpus abortado por el gate del corpus: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
