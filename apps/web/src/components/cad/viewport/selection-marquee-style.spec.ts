/**
 * Contrato de `selection-marquee-style.ts`, sin navegador.
 */
import { strict as assert } from "node:assert";
import { THEMES } from "../studio/editor-presentation";
import {
  cadSelectionMarqueeKind,
  cadSelectionMarqueeStyle,
} from "./selection-marquee-style";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const noEq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.notEqual(actual, esperado, mensaje);
  verdes += 1;
};

// ── Qué gesto es cada arrastre — la misma regla que tenía `drawMarquee` ────
{
  eq(cadSelectionMarqueeKind(0, 10), "window", "izquierda→derecha es ventana");
  eq(cadSelectionMarqueeKind(0, 0), "window", "sin desplazamiento cuenta como ventana (x1 >= x0)");
  eq(cadSelectionMarqueeKind(10, 0), "crossing", "derecha→izquierda es captura");
}

// ── Ventana: color de `selectWindow`, borde CONTINUO ────────────────────────
for (const themeKey of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
  const style = cadSelectionMarqueeStyle("window", themeKey);
  eq(style.color, THEMES[themeKey].selectWindow, `ventana usa selectWindow del tema ${themeKey}`);
  eq(style.dash, null, `ventana (${themeKey}) es de borde continuo`);
  ok(style.fillOpacity > 0 && style.fillOpacity < 1, "el relleno sugerido es translúcido");
}

// ── Captura: color de `axisY` (el mismo verde que el icono UCS), borde DISCONTINUO ──
for (const themeKey of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
  const style = cadSelectionMarqueeStyle("crossing", themeKey);
  eq(style.color, THEMES[themeKey].axisY, `captura usa axisY (verde) del tema ${themeKey}`);
  ok(style.dash !== null, `captura (${themeKey}) es de borde discontinuo`);
  ok((style.dash as [number, number])[0] > 0, "el trazo del patrón discontinuo es positivo");
  ok((style.dash as [number, number])[1] > 0, "el hueco del patrón discontinuo es positivo");
}

// ── Ventana y captura nunca comparten color dentro del mismo tema ──────────
for (const themeKey of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
  const ventana = cadSelectionMarqueeStyle("window", themeKey);
  const captura = cadSelectionMarqueeStyle("crossing", themeKey);
  noEq(ventana.color, captura.color, `ventana y captura se distinguen por color en ${themeKey}`);
}

console.log(`selection-marquee-style.spec: ${verdes} aserciones verdes`);
