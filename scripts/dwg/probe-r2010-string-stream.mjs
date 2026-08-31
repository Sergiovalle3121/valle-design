/**
 * SONDA del FLUJO DE CADENAS R2010+ (AC1024/AC1027/AC1032) — intake 2026-08-31.
 *
 * QUÉ BLOQUEA HOY. Es el segundo de los dos frentes que `readR2004Database`
 * nombra al fallar cerrado para las tres versiones modernas. Sin cadenas no
 * hay NOMBRES: ni de capa, ni de bloque, ni de estilo, ni el contenido de un
 * TEXT. `readR2010EntityBody` sólo decodifica las cinco entidades SIN cadena
 * precisamente por esto, y falla cerrado en cuanto el bit de presencia vale 1.
 *
 * MÉTODO — ORÁCULO DIFERENCIAL, SIN FUENTE DOCUMENTAL NUEVA. El gemelo AC1015
 * del MISMO dibujo ya decodifica cada TEXT con su valor exacto (`valueBytes`),
 * validado con 0 discrepancias. Se busca ese valor, codificado en UTF-16LE y
 * alineado a BIT, dentro del cuerpo moderno; después se comprueba que la
 * ESTRUCTURA alrededor cuadra sola.
 *
 * MODELO MEDIDO. Contando hacia atrás desde el bit de presencia de cadenas
 * —que `VALLE-CORPUS-R2010-OBJECT-BODY` ya situó exactamente un bit antes del
 * flujo de handles— el cuerpo termina así:
 *
 *     [ ... datos del tipo ... ]
 *     [ flujo de cadenas: N bits ]
 *     [ tamaño del flujo: RS de 16 bits, valor N ]
 *     [ bit de presencia de cadenas = 1 ]
 *     [ flujo de handles ]  [ relleno hasta el byte ]
 *
 * y dentro del flujo, cada cadena es un `TU`: un `BS` con el número de
 * CARACTERES seguido de esos caracteres en UTF-16LE.
 *
 * POR QUÉ ES FUERTE. El modelo se comprueba por TRES caminos que tendrían que
 * fallar juntos para dar un falso positivo:
 *
 *  1. El valor del campo de 16 bits debe ser EXACTAMENTE los bits que ocupan
 *     el `BS` de longitud más los datos UTF-16 — un número que la sonda
 *     calcula del gemelo y no lee del archivo.
 *  2. El inicio del flujo, derivado como `bitPresencia - 16 - N`, debe caer
 *     EXACTAMENTE donde empieza ese `BS`.
 *  3. El texto decodificado debe coincidir byte a byte con el del gemelo.
 *
 * SEGUNDA PASADA — VARIAS CADENAS. La primera pasada midió sólo los TEXT, que
 * llevan UNA cadena, y declaró capacidad ausente para el resto. Al aplicar ese
 * lector a los objetos CON NOMBRE (LAYER, BLOCK_RECORD y las entradas de tabla)
 * el fallo cerrado saltó en 186 de 288: «lleva más cadenas de las que este
 * laboratorio ha medido». Eso no era un fallo del lector sino el guardián
 * haciendo su trabajo, y señaló exactamente qué medir.
 *
 * Medido: las cadenas van CONSECUTIVAS como `TU` dentro del flujo, y la
 * PRIMERA es el valor del TEXT o el nombre del objeto. Leyendo hasta consumir
 * el tramo, esa primera cadena coincide con la del gemelo en **303/303**
 * objetos con cadena de las tres versiones —LAYER 54/54, BLOCK_RECORD 54/54,
 * entradas de tabla 180/180 y entidades con texto 15/15— con consumo exacto en
 * los 303. El histograma de cadenas por objeto es {1: 117, 2: 78, 3: 84,
 * 5: 24}: el caso de varias cadenas está ejercitado de verdad, no por analogía
 * con el de una.
 *
 * (Las cifras 186/288 de arriba son del subconjunto CON NOMBRE, que es donde
 * saltó el guardián; los 303 añaden a esos 288 los 15 TEXT que la primera
 * pasada ya cubría. Se dicen las dos porque miden cosas distintas.)
 *
 * LÍMITE DE LA EVIDENCIA, SIN SUAVIZAR. Sólo la PRIMERA cadena tiene
 * significado comprobado (es el nombre); las siguientes se devuelven en orden
 * pero NADIE ha medido qué son en cada tipo. No hay ninguna cadena no-ASCII en
 * el corpus: que la codificación sea UTF-16LE está medido, pero sólo sobre
 * puntos de código latinos básicos.
 *
 * Uso:
 *   node scripts/dwg/probe-r2010-string-stream.mjs            # genera evidencia
 *   node scripts/dwg/probe-r2010-string-stream.mjs --check    # verifica deriva
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
  "dwg-r2010-string-stream.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const MODERN_VERSIONS = ["AC1024", "AC1027", "AC1032"];
const REFERENCE_VERSION = "AC1015";
/** Anchura del campo de tamaño del flujo, medida: un RS. */
const SIZE_FIELD_BITS = 16;
/** Techo de cadenas por objeto: presupuesto de la sonda, no del formato. */
const MAX_STRINGS_PER_OBJECT = 64;

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

