#!/usr/bin/env python3
"""Medidas del ORACULO B sobre el plano ajeno `bjnortier-dxf/floorplan.dxf`.

El censo hermano (`censo-ezdxf.py`) CUENTA entidades. Este script las MIDE:
longitudes, radios, barridos, valores de cota y extension del dibujo, leidos
con `ezdxf` (MIT, Manfred Moitzi) sobre los mismos bytes que abre el lector de
Valle. Es el oraculo contra el que `verification/terceros-jornada.spec.ts`
contrasta lo que mide el producto: una medicion contra otra implementacion, no
contra una corrida anterior del producto.

Uso:  python3 docs/cad/corpus/oraculos/medidas-floorplan.py
      (escribe medidas-floorplan-ezdxf.json)

── Que mas mide, y por que hace falta ─────────────────────────────────────

La jornada no termina al abrir: el spec MODIFICA el plano y lo EXPORTA con el
exportador de produccion a `<tmp>/valle-jornada-*.dxf`. Si esos archivos
existen cuando este script corre, tambien se miden — asi el artefacto dice si
lo que Valle escribe lo abre un programa que no es Valle, y con que numeros.
Correr el spec ANTES que este script es lo que los genera:

  cd apps/web && npx tsx src/lib/cad/verification/terceros-jornada.spec.ts
  python3 docs/cad/corpus/oraculos/medidas-floorplan.py

Cada archivo medido queda anclado a su sha256. El spec vuelve a exportar y
compara el hash: si no cuadra, la medicion congelada ya no habla de esos bytes
y el spec lo dice en vez de creersela.

── La prueba del parche (P-evidencia-07) ──────────────────────────────────

`ezdxf` NO abre lo que exporta Valle: MTEXT y HATCH salen sin sus marcadores
de subclase (`100 AcDbEntity`, `100 AcDbMText` / `100 AcDbHatch`) y la
biblioteca revienta al cargarlos, aunque la cabecera declare AC1015 —dialecto
en el que esos marcadores son obligatorios—. Para que la peticion no proponga
un arreglo a ciegas, este script INSERTA esos marcadores sobre el texto ya
exportado (sin tocar el producto) y vuelve a leerlo: lo que salga de ahi es la
prueba medida de que el arreglo basta, o de que no.
"""
import collections
import hashlib
import io
import json
import math
import pathlib
import sys
import tempfile

import ezdxf
from ezdxf.lldxf.const import acad_release

RAIZ = pathlib.Path(__file__).resolve().parents[4]
CORPUS = RAIZ / "docs/cad/corpus"
PLANO = CORPUS / "terceros/bjnortier-dxf/floorplan.dxf"
DESTINO = pathlib.Path(__file__).with_name("medidas-floorplan-ezdxf.json")

ESPERADA = "1.4.4"
if ezdxf.__version__ != ESPERADA:
    sys.exit(f"ezdxf {ezdxf.__version__} instalada; estas medidas declaran {ESPERADA}")

# Los decimales del artefacto. El fichero de origen escribe SEIS decimales y el
# lector de Valle proyecta OCS->WCS, lo que mete ruido de coma flotante muy por
# debajo de eso. Doce decimales publican ese ruido en vez de esconderlo: el
# redondeo aporta como mucho 5e-13, asi que la tolerancia del spec (1e-9) mide
# desacuerdo de verdad y no el redondeo de este artefacto.
DECIMALES = 12


def r(valor):
    return round(float(valor), DECIMALES)


def clave_punto(x, y):
    """Clave geometrica de un punto, a seis decimales — los del fichero."""
    return f"{x:.6f},{y:.6f}"


def clave_segmento(a, b):
    """Clave de una linea, con los extremos ORDENADOS.

    El sentido en que este dibujada una linea no la hace otra linea: sin
    ordenar, la misma pared leida al reves seria una clave distinta y la
    comparacion por geometria se caeria por un detalle que no significa nada.
    """
    p, q = clave_punto(a[0], a[1]), clave_punto(b[0], b[1])
    return f"{p}|{q}" if p <= q else f"{q}|{p}"


