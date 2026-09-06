#!/usr/bin/env python3
"""ORACULO D: pyproj (que envuelve PROJ) mide la reproyeccion geografica.

── Por que hacia falta este oraculo ─────────────────────────────────────────

`apps/web/src/lib/geo/crs.ts` reproyecta WGS84 geografico <-> UTM zonas 11N a
16N con la serie de Kruger (Karney 2011). `crs.spec.ts` ya la contrasta por
caminos independientes DENTRO del propio repositorio -cuadratura de
Gauss-Legendre, serie de Snyder, diferencias finitas- y eso es exactamente la
"evidencia fabricada por casa" que la regla del corte del 2026-08-22 no deja
llegar al tope de la fila: los tres caminos los escribimos y los ejecutamos
nosotros.

PROJ es la implementacion de referencia del mundo GIS para el EPSG y para la
transversa de Mercator; `pyproj` es su envoltura oficial en Python. Aqui NO se
le pide que opine sobre el metodo: se le pide que TRANSFORME el mismo juego de
puntos que usa `crs.spec.ts`, con su propio codigo, en su propio lenguaje, y
que el juicio -¿coincide?- lo haga el spec de TypeScript.

── Dos filas, un solo trabajo ───────────────────────────────────────────────

Este censo sirve a DOS criterios de la rubrica competitiva:

  1. `geo.crs` (fila "Nubes de puntos, raster georreferenciado y GIS"): la
     malla de control de Mexico, la MISMA que `crs.spec.ts` genera con su
     propia formula (mexicoControlGrid), reproyectada aqui con PROJ.
  2. `toolset-map3d.georreferencia` (fila "Toolset Map 3D"): un shapefile
     PUBLICO de verdad -Natural Earth, dominio publico, ver
     docs/cad/corpus/licencias/natural-earth-vector-PUBLIC-DOMAIN.md- leido
     por el lector de PRODUCCION (`readShapefile` de
     apps/web/src/lib/geo/shapefile.ts) y reproyectado con PROJ. No es un
     shapefile que este proyecto escribiera: es material de terceros con
     geometria que nadie de aqui inventa.

── El limite que hay que decir antes que ninguna otra cosa ──────────────────

`pyproj` en su version instalada (3.7.2) usa PROJ 9.5.1 internamente, y PROJ
resuelve la transversa de Mercator con el MISMO metodo de fondo que Karney
(2011) -series de Kruger-Engsager-Poder de orden alto-, asi que una
coincidencia aqui no prueba "otro metodo matematico da lo mismo": eso ya lo
prueban Snyder y la cuadratura DENTRO de `crs.spec.ts`. Lo que este oraculo
prueba es mas simple y no menos util: OTRA IMPLEMENTACION, en OTRO LENGUAJE,
escrita por OTRAS PERSONAS, sin una linea de codigo en comun con
`apps/web/src/lib/geo/crs.ts`, transforma el mismo punto al mismo sitio. Es
exactamente el mismo papel que `steputils` hace para el kernel 3D.

── Como se usa ───────────────────────────────────────────────────────────────

    python3 docs/cad/corpus/oraculos/censo-pyproj.py
    python3 docs/cad/corpus/oraculos/censo-pyproj.py --destino RUTA

Cada punto queda anclado por su propia coordenada de entrada (no hay bytes que
hashear como en un DXF o un STEP: la entrada es la formula de la malla, que
los dos lados -TS y Python- ejecutan igual, y el shapefile ajeno, cuyos bytes
SI se hashean). Los especs de TypeScript regeneran la malla con la MISMA
formula, releen el shapefile ajeno con el lector de produccion, y comparan
magnitud a magnitud contra lo que este censo congelo.
"""
import hashlib
import json
import math
import pathlib
import struct
import sys

import pyproj
from pyproj import __proj_version__ as PROJ_VERSION

