/**
 * Sistemas de referencia y reproyección — WGS84 geográfico ↔ UTM 11N…16N.
 *
 * ## Para qué sirve esto en México, dicho sin adornos
 *
 * El caso real no es «GIS». Es un topógrafo que entrega el levantamiento de un
 * predio en coordenadas UTM zona 14N —porque es lo que sale del equipo y lo que
 * pide el Registro Público— y un arquitecto que necesita ese polígono dentro de
 * su plano de conjunto, junto al resto del proyecto, sin que se desplace. Ese
 * traslado es aritmética, y la aritmética o está bien o no está: si el vértice
 * tres cae dos metros a la derecha, el plano de linderos que se protocoliza no
 * describe el terreno que se compró.
 *
 * Por eso este módulo no intenta ser una biblioteca GIS. Cubre las seis zonas
 * UTM que atraviesan México y el geográfico del que salen los GPS, y cada
 * parámetro lleva escrito de dónde viene. Todo lo demás falla cerrado.
 *
 * ## Qué cubre y qué no
 *
 * SÍ: geográfico WGS84 (EPSG:4326) y UTM zonas 11N a 16N sobre WGS84
 * (EPSG:32611 … 32616). Las seis zonas cubren el país entero: la 11N entra por
 * Baja California y la 16N sale por la península de Yucatán.
 *
 * SÍ, con salvedad declarada: los marcos ITRF (ITRF92, ITRF2008, ITRF2020) que
 * usa el Sistema Geodésico Nacional se tratan como equivalentes a WGS84. No se
 * aplica transformación de datum entre ellos porque no la hay que aplicar a
 * este nivel: las realizaciones difieren en centímetros. Lo que NO se hace es
 * el ajuste de época por movimiento de placa —México se desplaza unos 2 cm al
 * año—, y para un lindero al centímetro eso ya importa. Se declara y se avisa.
 *
 * NO: NAD27 y NAD83. NAD27 está a cientos de metros de WGS84 en México y su
 * transformación decente exige rejillas; NAD83 está a un par de metros. Los dos
 * se reconocen y se RECHAZAN con su nombre. Devolver una coordenada NAD27 como
 * si fuera WGS84 sería el error más caro que este módulo puede cometer, así que
 * es el único que se cierra por completo.
 *
 * ## De dónde salen los números (ninguno es de memoria)
 *
 * · Elipsoide WGS 84 — parámetros DEFINITORIOS a = 6 378 137 m y 1/f =
 *   298,257 223 563. Fuente: NIMA TR8350.2, «Department of Defense World
 *   Geodetic System 1984», 3.ª ed., tabla 3.1.
 * · Elipsoide GRS 80 — a = 6 378 137 m, 1/f = 298,257 222 101. Fuente: H.
 *   Moritz, «Geodetic Reference System 1980», Journal of Geodesy 74 (2000)
 *   128-133. El achatamiento es DERIVADO de J2; por eso difiere del de WGS84 en
 *   la undécima cifra, y por eso los dos elipsoides dan la misma coordenada
 *   dentro de una décima de milímetro.
 * · Definición UTM — factor de escala en el meridiano central k0 = 0,9996,
 *   falso este 500 000 m, falso norte 0 m en el hemisferio norte, latitud de
 *   origen 0°, meridiano central = 6·zona − 183 grados. Fuente: DMA TM 8358.2,
 *   «The Universal Grids», y EPSG Guidance Note 7-2 (método 9807, Transverse
 *   Mercator).
 * · Serie de Krüger en la tercera aplanamiento `n`, coeficientes α y β hasta
 *   n⁶. Fuente: C. F. F. Karney, «Transverse Mercator with an accuracy of a few
 *   nanometers», Journal of Geodesy 85 (2011) 475-485, ecuaciones (9)-(12),
 *   que reproducen la serie de L. Krüger (1912) extendida por Engsager y Poder.
 *
 * ## Cómo se sabe que está bien
 *
 * `crs.spec.ts` no comprueba que la serie coincida consigo misma. Comprueba
 * cuatro cosas por caminos INDEPENDIENTES del código que prueba:
 *
 *   1. El norte sobre el meridiano central contra la longitud de arco de
 *      meridiano calculada por cuadratura de Gauss-Legendre de 24 nodos. Eso
 *      valida el radio rectificante y los seis coeficientes α de golpe.
 *   2. Toda la proyección contra la serie clásica de Snyder (USGS Professional
 *      Paper 1395), que es otra parametrización y otra truncación.
 *   3. Conformidad y factor de escala por diferencias finitas: una proyección
 *      conforme del elipsoide que lleva el meridiano central a una recta de
 *      escala k0 constante ES la transversa de Mercator, y eso se comprueba sin
 *      volver a usar la serie.
 *   4. Ida y vuelta sobre una malla que cubre México, que valida los β.
 *
 * Módulo PURO: sin DOM, sin red, sin dependencias. Cero paquetes de terceros —
 * el mundo GIS está lleno de GPL y una dependencia copyleft en el runtime
 * cambiaría las obligaciones de distribución del producto entero.
 */
