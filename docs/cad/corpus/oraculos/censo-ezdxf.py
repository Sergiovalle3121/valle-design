#!/usr/bin/env python3
"""Censo del ORÁCULO B sobre el corpus de terceros.

`ezdxf` (MIT, Manfred Moitzi) es la segunda lectura independiente del corpus:
otro autor, otra lengua y ninguna línea de código en común ni con este
proyecto ni con el oráculo A. No está instalada en CI, así que su veredicto se
CONGELA aquí como artefacto y el spec que lo consume lee el artefacto; volver a
correr este script exige `pip install ezdxf==1.4.4` y es lo único que puede
cambiar el JSON.

Uso:  python3 docs/cad/corpus/oraculos/censo-ezdxf.py   (escribe ezdxf-1.4.4.json)
      python3 .../censo-ezdxf.py --destino RUTA          (escribe donde se le diga)

`--destino` existe por UNA razon y conviene que quede escrita: el arnes
(`oraculos-externos.spec.ts`) vuelve a correr este censo cuando la herramienta
esta presente y COMPARA su salida byte a byte contra el artefacto congelado del
arbol. Si el script solo supiera escribir en su sitio, esa comparacion seria una
tautologia — habria sobrescrito el fichero contra el que compara y siempre
saldria verde. Con `--destino` el censo se recalcula en un temporal y el arbol no
se toca: la diferencia, cuando la haya, sale como diferencia.

── Los cuatro ámbitos, y por qué son cuatro ────────────────────────────────

La primera versión de este censo publicó un solo `archivoEntero` calculado
recorriendo `doc.layouts` MÁS `doc.blocks`. Está mal, y en silencio: `doc.blocks`
incluye los bloques `*Model_Space` y `*Paper_Space`, que NO son definiciones de
bloque sino los mismos objetos que ya devuelven los layouts. Resultado: toda
entidad de espacio modelo contaba dos veces (`lines.dxf`: 11 líneas publicadas
como 22). La cifra se corrigió el 2026-09-04 separando los ámbitos, que además
es lo que la matriz de fidelidad necesita para comparar tipo a tipo:

  espacioModelo        — el dibujo. Es el ámbito por defecto de la comparación.
  espacioPapel         — las hojas de plano. El lector de Valle las excluye a
                         propósito (`dxf-model-space-scope.ts`), así que aquí
                         sirven para explicar una ausencia, no para exigirla.
  definicionesDeBloque — lo que vive DENTRO de un bloque, contado una vez.
  archivoEntero        — la suma de los tres, cada entidad exactamente una vez.
"""
import collections
import hashlib
import json
import pathlib
import sys

import ezdxf
from ezdxf.lldxf.const import acad_release

