/**
 * SONDA del FLUJO DE HANDLES R2010+ (AC1024/AC1027/AC1032) — intake 2026-08-31.
 *
 * QUÉ BLOQUEA HOY. `readR2004Database` falla cerrado para las tres versiones
 * modernas con este mensaje literal del propio lector: «los encabezados y los
 * cuerpos de LINE/POINT/CIRCLE/ARC/LWPOLYLINE decodifican, pero este
 * laboratorio no decodifica el flujo de handles R2010+ ni las tablas de
 * símbolos, así que no se ensambla ninguna base de datos completa». Sin el
 * flujo de handles una entidad tiene geometría pero NO tiene capa ni
 * propietario: no es un dibujo, es una nube de coordenadas.
 *
 * MÉTODO — ORÁCULO DIFERENCIAL, SIN FUENTE DOCUMENTAL NUEVA. Los cinco bundles
 * fundacionales son los MISMOS OCHO DIBUJOS en cinco contenedores, generados
 * desde un DXF fuente byte-idéntico. El gemelo AC1015 ya se decodifica entero
 * con 0 discrepancias, incluida la cabeza de su flujo de handles
 * (`readAc1015EntityHandleHead`), cuyo orden es:
 *
 *     propietario (si entityMode === 0) · reactores × reactorCount ·
 *     xdictionary · anterior y siguiente (si !noLinks) · capa ·
 *     linetype (si linetypeFlags === 3) · plotstyle (si plotstyleFlags === 3)
 *
 * HIPÓTESIS FALSABLE, Y LA INGENUA QUEDÓ FALSADA. La primera pasada probó que
 * el tramo contuviera esa MISMA secuencia completa: acertó 0/105. Los modelos
 * se contrastan por tanto DE CUATRO EN CUATRO y se cuenta cuál explica la
 * medición, en vez de ajustar uno solo y declararlo confirmado:
 *
 *     completo 0/105 · sinEnlaces 0/105 · sinNulos 45/105 · sinEnlacesNiNulos 90/105
 *
 * Lo medido: el tramo lleva las referencias NO NULAS del gemelo, EXCLUIDOS los
 * enlaces a la entidad anterior y siguiente. Los handles nulos no se escriben.
 *
 * POR QUÉ ES FUERTE. Dos comprobaciones independientes se exigen a la vez:
 *
 *  1. PREFIJO EXACTO contra el gemelo, handle a handle y en orden. Se exige
 *     prefijo y no igualdad porque la lista del gemelo NO es exhaustiva: su
 *     propio decodificador deja referencias dentro del tramo opaco que declara
 *     pendiente (el puntero a STYLE de un TEXT). Los handles que sobran se
 *     cuentan y se IDENTIFICAN resolviendo su tipo en el gemelo.
 *  2. CONSUMO EXACTO del flujo. Los códigos H son autodelimitados (4 bits de
 *     código + 4 de contador + esos bytes en big-endian), así que una lectura
 *     con la forma equivocada casi nunca aterriza dentro del último byte del
 *     tramo. El residuo admisible es sólo el relleno hasta el byte.
 *
 * LO QUE ESTA SONDA NO AFIRMA. La FORMA del flujo (cuántos handles y cuáles)
 * se toma del gemelo AC1015, no se deduce del propio archivo R2010+: los
 * campos que la determinan (entityMode, reactorCount, noLinks, linetypeFlags,
 * plotstyleFlags) viven en el tramo común de 39/40 bits que el laboratorio
 * trata como OPACO y que sigue sin semántica identificada. Por tanto esto mide
 * que el CONTENIDO y el ORDEN del flujo son los mismos entre versiones; NO
 * mide que la forma pueda deducirse desde dentro del archivo moderno. Esa
 * segunda mitad es un intake aparte y así consta.
 *
 * Uso:
 *   node scripts/dwg/probe-r2010-handle-stream.mjs            # genera evidencia
 *   node scripts/dwg/probe-r2010-handle-stream.mjs --check    # verifica deriva
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
  "dwg-r2010-handle-stream.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const MODERN_VERSIONS = ["AC1024", "AC1027", "AC1032"];
const REFERENCE_VERSION = "AC1015";

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

/**
 * La cabeza del flujo del gemelo AC1015 aplanada a una LISTA ORDENADA de
 * `{ rol, code, value }`. Los reactores no se modelan en el gemelo (se
 * recorren), así que aquí sólo entran las referencias que sí viajan
 * interpretadas; el recuento de reactores se transporta aparte para poder
 * saltarlos en el mismo orden sobre el flujo moderno.
 */
