/**
 * Lectura del sistema de referencia declarado en un `.prj`.
 *
 * ## Por qué vive aparte de `crs.ts`
 *
 * Porque son dos oficios distintos y fallan de maneras distintas. `crs.ts` es
 * aritmética: series, elipsoides y una paridad numérica que se verifica contra
 * cuadraturas. Esto es análisis de un texto que escribió otro programa, con
 * todo lo que eso implica —variantes de escritura, nombres con guion bajo,
 * mayúsculas inconsistentes—. Mezclarlos obligaba a leer seiscientas líneas de
 * matemáticas para llegar a una expresión regular.
 *
 * ## Lo que este archivo NO es
 *
 * No es un analizador de WKT completo, y decirlo importa. Se buscan el nombre
 * del sistema proyectado, el del datum y —si está— el código de autoridad. Con
 * eso basta para los archivos que produce el mundo real (ArcGIS, QGIS, los
 * equipos de topografía), y lo que no encaje se RECHAZA en vez de aproximarse.
 *
 * ## El caso peligroso que esto cierra
 *
 * Un `.prj` que dice NAD27. Sin leerlo, sus coordenadas entrarían como si
 * fueran WGS84 y el predio aparecería a cientos de metros de donde está, con
 * toda la geometría interna correcta: los lados medirían lo que miden, la
 * superficie sería la que es, y el terreno estaría en el lugar equivocado.
 */
import {
  GEO_CRS_WGS84,
  GEO_UTM_FALSE_EASTING_M,
  GEO_UTM_SCALE_FACTOR,
  geoUtmCrs,
  resolveGeoCrs,
  type GeoCrs,
  type GeoDatumId,
  type GeoEllipsoid,
  GEO_ELLIPSOID_GRS80,
  GEO_ELLIPSOID_WGS84,
} from './crs';
import { GeoError, geoAssert } from './errors';

const DATUM_ELLIPSOID: Readonly<Record<GeoDatumId, GeoEllipsoid>> = {
  WGS84: GEO_ELLIPSOID_WGS84,
  // Los marcos ITRF se definen sobre GRS80. La diferencia con WGS84 es de una
  // décima de milímetro en la coordenada proyectada, no de datum.
  ITRF92: GEO_ELLIPSOID_GRS80,
  ITRF2008: GEO_ELLIPSOID_GRS80,
  ITRF2020: GEO_ELLIPSOID_GRS80,
};


/**
 * Datums que se reconocen para RECHAZARLOS.
 *
 * Reconocer y rechazar no es lo mismo que no reconocer: el mensaje puede decir
 * «esto es NAD27 y está a cientos de metros», que es información accionable,
 * en vez de «sistema desconocido», que obliga a adivinar.
 */
const REJECTED_DATUMS: ReadonlyArray<{ match: RegExp; label: string; why: string }> = [
  {
    match: /NAD[_\s]?1927|NORTH[_\s]AMERICAN[_\s]1927|NAD27/i,
    label: "NAD27",
    why:
      "NAD27 está a cientos de metros de WGS84 en México y su conversión decente necesita " +
      "rejillas de corrección que este producto no incorpora. Reproyecta el archivo en el " +
      "programa que lo generó y vuelve a traerlo en WGS84 o ITRF.",
  },
  {
    match: /NAD[_\s]?1983|NORTH[_\s]AMERICAN[_\s]1983|NAD83/i,
    label: "NAD83",
    why:
      "NAD83 está a un par de metros de WGS84. Para un plano de conjunto puede dar igual; " +
      "para un lindero no, y este módulo no adivina cuál de los dos casos es el tuyo.",
  },
];

/**
 * Identifica el sistema de referencia declarado en un WKT de `.prj`.
 *
 * NO es un analizador de WKT completo, y decirlo importa: se buscan el nombre
 * del sistema proyectado, el del datum y —si está— el código de autoridad. Con
 * eso basta para los archivos que produce el mundo real (ArcGIS, QGIS, los
 * equipos de topografía), y lo que no encaje se rechaza en vez de aproximarse.
 *
 * El caso peligroso que esto cierra: un `.prj` que dice NAD27. Sin leerlo, sus
 * coordenadas entrarían como si fueran WGS84 y el predio aparecería a doscientos
 * metros de donde está, con toda la geometría correcta.
 */