def longitud_polilinea(puntos, cerrada):
    """Longitud de una polilinea con bulges, por la formula del arco.

    Un bulge `b` es la tangente de un cuarto del angulo barrido: el barrido es
    `4*atan(|b|)` y el radio, `cuerda / (2*sin(barrido/2))`. Medir la cuerda en
    vez del arco es el error clasico, y en este plano hay cuatro polilineas con
    bulge donde se notaria.
    """
    total = 0.0
    n = len(puntos)
    ultimo = n if cerrada else n - 1
    for i in range(ultimo):
        x1, y1, b = puntos[i]
        x2, y2, _ = puntos[(i + 1) % n]
        cuerda = math.hypot(x2 - x1, y2 - y1)
        if abs(b) < 1e-12 or cuerda == 0:
            total += cuerda
            continue
        barrido = 4 * math.atan(abs(b))
        radio = cuerda / (2 * math.sin(barrido / 2))
        total += radio * barrido
    return total


def puntos_de(entidad):
    """Vertices `(x, y, bulge)` de una polilinea, ligera o pesada."""
    tipo = entidad.dxftype()
    if tipo == "LWPOLYLINE":
        return [(p[0], p[1], p[4]) for p in entidad.get_points()], bool(entidad.closed)
    puntos = []
    for vertice in entidad.vertices:
        loc = vertice.dxf.location
        puntos.append((loc.x, loc.y, vertice.dxf.get("bulge", 0.0)))
    return puntos, bool(entidad.is_closed)


