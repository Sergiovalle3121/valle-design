/**
 * Paridad numérica de la reproyección, comprobada por CAMINOS INDEPENDIENTES.
 *
 * ## Por qué esta spec no se parece a las demás
 *
 * Probar una fórmula ejecutándola y comparando con lo que ella misma devolvió
 * la vez anterior no prueba nada: fija el comportamiento, incluido el
 * equivocado. Una reproyección mal calibrada que se desvía dos metros pasaría
 * ese examen todos los días.
 *
 * Aquí cada afirmación se contrasta con una cuenta que NO usa la serie de
 * Krüger de `crs.ts`:
 *
 *   1. ARCO DE MERIDIANO POR CUADRATURA. Sobre el meridiano central la
 *      proyección se reduce a la longitud del arco de meridiano multiplicada
 *      por k0. Esa longitud es una integral elíptica que se evalúa aquí por
 *      Gauss-Legendre de 24 nodos, sin serie ninguna. Si el radio rectificante
 *      o cualquiera de los seis coeficientes α estuviera mal, esta prueba lo
 *      caza en el primer decímetro.
 *   2. SERIE DE SNYDER. La transversa de Mercator clásica del USGS
 *      (Professional Paper 1395, ec. 8-9 a 8-11 y 3-21) está parametrizada en
 *      potencias de la excentricidad y truncada de otra manera. Dos series
 *      distintas que coinciden en submilímetro no coinciden por casualidad.
 *   3. CONFORMIDAD Y ESCALA POR DIFERENCIAS FINITAS. Una proyección conforme
 *      del elipsoide que lleva el meridiano central a una recta con escala
 *      constante k0 ES la transversa de Mercator; es un teorema, no una
 *      convención. Se comprueba derivando numéricamente la proyección y
 *      exigiendo que el jacobiano local sea una rotación por un escalar.
 *   4. CUARTO DE MERIDIANO PUBLICADO. La distancia del ecuador al polo sobre
 *      el elipsoide WGS84 es 10 001 965,729 m, un valor tabulado que no sale de
 *      este repositorio.
 *
 * Los puntos de control son la malla de México: 14°N a 33°N, 118°W a 86°W, que
 * es donde el producto promete resultados.
 */
import { strict as assert } from "node:assert";
import {
  GEO_CRS_WGS84,
  GEO_ELLIPSOID_GRS80,
  GEO_ELLIPSOID_WGS84,
  GEO_UTM_SCALE_FACTOR,
  geodeticToUtm,
  geoUtmCrs,
  geoUtmZoneForLongitude,
  parseGeoCrsWkt,
  reprojectGeoPoint,
  resolveGeoCrs,
  utmToGeodetic,
  type GeoEllipsoid,
} from "./crs";
import { GeoError } from "./errors";

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Camino independiente 1 — arco de meridiano por cuadratura de Gauss-Legendre
// ---------------------------------------------------------------------------

/**
 * Nodos y pesos de Gauss-Legendre de 24 puntos en [-1, 1].
 *
 * Tabulados (Abramowitz & Stegun, tabla 25.4). Con 24 nodos, una integral tan
 * suave como la del arco de meridiano converge a la precisión de la coma
 * flotante: el error de la cuadratura es varios órdenes de magnitud menor que
 * el submilímetro que se quiere medir, así que la cuadratura hace de patrón y
 * la serie de medida.
 */
const GAUSS_NODES = [
  0.064_056_892_862_605_6, 0.191_118_867_473_616_3, 0.315_042_679_696_163_4,
  0.433_793_507_626_045_1, 0.545_421_471_388_839_5, 0.648_093_651_936_975_6,
  0.740_124_191_578_554_4, 0.820_001_985_973_902_9, 0.886_415_527_004_401_0,
  0.938_274_552_002_732_8, 0.974_728_555_971_309_5, 0.995_187_219_997_021_4,
];
const GAUSS_WEIGHTS = [
  0.127_938_195_346_752_2, 0.125_837_456_346_828_3, 0.121_670_472_927_803_4,
  0.115_505_668_053_725_9, 0.107_444_270_115_965_6, 0.097_618_652_104_113_9,
  0.086_190_161_531_953_3, 0.073_346_481_411_080_3, 0.059_298_584_915_436_8,
  0.044_277_438_817_419_8, 0.028_531_388_628_933_7, 0.012_341_229_799_987_2,
];

