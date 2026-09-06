/**
 * ORÁCULO D contra `geo.crs`: PROJ (envuelto por `pyproj`) reproyecta la MISMA
 * malla de control de México que `crs.spec.ts` usa, y aquí se compara lo que
 * PROJ midió contra lo que produce hoy `apps/web/src/lib/geo/crs.ts`.
 *
 * ## Por qué esto es distinto de `crs.spec.ts`
 *
 * `crs.spec.ts` es excelente y tiene un límite que declara con todas sus
 * letras: sus tres caminos independientes (cuadratura de Gauss-Legendre,
 * serie de Snyder, diferencias finitas) los escribe y los ejecuta ESTE
 * repositorio. Es la misma clase de honestidad que `verification/oracle.ts` —
 * verifica de verdad, pero «lo comprobamos aparte» no es «lo comprobó otro».
 * La regla del corte del 2026-08-22 retiene 1 punto de la fila `geo` hasta que
 * exista un oráculo EXTERNO, material de terceros o un usuario real.
 *
 * Este spec no repite la comprobación de `crs.spec.ts`: la complementa con el
 * único ingrediente que le faltaba. PROJ es la implementación de referencia
 * del mundo GIS, mantenida por OSGeo, sin una línea de código en común con
 * `crs.ts`. La medición está CONGELADA en
 * `docs/cad/corpus/oraculos/pyproj-3.7.2.json` (generada por
 * `docs/cad/corpus/oraculos/censo-pyproj.py`), y este spec la vuelve a
 * comprobar contra el producto de hoy, y —si `pyproj` está instalada en esta
 * máquina— vuelve a ejecutar el censo y exige los mismos bytes.
 *
 * ## El límite, dicho antes de usarlo
 *
 * PROJ resuelve la transversa de Mercator con el mismo linaje matemático que
 * Karney (2011) —series de Krüger-Engsager-Poder de orden alto—, igual que
 * `crs.ts`. Una coincidencia aquí acredita OTRA IMPLEMENTACIÓN, en otro
 * lenguaje, escrita por otras personas; NO acredita OTRO MÉTODO matemático,
 * que es lo que Snyder y la cuadratura ya prueban dentro de `crs.spec.ts`. Los
 * dos oráculos se complementan; ninguno sustituye al otro.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { geodeticToUtm, geoUtmCrs, geoUtmZoneForLongitude, type GeoUtmCrs } from "./crs";

const RAIZ = path.resolve(process.cwd(), "../..");
const ARTEFACTO = path.join(RAIZ, "docs/cad/corpus/oraculos/pyproj-3.7.2.json");
const CENSO = path.join(RAIZ, "docs/cad/corpus/oraculos/censo-pyproj.py");
const HERRAMIENTAS = path.join(RAIZ, "docs/cad/corpus/oraculos/HERRAMIENTAS.md");
const LICENCIA = path.join(RAIZ, "docs/cad/corpus/oraculos/licencias/pyproj-3.7.2-MIT.txt");
const LICENCIA_PROJ = path.join(RAIZ, "docs/cad/corpus/oraculos/licencias/pyproj-3.7.2-bundled-PROJ-MIT.txt");

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

interface GridPoint {
  lonDeg: number;
  latDeg: number;
  zone: number;
  epsg: string;
  easting: number;
  northing: number;
}

interface Censo {
  oraculo: string;
  herramienta: { nombre: string; version: string; licencia: string; sha256Rueda: string; sha256Licencia: string };
  grid: { definicion: { latMinDeg: number; latMaxDeg: number; lonMinDeg: number; lonMaxDeg: number; stepDeg: number }; puntos: number; resultados: GridPoint[] };
  naturalEarth: { puntosEnRangoMexico: number; resultados: Array<GridPoint & { numeroRegistro: number }> };
}

ok(fs.existsSync(ARTEFACTO), `no existe ${path.relative(RAIZ, ARTEFACTO)}: corre censo-pyproj.py primero`);
const censo = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as Censo;

ok(censo.herramienta.nombre === "pyproj", "el censo congelado no dice pyproj");
ok(censo.herramienta.licencia === "MIT", "el censo congelado declara otra licencia");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 1 · El anclaje: la licencia y la rueda dicen lo mismo en dos sitios
// ─────────────────────────────────────────────────────────────────────────────

const registro = fs.readFileSync(HERRAMIENTAS, "utf8");
ok(registro.includes(censo.herramienta.sha256Rueda), "HERRAMIENTAS.md no registra el sha256 de la rueda de pyproj");
ok(registro.includes(censo.herramienta.sha256Licencia), "HERRAMIENTAS.md no registra el sha256 de la licencia MIT de pyproj");
ok(fs.existsSync(LICENCIA), "falta el texto de licencia de pyproj descargado");
ok(fs.existsSync(LICENCIA_PROJ), "falta el texto de licencia de PROJ (empaquetado dentro de la rueda de pyproj)");
const licenciaTexto = fs.readFileSync(LICENCIA, "utf8");
ok(licenciaTexto.includes("Jeffrey Whitaker"), "el aviso de copyright del titular de pyproj no viaja con la licencia");
ok(licenciaTexto.includes("Permission is hereby granted"), "el texto guardado no es una licencia MIT");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 2 · La MISMA malla que crs.spec.ts, regenerada aquí con su fórmula
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copia deliberada de `mexicoControlGrid()` en `crs.spec.ts`. No se importa de
 * allí —es un fichero de test, no un módulo del producto— y se reproduce aquí
 * la MISMA fórmula para que el censo de Python y este spec partan del mismo
 * juego de puntos sin que ninguno de los dos lo invente.
 */
