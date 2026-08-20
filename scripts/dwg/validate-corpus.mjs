#!/usr/bin/env node
/**
 * Harness de validación del decoder AC1015 contra el corpus ADMITIDO.
 *
 * QUÉ RESPONDE. La pregunta que ninguna spec del laboratorio puede responder:
 * ¿`readAc1015Database` lee bytes DWG producidos por una implementación
 * INDEPENDIENTE? Por cada fixture AC1015 del corpus se decodifica el DWG, se
 * parsea su DXF fuente (el oráculo de autoría propia congelado en el mismo
 * bundle) y se compara: matriz {tipo de entidad → esperado vs leído}, capas
 * esperadas vs leídas, bloques, tipos no soportados y diagnósticos.
 *
 * DE DÓNDE SALEN LOS BYTES. Del gate consumidor (`corpus-consumer.mjs`):
 * commit fijado + SHA-256 verificado. Este harness no lee el working tree del
 * repo hermano: lee los blobs del commit del pin, como todo lo demás.
 *
 * REGLA CLEAN-ROOM (ADR-0007). Si el diffing revela un hecho de formato
 * nuevo, este harness lo REGISTRA como discrepancia u observación en el
 * reporte y NADA MÁS. Corregir el decoder exige registrar antes el hecho en
 * `packages/dwg-codec/SOURCE_REGISTER.json`; esa corrección es de otra ola.
 * En particular: los `stateFlags` de capa se reportan CRUDOS junto al estado
 * declarado en el oráculo (frozen/locked), sin interpretarlos.
 *
 * FRONTERA DE PRODUCTO. Esto es un script de evidencia: importa el laboratorio
 * por su ruta interna de dist a propósito, sin tocar la superficie pública
 * (`probeDwg`) ni ningún runtime del producto. `check-product-boundary.mjs`
 * vigila apps/ y packages/; este archivo vive en scripts/ y no promueve nada.
 *
 * AMBOS RESULTADOS SON ÉXITO DEL HARNESS: que el decoder lea bien, o un
 * informe de discrepancias que desmienta sus certezas. Lo único que sería
 * fracaso es un informe que suavice lo que vio.
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

const TOLERANCE = 1e-6;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Oráculo: parser mínimo del DXF fuente (pares código/valor)
// ---------------------------------------------------------------------------

function dxfPairs(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) break;
    pairs.push([code, lines[i + 1]]);
  }
  return pairs;
}

/**
 * Extrae del DXF fuente lo que un lector correcto DEBE encontrar: capas,
 * bloques con su contenido y entidades con geometría. Los ángulos del DXF
 * viajan en grados; aquí se convierten a radianes porque el modelo neutral
 * del laboratorio habla en radianes.
 */
function parseOracleDxf(text) {
  const pairs = dxfPairs(text);
  const layers = [];
  const blocks = new Map();
  const topEntities = [];

  let section = null;
  let table = null;
  let currentBlock = null;
  let entity = null;
  let entitySink = () => topEntities;

  const num = (value) => Number.parseFloat(value);

  const closeEntity = () => {
    if (!entity) return;
    if (entity.type === "VERTEX" && entity.parent) {
      entity.parent.vertices.push({
        x: entity.x ?? 0,
        y: entity.y ?? 0,
        bulge: entity.bulge ?? 0,
      });
      entity = entity.parent.self;
      return;
    }
    entity = null;
  };

  for (let i = 0; i < pairs.length; i += 1) {
    const [code, raw] = pairs[i];
    const value = raw.trim();
    const prev = pairs[i - 1];
    if (code === 2 && prev?.[0] === 0 && prev?.[1].trim() === "SECTION") {
      section = value;
      continue;
    }
    if (code === 0 && value === "ENDSEC") {
      closeEntity();
      section = null;
      table = null;
      currentBlock = null;
      entitySink = () => topEntities;
      continue;
    }

    if (section === "TABLES") {
      if (code === 2 && prev?.[0] === 0 && prev?.[1].trim() === "TABLE") {
        table = value;
        continue;
      }
      if (code === 0 && value === "ENDTAB") {
        table = null;
        continue;
      }
      if (table === "LAYER") {
        if (code === 0 && value === "LAYER") {
          layers.push({ name: null, flags: 0, color: 7, linetype: "CONTINUOUS" });
        } else if (layers.length > 0) {
          const layer = layers[layers.length - 1];
          if (code === 2) layer.name = value;
          else if (code === 70) layer.flags = Number.parseInt(value, 10);
          else if (code === 62) layer.color = Number.parseInt(value, 10);
          else if (code === 6) layer.linetype = value.toUpperCase();
        }
      }
      continue;
    }

    if (section === "BLOCKS") {
      if (code === 0) {
        closeEntity();
        if (value === "BLOCK") {
          currentBlock = { name: null, entities: [] };
          entity = { type: "BLOCK" };
          continue;
        }
        if (value === "ENDBLK") {
          if (currentBlock?.name && !currentBlock.name.startsWith("*")) {
            blocks.set(currentBlock.name.toUpperCase(), currentBlock.entities);
          }
          currentBlock = null;
          entity = null;
          continue;
        }
        entity = startEntity(value, currentBlock ? () => currentBlock.entities : () => []);
        continue;
      }
      if (entity?.type === "BLOCK" && code === 2 && currentBlock) {
        currentBlock.name = value;
        continue;
      }
      feedEntity(entity, code, value, num);
      continue;
    }

    if (section === "ENTITIES") {
      if (code === 0) {
        closeEntity();
        entity = startEntity(value, entitySink);
        continue;
      }
      feedEntity(entity, code, value, num);
      continue;
    }
  }
  closeEntity();
  return { layers: layers.filter((l) => l.name !== null), blocks, topEntities };
}

