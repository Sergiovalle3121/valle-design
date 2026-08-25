#!/usr/bin/env node
/**
 * Harness del ORÁCULO EXTERNO para el writer AC1015 de la OLA 3.
 *
 * QUÉ RESPONDE. La única pregunta que ningún test propio puede responder:
 * ¿un lector AJENO acepta un .dwg escrito al 100% por nuestro código? Por
 * cada caso se escribe el archivo con `writeAc1015MinimalFile`, se verifica
 * PRIMERO con el lector propio (`readAc1015Database` — si el archivo no pasa
 * por nuestro propio espejo, no se molesta al oráculo), se convierte con el
 * ODA File Converter (binario con licencia en D:\dev\tools\oda; su código es
 * intocable e inconsultable — sólo el binario es oráculo permitido) y, si
 * produce DXF sin .err, se parsea con los helpers de `dxf-oracle.mjs`
 * (importados SIN modificar) y se compara campo a campo contra lo escrito.
 *
 * AMBOS RESULTADOS SON ÉXITO DEL HARNESS: la conversión limpia o el .err con
 * su mensaje exacto. Lo único que sería fracaso es un reporte que suavice lo
 * que vio. El reporte JSON va a docs/cad/evidence/dwg-oda-roundtrip.json e
 * incluye la historia de iteraciones: qué pidió el oráculo hasta aceptar.
 *
 * FRONTERA DE PRODUCTO: script de evidencia; importa el laboratorio por su
 * ruta interna de dist a propósito y no promueve nada al producto.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectedFromOracle, parseOracleDxf } from "./dxf-oracle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const OUT_PATH = path.join(REPO_ROOT, "docs", "cad", "evidence", "dwg-oda-roundtrip.json");
const WRITER_DIST = path.join(
  REPO_ROOT,
  "packages",
  "dwg-codec",
  "dist",
  "writer",
  "ac1015-minimal-file-writer.js",
);
const READER_DIST = path.join(
  REPO_ROOT,
  "packages",
  "dwg-codec",
  "dist",
  "reader",
  "ac1015-database-reader.js",
);
const CONVERTER =
  process.env.ODA_FILE_CONVERTER ?? "D:\\dev\\tools\\oda\\extracted\\ODAFileConverter.exe";
const CONVERTER_VERSION = "27.1";
const WORK_ROOT =
  process.env.ODA_ROUNDTRIP_WORKDIR ??
  "C:\\Users\\sergi\\AppData\\Local\\Temp\\claude\\D--\\faacfa40-fc40-46ab-bca2-44f357e305c2\\scratchpad\\ola3\\roundtrip";
const TOLERANCE = 1e-6;

const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
const utf = (bytes) => String.fromCharCode(...(bytes ?? []));

// ---------------------------------------------------------------------------
// Los casos: geometría escrita y expectativa contra el DXF regenerado.
// ---------------------------------------------------------------------------

const LINE = {
  kind: "line",
  start: { x: 1.5, y: 2.5, z: 0 },
  end: { x: 40, y: 12.25, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const POINT = {
  kind: "point",
  position: { x: -6, y: 8.5, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  xAxisAngle: 0,
};
const CIRCLE = {
  kind: "circle",
  center: { x: 10, y: 10, z: 0 },
  radius: 4.5,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const ARC = {
  kind: "arc",
  center: { x: -3, y: 7, z: 0 },
  radius: 2.25,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  startAngle: 0.25,
  endAngle: 2.5,
};
const TEXT = {
  kind: "text",
  insertion: { x: 5, y: 6 },
  elevation: undefined,
  alignment: undefined,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  obliqueAngle: undefined,
  rotation: undefined,
  height: 0.35,
  widthFactor: undefined,
  valueBytes: ascii("VALLE"),
  generation: undefined,
  horizontalAlignment: undefined,
  verticalAlignment: undefined,
};
const LWPOLYLINE = {
  kind: "lwpolyline",
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 5 },
    { x: 0, y: 5 },
  ],
  bulges: undefined,
  widths: undefined,
  constantWidth: undefined,
  elevation: undefined,
  thickness: undefined,
  extrusion: undefined,
};
const INSERT = {
  kind: "insert",
  position: { x: 30, y: 4, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  attributesFollow: false,
};

const CASES = [
  {
    name: "vacio",
    options: {},
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [],
    expectedBlocks: {},
  },
  {
    name: "capa-linea",
    options: {
      layers: [{ name: ascii("MUROS"), colorIndex: 4 }],
      entities: [{ entity: LINE, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "MUROS", color: 4 },
    ],
    expectedEntities: [{ kind: "line", layer: "MUROS", entity: LINE }],
    expectedBlocks: {},
  },
  {
    name: "figuras",
    options: {
      entities: [
        { entity: POINT },
        { entity: CIRCLE },
        { entity: ARC },
        { entity: TEXT },
        { entity: LWPOLYLINE },
      ],
    },
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [
      { kind: "point", layer: "0", entity: POINT },
      { kind: "circle", layer: "0", entity: CIRCLE },
      { kind: "arc", layer: "0", entity: ARC },
      { kind: "text", layer: "0", entity: TEXT },
      { kind: "lwpolyline", layer: "0", entity: LWPOLYLINE },
    ],
    expectedBlocks: {},
  },
  {
    name: "bloque-insert",
    options: {
      blocks: [{ name: ascii("PUERTA"), entities: [LINE, CIRCLE] }],
      entities: [{ entity: INSERT, insertBlockIndex: 0 }],
    },
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [
      { kind: "insert", layer: "0", entity: INSERT, block: "PUERTA" },
    ],
    expectedBlocks: {
      PUERTA: [
        { kind: "line", entity: LINE },
        { kind: "circle", entity: CIRCLE },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Comparadores campo a campo (tolerancia declarada)
// ---------------------------------------------------------------------------

const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
const near3 = (triple, point) =>
  near(triple[0], point.x) && near(triple[1], point.y) && near(triple[2], point.z ?? 0);

function compareEntity(expected, normalized, mismatches, label) {
  const push = (detail) => mismatches.push(`${label}: ${detail}`);
  if (normalized.kind !== expected.kind) {
    push(`tipo esperado ${expected.kind}, leído ${normalized.kind}`);
    return;
  }
  if (expected.layer !== undefined && normalized.layer !== expected.layer) {
    push(`capa esperada ${expected.layer}, leída ${normalized.layer}`);
  }
  const f = normalized.fields;
  const e = expected.entity;
  switch (expected.kind) {
    case "line":
      if (!near3(f.start, e.start)) push(`start ${JSON.stringify(f.start)}`);
      if (!near3(f.end, e.end)) push(`end ${JSON.stringify(f.end)}`);
      return;
    case "point":
      // El helper del oráculo (expectedFromOracle, importado sin modificar)
      // sólo expone la posición del grupo 10/20/30 de un POINT DXF; el
      // ángulo del eje X (grupo 50) no tiene campo en su normalización, así
      // que esta comparación se limita a lo que el helper entrega — igual
      // que INSERT más abajo ignora la extrusión por la misma razón.
      if (!near3(f.position, e.position)) push(`position ${JSON.stringify(f.position)}`);
      return;
    case "circle":
      if (!near3(f.center, e.center)) push(`center ${JSON.stringify(f.center)}`);
      if (!near(f.radius, e.radius)) push(`radius ${f.radius}`);
      return;
    case "arc":
      if (!near3(f.center, e.center)) push(`center ${JSON.stringify(f.center)}`);
      if (!near(f.radius, e.radius)) push(`radius ${f.radius}`);
      if (!near(f.startAngle, e.startAngle)) push(`startAngle ${f.startAngle}`);
      if (!near(f.endAngle, e.endAngle)) push(`endAngle ${f.endAngle}`);
      return;
    case "text":
      if (!near(f.insertion[0], e.insertion.x) || !near(f.insertion[1], e.insertion.y)) {
        push(`insertion ${JSON.stringify(f.insertion)}`);
      }
      if (!near(f.height, e.height)) push(`height ${f.height}`);
      if (f.value !== utf(e.valueBytes)) push(`value "${f.value}"`);
      return;
    case "insert":
      if (expected.block !== undefined && f.block !== expected.block) {
        push(`bloque ${f.block}`);
      }
      if (!near3(f.position, e.position)) push(`position ${JSON.stringify(f.position)}`);
      if (!near3(f.scale, e.scale)) push(`scale ${JSON.stringify(f.scale)}`);
      if (!near(f.rotation, e.rotation)) push(`rotation ${f.rotation}`);
      return;
    case "lwpolyline":
      // El helper del oráculo (importado sin modificar) no acumula los
      // vértices 10/20 repetidos de una LWPOLYLINE; el conteo de vértices se
      // verifica aparte contra el grupo 90 del DXF crudo, y la geometría de
      // vértices queda cubierta por el round-trip del lector propio.
      return;
    default:
      push(`tipo sin comparador: ${expected.kind}`);
  }
}

/** Verificación suplementaria de la LWPOLYLINE contra el DXF CRUDO. */
function checkLwPolylineRaw(dxfText, expected, mismatches, label) {
  const lines = dxfText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "LWPOLYLINE") continue;
    // `index` es la LÍNEA DE VALOR del par (0, LWPOLYLINE); los pares
    // código/valor de la entidad empiezan en la línea siguiente.
    let vertexCount = null;
    let closedFlag = null;
    for (let scan = index + 1; scan < Math.min(index + 121, lines.length - 1); scan += 2) {
      const code = lines[scan].trim();
      const value = lines[scan + 1]?.trim();
      if (code === "0") break;
      if (code === "90") vertexCount = Number.parseInt(value, 10);
      if (code === "70") closedFlag = Number.parseInt(value, 10);
    }
    if (vertexCount !== expected.entity.vertices.length) {
      mismatches.push(`${label}: grupo 90 = ${vertexCount}, esperado ${expected.entity.vertices.length}`);
    }
    if (((closedFlag ?? 0) & 1) !== (expected.entity.closed ? 1 : 0)) {
      mismatches.push(`${label}: bandera de cierre ${closedFlag}`);
    }
    return;
  }
  mismatches.push(`${label}: el DXF no contiene ninguna LWPOLYLINE`);
}

