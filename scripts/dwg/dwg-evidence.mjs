#!/usr/bin/env node
/**
 * Generadores de evidencia DWG: la matriz del decodificador y el round-trip.
 *
 * POR QUÉ EXISTE. `docs/competitive/rubric.json` reclama dos artefactos de
 * evidencia para los criterios `dwg.decoder` y `dwg.export`, y `check:cad` los
 * reportaba como INEXISTENTES. Un hueco así se «arregla» de dos maneras: la
 * mala es escribir a mano un JSON que diga lo que uno querría que dijera, y la
 * buena es escribir el generador que lo derive del árbol y dejarlo correr HOY,
 * en vacío. El artefacto que sale no da puntos —dice cero bundles y cero
 * capacidades promovidas— pero el día que entre un bundle con derechos la
 * evidencia se genera sola y nadie tiene que acordarse de actualizar una tabla.
 *
 * DE DÓNDE SALE CADA CIFRA. De ningún sitio escrito a mano:
 *
 * - el estado por capacidad se lee de la matriz del laboratorio clean-room,
 *   que su propio ADR declara única fuente de claims;
 * - los tipos de objeto decodificables se leen de las CONSTANTES del código
 *   del laboratorio, no de una lista paralela que envejecería en silencio;
 * - los bundles admitidos y sus validaciones independientes salen del gate
 *   consumidor del corpus, que fija commit y hash y falla cerrado.
 *
 * LA REGLA DE PROMOCIÓN, HECHA ARITMÉTICA. Una capacidad sólo cuenta como
 * promovida si el laboratorio la declara `supported` Y hay al menos un bundle
 * admitido Y ese bundle trae dos validaciones INDEPENDIENTES. Es la frase de
 * `CORPUS_POLICY.md` —el reader y el writer de Valle nunca son el único
 * oráculo— convertida en una condición que una máquina puede evaluar. Hoy
 * evalúa a falso por el segundo factor, y por eso el artefacto vale cero.
 *
 * Un round-trip que sólo verifica el propio laboratorio NO es un round-trip
 * verificado: se cuenta aparte y se etiqueta como consistencia interna. Contar
 * el writer propio como oráculo del reader propio sería el autoengaño exacto
 * que la política prohíbe.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DwgCorpusGateError, readAdmittedCorpus } from "./corpus-consumer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
const LAB_ROOT = path.join(REPO_ROOT, "packages", "dwg-codec");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs", "cad", "evidence");
export const DECODER_MATRIX_FILE = path.join(EVIDENCE_DIR, "dwg-decoder-matrix.json");
export const ROUNDTRIP_FILE = path.join(EVIDENCE_DIR, "dwg-roundtrip.json");

/**
 * Campos que `--check` NO compara.
 *
 * `generadoEn` y `environment` cambian en cada corrida por definición. `corpus`
 * es PROCEDENCIA —de dónde se leyó y con qué credencial— y depende de si quien
 * corre tiene el espejo configurado; compararlo haría fallar el gate por una
 * diferencia de máquina. Lo que sí se compara es todo lo que el artefacto
 * AFIRMA: `resumen`, `capacidades`, `entidades` y las declaraciones. Un
 * artefacto que reclame más de lo que el árbol sostiene se detecta igual.
 */
const VOLATILE_KEYS = new Set(["generadoEn", "environment", "corpus"]);

// ---------------------------------------------------------------------------
// Lectura del laboratorio
// ---------------------------------------------------------------------------

/**
 * Lee normalizando los finales de linea.
 *
 * Windows y Linux escriben el mismo archivo con bytes distintos, y una
 * evidencia que se genera en una plataforma y falla en la otra es una
 * evidencia que acaba desactivada.
 */
const readNormalized = (file) =>
  fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");

/**
 * Lee el bloque de capacidades de la matriz del laboratorio.
 *
 * El bloque es un `text` fenced con `clave: estado` por línea. Si desaparece o
 * queda vacío, esto LANZA en vez de devolver una matriz vacía: una evidencia
 * generada sin conocer el estado del laboratorio sería una evidencia inventada.
 */
