#!/usr/bin/env node
/**
 * SONDA: LA SEMÁNTICA DE LOS CAMPOS DE MTEXT, MEDIDA CONTRA EL ORÁCULO DXF.
 *
 * QUÉ PROBLEMA RESUELVE. El writer AC1015 emite MTEXT desde hace olas y el
 * decodificador lo lee entero, pero el camino PÚBLICO no lo escribía. El
 * motivo real no era el writer: era que `attachment` —el punto de la caja al
 * que se ancla la inserción— viaja como un número, y el hecho registrado de
 * la fuente (`ODA-ODS-DWG-5.4.1-PUBLIC`) documenta su DISPOSICIÓN («attachment
 * BS» en esa posición del cuerpo) pero NO qué significa cada valor. Escribir
 * un 1 «porque suele ser arriba-izquierda» habría sido adivinar una semántica,
 * que es exactamente lo que este laboratorio no hace.
 *
 * DÓNDE VIVE EL DATO. En el corpus admitido: cada fixture DWG tiene su DXF
 * fuente gemelo, y el DXF numera el punto de anclaje en el código 71 con una
 * semántica que el propio producto ya deriva de la especificación DXF pública
 * (`apps/web/src/lib/cad/dxf-export.ts`, `mtextAttachment`). Comparar los dos
 * lados del mismo dibujo mide la correspondencia sin consultar ninguna
 * implementación ajena.
 *
 * MÉTODO — SE PRUEBAN TODAS LAS CORRESPONDENCIAS, NO LA ESPERADA. Para cada
 * pareja (MTEXT del DWG, MTEXT del DXF) se evalúan varias hipótesis rivales de
 * mapeo —identidad, desplazamientos de ±1, la inversión 10-x y la constante 1—
 * y se acepta una sólo si acierta en TODAS las parejas Y si los valores
 * observados VARÍAN. Con un corpus que sólo usara el valor 1, la identidad y
 * la constante 1 acertarían igual: sin separabilidad no se afirma nada. Es la
 * misma disciplina de las sondas de banderas de capa y de tipo de línea.
 *
 * LA PAREJA NO SE SUPONE. Se emparejan por orden dentro del archivo, pero el
 * emparejamiento se COMPRUEBA con dos campos independientes del que se está
 * midiendo —altura (40) y ancho del rectángulo (41)—: si no coinciden, la
 * pareja se descarta en vez de contarse como acierto.
 *
 * COBERTURA, NO SÓLO ACIERTO. El informe declara qué valores de `attachment`
 * ejerce el corpus y cuáles NO: una correspondencia medida en dos valores no
 * es una correspondencia medida en nueve, y quien lea la evidencia tiene que
 * poder ver la diferencia.
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

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-mtext-fields.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");

/**
 * Las hipótesis rivales del mapeo `attachment` (DWG) ↔ código 71 (DXF). La
 * identidad es la candidata obvia; las demás existen para poder FALSARLA. Sin
 * rivales que puedan perder, «acierta» no significa nada.
 */
const HIPOTESIS = Object.freeze([
  { nombre: "identidad", aplicar: (dxf) => dxf },
  { nombre: "dxf+1", aplicar: (dxf) => dxf + 1 },
  { nombre: "dxf-1", aplicar: (dxf) => dxf - 1 },
  { nombre: "inversion-10-dxf", aplicar: (dxf) => 10 - dxf },
  { nombre: "constante-1", aplicar: () => 1 },
]);

/** Los nueve anclajes del DXF, con el nombre que usa el producto. */
const ANCLAJES = Object.freeze({
  1: "top-left",
  2: "top-center",
  3: "top-right",
  4: "middle-left",
  5: "middle-center",
  6: "middle-right",
  7: "bottom-left",
  8: "bottom-center",
  9: "bottom-right",
});

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
 * Los MTEXT del DXF fuente, en orden, con los códigos que esta sonda mide.
 * `parseOracleDxf` normaliza al modelo neutral y deja fuera 71/72/73/44 —no
 * los necesitaba nadie hasta ahora—, así que aquí se leen los pares crudos.
 */
