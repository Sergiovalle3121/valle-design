/**
 * Contrato de `ucs-icon.ts`, sin navegador.
 *
 * Dos cosas se fijan: la FORMA (geometría pura) y el CONTRASTE de los colores
 * declarados en `THEMES` (`axisX`/`axisY`) contra el fondo de los cuatro
 * temas — el mismo criterio «gráfico, 3:1» que usa
 * `scripts/design/check-contrast.mjs`, reimplementado aquí en 12 líneas
 * porque ese gate no lee `axisX`/`axisY` (sólo `bg`) y esta prueba es la que
 * impide que un tema nuevo declare un rojo o un verde ilegible.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import {
  computeCadUcsIconGeometry,
  createCadUcsIconObject,
  setCadUcsIconColors,
} from "./ucs-icon";
import { THEMES } from "../studio/editor-presentation";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const throws = (fn: () => void, mensaje: string) => {
  assert.throws(fn, mensaje);
  verdes += 1;
};

// ── Geometría pura ───────────────────────────────────────────────────────
{
  throws(() => computeCadUcsIconGeometry(0), "armLength 0 debe tronar");
  throws(() => computeCadUcsIconGeometry(-3), "armLength negativo debe tronar");
}
{
  const g = computeCadUcsIconGeometry(2);
  eq(g.xAxis[0][0], 0, "el eje X arranca en el origen (x)");
  eq(g.xAxis[0][1], 0, "el eje X arranca en el origen (z)");
  eq(g.xAxis[1][0], 2, "la punta del eje X está a armLength de distancia");
  eq(g.xAxis[1][1], 0, "el eje X no se desvía en z");
  eq(g.yAxis[1][0], 0, "el eje Y no se desvía en x");
  eq(g.yAxis[1][1], -2, "la punta del eje Y está a -armLength (hacia «arriba» del dibujo)");
  // La punta de cada flecha coincide con la punta del eje que corona.
  eq(g.xArrow[1][0], g.xAxis[1][0], "la flecha X corona la punta del eje X (x)");
  eq(g.xArrow[1][1], g.xAxis[1][1], "la flecha X corona la punta del eje X (z)");
  eq(g.yArrow[1][0], g.yAxis[1][0], "la flecha Y corona la punta del eje Y (x)");
  eq(g.yArrow[1][1], g.yAxis[1][1], "la flecha Y corona la punta del eje Y (z)");
  // La flecha es simétrica respecto al eje que corona.
  eq(g.xArrow[0][1], -g.xArrow[2][1], "la flecha X es simétrica respecto al eje X");
  eq(g.yArrow[0][0], -g.yArrow[2][0], "la flecha Y es simétrica respecto al eje Y");
}

// ── El grupo THREE trae los 4 hijos nombrados y los colores pedidos ───────
{
  const group = createCadUcsIconObject(1, { axisX: 0xff0000, axisY: 0x00ff00 });
  eq(group.children.length, 4, "línea + flecha por cada eje");
  const byName = Object.fromEntries(group.children.map((c) => [c.name, c]));
  ok(byName["cad-ucs-axis-x"], "trae la línea del eje X");
  ok(byName["cad-ucs-arrow-x"], "trae la flecha del eje X");
  ok(byName["cad-ucs-axis-y"], "trae la línea del eje Y");
  ok(byName["cad-ucs-arrow-y"], "trae la flecha del eje Y");
  const xLineMat = (byName["cad-ucs-axis-x"] as THREE.Line).material as THREE.LineBasicMaterial;
  eq(xLineMat.color.getHex(), 0xff0000, "la línea X sale roja");
  const yArrowMat = (byName["cad-ucs-arrow-y"] as THREE.Mesh)
    .material as THREE.MeshBasicMaterial;
  eq(yArrowMat.color.getHex(), 0x00ff00, "la flecha Y sale verde");

  // `setCadUcsIconColors` repinta sin reconstruir geometría.
  setCadUcsIconColors(group, { axisX: 0x123456, axisY: 0x654321 });
  eq(xLineMat.color.getHex(), 0x123456, "repintar cambia la línea X");
  eq(yArrowMat.color.getHex(), 0x654321, "repintar cambia la flecha Y");
  eq(group.children.length, 4, "repintar no crea ni borra hijos");
}

// ── Contraste: axisX/axisY de los 4 temas contra su `bg`, mínimo gráfico 3:1 ──
function packedLuminance(rgb: number): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((rgb >> 16) & 0xff) +
    0.7152 * channel((rgb >> 8) & 0xff) +
    0.0722 * channel(rgb & 0xff)
  );
}
function contrast(a: number, b: number): number {
  const la = packedLuminance(a);
  const lb = packedLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
const GRAPHIC_MIN = 3;
for (const [key, theme] of Object.entries(THEMES)) {
  const ratioX = contrast(theme.axisX, theme.bg);
  const ratioY = contrast(theme.axisY, theme.bg);
  ok(
    ratioX >= GRAPHIC_MIN,
    `THEMES.${key}.axisX (rojo del eje X) sobre bg mide ${ratioX.toFixed(2)}:1, mínimo ${GRAPHIC_MIN}:1`,
  );
  ok(
    ratioY >= GRAPHIC_MIN,
    `THEMES.${key}.axisY (verde del eje Y) sobre bg mide ${ratioY.toFixed(2)}:1, mínimo ${GRAPHIC_MIN}:1`,
  );
}

console.log(`ucs-icon.spec: ${verdes} aserciones verdes`);