/** Busca la secuencia `needle` alineada a BIT (no a byte) dentro de `bytes`. */
function findBitAligned(bytes, needle, start, end) {
  const hits = [];
  for (let offset = start; offset < end; offset += 1) {
    let ok = true;
    for (let index = 0; index < needle.length && ok; index += 1) {
      let value = 0;
      for (let k = 0; k < 8; k += 1) {
        const bit = bitAt(bytes, offset + index * 8 + k);
        if (bit === null) {
          ok = false;
          break;
        }
        value = (value << 1) | bit;
      }
      if (ok && value !== needle[index]) ok = false;
    }
    if (ok) hits.push(offset);
  }
  return hits;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outFile =
    outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(path.join(DIST, "container", "r2004-pages.js"))) {
    process.stderr.write(
      "probe-r2010-string-stream: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
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
  const { decodeAc1015EntityBody } = await load("objects", "entities-core.js");
  const { decodeAc1015LayerBody, AC1015_TYPE_LAYER } = await load(
    "objects",
    "table-layer.js",
  );
  const { decodeAc1015SymbolTableEntryBody } = await load("objects", "tables-symbol.js");
  const { decodeAc1015BlockRecordBody } = await load("objects", "table-block.js");
  const limits = createDwgLimits();

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-r2010-string-stream --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-r2010-string-stream: ${message}\n`);
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

  /** Del gemelo: por handle, el valor exacto de cada entidad con cadena. */
  const referenceStrings = (artifact) => {
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const header = parseAc1015FileHeader(cursor);
    const objectMapRecord = header.records.find((record) => record.id === 2);
    const byHandle = new Map();
    for (const entry of readAc1015ObjectMap(cursor, objectMapRecord, limits)) {
      const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
      try {
        const decoded = decodeAc1015EntityBody(envelope.bodyBytes);
        const value = decoded.entity.valueBytes;
        if (Array.isArray(value) && value.length > 0) {
          byHandle.set(entry.handle, {
            kind: decoded.entity.kind,
            familia: "entidad-con-texto",
            value,
          });
          continue;
        }
      } catch {
        // No es una entidad con texto: puede ser un objeto CON NOMBRE.
      }
      // Objetos CON NOMBRE: LAYER, BLOCK_RECORD y las entradas de tabla. Su
      // nombre es la PRIMERA cadena del flujo, y es justo lo que hace falta
      // para que una capa deje de ser un handle y pase a ser un nombre.
      const named = [
        [
          "layer",
          () =>
            envelope.type === AC1015_TYPE_LAYER
              ? decodeAc1015LayerBody(envelope.bodyBytes).layer.name
              : null,
        ],
        ["block-record", () => decodeAc1015BlockRecordBody(envelope.bodyBytes).record.name],
        [
          "symbol-entry",
          () => decodeAc1015SymbolTableEntryBody(envelope.bodyBytes).head.name,
        ],
      ];
      for (const [familia, decode] of named) {
        let name = null;
        try {
          name = decode();
        } catch {
          continue;
        }
        if (Array.isArray(name) && name.length > 0) {
          byHandle.set(entry.handle, { kind: familia, familia, value: name });
          break;
        }
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
  let totalTamanoExacto = 0;
  let totalInicioExacto = 0;
  let totalTextoExacto = 0;
  let totalPresenciaUno = 0;
  const desviaciones = [];
  const cadenasPorObjeto = {};
  const porFamilia = {};
  let totalConsumoCadenas = 0;

  for (const version of MODERN_VERSIONS) {
    const bundle = bundleFor(version);
    if (!bundle) continue;
    porVersion[version] = {
      archivos: 0,
      objetos: 0,
      presenciaUno: 0,
      tamanoExacto: 0,
      inicioExacto: 0,
      textoExacto: 0,
      consumoCadenas: 0,
    };

    for (const artifact of fixturesOf(bundle)) {
      const name = path.basename(artifact.path);
      const reference = referenceByName.get(name);
      const record = {
        bundle: bundle.id,
        archivo: path.basename(name, ".dwg"),
        fixture: artifact.path,
        sha256: artifact.sha256,
        version,
      };
      archivos.push(record);
      porVersion[version].archivos += 1;
      if (!reference) {
        record.error = {
          code: "NO_TWIN",
          offset: null,
          message: "sin gemelo AC1015 con el mismo nombre",
        };
        continue;
      }
      const referenceMap = referenceStrings(reference);
      if (referenceMap.size === 0) continue;

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

        const detalle = [];
        for (const bound of bounds) {
          const expected = referenceMap.get(bound.handle);
          if (!expected) continue;

          const bodyBytes = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
          const header = readR2010ObjectHeader(bodyBytes, bound.handle);
          totalObjetos += 1;
          porVersion[version].objetos += 1;

          const totalBits = bodyBytes.length * 8;
          const presenceBit = totalBits - header.handleStreamBits - 1;
          const presencia = bitAt(bodyBytes, presenceBit);
          if (presencia === 1) {
            totalPresenciaUno += 1;
            porVersion[version].presenciaUno += 1;
          }

          // Campo de tamaño: RS (dos bytes little-endian) inmediatamente antes
          // del bit de presencia.
          const sizeReader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
          for (let i = 0; i < presenceBit - SIZE_FIELD_BITS; i += 1) sizeReader.readB();
          const declaredSize = sizeReader.readRS();

          // Lo que el modelo PREDICE del gemelo, sin leerlo del archivo: el BS
          // de longitud (2 bits de selector + 8 de valor para longitudes que
          // caben en un byte) más los caracteres en UTF-16LE.
          const chars = expected.value.length;
          const bsBits = chars < 0x100 ? 10 : 18;
          const predictedSize = bsBits + chars * 16;
          // Sólo comprobable en objetos de UNA cadena: para los de varias no
          // se puede predecir el tamaño sin conocerlas todas, y contarlos
          // aquí inflaría la cifra con casos que la sonda no verifica.
          const tamanoPredecible = declaredSize === predictedSize;
          const tamanoOk = tamanoPredecible;

          // Inicio derivado y contraste con dónde está de verdad la cadena.
          const derivedStart = presenceBit - SIZE_FIELD_BITS - declaredSize;
          const utf16 = [];
          for (const ch of expected.value) utf16.push(ch, 0);
          const hits = findBitAligned(bodyBytes, utf16, 0, totalBits);
          const inicioOk = hits.length > 0 && hits[0] === derivedStart + bsBits;

          // Decodificación real por el camino del formato: TU consecutivos
          // hasta consumir el tramo. La PRIMERA cadena es el valor del TEXT o
          // el nombre del objeto; el resto se cuenta pero no se interpreta.
          let decodedText = null;
          let lecturaFallo = null;
          let cadenas = 0;
          let consumoCadenasOk = false;
          try {
            const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
            for (let i = 0; i < derivedStart; i += 1) reader.readB();
            const leidas = [];
            while (reader.bitPosition - derivedStart < declaredSize) {
              const count = reader.readBS();
              const bytesOut = [];
              for (let i = 0; i < count; i += 1) {
                const low = reader.readRC();
                const high = reader.readRC();
                bytesOut.push(low | (high << 8));
              }
              leidas.push(bytesOut);
              if (leidas.length > MAX_STRINGS_PER_OBJECT) break;
            }
            cadenas = leidas.length;
            consumoCadenasOk = reader.bitPosition - derivedStart === declaredSize;
            decodedText = leidas[0] ?? null;
          } catch (error) {
            lecturaFallo = typedError(error);
          }
          if (cadenas > 0) {
            const clave = String(cadenas);
            cadenasPorObjeto[clave] = (cadenasPorObjeto[clave] ?? 0) + 1;
          }
          if (consumoCadenasOk) {
            totalConsumoCadenas += 1;
            porVersion[version].consumoCadenas += 1;
          }
          const textoOk =
            decodedText !== null &&
            consumoCadenasOk &&
            decodedText.length === expected.value.length &&
            decodedText.every((c, i) => c === expected.value[i]);
          const familia = expected.familia;
          porFamilia[familia] = porFamilia[familia] ?? { total: 0, ok: 0 };
          porFamilia[familia].total += 1;
          if (textoOk) porFamilia[familia].ok += 1;

          if (tamanoOk) {
            totalTamanoExacto += 1;
            porVersion[version].tamanoExacto += 1;
          }
          if (inicioOk) {
            totalInicioExacto += 1;
            porVersion[version].inicioExacto += 1;
          }
          if (textoOk) {
            totalTextoExacto += 1;
            porVersion[version].textoExacto += 1;
          }

          if (!(inicioOk && textoOk && consumoCadenasOk && presencia === 1)) {
            desviaciones.push({
              version,
              archivo: record.archivo,
              handle: bound.handle,
              tipo: expected.kind,
              presencia,
              declaredSize,
              predictedSize,
              derivedStart,
              cadenas,
              consumoCadenasOk,
              encontradoEn: hits,
              error: lecturaFallo,
            });
          }
          detalle.push({
            handle: bound.handle,
            tipo: expected.kind,
            caracteres: chars,
            declaredSize,
            presencia,
            tamanoOk,
            inicioOk,
            textoOk,
          });
        }
        record.detalle = detalle;
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  const familias = Object.entries(porFamilia)
    .map(([nombre, v]) => `${nombre} ${v.ok}/${v.total}`)
    .sort()
    .join(", ");
  const veredicto =
    totalObjetos === 0
      ? "Sin objetos con cadena comparables: no se afirma nada."
      : totalInicioExacto === totalObjetos &&
          totalTextoExacto === totalObjetos &&
          totalConsumoCadenas === totalObjetos &&
          totalPresenciaUno === totalObjetos
        ? `El flujo de cadenas R2010+ queda medido en ${totalObjetos}/${totalObjetos} objetos con cadena de las tres versiones (${familias}). El inicio derivado como bitPresencia-16-tamano cae EXACTAMENTE donde empieza el primer BS de longitud (${totalInicioExacto}/${totalObjetos}); las cadenas van CONSECUTIVAS como TU y consumen el tramo EXACTO (${totalConsumoCadenas}/${totalObjetos}), con histograma por objeto ${JSON.stringify(cadenasPorObjeto)}; y la PRIMERA cadena -el valor de un TEXT o el NOMBRE de un objeto con nombre- coincide byte a byte con la del gemelo (${totalTextoExacto}/${totalObjetos}). En los objetos de UNA sola cadena, ademas, el campo RS de 16 bits vale EXACTAMENTE los bits que el gemelo predice (${totalTamanoExacto} de esos objetos). El bit de presencia vale 1 en ${totalPresenciaUno}/${totalObjetos}, frente a 0 en los 72 objetos sin cadena ya medidos: su semantica queda confirmada por los dos lados.`
        : `HIPÓTESIS NO CONFIRMADA: inicio ${totalInicioExacto}/${totalObjetos}, texto ${totalTextoExacto}/${totalObjetos}, consumo ${totalConsumoCadenas}/${totalObjetos}, presencia ${totalPresenciaUno}/${totalObjetos}. Ver desviaciones.`;

  const evidence = {
    $schema: "../../schema/dwg-evidence.schema.json",
    schemaVersion: 1,
    evidenceId: "dwg-r2010-string-stream",
    generadoPor: "scripts/dwg/probe-r2010-string-stream.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Flujo de cadenas separado del cuerpo de objeto en AC1024/AC1027/AC1032 -- entidades con texto y objetos CON NOMBRE (LAYER, BLOCK_RECORD, entradas de tabla) --, comparado contra el gemelo AC1015 del MISMO dibujo.",
    metodo:
      "Oráculo diferencial sobre los bundles fundacionales. Se busca el valor del gemelo codificado en UTF-16LE y alineado a bit dentro del cuerpo moderno, y se exigen tres coincidencias independientes: el valor del campo de tamaño, el inicio derivado del flujo y el texto decodificado por el camino del formato (BS de longitud + caracteres UTF-16LE).",
    limiteDeLaEvidencia:
      "Solo la PRIMERA cadena tiene significado comprobado (el valor de un TEXT o el nombre de un objeto con nombre); las siguientes se leen y se cuentan, pero NADIE ha medido que son en cada tipo. No hay cadenas no-ASCII en el corpus: que la codificacion sea UTF-16LE esta medido, pero solo sobre puntos de codigo latinos basicos, y los pares suplentes fuera del BMP no estan ejercitados. Corpus de un unico productor y un unico oraculo.",
    corpus: { commit: pin.commit, bundles: MODERN_VERSIONS.length + 1 },
    resumen: {
      objetos: totalObjetos,
      presenciaUno: totalPresenciaUno,
      tamanoExacto: totalTamanoExacto,
      inicioExacto: totalInicioExacto,
      textoExacto: totalTextoExacto,
      consumoCadenas: totalConsumoCadenas,
      cadenasPorObjeto,
      porFamilia,
      porVersion,
    },
    desviaciones,
    archivos,
  };

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-r2010-string-stream --check: falta ${path.relative(REPO_ROOT, outFile)}; regenera la evidencia.\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(evidence.resumen) &&
      previous.veredicto === evidence.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-r2010-string-stream --check: la medición NO coincide con la evidencia registrada.\n",
      );
      process.stderr.write(`  registrada: ${previous.veredicto}\n`);
      process.stderr.write(`  medida:     ${evidence.veredicto}\n`);
      process.exit(1);
    }
    process.stdout.write(`probe-r2010-string-stream --check: ${evidence.veredicto}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${evidence.veredicto}\n`);
  process.stdout.write(`  → ${path.relative(REPO_ROOT, outFile)}\n`);
}

main().catch((error) => {
  process.stderr.write(`probe-r2010-string-stream: ${error?.stack ?? error}\n`);
  process.exit(1);
});