/**
 * Longitud del arco de meridiano del ecuador a `latitudeDeg`, en metros.
 *
 *   M(φ) = a(1 − e²) ∫₀^φ (1 − e² sen²t)^{-3/2} dt
 *
 * Es la definición, no una aproximación. Se integra por tramos de un grado para
 * que cada tramo sea casi lineal y la cuadratura trabaje holgada.
 */
function meridianArcByQuadrature(latitudeDeg: number, ellipsoid: GeoEllipsoid): number {
  const f = 1 / ellipsoid.invF;
  const e2 = f * (2 - f);
  const integrand = (phi: number) =>
    (ellipsoid.a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(phi) * Math.sin(phi), 1.5);

  const target = latitudeDeg * DEG;
  const steps = Math.max(1, Math.ceil(Math.abs(latitudeDeg)));
  const step = target / steps;
  let total = 0;
  for (let index = 0; index < steps; index += 1) {
    const from = index * step;
    const to = from + step;
    const half = (to - from) / 2;
    const middle = (to + from) / 2;
    for (let node = 0; node < GAUSS_NODES.length; node += 1) {
      total += half * GAUSS_WEIGHTS[node] * integrand(middle + half * GAUSS_NODES[node]);
      total += half * GAUSS_WEIGHTS[node] * integrand(middle - half * GAUSS_NODES[node]);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Camino independiente 2 — transversa de Mercator de Snyder (USGS PP 1395)
// ---------------------------------------------------------------------------

/**
 * Serie clásica del USGS, truncada en el sexto orden en A = Δλ·cosφ.
 *
 * Snyder, «Map Projections — A Working Manual», USGS Professional Paper 1395
 * (1987): ec. 3-21 para el arco de meridiano y 8-9/8-10 para la proyección.
 * Está escrita en potencias de e², no de n, y trunca por otro sitio; ésa es
 * exactamente la razón de tenerla aquí.
 */
function snyderTransverseMercator(
  longitudeDeg: number,
  latitudeDeg: number,
  centralMeridianDeg: number,
  ellipsoid: GeoEllipsoid,
): { easting: number; northing: number } {
  const f = 1 / ellipsoid.invF;
  const e2 = f * (2 - f);
  const a = ellipsoid.a;
  const ep2 = e2 / (1 - e2);
  const phi = latitudeDeg * DEG;
  const lambda = (longitudeDeg - centralMeridianDeg) * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = lambda * cosPhi;

  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));

  const k0 = GEO_UTM_SCALE_FACTOR;
  const x =
    k0 *
    N *
    (A +
      ((1 - T + C) * A ** 3) / 6 +
      ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const y =
    k0 *
    (M +
      N *
        tanPhi *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { easting: 500_000 + x, northing: y };
}

// ---------------------------------------------------------------------------
// Malla de control: México
// ---------------------------------------------------------------------------

interface ControlPoint {
  longitudeDeg: number;
  latitudeDeg: number;
  zone: number;
}

function mexicoControlGrid(stepDeg = 1): ControlPoint[] {
  const points: ControlPoint[] = [];
  for (let latitude = 14; latitude <= 33; latitude += stepDeg)
    for (let longitude = -118; longitude <= -86; longitude += stepDeg)
      points.push({ longitudeDeg: longitude, latitudeDeg: latitude, zone: geoUtmZoneForLongitude(longitude) });
  return points.filter((point) => point.zone >= 11 && point.zone <= 16);
}

const grid = mexicoControlGrid();
assert.ok(grid.length > 600, `la malla de control debe cubrir México: ${grid.length} puntos`);

// ---------------------------------------------------------------------------
// 1. Arco de meridiano: la serie contra la cuadratura
// ---------------------------------------------------------------------------

let worstMeridianErrorM = 0;
for (let latitude = 0; latitude <= 84; latitude += 0.5) {
  const zone = geoUtmCrs(14);
  const projected = geodeticToUtm(zone.centralMeridianDeg, latitude, zone);
  const expected = GEO_UTM_SCALE_FACTOR * meridianArcByQuadrature(latitude, GEO_ELLIPSOID_WGS84);
  worstMeridianErrorM = Math.max(worstMeridianErrorM, Math.abs(projected.northing - expected));
  assert.ok(
    Math.abs(projected.easting - 500_000) < 1e-9,
    `sobre el meridiano central el este debe ser exactamente el falso este: ${projected.easting}`,
  );
}
assert.ok(
  worstMeridianErrorM < 1e-6,
  `arco de meridiano: la serie se desvía ${worstMeridianErrorM} m de la cuadratura`,
);

// El cuarto de meridiano publicado del elipsoide WGS84. Valor tabulado externo.
const quarterMeridianM = meridianArcByQuadrature(90, GEO_ELLIPSOID_WGS84);
assert.ok(
  Math.abs(quarterMeridianM - 10_001_965.729) < 0.001,
  `cuarto de meridiano WGS84: ${quarterMeridianM} m, tabulado 10 001 965,729 m`,
);

// ---------------------------------------------------------------------------
// 2. Krüger contra Snyder sobre toda la malla
// ---------------------------------------------------------------------------

let worstSnyderErrorM = 0;
let worstSnyderPoint = "";
for (const point of grid) {
  const crs = geoUtmCrs(point.zone);
  const mine = geodeticToUtm(point.longitudeDeg, point.latitudeDeg, crs);
  const snyder = snyderTransverseMercator(
    point.longitudeDeg,
    point.latitudeDeg,
    crs.centralMeridianDeg,
    GEO_ELLIPSOID_WGS84,
  );
  const error = Math.hypot(mine.easting - snyder.easting, mine.northing - snyder.northing);
  if (error > worstSnyderErrorM) {
    worstSnyderErrorM = error;
    worstSnyderPoint = `${point.latitudeDeg}°N ${point.longitudeDeg}° (zona ${point.zone})`;
  }
}
assert.ok(
  worstSnyderErrorM < 0.001,
  `Krüger vs Snyder: ${worstSnyderErrorM} m en ${worstSnyderPoint}; el tope es 1 mm`,
);

// ---------------------------------------------------------------------------
// 3. Conformidad y factor de escala por diferencias finitas
// ---------------------------------------------------------------------------

/**
 * Radios principales de curvatura, para convertir un incremento angular en
 * metros sobre el terreno. Sin esto, comparar ∂E/∂λ con ∂N/∂φ compararía
 * grados con grados y no diría nada sobre conformidad.
 */
function curvatureRadii(latitudeDeg: number, ellipsoid: GeoEllipsoid) {
  const f = 1 / ellipsoid.invF;
  const e2 = f * (2 - f);
  const sinPhi = Math.sin(latitudeDeg * DEG);
  const w = 1 - e2 * sinPhi * sinPhi;
  return {
    meridional: (ellipsoid.a * (1 - e2)) / Math.pow(w, 1.5),
    normal: ellipsoid.a / Math.sqrt(w),
  };
}

let worstConformalityResidual = 0;
let worstScaleErrorPpm = 0;
const delta = 1e-6; // grados; ~11 cm sobre el terreno, suficiente para centrar
for (const point of grid) {
  const crs = geoUtmCrs(point.zone);
  const north = geodeticToUtm(point.longitudeDeg, point.latitudeDeg + delta, crs);
  const south = geodeticToUtm(point.longitudeDeg, point.latitudeDeg - delta, crs);
  const east = geodeticToUtm(point.longitudeDeg + delta, point.latitudeDeg, crs);
  const west = geodeticToUtm(point.longitudeDeg - delta, point.latitudeDeg, crs);
  const { meridional, normal } = curvatureRadii(point.latitudeDeg, GEO_ELLIPSOID_WGS84);
  const groundNorth = 2 * delta * DEG * meridional;
  const groundEast = 2 * delta * DEG * normal * Math.cos(point.latitudeDeg * DEG);

  // Jacobiano en metros de retícula por metro de terreno.
  const dEdN = (north.easting - south.easting) / groundNorth;
  const dNdN = (north.northing - south.northing) / groundNorth;
  const dEdE = (east.easting - west.easting) / groundEast;
  const dNdE = (east.northing - west.northing) / groundEast;

  // Conforme ⟺ el jacobiano es c·R(θ) ⟺ dEdE = dNdN y dEdN = −dNdE.
  const scale = Math.hypot(dEdE, dNdE);
  const residual = Math.hypot(dEdE - dNdN, dEdN + dNdE) / scale;
  worstConformalityResidual = Math.max(worstConformalityResidual, residual);

  const reported = geodeticToUtm(point.longitudeDeg, point.latitudeDeg, crs).scale;
  worstScaleErrorPpm = Math.max(worstScaleErrorPpm, Math.abs(reported - scale) * 1e6);
}
assert.ok(
  worstConformalityResidual < 1e-7,
  `la proyección no sale conforme: residuo relativo ${worstConformalityResidual}`,
);
assert.ok(
  worstScaleErrorPpm < 1,
  `el factor de escala publicado difiere del medido en ${worstScaleErrorPpm} ppm`,
);

// Sobre el meridiano central la escala debe ser k0 EXACTO: es la definición.
for (const zone of [11, 12, 13, 14, 15, 16]) {
  const crs = geoUtmCrs(zone);
  for (const latitude of [14, 19.4326, 25, 32]) {
    const { scale, convergenceDeg } = geodeticToUtm(crs.centralMeridianDeg, latitude, crs);
    assert.ok(
      Math.abs(scale - GEO_UTM_SCALE_FACTOR) < 1e-12,
      `zona ${zone}N, ${latitude}°: escala ${scale} en el meridiano central`,
    );
    assert.ok(
      Math.abs(convergenceDeg) < 1e-12,
      `zona ${zone}N, ${latitude}°: convergencia ${convergenceDeg}° en el meridiano central`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Ida y vuelta — valida los coeficientes inversos
// ---------------------------------------------------------------------------

let worstRoundTripM = 0;
for (const point of grid) {
  const crs = geoUtmCrs(point.zone);
  const projected = geodeticToUtm(point.longitudeDeg, point.latitudeDeg, crs);
  const back = utmToGeodetic(projected.easting, projected.northing, crs);
  const { meridional, normal } = curvatureRadii(point.latitudeDeg, GEO_ELLIPSOID_WGS84);
  const errorM = Math.hypot(
    (back.latitudeDeg - point.latitudeDeg) * DEG * meridional,
    (back.longitudeDeg - point.longitudeDeg) * DEG * normal * Math.cos(point.latitudeDeg * DEG),
  );
  worstRoundTripM = Math.max(worstRoundTripM, errorM);
}
assert.ok(worstRoundTripM < 1e-6, `ida y vuelta: ${worstRoundTripM} m de deriva`);

// Zona a zona por el solape: el mismo punto en la 14N y en la 15N vuelve al
// mismo sitio. Es el caso del predio que cae en el borde y que el topógrafo
// entrega en la zona de al lado.
let worstZoneCrossM = 0;
for (let latitude = 15; latitude <= 32; latitude += 1) {
  const longitude = -96; // dentro de la 14N, a 3° de su meridiano central
  const from = geoUtmCrs(14);
  const to = geoUtmCrs(15);
  const inFourteen = reprojectGeoPoint({ x: longitude, y: latitude }, GEO_CRS_WGS84, from);
  const moved = reprojectGeoPoint(inFourteen, from, to);
  const back = reprojectGeoPoint(moved, to, GEO_CRS_WGS84);
  const { meridional, normal } = curvatureRadii(latitude, GEO_ELLIPSOID_WGS84);
  worstZoneCrossM = Math.max(
    worstZoneCrossM,
    Math.hypot(
      (back.y - latitude) * DEG * meridional,
      (back.x - longitude) * DEG * normal * Math.cos(latitude * DEG),
    ),
  );
}
assert.ok(worstZoneCrossM < 1e-6, `cruce de zona 14N↔15N: ${worstZoneCrossM} m de deriva`);

// GRS80 y WGS84 dan prácticamente la misma coordenada: es la salvedad que el
// módulo declara sobre los marcos ITRF, y aquí se MIDE en vez de suponerse.
let worstEllipsoidGapM = 0;
for (const point of grid) {
  const wgs = geodeticToUtm(point.longitudeDeg, point.latitudeDeg, geoUtmCrs(point.zone, "WGS84"));
  const itrf = geodeticToUtm(point.longitudeDeg, point.latitudeDeg, geoUtmCrs(point.zone, "ITRF2008"));
  worstEllipsoidGapM = Math.max(
    worstEllipsoidGapM,
    Math.hypot(wgs.easting - itrf.easting, wgs.northing - itrf.northing),
  );
}
assert.ok(
  worstEllipsoidGapM < 0.001,
  `WGS84 vs GRS80: ${worstEllipsoidGapM} m; se declaraba una décima de milímetro`,
);
assert.equal(GEO_ELLIPSOID_GRS80.a, GEO_ELLIPSOID_WGS84.a, "los dos elipsoides comparten semieje");

// ---------------------------------------------------------------------------
// Fallo cerrado
// ---------------------------------------------------------------------------

const rejects = (fn: () => unknown, code: string, what: string) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GeoError, `${what}: el error no es un GeoError`);
    assert.equal((error as GeoError).code, code, `${what}: código inesperado`);
    return;
  }
  assert.fail(`${what}: no falló, y debía fallar cerrado`);
};

rejects(() => geodeticToUtm(-99, 91, geoUtmCrs(14)), "coordenada-invalida", "latitud imposible");
rejects(() => geodeticToUtm(Number.NaN, 19, geoUtmCrs(14)), "coordenada-invalida", "longitud NaN");
rejects(
  () => geodeticToUtm(-70, 19, geoUtmCrs(14)),
  "fuera-de-dominio",
  "punto a 29° del meridiano central",
);
rejects(() => geodeticToUtm(-99, 88, geoUtmCrs(14)), "fuera-de-dominio", "latitud sobre el límite UTM");
rejects(() => geoUtmCrs(30), "crs-no-soportado", "zona fuera de México");
rejects(() => resolveGeoCrs("EPSG:3857"), "crs-no-soportado", "Mercator web");
rejects(() => resolveGeoCrs("no-es-un-sistema"), "crs-desconocido", "identificador basura");
rejects(
  () => utmToGeodetic(9_000_000, 2_000_000, geoUtmCrs(14)),
  "fuera-de-dominio",
  "este imposible para la zona",
);

// El mensaje del punto fuera de zona tiene que SUGERIR la zona correcta: es la
// causa real el 99 % de las veces y sin la sugerencia el usuario prueba a ciegas.
try {
  geodeticToUtm(-89, 20, geoUtmCrs(14));
  assert.fail("debía rechazar el punto de Yucatán en la zona 14N");
} catch (error) {
  assert.ok(error instanceof GeoError);
  assert.equal((error as GeoError).detail.suggested, 16, "debe sugerir la zona 16N");
}

// ---------------------------------------------------------------------------
// Lectura del .prj — lo que trae de verdad un shapefile
// ---------------------------------------------------------------------------

const PRJ_UTM14_WGS84 =
  'PROJCS["WGS_1984_UTM_Zone_14N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",-99.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const utm14 = parseGeoCrsWkt(PRJ_UTM14_WGS84);
assert.equal(utm14.kind, "utm", "el .prj de UTM 14N debe leerse como proyectado");
assert.equal(utm14.id, "EPSG:32614", "zona 14N sobre WGS84 es EPSG:32614");

const PRJ_GEOGRAPHIC =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
assert.equal(parseGeoCrsWkt(PRJ_GEOGRAPHIC).id, "EPSG:4326", "el .prj geográfico es WGS84");

const PRJ_ITRF2008_UTM14 =
  'PROJCS["Mexico_ITRF2008_UTM_Zone_14N",GEOGCS["Mexico_ITRF2008",DATUM["Mexico_ITRF2008",' +
  'SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",-99.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const itrf = parseGeoCrsWkt(PRJ_ITRF2008_UTM14);
assert.equal(itrf.datum, "ITRF2008", "el marco del Sistema Geodésico Nacional se reconoce");
assert.equal((itrf as { zone: number }).zone, 14, "y su zona también");

// El caso que justifica todo el módulo: un .prj en NAD27 se RECHAZA por su
// nombre. Si entrase como WGS84, el predio saldría a cientos de metros con la
// geometría intacta — el error más caro que este subárbol puede cometer.
const PRJ_NAD27 =
  'PROJCS["NAD_1927_UTM_Zone_14N",GEOGCS["GCS_North_American_1927",' +
  'DATUM["D_North_American_1927",SPHEROID["Clarke_1866",6378206.4,294.9786982]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],' +
  'PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",-99.0],' +
  'PARAMETER["Scale_Factor",0.9996],UNIT["Meter",1.0]]';
rejects(() => parseGeoCrsWkt(PRJ_NAD27), "crs-no-soportado", ".prj en NAD27");
try {
  parseGeoCrsWkt(PRJ_NAD27);
} catch (error) {
  assert.ok(
    (error as GeoError).message.includes("NAD27"),
    "el mensaje debe nombrar el datum: sin el nombre, el usuario no sabe qué reproyectar",
  );
}

rejects(
  () =>
    parseGeoCrsWkt(
      'PROJCS["Web_Mercator",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
        'SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Mercator_Auxiliary_Sphere"]]',
    ),
  "crs-no-soportado",
  ".prj con proyección ajena",
);
rejects(
  () =>
    parseGeoCrsWkt(
      'PROJCS["Sin_datum",PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",-99.0]]',
    ),
  "crs-desconocido",
  ".prj sin datum: no se supone WGS84",
);
rejects(() => parseGeoCrsWkt("   "), "crs-desconocido", ".prj vacío");

// ---------------------------------------------------------------------------
// Zonas de México: la aritmética del meridiano central
// ---------------------------------------------------------------------------

for (const [zone, meridian] of [
  [11, -117],
  [12, -111],
  [13, -105],
  [14, -99],
  [15, -93],
  [16, -87],
] as const)
  assert.equal(geoUtmCrs(zone).centralMeridianDeg, meridian, `meridiano central de la zona ${zone}N`);

assert.equal(geoUtmZoneForLongitude(-99.1332), 14, "la Ciudad de México cae en la 14N");
assert.equal(geoUtmZoneForLongitude(-116.6), 11, "Tijuana cae en la 11N");
assert.equal(geoUtmZoneForLongitude(-86.85), 16, "Cancún cae en la 16N");

console.log(
  `crs: arco de meridiano ±${worstMeridianErrorM.toExponential(2)} m contra cuadratura, ` +
    `Krüger vs Snyder ±${worstSnyderErrorM.toExponential(2)} m, ida y vuelta ` +
    `±${worstRoundTripM.toExponential(2)} m, conformidad ${worstConformalityResidual.toExponential(2)}, ` +
    `escala ±${worstScaleErrorPpm.toExponential(2)} ppm sobre ${grid.length} puntos de control`,
);
