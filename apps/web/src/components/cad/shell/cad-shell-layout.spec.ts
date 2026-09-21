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

console.log("cad-shell-layout.spec.ts OK");