import { GeoError, geoAssert } from "./errors";

// ---------------------------------------------------------------------------
// Elipsoides
// ---------------------------------------------------------------------------

export interface GeoEllipsoid {
  readonly id: "WGS84" | "GRS80";
  /** Semieje mayor, en metros. */
  readonly a: number;
  /** Inverso del achatamiento. */
  readonly invF: number;
}

/** WGS 84. NIMA TR8350.2 3.ª ed., tabla 3.1 (parámetros definitorios). */
export const GEO_ELLIPSOID_WGS84: GeoEllipsoid = {
  id: "WGS84",
  a: 6_378_137,
  invF: 298.257_223_563,
};

/** GRS 80. Moritz, J. Geod. 74 (2000). El 1/f es derivado de J2, no definitorio. */
export const GEO_ELLIPSOID_GRS80: GeoEllipsoid = {
  id: "GRS80",
  a: 6_378_137,
  invF: 298.257_222_101,
};

// ---------------------------------------------------------------------------
// Datums
// ---------------------------------------------------------------------------

/**
 * Familia de datums que este módulo trata como una sola.
 *
 * WGS84 y las realizaciones del ITRF coinciden por construcción dentro de unos
 * pocos centímetros; el Sistema Geodésico Nacional mexicano es ITRF2008 época
 * 2010.0 sobre GRS80. Tratarlos como equivalentes es lo que hace TODO el mundo
 * geodésico salvo quien trabaja al centímetro, y es lo que se declara aquí en
 * vez de inventarse siete parámetros de Helmert que nadie ha medido.
 */
export type GeoDatumId = "WGS84" | "ITRF92" | "ITRF2008" | "ITRF2020";

/**
 * Discrepancia máxima que se ASUME —no que se mide— al ignorar la diferencia
 * entre realizaciones del marco, en metros.
 *
 * Se publica para que quien necesite más precisión sepa que aquí no la va a
 * encontrar. Un lindero al decímetro está cubierto; uno al centímetro necesita
 * un geodesta y la época de la medición, que este módulo no conoce.
 */
export const GEO_DATUM_FAMILY_TOLERANCE_M = 0.1;

const DATUM_ELLIPSOID: Readonly<Record<GeoDatumId, GeoEllipsoid>> = {
  WGS84: GEO_ELLIPSOID_WGS84,
  // Los marcos ITRF se definen sobre GRS80. La diferencia con WGS84 es de una
  // décima de milímetro en la coordenada proyectada, no de datum.
  ITRF92: GEO_ELLIPSOID_GRS80,
  ITRF2008: GEO_ELLIPSOID_GRS80,
  ITRF2020: GEO_ELLIPSOID_GRS80,
};

// ---------------------------------------------------------------------------
// Sistemas de referencia
// ---------------------------------------------------------------------------