export function parseGeoCrsWkt(wkt: string): GeoCrs {
  const text = wkt.trim();
  geoAssert(text.length > 0, "crs-desconocido", "El archivo .prj está vacío.", {});

  for (const rejected of REJECTED_DATUMS)
    if (rejected.match.test(text))
      throw new GeoError(
        "crs-no-soportado",
        `El archivo está en ${rejected.label}. ${rejected.why}`,
        { detail: { datum: rejected.label } },
      );

  // Código de autoridad al final del WKT: AUTHORITY["EPSG","32614"].
  const authority = /AUTHORITY\s*\[\s*"EPSG"\s*,\s*"(\d{4,5})"\s*\]\s*\]?\s*$/i.exec(text);
  if (authority) return resolveGeoCrs(`EPSG:${authority[1]}`);

  const datum = detectDatum(text);
  if (/^\s*GEOGCS/i.test(text)) {
    geoAssert(
      /PRIMEM\s*\[\s*"?Greenwich/i.test(text) || !/PRIMEM/i.test(text),
      "crs-no-soportado",
      "El archivo usa un meridiano de origen distinto de Greenwich. No está soportado.",
      {},
    );
    return datum === "WGS84"
      ? GEO_CRS_WGS84
      : { ...GEO_CRS_WGS84, id: `${datum}/geográfico`, name: `${datum} geográfico`, datum, ellipsoid: DATUM_ELLIPSOID[datum] };
  }

  geoAssert(
    /PROJECTION\s*\[\s*"?Transverse[_\s]?Mercator/i.test(text),
    "crs-no-soportado",
    "El .prj declara una proyección que no es la transversa de Mercator. Este producto sólo " +
      "reproyecta UTM y geográfico.",
    {},
  );
  const centralMeridian = wktParameter(text, "central_meridian") ?? wktParameter(text, "longitude_of_center");
  geoAssert(
    centralMeridian !== undefined,
    "crs-desconocido",
    "El .prj declara una transversa de Mercator sin meridiano central legible.",
    {},
  );
  const scale = wktParameter(text, "scale_factor");
  geoAssert(
    scale === undefined || Math.abs(scale - GEO_UTM_SCALE_FACTOR) < 1e-9,
    "crs-no-soportado",
    `El .prj declara un factor de escala ${scale} y este producto sólo reproyecta la retícula ` +
      `UTM estándar (${GEO_UTM_SCALE_FACTOR}).`,
    { detail: { scale: scale ?? "" } },
  );
  const falseEasting = wktParameter(text, "false_easting");
  geoAssert(
    falseEasting === undefined || Math.abs(falseEasting - GEO_UTM_FALSE_EASTING_M) < 1e-6,
    "crs-no-soportado",
    `El .prj declara un falso este de ${falseEasting} m, distinto del de la retícula UTM.`,
    { detail: { falseEasting: falseEasting ?? "" } },
  );
  const falseNorthing = wktParameter(text, "false_northing");
  geoAssert(
    falseNorthing === undefined || Math.abs(falseNorthing) < 1e-6,
    "crs-no-soportado",
    "El .prj declara un falso norte distinto de cero: es una zona del hemisferio sur y este " +
      "producto sólo verifica las del norte.",
    { detail: { falseNorthing: falseNorthing ?? "" } },
  );

  const zone = (centralMeridian! + 183) / 6;
  geoAssert(
    Number.isInteger(zone),
    "crs-no-soportado",
    `El meridiano central ${centralMeridian}° no corresponde a ninguna zona UTM.`,
    { detail: { centralMeridian: centralMeridian! } },
  );
  return geoUtmCrs(zone, datum);
}

function detectDatum(wkt: string): GeoDatumId {
  if (/ITRF[_\s]?2020/i.test(wkt)) return "ITRF2020";
  if (/ITRF[_\s]?2008/i.test(wkt)) return "ITRF2008";
  if (/ITRF[_\s]?92/i.test(wkt)) return "ITRF92";
  if (/WGS[_\s]?(?:19)?84/i.test(wkt)) return "WGS84";
  throw new GeoError(
    "crs-desconocido",
    "El .prj no declara ningún datum que este producto reconozca. No se supone WGS84: suponerlo " +
      "es la forma más barata de equivocarse en cientos de metros sin que nada avise.",
    {},
  );
}

function wktParameter(wkt: string, name: string): number | undefined {
  const match = new RegExp(`PARAMETER\\s*\\[\\s*"${name}"\\s*,\\s*(-?[\\d.eE+]+)\\s*\\]`, "i").exec(wkt);
  return match ? Number(match[1]) : undefined;
}
