#!/usr/bin/env python3
"""Medidas del ORACULO B sobre los seis ficheros ajenos de las cuatro filas.

Los dos hermanos mayores de este script miran el corpus entero (`censo-ezdxf.py`
CUENTA) y el plano grande (`medidas-floorplan.py` MIDE). Este mira SEIS ficheros
pequenos, uno por capacidad, y saca de cada uno lo que hace falta para que una
fila de la rubrica se pueda afirmar sobre material que este proyecto no
escribio:

  · `layers.dxf`     — la tabla LAYER entera con sus propiedades, la tabla LTYPE
                       y que capa usa CADA entidad. Capa declarada y capa vista
                       no son lo mismo, y aqui salen separadas.
  · `blocks1.dxf`    — el bloque `a` con su contenido y los dos INSERT, uno de
                       ellos con escala distinta en X y en Y.
  · `blocks2.dxf`    — el arbol anidado entero: INSERT -> bloque con dos INSERT
                       -> ARC y ELLIPSE. Con las escalas y traslaciones de cada
                       escalon, que es lo que compone la transformacion
                       acumulada.
  · `texts.dxf`      — los dos MTEXT con TODO su formato: altura, ancho,
                       anclaje, estilo, interlineado.
  · `dimensions.dxf` — las dos cotas con su medida resuelta por ezdxf, y el
                       CONTENIDO de su bloque de dibujo (`*D1`, `*D2`), que es
                       donde vive el texto que la cota ya dibuja sola.
  · `hatches.dxf`    — el HATCH que el oraculo A no ve: patron, contorno y las
                       cuatro aristas rectas que lo cierran.

Uso:  python3 docs/cad/corpus/oraculos/medidas-cuatro-filas.py
      (escribe medidas-cuatro-filas-ezdxf.json)

── Por que hace falta un segundo oraculo aqui ─────────────────────────────

`dxf-parser` (oraculo A) es dependencia de `apps/web` y por eso corre en CI,
pero COMPARTE MOTOR con el lector: `dxf-import.ts` lo importa. Contra el no se
puede medir si el analisis del fichero ajeno es correcto, porque los dos se
equivocarian igual — y en `blocks2.dxf` se equivocan igual, literalmente: los
dos revientan con el mismo mensaje. `ezdxf` (MIT, Manfred Moitzi) es otro
autor, otra lengua y ni una linea en comun; es el unico testigo que dice que
ese fichero esta bien.

── Lo que este script NO puede hacer, y lo dice ───────────────────────────

`blocks2.dxf` escribe `43` (escala Z) = 0 en sus tres INSERT. `ezdxf` LEE el
fichero sin problema, pero no lo puede APLANAR: `virtual_entities()` normaliza
el sistema de coordenadas del INSERT y divide entre cero. Asi que la
transformacion acumulada NO la compone este script: publica los escalones
—insercion, escala y rotacion de cada INSERT— y quien los compone es el spec,
con una aritmetica deliberadamente trivial (0.5 x 2.0 = 1.0, rotaciones 0,
traslacion (175, 25)) para que se pueda comprobar a ojo.
"""
import hashlib
import json
import pathlib
import sys
from collections import Counter

import ezdxf

RAIZ = pathlib.Path(__file__).resolve().parents[4]
CORPUS = RAIZ / "docs/cad/corpus"
DESTINO = pathlib.Path(__file__).with_name("medidas-cuatro-filas-ezdxf.json")

ESPERADA = "1.4.4"
if ezdxf.__version__ != ESPERADA:
    sys.exit(f"ezdxf {ezdxf.__version__} instalada; estas medidas declaran {ESPERADA}")

# Doce decimales, la misma razon que en `medidas-floorplan.py`: los ficheros de
# origen escriben seis y el redondeo aporta como mucho 5e-13, muy por debajo de
# la tolerancia con la que compara el spec.
DECIMALES = 12
FICHEROS = ["layers", "blocks1", "blocks2", "texts", "dimensions", "hatches", "floorplan"]


def r(valor):
    return round(float(valor), DECIMALES)


def p2(punto):
    return [r(punto[0]), r(punto[1])]


def censo(iterable):
    return dict(sorted(Counter(e.dxftype() for e in iterable).items()))


