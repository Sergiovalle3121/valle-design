import assert from "node:assert/strict";
import { CAD_SHELL_METRICS, cadShellCanvasBox } from "./cad-shell-layout";

/**
 * EL CONTRATO DE ACEPTACIÓN DE LA OLA «ARMAZÓN» — sin navegador.
 *
 * Cuatro combinaciones, dos ventanas. Las cuatro son las que el dueño puede
 * encontrarse nada más abrir el estudio o minimizar la cinta a mano; las dos
 * ventanas son la laptop de la auditoría (1366×768, con la barra del
 * navegador ya descontada: 1366×768) y la ventana en la que se midió el
 * 49,8 % de hoy (1440×825).
 */

// ── Las constantes son el contrato: nadie las duplica a mano ───────────────
assert.equal(CAD_SHELL_METRICS.appBar, 32);
assert.equal(CAD_SHELL_METRICS.ribbonBody, 72);
assert.equal(CAD_SHELL_METRICS.ribbonTabs, 32);
assert.equal(CAD_SHELL_METRICS.commandRow, 26);
assert.equal(CAD_SHELL_METRICS.commandExpanded, 78);
assert.equal(CAD_SHELL_METRICS.statusRow, 26);
assert.equal(CAD_SHELL_METRICS.rail, 44);
assert.equal(CAD_SHELL_METRICS.panel, 280);

// ── 1440×825, rieles plegados, cinta desplegada: ≥ 74 % ─────────────────────
{
  const box = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: false,
  });
  assert.ok(
    box.ratio >= 0.74,
    `rieles plegados + cinta desplegada a 1440×825: ${box.ratio} < 0.74`,
  );
}

// ── 1440×825, rieles plegados, cinta minimizada: ≥ 78 % ─────────────────────
{
  const box = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: true,
  });
  assert.ok(
    box.ratio >= 0.78,
    `rieles plegados + cinta minimizada a 1440×825: ${box.ratio} < 0.78`,
  );
}

// ── 1440×825, UN panel de 280 px abierto, cinta minimizada: ≥ 65 % ──────────
{
  const box = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: true,
    rightOpen: false,
    ribbonCollapsed: true,
  });
  assert.ok(
    box.ratio >= 0.65,
    `un panel abierto + cinta minimizada a 1440×825: ${box.ratio} < 0.65`,
  );
  // Da igual qué lado se abra: la geometría es simétrica.
  const mirrored = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: false,
    rightOpen: true,
    ribbonCollapsed: true,
  });
  assert.equal(mirrored.ratio, box.ratio);
}

// ── 1440×825, UN panel abierto, cinta desplegada: ≥ 60 % ────────────────────
{
  const box = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: true,
    rightOpen: false,
    ribbonCollapsed: false,
  });
  assert.ok(
    box.ratio >= 0.6,
    `un panel abierto + cinta desplegada a 1440×825: ${box.ratio} < 0.60`,
  );
}

// ── 1366×768: los cuatro números no bajan de (umbral − 0,02) ────────────────
const UMBRALES_1366 = [
  { leftOpen: false, rightOpen: false, ribbonCollapsed: false, umbral: 0.74 },
  { leftOpen: false, rightOpen: false, ribbonCollapsed: true, umbral: 0.78 },
  { leftOpen: true, rightOpen: false, ribbonCollapsed: true, umbral: 0.65 },
  { leftOpen: true, rightOpen: false, ribbonCollapsed: false, umbral: 0.6 },
];
for (const { leftOpen, rightOpen, ribbonCollapsed, umbral } of UMBRALES_1366) {
  const box = cadShellCanvasBox({
    width: 1366,
    height: 768,
    leftOpen,
    rightOpen,
    ribbonCollapsed,
  });
  const piso = umbral - 0.02;
  assert.ok(
    box.ratio >= piso,
    `1366×768 (leftOpen=${leftOpen} rightOpen=${rightOpen} ribbonCollapsed=${ribbonCollapsed}): ` +
      `${box.ratio} < ${piso} (umbral de 1440 menos 2 puntos)`,
  );
}

// ── El lienzo por defecto de HOY (49,8 %) queda muy por debajo del nuevo ────
{
  const hoy = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: true,
    rightOpen: true,
    ribbonCollapsed: false,
  });
  assert.ok(hoy.ratio < 0.5, `con los dos paneles abiertos el lienzo sigue siendo minoría: ${hoy.ratio}`);
  const objetivo = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: false,
  });
  assert.ok(objetivo.ratio - hoy.ratio > 0.2, "el armazón debe ganar más de 20 puntos de lienzo");
}