function mexicoControlGrid(stepDeg = 1): Array<{ longitudeDeg: number; latitudeDeg: number; zone: number }> {
  const points: Array<{ longitudeDeg: number; latitudeDeg: number; zone: number }> = [];
  for (let latitude = 14; latitude <= 33; latitude += stepDeg)
    for (let longitude = -118; longitude <= -86; longitude += stepDeg)
      points.push({ longitudeDeg: longitude, latitudeDeg: latitude, zone: geoUtmZoneForLongitude(longitude) });
  return points.filter((point) => point.zone >= 11 && point.zone <= 16);
}

const grid = mexicoControlGrid();
ok(
  grid.length === censo.grid.puntos,
  `la malla regenerada tiene ${grid.length} puntos y el censo congelado ${censo.grid.puntos}: alguien cambió la fórmula en un lado y no en el otro`,
);
ok(censo.grid.definicion.latMinDeg === 14 && censo.grid.definicion.lonMinDeg === -118, "el censo describe otra malla");

/** Tolerancia: 1 mm. El peor error medido entre crs.ts y PROJ es ~0,06 mm (Acto 4 lo mide de nuevo). */
const TOLERANCIA_M = 1e-3;

const crsCache = new Map<number, GeoUtmCrs>();
const crsFor = (zone: number) => {
  let crs = crsCache.get(zone);
  if (!crs) {
    crs = geoUtmCrs(zone);
    crsCache.set(zone, crs);
  }
  return crs;
};

let worstGridErrorM = 0;
for (const punto of censo.grid.resultados) {
  const resultado = geodeticToUtm(punto.lonDeg, punto.latDeg, crsFor(punto.zone));
  const error = Math.hypot(resultado.easting - punto.easting, resultado.northing - punto.northing);
  worstGridErrorM = Math.max(worstGridErrorM, error);
  ok(
    error <= TOLERANCIA_M,
    `(${punto.lonDeg}, ${punto.latDeg}) zona ${punto.zone}N: crs.ts da (${resultado.easting}, ${resultado.northing}), ` +
      `PROJ dio (${punto.easting}, ${punto.northing}); ${error} m > ${TOLERANCIA_M} m`,
  );
}
ok(worstGridErrorM <= TOLERANCIA_M, `el peor error de la malla contra PROJ es ${worstGridErrorM} m`);

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 3 · El shapefile ajeno: los mismos 13 puntos de Natural Earth
// ─────────────────────────────────────────────────────────────────────────────

ok(censo.naturalEarth.puntosEnRangoMexico === censo.naturalEarth.resultados.length, "el resumen no cuadra con la lista");
ok(censo.naturalEarth.resultados.length >= 10, "muy pocos puntos de Natural Earth caen en el dominio de México");

let worstNaturalEarthErrorM = 0;
for (const punto of censo.naturalEarth.resultados) {
  const resultado = geodeticToUtm(punto.lonDeg, punto.latDeg, crsFor(punto.zone));
  const error = Math.hypot(resultado.easting - punto.easting, resultado.northing - punto.northing);
  worstNaturalEarthErrorM = Math.max(worstNaturalEarthErrorM, error);
  ok(
    error <= TOLERANCIA_M,
    `Natural Earth #${punto.numeroRegistro} (${punto.lonDeg}, ${punto.latDeg}): ${error} m > ${TOLERANCIA_M} m`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 4 · Si `pyproj` está en esta máquina, vuelve a correr el censo
// ─────────────────────────────────────────────────────────────────────────────

function pyprojDisponible(): boolean {
  const resultado = spawnSync("python3", ["-c", "import pyproj; print(pyproj.__version__)"], { encoding: "utf8" });
  return resultado.status === 0 && resultado.stdout.trim() === censo.herramienta.version;
}

const exigido = process.env.VALLE_ORACULO_PYPROJ === "1";
const hay = pyprojDisponible();
if (exigido && !hay) {
  throw new Error(
    "VALLE_ORACULO_PYPROJ=1 exige reejecutar el censo y `pyproj` no está en esta máquina. " +
      "Instálala con `pip install pyproj==3.7.2` o quita la variable.",
  );
}
let reejecutado = false;
if (hay) {
  const destino = path.join(os.tmpdir(), "valle-censo-pyproj-reejecutado.json");
  const corrida = spawnSync("python3", [CENSO, "--destino", destino], { cwd: RAIZ, encoding: "utf8" });
  assert.ok(corrida.status === 0, `el censo de pyproj no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
  assert.ok(
    fs.readFileSync(destino).equals(fs.readFileSync(ARTEFACTO)),
    "el censo de pyproj sobre la malla y el shapefile YA NO da los bytes comprometidos: revisa el diff antes de comprometer nada",
  );
  reejecutado = true;
} else {
  console.log(
    "  · oráculo D (`pyproj` 3.7.2): AUSENTE en esta máquina. La medición se usa congelada; " +
      "se reejecuta con `pip install pyproj==3.7.2`.",
  );
}

console.log(
  `crs-pyproj: ${comprobaciones} comprobaciones · ${censo.grid.puntos} puntos de malla contra PROJ ` +
    `(peor error ${worstGridErrorM.toExponential(2)} m) · ${censo.naturalEarth.resultados.length} puntos de ` +
    `Natural Earth contra PROJ (peor error ${worstNaturalEarthErrorM.toExponential(2)} m) · reejecutado: ${reejecutado}`,
);
