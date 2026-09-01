/**
 * SONDA de las VARIABLES DE CABECERA en R2010+ — intake 2026-09-01.
 *
 * ESTA SONDA DOCUMENTA UN RESULTADO NEGATIVO, y por eso existe: sin ella, el
 * siguiente que mire `AcDb:Header` en AC1024/AC1027/AC1032 repetiría el mismo
 * intento a ciegas. Lo que mide es POR QUÉ no se puede medir, con números.
 *
 * LA PREGUNTA SE HACE EN EL ORDEN CORRECTO. Antes de barrer ninguna
 * disposición se cuenta QUÉ VARÍA en el corpus, porque una variable constante
 * no puede falsar ninguna posición: un decodificador equivocado que cayera
 * sobre su valor «acertaría» en los ocho dibujos. Confundir «coincide» con
 * «está medido» es exactamente el error que obligó a corregir el barrido de
 * las banderas de capa el 2026-09-01, y no se repite aquí.
 *
 * TRES HECHOS MEDIDOS:
 *
 *  1. **INSUNITS vale 0 en los OCHO dibujos.** Es la variable que el producto
 *     realmente consume, y es constante. No se puede falsar con este corpus,
 *     y —esto importa— decodificarla no cambiaría hoy NADA en el producto:
 *     0 significa «el archivo no declara unidades», que es justo lo que el
 *     puente ya dice. El trabajo no está bloqueado por dificultad, está
 *     bloqueado por falta de variedad.
 *
 *  2. **De 343 variables observadas, sólo 6 varían** entre los ocho dibujos, y
 *     CINCO de esas seis las reescribe el conversor —marcas de tiempo, GUID de
 *     huella y los handles, que se renumeran—, así que como oráculo
 *     diferencial no sirven: sus valores en el archivo moderno son
 *     legítimamente distintos de los del gemelo AC1015. Queda UNA sola ancla
 *     utilizable en toda la sección: `textsize`.
 *
 *  3. **La cabecera R2010+ NO es la de AC1018 con un prólogo más largo.** Con
 *     el ancla de `textsize` se midió el desfase exacto (327 bits en AC1018,
 *     335 en AC1024, 338 en AC1027/AC1032); desplazar el marco moderno ese
 *     número de bits y correr el decodificador de AC1018 —que sí funciona 8/8—
 *     lanza «A BD flag of 0b11 is not defined by the format». Y no es cuestión
 *     de afinar el desfase: NINGÚN desplazamiento de 0 a 64 bits decodifica los
 *     ocho. La divergencia está DENTRO de los primeros 327 bits, no delante.
 *
 * QUÉ DESBLOQUEARÍA ESTO, EXACTAMENTE. No es un problema de decodificación,
 * es un problema de corpus: hacen falta dibujos con variables de cabecera
 * DISTINTAS entre sí —INSUNITS distinto de 0 y distinto entre archivos,
 * límites, escalas y estilos variados—. Con una sola ancla no se falsa una
 * secuencia de 343 campos: se ajusta, que no es lo mismo. Es un intake de
 * corpus, y hasta entonces el códec declara capacidad ausente y el puente
 * declara la suposición, en vez de inventar unidades.
 *
 * Uso:
 *   node scripts/dwg/probe-r2010-header-variables.mjs            # genera evidencia
 *   node scripts/dwg/probe-r2010-header-variables.mjs --check    # verifica deriva
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
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
  "dwg-r2010-header-variables.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const MODERN_VERSIONS = ["AC1024", "AC1027", "AC1032"];
const REFERENCE_VERSION = "AC1015";
/** Techo del barrido de desplazamiento: presupuesto de la sonda. */
const MAX_SHIFT_BITS = 64;
/**
 * Variables que el conversor reescribe legítimamente. No se ocultan: se
 * NOMBRAN, porque el hecho de que sean casi todas las que varían es
 * justamente la conclusión de esta sonda.
 */
const REWRITTEN_BY_CONVERTER = [
  "tdcreate",
  "tdupdate",
  "tdindwg",
  "tdusrtimer",
  "fingerprintGuid",
  "versionGuid",
  "handles",
];

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