export function readLabCapabilities(root = LAB_ROOT) {
  const source = readNormalized(path.join(root, "CAPABILITIES.md"));
  const block = source.match(/```text\n([\s\S]*?)```/);
  if (!block) throw new Error("la matriz del laboratorio no expone su bloque de capacidades");
  const capabilities = new Map();
  for (const line of block[1].split("\n")) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(\S.*?)\s*$/);
    if (entry) capabilities.set(entry[1], entry[2]);
  }
  if (capabilities.size === 0)
    throw new Error("el bloque de capacidades del laboratorio está vacío");
  return capabilities;
}

/**
 * Tipos de objeto que el laboratorio sabe decodificar, leídos de sus CONSTANTES.
 *
 * Se leen del código y no de una lista escrita aquí porque una lista paralela
 * es exactamente el documento que envejece sin que nadie se entere: el día que
 * el laboratorio decodifique un tipo más, la matriz lo dirá sin tocar este
 * archivo, y el día que retire uno, dejará de decirlo.
 */
export function readLabObjectTypes(root = LAB_ROOT) {
  const objectsDir = path.join(root, "src", "objects");
  const types = new Map();
  for (const name of fs.readdirSync(objectsDir).sort()) {
    if (!name.endsWith(".ts")) continue;
    const source = readNormalized(path.join(objectsDir, name));
    for (const match of source.matchAll(
      /export const AC1015_TYPE_([A-Z0-9_]+)\s*=\s*(0x[0-9a-fA-F]+|\d+)/g,
    )) {
      types.set(match[1], { tipo: match[1], codigoBs: Number(match[2]), modulo: name });
    }
  }
  if (types.size === 0)
    throw new Error("no se encontró ninguna constante de tipo en el laboratorio");
  return [...types.values()].sort((a, b) => a.codigoBs - b.codigoBs);
}

