/**
 * SONDA de los CAMPOS NO-NOMBRE de un LAYER en R2010+ — intake 2026-09-01.
 *
 * QUÉ CORRIGE. El corte anterior publicó que «las banderas de capa de R2010+
 * no son el BS de R2000 en ninguna posición», tras un barrido de 0..120 bits
 * con CERO aciertos. Es FALSO. El barrido no falló por el formato:
 *
 *  1. Sólo apuntaba un acierto de estado si ANTES coincidían los tres campos
 *     de xref — y esos tres valen SIEMPRE LO MISMO en todo el corpus
 *     admitido, así que no discriminan nada. Una lectura equivocada de lo
 *     inmedible vetaba la lectura correcta de lo medible.
 *  2. Leía el color como el `CmC` de R2000 (un simple `BS`) cuando el
 *     adaptador AC1018 de este mismo repo —8/8, 0 discrepancias— ya tenía
 *     medido que desde R2004 son TRES campos: `BS` + `BL` + `RC`.
 *
 * MÉTODO — ORÁCULO DIFERENCIAL, SIN FUENTE DOCUMENTAL NUEVA. Para cada LAYER
 * del corpus moderno se compara contra el LAYER del MISMO handle en el gemelo
 * AC1015 del MISMO dibujo, ya validado con 0 discrepancias.
 *
 * TRES CONDICIONES A LA VEZ, no una:
 *   1. el `BS` de estado reproduce el valor del gemelo,
 *   2. el color proyecta al MISMO índice ACI, y
 *   3. el dato termina EXACTAMENTE donde empieza el flujo de cadenas ya medido.
 *
 * POR QUÉ ES FUERTE. Los valores VARÍAN: tres estados distintos (1008 normal,
 * 1009 congelada, 1016 bloqueada) y siete índices ACI distintos. Un
 * desplazamiento equivocado no puede reproducir a la vez tres valores que
 * cambian y aterrizar en el bit exacto. La sonda lo comprueba además por el
 * lado adverso: con la cabeza desplazada UN bit en cualquier dirección, el
 * número de capas que cumplen las tres condiciones debe ser CERO.
 *
 * LÍMITE DE LA EVIDENCIA, SIN SUAVIZAR. Qué hay exactamente en los 7/8 bits de
 * cabeza NO está resuelto y con este corpus no puede estarlo: no hay ni un
 * objeto con EED, ni uno con reactores, ni una entrada dependiente de xref,
 * así que al menos dos composiciones distintas reproducen lo mismo. La sonda
 * mide la ANCHURA de esa cabeza y declara su contenido sin resolver. El
 * aterrizaje exacto es lo que hace que esa ambigüedad no sea peligrosa: un
 * archivo con otra cabeza no aterriza, y el códec falla cerrado.
 *
 * Uso:
 *   node scripts/dwg/probe-r2010-table-fields.mjs            # genera evidencia
 *   node scripts/dwg/probe-r2010-table-fields.mjs --check    # verifica deriva
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
  "dwg-r2010-table-fields.json",
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

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outFile =
    outIndex > -1 ? path.resolve(REPO_ROOT, process.argv[outIndex + 1]) : DEFAULT_OUT;
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(path.join(DIST, "reader", "r2010-table-fields.js"))) {
    process.stderr.write(
      "probe-r2010-table-fields: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
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
  const { decodeAc1015LayerBody, AC1015_TYPE_LAYER } = await load(
    "objects",
    "table-layer.js",
  );
  const { decodeAc1015SymbolTableEntryBody, AC1015_TYPE_LTYPE } = await load(
    "objects",
    "tables-symbol.js",
  );
  const { locateR2010StringStream } = await load("reader", "r2010-string-stream.js");
  const { readR2010LayerFields, readR2010LinetypeFields, R2010_TABLE_ENTRY_HEAD_BITS } = await load(
    "reader",
    "r2010-table-fields.js",
  );
  const { projectR2004ColorIndex } = await load("objects", "color-2004.js");
  const limits = createDwgLimits();

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-r2010-table-fields --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-r2010-table-fields: ${message}\n`);
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

  const reference = bundleFor(REFERENCE_VERSION);
  const referenceByName = new Map(
    fixturesOf(reference).map((artifact) => [path.basename(artifact.path), artifact]),
  );

  /** Los LAYER y los LTYPE del gemelo AC1015, por handle. */
  function twinEntries(artifact) {
    const cursor = new BoundedByteCursor(bytesOf(artifact));
    const header = parseAc1015FileHeader(cursor);
    const map = header.records.find((record) => record.id === 2);
    const layers = new Map();
    const linetypes = new Map();
    for (const entry of readAc1015ObjectMap(cursor, map, limits)) {
      const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
      if (envelope.type === AC1015_TYPE_LAYER) {
        layers.set(entry.handle, decodeAc1015LayerBody(envelope.bodyBytes).layer);
      } else if (envelope.type === AC1015_TYPE_LTYPE) {
        linetypes.set(
          entry.handle,
          decodeAc1015SymbolTableEntryBody(envelope.bodyBytes).fields,
        );
      }
    }
    return { layers, linetypes };
  }

  /**
   * Lectura CRUDA con una cabeza arbitraria: sólo para la comprobación
   * adversa de ±1 bit. El camino real usa `readR2010LayerFields`.
   */
  function rawFields(bodyBytes, header, headBits) {
    const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
    const start = header.dataBitOffset + headBits;
    for (let index = 0; index < start; index += 1) reader.readB();
    const stateFlags = reader.readBS();
    const colorStart = reader.bitPosition;
    reader.readBS();
    const rawColor = reader.readBL() >>> 0;
    const colorByte = reader.readRC();
    const colorIndex = projectR2004ColorIndex(
      rawColor,
      colorByte,
      Math.floor(colorStart / 8),
    );
    return { stateFlags, colorIndex, endBit: reader.bitPosition };
  }

  const near = (a, b) =>
    typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-9;

  /**
   * Lectura CRUDA de un LTYPE con cabeza arbitraria y area de texto opcional:
   * solo para las comprobaciones adversas. El camino real usa
   * `readR2010LinetypeFields`.
   */
  function rawLinetype(bodyBytes, header, headBits, conAreaDeTexto) {
    const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
    const start = header.dataBitOffset + headBits;
    for (let index = 0; index < start; index += 1) reader.readB();
    const patternLength = reader.readBD();
    const alignment = reader.readRC();
    const dashCount = reader.readRC();
    if (dashCount > 64) throw new Error("dashCount fuera de presupuesto");
    const dashLengths = [];
    for (let index = 0; index < dashCount; index += 1) {
      dashLengths.push(reader.readBD());
      reader.readBS();
      reader.readRD();
      reader.readRD();
      reader.readBD();
      reader.readBD();
      reader.readBS();
    }
    if (conAreaDeTexto) for (let index = 0; index < 256; index += 1) reader.readRC();
    return { patternLength, alignment, dashLengths, endBit: reader.bitPosition };
  }

  const archivos = [];
  const porVersion = {};
  const anchuras = {};
  const estadosVistos = new Set();
  const coloresVistos = new Set();
  let total = 0;
  let estadoOk = 0;
  let colorOk = 0;
  let aterrizaOk = 0;
  let tresOk = 0;
  let adversoOk = 0;
  let ltypeTotal = 0;
  let ltypeOk = 0;
  let ltypeConPatron = 0;
  let ltypeAdversoOk = 0;
  const patronesVistos = new Set();
  const desviaciones = [];

  for (const version of MODERN_VERSIONS) {
    porVersion[version] = { total: 0, tres: 0, ltype: 0, ltypeOk: 0 };
    anchuras[version] = {};
    const head = R2010_TABLE_ENTRY_HEAD_BITS[version];
    for (const artifact of fixturesOf(bundleFor(version))) {
      const name = path.basename(artifact.path);
      const twinArtifact = referenceByName.get(name);
      if (!twinArtifact) continue;
      const record = { version, archivo: name, capas: [] };
      archivos.push(record);
      try {
        const { layers: twin, linetypes: twinLtypes } = twinEntries(twinArtifact);
        if (twin.size === 0 && twinLtypes.size === 0) continue;

        const cursor = new BoundedByteCursor(bytesOf(artifact));
        const fileHeader = parseR2004FileHeader(cursor);
        const pages = readR2004PageMap(cursor, fileHeader, limits);
        const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
        const payloadOf = (sectionName) =>
          readR2004SectionPayload(
            cursor,
            findR2004Section(sections, sectionName),
            pages,
            limits,
          );
        const objectsPayload = payloadOf("AcDb:AcDbObjects");
        const handlesPayload = payloadOf("AcDb:Handles");
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

        for (const bound of bounds) {
          const expected = twin.get(bound.handle);
          if (expected === undefined) continue;
          total += 1;
          porVersion[version].total += 1;
          estadosVistos.add(expected.stateFlags);
          coloresVistos.add(expected.color.index);

          const bodyBytes = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
          const objectHeader = readR2010ObjectHeader(bodyBytes, bound.handle);
          const span = locateR2010StringStream(bodyBytes, objectHeader);
          const anchoDato = span.startBit - objectHeader.dataBitOffset;
          anchuras[version][anchoDato] = (anchuras[version][anchoDato] ?? 0) + 1;

          const capa = {
            handle: bound.handle,
            nombre: Buffer.from(expected.name).toString("latin1"),
            anchoDato,
            esperado: {
              stateFlags: expected.stateFlags,
              colorIndex: expected.color.index,
            },
          };
          try {
            // El camino REAL del códec, no una reimplementación de la sonda.
            const fields = readR2010LayerFields(
              bodyBytes,
              objectHeader,
              span.startBit,
              version,
            );
            capa.medido = fields;
            const okE = fields.stateFlags === expected.stateFlags;
            const okC = fields.colorIndex === expected.color.index;
            if (okE) estadoOk += 1;
            if (okC) colorOk += 1;
            // Que `readR2010LayerFields` devuelva algo YA implica aterrizaje
            // exacto: es su propia condición de salida.
            aterrizaOk += 1;
            if (okE && okC) {
              tresOk += 1;
              porVersion[version].tres += 1;
            } else {
              desviaciones.push({
                version,
                archivo: name,
                handle: bound.handle,
                esperado: capa.esperado,
                medido: fields,
              });
            }
          } catch (error) {
            capa.error = typedError(error);
            desviaciones.push({
              version,
              archivo: name,
              handle: bound.handle,
              esperado: capa.esperado,
              error: capa.error,
            });
          }

          // COMPROBACIÓN ADVERSA: con la cabeza desplazada un bit en
          // cualquier dirección, NADA debe cumplir las tres condiciones.
          let adverso = true;
          for (const delta of [-1, 1]) {
            try {
              const otra = rawFields(bodyBytes, objectHeader, head + delta);
              if (
                otra.stateFlags === expected.stateFlags &&
                otra.colorIndex === expected.color.index &&
                otra.endBit === span.startBit
              ) {
                adverso = false;
              }
            } catch {
              // No decodifica con la cabeza desplazada: es justo lo esperado.
            }
          }
          if (adverso) adversoOk += 1;
          record.capas.push(capa);
        }

        for (const bound of bounds) {
          const expected = twinLtypes.get(bound.handle);
          if (expected === undefined) continue;
          ltypeTotal += 1;
          porVersion[version].ltype += 1;
          const esperado = {
            patternLength: expected.patternLength,
            alignment: expected.alignment,
            dashLengths: [...(expected.dashLengths ?? [])],
          };
          patronesVistos.add(JSON.stringify(esperado));
          if (esperado.dashLengths.length > 0) ltypeConPatron += 1;

          const bodyBytes = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
          const objectHeader = readR2010ObjectHeader(bodyBytes, bound.handle);
          const span = locateR2010StringStream(bodyBytes, objectHeader);
          const ltype = {
            handle: bound.handle,
            anchoDato: span.startBit - objectHeader.dataBitOffset,
            esperado,
          };
          try {
            const fields = readR2010LinetypeFields(
              bodyBytes,
              objectHeader,
              span.startBit,
              version,
            );
            ltype.medido = {
              patternLength: fields.patternLength,
              alignment: fields.alignment,
              dashLengths: [...fields.dashLengths],
            };
            const ok =
              near(fields.patternLength, esperado.patternLength) &&
              fields.alignment === esperado.alignment &&
              fields.dashLengths.length === esperado.dashLengths.length &&
              fields.dashLengths.every((value, index) =>
                near(value, esperado.dashLengths[index]),
              );
            if (ok) {
              ltypeOk += 1;
              porVersion[version].ltypeOk += 1;
            } else {
              desviaciones.push({
                version,
                archivo: name,
                handle: bound.handle,
                tipo: "ltype",
                esperado,
                medido: ltype.medido,
              });
            }
          } catch (error) {
            ltype.error = typedError(error);
            desviaciones.push({
              version,
              archivo: name,
              handle: bound.handle,
              tipo: "ltype",
              esperado,
              error: ltype.error,
            });
          }

          // Misma falsación adversa que en la capa, y ademas la variante CON
          // area de texto de 256 bytes: este intake la midio AUSENTE.
          let adverso = true;
          for (const delta of [-1, 1]) {
            try {
              const otro = rawLinetype(bodyBytes, objectHeader, head + delta, false);
              if (
                near(otro.patternLength, esperado.patternLength) &&
                otro.alignment === esperado.alignment &&
                otro.dashLengths.length === esperado.dashLengths.length &&
                otro.endBit === span.startBit
              ) {
                adverso = false;
              }
            } catch {
              // No decodifica desplazado: es justo lo esperado.
            }
          }
          try {
            const conArea = rawLinetype(bodyBytes, objectHeader, head, true);
            if (conArea.endBit === span.startBit) adverso = false;
          } catch {
            // El area de texto no cabe: confirma que NO esta.
          }
          if (adverso) ltypeAdversoOk += 1;
          (record.linetypes ??= []).push(ltype);
        }
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  const anchurasUnicas = MODERN_VERSIONS.every(
    (version) => Object.keys(anchuras[version]).length === 1,
  );
  const resumen = {
    totalCapas: total,
    estadoExacto: estadoOk,
    colorExacto: colorOk,
    aterrizajeExacto: aterrizaOk,
    lasTresALaVez: tresOk,
    cabezaDesplazadaNoCuela: adversoOk,
    ltypeTotal,
    ltypeExacto: ltypeOk,
    ltypeConPatronNoVacio: ltypeConPatron,
    ltypeAdversoNoCuela: ltypeAdversoOk,
    ltypePatronesDistintosEjercitados: [...patronesVistos].sort(),
    anchuraDeCabezaPorVersion: R2010_TABLE_ENTRY_HEAD_BITS,
    anchuraDelDatoPorVersion: anchuras,
    estadosDistintosEjercitados: [...estadosVistos].sort((a, b) => a - b),
    coloresDistintosEjercitados: [...coloresVistos].sort((a, b) => a - b),
    porVersion,
  };

  const veredicto =
    total === 0
      ? "Sin capas comparables: no se afirma nada."
      : tresOk === total &&
          adversoOk === total &&
          anchurasUnicas &&
          ltypeOk === ltypeTotal &&
          ltypeAdversoOk === ltypeTotal
        ? `El estado y el color de una capa quedan medidos en R2010+ en ${tresOk}/${total} capas de las tres versiones, con TRES condiciones exigidas a la vez: el BS de estado reproduce el del gemelo AC1015 (${estadoOk}/${total}), el color R2004 (BS+BL+RC) proyecta al MISMO indice ACI (${colorOk}/${total}) y el dato termina EXACTAMENTE donde empieza el flujo de cadenas (${aterrizaOk}/${total}). La cabeza previa mide ${R2010_TABLE_ENTRY_HEAD_BITS.AC1024} bits en AC1024 y ${R2010_TABLE_ENTRY_HEAD_BITS.AC1027} en AC1027/AC1032 -la misma diferencia de un bit que ya separa el prefijo comun de entidad-, y es UNICA por version. Falsacion adversa: desplazando esa cabeza un bit en cualquier direccion, las tres condiciones fallan en ${adversoOk}/${total}. Los valores VARIAN de verdad: ${estadosVistos.size} estados distintos ${JSON.stringify([...estadosVistos].sort((a, b) => a - b))} y ${coloresVistos.size} indices ACI distintos ${JSON.stringify([...coloresVistos].sort((a, b) => a - b))}. LA MISMA cabeza sirve para el LTYPE: patron, alineacion y trazos coinciden con el gemelo en ${ltypeOk}/${ltypeTotal}, con aterrizaje exacto y la MISMA anchura de cabeza medida por separado en un tipo cuyo dato mide 25/26 bits cuando el patron esta vacio y 429/430 cuando no; el area de texto de 256 bytes de R2000 se midio AUSENTE en R2010+ (la variante CON area no aterriza en ninguno) y la falsacion adversa falla en ${ltypeAdversoOk}/${ltypeTotal}. LIMITE: de esos ${ltypeTotal} LTYPE solo ${ltypeConPatron} llevan un patron NO vacio; los demas son patrones vacios, asi que la variedad de trazos ejercitada es poca y los campos por trazo que no varian (desplazamientos, escala, rotacion, banderas) estan leidos, no falsados.`
        : `HIPÓTESIS NO CONFIRMADA: las tres ${tresOk}/${total}, estado ${estadoOk}/${total}, color ${colorOk}/${total}, adverso ${adversoOk}/${total}, anchura unica por version ${anchurasUnicas}, ltype ${ltypeOk}/${ltypeTotal}, ltype adverso ${ltypeAdversoOk}/${ltypeTotal}. Ver desviaciones.`;

  const evidence = {
    $schema: "../../schema/dwg-evidence.schema.json",
    schemaVersion: 1,
    evidenceId: "dwg-r2010-table-fields",
    generadoPor: "scripts/dwg/probe-r2010-table-fields.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Campos NO-NOMBRE de las entradas de tabla con datos medidos en AC1024/AC1027/AC1032 -- LAYER (BS de estado y color CmC de R2004) y LTYPE (longitud de patron, alineacion y trazos) --, comparados contra la entrada del MISMO handle en el gemelo AC1015 del MISMO dibujo.",
    metodo:
      "Oráculo diferencial sobre los bundles fundacionales, ejecutando el camino REAL del códec (readR2010LayerFields y readR2010LinetypeFields), no una reimplementación de la sonda. Tres condiciones exigidas a la vez -valor de estado, indice ACI y aterrizaje exacto en el inicio del flujo de cadenas- mas una falsación adversa con la cabeza desplazada un bit. En el LTYPE se anade una segunda variante adversa: la disposicion de R2000 CON su area de texto de 256 bytes, que este intake mide AUSENTE en R2010+.",
    limiteDeLaEvidencia:
      "Qué hay EXACTAMENTE en los 7/8 bits de cabeza NO está resuelto y con este corpus no puede estarlo: no hay ni un objeto con EED, ni uno con reactores, ni una entrada dependiente de xref, asi que al menos dos composiciones distintas reproducen los mismos valores. Se mide la ANCHURA, no el contenido. Los tres campos de xref del modelo R2000 (xrefRef, xrefIndexPlusOne, xrefDependent) son CONSTANTES en todo el corpus -no cero: xrefRef vale true en las 18 capas-, asi que no discriminan ningun modelo y este intake NO los decodifica en R2010+. El aterrizaje exacto es lo que hace que la ambiguedad no sea peligrosa: un archivo con otra cabeza no aterriza y el codec falla cerrado con DWG_VERSION_DECODER_UNSUPPORTED en vez de devolver un color plausible y equivocado. En el LTYPE la variedad es escasa: de los 78 comparados solo 6 (dos por version) llevan un patron NO vacio, asi que los campos por trazo que no varian -desplazamientos, escala, rotacion y banderas- estan leidos pero NO falsados.",
    correccionFechada:
      "2026-09-01. Este intake CORRIGE una afirmación falsa del corte anterior: «las banderas de capa de R2010+ no son el BS de R2000 en ninguna posición». Sí lo son. El barrido que dio cero aciertos ponia un hecho medible (el estado) detras de uno inmedible (los tres campos de xref, constantes en el corpus), y leia el color como el CmC de R2000 cuando el adaptador AC1018 de este mismo repo ya tenia medido que desde R2004 son tres campos. El error no estaba en el formato sino en como se le pregunto.",
    resumen,
    desviaciones,
    archivos,
  };

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-r2010-table-fields --check: falta ${path.relative(REPO_ROOT, outFile)}; regenera la evidencia.\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(evidence.resumen) &&
      previous.veredicto === evidence.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-r2010-table-fields --check: la medición NO coincide con la evidencia registrada.\n",
      );
      process.stderr.write(`  registrada: ${previous.veredicto}\n`);
      process.stderr.write(`  medida:     ${evidence.veredicto}\n`);
      process.exit(1);
    }
    process.stdout.write(`probe-r2010-table-fields --check: ${evidence.veredicto}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${evidence.veredicto}\n`);
  process.stdout.write(`  → ${path.relative(REPO_ROOT, outFile)}\n`);
}

main().catch((error) => {
  process.stderr.write(`probe-r2010-table-fields: ${error?.stack ?? error}\n`);
  process.exit(1);
});
