#!/usr/bin/env python3
"""ORACULO G: mpmath emite la referencia de precision arbitraria del teselado
de arcos y elipses que curve-kernel-parity.spec.ts compara entre JS y WASM.

── Por que hacia falta este oraculo ─────────────────────────────────────────

`curve-kernel-parity.spec.ts` ya lo dice con todas sus letras en su propia
cabecera: "comparar los motores entre si dice si se parecen, nunca cual tiene
razon, y un gate que solo sabe medir parecido acepta que los dos se
equivoquen de acuerdo". Para la SPLINE ese spec ya tiene arbitro -la Bezier
cubica de Bernstein es la forma cerrada del mismo objeto por otro camino-,
pero para ARCOS y ELIPSES los dos motores (JS y el kernel WASM en Rust) sólo
se comparan ENTRE SI. Si ambos usan `f64::cos`/`f64::sin` con el mismo sesgo
de la ultima cifra, la paridad seria perfecta y los dos seguirian mal.

`mpmath` (PyPI, BSD-3-Clause) calcula trigonometria con la precision que se le
pida -aqui 50 digitos decimales, muy por encima de los ~15-17 que un `f64`
puede representar-, en otro lenguaje, con otra libreria, sin compartir una
linea con `f64::cos`/`Math.cos`/`libm`. Aqui NO se le pide que tesele como el
producto: se le pide EL VALOR TRIGONOMETRICO EXACTO para los mismos angulos
que el producto evalua, y la comparacion la hace el spec de TypeScript.

── Que corpus usa, y por que es el mismo que ya existe ──────────────────────

Los DIEZ arcos y SIETE elipses de `ARC_EDGE_CASES`/`ELLIPSE_EDGE_CASES` en
`apps/web/src/lib/cad/wasm/curve-kernel-corpus.ts`. Se copian aqui LITERALES
-no se inventan- porque son las esquinas que ese archivo escribio a mano
precisamente porque el generador aleatorio no las alcanza: barrido nulo,
barrido negativo, radio de micra, radio de decenas de kilometros, centro lejos
del origen (cancelacion), radio y eje cero. Es la misma tecnica que
`censo-pyproj.py` usa con la formula de `mexicoControlGrid()`: DOS lenguajes
ejecutan la MISMA definicion en vez de que uno le pase datos al otro.

── El algoritmo que se reproduce, tal cual, sin arreglarlo ──────────────────

De `apps/web/src/lib/cad/curve-tessellate.ts` (`tessellateArc`,
`tessellateEllipse`) y `apps/web/src/lib/cad/arc-sweep.ts`
(`normalizeArcSweepDegrees`):

  sweep = normalizeArcSweepDegrees(startDeg, endDeg)   # ver mas abajo
  n     = max(2, ceil(sweep / 360 * steps))
  arco:    angle_i = radians(start + sweep * i / n)
           P_i = (cx + r*cos(angle_i), cy + r*sin(angle_i))     i = 0..n
  elipse:  minor = (-my*ratio, mx*ratio)
           t_i = radians(start + sweep * i / n)
           P_i = (cx + cos(t_i)*mx + sin(t_i)*minor.x,
                  cy + cos(t_i)*my + sin(t_i)*minor.y)          i = 0..n

`normalizeArcSweepDegrees`: sweep := endDeg - startDeg; si <= 0,
fmod(sweep, 360) + 360 (con el signo de C/JS, NUNCA el de Python `%`); si no,
min(sweep, 1_000_000). Radio <= 0 o eje mayor <= 0 → CERO puntos: ese caso NO
se tesela, se declara `leido: false` con su motivo.

── Como se lee el resultado ──────────────────────────────────────────────────

Para cada punto, este censo publica DOS cosas: el valor de referencia
redondeado al `f64` MAS CERCANO (lo que un teselador perfectamente redondeado
produciria) y el valor decimal de precision arbitraria del que salio. El spec
de TypeScript compara el resultado REAL del producto -JS y WASM- contra el
redondeado, en ULP: la libm de V8 y la de Rust no garantizan redondeo correcto
para seno/coseno, así que un desacuerdo de 1-2 ULP es esperable y no es
defecto; un desacuerdo de miles de ULP sí lo sería.

── Como se usa ───────────────────────────────────────────────────────────────

    python3 docs/cad/corpus/oraculos/censo-mpmath.py
    python3 docs/cad/corpus/oraculos/censo-mpmath.py --destino RUTA
"""
import json
import math
import pathlib
import sys

import mpmath