// ── Dimensiones nunca negativas, incluso en ventanas absurdamente chicas ────
{
  const box = cadShellCanvasBox({
    width: 100,
    height: 100,
    leftOpen: true,
    rightOpen: true,
    ribbonCollapsed: false,
  });
  assert.ok(box.width >= 0 && box.height >= 0 && box.ratio >= 0);
}

// ═══ MODO ESENCIAL: la barra única en la fila `ribbon` ══════════════════════
//
// El contrato de la Tanda 1 es ≥ 75 % de lienzo a 1440×769 y ≥ 70 % a
// 1366×768 con los muelles plegados. Aquí se fija con números, antes de que
// exista el DOM de la barra, cuánto puede medir esa fila para cumplirlo.
let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/**
 * Misma cuenta que `cadShellCanvasBox`, pero con el alto de la fila `ribbon`
 * como parámetro: sirve para preguntar «¿y si la barra midiera X?» SIN abrir
 * la API pública a un número arbitrario. Se ata a la función real más abajo
 * para que no pueda desviarse de ella en silencio.
 */
const lienzoConBarra = (barra: number, width: number, height: number) => {
  const chrome =
    CAD_SHELL_METRICS.appBar + barra + CAD_SHELL_METRICS.commandRow + CAD_SHELL_METRICS.statusRow;
  const ancho = width - 2 * CAD_SHELL_METRICS.rail;
  return (ancho * (height - chrome)) / (width * height);
};

// ── La constante es el contrato ─────────────────────────────────────────────
ok(CAD_SHELL_METRICS.essentialBar === 56, `essentialBar debe valer 56, no ${CAD_SHELL_METRICS.essentialBar}`);

// ── 1440×769, muelles plegados, barra Esencial: ≥ 75 % ──────────────────────
{
  const box = cadShellCanvasBox({
    width: 1440,
    height: 769,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: false,
    essentialBar: true,
  });
  ok(box.ratio >= 0.75, `muelles plegados + barra Esencial a 1440×769: ${box.ratio} < 0.75`);
  // La función auxiliar reproduce la cuenta real: si alguien cambia la fórmula
  // de `cadShellCanvasBox`, el caso del techo de abajo deja de ser fiable y
  // esta línea lo dice.
  ok(
    lienzoConBarra(CAD_SHELL_METRICS.essentialBar, 1440, 769) === box.ratio,
    "la función auxiliar del spec calca a cadShellCanvasBox con la barra Esencial",
  );
  // En Esencial la cinta está OCULTA, no minimizada: `ribbonCollapsed` no
  // cambia el resultado.
  const plegada = cadShellCanvasBox({
    width: 1440,
    height: 769,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: true,
    essentialBar: true,
  });
  ok(plegada.ratio === box.ratio, "con la barra Esencial, ribbonCollapsed no entra en la cuenta");
}

// ── 1366×768, muelles plegados, barra Esencial: ≥ 70 % ──────────────────────
{
  const box = cadShellCanvasBox({
    width: 1366,
    height: 768,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: false,
    essentialBar: true,
  });
  ok(box.ratio >= 0.7, `muelles plegados + barra Esencial a 1366×768: ${box.ratio} < 0.70`);
}

// ── El techo: por qué son 56 y no «lo que pida el diseño» ───────────────────
// A 1440×769, con 71 px en la fila `ribbon` el lienzo cae por debajo del 75 %.
// Queda escrito con números para que nadie suba la barra «un poco» sin ver
// qué contrato rompe: el techo teórico es 70 px, y 56 deja margen.
{
  const conSetentaYUno = lienzoConBarra(71, 1440, 769);
  ok(conSetentaYUno < 0.75, `con 71 px la barra ya rompe el 75 % a 1440×769: ${conSetentaYUno}`);
  const conSetenta = lienzoConBarra(70, 1440, 769);
  ok(conSetenta >= 0.75, `70 px es el último alto que cumple a 1440×769: ${conSetenta}`);
}

// ── Sin `essentialBar` la cuenta es la de siempre, byte a byte ──────────────
{
  const sinCampo = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: false,
  });
  const explicitoFalso = cadShellCanvasBox({
    width: 1440,
    height: 825,
    leftOpen: false,
    rightOpen: false,
    ribbonCollapsed: false,
    essentialBar: false,
  });
  ok(
    sinCampo.width === explicitoFalso.width &&
      sinCampo.height === explicitoFalso.height &&
      sinCampo.ratio === explicitoFalso.ratio,
    "omitir essentialBar equivale a essentialBar=false: los casos de Pro no cambian",
  );
}

console.log(`cad-shell-layout (barra Esencial): ${checks}/${checks} comprobaciones verdes`);
console.log("cad-shell-layout.spec.ts OK");