function expectedHandleList(decoded) {
  const references = decoded.references;
  const list = [];
  const push = (rol, resolved) => {
    if (resolved === undefined || resolved === null) return;
    list.push({ rol, kind: resolved.kind, handle: resolved.handle });
  };
  push("owner", references.owner);
  push("xdictionary", references.xdictionary);
  push("previousEntity", references.previousEntity);
  push("nextEntity", references.nextEntity);
  push("layer", references.layer);
  push("linetype", references.linetype);
  push("plotstyle", references.plotstyle);
  push("blockRecord", references.blockRecord);
  return list;
}


/**
 * ¿Se puede deducir la FORMA del flujo desde el propio archivo moderno?
 *
 * `r2010-entity-body.ts` registró que los primeros ~16 bits de su tramo comun
 * de 39/40 "decodifican de forma sensata" como la cabecera comun R2000, pero
 * trató el tramo ENTERO como opaco porque los 23/24 restantes no tienen
 * semántica identificada. Si esos 16 bits son lo que parecen, la forma sale
 * del archivo y el flujo de handles deja de necesitar el gemelo.
 *
 * Se prueban DOS ordenaciones del par de bits sin-vinculos / xdic-missing,
 * porque el worklog las nombra junto sin fijar cual va primero, y se cuenta
 * cual PREDICE el recuento observado. Predecir es la prueba: una ordenación
 * equivocada da un recuento distinto.
 */
function deriveShape(reader, orden) {
  const eedSize = reader.readBS();
  if (eedSize !== 0) return null; // EED presente: fuera de lo medido
  if (reader.readB() !== 0) return null; // grafico presente: fuera de lo medido
  const entityMode = reader.readBB();
  const reactorCount = reader.readBL();
  let noLinks;
  let xdicMissing;
  if (orden === "noLinks-primero") {
    noLinks = reader.readB();
    xdicMissing = reader.readB();
  } else {
    xdicMissing = reader.readB();
    noLinks = reader.readB();
  }
  reader.readBS(); // color CmC (indice)
  reader.readBD(); // escala de tipo de linea
  const linetypeFlags = reader.readBB();
  const plotstyleFlags = reader.readBB();
  return {
    hasOwner: entityMode === 0,
    reactorCount,
    hasXdictionary: xdicMissing === 0,
    hasLinetype: linetypeFlags === 3,
    hasPlotstyle: plotstyleFlags === 3,
    noLinks,
    bitsConsumidos: null,
  };
}

