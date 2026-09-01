#!/usr/bin/env node
/**
 * SONDA: QUÉ 3D HEREDADO EJERCE DE VERDAD EL CORPUS ADMITIDO.
 *
 * QUÉ PROBLEMA RESUELVE. `ADR-0009 §9.3` lleva la fila «Fidelidad medida
 * contra corpus admitido» en ☐ PENDIENTE, esperando la admisión de la ola 3
 * del repo hermano. Eso era cierto cuando se escribió y hoy NO lo es: el gate
 * de corpus (`validate-corpus.mjs`) ya compara las cuatro clases 3D heredadas
 * —3DFACE, POLYLINE 3D, POLYLINE MESH, POLYLINE PFACE— contra el oráculo DXF
 * del mismo dibujo, con XYZ completo, y sale sin discrepancias. El dato
 * estaba, pero enterrado en una matriz de 39 tipos donde nadie lo miraba, así
 * que la fila del checklist siguió diciendo que faltaba.
 *
 * POR QUÉ UNA SONDA APARTE Y NO SÓLO UNA CORRECCIÓN DEL DOCUMENTO. Porque el
 * número que importa para firmar el perfil no es «0 discrepancias» —eso ya lo
 * dice el gate— sino QUÉ CASOS se ejercen y cuáles no. Un corpus puede tener
 * cero discrepancias porque acierta en todo o porque no prueba casi nada, y
 * desde la matriz agregada esas dos situaciones se ven igual. Esta sonda
 * separa las dos mitades:
 *
 *   - la CONCORDANCIA, campo a campo contra el oráculo (la mitad que ya se
 *     medía, aquí aislada para que se vea);
 *   - la COBERTURA por dimensión, con lo cubierto Y lo NO cubierto declarado
 *     con nombre propio, que es lo que el titular necesita para decidir si
 *     firma `DWG_3D_WIREFRAME_BETA_AUTHORIZATION` o espera a la ola 3.
 *
 * ESTA SONDA NO MUEVE NINGUNA FIRMA. `ownerSigned` sigue siendo del titular;
 * aquí sólo se mide y se declara.
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
import { expectedFromOracle, parseOracleDxf } from "./dxf-oracle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-3d-legacy-coverage.json",
);
const DIST = path.join(REPO_ROOT, "packages", "dwg-codec", "dist");

/** Las cuatro clases del perfil `AC1015_3D_WIREFRAME_V1` propuesto. */
const LEGACY_3D = new Set(["face3d", "polyline3d", "polymesh", "polyfaceMesh"]);

/**
 * Redondeo antes de comparar. Las dos orillas nacen del MISMO dibujo pero por
 * caminos distintos —bits del DWG contra texto del DXF—, así que comparar
 * dobles crudos declararía distinta una coordenada que sólo difiere en el
 * último bit de la representación decimal. Nueve decimales están muy por
 * encima de la precisión que cualquiera de los dos formatos promete.
 */
const round = (n) => (typeof n === "number" ? Number(n.toFixed(9)) : n);
const norm = (value) =>
  Array.isArray(value) ? value.map(norm) : round(value);

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
 * La entidad 3D del laboratorio en el MISMO vocabulario que usa el oráculo.
 * Es a propósito la misma proyección que `validate-corpus.mjs`: dos criterios
 * distintos de «qué campos define un 3DFACE» divergirían sin que nada lo viera.
 */
function projectDecoded(entity, vertexRecords) {
  const vs = vertexRecords.map((v) => v.entity);
  const of = (kind) => vs.filter((v) => v.kind === kind);
  switch (entity.kind) {
    case "face3d":
      return {
        corners: entity.corners.map((c) => [c.x, c.y, c.z]),
        invisibility: entity.invisibilityFlags,
      };
    case "polyline3d":
      return {
        closed: (entity.closedFlags & 1) === 1,
        vertices: of("vertex3d").map((v) => [v.position.x, v.position.y, v.position.z]),
      };
    case "polymesh":
      return {
        mSize: entity.mVertexCount,
        nSize: entity.nVertexCount,
        vertices: of("vertexMesh").map((v) => [v.position.x, v.position.y, v.position.z]),
      };
    case "polyfaceMesh":
      return {
        vertices: of("vertexPface").map((v) => [v.position.x, v.position.y, v.position.z]),
        faces: of("pfaceFace").map((v) => [v.index1, v.index2, v.index3, v.index4]),
      };
    default:
      return null;
  }
}