/** Crea el acumulador de una entidad DXF y la registra en su destino. */
function startEntity(type, sink) {
  const known = new Set([
    "LINE",
    "POINT",
    "CIRCLE",
    "ARC",
    "TEXT",
    "INSERT",
    "POLYLINE",
    "LWPOLYLINE",
    "VERTEX",
    "SEQEND",
  ]);
  if (!known.has(type)) {
    const record = { type, layer: "0", unknown: true };
    sink().push(record);
    return record;
  }
  if (type === "VERTEX" || type === "SEQEND") {
    // El VERTEX alimenta a su POLYLINE abierta; el SEQEND la cierra.
    const target = sink();
    const polyline = [...target].reverse().find((e) => e.type === "POLYLINE");
    if (type === "SEQEND") return null;
    return { type: "VERTEX", parent: polyline ? { vertices: polyline.vertices, self: null } : null };
  }
  const record = { type, layer: "0" };
  if (type === "POLYLINE") {
    record.vertices = [];
    record.closed = false;
  }
  sink().push(record);
  return record;
}

function feedEntity(entity, code, value, num) {
  if (!entity) return;
  switch (code) {
    case 8:
      entity.layer = value.trim();
      break;
    case 2:
      entity.blockName = value.trim();
      break;
    case 1:
      entity.text = value;
      break;
    case 10:
      entity.x = num(value);
      break;
    case 20:
      entity.y = num(value);
      break;
    case 30:
      entity.z = num(value);
      break;
    case 11:
      entity.x2 = num(value);
      break;
    case 21:
      entity.y2 = num(value);
      break;
    case 31:
      entity.z2 = num(value);
      break;
    case 40:
      entity.r40 = num(value);
      break;
    case 41:
      entity.r41 = num(value);
      break;
    case 42:
      // 42 es bulge en un VERTEX y escala Y en un INSERT: se guardan ambos y
      // cada tipo consume el suyo al normalizar.
      entity.bulge = num(value);
      entity.r42 = num(value);
      break;
    case 43:
      entity.r43 = num(value);
      break;
    case 50:
      entity.angle50 = num(value);
      break;
    case 51:
      entity.angle51 = num(value);
      break;
    case 70:
      entity.flags = Number.parseInt(value, 10);
      if (entity.type === "POLYLINE") entity.closed = (entity.flags & 1) === 1;
      break;
    default:
      break;
  }
}