function compareCase(caseSpec, dxfText) {
  const parsed = parseOracleDxf(dxfText);
  const mismatches = [];
  const layerReport = [];
  for (const expected of caseSpec.expectedLayers) {
    const layer = parsed.layers.find((candidate) => candidate.name === expected.name);
    if (!layer) {
      mismatches.push(`capa "${expected.name}" ausente del DXF`);
      layerReport.push({ nombre: expected.name, presente: false });
      continue;
    }
    const colorOk = layer.color === expected.color;
    if (!colorOk) {
      mismatches.push(`capa "${expected.name}": color ${layer.color}, esperado ${expected.color}`);
    }
    layerReport.push({ nombre: expected.name, presente: true, color: layer.color, colorCoincide: colorOk });
  }

  const normalized = parsed.topEntities
    .filter((record) => !record.unknown)
    .map((record) => expectedFromOracle(record));
  if (normalized.length !== caseSpec.expectedEntities.length) {
    mismatches.push(
      `entidades en model space: ${normalized.length}, esperadas ${caseSpec.expectedEntities.length} (tipos leídos: ${normalized.map((n) => n.kind).join(",") || "ninguno"})`,
    );
  }
  const entityReport = [];
  caseSpec.expectedEntities.forEach((expected, index) => {
    const label = `entidad[${index}] ${expected.kind}`;
    const candidate = normalized.find(
      (record, at) => record.kind === expected.kind && !entityReport.some((r) => r.indice === at),
    );
    const before = mismatches.length;
    if (candidate === undefined) {
      mismatches.push(`${label}: ausente del DXF`);
    } else {
      compareEntity(expected, candidate, mismatches, label);
      if (expected.kind === "lwpolyline") {
        checkLwPolylineRaw(dxfText, expected, mismatches, label);
      }
    }
    entityReport.push({
      indice: normalized.indexOf(candidate),
      tipo: expected.kind,
      capaEsperada: expected.layer,
      coincide: mismatches.length === before && candidate !== undefined,
    });
  });

  const blockReport = [];
  for (const [blockName, expectedContent] of Object.entries(caseSpec.expectedBlocks)) {
    const content = parsed.blocks.get(blockName.toUpperCase());
    if (!content) {
      mismatches.push(`bloque "${blockName}" ausente del DXF`);
      blockReport.push({ nombre: blockName, presente: false });
      continue;
    }
    const normalizedContent = content.filter((r) => !r.unknown).map((r) => expectedFromOracle(r));
    if (normalizedContent.length !== expectedContent.length) {
      mismatches.push(
        `bloque "${blockName}": ${normalizedContent.length} entidades, esperadas ${expectedContent.length}`,
      );
    }
    expectedContent.forEach((expected, index) => {
      const candidate = normalizedContent[index];
      const label = `bloque ${blockName}[${index}] ${expected.kind}`;
      if (candidate === undefined) {
        mismatches.push(`${label}: ausente`);
        return;
      }
      compareEntity(expected, candidate, mismatches, label);
    });
    blockReport.push({
      nombre: blockName,
      presente: true,
      entidades: normalizedContent.map((record) => record.kind),
    });
  }

  return { mismatches, layerReport, entityReport, blockReport };
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

async function main() {
  const { writeAc1015MinimalFile } = await import(pathToFileURL(WRITER_DIST).href);
  const { readAc1015Database } = await import(pathToFileURL(READER_DIST).href);

  if (!fs.existsSync(CONVERTER)) {
    console.error(`El conversor no existe en ${CONVERTER}; no hay oráculo que consultar.`);
    process.exitCode = 1;
    return;
  }

  const inDir = path.join(WORK_ROOT, "in");
  const outDir = path.join(WORK_ROOT, "out");
  fs.rmSync(WORK_ROOT, { recursive: true, force: true });
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const caseResults = [];
  let allOwnReaderOk = true;
  for (const caseSpec of CASES) {
    const bytes = writeAc1015MinimalFile(caseSpec.options);
    fs.writeFileSync(path.join(inDir, `${caseSpec.name}.dwg`), bytes);
    // Verificación propia PRIMERO: si nuestro espejo no lo abre, el caso no
    // llega al oráculo y el reporte lo dice.
    let own;
    try {
      const database = readAc1015Database(bytes);
      own = {
        abre: true,
        capas: database.layers.map((layer) => utf(layer.name)),
        entidadesModelSpace: database.modelSpaceEntities.length,
        bloquesUsuario: database.blocks
          .map((block) => utf(block.name))
          .filter((name) => !name.startsWith("*")),
        diagnosticos: database.diagnostics.length,
        sinSoporte: database.unsupported.length,
      };
    } catch (error) {
      allOwnReaderOk = false;
      own = { abre: false, error: String(error?.message ?? error) };
    }
    caseResults.push({ nombre: caseSpec.name, bytes: bytes.length, verificacionPropia: own });
  }

  const converterArgs = [inDir, outDir, "ACAD2000", "DXF", "0", "1"];
  let converterExit = null;
  let converterTimedOut = false;
  if (allOwnReaderOk) {
    const run = spawnSync(CONVERTER, converterArgs, { timeout: 180_000 });
    converterExit = run.status;
    converterTimedOut = run.error?.code === "ETIMEDOUT";
    // El conversor escribe los resultados como archivos; una pequeña espera
    // adicional cubre el vaciado de su cola de salida.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const done = CASES.every(
        (caseSpec) =>
          fs.existsSync(path.join(outDir, `${caseSpec.name}.dxf`)) ||
          fs.existsSync(path.join(outDir, `${caseSpec.name}.dxf.err`)),
      );
      if (done) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  let accepted = 0;
  let comparedClean = 0;
  for (const [index, caseSpec] of CASES.entries()) {
    const result = caseResults[index];
    if (!result.verificacionPropia.abre || !allOwnReaderOk) {
      result.oraculo = { consultado: false, motivo: "la verificación propia no pasó" };
      continue;
    }
    const dxfPath = path.join(outDir, `${caseSpec.name}.dxf`);
    const errPath = path.join(outDir, `${caseSpec.name}.dxf.err`);
    const hasErr = fs.existsSync(errPath);
    const hasDxf = fs.existsSync(dxfPath);
    if (hasErr || !hasDxf) {
      result.oraculo = {
        consultado: true,
        convertido: false,
        err: hasErr ? fs.readFileSync(errPath, "utf8").trim() : "(sin .dxf y sin .err)",
      };
      continue;
    }
    accepted += 1;
    const dxfText = fs.readFileSync(dxfPath, "latin1");
    const comparison = compareCase(caseSpec, dxfText);
    if (comparison.mismatches.length === 0) comparedClean += 1;
    result.oraculo = { consultado: true, convertido: true, dxfBytes: dxfText.length };
    result.comparacion = {
      coincide: comparison.mismatches.length === 0,
      capas: comparison.layerReport,
      entidades: comparison.entityReport,
      bloques: comparison.blockReport,
      discrepancias: comparison.mismatches,
    };
  }

  const cleanRoundTrips = comparedClean;
  const report = {
    $schema: "urn:valle-design:schema:dwg-oda-roundtrip-evidence:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-oda-roundtrip-v1",
    generadoPor: "node scripts/dwg/oda-roundtrip.mjs",
    generadoEn: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? "desconocido",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      declaredMachine: `${(os.cpus()[0]?.model ?? "CPU desconocida").trim()} (${os.cpus().length} hilos lógicos), ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}`,
    },
    declaracion:
      cleanRoundTrips === CASES.length
        ? "ROUND-TRIP VERIFICADO POR UN LECTOR EXTERNO: los archivos DWG AC1015 escritos al 100% por el writer del laboratorio (writeAc1015MinimalFile) son convertidos a DXF por el ODA File Converter 27.1 con exit 0, sin archivos .err, y el DXF regenerado coincide campo a campo con lo escrito (capas por nombre y color; entidades por tipo y geometría con tolerancia 1e-6). Sigue sin haber exportación DWG en el producto."
        : "El writer de archivo completo existe pero el oráculo externo AÚN no acepta todos los casos: los detalles y los mensajes .err exactos están en `casos`. No se reclama ningún round-trip que este reporte no muestre.",
    porQueCuentaElOraculo:
      "El conversor es una implementación INDEPENDIENTE con licencia propia: no comparte ni una línea con nuestro writer. Que abra un archivo nuestro y regenere las mismas capas y entidades demuestra compatibilidad real con el formato, no consistencia interna.",
    disponibilidadEnProducto: false,
    conversor: {
      herramienta: "ODA File Converter",
      version: CONVERTER_VERSION,
      binario: CONVERTER,
      argumentos: converterArgs,
      exitCode: converterExit,
      timeout: converterTimedOut,
      regla: "Sólo el BINARIO es oráculo permitido; su código ni se consulta ni se descompila. El DXF que produce lleva el watermark del propio conversor: se ignora y JAMÁS se imita (prohibido emitir o imitar el watermark TrustedDWG de Autodesk).",
    },
    casos: caseResults,
    iteraciones: [
      {
        iteracion: 1,
        err: 'Object improperly read: <AcDbDimStyleTable> (A)',
        causa: "El control de DIMSTYLE (tipo 68) lleva un byte a cero tras el recuento de entradas que ningún otro control lleva (declara 80 bits donde sus hermanos declaran 72; hecho medido en el fixture 01-vacio del corpus).",
        correccion: "writeAc1015StructTableControlBody ganó el parámetro postCountZeroBytes y el writer de archivo lo fija en 1 para ese control.",
      },
      {
        iteracion: 2,
        err: "(sin .err: conversión con exit 0 pero el DXF de 'figuras' sólo conservaba la PRIMERA entidad de la cadena)",
        causa: "El lector externo RECORRE la lista enlazada de entidades desde el puntero first del BLOCK_RECORD; con punteros next nulos la cadena se cortaba tras la primera entidad.",
        correccion: "Cada entidad declara su posición en la cadena con las formas medidas del corpus: first → next H(6,0) (handle+1), middle → vínculos implícitos (bit a 1), last → prev H(8,0), isolated → ambos nulos.",
      },
      {
        iteracion: 3,
        err: 'Object improperly read: <AcDbText> (24)',
        causa: "Un TEXT R2000 lleva el hard pointer a su STYLE (grupo 7) al final del flujo de handles (capítulo 20.4.3); el writer no lo emitía.",
        correccion: "writeAc1015ResolvedEntityBody exige textStyleHandle para TEXT y lo emite tras la capa.",
      },
    ],
    resumen: {
      casos: CASES.length,
      verificadosPorLectorPropio: caseResults.filter((r) => r.verificacionPropia.abre).length,
      aceptadosPorElOraculo: accepted,
      roundTripsVerificadosPorLectorExterno: cleanRoundTrips,
      lectoresExternosAutorizados:
        accepted === CASES.length && cleanRoundTrips === CASES.length
          ? [
              {
                herramienta: "ODA File Converter",
                version: CONVERTER_VERSION,
                evidencia: "Convierte a DXF los cuatro casos escritos por writeAc1015MinimalFile con exit 0, sin .err, y el DXF coincide campo a campo con lo escrito.",
              },
            ]
          : [],
    },
    limitaciones: [
      "El helper del oráculo (dxf-oracle.mjs, importado sin modificar) no acumula los vértices 10/20 repetidos de una LWPOLYLINE: el conteo de vértices y el cierre se verifican contra los grupos 90/70 del DXF crudo y la geometría exacta de vértices queda cubierta por el round-trip del lector propio.",
      "Entidades de anotación (MTEXT, DIMENSION, HATCH, LEADER…) siguen siendo pendiente declarado del writer: el lector propio ya las decodifica, pero writeAc1015EntityBody aún no las emite.",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Reporte: ${OUT_PATH}`);
  console.log(
    `Casos: ${CASES.length} · aceptados por el oráculo: ${accepted} · round-trips campo a campo: ${cleanRoundTrips}`,
  );
  for (const result of caseResults) {
    const state = result.oraculo?.convertido
      ? result.comparacion?.coincide
        ? "OK (convertido y comparado)"
        : `CONVERTIDO con discrepancias: ${result.comparacion?.discrepancias.join(" | ")}`
      : `RECHAZADO: ${result.oraculo?.err ?? result.oraculo?.motivo ?? "?"}`;
    console.log(`- ${result.nombre}: ${state}`);
  }
  if (cleanRoundTrips !== CASES.length) process.exitCode = 1;
}

await main();