/**
 * Comparación como MULTICONJUNTO, no por posición. Un archivo con dos 3DFACE
 * no promete que el DWG y el DXF los entreguen en el mismo orden, y exigirlo
 * inventaría una discrepancia donde sólo hay otro orden.
 */
function compareSets(decoded, expected) {
  const key = (x) => JSON.stringify(norm(x));
  const left = decoded.map(key).sort();
  const right = expected.map(key).sort();
  return {
    coinciden: left.length === right.length && left.every((v, i) => v === right[i]),
    decodificadas: left.length,
    esperadas: right.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const outIndex = args.indexOf("--out");
  const outFile =
    outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const w = (line) => process.stdout.write(`${line}\n`);

  const { readDwg } = await import(pathToFileURL(path.join(DIST, "index.js")).href);

  const pin = loadCorpusPin();
  const { transport } = resolveCorpusSource({ pin });
  if (!transport) {
    // Sin corpus no se mide nada. En `--check` eso NO es un fallo: el gate
    // corre en máquinas sin credencial ni espejo. El generador sí falla:
    // producir evidencia exige los bytes.
    const message = `sin origen de corpus (ni ${pin.mirrorEnv} ni ${pin.credentialEnv}); no hay nada que medir y no se afirma nada.`;
    if (checkOnly) {
      w(`probe-3d-legacy-coverage --check: ${message}`);
      return;
    }
    process.stderr.write(`probe-3d-legacy-coverage: ${message}\n`);
    process.exit(1);
  }

  const corpus = fetchAdmittedCorpus({ pin, transport });
  const bytesOf = (a) => new Uint8Array(transport.readFile(pin.commit, a.path));
  const textOf = (a) =>
    new TextDecoder("latin1").decode(new Uint8Array(transport.readFile(pin.commit, a.path)));

  const entidades = [];
  const archivos = [];
  let concordantes = 0;
  let comparadas = 0;

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
      let database;
      try {
        database = readDwg(bytesOf(artifact));
      } catch (error) {
        archivos.push({
          bundle: bundle.id,
          version: bundle.dwgVersion,
          archivo: stem,
          error: error?.message ?? String(error),
        });
        continue;
      }
      const records = (database.modelSpaceEntities ?? []).filter((r) =>
        LEGACY_3D.has(r.entity?.kind),
      );
      if (records.length === 0) continue;

      const oracle = oracles.get(stem);
      const esperadas = oracle
        ? parseOracleDxf(textOf(oracle))
            .topEntities.map(expectedFromOracle)
            .filter((e) => e && LEGACY_3D.has(e.kind))
        : null;

      const porClase = new Map();
      for (const r of records) {
        const proyectada = projectDecoded(r.entity, r.vertices ?? []);
        if (!porClase.has(r.entity.kind)) porClase.set(r.entity.kind, []);
        porClase.get(r.entity.kind).push(proyectada);
        entidades.push({
          version: bundle.dwgVersion,
          archivo: stem,
          clase: r.entity.kind,
          handle: r.handle,
          campos: norm(proyectada),
        });
      }

      const clases = {};
      for (const [clase, decodificadas] of porClase) {
        if (!esperadas) {
          clases[clase] = { sinOraculo: true, decodificadas: decodificadas.length };
          continue;
        }
        const cmp = compareSets(
          decodificadas,
          esperadas.filter((e) => e.kind === clase).map((e) => e.fields),
        );
        clases[clase] = cmp;
        comparadas += cmp.decodificadas;
        if (cmp.coinciden) concordantes += cmp.decodificadas;
      }
      archivos.push({
        bundle: bundle.id,
        version: bundle.dwgVersion,
        archivo: stem,
        sha256: artifact.sha256,
        conOraculo: Boolean(oracle),
        clases,
      });
    }
  }

  // ─── COBERTURA: lo cubierto Y lo que NO, con nombre propio ───────────────
  // La lista de dimensiones sale de lo que `ADR-0009 §9.2` dice que la ola 3
  // aportaría. Cada una se comprueba contra lo REALMENTE observado, no contra
  // lo que el documento supone.
  const face3d = entidades.filter((e) => e.clase === "face3d");
  const polyline3d = entidades.filter((e) => e.clase === "polyline3d");
  const polymesh = entidades.filter((e) => e.clase === "polymesh");
  const pface = entidades.filter((e) => e.clase === "polyfaceMesh");
  const banderas = [...new Set(face3d.map((e) => e.campos.invisibility))].sort((a, b) => a - b);
  const zPorVertice = polyline3d.some(
    (e) => new Set(e.campos.vertices.map((v) => v[2])).size > 1,
  );
  const mallas = polymesh.map((e) => `${e.campos.mSize}x${e.campos.nSize}`);
  const indicesNegativos = pface.some((e) => e.campos.faces.some((f) => f.some((i) => i < 0)));
  const cerradas = [...new Set(polyline3d.map((e) => e.campos.closed))];

  // TRES ESTADOS, NO DOS. Un booleano obligaría a llamar «cubierta» a una
  // dimensión que se ejerce una vez de seis, y una casilla marcada junto a un
  // texto que dice qué falta se lee mal justo donde más importa: este fichero
  // existe para que el titular decida de un vistazo si firma o espera.
  const dim = (dimension, estado, observado, faltante = null) => ({
    dimension,
    estado,
    observado,
    faltante,
  });
  const cobertura = [
    dim(
      "3DFACE con Z real en las esquinas",
      face3d.some((e) => e.campos.corners.some((c) => c[2] !== 0)) ? "completo" : "ausente",
      face3d.map((e) => e.campos.corners.map((c) => c[2])),
    ),
    dim(
      "3DFACE: combinaciones de banderas de arista invisible",
      banderas.length >= 6 ? "completo" : banderas.length >= 2 ? "parcial" : "ausente",
      banderas,
      banderas.length >= 6
        ? null
        : `sólo ${banderas.length} de las 6 combinaciones posibles; falta también el caso degenerado (triángulo)`,
    ),
    dim(
      "POLYLINE 3D con Z distinta por vértice",
      zPorVertice ? "completo" : "ausente",
      polyline3d.map((e) => e.campos.vertices.map((v) => v[2])),
    ),
    dim(
      "POLYLINE 3D abierta y cerrada",
      cerradas.length >= 2 ? "completo" : cerradas.length === 1 ? "parcial" : "ausente",
      cerradas,
      cerradas.length >= 2 ? null : `sólo se observa closed=${cerradas.join("/")}`,
    ),
    dim(
      "POLYLINE MESH: tamaños de malla",
      mallas.length > 1 ? "completo" : mallas.length === 1 ? "parcial" : "ausente",
      mallas,
      mallas.length > 1 ? null : "una sola malla; sin caso cerrado en N ni mallas mayores",
    ),
    dim(
      "POLYFACE con índice NEGATIVO (arista invisible)",
      indicesNegativos ? "completo" : "ausente",
      pface.map((e) => e.campos.faces),
      indicesNegativos ? null : "ningún índice negativo en el corpus admitido",
    ),
  ];

  const cubiertas = cobertura.filter((c) => c.estado === "completo").length;
  const parciales = cobertura.filter((c) => c.estado === "parcial").length;
  const versiones = [...new Set(entidades.map((e) => e.version))].sort();
  const resumen = {
    fixturesCon3D: archivos.filter((a) => !a.error).length,
    entidades3D: entidades.length,
    porClase: Object.fromEntries(
      [...LEGACY_3D].map((k) => [k, entidades.filter((e) => e.clase === k).length]),
    ),
    versiones,
    concordanciaConOraculo: `${concordantes}/${comparadas}`,
    dimensionesCompletas: `${cubiertas}/${cobertura.length}`,
    dimensionesParciales: parciales,
    dimensionesAusentes: cobertura.length - cubiertas - parciales,
    medido: comparadas > 0 && concordantes === comparadas,
  };

  const veredicto =
    comparadas === 0
      ? "El corpus admitido no trae 3D heredado con oráculo: no se afirma nada."
      : `El decodificador reproduce ${concordantes}/${comparadas} entidades 3D heredadas del corpus ADMITIDO campo a campo contra el oráculo DXF (${versiones.join(", ")}). Cobertura de casos: ${cubiertas}/${cobertura.length} dimensiones completas, ${parciales} parcial(es), ${cobertura.length - cubiertas - parciales} ausente(s).`;

  const report = {
    $schema: "urn:valle-design:schema:dwg-3d-legacy-coverage:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-dwg-3d-legacy-coverage-v1",
    generadoPor: "node scripts/dwg/probe-3d-legacy-coverage.mjs",
    generadoEn: new Date().toISOString(),
    environment: environment(),
    veredicto,
    alcance:
      "Sólo las cuatro clases 3D heredadas del perfil AC1015_3D_WIREFRAME_V1 propuesto (3DFACE, POLYLINE 3D, POLYLINE MESH, POLYLINE PFACE), sobre los fixtures del corpus ADMITIDO que tienen oráculo DXF con el mismo nombre.",
    metodo:
      "Cada entidad se proyecta al mismo vocabulario por los dos caminos —bits del DWG por el laboratorio, texto del DXF por el oráculo— y se comparan como MULTICONJUNTO por clase, para no exigir un orden que ninguno de los dos formatos promete. Aparte, se comprueba dimensión a dimensión QUÉ CASOS ejerce el corpus, porque cero discrepancias sobre un corpus que no prueba casi nada se vería igual que cero discrepancias sobre uno exigente.",
    limiteDeLaEvidencia:
      "El 3D heredado del corpus admitido es REAL pero DELGADO: una instancia por clase salvo 3DFACE, que tiene dos. La ola 3 del repo hermano (valle-design-dwg-conformance#6, SIN ADMITIR) es la que aportaría las seis combinaciones de banderas de arista, el 3DFACE degenerado, las mallas 7x9 y 5x5 cerrada en N, y el polyface con índices negativos. Esta sonda NO sustituye esa admisión: la mide y declara lo que falta. Tampoco mueve ninguna firma: DWG_3D_WIREFRAME_BETA_AUTHORIZATION.ownerSigned sigue siendo del titular.",
    corpus: {
      commit: corpus.commit,
      indexSha256: corpus.indexSha256,
      transporte: corpus.transport,
    },
    resumen,
    cobertura,
    archivos,
    entidades,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (checkOnly) {
    if (!fs.existsSync(outFile)) {
      process.stderr.write(
        `probe-3d-legacy-coverage --check: falta ${path.relative(REPO_ROOT, outFile)}\n`,
      );
      process.exit(1);
    }
    const previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const same =
      JSON.stringify(previous.resumen) === JSON.stringify(report.resumen) &&
      JSON.stringify(previous.cobertura) === JSON.stringify(report.cobertura) &&
      previous.veredicto === report.veredicto;
    if (!same) {
      process.stderr.write(
        "probe-3d-legacy-coverage --check: la evidencia committeada no coincide con la medición de este árbol.\n",
      );
      process.stderr.write(`  committeada: ${JSON.stringify(previous.resumen)}\n`);
      process.stderr.write(`  medida     : ${JSON.stringify(resumen)}\n`);
      process.exit(1);
    }
    w(
      `probe-3d-legacy-coverage --check: la evidencia coincide (${entidades.length} entidades 3D).`,
    );
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, serialized, "utf8");
  w(`probe-3d-legacy-coverage: ${entidades.length} entidades 3D heredadas en ${resumen.fixturesCon3D} fixture(s)`);
  w(`  concordancia con el oráculo : ${resumen.concordanciaConOraculo}`);
  w(`  por clase                   : ${JSON.stringify(resumen.porClase)}`);
  for (const c of cobertura)
    w(
      `  ${{ completo: "[x]", parcial: "[~]", ausente: "[ ]" }[c.estado]} ${c.dimension}${c.faltante ? ` — FALTA: ${c.faltante}` : ""}`,
    );
  w(`veredicto: ${veredicto}`);
  w(`evidencia: ${path.relative(REPO_ROOT, outFile)}`);
  for (const record of archivos)
    if (record.error) w(`  FALLO ${record.version}/${record.archivo}: ${record.error}`);
}

main().catch((error) => {
  if (error instanceof DwgCorpusGateError) {
    process.stderr.write(
      `probe-3d-legacy-coverage abortado por el gate del corpus: ${error.message}\n`,
    );
    process.exit(1);
  }
  throw error;
});