def capas_declaradas(doc):
    """La tabla LAYER tal y como la resuelve ezdxf.

    OJO — y esto hay que decirlo aqui, no en una nota al pie: ezdxf NO devuelve
    la tabla del fichero. Devuelve la tabla del DOCUMENTO que construye, y a esa
    le anade `Defpoints` cuando no esta. Por eso el spec compara contra dos
    cifras distintas: `capasEnElFichero` (las que el fichero escribe) y esta
    lista (las que el oraculo termina teniendo). Confundirlas seria acusar al
    lector de perder una capa que nadie escribio.
    """
    filas = []
    for capa in doc.layers:
        filas.append(
            {
                "nombre": capa.dxf.name,
                "color": capa.dxf.color,
                "tipoDeLinea": capa.dxf.linetype,
                "grosor": capa.dxf.lineweight,
                "apagada": bool(capa.is_off()),
                "congelada": bool(capa.is_frozen()),
                "bloqueada": bool(capa.is_locked()),
            }
        )
    return sorted(filas, key=lambda f: f["nombre"])


def capas_en_el_fichero(ruta):
    """Cuenta los registros LAYER del fichero CRUDO, sin pasar por ezdxf.

    Es la unica forma de separar «lo que el fichero declara» de «lo que el
    oraculo normaliza»: la diferencia entre las dos cifras es exactamente lo
    que ezdxf anade por su cuenta.
    """
    lineas = ruta.read_text(encoding="latin1").splitlines()
    pares = [(lineas[i].strip(), lineas[i + 1].rstrip()) for i in range(0, len(lineas) - 1, 2)]
    tabla, nombres = None, []
    for i, (codigo, valor) in enumerate(pares):
        if codigo == "0" and valor == "TABLE":
            tabla = pares[i + 1][1]
        elif codigo == "0" and valor == "ENDTAB":
            tabla = None
        elif codigo == "0" and tabla == "LAYER" and valor == "LAYER":
            for j in range(i + 1, min(i + 30, len(pares))):
                if pares[j][0] == "0":
                    break
                if pares[j][0] == "2":
                    nombres.append(pares[j][1])
                    break
    return sorted(nombres)


def mide_layers(doc, ruta):
    msp = doc.modelspace()
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "capasSegunElOraculo": capas_declaradas(doc),
        "tiposDeLineaSegunElOraculo": sorted(lt.dxf.name for lt in doc.linetypes),
        "capasVistasPorEntidad": dict(sorted(Counter(e.dxf.layer for e in msp).items())),
        "lineas": sorted(
            [{"capa": e.dxf.layer, "de": p2(e.dxf.start), "a": p2(e.dxf.end)} for e in msp.query("LINE")],
            key=lambda l: (l["capa"], l["de"], l["a"]),
        ),
        "circulos": sorted(
            [{"capa": e.dxf.layer, "centro": p2(e.dxf.center), "radio": r(e.dxf.radius)} for e in msp.query("CIRCLE")],
            key=lambda c: (c["capa"], c["centro"]),
        ),
    }


def contenido_de_bloque(bloque):
    salida = {"censo": censo(bloque), "lineas": [], "circulos": [], "arcos": [], "elipses": [], "mtext": [], "inserts": []}
    for e in bloque:
        t = e.dxftype()
        if t == "LINE":
            salida["lineas"].append({"de": p2(e.dxf.start), "a": p2(e.dxf.end)})
        elif t == "CIRCLE":
            salida["circulos"].append({"centro": p2(e.dxf.center), "radio": r(e.dxf.radius)})
        elif t == "ARC":
            salida["arcos"].append(
                {
                    "centro": p2(e.dxf.center),
                    "radio": r(e.dxf.radius),
                    "anguloInicialGrados": r(e.dxf.start_angle),
                    "anguloFinalGrados": r(e.dxf.end_angle),
                }
            )
        elif t == "ELLIPSE":
            salida["elipses"].append(
                {
                    "centro": p2(e.dxf.center),
                    "ejeMayor": p2(e.dxf.major_axis),
                    "razon": r(e.dxf.ratio),
                    "parametroInicialRadianes": r(e.dxf.start_param),
                    "parametroFinalRadianes": r(e.dxf.end_param),
                }
            )
        elif t == "MTEXT":
            salida["mtext"].append(mide_mtext(e))
        elif t == "INSERT":
            salida["inserts"].append(mide_insert(e))
    for clave in ("lineas", "circulos", "arcos", "elipses", "mtext", "inserts"):
        if not salida[clave]:
            del salida[clave]
    return salida


def mide_insert(e):
    return {
        "bloque": e.dxf.name,
        "capa": e.dxf.layer,
        "insercion": p2(e.dxf.insert),
        "escalaX": r(e.dxf.xscale),
        "escalaY": r(e.dxf.yscale),
        "escalaZ": r(e.dxf.zscale),
        "rotacionGrados": r(e.dxf.rotation),
    }


