#!/usr/bin/env python3
"""El PROCESO DE FUZZING de atheris. Corre en un subproceso aparte porque
`atheris.Fuzz()` termina el intérprete cuando `-runs=N` se agota (comportamiento
de libFuzzer, no de este script): `censo-atheris.py` no podría seguir
ejecutándose después de llamarlo en el mismo proceso, así que la orquestación
—crear el corpus semilla, invocar esto, leer lo que quedó en el directorio—
vive en el script separado.

── El cebo de cobertura, y por qué es un CEBO y no el validador real ────────

`assert_safe_json_mimic` imita `assertSafeJson` de
`apps/web/src/lib/cad/document-import.ts` (pila explícita, profundidad > 128
o más de un millón de nodos visitados → rechazo, tres claves inseguras en
CUALQUIER nivel → rechazo) para darle a atheris algo cuyas RAMAS dependan de
la ESTRUCTURA del JSON, y así su motor de cobertura (libFuzzer) recompense
los mutantes que alcanzan más anidamiento o esconden una clave insegura más
adentro. Esto es un CEBO deliberado, no una segunda implementación del
validador: el VEREDICTO que importa —¿el importador REAL de Valle acepta,
rechaza con un error tipado, o revienta sin control?— lo decide
`json-import-atheris.spec.ts` alimentando estos mismos bytes al producto de
verdad. Si el cebo y el validador real discreparan, esta doble comprobación
lo pondría en evidencia; no lo hace porque el cebo es deliberadamente FIEL a
las reglas documentadas de `assertSafeJson`, sin copiar su código.
"""
import atheris
import hashlib
import json
import os
import sys

MAX_TEXT_LEN = 8192
MAX_LOGGED_DISTINCT = 500

_seen_hashes = set()
_log_path = os.environ.get("VALLE_ATHERIS_LOG")
_log_file = open(_log_path, "a", encoding="utf8") if _log_path else None


def bytes_to_candidate_text(data: bytes) -> str:
    """La MISMA transformación que decide qué texto ve el JSON de cada caso.
    Se factoriza aquí porque `censo-atheris.py` tiene que reconstruir
    EXACTAMENTE el mismo texto a partir de los bytes que quedaron en el
    corpus, o estaría verificando un texto que el fuzzer nunca evaluó."""
    fdp = atheris.FuzzedDataProvider(data)
    return fdp.ConsumeUnicodeNoSurrogates(MAX_TEXT_LEN)


@atheris.instrument_func
def assert_safe_json_mimic(root) -> None:
    stack = [(root, 0)]
    visited = 0
    while stack:
        value, depth = stack.pop()
        visited += 1
        if visited > 1_000_000 or depth > 128:
            raise ValueError("límites estructurales")
        if not isinstance(value, (dict, list)):
            continue
        items = value.items() if isinstance(value, dict) else enumerate(value)
        for key, nested in items:
            if key in ("__proto__", "prototype", "constructor"):
                raise ValueError("clave insegura")
            stack.append((nested, depth + 1))


def TestOneInput(data: bytes) -> None:
    text = bytes_to_candidate_text(data)

    # El REGISTRO de lo que el fuzzer probó, no sólo de lo que sobrevivió a la
    # minimización de libFuzzer. Sin esto, un corpus final pequeño (libFuzzer
    # reduce agresivamente lo que no aporta cobertura nueva) escondería la
    # diversidad real de mutaciones que sí se ejecutaron — que es justo lo que
    # el criterio pide: "los documentos mutados los decide él".
    if _log_file is not None and len(_seen_hashes) < MAX_LOGGED_DISTINCT:
        digest = hashlib.sha256(text.encode("utf-8", "surrogatepass")).hexdigest()
        if digest not in _seen_hashes:
            _seen_hashes.add(digest)
            _log_file.write(json.dumps({"sha256": digest, "text": text}, ensure_ascii=True) + "\n")
            _log_file.flush()

    try:
        obj = json.loads(text)
    except Exception:
        return
    try:
        assert_safe_json_mimic(obj)
    except Exception:
        return


if __name__ == "__main__":
    atheris.Setup(sys.argv, TestOneInput)
    atheris.Fuzz()