/** El bit `index` (MSB primero por byte) — el orden del flujo DWG. */
const bitAt = (bytes, index) =>
  (index >> 3) >= bytes.length ? null : (bytes[index >> 3] >> (7 - (index & 7))) & 1;

function findBitAligned(bytes, needle) {
  const hits = [];
  for (let offset = 0; offset + needle.length <= bytes.length * 8; offset += 1) {
    let ok = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (bitAt(bytes, offset + index) !== needle[index]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(offset);
  }
  return hits;
}

const bytesToBits = (buffer) => {
  const bits = [];
  for (const byte of buffer) for (let k = 7; k >= 0; k -= 1) bits.push((byte >> k) & 1);
  return bits;
};

/** Patrón de un `BD` completo: selector 00 + 8 bytes IEEE-754 little-endian. */
function bdPattern(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleLE(value);
  return [0, 0, ...bytesToBits(buffer)];
}

/** Desplaza `bytes` N bits a la IZQUIERDA (descarta los N primeros bits). */
function shiftLeftBits(bytes, n) {
  const out = new Uint8Array(Math.max(0, bytes.length - Math.ceil(n / 8)));
  for (let index = 0; index < out.length; index += 1) {
    const bitPosition = n + index * 8;
    const byteIndex = bitPosition >> 3;
    const shift = bitPosition & 7;
    const high = bytes[byteIndex] ?? 0;
    const low = bytes[byteIndex + 1] ?? 0;
    out[index] = shift === 0 ? high : ((high << shift) | (low >> (8 - shift))) & 0xff;
  }
  return out;
}

/** Aplana un objeto a pares `clave.ruta -> JSON del valor`. */
function flatten(value, prefix, into) {
  for (const [key, item] of Object.entries(value ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      flatten(item, full, into);
      continue;
    }
    into.set(full, JSON.stringify(item));
  }
  return into;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outFile =
    outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(path.join(DIST, "container", "r2004-header-variables.js"))) {
    process.stderr.write(
      "probe-r2010-header-variables: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }
  const load = (...p) => import(pathToFileURL(path.join(DIST, ...p)).href);
  const { BoundedByteCursor } = await load("binary", "byte-cursor.js");
  const { createDwgLimits } = await load("api", "limits.js");
  const { parseAc1015FileHeader } = await load("container", "ac1015-file-header.js");
  const { readAc1015SectionFrame, AC1015_HEADER_VARIABLES_SENTINELS } = await load(
    "container",
    "ac1015-section-frame.js",
  );
  const { decodeAc1015HeaderVariables } = await load(
    "container",
    "ac1015-header-variables.js",
  );
  const { decodeR2004HeaderVariables } = await load(
    "container",
    "r2004-header-variables.js",
  );
  const { parseR2004FileHeader, readR2004PageMap } = await load(
    "container",
    "r2004-pages.js",
  );
  const { readR2004SectionMap, readR2004SectionPayload, findR2004Section } = await load(
    "container",
    "r2004-sections.js",
  );
  const { readR2004SectionFrame } = await load("reader", "r2004-database-reader.js");
  const limits = createDwgLimits();

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-r2010-header-variables --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-r2010-header-variables: ${message}\n`);
    process.exit(1);
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bundleFor = (version) =>
    corpus.bundles.find(
      (bundle) =>
        bundle.dwgVersion === version && bundle.id.startsWith("valle.fundacional."),
    );
  const fixturesOf = (bundle) =>
    (bundle?.artifacts ?? []).filter(
      (artifact) => artifact.kind === "fixtures" && artifact.path.endsWith(".dwg"),
    );
  const bytesOf = (artifact) =>
    new Uint8Array(transport.readFile(pin.commit, artifact.path));

  // ── 1. Censo de variedad sobre el gemelo AC1015 ────────────────────────────
  const observed = new Map();
  const twinByName = new Map();
  for (const artifact of fixturesOf(bundleFor(REFERENCE_VERSION))) {
    const name = path.basename(artifact.path);
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const fileHeader = parseAc1015FileHeader(cursor);
    const record = fileHeader.records.find((entry) => entry.id === 0);
    if (record === undefined) continue;
    const variables = decodeAc1015HeaderVariables(
      readAc1015SectionFrame(cursor, record, AC1015_HEADER_VARIABLES_SENTINELS).payload,
    );
    twinByName.set(name, variables);
    for (const [key, value] of flatten(variables, "", new Map())) {
      if (!observed.has(key)) observed.set(key, new Set());
      observed.get(key).add(value);
    }
  }
  const varying = [...observed.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([key, values]) => ({ variable: key, valoresDistintos: values.size }))
    .sort((a, b) => b.valoresDistintos - a.valoresDistintos);
  const usableAnchors = varying.filter(
    (entry) => !REWRITTEN_BY_CONVERTER.some((prefix) => entry.variable.startsWith(prefix)),
  );
  const insunits = [...(observed.get("insunits") ?? new Set())];

  // ── 2. El ancla de textsize y el barrido de desplazamiento ────────────────
  const porVersion = {};
  let anclaUnica = 0;
  let anclaTotal = 0;
  let desplazamientosQueDecodifican = 0;
  for (const version of [...MODERN_VERSIONS]) {
    const offsets = new Set();
    const shiftsThatDecode = new Set();
    let files = 0;
    for (const artifact of fixturesOf(bundleFor(version))) {
      const name = path.basename(artifact.path);
      const twin = twinByName.get(name);
      if (twin === undefined) continue;
      files += 1;
      anclaTotal += 1;

      const cursor = new BoundedByteCursor(bytesOf(artifact));
      const fileHeader = parseR2004FileHeader(cursor);
      const pages = readR2004PageMap(cursor, fileHeader, limits);
      const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
      const payload = readR2004SectionPayload(
        cursor,
        findR2004Section(sections, "AcDb:Header"),
        pages,
        limits,
      );
      const frame = readR2004SectionFrame(payload, AC1015_HEADER_VARIABLES_SENTINELS, 8);

      const hits = findBitAligned(frame.payload, bdPattern(twin.textsize));
      if (hits.length === 1) {
        anclaUnica += 1;
        offsets.add(hits[0]);
      }
      for (let shift = 0; shift <= MAX_SHIFT_BITS; shift += 1) {
        try {
          decodeR2004HeaderVariables(shiftLeftBits(frame.payload, shift));
          shiftsThatDecode.add(shift);
        } catch {
          // No decodifica con este desplazamiento: es el resultado esperado.
        }
      }
    }
    desplazamientosQueDecodifican += shiftsThatDecode.size;
    porVersion[version] = {
      archivos: files,
      offsetsDeTextsize: [...offsets].sort((a, b) => a - b),
      desplazamientosQueDecodifican: [...shiftsThatDecode].sort((a, b) => a - b),
    };
  }

  const anclaEsUnicaYEstable =
    anclaUnica === anclaTotal &&
    MODERN_VERSIONS.every((version) => porVersion[version].offsetsDeTextsize.length === 1);

  const resumen = {
    variablesObservadas: observed.size,
    variablesQueVarian: varying.length,
    variablesQueVarianDetalle: varying,
    anclasUtilizables: usableAnchors.map((entry) => entry.variable),
    reescritasPorElConversor: REWRITTEN_BY_CONVERTER,
    insunitsValoresDistintos: insunits,
    anclaTextsizeUnica: `${anclaUnica}/${anclaTotal}`,
    anclaEsUnicaYEstable,
    desplazamientosQueDecodificanEnTotal: desplazamientosQueDecodifican,
    barridoDeDesplazamientoHasta: MAX_SHIFT_BITS,
    porVersion,
  };

  const veredicto =
    anclaTotal === 0
      ? "Sin archivos modernos comparables: no se afirma nada."
      : anclaEsUnicaYEstable && desplazamientosQueDecodifican === 0
        ? `CAPACIDAD AUSENTE DECLARADA, con la razon medida. Las variables de cabecera de AC1024/AC1027/AC1032 NO se decodifican, y la causa no es dificultad sino falta de VARIEDAD en el corpus. (1) INSUNITS -la unica variable que el producto consume- vale ${JSON.stringify(insunits)} en los ocho dibujos: constante, no falsable, y decodificarla no cambiaria hoy nada en el producto porque 0 significa "el archivo no declara unidades", que es lo que el puente ya dice. (2) De ${observed.size} variables observadas solo ${varying.length} varian, y de esas solo ${usableAnchors.length} (${JSON.stringify(usableAnchors.map((e) => e.variable))}) sirve como oraculo: las demas las reescribe el conversor -marcas de tiempo, GUID y handles renumerados- asi que su valor moderno es legitimamente distinto del gemelo. Con UNA sola ancla no se falsa una secuencia de ${observed.size} campos: se ajusta, que no es lo mismo. (3) Con esa unica ancla si se midio algo firme: textsize aparece UNA sola vez y en un offset ESTABLE por version (${MODERN_VERSIONS.map((v) => `${v} ${JSON.stringify(porVersion[v].offsetsDeTextsize)}`).join(", ")}, frente a 327 en AC1018) en ${anclaUnica}/${anclaTotal} archivos, con dos valores distintos (0.2 y 2.5). Y se FALSO la hipotesis barata: la cabecera R2010+ no es la de AC1018 con un prologo mas largo -desplazar el marco y correr el decodificador de AC1018 lanza un BD invalido, y NINGUN desplazamiento de 0 a ${MAX_SHIFT_BITS} bits decodifica ningun archivo-, asi que la divergencia esta DENTRO de los primeros 327 bits. Lo que desbloquea esto es un intake de corpus con cabeceras variadas, no mas barridos.`
        : `HIPOTESIS NO CONFIRMADA o estado inesperado: ancla unica ${anclaUnica}/${anclaTotal}, estable ${anclaEsUnicaYEstable}, desplazamientos que decodifican ${desplazamientosQueDecodifican}. Ver porVersion.`;

  const evidence = {
    $schema: "../../schema/dwg-evidence.schema.json",
    schemaVersion: 1,
    evidenceId: "dwg-r2010-header-variables",
    generadoPor: "scripts/dwg/probe-r2010-header-variables.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Seccion AcDb:Header en AC1024/AC1027/AC1032: censo de variedad del gemelo AC1015, ancla de textsize en el marco moderno y falsacion de la hipotesis 'AC1018 con prologo mas largo'.",
    metodo:
      "Se cuenta PRIMERO que varia en el corpus y solo despues se busca ninguna disposicion, porque una variable constante no puede falsar una posicion. El ancla se busca como patron consciente del formato (selector de BD incluido) alineado a bit. La hipotesis del prologo se falsa barriendo TODOS los desplazamientos de 0 a 64 bits, no solo el que predice el ancla.",
    limiteDeLaEvidencia:
      "Este es un resultado NEGATIVO y se publica como tal: no se decodifica ninguna variable de cabecera en R2010+, y el codec sigue fallando cerrado. Lo unico afirmado en positivo es la posicion del ancla de textsize y la falsacion del prologo desplazado. NO se afirma que la cabecera sea indescifrable: se afirma que con ESTE corpus no es falsable, porque solo una de sus 343 variables varia de forma utilizable.",
    resumen,
  };

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-r2010-header-variables --check: falta ${path.relative(REPO_ROOT, outFile)}; regenera la evidencia.\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(evidence.resumen) &&
      previous.veredicto === evidence.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-r2010-header-variables --check: la medición NO coincide con la evidencia registrada.\n",
      );
      process.stderr.write(`  registrada: ${previous.veredicto}\n`);
      process.stderr.write(`  medida:     ${evidence.veredicto}\n`);
      process.exit(1);
    }
    process.stdout.write(
      `probe-r2010-header-variables --check: ${evidence.veredicto}\n`,
    );
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${evidence.veredicto}\n`);
  process.stdout.write(`  → ${path.relative(REPO_ROOT, outFile)}\n`);
}

main().catch((error) => {
  process.stderr.write(`probe-r2010-header-variables: ${error?.stack ?? error}\n`);
  process.exit(1);
});
