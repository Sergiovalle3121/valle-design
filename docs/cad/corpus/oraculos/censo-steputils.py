#!/usr/bin/env python3
"""ORACULO C: un lector de STEP ajeno mide lo que el modelador 3D exporta.

── Por que hacia falta un tercer oraculo, y por que este ───────────────────

Los oraculos A (`dxf-parser`) y B (`ezdxf`) leen DXF. La mitad 3D del producto
—el B-rep facetado de `apps/web/src/lib/brep/`— exporta STEP (ISO 10303-21,
AP203/AP214) y lo reimporta con su PROPIO analizador: `interop.spec.ts` compara
volumen, area, genero y caracteristica de Euler del solido que sale contra el
que entro, y esa comparacion es excelente salvo por una cosa — la escribe y la
lee el mismo proyecto. Es exactamente la evidencia fabricada por casa que la
regla del corte del 2026-08-22 impide que llegue a su tope.

`steputils` 0.1 (MIT, Manfred Moitzi) es un analizador de la parte 21 escrito en
otra lengua, por otra persona y sin una linea en comun con este proyecto. Aqui
NO se le pide que opine: se le pide que CUENTE. El juicio lo hace el spec.

── El limite que hay que decir antes que ninguna otra cosa ────────────────

`steputils` es del MISMO AUTOR que `ezdxf`. Contra el oraculo B no es un testigo
independiente; contra el PRODUCTO si lo es, que es lo que se le pide. Se eligio
porque los otros lectores de STEP al alcance —`pythonocc-core`, `ifcopenshell`—
son LGPL, y `CORPUS_POLICY.md` prohibe LGPL sin excepcion ni discusion. Esa
prohibicion no se negocia: se declara y se busca otro camino, que es este.

Y un segundo limite, observado no supuesto: `steputils` 0.1 es alfa. Su propio
`DataSection.__iter__` esta roto en Python 3.11 (devuelve `odict_values`, que no
es un iterador), asi que este censo recorre `sección.instances.values()` en vez
de la seccion. Un oraculo con defectos propios sigue sirviendo mientras sus
defectos esten escritos.

── Como se usa. EL ORDEN IMPORTA ──────────────────────────────────────────

El spec exporta los solidos a STEP en el temporal del sistema; este script los
lee de ahi. Primero el spec, despues el script:

    cd apps/web && npx tsx src/lib/cad/verification/oraculos-externos.spec.ts
    cd ../.. && python3 docs/cad/corpus/oraculos/censo-steputils.py

    python3 .../censo-steputils.py --destino RUTA   (escribe donde se le diga)

Cada medida queda anclada al sha256 de los BYTES medidos. El spec recalcula ese
hash sobre lo que exporta hoy y se niega a creerse una medida que hable de otros
bytes: una lectura congelada sin ancla es peor que ninguna, porque sigue
pareciendo evidencia despues de que el producto cambie.
"""
import collections
import hashlib
import json
import math
import pathlib
import sys
import tempfile

from steputils import p21
from steputils import __version__ as steputils_version

