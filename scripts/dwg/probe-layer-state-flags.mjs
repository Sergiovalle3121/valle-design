#!/usr/bin/env node
/**
 * SONDA: LA SEMÁNTICA BIT A BIT DE LAS BANDERAS DE ESTADO DE CAPA.
 *
 * QUÉ PROBLEMA RESUELVE. El códec decodifica `stateFlags` de LAYER como un
 * `BS` crudo en las cinco versiones, y `canonical-layers.ts` lo declaraba
 * PÉRDIDA: «su semántica bit a bit sigue sin fuente registrada y no se
 * interpreta». La consecuencia en el producto era concreta y silenciosa: toda
 * capa llegaba al lienzo como `visible: true, locked: false`, así que un
 * dibujo real con una capa congelada se abría con esa capa DIBUJADA. Leer el
 * número y no saber qué significa es, para el usuario, no haberlo leído.
 *
 * POR QUÉ ES FALSABLE SIN FUENTE NUEVA. El corpus admitido trae `04-capas`,
 * un dibujo hecho a propósito con una capa CONGELADA (DXF grupo 70 = 1) y una
 * capa BLOQUEADA (DXF grupo 70 = 4) junto a cinco capas normales. Su DXF
 * fuente es el oráculo: dice qué capa está congelada y cuál bloqueada ANTES
 * de mirar el DWG. Eso convierte la semántica en una hipótesis contrastable
 * contra un hecho externo al binario, no en una lectura plausible.
 *
 * MÉTODO — SE PRUEBAN TODOS LOS BITS, NO EL QUE UNO ESPERA. Para cada
 * posición de bit 0..15 se comprueba si «ese bit vale 1 exactamente cuando el
 * oráculo dice congelada» sobre TODAS las capas de TODOS los fixtures. Igual
 * para bloqueada. Un bit sólo se declara medido si acierta en todas las capas
 * Y si además existe al menos un caso positivo y uno negativo: un bit
 * CONSTANTE no puede falsar nada, por muy bonito que sea su valor. Es la misma
 * disciplina que corrigió la sonda de campos de tabla en la fase 1.F, donde
 * tres campos invariantes se habían tomado por confirmación.
 *
 * FRONTERA DE PRODUCTO. Script de evidencia: importa el laboratorio por su
 * ruta interna de dist a propósito, sin superficie pública ni runtime.
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
import { parseOracleDxf } from "./dxf-oracle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-layer-state-flags.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");
/** Ancho del `BS` que transporta las banderas: se prueban todos sus bits. */
const BIT_POSITIONS = 16;

/**
 * BANDERAS DEL ORÁCULO DXF. El grupo 70 de una entrada LAYER es un campo de
 * bits del formato DXF, y aquí se usa SÓLO como verdad de referencia sobre qué
 * capa está congelada o bloqueada — nunca como fuente de la codificación DWG,
 * que es justo lo que esta sonda mide y que resulta NO coincidir en posición.
 */
const DXF_FROZEN = 1;
const DXF_LOCKED = 4;

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
    message: error?.message ?? String(error),
  };
}

/**
 * Los nombres de tabla viajan como BYTES OPACOS —la base los entrega como un
 * array llano de octetos, no como texto— y el oráculo los da en texto. Aquí se
 * decodifican para poder emparejarlos, que es lo único que se hace con ellos.
 */
function decodeName(name) {
  const bytes = Array.isArray(name) ? name : Array.isArray(name?.bytes) ? name.bytes : null;
  if (bytes) return new TextDecoder("utf-8").decode(new Uint8Array(bytes)).replace(/\0+$/, "");
  return typeof name === "string" ? name : "";
}

/**
 * Contrasta una hipótesis «el bit `position` significa `predicate`» contra
 * todas las observaciones. Devuelve el recuento y, sobre todo, si la hipótesis
 * es SEPARABLE: sin un positivo y un negativo el acierto no significa nada.
 */