def mide_mtext(e):
    return {
        "texto": e.text,
        "capa": e.dxf.layer,
        "insercion": p2(e.dxf.insert),
        "altura": r(e.dxf.char_height),
        "ancho": r(e.dxf.width),
        "puntoDeAnclaje": int(e.dxf.attachment_point),
        "estilo": e.dxf.style,
        "rotacionGrados": r(e.dxf.rotation),
        "factorDeInterlineado": r(e.dxf.line_spacing_factor),
        "estiloDeInterlineado": int(e.dxf.line_spacing_style),
    }


def mide_blocks1(doc, ruta):
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "bloquesDefinidos": sorted(b.name for b in doc.blocks if not b.name.startswith("*")),
        "contenidoDeBloques": {
            b.name: contenido_de_bloque(b) for b in doc.blocks if not b.name.startswith("*")
        },
        "inserts": [mide_insert(e) for e in doc.modelspace().query("INSERT")],
    }


def mide_blocks2(doc, ruta):
    """El arbol anidado, escalon por escalon.

    No se aplana: ver la nota de cabecera. Lo que se publica son los escalones,
    que es de donde sale la transformacion acumulada.
    """
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "capasSegunElOraculo": [c["nombre"] for c in capas_declaradas(doc)],
        "espacioModelo": censo(doc.modelspace()),
        "bloquesDefinidos": sorted(b.name for b in doc.blocks if not b.name.startswith("*")),
        "contenidoDeBloques": {
            b.name: contenido_de_bloque(b) for b in doc.blocks if not b.name.startswith("*")
        },
        "insertsDeEspacioModelo": [mide_insert(e) for e in doc.modelspace().query("INSERT")],
        "mtextDeEspacioModelo": [mide_mtext(e) for e in doc.modelspace().query("MTEXT")],
        "porQueNoSeAplana": (
            "Los tres INSERT declaran escala Z = 0 (codigo 43). ezdxf LEE el fichero entero sin una queja, "
            "pero `virtual_entities()` normaliza el sistema del INSERT y divide entre cero. La composicion "
            "la hace el spec con los escalones de arriba."
        ),
    }


def mide_texts(doc, ruta):
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "mtext": [mide_mtext(e) for e in doc.modelspace().query("MTEXT")],
        "estilosDeTexto": sorted(s.dxf.name for s in doc.styles),
    }


def mide_dimensions(doc, ruta):
    cotas = []
    for e in doc.modelspace().query("DIMENSION"):
        cotas.append(
            {
                "tipoBruto": int(e.dxf.dimtype),
                "medida": r(e.get_measurement() if not isinstance(e.get_measurement(), tuple) else e.get_measurement()[0]),
                "textoDelUsuario": e.dxf.text,
                "puntoDeTexto": p2(e.dxf.text_midpoint),
                "estilo": e.dxf.dimstyle,
                "capa": e.dxf.layer,
                "bloqueDeDibujo": e.dxf.get("geometry", None),
                "defpoint": p2(e.dxf.defpoint),
                "defpoint2": p2(e.dxf.defpoint2) if e.dxf.hasattr("defpoint2") else None,
                "defpoint3": p2(e.dxf.defpoint3) if e.dxf.hasattr("defpoint3") else None,
            }
        )
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "espacioModelo": censo(doc.modelspace()),
        "cotas": cotas,
        "bloquesDeDibujo": {
            b.name: contenido_de_bloque(b) for b in doc.blocks if b.name.startswith("*D")
        },
        "loQueEsoSignifica": (
            "El texto de la cota NO esta en espacio modelo: vive dentro del bloque de dibujo (`*D1`, `*D2`) "
            "que el programa de origen genero para pintarla. Un lector que resuelva la cota por sus puntos "
            "vuelve a dibujar ese texto por su cuenta; sacar ademas el MTEXT del bloque lo pinta dos veces."
        ),
    }


def mide_hatches(doc, ruta):
    sombreados = []
    for h in doc.modelspace().query("HATCH"):
        contornos = []
        for ruta_h in h.paths:
            entrada = {
                "clase": type(ruta_h).__name__,
                "banderas": int(ruta_h.path_type_flags),
                "esPolilinea": bool(int(ruta_h.path_type_flags) & 2),
            }
            aristas = []
            for arista in getattr(ruta_h, "edges", []) or []:
                dato = {"clase": type(arista).__name__}
                if hasattr(arista, "start"):
                    dato["de"] = p2(arista.start)
                if hasattr(arista, "end"):
                    dato["a"] = p2(arista.end)
                aristas.append(dato)
            if aristas:
                entrada["aristas"] = aristas
                # Un contorno de puras aristas RECTAS es un poligono cerrado:
                # sus vertices son el inicio de cada arista. Se publica ya
                # calculado porque es justo lo que el lector tendria que
                # construir para no perder el relleno.
                if all(a["clase"] == "LineEdge" for a in aristas):
                    entrada["verticesEquivalentes"] = [a["de"] for a in aristas]
            vertices = getattr(ruta_h, "vertices", None)
            if vertices:
                entrada["vertices"] = [p2(v) for v in vertices]
            contornos.append(entrada)
        sombreados.append(
            {
                "patron": h.dxf.pattern_name,
                "relleneSolido": bool(h.dxf.solid_fill),
                "asociativo": bool(h.dxf.associative),
                "estiloDeIsla": int(h.dxf.hatch_style),
                "capa": h.dxf.layer,
                "escalaDelPatron": r(h.dxf.get("pattern_scale", 1.0)),
                "anguloDelPatron": r(h.dxf.get("pattern_angle", 0.0)),
                "contornos": contornos,
            }
        )
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "espacioModelo": censo(doc.modelspace()),
        "sombreados": sombreados,
        "lineas": [{"de": p2(e.dxf.start), "a": p2(e.dxf.end)} for e in doc.modelspace().query("LINE")],
    }


