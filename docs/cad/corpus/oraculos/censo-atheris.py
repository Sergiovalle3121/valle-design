#!/usr/bin/env python3
"""ORACULO H: atheris (Google, Apache-2.0) decide qué documentos hostiles
prueba la importación de JSON canónico.

── Por que hacia falta este oraculo, y por que NO es hypothesis ────────────

`docs/cad/evidence/independencia-por-fila.json` lo dice del criterio
`json-import.fuzzing`: "el formato canónico JSON lo definimos nosotros, así
que por construcción nadie ajeno escribe uno […] La independencia posible
aquí no es del MATERIAL sino del GENERADOR." `document-import-fuzz.ts` ya es
un fuzzer determinista y disciplinado, pero las MUTACIONES las decide
`MUTATIONS`/`caseRandom` — una lista y un PRNG que escribió este proyecto.

`PROMPT_MAESTRO_FABLE.md` nombraba `hypothesis` como candidato. NO SE USÓ:
`hypothesis` es MPL-2.0 (verificado en
https://pypi.org/pypi/hypothesis/6.167.1/json, `license_expression`), y
`CORPUS_POLICY.md` -que este proyecto ya usa como estándar de licencias para
TODO oráculo, no sólo el corpus DWG- prohíbe MPL "sin excepción y sin
discusión". Ver la petición de corrección en `F10-peticiones.md`. El
sustituto es `atheris` (Google, Apache-2.0), el único de los tres candidatos
del prompt con licencia admisible Y wheel para Python 3.11 en esta máquina.

── Que hace atheris aqui, exactamente ───────────────────────────────────────

`atheris` es un fuzzer GUIADO POR COBERTURA (usa libFuzzer por debajo). El
proceso de fuzzing corre en `atheris-fuzz-worker.py`, un subproceso APARTE
-`atheris.Fuzz()` termina el intérprete al agotar `-runs=N`, así que este
orquestador no podría seguir tras invocarlo en el mismo proceso-. Ese worker
mide su cobertura contra un CEBO (`assert_safe_json_mimic`, ver su propia
cabecera) fiel a `assertSafeJson` de `document-import.ts`, y con esa señal
mutará hacia documentos que anidan más, esconden una clave insegura más
adentro, etc. Cada texto DISTINTO que el fuzzer produjo -hasta 500- queda
registrado, no sólo lo que sobrevivió a la minimización agresiva del corpus
final de libFuzzer.

Lo IMPORTANTE, y donde este censo se detiene a propósito: el cebo es sólo
para GUIAR la mutación. El VEREDICTO —¿el importador REAL de Valle Design
rechaza con un error tipado, acepta correctamente, o revienta sin control?—
NO lo da este script ni el cebo de Python: lo da
`json-import-atheris.spec.ts`, alimentando estos MISMOS 500 textos al
`importDocumentText` real.

── Limitacion medida, no supuesta ───────────────────────────────────────────

El cebo es deliberadamente pequeño (una función, ~7 ramas distintas que
libFuzzer alcanza) y por eso la cobertura satura pronto: en 20 000
ejecuciones, `cov: 7 ft: 7` es el techo medido en esta máquina. Un cebo más
fiel al AST completo del importador exploraría más espacio, a costa de
duplicar buena parte de `document-import.ts` sólo para dar de comer a un
fuzzer — que es exactamente el tipo de acoplamiento que este frente evita.
Se declara el número medido en vez de una cifra mayor sin comprobar.

── Como se usa ───────────────────────────────────────────────────────────────

    python3 docs/cad/corpus/oraculos/censo-atheris.py
    python3 docs/cad/corpus/oraculos/censo-atheris.py --destino RUTA
"""
import hashlib
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