/** Normaliza una entidad del oráculo al vocabulario del modelo neutral. */
function expectedFromOracle(record) {
  switch (record.type) {
    case "LINE":
      return {
        kind: "line",
        layer: record.layer,
        fields: {
          start: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          end: [record.x2 ?? 0, record.y2 ?? 0, record.z2 ?? 0],
        },
      };
    case "POINT":
      return {
        kind: "point",
        layer: record.layer,
        fields: { position: [record.x ?? 0, record.y ?? 0, record.z ?? 0] },
      };
    case "CIRCLE":
      return {
        kind: "circle",
        layer: record.layer,
        fields: {
          center: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          radius: record.r40 ?? 0,
        },
      };
    case "ARC":
      return {
        kind: "arc",
        layer: record.layer,
        fields: {
          center: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          radius: record.r40 ?? 0,
          startAngle: (record.angle50 ?? 0) * DEG,
          endAngle: (record.angle51 ?? 0) * DEG,
        },
      };
    case "TEXT":
      return {
        kind: "text",
        layer: record.layer,
        fields: {
          insertion: [record.x ?? 0, record.y ?? 0],
          height: record.r40 ?? 0,
          rotation: (record.angle50 ?? 0) * DEG,
          value: record.text ?? "",
        },
      };
    case "INSERT":
      return {
        kind: "insert",
        layer: record.layer,
        fields: {
          block: (record.blockName ?? "").toUpperCase(),
          position: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          scale: [record.r41 ?? 1, record.r42 ?? record.r41 ?? 1, record.r43 ?? 1],
          rotation: (record.angle50 ?? 0) * DEG,
        },
      };
    case "POLYLINE":
    case "LWPOLYLINE":
      // Equivalencia declarada del corpus: la POLYLINE 2D clásica del DXF R12
      // se guarda como LWPOLYLINE en contenedores modernos.
      return {
        kind: "lwpolyline",
        layer: record.layer,
        fields: {
          closed: record.closed ?? false,
          vertices: (record.vertices ?? []).map((v) => [v.x, v.y]),
          bulges: (record.vertices ?? []).map((v) => v.bulge ?? 0),
          constantWidth: record.r40 ?? 0,
        },
      };
    default:
      return { kind: `dxf:${record.type.toLowerCase()}`, layer: record.layer, fields: {} };
  }
}

// ---------------------------------------------------------------------------
// Lado leído: proyección de la base neutral del laboratorio
// ---------------------------------------------------------------------------

/** CP1252 sobre bytes ASCII coincide con latin1; el corpus fundacional es ASCII. */
const decodeBytes = (bytes) => Buffer.from(bytes ?? []).toString("latin1");

// ---------------------------------------------------------------------------
// Observación first-party del CRC de cabecera (sólo para REGISTRAR)
// ---------------------------------------------------------------------------

/**
 * CRC-16 reflejado 0xA001 idéntico al del laboratorio, recalculado aquí para
 * CARACTERIZAR una discrepancia sobre bytes propios: cuando la cabecera de un
 * DWG real no pasa el CRC del decoder, el reporte deja los números crudos
 * (CRC guardado, CRC calculado con la semilla registrada, XOR necesario y
 * recuento de registros) para que el hecho pueda registrarse en
 * SOURCE_REGISTER.json ANTES de tocar el decoder. Aquí no se corrige nada.
 */
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
      "Desde el intake 2026-08-20 el decoder valida el CRC de cabecera CRUDO (VALLE-CORPUS-AC1015-HEADER-CRC-2026-08-20 desmintió la máscara XOR de la ODS). Si esta observación aparece, es una discrepancia NUEVA que hay que caracterizar y registrar antes de tocar el código.",
  };
}