def mide(doc, etiqueta, sha, tamano):
    msp = doc.modelspace()
    entidades = list(msp)
    conteo = dict(sorted(collections.Counter(e.dxftype() for e in entidades).items()))

    lineas, circulos, arcos, polilineas, cotas = [], [], [], [], []
    minx = miny = math.inf
    maxx = maxy = -math.inf

    for e in entidades:
        tipo = e.dxftype()
        if tipo == "LINE":
            a, b = e.dxf.start, e.dxf.end
            lineas.append([clave_segmento((a.x, a.y), (b.x, b.y)), r(math.dist((a.x, a.y), (b.x, b.y)))])
            for x, y in ((a.x, a.y), (b.x, b.y)):
                minx, miny, maxx, maxy = min(minx, x), min(miny, y), max(maxx, x), max(maxy, y)
        elif tipo == "CIRCLE":
            c = e.dxf.center
            circulos.append([clave_punto(c.x, c.y), r(e.dxf.radius)])
        elif tipo == "ARC":
            c = e.dxf.center
            inicio, fin = e.dxf.start_angle, e.dxf.end_angle
            barrido = (fin - inicio) % 360.0
            if barrido == 0.0:
                barrido = 360.0
            arcos.append(
                [
                    clave_punto(c.x, c.y),
                    r(e.dxf.radius),
                    r(barrido),
                    r(e.dxf.radius * math.radians(barrido)),
                ]
            )
        elif tipo in ("LWPOLYLINE", "POLYLINE"):
            puntos, cerrada = puntos_de(e)
            if not puntos:
                continue
            # Vertices EN EL FICHERO y vertices NORMALIZADOS. Una polilinea
            # cerrada cuyo ultimo vertice repite el primero tiene un vertice de
            # mas que no dibuja nada: el lector de Valle lo colapsa y hace bien
            # (el tramo que elimina mide cero). Publicar los dos numeros es lo
            # que permite comparar sin llamar perdida a una normalizacion.
            repetido = (
                cerrada
                and len(puntos) > 2
                and abs(puntos[-1][0] - puntos[0][0]) < 1e-9
                and abs(puntos[-1][1] - puntos[0][1]) < 1e-9
            )
            polilineas.append(
                [
                    clave_punto(puntos[0][0], puntos[0][1]),
                    len(puntos),
                    len(puntos) - 1 if repetido else len(puntos),
                    cerrada,
                    r(longitud_polilinea(puntos, cerrada)),
                ]
            )
            for x, y, _ in puntos:
                minx, miny, maxx, maxy = min(minx, x), min(miny, y), max(maxx, x), max(maxy, y)
        elif tipo == "DIMENSION":
            try:
                medida = r(e.get_measurement())
            except Exception as error:  # noqa: BLE001 — el fallo ES el dato
                medida = f"{type(error).__name__}: {error}"
            # La clave de una cota son sus DOS PUNTOS MEDIDOS (codigos 13 y 14),
            # no el punto de la linea de cota (codigo 10): son los que fijan la
            # magnitud, y son los mismos dos que el lector de Valle guarda como
            # `a` y `b`. Con el codigo 10 la comparacion no tendria pareja.
            a = e.dxf.get("defpoint2", None)
            b = e.dxf.get("defpoint3", None)
            if a is not None and b is not None:
                clave = clave_segmento((a.x, a.y), (b.x, b.y))
            else:
                punto = e.dxf.get("defpoint", None)
                clave = clave_punto(punto.x, punto.y) if punto is not None else ""
            cotas.append([clave, e.dxf.get("dimtype", None), medida])

    lineas.sort()
    circulos.sort()
    arcos.sort()
    polilineas.sort()
    cotas.sort(key=lambda fila: (fila[0], str(fila[2])))

    return {
        "etiqueta": etiqueta,
        "sha256": sha,
        "bytes": tamano,
        "leido": True,
        "dialecto": doc.dxfversion,
        "version": acad_release.get(doc.dxfversion, doc.dxfversion),
        "insunits": doc.header.get("$INSUNITS"),
        "capasDeclaradas": len(doc.layers),
        # Los NOMBRES, no solo cuantas: la jornada compara la tabla del fichero
        # ajeno con la del fichero que devolvemos, y para eso hacen falta los
        # nombres. Aviso para quien lea esta lista en un fichero ESCRITO por
        # Valle: `ezdxf.readfile` anade por su cuenta las capas estandar que
        # falten (`Defpoints`), asi que ahi esta lista dice mas de lo que el
        # fichero trae. Para juzgar lo que escribimos vale el oraculo A, que
        # solo devuelve lo que esta escrito.
        "capas": sorted(capa.dxf.name for capa in doc.layers),
        "estilosDeCota": len(doc.dimstyles),
        "tiposDeLinea": len(doc.linetypes),
        "espacioModelo": conteo,
        "lineas": {
            "n": len(lineas),
            "longitudTotal": r(sum(fila[1] for fila in lineas)),
            "porGeometria": lineas,
        },
        "circulos": {"n": len(circulos), "porGeometria": circulos},
        "arcos": {
            "n": len(arcos),
            "longitudTotal": r(sum(fila[3] for fila in arcos)),
            "porGeometria": arcos,
        },
        "polilineas": {
            "n": len(polilineas),
            "cerradas": sum(1 for fila in polilineas if fila[3]),
            "conVerticeDeCierreRepetido": sum(1 for fila in polilineas if fila[1] != fila[2]),
            "longitudTotal": r(sum(fila[4] for fila in polilineas)),
            "porGeometria": polilineas,
        },
        "cotas": {"n": len(cotas), "porGeometria": cotas},
        "extension": (
            {"minX": r(minx), "minY": r(miny), "maxX": r(maxx), "maxY": r(maxy)}
            if lineas or polilineas
            else None
        ),
    }


def medida_de_archivo(ruta, etiqueta):
    datos = ruta.read_bytes()
    sha = hashlib.sha256(datos).hexdigest()
    try:
        doc = ezdxf.readfile(ruta)
    except Exception as error:  # noqa: BLE001 — el rechazo ES el dato
        return {
            "etiqueta": etiqueta,
            "sha256": sha,
            "bytes": len(datos),
            "leido": False,
            "error": f"{type(error).__name__}: {error}",
        }
    medida = mide(doc, etiqueta, sha, len(datos))
    auditoria = doc.audit()
    medida["auditoria"] = {"errores": len(auditoria.errors), "correcciones": len(auditoria.fixes)}
    return medida