/**
 * Un punto. En un sistema GEOGRÁFICO, `x` es la LONGITUD y `y` la LATITUD.
 *
 * Se dice aquí y en mayúsculas porque el orden de los ejes es el error clásico
 * de todo el mundo geoespacial: EPSG define 4326 como (latitud, longitud) y
 * prácticamente todos los archivos —shapefile incluido— lo escriben al revés.
 * Este módulo usa el orden del archivo, que es el mismo del CAD: x hacia el
 * este, y hacia el norte. Un punto con la latitud en `x` se detecta solo casi
 * siempre, porque |latitud| ≤ 90 y las longitudes de México pasan de 86.
 */
export interface GeoPoint {
  x: number;
  y: number;
  /** Altura elipsoidal en metros. Viaja sin tocarse: aquí no hay geoide. */
  z?: number;
}

export interface GeoGeographicCrs {
  readonly kind: "geographic";
  /** Identificador estable. `EPSG:4326` para WGS84. */
  readonly id: string;
  readonly name: string;
  readonly datum: GeoDatumId;
  readonly ellipsoid: GeoEllipsoid;
}

export interface GeoUtmCrs {
  readonly kind: "utm";
  readonly id: string;
  readonly name: string;
  readonly datum: GeoDatumId;
  readonly ellipsoid: GeoEllipsoid;
  /** 11 a 16. Fuera de ese rango este módulo no verifica nada. */
  readonly zone: number;
  readonly hemisphere: "N";
  /** Meridiano central en grados: 6·zona − 183. */
  readonly centralMeridianDeg: number;
}

export type GeoCrs = GeoGeographicCrs | GeoUtmCrs;

/** Zonas UTM que atraviesan México. Fuera de ellas este módulo no da servicio. */
export const GEO_MEXICO_UTM_ZONES: readonly number[] = [11, 12, 13, 14, 15, 16];

/** Geográfico WGS84, el que sale de cualquier GPS y de cualquier servicio web. */
export const GEO_CRS_WGS84: GeoGeographicCrs = {
  kind: "geographic",
  id: "EPSG:4326",
  name: "WGS 84 geográfico",
  datum: "WGS84",
  ellipsoid: GEO_ELLIPSOID_WGS84,
};

/**
 * Construye la zona UTM `zone` del hemisferio norte sobre el datum indicado.
 *
 * El código EPSG sólo se emite para la familia WGS84, que es la única para la
 * que se conoce con certeza (32600 + zona). Para los marcos ITRF el código
 * EPSG existe pero no se inventa: el identificador lleva el nombre del marco y,
 * si el archivo declaraba un código, se conserva el del archivo.
 */
export function geoUtmCrs(zone: number, datum: GeoDatumId = "WGS84"): GeoUtmCrs {
  geoAssert(
    Number.isInteger(zone) && zone >= 1 && zone <= 60,
    "crs-no-soportado",
    `Zona UTM ${zone} fuera del rango 1…60.`,
    { detail: { zone } },
  );
  geoAssert(
    GEO_MEXICO_UTM_ZONES.includes(zone),
    "crs-no-soportado",
    `Zona UTM ${zone}N: este producto verifica sus cuentas en las zonas 11N a 16N, las que ` +
      "cubren México. Fuera de ellas la serie sigue siendo válida pero nadie ha comprobado el " +
      "resultado, y una reproyección sin comprobar no vale más que no tenerla.",
    { detail: { zone } },
  );
  return {
    kind: "utm",
    id: datum === "WGS84" ? `EPSG:${32_600 + zone}` : `${datum}/UTM${zone}N`,
    name: `${datum === "WGS84" ? "WGS 84" : datum} / UTM zona ${zone}N`,
    datum,
    ellipsoid: DATUM_ELLIPSOID[datum],
    zone,
    hemisphere: "N",
    centralMeridianDeg: 6 * zone - 183,
  };
}

