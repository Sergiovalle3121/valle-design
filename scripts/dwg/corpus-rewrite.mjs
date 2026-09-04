#!/usr/bin/env node
/**
 * Arnés de RE-ESCRITURA del corpus: ¿cuánto de un archivo AJENO sobrevive a
 * nuestro writer?
 *
 * QUÉ RESPONDE Y POR QUÉ NO LO RESPONDÍA NADA. `validate-corpus.mjs` mide el
 * LECTOR contra 57 archivos que produjo una implementación independiente
 * (ODA). `oda-roundtrip.mjs` mide el WRITER contra un lector ajeno, pero sobre
 * casos que nos inventamos NOSOTROS y con un binario con licencia del titular
 * que no corre en este entorno. Entre las dos queda un hueco: nadie mide el
 * writer sobre MATERIAL AJENO. Este arnés lo llena con lo único que este
 * entorno permite —el corpus admitido— y publica la cifra tal como salga.
 *
 * CÓMO. Por cada fixture ADMITIDO y verificado por hash:
 *   1. se decodifica con el lector de su versión (`readAc1015Database` para
 *      AC1015, `readR2004Database` para la familia moderna) y sale la base
 *      NEUTRAL;
 *   2. cada entidad se le ofrece al writer POR SEPARADO con
 *      `writeAc1015EntityBody` —la MISMA puerta de aceptación que usa el
 *      archivo completo, porque `writeAc1015ResolvedEntityBody` compone sobre
 *      ella, y no una lista de clases escrita a mano aquí que envejecería el
 *      día que el writer aprenda una clase nueva— y las que rechaza quedan
 *      declaradas con su error TIPADO;
 *   3. con las aceptadas se arma un archivo propio con `writeAc1015MinimalFile`
 *      (el tipo `Ac1015MinimalFileEntitySpec.entity` es el MISMO
 *      `DwgGeometryEntity` que devuelve el lector: re-escribir el corpus
 *      entero no cuesta un adaptador);
 *   4. el archivo propio se vuelve a leer y cada entidad se coteja CAMPO A
 *      CAMPO contra la que entró (`deepDiff`, estructura completa);
 *   5. y los VALORES se anclan además contra el DXF del oráculo del mismo
 *      bundle con `parseOracleDxf`/`expectedFromOracle` de `dxf-oracle.mjs`,
 *      importados SIN modificar.
 *
 * EL LÍMITE, SIN SUAVIZAR. El paso 4 enfrenta nuestro writer con nuestro
 * lector: un error SIMÉTRICO —escribir mal un campo y leerlo mal de la misma
 * manera— seguiría oculto. El paso 5 lo estrecha, porque los valores los
 * escribió otro, pero no lo cierra: sigue siendo NUESTRO decoder el que lee
 * NUESTRO archivo. Sólo un conversor AJENO leyendo nuestro archivo cierra ese
 * hueco, y eso es `oda-roundtrip.mjs` — acción del titular con su binario con
 * licencia. Este informe NO sustituye ese paso y lo dice en `limiteDeclarado`.
 *
 * QUÉ SALE. Una matriz POR CLASE con tres estados: `regrabada-integra`,
 * `regrabada-con-perdida-declarada` y `no-escribible`. Es el patrón de medida
 * de las tareas siguientes de este frente: cada clase nueva del writer se ve
 * como una fila que CAMBIA DE ESTADO, no como un párrafo nuevo.
 *
 * AMBOS RESULTADOS SON ÉXITO DEL ARNÉS: una matriz llena de verdes o una llena
 * de «no escribible». Lo único que sería fracaso es un informe que suavice lo
 * que vio.
 *
 * USO:
 *   node scripts/dwg/corpus-rewrite.mjs            # regenera la evidencia
 *   node scripts/dwg/corpus-rewrite.mjs --check    # la evidencia committeada
 *                                                  # contra una corrida fresca
 *
 * FRONTERA DE PRODUCTO: script de evidencia; importa el laboratorio por su
 * ruta interna de `dist` a propósito, sin superficie pública ni runtime del
 * producto, y no promueve nada.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectedFromOracle, parseOracleDxf } from "./dxf-oracle.mjs";
import {
  DwgCorpusGateError,
  fetchAdmittedCorpus,
  loadCorpusPin,
  resolveCorpusSource,
} from "./corpus-consumer.mjs";
import {
  anchorAgainstOracle,
  decodeBytes,
  deepDiff,
  emptyClassRow,
  projectForOracle,
  resolveClassState,
} from "./corpus-rewrite-compare.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-corpus-rewrite.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
const distUrl = (relative) => pathToFileURL(path.join(DIST, relative)).href;

/** Los dos bloques que el archivo mínimo escribe siempre por su cuenta. */
const RESERVED_BLOCKS = new Set(["*MODEL_SPACE", "*PAPER_SPACE"]);
/** Las tres entradas LTYPE del esquema canónico, que el writer ya emite. */
const BUILTIN_LINETYPES = new Set(["BYBLOCK", "BYLAYER", "CONTINUOUS"]);