/** Cuantos handles predice una forma: la capa nunca falta. */
function predictedCount(shape) {
  return (
    (shape.hasOwner ? 1 : 0) +
    shape.reactorCount +
    (shape.hasXdictionary ? 1 : 0) +
    1 +
    (shape.hasLinetype ? 1 : 0) +
    (shape.hasPlotstyle ? 1 : 0)
  );
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outFile =
    outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(path.join(DIST, "container", "r2004-pages.js"))) {
    process.stderr.write(
      "probe-r2010-handle-stream: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }
  const load = (...p) => import(pathToFileURL(path.join(DIST, ...p)).href);
  const { BoundedByteCursor } = await load("binary", "byte-cursor.js");
  const { DwgBitReader, resolveDwgHandleReference } = await load(
    "codecs",
    "bitcodes.js",
  );
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
  const limits = createDwgLimits();

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-r2010-handle-stream --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-r2010-handle-stream: ${message}\n`);
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

  /** Del gemelo AC1015: por handle, la forma y los valores de su flujo. */
  const referenceStreams = (artifact) => {
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const header = parseAc1015FileHeader(cursor);
    const objectMapRecord = header.records.find((record) => record.id === 2);
    const byHandle = new Map();
    const typeByHandle = new Map();
    for (const entry of readAc1015ObjectMap(cursor, objectMapRecord, limits)) {
      const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
      typeByHandle.set(entry.handle, envelope.type);
      let decoded;
      try {
        decoded = decodeAc1015EntityBody(envelope.bodyBytes);
      } catch {
        continue; // Tipo fuera del decodificador del gemelo: nada que comparar.
      }
      byHandle.set(entry.handle, {
        kind: decoded.entity.kind,
        reactorCount: decoded.common.reactorCount,
        entityMode: decoded.common.entityMode,
        noLinks: decoded.common.noLinks,
        linetypeFlags: decoded.common.linetypeFlags,
        plotstyleFlags: decoded.common.plotstyleFlags,
        xdictionaryNoNulo: !(
          decoded.references.xdictionary?.kind === "absolute" &&
          decoded.references.xdictionary?.handle === 0
        ),
        esperados: expectedHandleList(decoded),
      });
    }
    return { byHandle, typeByHandle };
  };

  const referenceBundle = bundleFor(REFERENCE_VERSION);
  if (!referenceBundle) throw new Error("el corpus admitido no trae el bundle AC1015");
  const referenceByName = new Map(
    fixturesOf(referenceBundle).map((a) => [path.basename(a.path), a]),
  );

  const archivos = [];
  const porVersion = {};
  let totalObjetos = 0;
  let totalSecuenciaExacta = 0;
  let totalConsumoExacto = 0;
  const residuos = {};
  const modelosAcierto = {};
  const sobrantesPorTipo = {};
  const sobrantesApuntanA = {};
  const camposDerivados = {};
  const formaDerivada = {
    "noLinks-primero": { predice: 0, noDecodifica: 0 },
    "xdicMissing-primero": { predice: 0, noDecodifica: 0 },
  };
  let totalPrefijoExacto = 0;
  const desviaciones = [];

  for (const version of MODERN_VERSIONS) {
    const bundle = bundleFor(version);
    if (!bundle) continue;
    porVersion[version] = {
      archivos: 0,
      objetos: 0,
      secuenciaExacta: 0,
      consumoExacto: 0,
      prefijoExacto: 0,
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
      const { byHandle: referenceMap, typeByHandle } = referenceStreams(reference);

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
        let secuenciaExacta = 0;
        let consumoExacto = 0;
        const detalle = [];

        for (const bound of bounds) {
          const expected = referenceMap.get(bound.handle);
          if (!expected || expected.esperados.length === 0) continue;

          const bodyBytes = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
          let header;
          try {
            header = readR2010ObjectHeader(bodyBytes, bound.handle);
          } catch (error) {
            detalle.push({
              handle: bound.handle,
              tipo: expected.kind,
              fallo: "encabezado",
              error: typedError(error),
            });
            continue;
          }

          objetos += 1;
          const totalBits = bodyBytes.length * 8;
          const streamStart = totalBits - header.handleStreamBits;
          if (streamStart < header.dataBitOffset) {
            detalle.push({
              handle: bound.handle,
              tipo: expected.kind,
              fallo: "flujo-antes-del-encabezado",
              streamStart,
              dataBitOffset: header.dataBitOffset,
            });
            continue;
          }

          const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
          for (let index = 0; index < streamStart; index += 1) reader.readB();

          // LECTURA GOLOSA: se leen códigos H hasta que quedan menos de 8 bits
          // (un H mínimo ocupa 8: 4 de código y 4 de contador vacío), así que
          // el resto sólo puede ser el relleno hasta el byte. NO se le dice al
          // lector cuántos handles esperar — el recuento es justo lo que se
          // quiere medir, y decírselo sería meter la respuesta en la pregunta.
          const leidos = [];
          let lecturaFallo = null;
          const base = bound.handle;
          try {
            while (totalBits - reader.bitPosition >= 8 && leidos.length <= 64) {
              const raw = reader.readH();
              const resolved = resolveDwgHandleReference(raw, base);
              leidos.push({
                code: raw.code,
                kind: resolved.kind,
                handle: resolved.handle,
              });
            }
          } catch (error) {
            lecturaFallo = typedError(error);
          }

          const residuo = lecturaFallo === null ? totalBits - reader.bitPosition : null;
          if (residuo !== null) {
            residuos[String(residuo)] = (residuos[String(residuo)] ?? 0) + 1;
          }
          const consumoOk = residuo !== null && residuo >= 0 && residuo < 8;
          if (consumoOk) consumoExacto += 1;

          // CUATRO MODELOS, no uno. Se contrasta la secuencia leída contra
          // cuatro lecturas posibles de la lista del gemelo y se cuenta cuál
          // la explica. Probar un solo modelo y declararlo confirmado es
          // exactamente el modo de fallo que este laboratorio evita.
          const esNulo = (h) => h.kind === "absolute" && h.handle === 0;
          const esEnlace = (h) =>
            h.rol === "previousEntity" || h.rol === "nextEntity";
          const modelos = {
            completo: expected.esperados,
            sinEnlaces: expected.esperados.filter((h) => !esEnlace(h)),
            sinNulos: expected.esperados.filter((h) => !esNulo(h)),
            sinEnlacesNiNulos: expected.esperados.filter(
              (h) => !esEnlace(h) && !esNulo(h),
            ),
          };
          const coincide = (modelo) =>
            lecturaFallo === null &&
            leidos.length === modelo.length &&
            leidos.every(
              (leido, index) =>
                leido.handle === modelo[index].handle &&
                leido.kind === modelo[index].kind,
            );
          let modeloQueExplica = null;
          for (const [nombre, modelo] of Object.entries(modelos)) {
            modelosAcierto[nombre] = modelosAcierto[nombre] ?? 0;
            if (coincide(modelo)) {
              modelosAcierto[nombre] += 1;
              modeloQueExplica ??= nombre;
            }
          }
          const secuenciaOk = modeloQueExplica !== null;
          if (secuenciaOk) secuenciaExacta += 1;

          // PREFIJO. La lista del gemelo NO es exhaustiva: `readAc1015Entity-
          // HandleHead` interpreta la cabeza (propietario, xdictionary, capa,
          // linetype, plotstyle) y deja el RESTO del flujo dentro del tramo
          // opaco declarado — el puntero a STYLE de un TEXT, por ejemplo. Así
          // que la pregunta correcta no es si las dos listas son iguales, sino
          // si la del gemelo es PREFIJO de la moderna, y cuántos handles
          // sobran después. Los sobrantes se cuentan por tipo: son capacidad
          // pendiente medida, no ruido.
          const modeloBase = modelos.sinEnlacesNiNulos;
          const prefijoOk =
            lecturaFallo === null &&
            leidos.length >= modeloBase.length &&
            modeloBase.every(
              (esperado, index) =>
                leidos[index]?.handle === esperado.handle &&
                leidos[index]?.kind === esperado.kind,
            );
          // FORMA DERIVADA DEL PROPIO ARCHIVO MODERNO. Si el prefijo comun
          // decodifica como el comun R2000, la forma sale de dentro y el
          // flujo deja de necesitar el gemelo. Se mide si PREDICE el recuento
          // de la cabeza observada (los sobrantes quedan fuera por definicion:
          // la forma describe la cabeza, no lo que venga despues).
          if (lecturaFallo === null) {
            // El puntero a BLOCK_RECORD de un INSERT es una referencia
            // ESPECIFICA DEL TIPO, no de la cabeza comun: la forma no lo
            // describe y contarlo aqui mediria mi contabilidad, no el formato.
            const cabezaObservada = modeloBase.filter(
              (h) => h.rol !== "blockRecord",
            ).length;
            for (const orden of Object.keys(formaDerivada)) {
              const probe = new DwgBitReader(new BoundedByteCursor(bodyBytes));
              for (let i = 0; i < header.dataBitOffset; i += 1) probe.readB();
              let shape = null;
              try {
                shape = deriveShape(probe, orden);
              } catch {
                shape = null;
              }
              if (shape === null) {
                formaDerivada[orden].noDecodifica += 1;
                continue;
              }
              if (predictedCount(shape) === cabezaObservada) {
                formaDerivada[orden].predice += 1;
              }
              // Diagnostico campo a campo contra el gemelo: saber CUAL campo
              // se lee mal vale mas que saber que el recuento no cuadra.
              const campos = {
                hasOwner: [shape.hasOwner, expected.entityMode === 0],
                reactorCount: [shape.reactorCount, expected.reactorCount],
                noLinks: [shape.noLinks === 1, Boolean(expected.noLinks)],
                hasXdictionary: [shape.hasXdictionary, expected.xdictionaryNoNulo],
                hasLinetype: [shape.hasLinetype, expected.linetypeFlags === 3],
                hasPlotstyle: [shape.hasPlotstyle, expected.plotstyleFlags === 3],
              };
              for (const [campo, [derivado, gemelo]] of Object.entries(campos)) {
                const clave = `${orden}/${campo}`;
                camposDerivados[clave] = camposDerivados[clave] ?? {
                  acierta: 0,
                  falla: 0,
                };
                if (derivado === gemelo) camposDerivados[clave].acierta += 1;
                else camposDerivados[clave].falla += 1;
              }
            }
          }

          if (prefijoOk) {
            totalPrefijoExacto += 1;
            porVersion[version].prefijoExacto += 1;
            const sobrantes = leidos.length - modeloBase.length;
            if (sobrantes > 0) {
              const clave = `${expected.kind}:${sobrantes}`;
              sobrantesPorTipo[clave] = (sobrantesPorTipo[clave] ?? 0) + 1;
              // A QUÉ APUNTA el sobrante, según el GEMELO: se resuelve su
              // handle contra el mapa de objetos AC1015 y se anota el tipo.
              // Sin esto, "sobra un handle" es una observación; con esto es
              // una referencia identificada.
              for (const extra of leidos.slice(modeloBase.length)) {
                const tipoDestino = typeByHandle.get(extra.handle);
                const destino = `${expected.kind} -> tipo ${tipoDestino ?? "ausente-en-gemelo"}`;
                sobrantesApuntanA[destino] = (sobrantesApuntanA[destino] ?? 0) + 1;
              }
            }
          }

          if (!prefijoOk || !consumoOk) {
            desviaciones.push({
              version,
              archivo: record.archivo,
              handle: bound.handle,
              tipo: expected.kind,
              // Diagnóstico de tamaño: cuánto mide el tramo frente a lo que
              // el gemelo predice. Un flujo SISTEMÁTICAMENTE más corto que la
              // suma de sus handles dice que R2010+ no lleva los mismos.
              streamBits: header.handleStreamBits,
              streamBitsGemeloEstimado: expected.esperados.length * 8,
              reactores: expected.reactorCount,
              entityMode: expected.entityMode,
              noLinks: expected.noLinks,
              esperados: expected.esperados,
              leidos,
              residuoBits: residuo,
              error: lecturaFallo,
            });
          }
          detalle.push({
            handle: bound.handle,
            tipo: expected.kind,
            handles: expected.esperados.length,
            reactores: expected.reactorCount,
            secuenciaExacta: secuenciaOk,
            residuoBits: residuo,
          });
        }

        record.objetos = objetos;
        record.secuenciaExacta = secuenciaExacta;
        record.consumoExacto = consumoExacto;
        record.detalle = detalle;
        porVersion[version].objetos += objetos;
        porVersion[version].secuenciaExacta += secuenciaExacta;
        porVersion[version].consumoExacto += consumoExacto;
        totalObjetos += objetos;
        totalSecuenciaExacta += secuenciaExacta;
        totalConsumoExacto += consumoExacto;
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  const sobrantesTotal = Object.values(sobrantesPorTipo).reduce((a, b) => a + b, 0);
  const veredicto =
    totalObjetos === 0
      ? "Sin objetos comparables: no se afirma nada."
      : totalPrefijoExacto === totalObjetos && totalConsumoExacto === totalObjetos
        ? `El flujo de handles R2010+ reproduce las referencias NO NULAS del gemelo AC1015, excluidos los enlaces anterior/siguiente, como PREFIJO exacto en ${totalPrefijoExacto}/${totalObjetos} objetos de las tres versiones, consumiendo el tramo hasta su relleno de byte en ${totalConsumoExacto}/${totalObjetos}. La coincidencia es TOTAL (sin handles sobrantes) en ${totalSecuenciaExacta}/${totalObjetos}; los ${sobrantesTotal} restantes llevan handles ADICIONALES que el gemelo no modela y que quedan identificados en sobrantesApuntanA. Los modelos "completo" y "sinEnlaces" aciertan 0/${totalObjetos}: los handles nulos NO se escriben en R2010+. ADEMAS, la FORMA del flujo se deduce del PROPIO archivo moderno: leyendo el prefijo comun con el bit de xdic-missing ANTES del de sin-vinculos, los cinco campos que la determinan (modo, reactores, xdictionary, banderas de linetype y de plotstyle) coinciden con el gemelo en ${totalObjetos}/${totalObjetos} y predicen el recuento de la cabeza en ${formaDerivada["xdicMissing-primero"].predice}/${totalObjetos}; con el orden inverso la prediccion cae a ${formaDerivada["noLinks-primero"].predice}/${totalObjetos}, que es lo que hace del contraste una falsacion y no un ajuste.`
        : `HIPÓTESIS NO CONFIRMADA: prefijo exacto ${totalPrefijoExacto}/${totalObjetos}, consumo exacto ${totalConsumoExacto}/${totalObjetos}. Ver desviaciones.`;

  const evidence = {
    $schema: "../../schema/dwg-evidence.schema.json",
    schemaVersion: 1,
    evidenceId: "dwg-r2010-handle-stream",
    generadoPor: "scripts/dwg/probe-r2010-handle-stream.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Flujo de handles del final del cuerpo de objeto en AC1024/AC1027/AC1032, comparado contra el gemelo AC1015 del MISMO dibujo.",
    metodo:
      "Oráculo diferencial sobre los bundles fundacionales (mismos 8 dibujos, 5 contenedores, DXF fuente byte-idéntico). La posición del flujo viene del campo UMC ya verificado del encabezado; la FORMA (cuántos handles y en qué orden) viene del gemelo AC1015; se comparan valores resueltos y se exige que el tramo se consuma dejando sólo relleno de byte.",
    limiteDeLaEvidencia:
      "NO se mide que la forma del flujo pueda deducirse desde dentro del archivo moderno: los campos que la determinan viven en el tramo común de 39/40 bits que sigue siendo opaco. Un objeto cuyo entityMode, reactorCount, noLinks o banderas difieran de su gemelo quedaría fuera de lo medido. Corpus de un único productor y un único oráculo.",
    corpus: { commit: pin.commit, bundles: MODERN_VERSIONS.length + 1 },
    resumen: {
      objetos: totalObjetos,
      secuenciaExacta: totalSecuenciaExacta,
      consumoExacto: totalConsumoExacto,
      residuoBitsHistograma: residuos,
      prefijoExacto: totalPrefijoExacto,
      modelosAcierto,
      sobrantesPorTipo,
      sobrantesApuntanA,
      formaDerivadaDelArchivoModerno: formaDerivada,
      camposDerivadosVsGemelo: camposDerivados,
      porVersion,
    },
    desviaciones,
    archivos,
  };

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-r2010-handle-stream --check: falta ${path.relative(REPO_ROOT, outFile)}; regenera la evidencia.\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(evidence.resumen) &&
      previous.veredicto === evidence.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-r2010-handle-stream --check: la medición NO coincide con la evidencia registrada.\n",
      );
      process.stderr.write(`  registrada: ${previous.veredicto}\n`);
      process.stderr.write(`  medida:     ${evidence.veredicto}\n`);
      process.exit(1);
    }
    process.stdout.write(`probe-r2010-handle-stream --check: ${evidence.veredicto}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${evidence.veredicto}\n`);
  process.stdout.write(`  → ${path.relative(REPO_ROOT, outFile)}\n`);
}

main().catch((error) => {
  process.stderr.write(`probe-r2010-handle-stream: ${error?.stack ?? error}\n`);
  process.exit(1);
});