/** Zona UTM que corresponde a una longitud. Sin excepciones noruegas: no aplican aquí. */
export function geoUtmZoneForLongitude(longitudeDeg: number): number {
  geoAssert(
    Number.isFinite(longitudeDeg),
    "coordenada-invalida",
    "La longitud no es un número finito.",
    { detail: { longitudeDeg: String(longitudeDeg) } },
  );
  const normalized = ((((longitudeDeg + 180) % 360) + 360) % 360) - 180;
  return Math.floor((normalized + 180) / 6) + 1;
}

/**
 * Resuelve un identificador textual a un sistema conocido.
 *
 * Acepta `EPSG:4326`, `4326`, `EPSG:32614`, `UTM14N`. Lo que no reconoce lo
 * rechaza; no hay «por defecto WGS84», porque suponer el sistema de referencia
 * es exactamente la forma de equivocarse en cientos de metros sin enterarse.
 */
export function resolveGeoCrs(id: string): GeoCrs {
  const text = id.trim().toUpperCase();
  const epsg = /^(?:EPSG:)?(\d{4,5})$/.exec(text);
  if (epsg) {
    const code = Number(epsg[1]);
    if (code === 4326) return GEO_CRS_WGS84;
    if (code > 32_600 && code < 32_661) return geoUtmCrs(code - 32_600, "WGS84");
    throw new GeoError("crs-no-soportado", `EPSG:${code} no está entre los sistemas que este producto sabe reproyectar.`, {
      detail: { code },
    });
  }
  const utm = /^UTM\s?(\d{1,2})\s?N$/.exec(text);
  if (utm) return geoUtmCrs(Number(utm[1]), "WGS84");
  if (text === "WGS84" || text === "WGS 84") return GEO_CRS_WGS84;
  throw new GeoError("crs-desconocido", `No se reconoce el sistema de referencia «${id}».`, {
    detail: { id },
  });
}

// ---------------------------------------------------------------------------
// Definición UTM
// ---------------------------------------------------------------------------

/** Factor de escala en el meridiano central. DMA TM 8358.2. */
export const GEO_UTM_SCALE_FACTOR = 0.9996;
/** Falso este, en metros. DMA TM 8358.2. */
export const GEO_UTM_FALSE_EASTING_M = 500_000;
/** Falso norte del hemisferio norte, en metros. DMA TM 8358.2. */
export const GEO_UTM_FALSE_NORTHING_NORTH_M = 0;

/**
 * Separación máxima del meridiano central, en grados, dentro de la cual este
 * módulo acepta proyectar.
 *
 * La zona mide ±3°. Se admite el doble porque un predio a caballo entre dos
 * zonas se entrega a menudo en una sola, y porque los levantamientos reales
 * desbordan la zona sin avisar. Más allá, la serie de Krüger truncada en n⁶
 * empieza a perder cifras y no se ha comprobado: se rechaza con su código en
 * vez de devolver un número que ya no se puede defender.
 */
export const GEO_UTM_MAX_MERIDIAN_OFFSET_DEG = 6;

/** Latitudes donde la retícula UTM está definida. DMA TM 8358.2. */
export const GEO_UTM_MIN_LATITUDE_DEG = -80;
export const GEO_UTM_MAX_LATITUDE_DEG = 84;

// ---------------------------------------------------------------------------
// Serie de Krüger — Karney (2011), ecuaciones (9)-(12)
// ---------------------------------------------------------------------------

interface KrugerConstants {
  /** Tercera aplanamiento n = f/(2−f). */
  readonly n: number;
  /** Primera excentricidad. */
  readonly e: number;
  /** Radio rectificante A: el arco de meridiano completo dividido por π/2·… */
  readonly A: number;
  readonly alpha: readonly number[];
  readonly beta: readonly number[];
}

const CONSTANTS_CACHE = new Map<string, KrugerConstants>();