RAIZ = pathlib.Path(__file__).resolve().parents[4]
CORPUS = RAIZ / "docs/cad/corpus"
DESTINO = pathlib.Path(__file__).with_name("ezdxf-1.4.4.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

ESPERADA = "1.4.4"
if ezdxf.__version__ != ESPERADA:
    sys.exit(f"ezdxf {ezdxf.__version__} instalada; este censo declara {ESPERADA}")


def cuenta(entidades):
    return dict(sorted(collections.Counter(e.dxftype() for e in entidades).items()))


def suma(*partes):
    total = collections.Counter()
    for parte in partes:
        total.update(parte)
    return dict(sorted(total.items()))


manifiesto = json.loads((CORPUS / "manifest.json").read_text(encoding="utf8"))

filas = []
for archivo in manifiesto["archivos"]:
    ruta = CORPUS / archivo["ruta"]
    sha = hashlib.sha256(ruta.read_bytes()).hexdigest()
    fila = {"id": archivo["id"], "sha256Archivo": sha}
    try:
        doc = ezdxf.readfile(ruta)
    except Exception as error:  # noqa: BLE001 — el rechazo ES el dato
        fila.update(
            leido=False,
            error=f"{type(error).__name__}: {error}",
            porQueImporta=(
                "Una biblioteca madura de terceros RECHAZA este archivo. Lo que el "
                "lector de Valle haga con el mismo archivo se juzga sabiendo esto."
            ),
        )
        filas.append(fila)
        continue

    modelo = cuenta(doc.modelspace())
    papel = collections.Counter()
    for layout in doc.layouts:
        if layout.name == "Model":
            continue
        papel.update(e.dxftype() for e in layout)
    bloques = collections.Counter()
    nombres = []
    for bloque in doc.blocks:
        # `*Model_Space` y `*Paper_Space` NO son definiciones de bloque: son el
        # mismo contenido que ya cuentan los layouts. Contarlos aquí fue el
        # defecto de la primera versión de este censo.
        if bloque.name.startswith("*Model_Space") or bloque.name.startswith("*Paper_Space"):
            continue
        nombres.append(bloque.name)
        bloques.update(e.dxftype() for e in bloque)

    fila.update(
        leido=True,
        dialecto=doc.dxfversion,
        version=acad_release.get(doc.dxfversion, doc.dxfversion),
        capasDeclaradas=len(doc.layers),
        tiposDeLinea=len(doc.linetypes),
        estilosDeCota=len(doc.dimstyles),
        bloquesDefinidos=len(nombres),
        espacioModelo=modelo,
        espacioPapel=dict(sorted(papel.items())),
        definicionesDeBloque=dict(sorted(bloques.items())),
        archivoEntero=suma(modelo, papel, bloques),
    )
    filas.append(fila)

leidos = [f for f in filas if f["leido"]]
tipos = sorted({t for f in leidos for t in f["archivoEntero"]})
censo = {
    "oraculo": "B",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-ezdxf.py",
    "herramienta": {
        "nombre": "ezdxf",
        "version": ezdxf.__version__,
        "lenguaje": "Python 3.11",
        "autor": "Manfred Moitzi",
        "licencia": "MIT",
        "origen": "PyPI (pip install ezdxf==1.4.4)",
        "instaladoEl": "2026-09-04",
        "sha256Rueda": "7f75a4f2924ebdda0f5b2779ff2135ba92de2596c95a8fa9b1d9ebcabea1be41",
        "porQueCuentaComoIndependiente": (
            "Otro autor, otra lengua y otro camino: ezdxf no comparte una linea de codigo "
            "con este proyecto ni con el oraculo A, y ve entidades que el oraculo A no "
            "emite (HATCH, LEADER, VIEWPORT, estilos de cota). El oraculo A, en cambio, SI "
            "comparte motor con el lector de produccion (apps/web/src/lib/cad/dxf-import.ts "
            "importa dxf-parser): por eso hacen falta los dos y no basta con el primero."
        ),
    },
    "advertencia": (
        "NO ESTA INSTALADA EN CI. Esta lectura se hizo una vez, en la maquina declarada, y "
        "se congela aqui. El spec que la consume vuelve a correrla solo si la herramienta "
        "esta presente; cuando no esta, declara la ausencia en vez de fingir la medicion, "
        "igual que el repositorio ya hace con ODA File Converter."
    ),
    "correccion": (
        "2026-09-04: la primera version de este censo publico un unico `archivoEntero` que "
        "contaba DOS VECES cada entidad de espacio modelo, porque `doc.blocks` incluye los "
        "bloques `*Model_Space` y `*Paper_Space`. `lines.dxf` aparecia con 22 lineas cuando "
        "tiene 11. Corregido separando los cuatro ambitos; `archivoEntero` es ahora la suma "
        "de los tres, cada entidad una sola vez."
    ),
    "ambitos": {
        "espacioModelo": "El dibujo. Es el ambito por defecto de la matriz de fidelidad.",
        "espacioPapel": (
            "Las hojas de plano. El lector de Valle las EXCLUYE a proposito "
            "(dxf-model-space-scope.ts): aqui sirven para explicar una ausencia, no para exigirla."
        ),
        "definicionesDeBloque": "Lo que vive dentro de un bloque, contado una vez.",
        "archivoEntero": "espacioModelo + espacioPapel + definicionesDeBloque, sin repeticiones.",
    },
    "loQueNoAcredita": (
        "ezdxf no es AutoCAD. Que un archivo lo atraviese acredita interoperabilidad con una "
        "segunda implementacion independiente, no compatibilidad con AutoCAD."
    ),
    "resumen": {
        "archivos": len(filas),
        "leidos": len(leidos),
        "rechazados": len(filas) - len(leidos),
        "dialectos": sorted({f["dialecto"] for f in leidos}),
        "tiposVistos": tipos,
    },
    "archivos": filas,
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
print(f"censo ezdxf {ezdxf.__version__}: {len(leidos)}/{len(filas)} archivos leidos, {len(tipos)} tipos")
