/**
 * El anclaje de la rueda, en aritmética pura.
 *
 * Lo que se afirma es la propiedad, no un número mágico: tras aplicar la
 * corrección, el punto de dibujo bajo el píxel es EL MISMO que antes del zoom.
 * Si esa igualdad se rompe, la rueda deja de acercar hacia el cursor, y ése es
 * el renglón 9 de la prueba de los diez segundos.
 */
import { strict as assert } from "node:assert";
import { cadPlanWheelAnchorCorrection } from "./plan-wheel-anchor";
import { cadViewScreenToWorld, type CadView } from "@/lib/cad/view/cad-view";

let verdes = 0;
const cerca = (actual: number, esperado: number, mensaje: string, tol = 1e-9) => {
  assert.ok(Math.abs(actual - esperado) <= tol, `${mensaje} (${actual} vs ${esperado})`);
  verdes += 1;
};

const vista = (pixelsPerUnit: number, centerX = 4_000, centerY = 3_000): CadView => ({
  mode: "2d",
  centerX,
  centerY,
  pixelsPerUnit,
  widthPx: 784,
  heightPx: 507,
  twistDeg: 0,
  yScreenSign: 1,
});

// --- 1 · acercar sobre un píxel cualquiera deja ese punto quieto -------------
for (const [px, py] of [
  [572, 134],
  [10, 10],
  [392, 253],
  [780, 500],
] as const) {
  const antes = vista(0.0604);
  const anclado = cadViewScreenToWorld(antes, px, py);
  const despues = vista(antes.pixelsPerUnit * 1.1191);
  const { dx, dy } = cadPlanWheelAnchorCorrection(antes, despues, px, py);
  const corregida = { ...despues, centerX: despues.centerX + dx, centerY: despues.centerY + dy };
  const final = cadViewScreenToWorld(corregida, px, py);
  cerca(final.x, anclado.x, `x del punto bajo (${px}, ${py}) tras acercar`, 1e-6);
  cerca(final.y, anclado.y, `y del punto bajo (${px}, ${py}) tras acercar`, 1e-6);
}

// --- 2 · alejar también, y con el centro desplazado -------------------------
{
  const antes = vista(0.0604, 12_500, -3_200);
  const px = 700;
  const py = 60;
  const anclado = cadViewScreenToWorld(antes, px, py);
  const despues = vista(antes.pixelsPerUnit / 1.1191, 12_500, -3_200);
  const { dx, dy } = cadPlanWheelAnchorCorrection(antes, despues, px, py);
  const corregida = { ...despues, centerX: despues.centerX + dx, centerY: despues.centerY + dy };
  const final = cadViewScreenToWorld(corregida, px, py);
  cerca(final.x, anclado.x, "x tras alejar con el centro desplazado", 1e-6);
  cerca(final.y, anclado.y, "y tras alejar con el centro desplazado", 1e-6);
}

// --- 3 · en el centro exacto la corrección es nula --------------------------
{
  const antes = vista(0.0604);
  const despues = vista(0.0604 * 1.3);
  const { dx, dy } = cadPlanWheelAnchorCorrection(antes, despues, 392, 253.5);
  cerca(dx, 0, "acercar en el centro no corre el encuadre en x", 1e-9);
  cerca(dy, 0, "ni en y", 1e-9);
}

console.log(`plan-wheel-anchor: ${verdes} comprobaciones verdes`);