/**
 * Coeficientes de la serie para un elipsoide dado.
 *
 * Se memorizan porque son ocho polinomios de sexto grado y una nube de puntos
 * llama a esta función millones de veces. Se calculan a partir de `n`, nunca se
 * copian ya evaluados: un coeficiente evaluado a mano es un número que nadie
 * puede volver a comprobar.
 */
function krugerConstants(ellipsoid: GeoEllipsoid): KrugerConstants {
  const cached = CONSTANTS_CACHE.get(ellipsoid.id);
  if (cached) return cached;

  const f = 1 / ellipsoid.invF;
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const n5 = n4 * n;
  const n6 = n5 * n;
  const e = Math.sqrt(f * (2 - f));

  // Karney (2011) ec. (10): A = a/(1+n)·(1 + n²/4 + n⁴/64 + n⁶/256 + …).
  const A = (ellipsoid.a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

  // Karney (2011) ec. (12), coeficientes directos (geográfico → retícula).
  const alpha = [
    n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4 - (127 / 288) * n5 + (7891 / 37800) * n6,
    (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4 + (281 / 630) * n5 - (1983433 / 1935360) * n6,
    (61 / 240) * n3 - (103 / 140) * n4 + (15061 / 26880) * n5 + (167603 / 181440) * n6,
    (49561 / 161280) * n4 - (179 / 168) * n5 + (6601661 / 7257600) * n6,
    (34729 / 80640) * n5 - (3418889 / 1995840) * n6,
    (212378941 / 319334400) * n6,
  ];

  // Karney (2011) ec. (12), coeficientes inversos (retícula → geográfico).
  const beta = [
    n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4 - (81 / 512) * n5 + (96199 / 604800) * n6,
    (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4 + (46 / 105) * n5 - (1118711 / 3870720) * n6,
    (17 / 480) * n3 - (37 / 840) * n4 - (209 / 4480) * n5 + (5569 / 90720) * n6,
    (4397 / 161280) * n4 - (11 / 504) * n5 - (830251 / 7257600) * n6,
    (4583 / 161280) * n5 - (108847 / 3991680) * n6,
    (20648693 / 638668800) * n6,
  ];

  const constants: KrugerConstants = { n, e, A, alpha, beta };
  CONSTANTS_CACHE.set(ellipsoid.id, constants);
  return constants;
}

const DEG = Math.PI / 180;

/**
 * Tangente de la latitud CONFORME a partir de la tangente de la geodésica.
 *
 * Karney (2011) ec. (7). La forma con `sinh`/`asinh` en vez de la clásica con
 * logaritmos existe por estabilidad numérica: la clásica pierde cifras cerca
 * del ecuador, que es donde la resta `atanh(sinφ) − e·atanh(e·sinφ)` cancela.
 */
function conformalTangent(tau: number, e: number): number {
  const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
  return tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
}

export interface GeoUtmResult {
  /** Este, en metros, con el falso este ya sumado. */
  easting: number;
  /** Norte, en metros. */
  northing: number;
  /**
   * Factor de escala PUNTUAL. Multiplica una longitud del terreno para obtener
   * la de la retícula. En el borde de la zona vale ~1,00058: 58 cm por cada
   * kilómetro, que en un lindero de manzana ya es discutible.
   */
  scale: number;
  /**
   * Convergencia de meridianos, en grados. Es el ángulo entre el norte de la
   * retícula y el norte geográfico: lo que hay que sumar a un rumbo de retícula
   * para obtener el rumbo verdadero, que es lo que pide una escritura.
   */
  convergenceDeg: number;
}

/**
 * Geográfico → UTM. El corazón del módulo.
 *
 * `longitudeDeg`/`latitudeDeg` en grados decimales sobre el datum del sistema
 * de destino; no se hace desplazamiento de datum (ver la cabecera del archivo).
 */
export function geodeticToUtm(
  longitudeDeg: number,
  latitudeDeg: number,
  crs: GeoUtmCrs,
): GeoUtmResult {
  assertFiniteDegrees(longitudeDeg, latitudeDeg);
  geoAssert(
    latitudeDeg >= GEO_UTM_MIN_LATITUDE_DEG && latitudeDeg <= GEO_UTM_MAX_LATITUDE_DEG,
    "fuera-de-dominio",
    `La retícula UTM sólo está definida entre ${GEO_UTM_MIN_LATITUDE_DEG}° y ` +
      `${GEO_UTM_MAX_LATITUDE_DEG}° de latitud; el punto está a ${latitudeDeg.toFixed(6)}°.`,
    { detail: { latitudeDeg } },
  );
  const offsetDeg = normalizeLongitudeDelta(longitudeDeg - crs.centralMeridianDeg);
  geoAssert(
    Math.abs(offsetDeg) <= GEO_UTM_MAX_MERIDIAN_OFFSET_DEG,
    "fuera-de-dominio",
    `El punto está a ${offsetDeg.toFixed(3)}° del meridiano central de la zona ${crs.zone}N ` +
      `(máximo comprobado: ${GEO_UTM_MAX_MERIDIAN_OFFSET_DEG}°). Casi siempre significa que la ` +
      `zona declarada no es la del archivo: la que le toca a esta longitud es la ` +
      `${geoUtmZoneForLongitude(longitudeDeg)}N.`,
    { detail: { offsetDeg, zone: crs.zone, suggested: geoUtmZoneForLongitude(longitudeDeg) } },
  );

  const { e, A, alpha } = krugerConstants(crs.ellipsoid);
  const lambda = offsetDeg * DEG;
  const phi = latitudeDeg * DEG;
  const tau = Math.tan(phi);
  const tauPrime = conformalTangent(tau, e);

  const cosLambda = Math.cos(lambda);
  const sinLambda = Math.sin(lambda);
  const xiPrime = Math.atan2(tauPrime, cosLambda);
  const etaPrime = Math.asinh(sinLambda / Math.hypot(tauPrime, cosLambda));

  let xi = xiPrime;
  let eta = etaPrime;
  // Derivadas de la serie: sirven a la vez para el factor de escala y para la
  // convergencia, así que se acumulan en el mismo bucle.
  let p = 1;
  let q = 0;
  for (let j = 1; j <= 6; j += 1) {
    const a = alpha[j - 1];
    xi += a * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += a * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
    p += 2 * j * a * Math.cos(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    q += 2 * j * a * Math.sin(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }

  const k0 = GEO_UTM_SCALE_FACTOR;
  // Karney (2011) ec. (14)-(15): el factor de escala y la convergencia salen de
  // las mismas series, partidas en el trozo que aporta la latitud conforme y el
  // que aporta la serie.
  const sinPhi = Math.sin(phi);
  const scaleConformal =
    (Math.sqrt(1 - e * e * sinPhi * sinPhi) * Math.hypot(1, tau)) / Math.hypot(tauPrime, cosLambda);
  const scaleSeries = (A / crs.ellipsoid.a) * Math.hypot(p, q);
  const convergenceConformal = Math.atan((tauPrime / Math.hypot(1, tauPrime)) * Math.tan(lambda));
  const convergenceSeries = Math.atan2(q, p);

  return {
    easting: GEO_UTM_FALSE_EASTING_M + k0 * A * eta,
    northing: GEO_UTM_FALSE_NORTHING_NORTH_M + k0 * A * xi,
    scale: k0 * scaleConformal * scaleSeries,
    convergenceDeg: (convergenceConformal + convergenceSeries) / DEG,
  };
}

/**
 * UTM → geográfico.
 *
 * La latitud sale de invertir la latitud conforme por Newton, que converge en
 * dos o tres pasadas para cualquier punto del planeta. El bucle tiene tope: una
 * iteración que no converge devuelve error, nunca la última aproximación — «casi
 * convergido» y «convergido» se parecen demasiado como para confundirlos aquí.
 */
export function utmToGeodetic(
  easting: number,
  northing: number,
  crs: GeoUtmCrs,
): { longitudeDeg: number; latitudeDeg: number } {
  geoAssert(
    Number.isFinite(easting) && Number.isFinite(northing),
    "coordenada-invalida",
    "El este o el norte no son números finitos.",
    { detail: { easting: String(easting), northing: String(northing) } },
  );

  const { e, A, beta } = krugerConstants(crs.ellipsoid);
  const k0 = GEO_UTM_SCALE_FACTOR;
  const xi = (northing - GEO_UTM_FALSE_NORTHING_NORTH_M) / (k0 * A);
  const eta = (easting - GEO_UTM_FALSE_EASTING_M) / (k0 * A);

  let xiPrime = xi;
  let etaPrime = eta;
  for (let j = 1; j <= 6; j += 1) {
    const b = beta[j - 1];
    xiPrime -= b * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= b * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  const sinhEta = Math.sinh(etaPrime);
  const sinXi = Math.sin(xiPrime);
  const cosXi = Math.cos(xiPrime);
  const tauPrime = sinXi / Math.hypot(sinhEta, cosXi);
  const lambda = Math.atan2(sinhEta, cosXi);

  // Newton sobre τ. Karney (2011) ec. (19)-(21).
  let tau = tauPrime;
  let converged = false;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
    const tauI = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const delta =
      ((tauPrime - tauI) / Math.sqrt(1 + tauI * tauI)) *
      ((1 + (1 - e * e) * tau * tau) / ((1 - e * e) * Math.sqrt(1 + tau * tau)));
    tau += delta;
    if (Math.abs(delta) <= 1e-12) {
      converged = true;
      break;
    }
  }
  geoAssert(
    converged && Number.isFinite(tau),
    "coordenada-invalida",
    "La inversión de la proyección no convergió: el par (este, norte) no corresponde a ningún " +
      "punto de esta zona UTM.",
    { detail: { easting, northing, zone: crs.zone } },
  );

  const latitudeDeg = Math.atan(tau) / DEG;
  const longitudeDeg = crs.centralMeridianDeg + lambda / DEG;
  geoAssert(
    Math.abs(normalizeLongitudeDelta(longitudeDeg - crs.centralMeridianDeg)) <=
      GEO_UTM_MAX_MERIDIAN_OFFSET_DEG &&
      latitudeDeg >= GEO_UTM_MIN_LATITUDE_DEG &&
      latitudeDeg <= GEO_UTM_MAX_LATITUDE_DEG,
    "fuera-de-dominio",
    `El par (${easting.toFixed(2)}, ${northing.toFixed(2)}) cae fuera del dominio comprobado de ` +
      `la zona ${crs.zone}N. Comprueba que el archivo declare la zona que de verdad usa.`,
    { detail: { easting, northing, zone: crs.zone } },
  );
  return { longitudeDeg, latitudeDeg };
}

// ---------------------------------------------------------------------------
// Reproyección de puntos entre dos sistemas cualesquiera de los soportados
// ---------------------------------------------------------------------------

/**
 * Reproyecta un punto de `from` a `to`.
 *
 * Las cuatro combinaciones se resuelven pasando por el geográfico, que es el
 * único puente que existe entre dos zonas UTM distintas. Zona 14N → zona 15N va
 * y vuelve por WGS84 y eso es correcto: no hay atajo entre dos proyecciones con
 * meridiano central distinto que no pase por el elipsoide.
 */
export function reprojectGeoPoint(point: GeoPoint, from: GeoCrs, to: GeoCrs): GeoPoint {
  assertCompatibleDatums(from, to);
  if (from.id === to.id) return { ...point };

  const geographic =
    from.kind === "geographic"
      ? { longitudeDeg: point.x, latitudeDeg: point.y }
      : utmToGeodetic(point.x, point.y, from);

  if (to.kind === "geographic") {
    const result: GeoPoint = { x: geographic.longitudeDeg, y: geographic.latitudeDeg };
    if (point.z !== undefined) result.z = point.z;
    return result;
  }
  const projected = geodeticToUtm(geographic.longitudeDeg, geographic.latitudeDeg, to);
  const result: GeoPoint = { x: projected.easting, y: projected.northing };
  if (point.z !== undefined) result.z = point.z;
  return result;
}

/**
 * Reproyecta muchos puntos. La misma cuenta, sin repetir las comprobaciones de
 * compatibilidad una vez por vértice.
 *
 * Existe porque el consumidor natural es un shapefile de predios con decenas de
 * miles de vértices, y porque una nube de puntos tiene millones: hacer la
 * validación de sistemas dentro del bucle costaba más que la propia proyección.
 */
export function reprojectGeoPoints(
  points: readonly GeoPoint[],
  from: GeoCrs,
  to: GeoCrs,
): GeoPoint[] {
  assertCompatibleDatums(from, to);
  if (from.id === to.id) return points.map((point) => ({ ...point }));
  return points.map((point) => reprojectGeoPoint(point, from, to));
}

/**
 * Reproyecta coordenadas empaquetadas en arreglos tipados, EN EL SITIO.
 *
 * Para una nube de puntos la versión de objetos no sirve: diez millones de
 * `{x, y}` son diez millones de objetos que el recolector tiene que rastrear.
 * Aquí se recorre el arreglo y se sobrescribe, sin reservar nada.
 */
export function reprojectGeoCoordinatesInPlace(
  xs: Float64Array,
  ys: Float64Array,
  from: GeoCrs,
  to: GeoCrs,
): void {
  assertCompatibleDatums(from, to);
  geoAssert(
    xs.length === ys.length,
    "indice-incoherente",
    "Los arreglos de abscisas y ordenadas no tienen la misma longitud.",
    { detail: { xs: xs.length, ys: ys.length } },
  );
  if (from.id === to.id) return;
  for (let index = 0; index < xs.length; index += 1) {
    const moved = reprojectGeoPoint({ x: xs[index], y: ys[index] }, from, to);
    xs[index] = moved.x;
    ys[index] = moved.y;
  }
}

// ---------------------------------------------------------------------------
// Lectura del sistema declarado en un archivo (`.prj` de un shapefile)

// ---------------------------------------------------------------------------
// Guardias compartidas
// ---------------------------------------------------------------------------

function assertFiniteDegrees(longitudeDeg: number, latitudeDeg: number): void {
  geoAssert(
    Number.isFinite(longitudeDeg) && Number.isFinite(latitudeDeg),
    "coordenada-invalida",
    "La longitud o la latitud no son números finitos.",
    { detail: { longitudeDeg: String(longitudeDeg), latitudeDeg: String(latitudeDeg) } },
  );
  geoAssert(
    Math.abs(latitudeDeg) <= 90,
    "coordenada-invalida",
    `Latitud ${latitudeDeg}° fuera de [-90, 90]. Suele ser el par (x, y) invertido: en este ` +
      "producto la longitud va en x y la latitud en y.",
    { detail: { latitudeDeg } },
  );
}

/** Lleva una diferencia de longitudes al intervalo (−180, 180]. */
function normalizeLongitudeDelta(deltaDeg: number): number {
  const wrapped = ((((deltaDeg + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * Dos sistemas sólo se pueden encadenar si comparten familia de datum.
 *
 * Es la guardia que impide el error caro. Un shapefile en NAD27 nunca llega
 * aquí —se rechaza al leer el `.prj`—, pero si alguien construye el sistema a
 * mano, esta comprobación vuelve a cerrar la puerta.
 */
function assertCompatibleDatums(from: GeoCrs, to: GeoCrs): void {
  geoAssert(
    from.datum in DATUM_ELLIPSOID && to.datum in DATUM_ELLIPSOID,
    "crs-no-soportado",
    `No se sabe pasar de ${from.datum} a ${to.datum} sin una transformación de datum que este ` +
      "producto no incorpora.",
    { detail: { from: from.datum, to: to.datum } },
  );
}