function readFieldsFromEntity(record) {
  const e = record.entity;
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
    default:
      return {};
  }
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

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    process.stderr.write(
      `validate-corpus: sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que validar y no se afirma nada.\n`,
    );
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bundles = corpus.bundles.filter((bundle) => bundle.dwgVersion === "AC1015");

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
        database = readAc1015Database(new Uint8Array(dwgBytes));
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

      // --- entidades de model space ---
      const modelBlocks = database.blocks.filter((b) =>
        decodeBytes(b.name).toUpperCase().includes("MODEL_SPACE"),
      );
      const readTop = [
        ...database.modelSpaceEntities,
        ...modelBlocks.flatMap((b) => b.entities),
      ].map((r) => ({ kind: r.entity.kind, fields: readFieldsFromEntity(r) }));
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
        const readInside = found.entities.map((r) => ({
          kind: r.entity.kind,
          fields: readFieldsFromEntity(r),
        }));
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

      // --- unsupported y diagnósticos ---
      const unsupportedCounts = new Map();
      for (const item of database.unsupported) {
        unsupportedCounts.set(item.type, (unsupportedCounts.get(item.type) ?? 0) + 1);
      }
      record.tiposNoSoportados = [...unsupportedCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([type, count]) => ({ codigoBs: type, cuantos: count }));
      record.diagnosticos = database.diagnostics.map((d) => ({
        code: d.code,
        severity: d.severity,
        offset: d.offset,
        message: d.message,
      }));
    }
  }

  // --- resumen global ---
  const matriz = {};
  let abiertos = 0;
  let fallados = 0;
  const discrepancias = [];
  for (const record of archivos) {
    if (record.abre === true) abiertos += 1;
    if (record.abre === false) {
      fallados += 1;
      discrepancias.push({
        archivo: record.archivo,
        tipo: "no-abre",
        error: record.error,
      });
      // Lo que quedó SIN validar por no abrir también cuenta en la matriz:
      // un esperado sin leído no desaparece del total.
      for (const [kind, count] of Object.entries(
        record.esperadoSegunOraculo?.entidades ?? {},
      )) {
        const cell = (matriz[kind] ??= {
          esperado: 0,
          leidoCorrecto: 0,
          geometriaDistinta: 0,
          faltante: 0,
          inesperado: 0,
          sinValidarPorNoAbrir: 0,
        });
        cell.esperado += count;
        cell.sinValidarPorNoAbrir = (cell.sinValidarPorNoAbrir ?? 0) + count;
      }
      continue;
    }
    const collect = (comparison, contexto) => {
      for (const [kind, row] of Object.entries(comparison?.porTipo ?? {})) {
        const cell = (matriz[kind] ??= {
          esperado: 0,
          leidoCorrecto: 0,
          geometriaDistinta: 0,
          faltante: 0,
          inesperado: 0,
        });
        for (const key of Object.keys(cell)) cell[key] += row[key];
      }
      for (const detalle of comparison?.detalles ?? []) {
        discrepancias.push({ archivo: record.archivo, contexto, ...detalle });
      }
    };
    collect(record.entidades, "model-space");
    for (const [name, info] of Object.entries(record.bloques?.porBloque ?? {})) {
      if (info.encontrado === false) {
        discrepancias.push({ archivo: record.archivo, tipo: "bloque-faltante", bloque: name });
      } else {
        collect(info.contenido, `bloque:${name}`);
      }
    }
    for (const capa of record.capas?.faltantes ?? []) {
      discrepancias.push({ archivo: record.archivo, tipo: "capa-faltante", capa });
    }
    for (const problema of record.capas?.coloresDistintos ?? []) {
      discrepancias.push({ archivo: record.archivo, tipo: "capa-color-distinto", ...problema });
    }
  }

  const errorSignatures = [
    ...new Set(
      archivos
        .filter((a) => a.abre === false)
        .map((a) => `${a.error.code} @${a.error.offset}: ${a.error.message}`),
    ),
  ];
  const veredicto =
    fallados === archivos.length && archivos.length > 0
      ? `EL DECODER NO ABRE NINGUNO de los ${archivos.length} DWG AC1015 reales del corpus. ${errorSignatures.length === 1 ? `Todos fallan en el MISMO punto: ${errorSignatures[0]}` : `Fallos distintos: ${errorSignatures.join(" | ")}`}`
      : fallados > 0
        ? `El decoder abre ${abiertos} de ${archivos.length} DWG AC1015; ${fallados} fallan.`
        : `El decoder abre los ${archivos.length} DWG AC1015 del corpus; ver matriz para el detalle por entidad.`;

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
      "Sólo fixtures AC1015 del corpus admitido y verificado por hash. El DXF oráculo es la fuente de autoría propia congelada en el mismo bundle; los DWG los produjo una implementación independiente (ver docs/TOOLS.md del repo hermano).",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundlesAc1015: bundles.map((b) => b.id),
    },
    resumen: {
      archivosAc1015: archivos.length,
      abiertos,
      noAbiertos: fallados,
      sinOraculo: archivos.filter((a) => a.abre === null).length,
      matrizEntidades: matriz,
      discrepanciasRegistradas: discrepancias.length,
    },
    matrizEntidades: matriz,
    discrepancias,
    archivos,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // --- resumen legible ---
  const w = (s) => process.stdout.write(`${s}\n`);
  w(`validate-corpus: ${archivos.length} fixture(s) AC1015 · abren ${abiertos} · fallan ${fallados}`);
  w(`veredicto: ${veredicto}`);
  w(`matriz entidad → esperado/correcto/geomDist/faltante/inesperado:`);
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