/** Discriminantes del modelo geométrico neutral del laboratorio. */
export function readLabGeometryKinds(root = LAB_ROOT) {
  const source = readNormalized(path.join(root, "src", "model", "entity-geometry.ts"));
  const block = source.match(/DWG_GEOMETRY_ENTITY_KINDS = Object\.freeze\(\[([\s\S]*?)\]/);
  if (!block) throw new Error("el laboratorio no expone sus discriminantes de geometría");
  return [...block[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
}

// ---------------------------------------------------------------------------
// Contexto compartido
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

/**
 * Estado del corpus para la evidencia.
 *
 * Un fallo del gate NO se traga: se propaga. Que la evidencia se genere «igual»
 * cuando el corpus no verifica sería justo el resultado a medias que parece
 * correcto. Lo único que se acepta como estado normal es `unavailable`: sin
 * origen configurado no se descargó nada y no se afirma nada.
 */
export function readCorpusState(options = {}) {
  const report = readAdmittedCorpus(options);
  const independentValidations = report.bundles.reduce(
    (total, bundle) => total + bundle.independentValidations,
    0,
  );
  return {
    estado: report.status,
    origen: report.origin,
    commitFijado: report.commit,
    indiceSha256: report.indexSha256,
    bundlesAdmitidos: report.admittedBundleCount,
    validacionesIndependientes: independentValidations,
    oraculosIndependientes: report.bundles.reduce((total, b) => total + b.oracleCount, 0),
    fixtures: report.bundles.reduce((total, b) => total + b.fixtureCount, 0),
    versionesCubiertas: [...new Set(report.bundles.map((b) => b.dwgVersion))].sort(),
    ...(report.reason ? { motivo: report.reason } : {}),
  };
}

/**
 * ¿Hay corpus independiente suficiente para promover algo?
 *
 * Un bundle admitido y dos validaciones independientes. Ni un bundle solo, ni
 * dos corridas del mismo validador: la política pide oráculos distintos.
 */
const corpusPermitePromocion = (corpus) =>
  corpus.bundlesAdmitidos >= 1 && corpus.validacionesIndependientes >= 2;

// ---------------------------------------------------------------------------
// Artefacto 1: matriz del decodificador
// ---------------------------------------------------------------------------

const LIMITE_SIN_CORPUS =
  "Sin corpus independiente admitido: lo que el laboratorio decodifica está verificado sólo contra fixtures que genera él mismo, y eso prueba consistencia interna, no compatibilidad con ningún archivo ni con ningún software ajeno.";

export function buildDecoderMatrix({ capabilities, objectTypes, geometryKinds, corpus }) {
  const promocionPosible = corpusPermitePromocion(corpus);
  // `productionAvailable` no es una capacidad que se promueva: es el veredicto
  // sobre el producto, y vive en `disponibilidadEnProducto`. Contarla en la
  // lista la convertiría en una casilla más que alguien podría marcar.
  const capacidades = [...capabilities.entries()]
    .filter(([id]) => id !== "productionAvailable")
    .map(([id, estadoLaboratorio]) => {
      const soportada = estadoLaboratorio === "supported";
      const promovida = soportada && promocionPosible;
      const bloqueos = [];
      if (!soportada) bloqueos.push(`el laboratorio la declara "${estadoLaboratorio}"`);
      if (corpus.bundlesAdmitidos < 1)
        bloqueos.push("cero bundles admitidos en el corpus independiente");
      if (corpus.validacionesIndependientes < 2)
        bloqueos.push("faltan dos validaciones independientes autorizadas");
      return { id, estadoLaboratorio, promovida, bloqueos };
    });

  const entidades = objectTypes.map((type) => ({
    ...type,
    decodificadoEnLaboratorio: true,
    verificadoIndependientemente:
      promocionPosible && capabilities.get("entityImport") === "supported",
    bundlesQueLoCubren: promocionPosible ? corpus.bundlesAdmitidos : 0,
  }));

  const capacidadesPromovidas = capacidades.filter((c) => c.promovida).length;
  const tiposVerificadosIndependientemente = entidades.filter(
    (e) => e.verificadoIndependientemente,
  ).length;

  return {
    $schema: "urn:valle-design:schema:dwg-decoder-matrix:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-decoder-matrix-v1",
    generadoPor: "node scripts/dwg/dwg-evidence.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    declaracion:
      capacidadesPromovidas === 0
        ? "CERO BUNDLES ADMITIDOS, CERO CAPACIDADES PROMOVIDAS. No hay decodificador DWG en el producto, no hay importación DWG y no se afirma compatibilidad con ningún archivo ni con ningún software de terceros. Este artefacto existe para que la ausencia sea MEDIBLE y para que la evidencia se genere sola el día que haya corpus con derechos."
        : "Capacidades promovidas con corpus independiente admitido; ver `capacidades` y `entidades` para el alcance exacto.",
    reglaDePromocion:
      "Una capacidad se promueve sólo si el laboratorio la declara `supported` Y hay ≥1 bundle admitido Y ≥2 validaciones independientes autorizadas. El reader y el writer de Valle nunca son el único oráculo (CORPUS_POLICY.md).",
    limiteDeLaEvidencia: LIMITE_SIN_CORPUS,
    disponibilidadEnProducto: capabilities.get("productionAvailable") === "true",
    corpus,
    resumen: {
      bundlesAdmitidos: corpus.bundlesAdmitidos,
      validacionesIndependientes: corpus.validacionesIndependientes,
      capacidadesEvaluadas: capacidades.length,
      capacidadesPromovidas,
      tiposDecodificadosEnLaboratorio: entidades.length,
      tiposVerificadosIndependientemente,
      geometriasNeutrales: geometryKinds.length,
    },
    capacidades,
    entidades,
    geometriasNeutrales: geometryKinds,
  };
}

// ---------------------------------------------------------------------------
// Artefacto 2: round-trip
// ---------------------------------------------------------------------------

export function buildRoundtripEvidence({ capabilities, corpus }) {
  const promocionPosible = corpusPermitePromocion(corpus);
  const estadoWriter = capabilities.get("dwgExport") ?? "unsupported";
  const estadoRoundTrip = capabilities.get("roundTrip") ?? "unsupported";

  // Un round-trip del laboratorio contra sí mismo existe y se declara, pero se
  // cuenta en su propia casilla: no suma a la única cifra que la rúbrica mira.
  const roundTripsDeLaboratorio = estadoRoundTrip === "unsupported" ? 0 : 1;
  const lectoresExternosAutorizados = promocionPosible ? corpus.validacionesIndependientes : 0;
  const roundTripsVerificadosPorLectorExterno =
    promocionPosible && estadoWriter === "supported" ? corpus.bundlesAdmitidos : 0;

  return {
    $schema: "urn:valle-design:schema:dwg-roundtrip-evidence:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-roundtrip-v1",
    generadoPor: "node scripts/dwg/dwg-evidence.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    declaracion:
      roundTripsVerificadosPorLectorExterno === 0
        ? "CERO ROUND-TRIPS VERIFICADOS POR UN LECTOR EXTERNO. No hay exportación DWG en el producto. El laboratorio tiene un writer experimental cuyo round-trip verifica su PROPIO lector: eso demuestra consistencia interna del laboratorio y NO demuestra que ningún software ajeno abra el archivo."
        : "Round-trips verificados contra lectores externos autorizados; ver `bundles`.",
    porQueNoCuentaElPropio:
      "El writer y el reader de Valle salen del mismo código y comparten sus errores: si el writer emite un campo mal y el reader lo lee igual de mal, el round-trip cierra y no ha demostrado nada. Por eso la cifra que se publica exige un lector independiente autorizado.",
    disponibilidadEnProducto: false,
    corpus,
    resumen: {
      bundlesAdmitidos: corpus.bundlesAdmitidos,
      lectoresExternosAutorizados,
      roundTripsVerificadosPorLectorExterno,
      roundTripsDeLaboratorio,
      oraculosIndependientes: corpus.oraculosIndependientes,
    },
    laboratorio: {
      dwgExport: estadoWriter,
      roundTrip: estadoRoundTrip,
      limite:
        "Corpus generado por el mismo laboratorio: prueba consistencia interna, no compatibilidad con archivos DWG reales ni con software de terceros.",
    },
    versionesCubiertas: corpus.versionesCubiertas,
  };
}

// ---------------------------------------------------------------------------
// Generación y verificación
// ---------------------------------------------------------------------------

export function generateDwgEvidence(options = {}) {
  const capabilities = readLabCapabilities();
  const objectTypes = readLabObjectTypes();
  const geometryKinds = readLabGeometryKinds();
  const corpus = readCorpusState(options.corpus ?? {});
  return {
    decoderMatrix: buildDecoderMatrix({ capabilities, objectTypes, geometryKinds, corpus }),
    roundtrip: buildRoundtripEvidence({ capabilities, corpus }),
  };
}

/** Copia sin los campos que cambian en cada corrida. */
export function stable(value) {
  return JSON.stringify(
    value,
    (key, nested) => (VOLATILE_KEYS.has(key) ? undefined : nested),
    2,
  );
}

function writeArtifact(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function checkArtifact(file, value) {
  if (!fs.existsSync(file)) return `no existe ${path.relative(REPO_ROOT, file)}`;
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  return stable(onDisk) === stable(value)
    ? null
    : `${path.relative(REPO_ROOT, file)} no coincide con lo que el árbol genera hoy; corre "npm run evidence:dwg"`;
}

const isEntryPoint = (() => {
  try {
    return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  const checkOnly = process.argv.includes("--check");
  try {
    const { decoderMatrix, roundtrip } = generateDwgEvidence();
    if (checkOnly) {
      const problems = [
        checkArtifact(DECODER_MATRIX_FILE, decoderMatrix),
        checkArtifact(ROUNDTRIP_FILE, roundtrip),
      ].filter(Boolean);
      if (problems.length > 0) {
        for (const problem of problems) process.stderr.write(`evidencia DWG: ${problem}\n`);
        process.exit(1);
      }
      process.stdout.write(
        `evidencia DWG al día: ${decoderMatrix.resumen.capacidadesPromovidas} capacidades promovidas, ${roundtrip.resumen.roundTripsVerificadosPorLectorExterno} round-trips externos, ${decoderMatrix.resumen.bundlesAdmitidos} bundles admitidos.\n`,
      );
    } else {
      writeArtifact(DECODER_MATRIX_FILE, decoderMatrix);
      writeArtifact(ROUNDTRIP_FILE, roundtrip);
      process.stdout.write(
        `evidencia DWG regenerada: ${decoderMatrix.resumen.capacidadesPromovidas} capacidades promovidas, ${roundtrip.resumen.roundTripsVerificadosPorLectorExterno} round-trips externos, ${decoderMatrix.resumen.bundlesAdmitidos} bundles admitidos.\n`,
      );
    }
  } catch (error) {
    if (error instanceof DwgCorpusGateError) {
      process.stderr.write(`evidencia DWG abortada por el gate del corpus: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