DESTINO = pathlib.Path(__file__).with_name("mpmath-1.4.1.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

ESPERADA = "1.4.1"
if mpmath.__version__ != ESPERADA:
    sys.exit(f"mpmath {mpmath.__version__} instalada; este censo declara {ESPERADA}")

mpmath.mp.dps = 50  # 50 dígitos decimales: ~33 más que un f64 (~15-17).

STEPS = [24, 96]
MAX_SWEEP_DEGREES = 1_000_000

# Copia LITERAL de ARC_EDGE_CASES en curve-kernel-corpus.ts: (cx, cy, r, inicioDeg, finDeg).
ARC_EDGE_CASES = [
    ("vuelta-completa", 0, 0, 1, 0, 360),
    ("barrido-nulo", 0, 0, 1, 0, 0),
    ("cruza-origen-de-angulos", 0, 0, 1, 350, 10),
    ("barrido-negativo", 0, 0, 1, 90, 45),
    ("dos-vueltas", 0, 0, 1, 0, 720),
    ("radio-de-micra", 0, 0, 1e-6, 0, 90),
    ("radio-de-decenas-de-km", 0, 0, 1e7, 0, 90),
    ("lejos-del-origen", 1e6, -1e6, 25, 30, 300),
    ("radio-cero", 0, 0, 0, 0, 90),
    ("radio-negativo", 0, 0, -5, 0, 90),
]

# Copia LITERAL de ELLIPSE_EDGE_CASES: (cx, cy, mx, my, ratio, inicioDeg, finDeg).
ELLIPSE_EDGE_CASES = [
    ("circulo-por-elipse", 0, 0, 10, 0, 1, 0, 360),
    ("casi-un-segmento", 0, 0, 10, 0, 0.02, 0, 360),
    ("eje-mayor-vertical", 0, 0, 0, 10, 0.5, 0, 360),
    ("rotada-45", 0, 0, 7.07, 7.07, 0.5, 45, 315),
    ("lejos-rotada-negativa", -1e5, 1e5, 250, -120, 0.33, 200, 120),
    ("eje-mayor-nulo", 0, 0, 0, 0, 0.5, 0, 360),
    ("razon-nula", 0, 0, 10, 0, 0, 0, 360),
]


def normalize_arc_sweep_degrees(start_deg, end_deg):
    """Traducción literal de normalizeArcSweepDegrees en arc-sweep.ts.
    OJO: `math.fmod`, NUNCA el operador `%` de Python — el signo del
    resultado tiene que ser el del DIVIDENDO, como en C/JS, no el del
    divisor, como hace `%` en Python."""
    sweep = end_deg - start_deg
    if not math.isfinite(sweep):
        return None
    if sweep <= 0:
        return math.fmod(sweep, 360) + 360
    return min(sweep, MAX_SWEEP_DEGREES)


def puntos_de_n(sweep, steps):
    return max(2, math.ceil((sweep / 360) * steps))


def redondeado_f64(valor_mp):
    """El f64 más cercano al valor de precisión arbitraria. `float()` sobre un
    `mpf` de mpmath redondea correctamente al doble más próximo — es la
    operación que hace de puente entre las dos precisiones."""
    return float(valor_mp)


def tesela_arco(caso, steps):
    _, cx, cy, r, start_deg, end_deg = caso
    if not (r > 0):
        return {"leido": False, "porQueNo": "radio no positivo: el teselador real devuelve cero puntos"}
    sweep = normalize_arc_sweep_degrees(start_deg, end_deg)
    if sweep is None:
        return {"leido": False, "porQueNo": "barrido no finito"}
    n = puntos_de_n(sweep, steps)
    puntos = []
    for i in range(n + 1):
        angle_deg = mpmath.mpf(start_deg) + mpmath.mpf(sweep) * i / n
        angle_rad = angle_deg * mpmath.pi / 180
        x = mpmath.mpf(cx) + mpmath.mpf(r) * mpmath.cos(angle_rad)
        y = mpmath.mpf(cy) + mpmath.mpf(r) * mpmath.sin(angle_rad)
        puntos.append([redondeado_f64(x), redondeado_f64(y)])
    return {"leido": True, "n": n, "puntos": puntos}


def tesela_elipse(caso, steps):
    _, cx, cy, mx, my, ratio, start_deg, end_deg = caso
    major_len = math.hypot(mx, my)
    if not (major_len > 0) or not (ratio > 0):
        return {"leido": False, "porQueNo": "eje mayor o razón no positivos: el teselador real devuelve cero puntos"}
    sweep = normalize_arc_sweep_degrees(start_deg, end_deg)
    if sweep is None:
        return {"leido": False, "porQueNo": "barrido no finito"}
    n = puntos_de_n(sweep, steps)
    minor_x = -my * ratio
    minor_y = mx * ratio
    puntos = []
    for i in range(n + 1):
        t_deg = mpmath.mpf(start_deg) + mpmath.mpf(sweep) * i / n
        t_rad = t_deg * mpmath.pi / 180
        cos_t = mpmath.cos(t_rad)
        sin_t = mpmath.sin(t_rad)
        x = mpmath.mpf(cx) + cos_t * mpmath.mpf(mx) + sin_t * mpmath.mpf(minor_x)
        y = mpmath.mpf(cy) + cos_t * mpmath.mpf(my) + sin_t * mpmath.mpf(minor_y)
        puntos.append([redondeado_f64(x), redondeado_f64(y)])
    return {"leido": True, "n": n, "puntos": puntos}


arcos = {}
for caso in ARC_EDGE_CASES:
    nombre = caso[0]
    arcos[nombre] = {str(steps): tesela_arco(caso, steps) for steps in STEPS}

elipses = {}
for caso in ELLIPSE_EDGE_CASES:
    nombre = caso[0]
    elipses[nombre] = {str(steps): tesela_elipse(caso, steps) for steps in STEPS}

censo = {
    "oraculo": "G",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-mpmath.py",
    "mide": (
        "El teselado EXACTO (precisión arbitraria, 50 dígitos) de los diez arcos y siete "
        "elipses de ARC_EDGE_CASES/ELLIPSE_EDGE_CASES en curve-kernel-corpus.ts, para "
        "steps=24 y steps=96. Sirve al criterio wasm.toolchain: es la referencia ABSOLUTA "
        "que faltaba, porque curve-kernel-parity.spec.ts sólo comparaba JS contra WASM entre sí."
    ),
    "herramienta": {
        "nombre": "mpmath",
        "version": mpmath.__version__,
        "precisionDecimales": mpmath.mp.dps,
        "lenguaje": "Python 3.11",
        "autor": "Fredrik Johansson y colaboradores",
        "licencia": "BSD-3-Clause",
        "origen": "PyPI (pip install mpmath==1.4.1)",
        "instaladoEl": "2026-09-06",
        "registro": "docs/cad/corpus/oraculos/HERRAMIENTAS.md#mpmath-1-4-1",
        "porQueCuentaComoIndependiente": (
            "Calcula seno y coseno con precisión arbitraria (aquí 50 dígitos, ~33 más que un "
            "f64), en otra biblioteca, sin compartir una línea con la libm de V8 (el motor "
            "JavaScript) ni con la que usa el crate Rust del kernel WASM."
        ),
        "limiteDeSuIndependencia": (
            "Ninguna libm de propósito general (V8, Rust std, glibc) garantiza redondeo "
            "correcto al último bit para seno/coseno; una discrepancia de 1-2 ULP frente a la "
            "referencia exacta es EL COMPORTAMIENTO ESPERADO de ambos motores, no un defecto. "
            "El gate declara su tolerancia en ULP explícitamente por esto."
        ),
    },
    "advertencia": (
        "NO ESTÁ INSTALADA EN CI. Este censo se hizo en la máquina declarada y se congela "
        "aquí. El spec vuelve a correrlo si la herramienta está presente; cuando no está, "
        "declara la ausencia en vez de fingir la medición."
    ),
    "loQueNoAcredita": (
        "mpmath no es un kernel CAD ni un teselador: es una biblioteca de precisión "
        "arbitraria. Acredita el valor MATEMÁTICO exacto de una operación trigonométrica "
        "concreta, no que el producto tesele curvas correctamente en ningún otro sentido."
    ),
    "steps": STEPS,
    "arcos": arcos,
    "elipses": elipses,
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
leidos_arcos = sum(1 for c in arcos.values() for s in c.values() if s["leido"])
leidos_elipses = sum(1 for c in elipses.values() for s in c.values() if s["leido"])
print(
    f"censo mpmath {mpmath.__version__} ({mpmath.mp.dps} dígitos): "
    f"{leidos_arcos}/{len(ARC_EDGE_CASES) * len(STEPS)} teselados de arco, "
    f"{leidos_elipses}/{len(ELLIPSE_EDGE_CASES) * len(STEPS)} de elipse -> {DESTINO.name}"
)