DESTINO = pathlib.Path(__file__).with_name("atheris-3.0.0.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

WORKER = pathlib.Path(__file__).with_name("atheris-fuzz-worker.py")

# Carga el worker como módulo pese al guion en el nombre de archivo (que
# `import` no admite), para reutilizar exactamente su `assert_safe_json_mimic`
# y su `bytes_to_candidate_text` en vez de tener una segunda copia.
_spec = importlib.util.spec_from_file_location("atheris_fuzz_worker", WORKER)
worker = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(worker)

from importlib.metadata import version as _pkg_version  # noqa: E402

ESPERADA = "3.0.0"
INSTALADA = _pkg_version("atheris")
if INSTALADA != ESPERADA:
    sys.exit(f"atheris {INSTALADA} instalada; este censo declara {ESPERADA}")

RUNS = 20_000
MAX_LEN = 4096
LIBFUZZER_SEED = 1

# Semillas iniciales: FIJAS y explícitas, para que la corrida sea reproducible
# y para darle al fuzzer material de arranque relacionado con lo que se busca
# -documento válido, clave insegura, anidamiento, basura no JSON-.
SEEDS = {
    "seed-valido.bin": '{"meta":{"schema":3},"entities":[]}',
    "seed-inseguro.bin": '{"meta":{"schema":3},"entities":[],"__proto__":{"x":1}}',
    "seed-anidado.bin": '{"meta":{"schema":3},"entities":[],"a":{"b":{"c":1}}}',
    "seed-basura.bin": "not json at all just text",
}

with tempfile.TemporaryDirectory(prefix="valle-atheris-corpus-") as corpus_dir:
    corpus_path = pathlib.Path(corpus_dir)
    for nombre, contenido in SEEDS.items():
        (corpus_path / nombre).write_text(contenido, encoding="utf8")

    log_path = pathlib.Path(tempfile.mkstemp(prefix="valle-atheris-log-", suffix=".jsonl")[1])
    log_path.unlink()  # el worker lo crea en modo "append"; empieza limpio

    corrida = subprocess.run(
        [
            sys.executable,
            str(WORKER),
            f"-seed={LIBFUZZER_SEED}",
            f"-runs={RUNS}",
            f"-max_len={MAX_LEN}",
            str(corpus_path),
        ],
        env={**__import__("os").environ, "VALLE_ATHERIS_LOG": str(log_path)},
        capture_output=True,
        text=True,
    )
    salida_libfuzzer = corrida.stdout + corrida.stderr

    if not log_path.exists():
        sys.exit(f"el worker de atheris no escribió el registro:\n{salida_libfuzzer}")

    lineas = log_path.read_text(encoding="utf8").splitlines()
    log_path.unlink()

candidatos = []
for linea in lineas:
    entrada = json.loads(linea)
    texto = entrada["text"]
    sha = entrada["sha256"]
    assert sha == hashlib.sha256(texto.encode("utf-8", "surrogatepass")).hexdigest(), (
        f"el sha256 registrado no coincide con el texto para {sha}"
    )
    try:
        objeto = json.loads(texto)
        try:
            worker.assert_safe_json_mimic(objeto)
            veredictoDelCebo = "aceptado_por_el_cebo"
        except Exception as error:
            veredictoDelCebo = f"rechazado_por_el_cebo: {error}"
    except Exception as error:
        veredictoDelCebo = f"no_es_json: {type(error).__name__}"
    candidatos.append({"sha256": sha, "texto": texto, "veredictoDelCebo": veredictoDelCebo})

censo = {
    "oraculo": "H",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-atheris.py",
    "mide": (
        "Documentos JSON hostiles cuyo CONTENIDO decide un fuzzer de terceros guiado "
        "por cobertura (atheris/libFuzzer), no una lista ni un PRNG de este proyecto. "
        "El veredicto AUTORITATIVO —si el importador real de Valle los rechaza con un "
        "error tipado, los acepta correctamente, o revienta sin control— lo da "
        "json-import-atheris.spec.ts alimentando estos mismos textos al producto; este "
        "censo sólo registra qué probó el fuzzer y lo que dice el CEBO de cobertura "
        "(que no es el validador real)."
    ),
    "herramienta": {
        "nombre": "atheris",
        "version": "3.0.0",
        "lenguaje": "Python 3.11 (extensión nativa sobre libFuzzer)",
        "autor": "Google",
        "licencia": "Apache-2.0",
        "origen": "PyPI (pip install atheris==3.0.0)",
        "instaladoEl": "2026-09-06",
        "registro": "docs/cad/corpus/oraculos/HERRAMIENTAS.md#atheris-3-0-0",
        "porQueCuentaComoIndependiente": (
            "Fuzzer de cobertura de Google, sin una línea de código en común con "
            "document-import-fuzz.ts. El formato canónico lo define este proyecto -por "
            "construcción no puede existir un corpus AJENO de documentos canónicos "
            "válidos-, así que la independencia posible es la del GENERADOR de mutaciones, "
            "no la del material: atheris decide qué bytes probar, este proyecto no."
        ),
        "limiteDeSuIndependencia": (
            "Sustituye a `hypothesis`, nombrada en PROMPT_MAESTRO_FABLE.md, porque "
            "hypothesis es MPL-2.0 y CORPUS_POLICY.md la prohíbe sin excepción. Requiere "
            "un CEBO de cobertura (assert_safe_json_mimic) fiel a assertSafeJson pero "
            "escrito por este proyecto: el cebo GUÍA la mutación, no dictamina el "
            "resultado — eso lo hace el spec de TypeScript contra el producto real."
        ),
        "coberturaMedida": "cov: 7, ft: 7 (el techo que este cebo alcanza en 20 000 ejecuciones; ver cabecera de este script)",
    },
    "advertencia": (
        "NO ESTÁ INSTALADA EN CI. Esta corrida se hizo en la máquina declarada y se "
        "congela aquí. El spec vuelve a correrla si la herramienta está presente; "
        "cuando no está, declara la ausencia en vez de fingir la medición."
    ),
    "loQueNoAcredita": (
        "atheris no es un validador de JSON ni conoce el formato canónico de Valle "
        "Design. Sus mutaciones exploran un espacio de bytes guiadas por un cebo "
        "aproximado; el veredicto de seguridad real lo pone SIEMPRE el producto, nunca "
        "este censo."
    ),
    "configuracion": {
        "runs": RUNS,
        "maxLen": MAX_LEN,
        "libfuzzerSeed": LIBFUZZER_SEED,
        "semillasIniciales": list(SEEDS.keys()),
        "salidaDeLibfuzzer": salida_libfuzzer.strip().splitlines()[-6:],
    },
    "candidatos": candidatos,
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
print(
    f"censo atheris 3.0.0: {len(candidatos)} textos distintos generados por el fuzzer "
    f"({RUNS} ejecuciones, semilla {LIBFUZZER_SEED}) -> {DESTINO.name}"
)