/**
 * Aplana los registros de una lista como los ve el DXF del oráculo: los
 * ATTRIB atados a un INSERT vuelven a la lista —el oráculo los ve como
 * entidades que siguen al INSERT— y los SEQEND estructurales se descartan,
 * porque el oráculo también los descarta. Misma convención que
 * `validate-corpus.mjs`, para que las dos mediciones cuenten lo mismo.
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
// Plan de re-escritura de un archivo
// ---------------------------------------------------------------------------

/**
 * Traduce una base neutral leída a las opciones del archivo mínimo,
 * DECLARANDO por el camino cada entidad que el writer no acepta.
 */
function planRewrite(database, writeEntityBody) {
  const extraLayers = database.layers.filter((layer) => decodeBytes(layer.name) !== "0");
  const layerIndexByHandle = new Map();
  extraLayers.forEach((layer, index) => layerIndexByHandle.set(layer.handle, index + 1));
  const userBlocks = database.blocks.filter(
    (block) => !RESERVED_BLOCKS.has(decodeBytes(block.name).toUpperCase()),
  );
  const blockIndexByName = new Map();
  userBlocks.forEach((block, index) => {
    const name = decodeBytes(block.name).toUpperCase();
    if (!blockIndexByName.has(name)) blockIndexByName.set(name, index);
  });

  const rejected = [];
  /** Ofrece UNA entidad al writer y devuelve su spec, o null con el motivo. */
  const accept = (record, contexto) => {
    const kind = record.entity.kind;
    try {
      writeEntityBody(
        record.entity,
        0x100,
        kind === "insert" ? { insertBlockHandle: 0x200 } : {},
      );
    } catch (error) {
      rejected.push({
        contexto,
        tipo: kind,
        motivo: "writer-rechaza",
        code: error?.detail?.code ?? error?.code ?? "UNKNOWN",
        mensaje: String(error?.detail?.message ?? error?.message ?? error).slice(0, 300),
      });
      return null;
    }
    const spec = {
      entity: record.entity,
      layerIndex: layerIndexByHandle.get(record.layerHandle) ?? 0,
    };
    if (kind === "insert") {
      const target = blockIndexByName.get(
        decodeBytes(record.insertedBlockName).toUpperCase(),
      );
      if (target === undefined) {
        rejected.push({
          contexto,
          tipo: kind,
          motivo: "referencia-no-resoluble",
          code: "INSERT_BLOCK_UNRESOLVED",
          mensaje: `el INSERT apunta a "${decodeBytes(record.insertedBlockName)}", que no es un bloque de usuario de este archivo`,
        });
        return null;
      }
      spec.insertBlockIndex = target;
    }
    return spec;
  };

  const acceptAll = (records, contexto) => {
    const seen = flattenRecords(records);
    const kept = [];
    for (const record of seen) {
      const spec = accept(record, contexto);
      if (spec !== null) kept.push({ spec, source: record });
    }
    return { seen, kept };
  };

  const modelSpace = acceptAll(database.modelSpaceEntities, "model-space");
  const blocks = userBlocks.map((block) => {
    const name = decodeBytes(block.name);
    return { name, source: block, ...acceptAll(block.entities, `bloque:${name}`) };
  });

  const options = {
    layers: extraLayers.map((layer) => ({
      name: [...layer.name],
      colorIndex: layer.colorIndex ?? 7,
      frozen: layer.frozen ?? false,
      locked: layer.locked ?? false,
      ...(layer.linetypeName === undefined ? {} : { linetypeName: layer.linetypeName }),
    })),
    linetypes: (database.tables?.linetypes ?? [])
      .filter((entry) => !BUILTIN_LINETYPES.has(decodeBytes(entry.name).toUpperCase()))
      .map((entry) => ({
        name: [...entry.name],
        patternLength: entry.fields?.patternLength ?? 0,
        dashes: (entry.fields?.dashLengths ?? []).map((length) => ({ length })),
      })),
    blocks: blocks.map((block) => ({
      name: [...block.source.name],
      entities: block.kept.map((item) => item.spec),
    })),
    entities: modelSpace.kept.map((item) => item.spec),
  };

  return { options, modelSpace, blocks, rejected, extraLayers };
}

