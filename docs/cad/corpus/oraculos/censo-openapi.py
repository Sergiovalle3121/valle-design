#!/usr/bin/env python3
"""ORACULO E: openapi-spec-validator dictamina el contrato OpenAPI publico.

── Por que hacia falta este oraculo ─────────────────────────────────────────

`packages/contracts/specs/design-api.v1.yaml` es el contrato FUENTE del que se
genera el SDK (`api-sdk.generated`) y contra el que corre
`scripts/cad/check-design-contract.mjs`. Ese script es NUESTRO: lo escribimos,
lo mantenemos y decide si el YAML es valido con nuestro propio criterio. La
fila `api-sdk` (criterio `api-sdk.contract`) retiene 1 punto por eso mismo -
independencia-por-fila.json lo dice con estas palabras: "hoy el contrato lo
valida scripts/cad/check-design-contract.mjs, que es nuestro, contra el SDK
que generamos nosotros desde el mismo YAML".

`openapi-spec-validator` es un validador de terceros (Artur Maciag y
colaboradores, Apache-2.0) que no comparte una linea de codigo con este
repositorio: valida el documento contra el ESQUEMA OFICIAL de la
especificacion OpenAPI 3.1 (que a su vez incorpora JSON Schema 2020-12), no
contra ninguna regla que hayamos escrito. Aqui NO se le pide que opine sobre
si el contrato tiene sentido de negocio -eso lo sigue haciendo
check-design-contract.mjs-: se le pide que dictamine si el documento es
sintacticamente un OpenAPI 3.1 valido segun la especificacion publica.

── Como se usa ───────────────────────────────────────────────────────────────

    python3 docs/cad/corpus/oraculos/censo-openapi.py
    python3 docs/cad/corpus/oraculos/censo-openapi.py --destino RUTA

El dictamen queda anclado al sha256 de los BYTES del YAML. El spec de
TypeScript recalcula ese hash sobre el archivo de hoy y se niega a creerse un
dictamen que hable de otros bytes.
"""
import hashlib
import json
import pathlib
import sys

import openapi_spec_validator
from openapi_spec_validator import OpenAPIV31SpecValidator
from openapi_spec_validator.readers import read_from_filename
from openapi_spec_validator.validation.exceptions import OpenAPIValidationError

DESTINO = pathlib.Path(__file__).with_name("openapi-spec-validator-0.9.0.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

ESPERADA = "0.9.0"
if openapi_spec_validator.__version__ != ESPERADA:
    sys.exit(f"openapi-spec-validator {openapi_spec_validator.__version__} instalada; este censo declara {ESPERADA}")

RAIZ = pathlib.Path(__file__).resolve().parents[4]
CONTRATO = RAIZ / "packages/contracts/specs/design-api.v1.yaml"

contrato_bytes = CONTRATO.read_bytes()
spec, base_uri = read_from_filename(str(CONTRATO))

errores = []
valido = True
try:
    OpenAPIV31SpecValidator(spec).validate()
except OpenAPIValidationError as error:
    valido = False
    errores.append(str(error))
except Exception as error:  # noqa: BLE001 — cualquier rechazo del oraculo ES el dato
    valido = False
    errores.append(f"{type(error).__name__}: {error}")

# Iterar TODOS los errores (no sólo el primero) da un dictamen completo en vez
# de "hay al menos uno": si el contrato se rompe, el arreglo necesita la lista
# entera, no una excepción a la vez.
errores_completos = [str(e) for e in OpenAPIV31SpecValidator(spec).iter_errors()]

censo = {
    "oraculo": "E",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-openapi.py",
    "mide": (
        "Si packages/contracts/specs/design-api.v1.yaml es un documento OpenAPI 3.1 "
        "válido según el ESQUEMA OFICIAL de la especificación pública -no según ninguna "
        "regla que este repositorio haya escrito-. Sirve al criterio api-sdk.contract."
    ),
    "herramienta": {
        "nombre": "openapi-spec-validator",
        "version": openapi_spec_validator.__version__,
        "lenguaje": "Python 3.11",
        "autor": "Artur Maciag y colaboradores (python-openapi)",
        "licencia": "Apache-2.0",
        "origen": "PyPI (pip install openapi-spec-validator==0.9.0)",
        "instaladoEl": "2026-09-06",
        "sha256Rueda": "222fecffc7714f6d0a6ad62c0e4b66cc2b7dbfafb7b93acfc6c308abbdb51af8",
        "sha256Licencia": "b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1",
        "registro": "docs/cad/corpus/oraculos/HERRAMIENTAS.md#openapi-spec-validator-0-9-0",
        "porQueCuentaComoIndependiente": (
            "Valida contra el esquema OFICIAL de OpenAPI 3.1 (que incorpora JSON Schema "
            "2020-12), publicado por la OpenAPI Initiative -no un criterio que este "
            "repositorio haya escrito-. Ni el validador ni el esquema comparten una línea "
            "con scripts/cad/check-design-contract.mjs."
        ),
        "limiteDeSuIndependencia": (
            "Valida SINTAXIS y ESTRUCTURA del documento contra la especificación pública, "
            "no reglas de negocio de Valle Design (nombres de recursos, coherencia con el "
            "SDK generado, seguridad declarada por ruta). Esas reglas las sigue "
            "verificando check-design-contract.mjs; los dos oráculos se complementan."
        ),
    },
    "advertencia": (
        "NO ESTA INSTALADA EN CI. Este dictamen se hizo en la máquina declarada y se "
        "congela aquí, anclado al sha256 de los bytes del contrato. El spec vuelve a "
        "correrlo si la herramienta está presente; cuando no está, declara la ausencia "
        "en vez de fingir el dictamen."
    ),
    "loQueNoAcredita": (
        "Que el contrato tenga sentido de negocio, que el SDK generado lo respete byte a "
        "byte, o que la API real implemente lo declarado. Esas tres cosas las verifican "
        "otros gates de este repositorio (check-design-contract.mjs, la generación del "
        "SDK, api-sdk-*.spec.ts)."
    ),
    "contrato": {
        "ruta": "packages/contracts/specs/design-api.v1.yaml",
        "sha256": hashlib.sha256(contrato_bytes).hexdigest(),
        "bytes": len(contrato_bytes),
        "openapiVersionDeclarada": spec.get("openapi"),
    },
    "dictamen": {
        "valido": valido,
        "errores": errores,
        "erroresCompletos": errores_completos,
        "totalErrores": len(errores_completos),
    },
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
veredicto = "VÁLIDO" if valido else f"INVÁLIDO ({len(errores_completos)} error(es))"
print(
    f"censo openapi-spec-validator {openapi_spec_validator.__version__}: design-api.v1.yaml "
    f"({len(contrato_bytes)} bytes, openapi {spec.get('openapi')}) -> {veredicto} -> {DESTINO.name}"
)
