#!/usr/bin/env python3
"""ORACULO F: la libreria estandar de Python (hmac + hashlib) verifica
X-Valle-Signature de forma independiente.

── Por que hacia falta este oraculo ─────────────────────────────────────────

`apps/api/src/modules/outbox-receiver/outbox-signature.ts` es el verificador
REAL de produccion, y `outbox-signature.spec.ts` ya lo prueba a fondo -pero
emisor y verificador son el mismo lenguaje, la misma libreria de cripto
(`node:crypto`) y el mismo repositorio. La fila `events` (criterio
`events.operational`) retiene 1 punto por eso mismo:
`independencia-por-fila.json` lo dice con estas palabras: "Verificar la firma
X-Valle-Signature con una implementacion de HMAC ajena (la de la libreria
estandar de Python, por ejemplo) sobre timestamp + "." + rawBody capturado, y
congelar ese dictamen."

Este censo NO es una libreria de terceros de PyPI: es la libreria ESTANDAR de
CPython (`hmac`, `hashlib`), que no comparte una linea de codigo, un binario ni
un mantenedor con `node:crypto`. Las dos implementan el mismo estandar
(RFC 2104, HMAC; FIPS 180-4, SHA-256), cada una desde cero, en ecosistemas
distintos.

── Que hace, exactamente ────────────────────────────────────────────────────

Lee la FIXTURE que `events-hmac.spec.ts` escribe en el temporal del sistema
-el mismo orden spec-primero-script-despues que usan los censos de steputils y
pyproj-: un timestamp, un cuerpo (el mismo formato que
`webhook-outbox.transport.ts` produce para un evento de dominio), la firma que
la CONSTRUCCION DOCUMENTADA calcula sobre `${timestamp}.${rawBody}`, y una
variante con el cuerpo alterado en UN byte.

Con SU PROPIA hmac.new(...).hexdigest() -no leyendo la firma que trae la
fixture y comparandola con la misma cuenta hecha en TypeScript, que seria
tautologico- este censo:

  1. Recalcula la firma sobre (timestamp, rawBody, secret) y la compara
     -en tiempo constante, con hmac.compare_digest- contra la firma que la
     fixture dice que el emisor calculo. Si coinciden, el estandar HMAC-SHA256
     sobre exactamente esos bytes es lo unico que hace falta para reproducir
     `X-Valle-Signature`: no hay un paso oculto, ni una codificacion rara, ni
     un separador distinto.
  2. Recalcula la firma sobre el cuerpo ALTERADO y confirma que NO coincide
     con la firma original: la firma protege el cuerpo byte a byte, no solo
     su longitud o su forma.

── Como se usa ───────────────────────────────────────────────────────────────

    python3 docs/cad/corpus/oraculos/censo-hmac-stdlib.py --fixture RUTA
    python3 docs/cad/corpus/oraculos/censo-hmac-stdlib.py --fixture RUTA --destino RUTA
"""
import hashlib
import hmac
import json
import pathlib
import platform
import sys

if "--fixture" not in sys.argv:
    sys.exit("falta --fixture RUTA: la escribe events-hmac.spec.ts antes de correr este censo")
FIXTURE = pathlib.Path(sys.argv[sys.argv.index("--fixture") + 1]).resolve()

DESTINO = pathlib.Path(__file__).with_name("hmac-stdlib.json")
if "--destino" in sys.argv:
    DESTINO = pathlib.Path(sys.argv[sys.argv.index("--destino") + 1]).resolve()

fixture = json.loads(FIXTURE.read_text(encoding="utf8"))

SIGNATURE_PREFIX = "sha256="


def calcula_firma(timestamp, raw_body, secret):
    """HMAC-SHA256 sobre `${timestamp}.${rawBody}`, EXACTAMENTE como documenta
    el encabezado de outbox-signature.ts. Nada se reescribe ni se normaliza:
    los bytes son los bytes."""
    mensaje = f"{timestamp}.{raw_body}".encode("utf-8")
    clave = secret.encode("utf-8")
    return hmac.new(clave, mensaje, hashlib.sha256).hexdigest()


def firma_coincide(calculada_hex, declarada_con_prefijo):
    if not declarada_con_prefijo.startswith(SIGNATURE_PREFIX):
        return False
    declarada_hex = declarada_con_prefijo[len(SIGNATURE_PREFIX):]
    # Comparacion en tiempo constante: el mismo principio que
    # outbox-signature.ts aplica con `timingSafeEqual`.
    return hmac.compare_digest(calculada_hex, declarada_hex)