function dxfMTexts(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let current = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1];
    if (code === "0") {
      if (current) out.push(current);
      current = value.trim() === "MTEXT" ? { texto: "" } : null;
      continue;
    }
    if (!current) continue;
    if (code === "1" || code === "3") current.texto += value;
    else if (code === "40") current.altura = Number.parseFloat(value);
    else if (code === "41") current.ancho = Number.parseFloat(value);
    else if (code === "71") current.anclaje = Number.parseInt(value, 10);
    else if (code === "72") current.direccion = Number.parseInt(value, 10);
    else if (code === "73") current.estiloInterlineado = Number.parseInt(value, 10);
    else if (code === "44") current.factorInterlineado = Number.parseFloat(value);
  }
  if (current) out.push(current);
  return out;
}

const cerca = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6;

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const outIndex = args.indexOf("--out");
  const outFile =
    outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;

  const { readDwg } = await import(pathToFileURL(path.join(DIST, "index.js")).href);

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    // Sin corpus no se mide nada. En `--check` eso NO es un fallo: el gate
    // corre en máquinas sin credencial ni espejo. El generador sí falla:
    // producir evidencia exige los bytes.
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      process.stdout.write(`probe-mtext-fields --check: ${message}\n`);
      return;
    }
    process.stderr.write(`probe-mtext-fields: ${message}\n`);
    process.exit(1);
  }

  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bytesOf = (a) => new Uint8Array(transport.readFile(pin.commit, a.path));
  const textOf = (a) =>
    new TextDecoder("latin1").decode(new Uint8Array(transport.readFile(pin.commit, a.path)));

  const parejas = [];
  const archivos = [];

  for (const bundle of corpus.bundles) {
    const oracles = new Map(
      bundle.artifacts
        .filter((a) => a.path.endsWith(".dxf"))
        .map((a) => [path.basename(a.path, ".dxf"), a]),
    );
    for (const artifact of bundle.artifacts.filter(
      (a) => a.kind === "fixtures" && a.path.endsWith(".dwg"),
    )) {
      const stem = path.basename(artifact.path, ".dwg");
      const oracle = oracles.get(stem);
      if (!oracle) continue;
      const esperados = dxfMTexts(textOf(oracle));
      // Sólo los dibujos que EJERCEN la clase entran en la medición. Un
      // archivo sin MTEXT no aporta ni acierto ni fallo: contarlo inflaría el
      // denominador con casos vacíos.
      if (esperados.length === 0) continue;
      const record = {
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        fixture: artifact.path,
        sha256: artifact.sha256,
        mtextsEnElDxf: esperados.length,
      };
      archivos.push(record);
      try {
        const database = readDwg(bytesOf(artifact));
        const leidos = (database.modelSpaceEntities ?? [])
          .map((r) => r.entity ?? r)
          .filter((e) => e?.kind === "mtext");
        record.mtextsEnElDwg = leidos.length;
        if (leidos.length !== esperados.length) {
          record.omitido = `el DWG trae ${leidos.length} MTEXT y el DXF ${esperados.length}: sin correspondencia uno a uno no se empareja nada`;
          continue;
        }
        for (let i = 0; i < leidos.length; i += 1) {
          const dwg = leidos[i];
          const dxf = esperados[i];
          // El emparejamiento por orden se COMPRUEBA con dos campos ajenos al
          // que se mide. Si no casan, la pareja no cuenta.
          const emparejada = cerca(dwg.height, dxf.altura) && cerca(dwg.rectWidth, dxf.ancho);
          parejas.push({
            archivo: stem,
            version: bundle.dwgVersion,
            indice: i,
            emparejada,
            comprobacionDePareja: {
              alturaDwg: dwg.height,
              alturaDxf: dxf.altura ?? null,
              anchoDwg: dwg.rectWidth,
              anchoDxf: dxf.ancho ?? null,
            },
            anclajeDwg: dwg.attachment,
            anclajeDxf: dxf.anclaje ?? null,
            direccionDwg: dwg.drawingDirection,
            direccionDxf: dxf.direccion ?? null,
            estiloInterlineadoDwg: dwg.lineSpacingStyle,
            estiloInterlineadoDxf: dxf.estiloInterlineado ?? null,
            factorInterlineadoDwg: dwg.lineSpacingFactor,
            factorInterlineadoDxf: dxf.factorInterlineado ?? null,
            extentsAltoDwg: dwg.extentsHeight,
            extentsAnchoDwg: dwg.extentsWidth,
            bitFinalDwg: dwg.trailingBit,
          });
        }
      } catch (error) {
        record.error = typedError(error);
      }
    }
  }

  const utiles = parejas.filter((p) => p.emparejada && p.anclajeDxf !== null);
  const valoresDxf = [...new Set(utiles.map((p) => p.anclajeDxf))].sort((a, b) => a - b);
  const valoresDwg = [...new Set(utiles.map((p) => p.anclajeDwg))].sort((a, b) => a - b);
  const separable = valoresDxf.length > 1;

  const hipotesis = HIPOTESIS.map((h) => {
    const aciertos = utiles.filter((p) => h.aplicar(p.anclajeDxf) === p.anclajeDwg).length;
    return {
      nombre: h.nombre,
      aciertos,
      comparadas: utiles.length,
      // Una hipótesis sólo SOBREVIVE si acierta en todas las parejas y si el
      // corpus pudo distinguirla de sus rivales.
      sobrevive: utiles.length > 0 && aciertos === utiles.length && separable,
    };
  });
  const supervivientes = hipotesis.filter((h) => h.sobrevive).map((h) => h.nombre);

  /** Un valor constante en todas las parejas es un hecho; si varía, no lo es. */
  const constante = (campo) => {
    const vistos = [...new Set(parejas.filter((p) => p.emparejada).map((p) => p[campo]))];
    return { valores: vistos, constante: vistos.length === 1, valor: vistos.length === 1 ? vistos[0] : null };
  };

  const anclajesEjercidos = valoresDxf.map((v) => ({ valor: v, nombre: ANCLAJES[v] ?? "desconocido" }));
  const anclajesSinEjercer = Object.keys(ANCLAJES)
    .map(Number)
    .filter((v) => !valoresDxf.includes(v))
    .map((v) => ({ valor: v, nombre: ANCLAJES[v] }));

  const medido = supervivientes.length === 1;
  const veredicto = medido
    ? `El anclaje de MTEXT se corresponde con el código 71 del DXF por ${supervivientes[0]}, medido en ${utiles.length} parejas con ${valoresDxf.length} valores distintos. El corpus ejerce ${anclajesEjercidos.map((a) => a.valor).join(" y ")}; los otros ${anclajesSinEjercer.length} valores NO están ejercidos y se declaran como tales.`
    : utiles.length === 0
      ? "Ninguna pareja utilizable: no se afirma ninguna correspondencia."
      : !separable
        ? `El corpus sólo usa el valor ${valoresDxf.join(",")} de anclaje: la identidad y la constante aciertan igual, así que NO se afirma correspondencia.`
        : `Sobreviven ${supervivientes.length} hipótesis (${supervivientes.join(", ") || "ninguna"}): no se afirma correspondencia.`;

  const report = {
    generadoPor: "scripts/dwg/probe-mtext-fields.mjs",
    corpus: { commit: pin.commit, origen: transport.kind ?? "espejo" },
    entorno: environment(),
    veredicto,
    resumen: {
      archivosConMText: archivos.length,
      parejas: parejas.length,
      parejasUtiles: utiles.length,
      valoresDeAnclajeDxf: valoresDxf,
      valoresDeAnclajeDwg: valoresDwg,
      separable,
      hipotesisSupervivientes: supervivientes,
      medido,
      anclajesEjercidos,
      anclajesSinEjercer,
      direccionDeDibujo: constante("direccionDwg"),
      estiloDeInterlineado: constante("estiloInterlineadoDwg"),
      factorDeInterlineado: constante("factorInterlineadoDwg"),
      extentsAlto: constante("extentsAltoDwg"),
      extentsAncho: constante("extentsAnchoDwg"),
      bitFinal: constante("bitFinalDwg"),
    },
    hipotesisDeAnclaje: hipotesis,
    parejas,
    archivos,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const w = (s) => process.stdout.write(`${s}\n`);

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-mtext-fields --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-mtext-fields --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(report.resumen)}\n`);
      process.exit(1);
    }
    w(`probe-mtext-fields --check: la evidencia coincide (${utiles.length} parejas útiles).`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-mtext-fields: ${archivos.length} archivo(s) con MTEXT · ${utiles.length} parejas útiles`);
  for (const h of hipotesis)
    w(`  ${h.nombre.padEnd(18)}: ${h.aciertos}/${h.comparadas} · sobrevive=${h.sobrevive}`);
  w(`  valores de anclaje ejercidos: ${valoresDxf.join(", ") || "-"}`);
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos)
    if (record.error) w(`  FALLO ${record.version}/${record.archivo}: ${JSON.stringify(record.error)}`);
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-mtext-fields abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