DESTINO = pathlib.Path(__file__).with_name("steputils-0.1.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

ESPERADA = "0.1"
if steputils_version != ESPERADA:
    sys.exit(f"steputils {steputils_version} instalada; este censo declara {ESPERADA}")

TMP = pathlib.Path(tempfile.gettempdir())

# Los cinco solidos que el spec exporta, con el mismo reparto que usa
# `interop.spec.ts`: dos primitivas, uno de genero 1, uno de revolucion y uno
# nacido de una booleana. Los nombres los fija el spec y este script NO los
# inventa: si un fichero no esta, se declara ausente en vez de fingirse.
CASOS = [
    ("caja", "Seis caras planas. La caja es el caso donde V-A+C=2 se comprueba a mano."),
    ("tetraedro", "El solido cerrado mas pequeño que existe: 4 vertices, 6 aristas, 4 caras."),
    (
        "caja-con-agujero-pasante",
        "Genero 1. Las dos caras con contorno interior son donde un exportador casero "
        "se equivoca de orientacion y devuelve mas volumen del que hay.",
    ),
    (
        "tubo-de-revolucion",
        "Facetado de una revolucion de 12 segmentos: prueba que el numero de caras que "
        "sale del kernel es el que llega al fichero.",
    ),
    (
        "placa-taladrada-por-booleana",
        "El solido no se modelo: nacio de una diferencia booleana. Si la booleana deja "
        "topologia rota, el STEP la lleva dentro.",
    ),
]

# Los tipos de la parte 21 que describen la topologia del solido. Se listan
# porque contar TODO seria contar tambien el contexto y las unidades, que no
# dicen nada de la geometria.
TOPOLOGICOS = [
    "CARTESIAN_POINT",
    "VERTEX_POINT",
    "EDGE_CURVE",
    "ORIENTED_EDGE",
    "EDGE_LOOP",
    "FACE_OUTER_BOUND",
    "FACE_BOUND",
    "ADVANCED_FACE",
    "PLANE",
    "CLOSED_SHELL",
    "MANIFOLD_SOLID_BREP",
]


def nombre_de(instancia):
    """El tipo de una instancia. Las complejas (`( A() B() )`) no tienen uno."""
    if isinstance(instancia, p21.SimpleEntityInstance):
        return instancia.entity.name
    return None


def redondea(valor):
    """Nueve decimales: el limite del doble, y lo que hace estable el JSON."""
    return round(float(valor) + 0.0, 9)


def mide(ruta):
    doc = p21.readfile(str(ruta))
    seccion = doc.data[0]
    instancias = seccion.instances

    conteo = collections.Counter()
    complejas = 0
    for inst in instancias.values():
        nombre = nombre_de(inst)
        if nombre is None:
            complejas += 1
            for parte in inst.entities:
                conteo[parte.name] += 1
        else:
            conteo[nombre] += 1

    def params(ref):
        """Los parametros de la instancia a la que apunta una referencia."""
        return instancias[str(ref)].entity.params

    # Los vertices: cada VERTEX_POINT apunta a un CARTESIAN_POINT, y de ahi
    # salen las coordenadas que el spec compara una a una contra el B-rep.
    puntos_de_vertice = {}
    for clave, inst in instancias.items():
        if nombre_de(inst) != "VERTEX_POINT":
            continue
        punto = params(inst.entity.params[1])
        coords = [redondea(c) for c in punto[1]]
        puntos_de_vertice[clave] = coords

    vertices = sorted(puntos_de_vertice.values())

    # Las aristas: EDGE_CURVE(nombre, vertice_ini, vertice_fin, curva, sentido).
    longitudes = []
    for inst in instancias.values():
        if nombre_de(inst) != "EDGE_CURVE":
            continue
        a = puntos_de_vertice[str(inst.entity.params[1])]
        b = puntos_de_vertice[str(inst.entity.params[2])]
        longitudes.append(redondea(math.dist(a, b)))
    longitudes.sort()

    # Los contornos por cara: ADVANCED_FACE(nombre, (contornos), superficie,
    # sentido). El numero de contornos INTERIORES es el termino que le falta a
    # V-A+C=2 cuando el solido tiene agujeros, y sin el la comprobacion de
    # Euler-Poincare no se puede hacer desde fuera.
    contornos_por_cara = []
    for inst in instancias.values():
        if nombre_de(inst) != "ADVANCED_FACE":
            continue
        contornos_por_cara.append(len(inst.entity.params[1]))
    contornos_por_cara.sort()

    cabecera = doc.header
    esquema = None
    if "FILE_SCHEMA" in cabecera:
        esquema = str(cabecera["FILE_SCHEMA"].params[0][0])

    return {
        "sha256": hashlib.sha256(ruta.read_bytes()).hexdigest(),
        "bytes": ruta.stat().st_size,
        "esquemaDeclarado": esquema,
        "instancias": len(instancias),
        "instanciasComplejas": complejas,
        "conteo": {t: conteo.get(t, 0) for t in TOPOLOGICOS},
        "tiposVistos": sorted(conteo),
        "vertices": vertices,
        "longitudesDeArista": longitudes,
        "contornosPorCara": contornos_por_cara,
    }


archivos = {}
for nombre, porQue in CASOS:
    ruta = TMP / f"valle-step-{nombre}.stp"
    if not ruta.exists():
        archivos[nombre] = {
            "leido": False,
            "porQueNo": (
                f"No hay `{ruta.name}` en el temporal. Este censo NO lo fabrica: lo escribe "
                "`oraculos-externos.spec.ts`, y el orden es spec primero, script despues."
            ),
            "porQueEsteSolido": porQue,
        }
        continue
    try:
        medida = mide(ruta)
    except Exception as error:  # noqa: BLE001 — el rechazo ES el dato
        archivos[nombre] = {
            "leido": False,
            "error": f"{type(error).__name__}: {error}",
            "porQueImporta": (
                "Un analizador de la parte 21 ajeno RECHAZA lo que exportamos. Que nuestro "
                "propio importador lo lea no lo salva: el cliente lo abre en otro programa."
            ),
            "porQueEsteSolido": porQue,
        }
        continue
    medida["leido"] = True
    medida["porQueEsteSolido"] = porQue
    archivos[nombre] = medida

leidos = [f for f in archivos.values() if f.get("leido")]
censo = {
    "oraculo": "C",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-steputils.py",
    "mide": "Lo que el modelador 3D de Valle EXPORTA a STEP (ISO 10303-21), no material ajeno.",
    "herramienta": {
        "nombre": "steputils",
        "version": steputils_version,
        "lenguaje": "Python 3.11",
        "autor": "Manfred Moitzi",
        "licencia": "MIT",
        "origen": "PyPI (pip install steputils==0.1)",
        "instaladoEl": "2026-09-05",
        "sha256Rueda": "8d3dd966b8778a6b5bcc6613414ba6adcd9948d313c67dec4feb328afcc2f582",
        "sha256Licencia": "2d07e6d2bbaec0adc374f2412fda27635cf6c6c1a8d6ff3a5c128785abb602f5",
        "registro": "docs/cad/corpus/oraculos/HERRAMIENTAS.md#steputils-0-1",
        "porQueCuentaComoIndependiente": (
            "No comparte una linea de codigo con `brep/step-export.ts` ni con "
            "`brep/step-import.ts`: es otro analizador, en otra lengua, escrito antes y por "
            "otra persona. Hasta hoy el unico lector que habia leido nuestro STEP era el "
            "nuestro."
        ),
        "limiteDeSuIndependencia": (
            "MISMO AUTOR que ezdxf (Manfred Moitzi). Contra el oraculo B no es un segundo "
            "testigo; contra el producto si. Los lectores de STEP alternativos al alcance "
            "(pythonocc-core, ifcopenshell) son LGPL y CORPUS_POLICY.md los prohibe."
        ),
        "defectoObservadoEnLaHerramienta": (
            "steputils 0.1 es alfa: su `DataSection.__iter__` devuelve `odict_values` en "
            "Python 3.11, que no es un iterador, y revienta con TypeError. Este censo lo "
            "esquiva recorriendo `instances.values()`. Se anota porque un oraculo con "
            "defectos propios sirve mientras esten escritos."
        ),
    },
    "advertencia": (
        "NO ESTA INSTALADA EN CI. Esta lectura se hizo en la maquina declarada y se congela "
        "aqui, anclada al sha256 de los bytes medidos. El spec vuelve a correrla si la "
        "herramienta esta presente; cuando no esta, declara la ausencia en vez de fingir la "
        "medicion."
    ),
    "loQueNoAcredita": (
        "steputils no es CATIA, ni SolidWorks, ni un kernel. Que lea nuestro STEP acredita "
        "que el fichero es parte 21 valida y que su topologia cuadra; NO acredita que un CAD "
        "mecanico comercial reconstruya el solido."
    ),
    "resumen": {
        "solidos": len(archivos),
        "leidos": len(leidos),
        "rechazados": len(archivos) - len(leidos),
        "esquemas": sorted({f["esquemaDeclarado"] for f in leidos if f.get("esquemaDeclarado")}),
    },
    "archivos": archivos,
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
print(
    f"censo steputils {steputils_version}: {len(leidos)}/{len(archivos)} solidos leidos "
    f"-> {DESTINO.name}"
)
