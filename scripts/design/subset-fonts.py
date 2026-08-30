#!/usr/bin/env python3
"""Genera los subconjuntos woff2 que sirve el navegador.

Por qué existe: el 74 % de los bytes de la portada eran tipografía (1 486 KB de
5 caras, tres en TTF sin comprimir) y el desglose del LCP móvil daba 95 % de
render delay. Las caras completas traen cirílico, vietnamita, IPA y cientos de
alternates que este producto no compone jamás. Este script corta cada cara al
inventario REAL del producto y la envuelve en woff2 (brotli).

Qué conserva, deliberadamente:
- Los EJES VARIABLES enteros (wght, opsz…): el sistema de diseño interpola pesos.
- Las features OpenType de TRABAJO por cara (`FEATURES_*`): `tnum` porque el
  estudio compone tablas con `tabular-nums` y las cotas se comparan en columna;
  `ccmp/mark/mkmk` para el español descompuesto. La mono pierde `liga/calt` a
  propósito: en la línea de comandos quien teclea `->` tiene que ver `->`.
- El repertorio técnico del oficio EN LAS CARAS QUE LO COMPONEN: GD&T
  (⌀ ⌒ ⌖ ⏤ ⏥ Ⓛ Ⓜ Ⓢ), griego de ingeniería, flechas, operadores matemáticos,
  cajas y formas geométricas van en Inter y JetBrains Mono (UI del estudio y
  línea de comandos); Space Grotesk solo compone titulares y lleva el perfil
  `display` (latín + puntuación + flechas de CTA). El inventario salió de un
  barrido de codepoints de `apps/web/src` + `packages/messages`; los no-ASCII
  que solo aparecen en comentarios de código (cirílico, superíndices fonéticos)
  quedan fuera a propósito.

Los ORIGINALES no se tocan: son la fuente canónica de regeneración y
`JetBrainsMono-wght.ttf` además es fixture del oráculo de incrustación PDF
(plot-fidelity.spec.ts). El gate `check:fonts` exige originales Y subconjuntos,
y pone techo de peso a los subconjuntos.

POR QUÉ @font-face MANUAL Y NO `next/font/local` (medido, 2026-08-29):
`next/font` decide el preload POR LLAMADA. Con las cinco caras precargadas el
móvil medía 73-75; sin precarga de Inter, el párrafo del hero pintaba con el
fallback a los 2.4 s y REPINTABA al llegar la fuente (~5 s) — y LCP toma el
último pintado del elemento más grande: 78 de nota. Precargar solo la romana
exigía desdoblarla en otra llamada, y `next/font` emite entonces el archivo
DUPLICADO (sufijo `.p.`) con el @font-face consumido apuntando al que NO se
precarga: descarga doble. La salida es la de siempre en esta casa: control
directo. Este script emite las caras a `public/fonts/` con hash de contenido
en el nombre (cache inmutable), genera `src/app/fonts.css` con los @font-face
—romana e itálica en la MISMA familia, para que el font-matching no sintetice
oblicuas en el MText— y las métricas de fallback sincronizadas (los valores
`ascent/descent/size-adjust` que calculaba next/font para estas caras exactas,
conservados aquí), y publica en `src/config/fonts-generated.ts` las DOS
precargas quirúrgicas: Inter romana y Space Grotesk. El resto llega a demanda.

Uso (una vez por cambio de fuente o de inventario):
    pip install fonttools brotli
    python3 scripts/design/subset-fonts.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parents[2]
FUENTES = RAIZ / "apps" / "web" / "src" / "fonts"
PUBLICAS = RAIZ / "apps" / "web" / "public" / "fonts"
FONTS_CSS = RAIZ / "apps" / "web" / "src" / "app" / "fonts.css"
GENERADO_TS = RAIZ / "apps" / "web" / "src" / "config" / "fonts-generated.ts"

# Rangos que el producto compone. Ampliar exige tocar este fichero y regenerar:
# así el repertorio queda versionado en vez de depender de la memoria de nadie.
# La primera pasada usó bloques Unicode enteros y dejó 910 KB: la clausura de
# features arrastraba cientos de alternates. Estos rangos son el inventario
# medido más el repertorio del oficio, punto por punto.
RANGOS_COMPLETOS = [
    (0x0020, 0x007E),  # Latín básico
    (0x00A0, 0x00FF),  # Latín-1: es-MX (á é í ó ú ü ñ ¿ ¡), ° ± ² ³ µ · ½ × Ø ÷
    (0x0100, 0x017F),  # Latín extendido A: nombres europeos, Œ Š Ž …
    (0x0192, 0x0192),  # ƒ
    (0x02C6, 0x02C6),  # ˆ
    (0x02DC, 0x02DC),  # ˜
    (0x0300, 0x036F),  # diacríticos combinantes (entrada descompuesta)
    # Griego de ingeniería: mayúsculas estructurales + minúsculas completas.
    (0x0393, 0x0394),  # Γ Δ
    (0x0398, 0x0398),  # Θ
    (0x039B, 0x039B),  # Λ
    (0x039E, 0x039E),  # Ξ
    (0x03A0, 0x03A0),  # Π
    (0x03A3, 0x03A3),  # Σ
    (0x03A6, 0x03A6),  # Φ
    (0x03A8, 0x03A9),  # Ψ Ω
    (0x03B1, 0x03C9),  # α…ω
    (0x2000, 0x204A),  # puntuación general: – — “ ” • … ′ ″ ‖ ⁄(2044)
    (0x2070, 0x209C),  # superíndices y subíndices
    (0x20AC, 0x20AC),  # €
    (0x2113, 0x2113),  # ℓ
    (0x2116, 0x2116),  # №
    (0x2122, 0x2122),  # ™
    (0x2126, 0x2126),  # Ω (ohmio)
    (0x212E, 0x212E),  # ℮
    (0x2150, 0x215F),  # fracciones ⅓ ⅙ ¼ ¾ …
    (0x2190, 0x2199),  # flechas rectas ← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙
    (0x21A6, 0x21A6),  # ↦
    (0x21C4, 0x21C4),  # ⇄
    (0x21D0, 0x21D4),  # ⇐ ⇑ ⇒ ⇓ ⇔
    (0x21E7, 0x21E7),  # ⇧ (mayús en atajos)
    # Operadores matemáticos del inventario + delta/parcial/√ del oficio.
    (0x2202, 0x2202),  # ∂
    (0x2205, 0x2206),  # ∅ ∆
    (0x2208, 0x2208),  # ∈
    (0x2211, 0x2213),  # ∑ − ∓
    (0x2218, 0x2218),  # ∘
    (0x221A, 0x221A),  # √
    (0x221E, 0x2220),  # ∞ ∟ ∠
    (0x2225, 0x2226),  # ∥ ∦
    (0x2229, 0x222B),  # ∩ ∪ ∫
    (0x222E, 0x222E),  # ∮
    (0x2248, 0x2249),  # ≈ ≉
    (0x2260, 0x2261),  # ≠ ≡
    (0x2264, 0x2265),  # ≤ ≥
    (0x226B, 0x226B),  # ≫
    (0x22A5, 0x22A5),  # ⊥
    # Técnicos y GD&T: diámetro, arco, posición, teclas y tolerancias de forma.
    (0x2300, 0x2300),  # ⌀
    (0x2303, 0x2303),  # ⌃
    (0x2312, 0x2313),  # ⌒ ⌓
    (0x2316, 0x2316),  # ⌖
    (0x2318, 0x2318),  # ⌘
    (0x2325, 0x2326),  # ⌥ ⌦
    (0x232B, 0x232B),  # ⌫
    (0x232D, 0x232D),  # ⌭ cilindricidad
    (0x232F, 0x2330),  # ⌯ simetría · ⌰ alabeo total
    (0x23CE, 0x23CE),  # ⏎
    (0x23E4, 0x23E5),  # ⏤ rectitud · ⏥ planitud
    # Modificadores GD&T encerrados: Ⓔ Ⓕ Ⓛ Ⓜ Ⓟ Ⓢ Ⓣ Ⓤ
    (0x24BA, 0x24BB),
    (0x24C1, 0x24C2),
    (0x24C5, 0x24C5),
    (0x24C8, 0x24CA),
    # Cajas y formas para consola y UI.
    (0x2500, 0x2500),
    (0x2502, 0x2502),
    (0x250C, 0x250C),
    (0x2510, 0x2510),
    (0x2514, 0x2514),
    (0x2518, 0x2518),
    (0x251C, 0x251C),
    (0x2524, 0x2524),
    (0x252C, 0x252C),
    (0x2534, 0x2534),
    (0x253C, 0x253C),
    (0x2550, 0x2551),
    (0x25A0, 0x25A1),  # ■ □
    (0x25B2, 0x25B3),  # ▲ △
    (0x25B6, 0x25B6),  # ▶
    (0x25B8, 0x25B8),  # ▸
    (0x25BC, 0x25BD),  # ▼ ▽
    (0x25C6, 0x25C7),  # ◆ ◇
    (0x25CB, 0x25CB),  # ○
    (0x25CE, 0x25CF),  # ◎ ●
    (0x25E6, 0x25E6),  # ◦
    (0x26A0, 0x26A0),  # ⚠
    (0x2713, 0x2718),  # ✓ ✔ ✕ ✖ ✗ ✘
    (0x2744, 0x2744),  # ❄ (congelar capa)
    (0x27C2, 0x27C2),  # ⟂
    (0x27FA, 0x27FA),  # ⟺
    (0xFB00, 0xFB06),  # ligaduras fi fl
    (0xFF0B, 0xFF0B),  # ＋ de ancho completo (etiquetas de teclado)
    (0xFFFD, 0xFFFD),  # carácter de reemplazo
]

# Features por cara, en vez de '*': la clausura de cv01-cv13/ss01-ss08 de Inter
# y de las ~800 ligaduras de código de JetBrains Mono es lo que pesaba. En la
# línea de comandos las ligaduras además MIENTEN: quien teclea `->` tiene que
# ver `->`, no una flecha. `tnum` se queda porque el estudio compone tablas con
# `tabular-nums`; `ccmp/mark/mkmk` porque el español descompuesto los necesita.
FEATURES_TEXTO = [
    "ccmp", "mark", "mkmk", "kern", "liga", "calt", "locl", "case",
    "tnum", "lnum", "pnum", "onum", "frac", "dnom", "numr", "ordn",
    "subs", "sups", "zero",
]
FEATURES_MONO = ["ccmp", "mark", "mkmk", "kern", "locl", "case", "tnum", "zero"]

# Los titulares componen es-MX, cifras y alguna flecha de CTA; nada de GD&T.
RANGOS_DISPLAY = [
    (0x0020, 0x007E),
    (0x00A0, 0x00FF),
    (0x0100, 0x017F),
    (0x02C6, 0x02C6),
    (0x02DC, 0x02DC),
    (0x0300, 0x036F),
    (0x2000, 0x204A),
    (0x20AC, 0x20AC),
    (0x2122, 0x2122),
    (0x2190, 0x2199),
    (0x21D2, 0x21D2),
    (0x2212, 0x2212),
    (0xFB00, 0xFB06),
    (0xFFFD, 0xFFFD),
]

CARAS = [
    {
        "origen": "InterVariable.woff2",
        "base": "InterVariable.subset",
        "features": FEATURES_TEXTO,
        "rangos": RANGOS_COMPLETOS,
        "familia": "Inter",
        "estilo": "normal",
        "pesos": "100 900",
        "preload": True,
    },
    {
        "origen": "InterVariable-Italic.woff2",
        "base": "InterVariable-Italic.subset",
        "features": FEATURES_TEXTO,
        "rangos": RANGOS_COMPLETOS,
        "familia": "Inter",
        "estilo": "italic",
        "pesos": "100 900",
        "preload": False,
    },
    {
        "origen": "JetBrainsMono-wght.ttf",
        "base": "JetBrainsMono.subset",
        "features": FEATURES_MONO,
        "rangos": RANGOS_COMPLETOS,
        "familia": "JetBrains Mono",
        "estilo": "normal",
        "pesos": "100 800",
        "preload": False,
    },
    {
        "origen": "JetBrainsMono-Italic-wght.ttf",
        "base": "JetBrainsMono-Italic.subset",
        "features": FEATURES_MONO,
        "rangos": RANGOS_COMPLETOS,
        "familia": "JetBrains Mono",
        "estilo": "italic",
        "pesos": "100 800",
        "preload": False,
    },
    {
        "origen": "SpaceGrotesk-wght.ttf",
        "base": "SpaceGrotesk.subset",
        "features": FEATURES_TEXTO,
        "rangos": RANGOS_DISPLAY,
        "familia": "Space Grotesk",
        "estilo": "normal",
        "pesos": "300 700",
        "preload": True,
    },
]

# Métricas de fallback sincronizadas con Arial, los MISMOS valores que
# calculaba next/font (fontkit) para estas caras: el respaldo ocupa el sitio
# exacto de la fuente real y el swap no mueve el layout (CLS 0).
FALLBACKS = {
    "Inter": ("Arial", "89.79%", "22.36%", "0.0%", "107.89%"),
    "Space Grotesk": ("Arial", "88.78%", "26.34%", "0.0%", "110.84%"),
    "JetBrains Mono": ("Arial", "77.57%", "22.82%", "0.0%", "131.49%"),
}

VARIABLES = {
    "Inter": "--font-inter",
    "Space Grotesk": "--font-space-grotesk",
    "JetBrains Mono": "--font-jetbrains",
}


def unicodes(rangos: list[tuple[int, int]]) -> set[int]:
    puntos: set[int] = set()
    for inicio, fin in rangos:
        puntos.update(range(inicio, fin + 1))
    return puntos


def subconjuntar(origen: Path, features: list[str], puntos: set[int]) -> tuple[bytes, dict]:
    fuente = TTFont(str(origen))
    cobertura_original = set()
    for tabla in fuente["cmap"].tables:
        cobertura_original.update(tabla.cmap.keys())

    opciones = Options()
    opciones.flavor = "woff2"
    opciones.layout_features = features
    opciones.name_IDs = [1, 2, 3, 4, 6, 13, 14]  # familia, estilo, licencia
    opciones.notdef_outline = True
    opciones.recalc_bounds = True
    opciones.recalc_average_width = True
    opciones.drop_tables += ["DSIG"]

    sub = Subsetter(options=opciones)
    sub.populate(unicodes=puntos)
    sub.subset(fuente)

    import io

    buffer = io.BytesIO()
    fuente.save(buffer)
    datos = buffer.getvalue()

    fuente_sub = TTFont(io.BytesIO(datos))
    cobertura_sub = set()
    for tabla in fuente_sub["cmap"].tables:
        cobertura_sub.update(tabla.cmap.keys())

    # Verificación: ningún punto pedido que el ORIGINAL cubría puede faltar.
    perdidos = sorted((puntos & cobertura_original) - cobertura_sub)
    return datos, {
        "glifosOrigen": len(cobertura_original),
        "glifosDestino": len(cobertura_sub),
        "perdidos": [hex(pto) for pto in perdidos],
    }


CABECERA_GENERADO = (
    "GENERADO por scripts/design/subset-fonts.py — no editar a mano; "
    "regenerar tras cambiar fuentes o inventario."
)


def escribir_css(filas: list[dict]) -> None:
    lineas = [
        f"/* {CABECERA_GENERADO}",
        " *",
        " * Romana e itálica comparten familia a propósito: el font-matching del",
        " * navegador elige la cara itálica REAL dentro de la familia; separarlas",
        " * produciría oblicuas sintéticas en el MText del estudio y en docs.",
        " * Las familias *Fallback llevan métricas sincronizadas con Arial (los",
        " * valores que calculaba next/font para estas caras): el respaldo ocupa",
        " * el sitio exacto de la fuente real y el swap no mueve el layout.",
        " */",
    ]
    for fila in filas:
        lineas += [
            "@font-face {",
            f'  font-family: "{fila["familia"]}";',
            f'  src: url("/fonts/{fila["archivo"]}") format("woff2");',
            "  font-display: swap;",
            f'  font-weight: {fila["pesos"]};',
            f'  font-style: {fila["estilo"]};',
            "}",
        ]
    for familia, (local, asc, desc, gap, size) in FALLBACKS.items():
        lineas += [
            "@font-face {",
            f'  font-family: "{familia} Fallback";',
            f"  src: local({local});",
            f"  ascent-override: {asc};",
            f"  descent-override: {desc};",
            f"  line-gap-override: {gap};",
            f"  size-adjust: {size};",
            "}",
        ]
    lineas.append(":root {")
    for familia, variable in VARIABLES.items():
        lineas.append(f'  {variable}: "{familia}", "{familia} Fallback";')
    lineas.append("}")
    FONTS_CSS.write_text("\n".join(lineas) + "\n", encoding="utf8")


def escribir_ts(filas: list[dict]) -> None:
    precargas = [f'  "/fonts/{f["archivo"]}",' for f in filas if f["preload"]]
    contenido = "\n".join(
        [
            f"// {CABECERA_GENERADO}",
            "// Las DOS caras que componen el primer viewport de las públicas:",
            "// Inter romana (cuerpo) y Space Grotesk (titulares). El resto llega",
            "// a demanda vía @font-face (src/app/fonts.css).",
            "export const PRELOAD_FONTS = [",
            *precargas,
            "] as const;",
            "",
        ]
    )
    GENERADO_TS.write_text(contenido, encoding="utf8")


def main() -> int:
    PUBLICAS.mkdir(parents=True, exist_ok=True)
    for viejo in PUBLICAS.glob("*.woff2"):
        viejo.unlink()
    filas = []
    fallo = False
    for cara in CARAS:
        origen = FUENTES / cara["origen"]
        if not origen.exists():
            print(f"FALTA {origen}", file=sys.stderr)
            return 1
        datos, verificacion = subconjuntar(
            origen, cara["features"], unicodes(cara["rangos"])
        )
        hash8 = hashlib.sha256(datos).hexdigest()[:8]
        archivo = f"{cara['base']}.{hash8}.woff2"
        (PUBLICAS / archivo).write_bytes(datos)
        fila = {
            "origen": cara["origen"],
            "archivo": archivo,
            "familia": cara["familia"],
            "estilo": cara["estilo"],
            "pesos": cara["pesos"],
            "preload": cara["preload"],
            "bytesOrigen": origen.stat().st_size,
            "bytesDestino": len(datos),
            "sha256": hashlib.sha256(datos).hexdigest(),
            **verificacion,
        }
        filas.append(fila)
        pct = 100 - round(100 * fila["bytesDestino"] / fila["bytesOrigen"])
        print(
            f"{archivo}: {fila['bytesDestino']/1024:.1f} KB "
            f"(de {fila['bytesOrigen']/1024:.1f} KB, −{pct}%), "
            f"{fila['glifosDestino']} codepoints"
        )
        if fila["perdidos"]:
            fallo = True
            print(f"  PERDIDOS: {fila['perdidos']}", file=sys.stderr)

    escribir_css(filas)
    escribir_ts(filas)
    manifiesto = {
        "generado": str(date.today()),
        "por": "scripts/design/subset-fonts.py",
        "rangosCompletos": [f"U+{a:04X}-U+{b:04X}" for a, b in RANGOS_COMPLETOS],
        "rangosDisplay": [f"U+{a:04X}-U+{b:04X}" for a, b in RANGOS_DISPLAY],
        "caras": filas,
    }
    (FUENTES / "subsets.manifest.json").write_text(
        json.dumps(manifiesto, indent=2, ensure_ascii=False) + "\n", encoding="utf8"
    )
    total_o = sum(f["bytesOrigen"] for f in filas)
    total_d = sum(f["bytesDestino"] for f in filas)
    print(f"TOTAL: {total_d/1024:.0f} KB frente a {total_o/1024:.0f} KB originales")
    print(f"CSS: {FONTS_CSS.relative_to(RAIZ)} · TS: {GENERADO_TS.relative_to(RAIZ)}")
    if fallo:
        print("El subconjunto perdió codepoints que el original cubría.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