# ─────────────────────────────────────────────────────────────────────────────
# El caso genuino: la firma capturada tiene que coincidir con la que Python
# calcula desde cero, con SU implementacion, sin leer la firma de la fixture.
# ─────────────────────────────────────────────────────────────────────────────

firma_calculada = calcula_firma(fixture["timestamp"], fixture["rawBody"], fixture["secret"])
caso_genuino = {
    "firmaCalculadaPorPython": f"{SIGNATURE_PREFIX}{firma_calculada}",
    "firmaDeclaradaPorLaFixture": fixture["signature"],
    "coincide": firma_coincide(firma_calculada, fixture["signature"]),
}

# ─────────────────────────────────────────────────────────────────────────────
# El caso alterado: la MISMA firma sobre un cuerpo con un byte cambiado tiene
# que NO coincidir. Si coincidiera, la firma no protegería el contenido.
# ─────────────────────────────────────────────────────────────────────────────

firma_sobre_alterado = calcula_firma(fixture["timestamp"], fixture["tamperedBody"], fixture["secret"])
caso_alterado = {
    "firmaCalculadaSobreElCuerpoAlterado": f"{SIGNATURE_PREFIX}{firma_sobre_alterado}",
    "firmaOriginal": fixture["signature"],
    # AQUÍ se espera que NO coincida: por eso el campo se llama "coincide" y no
    # "aprobado" — un censo que renombrara el campo para que "false" pareciera
    # el resultado correcto escondería el criterio en el nombre.
    "coincide": firma_coincide(firma_sobre_alterado, fixture["signature"]),
}

dictamen_valido = caso_genuino["coincide"] is True and caso_alterado["coincide"] is False

censo = {
    "oraculo": "F",
    "generadoPor": "python3 docs/cad/corpus/oraculos/censo-hmac-stdlib.py",
    "mide": (
        "Si HMAC-SHA256 de la biblioteca ESTÁNDAR de Python (hmac + hashlib, sin "
        "instalar nada de PyPI) sobre `${timestamp}.${rawBody}` reproduce "
        "`X-Valle-Signature` para una entrega genuina, y la RECHAZA para un cuerpo "
        "alterado en un byte. Sirve al criterio events.operational."
    ),
    "herramienta": {
        "nombre": "Python hmac + hashlib (biblioteca estándar de CPython)",
        "version": platform.python_version(),
        "lenguaje": "Python",
        "autor": "Python Software Foundation (CPython)",
        "licencia": "PSF License (biblioteca estándar, incluida en la distribución de Python)",
        "origen": "Distribución estándar de Python 3 — no requiere instalación",
        "porQueCuentaComoIndependiente": (
            "No comparte una línea de código, un binario ni un mantenedor con "
            "`node:crypto`: es otra implementación del mismo estándar (RFC 2104 HMAC, "
            "FIPS 180-4 SHA-256), en otro lenguaje, mantenida por otro proyecto."
        ),
        "limiteDeSuIndependencia": (
            "Verifica el ESTÁNDAR criptográfico (HMAC-SHA256 sobre bytes concretos), no "
            "el resto del contrato de entrega (ventana de frescura de 300 s, formato "
            "ISO-8601 del timestamp, deduplicación por idempotency-key): eso lo sigue "
            "verificando outbox-signature.spec.ts, que es donde vive esa lógica."
        ),
    },
    "fixture": {
        "timestamp": fixture["timestamp"],
        "secretLength": len(fixture["secret"]),
        "rawBodyBytes": len(fixture["rawBody"].encode("utf-8")),
        "generadaPor": "apps/web/src/lib/cad/verification/events-hmac.spec.ts",
        "nota": "El secreto es SOLO de esta fixture de evidencia, fijo y determinista para que el censo sea reproducible. Nunca es un secreto de producción.",
    },
    "casoGenuino": caso_genuino,
    "casoAlterado": caso_alterado,
    "dictamen": {
        "valido": dictamen_valido,
        "criterio": "acepta la firma genuina Y rechaza la firma sobre el cuerpo alterado",
    },
}

DESTINO.write_text(json.dumps(censo, indent=2, ensure_ascii=True) + "\n", encoding="utf8")
veredicto = "VÁLIDO" if dictamen_valido else "INVÁLIDO"
print(
    f"censo hmac-stdlib (Python {platform.python_version()}): genuino={caso_genuino['coincide']} "
    f"alterado={caso_alterado['coincide']} -> {veredicto} -> {DESTINO.name}"
)