/**
 * Agrupa las observaciones de capa por la diferencia EXACTA que declaran.
 *
 * Sesenta y dos entradas casi idénticas esconden el hecho; una línea que diga
 * «este campo, de este valor a este otro, 62 veces» lo enseña. Las entradas
 * completas siguen en `observacionesDeCapa` para poder rastrear cuál fue cuál.
 */
function rollUpLayerObservations(observations) {
  const buckets = new Map();
  for (const observation of observations) {
    for (const difference of observation.diferencias) {
      const key = `${difference.campo}\u0000${JSON.stringify(difference.escrito)}\u0000${JSON.stringify(difference.releido)}`;
      const bucket = buckets.get(key) ?? {
        campo: difference.campo,
        enElAjeno: difference.escrito,
        enElPropio: difference.releido,
        cuantas: 0,
        capas: [],
      };
      bucket.cuantas += 1;
      if (!bucket.capas.includes(observation.capa)) bucket.capas.push(observation.capa);
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()]
    .sort((a, b) => b.cuantas - a.cuantas || a.campo.localeCompare(b.campo))
    .map((bucket) => ({ ...bucket, capas: [...bucket.capas].sort() }));
}

// ---------------------------------------------------------------------------
// Entorno
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

// ---------------------------------------------------------------------------
// El arnés
// ---------------------------------------------------------------------------

/**
 * Corre el arnés completo y devuelve el informe SIN el bloque de entorno ni la
 * marca de tiempo: eso lo añade `main`. Separarlo es lo que permite que
 * `--check` compare dos corridas y que el spec lo llame sin escribir nada.
 */
export async function runCorpusRewrite({ env = process.env } = {}) {
  const [
    { readAc1015Database },
    { readR2004Database },
    { writeAc1015MinimalFile },
    { writeAc1015EntityBody },
  ] = await Promise.all([
    import(distUrl("reader/ac1015-database-reader.js")),
    import(distUrl("reader/r2004-database-reader.js")),
    import(distUrl("writer/ac1015-minimal-file-writer.js")),
    import(distUrl("writer/ac1015-entity-writer.js")),
  ]);

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin, env });
  if (!transport) {
    throw new DwgCorpusGateError(
      "CORPUS_TRANSPORT_FAILED",
      `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}): no hay archivos ajenos que re-escribir y no se afirma nada`,
      {},
    );
  }
  const corpus = fetchAdmittedCorpus({ pin, transport });

  const matriz = {};
  const rowOf = (kind) => (matriz[kind] ??= emptyClassRow());
  const noteReason = (kind, reason) => {
    const row = rowOf(kind);
    if (!row.motivos.includes(reason)) row.motivos.push(reason);
  };
  const archivos = [];
  const diferencias = [];
  const observacionesDeCapa = [];

  for (const bundle of corpus.bundles) {
    const fixtures = bundle.artifacts
      .filter((artifact) => artifact.kind === "fixtures" && artifact.path.endsWith(".dwg"))
      .sort((a, b) => a.path.localeCompare(b.path));
    for (const fixture of fixtures) {
      const stem = path.basename(fixture.path, ".dwg");
      const record = {
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        fixture: fixture.path,
        sha256: fixture.sha256,
      };
      archivos.push(record);
      const registrar = (entry) =>
        diferencias.push({ archivo: stem, version: bundle.dwgVersion, ...entry });

      const dwgBytes = new Uint8Array(transport.readFile(pin.commit, fixture.path));
      const readDatabase =
        bundle.dwgVersion === "AC1015" ? readAc1015Database : readR2004Database;
      let database;
      try {
        database = readDatabase(dwgBytes);
      } catch (error) {
        record.abre = false;
        record.error = String(error?.detail?.message ?? error?.message ?? error).slice(0, 300);
        registrar({ contexto: "archivo", problema: "el-lector-no-abre-el-ajeno", mensaje: record.error });
        continue;
      }
      record.abre = true;

      const plan = planRewrite(database, writeAc1015EntityBody);
      for (const source of [
        ...plan.modelSpace.seen,
        ...plan.blocks.flatMap((block) => block.seen),
      ]) {
        rowOf(source.entity.kind).vistas += 1;
      }
      for (const rejection of plan.rejected) {
        rowOf(rejection.tipo).noEscribibles += 1;
        noteReason(rejection.tipo, `${rejection.code}: ${rejection.mensaje}`);
        registrar(rejection);
      }
      record.entidadesVistas =
        plan.modelSpace.seen.length +
        plan.blocks.reduce((total, block) => total + block.seen.length, 0);
      record.entidadesNoEscribibles = plan.rejected.length;

      let rewritten;
      try {
        rewritten = writeAc1015MinimalFile(plan.options);
      } catch (error) {
        record.reescribe = false;
        record.error = String(error?.detail?.message ?? error?.message ?? error).slice(0, 300);
        registrar({ contexto: "archivo", problema: "el-writer-no-arma-el-archivo", mensaje: record.error });
        continue;
      }
      let reread;
      try {
        reread = readAc1015Database(rewritten);
      } catch (error) {
        record.reescribe = true;
        record.releeElPropio = false;
        record.error = String(error?.detail?.message ?? error?.message ?? error).slice(0, 300);
        registrar({ contexto: "archivo", problema: "el-lector-no-abre-nuestro-archivo", mensaje: record.error });
        continue;
      }
      record.reescribe = true;
      record.releeElPropio = true;
      record.bytesAjenos = dwgBytes.length;
      record.bytesPropios = rewritten.length;
      record.entidadesEscritas =
        plan.modelSpace.kept.length +
        plan.blocks.reduce((total, block) => total + block.kept.length, 0);

      // --- campo a campo: lo que entró contra lo que volvió ---------------
      const compareKept = (kept, actual, contexto) => {
        kept.forEach((item, index) => {
          const kind = item.spec.entity.kind;
          const row = rowOf(kind);
          row.escritas += 1;
          const back = actual[index]?.entity;
          const diffs =
            back === undefined
              ? [{ campo: "(entidad)", escrito: kind, releido: null }]
              : deepDiff(item.spec.entity, back);
          if (diffs.length === 0) {
            row.releidasIguales += 1;
            return;
          }
          row.releidasConDiferencia += 1;
          noteReason(kind, `campo distinto al releer: ${diffs.map((d) => d.campo).join(", ")}`);
          registrar({
            contexto,
            tipo: kind,
            problema: "campo-distinto-al-releer",
            diferencias: diffs.slice(0, 12),
          });
        });
      };
      compareKept(plan.modelSpace.kept, reread.modelSpaceEntities, "model-space");
      const rereadBlocks = reread.blocks.filter(
        (block) => !RESERVED_BLOCKS.has(decodeBytes(block.name).toUpperCase()),
      );
      plan.blocks.forEach((block, index) => {
        compareKept(block.kept, rereadBlocks[index]?.entities ?? [], `bloque:${block.name}`);
      });

      // --- capas: nombre, color, estado y tipo de línea --------------------
      const rereadLayers = reread.layers.filter((layer) => decodeBytes(layer.name) !== "0");
      record.capas = plan.extraLayers.map((layer, index) => {
        const back = rereadLayers[index];
        const entrada = {
          nombre: decodeBytes(layer.name),
          colorIndex: layer.colorIndex ?? null,
          frozen: layer.frozen ?? null,
          locked: layer.locked ?? null,
          linetypeName: layer.linetypeName ?? null,
        };
        const salida = {
          nombre: back === undefined ? null : decodeBytes(back.name),
          colorIndex: back?.colorIndex ?? null,
          frozen: back?.frozen ?? null,
          locked: back?.locked ?? null,
          linetypeName: back?.linetypeName ?? null,
        };
        const diffs = deepDiff(entrada, salida);
        if (diffs.length > 0) {
          observacionesDeCapa.push({
            archivo: stem,
            version: bundle.dwgVersion,
            capa: entrada.nombre,
            diferencias: diffs,
          });
        }
        return { ...entrada, coincide: diffs.length === 0 };
      });

      // --- anclaje contra el DXF del oráculo ------------------------------
      const oracle = bundle.artifacts.find(
        (artifact) => artifact.kind === "oracles" && artifact.path.endsWith(`dxf/${stem}.dxf`),
      );
      record.oraculo = oracle?.path ?? null;
      if (oracle === undefined) {
        record.anclaje = null;
        continue;
      }
      const expected = parseOracleDxf(
        Buffer.from(transport.readFile(pin.commit, oracle.path)).toString("utf8"),
      );
      const layerNameOf = (item) => {
        const name = reread.layers.find((layer) => layer.handle === item.layerHandle)?.name;
        return name === undefined ? undefined : decodeBytes(name);
      };
      const projectAll = (records) =>
        flattenRecords(records).map((item) => ({
          kind: item.entity.kind,
          layer: layerNameOf(item),
          fields: projectForOracle(item.entity, item.insertedBlockName),
        }));
      const anchorDiffs = [];
      const anclaje = {
        modelSpace: anchorAgainstOracle(
          expected.topEntities.map(expectedFromOracle),
          projectAll(reread.modelSpaceEntities),
          "model-space",
          anchorDiffs,
        ),
        bloques: {},
      };
      for (const [name, entities] of expected.blocks) {
        const found = rereadBlocks.find(
          (block) => decodeBytes(block.name).toUpperCase() === name,
        );
        anclaje.bloques[name] = anchorAgainstOracle(
          entities.map(expectedFromOracle),
          found === undefined ? [] : projectAll(found.entities),
          `bloque:${name}`,
          anchorDiffs,
        );
      }
      record.anclaje = anclaje;
      for (const entry of anchorDiffs) registrar(entry);
      for (const table of [anclaje.modelSpace, ...Object.values(anclaje.bloques)]) {
        for (const [kind, cell] of Object.entries(table)) {
          const row = rowOf(kind);
          row.declaradasPorOraculo += cell.declaradasPorOraculo;
          row.ancladasAlOraculo += cell.ancladas;
          row.valorDistintoDelOraculo += cell.valorDistinto;
          row.declaradasPorOraculoSinAnclar += cell.sinAnclar;
          if (cell.valorDistinto > 0) {
            noteReason(kind, "un valor releído no coincide con el DXF del oráculo");
          }
        }
      }
    }
  }

  for (const row of Object.values(matriz)) {
    row.estado = resolveClassState(row);
    row.motivos.sort();
  }

  const clasesPorEstado = (estado) =>
    Object.entries(matriz)
      .filter(([, row]) => row.estado === estado)
      .map(([kind]) => kind)
      .sort();
  const integras = clasesPorEstado("regrabada-integra");
  const conPerdida = clasesPorEstado("regrabada-con-perdida-declarada");
  const noEscribibles = clasesPorEstado("no-escribible");
  const totals = Object.values(matriz).reduce(
    (acc, row) => ({
      vistas: acc.vistas + row.vistas,
      escritas: acc.escritas + row.escritas,
      noEscribibles: acc.noEscribibles + row.noEscribibles,
      releidasIguales: acc.releidasIguales + row.releidasIguales,
      ancladas: acc.ancladas + row.ancladasAlOraculo,
    }),
    { vistas: 0, escritas: 0, noEscribibles: 0, releidasIguales: 0, ancladas: 0 },
  );
  const porcentaje = ((100 * totals.escritas) / Math.max(1, totals.vistas)).toFixed(1);

  const veredicto =
    archivos.length === 0
      ? "No hay fixtures admitidos que re-escribir."
      : `De ${totals.vistas} entidades ajenas, el writer regraba ${totals.escritas} (${porcentaje}%) y rechaza ${totals.noEscribibles}; ${totals.releidasIguales} vuelven idénticas campo a campo y ${totals.ancladas} quedan ancladas al DXF del oráculo. Íntegras: ${integras.join(", ") || "ninguna"}. Con pérdida declarada: ${conPerdida.join(", ") || "ninguna"}. No escribibles: ${noEscribibles.join(", ") || "ninguna"}.`;

  return {
    $schema: "urn:valle-design:schema:dwg-corpus-rewrite:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-corpus-rewrite-v1",
    generadoPor: "node scripts/dwg/corpus-rewrite.mjs",
    veredicto,
    alcance:
      "Los fixtures ADMITIDOS del corpus de conformidad (AC1015 con el lector R2000; AC1018/AC1024/AC1027/AC1032 con el R2004), decodificados a la base neutral, re-escritos con writeAc1015MinimalFile —que emite SIEMPRE AC1015, de modo que un fixture moderno se mide como bajada de versión— y releídos con readAc1015Database. Los DWG los produjo una implementación independiente (ODA); el DXF oráculo es la fuente de autoría propia congelada en el mismo bundle.",
    limiteDeclarado:
      "Esta medición NO cierra el hueco del oráculo externo. El cotejo campo a campo enfrenta NUESTRO writer con NUESTRO lector: un error SIMÉTRICO —escribir mal un campo y leerlo mal igual— seguiría oculto. El anclaje contra el DXF del oráculo lo estrecha, porque esos valores los escribió otro, pero sigue siendo nuestro decoder el que lee nuestro archivo. Sólo un conversor AJENO leyendo NUESTRO archivo cierra el hueco: eso es scripts/dwg/oda-roundtrip.mjs y exige el binario con licencia del titular, que no corre en este entorno.",
    notaDeVocabulario:
      "El vocabulario del oráculo no es el del modelo neutral: una POLYLINE 2D del DXF se proyecta a `lwpolyline` y en el DWG llega como `polyline2d`. Por eso `declaradasPorOraculoSinAnclar` NO decide el estado de una fila —un esperado sin anclar puede pertenecer a otra clase del writer—; lo que sí lo decide es `valorDistintoDelOraculo`, donde el emparejamiento es real y el valor no coincide.",
    reglaCleanRoom:
      "Toda discrepancia se REGISTRA aquí y no se corrige en la misma pasada: tocar el writer exige registrar antes el hecho de formato en packages/dwg-codec/SOURCE_REGISTER.json (ADR-0007).",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundles: corpus.bundles.map((bundle) => ({ id: bundle.id, version: bundle.dwgVersion })),
    },
    resumen: {
      archivos: archivos.length,
      abiertos: archivos.filter((item) => item.abre === true).length,
      reescritos: archivos.filter((item) => item.reescribe === true).length,
      releidos: archivos.filter((item) => item.releeElPropio === true).length,
      entidadesVistas: totals.vistas,
      entidadesEscritas: totals.escritas,
      entidadesNoEscribibles: totals.noEscribibles,
      entidadesReleidasIguales: totals.releidasIguales,
      entidadesAncladasAlOraculo: totals.ancladas,
      porcentajeRegrabado: Number(porcentaje),
      clasesIntegras: integras,
      clasesConPerdidaDeclarada: conPerdida,
      clasesNoEscribibles: noEscribibles,
      capasComparadas: archivos.reduce((total, item) => total + (item.capas?.length ?? 0), 0),
      capasConDiferencia: observacionesDeCapa.length,
      diferenciasRegistradas: diferencias.length,
    },
    resumenDeObservacionesDeCapa: rollUpLayerObservations(observacionesDeCapa),
    matrizPorClase: Object.fromEntries(
      Object.entries(matriz).sort(([a], [b]) => a.localeCompare(b)),
    ),
    observacionesDeCapa,
    diferencias,
    archivos,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