def mide_floorplan(doc, ruta):
    """SOLO la tabla de capas del plano grande, no su geometria.

    La geometria de `floorplan.dxf` ya la mide `medidas-floorplan.py` y no se
    duplica aqui. Lo que hace falta de este fichero para la fila de capas es
    otra cosa: es el UNICO del corpus con capas suficientes (24) para que se
    vea si el color del remitente sobrevive. Con tres capas no se ve; con
    veinticuatro, si — porque hay capas que el fichero pinta IGUAL y capas que
    pinta DISTINTO, y las dos direcciones del error se pueden medir.
    """
    return {
        "capasEnElFichero": capas_en_el_fichero(ruta),
        "capasSegunElOraculo": capas_declaradas(doc),
        # LA MISMA FUGA DE MTEXT, contada en el plano grande. Es una cifra, no
        # una medida de geometria, y por eso cabe aqui sin duplicar el trabajo
        # de `medidas-floorplan.py`: cuantos MTEXT puso el remitente en espacio
        # modelo, frente a los que tiene el fichero entero.
        "mtextEnEspacioModelo": len(doc.modelspace().query("MTEXT")),
        "mtextEnTodoElFichero": sum(
            1 for b in doc.blocks for e in b if e.dxftype() == "MTEXT"
        ),
        "porQueSoloLaTabla": (
            "La geometria de este plano la mide `medidas-floorplan.py`; aqui solo hace falta su tabla LAYER, "
            "que es la unica del corpus con capas suficientes para medir si el color del remitente sobrevive."
        ),
    }


MEDIDORES = {
    "layers": mide_layers,
    "floorplan": mide_floorplan,
    "blocks1": mide_blocks1,
    "blocks2": mide_blocks2,
    "texts": mide_texts,
    "dimensions": mide_dimensions,
    "hatches": mide_hatches,
}

archivos = {}
for nombre in FICHEROS:
    ruta = CORPUS / f"terceros/bjnortier-dxf/{nombre}.dxf"
    bytes_ = ruta.read_bytes()
    doc = ezdxf.readfile(ruta)
    entrada = {
        "ruta": f"terceros/bjnortier-dxf/{nombre}.dxf",
        "sha256": hashlib.sha256(bytes_).hexdigest(),
        "bytes": len(bytes_),
        "dialecto": doc.dxfversion,
        "version": doc.acad_release,
    }
    entrada.update(MEDIDORES[nombre](doc, ruta))
    archivos[f"bjnortier-dxf/{nombre}"] = entrada

salida = {
    "oraculo": "B",
    "herramienta": f"ezdxf {ezdxf.__version__} (MIT, Manfred Moitzi)",
    "generadoPor": "docs/cad/corpus/oraculos/medidas-cuatro-filas.py",
    "verificadoPor": (
        "las cuatro suites terceros-*.spec.ts de apps/web/src/lib/cad/verification/, "
        "cada una anclada al sha256 de los bytes que se midieron aqui"
    ),
    "porQueCongelado": (
        "ezdxf es Python y no esta en CI. Congelar la lectura y anclarla al sha256 es lo que impide "
        "que un spec siga creyendose una medida que ya no habla de esos bytes: cuando el hash no cuadra, "
        "el spec se pone en rojo en vez de pasar."
    ),
    "loQueNoAcredita": (
        "Que estos ficheros los guardo AutoCAD. Son ficheros de prueba de la biblioteca MIT bjnortier/dxf: "
        "acreditan interoperabilidad con material que este proyecto no escribio, no compatibilidad con AutoCAD."
    ),
    "archivos": archivos,
}

DESTINO.write_text(json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
print(f"escrito {DESTINO.relative_to(RAIZ)} — {len(archivos)} ficheros ajenos medidos con ezdxf {ezdxf.__version__}")