# ── El parche de subclases, como EXPERIMENTO ────────────────────────────────
SUBCLASES = {"MTEXT": "AcDbMText", "HATCH": "AcDbHatch"}
# Codigos que en R2000 pertenecen a la subclase AcDbEntity y por tanto van
# ANTES del marcador de la subclase concreta.
PREAMBULO = {"5", "8", "6", "62", "48", "67", "370", "410", "420", "440", "330", "100"}


def parche_subclases(texto):
    """Inserta `100 AcDbEntity` y `100 AcDb<Tipo>` en MTEXT y HATCH que no los traigan.

    No toca el producto: opera sobre el texto ya exportado. Era la mitad
    medible de la peticion P-evidencia-07 — si tras esto `ezdxf` abria el
    archivo, el arreglo propuesto era exactamente ese y no una conjetura.

    P-evidencia-07 ENTRO el 2026-09-05 y el producto ya escribe los dos
    marcadores, asi que este experimento se queda como CONTROL: cuenta cuantas
    entidades hubo que parchear, y el numero correcto es ahora cero. Saltarse
    las que ya los traen no es cortesia — sin eso el parche los DUPLICA y
    rompe el archivo, que fue exactamente lo que paso la primera vez que se
    corrio este script despues del arreglo.
    """
    lineas = texto.split("\n")
    pares = [(lineas[i].strip(), lineas[i + 1] if i + 1 < len(lineas) else "") for i in range(0, len(lineas) - 1, 2)]
    salida = []
    i = 0
    parcheadas = 0
    yaLosTraian = 0
    while i < len(pares):
        codigo, valor = pares[i]
        salida.append((codigo, valor))
        if codigo == "0" and valor.strip() in SUBCLASES:
            tipo = valor.strip()
            # ¿Los trae ya? Se mira el preambulo de ESTA entidad, hasta el
            # siguiente `0`, sin consumirlo: si el marcador esta, no se toca.
            j = i + 1
            preambulo = []
            while j < len(pares) and pares[j][0] != "0":
                preambulo.append(pares[j])
                j += 1
            if any(c == "100" and v.strip() == SUBCLASES[tipo] for c, v in preambulo):
                yaLosTraian += 1
                i += 1
                continue
            salida.append(("100", "AcDbEntity"))
            i += 1
            while i < len(pares) and pares[i][0] in PREAMBULO:
                salida.append(pares[i])
                i += 1
            salida.append(("100", SUBCLASES[tipo]))
            parcheadas += 1
            continue
        i += 1
    return "\n".join(f"{c}\n{v}" for c, v in salida) + "\n", parcheadas, yaLosTraian


TMP = pathlib.Path(tempfile.gettempdir())
EXPORTADOS = [
    ("jornada-completa", "El plano ajeno abierto, movido, ampliado y exportado entero."),
    ("jornada-sin-mtext-ni-hatch", "Lo mismo sin los dos tipos que el oraculo B rechaza."),
    ("jornada-solo-mtext", "Solo los MTEXT de espacio modelo, para aislar el fallo."),
    ("jornada-solo-hatch", "Solo los HATCH de espacio modelo, para aislar el fallo."),
]

archivos = [medida_de_archivo(PLANO, "origen/floorplan.dxf")]
ausentes = []
for nombre, porQue in EXPORTADOS:
    ruta = TMP / f"valle-{nombre}.dxf"
    if ruta.exists():
        fila = medida_de_archivo(ruta, f"exportado/{nombre}")
        # El porque de cada fichero viaja con su medida: sin el, «solo-hatch»
        # seria un nombre de archivo y no una pregunta.
        fila["porQue"] = porQue
        archivos.append(fila)
    else:
        ausentes.append(str(ruta))