function testBit(observations, position, expected) {
  const mask = 1 << position;
  let agree = 0;
  let positives = 0;
  let negatives = 0;
  const mismatches = [];
  for (const o of observations) {
    const bit = (o.stateFlags & mask) !== 0;
    const truth = expected(o);
    if (truth) positives += 1;
    else negatives += 1;
    if (bit === truth) agree += 1;
    else if (mismatches.length < 10)
      mismatches.push({
        version: o.version,
        archivo: o.archivo,
        capa: o.capa,
        stateFlags: o.stateFlags,
        bitLeido: bit,
        oraculo: truth,
      });
  }
  return {
    posicion: position,
    aciertos: agree,
    observaciones: observations.length,
    casosPositivos: positives,
    casosNegativos: negatives,
    // Un bit constante acierta o falla en bloque y no falsa nada. Se nombra
    // aquí para que no pueda colarse como confirmación.
    separable: positives > 0 && negatives > 0,
    concuerdaSiempre: agree === observations.length,
    discrepancias: mismatches,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;

  const { readDwg } = await import(pathToFileURL(path.join(DIST, "index.js")).href);

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    // Sin corpus no se mide nada. En `--check` eso NO es un fallo: el gate
    // corre en máquinas sin credencial ni espejo. El generador sí falla:
    // producir evidencia exige los bytes.
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-layer-state-flags --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-layer-state-flags: ${message}\n`);
    process.exit(1);
  }

  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bytesOf = (artifact) => new Uint8Array(transport.readFile(pin.commit, artifact.path));
  const textOf = (artifact) =>
    new TextDecoder("latin1").decode(new Uint8Array(transport.readFile(pin.commit, artifact.path)));

  const observations = [];
  const archivos = [];
  const sinOraculo = [];

  for (const bundle of corpus.bundles) {
    const fixtures = bundle.artifacts.filter(
      (a) => a.kind === "fixtures" && a.path.endsWith(".dwg"),
    );
    const oracles = new Map(
      bundle.artifacts
        .filter((a) => a.path.endsWith(".dxf"))
        .map((a) => [path.basename(a.path, ".dxf"), a]),
    );
    for (const artifact of fixtures) {
      const stem = path.basename(artifact.path, ".dwg");
      const record = {
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        fixture: artifact.path,
        sha256: artifact.sha256,
      };
      archivos.push(record);
      const oracle = oracles.get(stem);
      if (!oracle) {
        record.omitido = "sin oráculo DXF con el mismo nombre";
        sinOraculo.push(`${bundle.dwgVersion}/${stem}`);
        continue;
      }
      try {
        const expected = parseOracleDxf(textOf(oracle));
        // `parseOracleDxf` (importado sin modificar) entrega una LISTA; el
        // índice por nombre se arma aquí, sin tocar el helper compartido.
        const oracleLayers = new Map(expected.layers.map((l) => [l.name.toUpperCase(), l]));
        const database = readDwg(bytesOf(artifact));
        let capasComparadas = 0;
        const noEmparejadas = [];
        for (const layer of database.layers ?? []) {
          const capa = decodeName(layer.name);
          const truth = oracleLayers.get(capa.toUpperCase());
          if (!truth) {
            noEmparejadas.push(capa);
            continue;
          }
          if (layer.stateFlags === undefined) continue;
          capasComparadas += 1;
          observations.push({
            version: bundle.dwgVersion,
            archivo: stem,
            capa,
            stateFlags: layer.stateFlags,
            congeladaSegunOraculo: (truth.flags & DXF_FROZEN) !== 0,
            bloqueadaSegunOraculo: (truth.flags & DXF_LOCKED) !== 0,
            // El oráculo apaga una capa con color NEGATIVO. En este corpus no
            // ocurre ni una vez, y por eso «apagada» no se mide ni se afirma.
            apagadaSegunOraculo: truth.color < 0,
          });
        }
        record.capasComparadas = capasComparadas;
        if (noEmparejadas.length) record.capasSinOraculo = noEmparejadas;
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  const frozenBits = [];
  const lockedBits = [];
  for (let position = 0; position < BIT_POSITIONS; position += 1) {
    frozenBits.push(testBit(observations, position, (o) => o.congeladaSegunOraculo));
    lockedBits.push(testBit(observations, position, (o) => o.bloqueadaSegunOraculo));
  }
  const winners = (candidates) =>
    candidates.filter((c) => c.concuerdaSiempre && c.separable).map((c) => c.posicion);
  const constantes = [];
  for (let position = 0; position < BIT_POSITIONS; position += 1) {
    const mask = 1 << position;
    const values = new Set(observations.map((o) => ((o.stateFlags & mask) !== 0 ? 1 : 0)));
    if (values.size === 1 && observations.length > 0)
      constantes.push({ posicion: position, valor: [...values][0] });
  }

  const bitCongelada = winners(frozenBits);
  const bitBloqueada = winners(lockedBits);
  const apagadasObservadas = observations.filter((o) => o.apagadaSegunOraculo).length;
  const medido = bitCongelada.length === 1 && bitBloqueada.length === 1 && observations.length > 0;

  const veredicto = medido
    ? `Sobre ${observations.length} capas de ${archivos.filter((a) => !a.omitido && !a.error).length} fixtures en ${new Set(observations.map((o) => o.version)).size} versiones, el bit ${bitCongelada[0]} de stateFlags vale 1 EXACTAMENTE cuando el oráculo DXF declara la capa congelada, y el bit ${bitBloqueada[0]} exactamente cuando la declara bloqueada. Ningún otro bit separa ninguno de los dos hechos. Los bits ${constantes.map((c) => c.posicion).join(", ")} son CONSTANTES en todo el corpus y por eso no se les atribuye significado.`
    : `NO se sostiene una semántica única: congelada ${JSON.stringify(bitCongelada)}, bloqueada ${JSON.stringify(bitBloqueada)} sobre ${observations.length} capas. No se interpreta ninguna bandera.`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-layer-state-flags:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-layer-state-flags-v1",
    generadoPor: "node scripts/dwg/probe-layer-state-flags.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Sólo las banderas CONGELADA y BLOQUEADA de la tabla LAYER, sobre los fixtures del corpus admitido que tienen oráculo DXF con el mismo nombre. No cubre «capa apagada», que en DXF se codifica con color negativo y NO aparece ni una vez en este corpus.",
    metodo:
      "Para cada posición de bit 0..15 se contrasta «este bit vale 1 exactamente cuando el oráculo lo declara» contra TODAS las capas observadas. Un bit se declara medido sólo si acierta siempre Y es separable, es decir si hay al menos un caso positivo y uno negativo: un bit constante acierta en bloque sin falsar nada. El oráculo es el DXF fuente del mismo dibujo, leído con el helper del repo importado sin modificar.",
    limiteDeLaEvidencia:
      "Los casos positivos vienen de un solo dibujo del corpus, `04-capas`, que es el único con capas congeladas o bloqueadas; lo que multiplica la evidencia son las cinco versiones y las capas normales de los demás dibujos, que aportan los negativos. El corpus entero es salida del ODA File Converter desde un DXF fuente propio, así que lo medido es cómo ESE productor codifica el estado; sigue sin haber un DWG producido por AutoCAD. La posición del bit de bloqueo NO coincide con la del DXF (grupo 70 usa el valor 4), de modo que reutilizar la convención del DXF habría dado un resultado equivocado.",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
      bundles: [...new Set(archivos.map((a) => a.bundle))],
    },
    resumen: {
      fixtures: archivos.length,
      fixturesSinOraculo: sinOraculo.length,
      capasObservadas: observations.length,
      versiones: [...new Set(observations.map((o) => o.version))].sort(),
      capasCongeladas: observations.filter((o) => o.congeladaSegunOraculo).length,
      capasBloqueadas: observations.filter((o) => o.bloqueadaSegunOraculo).length,
      capasApagadas: apagadasObservadas,
      bitCongelada,
      bitBloqueada,
      bitsConstantes: constantes,
      medido,
    },
    hipotesisPorBit: {
      congelada: frozenBits,
      bloqueada: lockedBits,
    },
    archivos,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const w = (s) => process.stdout.write(`${s}\n`);

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-layer-state-flags --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-layer-state-flags --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(report.resumen)}\n`);
      process.exit(1);
    }
    w(`probe-layer-state-flags --check: la evidencia coincide (${observations.length} capas).`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-layer-state-flags: ${archivos.length} fixture(s) · ${observations.length} capas comparadas`);
  w(`  congeladas segun oraculo : ${report.resumen.capasCongeladas}`);
  w(`  bloqueadas segun oraculo : ${report.resumen.capasBloqueadas}`);
  w(`  bit congelada            : ${JSON.stringify(bitCongelada)}`);
  w(`  bit bloqueada            : ${JSON.stringify(bitBloqueada)}`);
  w(`  bits constantes          : ${constantes.map((c) => `${c.posicion}=${c.valor}`).join(" ")}`);
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos) {
    if (record.error) w(`  FALLO ${record.version}/${record.archivo}: ${JSON.stringify(record.error)}`);
  }
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-layer-state-flags abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