/** Lo que `--check` IGNORA a propósito: sólo lo que cambia por máquina y reloj. */
const VOLATILE_KEYS = ["generadoEn", "environment"];

const withoutVolatile = (report) => {
  const copy = { ...report };
  for (const key of VOLATILE_KEYS) delete copy[key];
  return copy;
};

function reportFirstDifference(stored, fresh) {
  const linesA = stored.split("\n");
  const linesB = fresh.split("\n");
  for (let index = 0; index < Math.max(linesA.length, linesB.length); index += 1) {
    if (linesA[index] === linesB[index]) continue;
    process.stderr.write(
      `  primera diferencia en la línea ${index + 1}:\n` +
        `    committeado: ${linesA[index] ?? "(fin del archivo)"}\n` +
        `    fresco:      ${linesB[index] ?? "(fin del archivo)"}\n`,
    );
    return;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outFile = outIndex > -1 ? path.resolve(REPO_ROOT, args[outIndex + 1]) : DEFAULT_OUT;
  const check = args.includes("--check");

  if (!fs.existsSync(path.join(DIST, "reader", "ac1015-database-reader.js"))) {
    process.stderr.write(
      "corpus-rewrite: falta packages/dwg-codec/dist — corre `npm run build --workspace=@valle-design/dwg-codec`\n",
    );
    process.exit(1);
  }

  const fresh = await runCorpusRewrite();

  if (check) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `corpus-rewrite --check: no existe ${path.relative(REPO_ROOT, outFile)}; córrelo sin --check para publicarlo.\n`,
      );
      process.exit(1);
    }
    const stored = JSON.stringify(
      withoutVolatile(JSON.parse(fs.readFileSync(outFile, "utf8"))),
      null,
      2,
    );
    const regenerated = JSON.stringify(withoutVolatile(fresh), null, 2);
    if (stored !== regenerated) {
      process.stderr.write(
        "corpus-rewrite --check: la evidencia committeada NO coincide con una corrida fresca sobre el mismo corpus.\n" +
          "  Regenera con `node scripts/dwg/corpus-rewrite.mjs` y revisa el diff antes de commitear.\n",
      );
      reportFirstDifference(stored, regenerated);
      process.exit(1);
    }
    process.stdout.write(
      `corpus-rewrite --check: la evidencia coincide con una corrida fresca (${fresh.resumen.archivos} archivos ajenos, ${fresh.resumen.entidadesVistas} entidades).\n`,
    );
    return;
  }

  const report = { ...fresh, generadoEn: new Date().toISOString(), environment: environment() };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const write = (line) => process.stdout.write(`${line}\n`);
  write(
    `corpus-rewrite: ${report.resumen.archivos} fixture(s) ajenos · ${report.resumen.reescritos} re-escritos · ${report.resumen.entidadesEscritas}/${report.resumen.entidadesVistas} entidades regrabadas (${report.resumen.porcentajeRegrabado}%)`,
  );
  write(`veredicto: ${report.veredicto}`);
  write("matriz clase → estado · vistas/escritas/releídas-iguales/ancladas-al-oráculo:");
  for (const [kind, row] of Object.entries(report.matrizPorClase)) {
    write(
      `  ${kind.padEnd(14)} ${row.estado.padEnd(32)} ${row.vistas}/${row.escritas}/${row.releidasIguales}/${row.ancladasAlOraculo}`,
    );
  }
  write(
    `capas comparadas: ${report.resumen.capasComparadas} · con diferencia: ${report.resumen.capasConDiferencia}`,
  );
  write(
    `diferencias registradas: ${report.resumen.diferenciasRegistradas} (ver ${path.relative(REPO_ROOT, outFile)})`,
  );
  write(`límite declarado: ${report.limiteDeclarado}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof DwgCorpusGateError) {
      process.stderr.write(`corpus-rewrite abortado por el gate del corpus: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  });
}