experimento = None
completa = TMP / "valle-jornada-completa.dxf"
if completa.exists():
    texto, parcheadas, yaLosTraian = parche_subclases(completa.read_text(encoding="utf8"))
    fila = {
        "entidadesParcheadas": parcheadas,
        "entidadesQueYaLosTraian": yaLosTraian,
        "queSignifica": (
            "Este experimento existia para PROBAR P-evidencia-07 antes de pedirla: parcheaba los "
            "marcadores de subclase sobre el texto ya exportado y volvia a leerlo. Desde que el "
            "producto los escribe (2026-09-05) es un CONTROL, y su lectura correcta es "
            "entidadesParcheadas = 0 con entidadesQueYaLosTraian = todas."
        ),
        "sha256Origen": hashlib.sha256(completa.read_bytes()).hexdigest(),
    }
    try:
        doc = ezdxf.read(io.StringIO(texto))
        auditoria = doc.audit()
        fila.update(
            leido=True,
            espacioModelo=dict(sorted(collections.Counter(e.dxftype() for e in doc.modelspace()).items())),
            auditoria={"errores": len(auditoria.errors), "correcciones": len(auditoria.fixes)},
        )
    except Exception as error:  # noqa: BLE001
        fila.update(leido=False, error=f"{type(error).__name__}: {error}")
    experimento = fila

medidas = {
    "oraculo": "B",
    "generadoPor": "python3 docs/cad/corpus/oraculos/medidas-floorplan.py",
    "herramienta": {
        "nombre": "ezdxf",
        "version": ezdxf.__version__,
        "lenguaje": "Python 3.11",
        "autor": "Manfred Moitzi",
        "licencia": "MIT",
        "porQueCuentaComoIndependiente": (
            "Otro autor, otra lengua y otro camino. Y aqui importa el doble que en el censo: el "
            "oraculo A (dxf-parser) COMPARTE motor de analisis con el lector de Valle, asi que "
            "contra el no se puede medir si el analisis del fichero ajeno es correcto — solo si la "
            "conversion lo es. Estas magnitudes salen de un analizador que no toca este proyecto."
        ),
    },
    "advertencia": (
        "NO ESTA INSTALADA EN CI. Estas medidas se tomaron una vez y se congelan aqui, ancladas al "
        "sha256 de los bytes medidos. El spec que las consume comprueba ese hash antes de creerselas."
    ),
    "unidades": (
        "Unidades de dibujo del fichero. floorplan.dxf declara $INSUNITS 4; las magnitudes se "
        "publican tal cual, sin convertir, porque convertirlas seria interpretar el plano de otro."
    ),
    "decimales": DECIMALES,
    "camposPorGeometria": {
        "lineas": "[clave(extremos ordenados), longitud]",
        "circulos": "[clave(centro), radio]",
        "arcos": "[clave(centro), radio, barridoEnGrados, longitudDeArco]",
        "polilineas": "[clave(primer vertice), verticesEnFichero, verticesNormalizados, cerrada, longitud]",
        "cotas": "[clave(los dos puntos medidos, codigos 13 y 14), dimtype, medidaSegunEzdxf]",
    },
    "clavesRepetidas": (
        "Un plano de verdad tiene entidades coincidentes: en floorplan.dxf hay 18 claves de linea, "
        "3 de polilinea y 4 de cota con mas de un ejemplar. La comparacion es por BOLSA: cada clave "
        "tiene que traer el mismo numero de ejemplares en las dos lecturas y sus magnitudes se "
        "comparan ordenadas, una a una. Emparejar por la mas parecida habria tapado una perdida."
    ),
    "clavesGeometricas": (
        "Cada magnitud viaja con una CLAVE de su geometria (extremos de la linea, centro del "
        "circulo, primer vertice de la polilinea), a seis decimales, que son los que escribe el "
        "fichero. Asi la comparacion es entidad por entidad y no un total que puede cuadrar por "
        "compensacion entre dos errores."
    ),
    "experimentoSubclases": experimento,
    "archivosAusentes": ausentes,
    "archivos": archivos,
}

DESTINO.write_text(json.dumps(medidas, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
leidos = sum(1 for a in archivos if a.get("leido"))
print(
    f"medidas ezdxf {ezdxf.__version__}: {leidos}/{len(archivos)} archivos leidos"
    + (f" · {len(ausentes)} exportado(s) ausente(s): corre el spec antes" if ausentes else "")
)