DESTINO = pathlib.Path(__file__).with_name("pyproj-3.7.2.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

ESPERADA = "3.7.2"
if pyproj.__version__ != ESPERADA:
    sys.exit(f"pyproj {pyproj.__version__} instalada; este censo declara {ESPERADA}")

RAIZ = pathlib.Path(__file__).resolve().parents[4]
NATURAL_EARTH_SHP = RAIZ / "docs/cad/corpus/terceros-gis/natural-earth/ne_110m_populated_places_simple.shp"

# ─────────────────────────────────────────────────────────────────────────────
# La misma zonificacion que apps/web/src/lib/geo/crs.ts, reescrita en Python
# ─────────────────────────────────────────────────────────────────────────────

MEXICO_UTM_ZONES = [11, 12, 13, 14, 15, 16]
MAX_MERIDIAN_OFFSET_DEG = 6
MIN_LATITUDE_DEG = -80
MAX_LATITUDE_DEG = 84


def central_meridian(zone):
    return 6 * zone - 183


def normalize_longitude_delta(delta_deg):
    wrapped = ((delta_deg + 180) % 360 + 360) % 360 - 180
    return 180 if wrapped == -180 else wrapped


def utm_zone_for_longitude(longitude_deg):
    """Traduccion literal de geoUtmZoneForLongitude en crs.ts."""
    normalized = ((longitude_deg + 180) % 360 + 360) % 360 - 180
    return math.floor((normalized + 180) / 6) + 1


def in_mexico_domain(longitude_deg, latitude_deg):
    """Las mismas dos comprobaciones que geodeticToUtm hace antes de proyectar."""
    if not (MIN_LATITUDE_DEG <= latitude_deg <= MAX_LATITUDE_DEG):
        return False, None
    zone = utm_zone_for_longitude(longitude_deg)
    if zone not in MEXICO_UTM_ZONES:
        return False, None
    offset = normalize_longitude_delta(longitude_deg - central_meridian(zone))
    if abs(offset) > MAX_MERIDIAN_OFFSET_DEG:
        return False, None
    return True, zone


# ─────────────────────────────────────────────────────────────────────────────
# ACTO 1 · La malla de control de crs.spec.ts, reproyectada con PROJ
# ─────────────────────────────────────────────────────────────────────────────


def mexico_control_grid(step_deg=1):
    """Traduccion literal de mexicoControlGrid() en crs.spec.ts."""
    points = []
    latitude = 14
    while latitude <= 33:
        longitude = -118
        while longitude <= -86:
            zone = utm_zone_for_longitude(longitude)
            if zone in MEXICO_UTM_ZONES:
                points.append((round(longitude, 10), round(latitude, 10), zone))
            longitude += step_deg
        latitude += step_deg
    return points


transformers = {
    zone: pyproj.Transformer.from_crs("EPSG:4326", f"EPSG:{32600 + zone}", always_xy=True)
    for zone in MEXICO_UTM_ZONES
}
inverse_transformers = {
    zone: pyproj.Transformer.from_crs(f"EPSG:{32600 + zone}", "EPSG:4326", always_xy=True)
    for zone in MEXICO_UTM_ZONES
}


def redondea(valor):
    """Nueve decimales: el mismo redondeo que censo-steputils.py usa, por la misma razon."""
    return round(float(valor) + 0.0, 9)


grid = mexico_control_grid()
grid_out = []
for lon, lat, zone in grid:
    easting, northing = transformers[zone].transform(lon, lat)
    grid_out.append(
        {
            "lonDeg": lon,
            "latDeg": lat,
            "zone": zone,
            "epsg": f"EPSG:{32600 + zone}",
            "easting": redondea(easting),
            "northing": redondea(northing),
        }
    )

# ─────────────────────────────────────────────────────────────────────────────
# ACTO 2 · El shapefile ajeno: Natural Earth, dominio publico
# ─────────────────────────────────────────────────────────────────────────────


def lee_puntos_shp(ruta):
    """Lector minimo del tipo de forma 1 (Point), ESRI Shapefile Technical
    Description J-7855. Deliberadamente NO usa `apps/web/src/lib/geo/shapefile.ts`
    -eso lo hace el spec de TypeScript- ni ninguna biblioteca de shapefiles: es
    la SEGUNDA lectura independiente de los mismos bytes, en otro lenguaje."""
    datos = ruta.read_bytes()
    codigo = struct.unpack(">i", datos[0:4])[0]
    version = struct.unpack("<i", datos[28:32])[0]
    tipo = struct.unpack("<i", datos[32:36])[0]
    if codigo != 9994 or version != 1000:
        raise ValueError(f"no es un shapefile ESRI valido: codigo={codigo} version={version}")
    if tipo != 1:
        raise ValueError(f"este censo solo lee el tipo Point (1); el archivo declara {tipo}")

    puntos = []
    offset = 100
    indice = 0
    while offset < len(datos):
        numero_registro = struct.unpack(">i", datos[offset : offset + 4])[0]
        longitud_contenido = struct.unpack(">i", datos[offset + 4 : offset + 8])[0]
        contenido_offset = offset + 8
        tipo_registro = struct.unpack("<i", datos[contenido_offset : contenido_offset + 4])[0]
        if tipo_registro != 1:
            raise ValueError(f"registro {numero_registro}: tipo {tipo_registro}, se esperaba Point")
        x, y = struct.unpack("<2d", datos[contenido_offset + 4 : contenido_offset + 20])
        puntos.append({"indice": indice, "numeroRegistro": numero_registro, "lonDeg": x, "latDeg": y})
        offset = contenido_offset + longitud_contenido * 2
        indice += 1
    return puntos


todos_los_puntos = lee_puntos_shp(NATURAL_EARTH_SHP)

en_rango = []
for punto in todos_los_puntos:
    dentro, zone = in_mexico_domain(punto["lonDeg"], punto["latDeg"])
    if not dentro:
        continue
    easting, northing = transformers[zone].transform(punto["lonDeg"], punto["latDeg"])
    lon_vuelta, lat_vuelta = inverse_transformers[zone].transform(easting, northing)
    en_rango.append(
        {
            "indice": punto["indice"],
            "numeroRegistro": punto["numeroRegistro"],
            "lonDeg": redondea(punto["lonDeg"]),
            "latDeg": redondea(punto["latDeg"]),
            "zone": zone,
            "epsg": f"EPSG:{32600 + zone}",
            "easting": redondea(easting),
            "northing": redondea(northing),
            "idaYVuelta": {"lonDeg": redondea(lon_vuelta), "latDeg": redondea(lat_vuelta)},
        }
    )

sha256_archivos = {
    nombre: hashlib.sha256((NATURAL_EARTH_SHP.parent / f"ne_110m_populated_places_simple.{ext}").read_bytes()).hexdigest()
    for nombre, ext in [("shp", "shp"), ("shx", "shx"), ("dbf", "dbf"), ("prj", "prj"), ("cpg", "cpg")]
}

censo = {
    "oraculo": "D",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-pyproj.py",
    "mide": (
        "Dos cosas con la misma herramienta: (1) la malla de control de Mexico que "
        "crs.spec.ts genera con su propia formula, reproyectada por PROJ; (2) un "
        "shapefile PUBLICO de terceros (Natural Earth, dominio publico) reproyectado "
        "por PROJ. Sirve a dos filas de la rubrica: geo.crs y "
        "toolset-map3d.georreferencia."
    ),
    "herramienta": {
        "nombre": "pyproj",
        "version": pyproj.__version__,
        "projVersion": PROJ_VERSION,
        "lenguaje": "Python 3.11 (envoltura de la biblioteca C PROJ)",
        "autor": "Jeffrey Whitaker (2006-2018); mantenedores de pyproj (2019-)",
        "licencia": "MIT",
        "licenciaBundledProj": "MIT (Frank Warmerdam / Gerald Evenden), PROJ",
        "origen": "PyPI (pip install pyproj==3.7.2)",
        "instaladoEl": "2026-09-06",
        "sha256Rueda": "281cb92847814e8018010c48b4069ff858a30236638631c1a91dd7bfa68f8a8a",
        "sha256Licencia": "a652687151814d4c4715445912fcb49e7e58f5b248d47a1a88b859a8815e0822",
        "sha256LicenciaProj": "ac9caff7979c906774d756815d1d473145284ba7ba9a5ef1c5fa77e6a30cef82",
        "registro": "docs/cad/corpus/oraculos/HERRAMIENTAS.md#pyproj-3-7-2",
        "porQueCuentaComoIndependiente": (
            "PROJ es la implementacion de referencia del mundo GIS para EPSG y para la "
            "transversa de Mercator, mantenida por OSGeo desde los años 80 (linaje "
            "Evenden/Warmerdam), sin una linea de codigo en comun con "
            "apps/web/src/lib/geo/crs.ts. pyproj es su envoltura oficial en Python."
        ),
        "limiteDeSuIndependencia": (
            "PROJ resuelve la transversa de Mercator con el mismo metodo de fondo que "
            "Karney (2011) -series de Kruger-Engsager-Poder-, igual que crs.ts. Una "
            "coincidencia aqui acredita OTRA IMPLEMENTACION en otro lenguaje, no OTRO "
            "METODO matematico: eso ya lo prueban Snyder y la cuadratura de "
            "Gauss-Legendre que crs.spec.ts trae por dentro."
        ),
    },
    "advertencia": (
        "NO ESTA INSTALADA EN CI. Esta lectura se hizo en la maquina declarada y se "
        "congela aqui. El spec vuelve a correrla si la herramienta esta presente; "
        "cuando no esta, declara la ausencia en vez de fingir la medicion."
    ),
    "loQueNoAcredita": (
        "pyproj/PROJ no son AutoCAD Map 3D ni ningun software comercial de topografia. "
        "Acreditan que la reproyeccion coincide con la implementacion de referencia del "
        "mundo GIS, no compatibilidad con un producto concreto."
    ),
    "grid": {
        "definicion": {
            "formula": "mexicoControlGrid() de crs.spec.ts: lat 14..33 paso 1, lon -118..-86 paso 1, filtrado a zonas 11..16",
            "latMinDeg": 14,
            "latMaxDeg": 33,
            "lonMinDeg": -118,
            "lonMaxDeg": -86,
            "stepDeg": 1,
        },
        "puntos": len(grid_out),
        "porZona": {
            str(zone): sum(1 for p in grid_out if p["zone"] == zone) for zone in MEXICO_UTM_ZONES
        },
        "resultados": grid_out,
    },
    "naturalEarth": {
        "fuente": "docs/cad/corpus/terceros-gis/natural-earth/ne_110m_populated_places_simple.shp",
        "licencia": "Dominio publico (Natural Earth)",
        "licenciaArchivo": "docs/cad/corpus/licencias/natural-earth-vector-PUBLIC-DOMAIN.md",
        "repositorio": "https://github.com/nvkelso/natural-earth-vector",
        "commit": "ca96624a56bd078437bca8184e78163e5039ad19",
        "sha256": sha256_archivos,
        "totalPuntosEnElArchivo": len(todos_los_puntos),
        "puntosEnRangoMexico": len(en_rango),
        "resultados": en_rango,
    },
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
print(
    f"censo pyproj {pyproj.__version__} (PROJ {PROJ_VERSION}): {len(grid_out)} puntos de malla, "
    f"{len(en_rango)}/{len(todos_los_puntos)} puntos de Natural Earth en el dominio de Mexico -> {DESTINO.name}"
)
