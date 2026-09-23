/**
 * La cruz filar, renderizada.
 *
 * Existe por un defecto que estuvo vivo desde el primer día y que NADA veía:
 * los brazos se dimensionaban en porcentaje de un contenedor de 0×0, así que
 * medían cero. El DOM decía que la mira estaba ahí, `display` decía `block`, y
 * en pantalla no había nada. Esta prueba afirma sobre el MARCADO que las dos
 * decisiones que se compensan siguen estando: el ancla sin tamaño (que es lo
 * que hace que la mira caiga exactamente sobre el cursor) y los brazos medidos
 * contra la PANTALLA (que es lo que hace que se vean).
 *
 * Correr: npx tsx src/components/cad/viewport/CadCrosshairOverlay.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadCrosshairOverlay } from "./CadCrosshairOverlay";

let verdes = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

const html = renderToStaticMarkup(
  createElement(CadCrosshairOverlay, {
    crosshairPercent: 32,
    pickBoxPx: 8,
    aperturePx: 10,
  }),
);

// ── El ancla: un punto sin tamaño ───────────────────────────────────────────
ok(
  html.includes('data-testid="cad-crosshair"'),
  "la mira conserva su data-testid: los goldens y la fixture de punto de mundo la localizan por él",
);
ok(
  html.includes("size-0"),
  "el ancla sigue midiendo 0×0: es lo que hace que el transform la deje EXACTAMENTE sobre el cursor",
);
ok(html.includes("hidden"), "nace oculta; el editor la enseña en el primer movimiento");
ok(
  html.includes('aria-hidden="true"'),
  "es decoración del puntero: no la anuncia un lector de pantalla",
);

// ── Los brazos: medidos contra la PANTALLA, no contra el ancla ──────────────
ok(
  html.includes("width:32vw"),
  "el brazo horizontal mide 32vw. En % se resolvería contra el ancla de 0×0 y volvería a medir CERO",
);
ok(
  html.includes("height:32vh"),
  "el brazo vertical mide 32vh, por la misma razón",
);
ok(
  !/width:\s*32%/.test(html) && !/height:\s*32%/.test(html),
  "ningún brazo vuelve al porcentaje: ése era el defecto",
);

// ── Cuadro de designación y apertura: píxeles, y la apertura es un RADIO ────
ok(html.includes('data-testid="cad-pick-box"'), "el cuadro de designación conserva su testid");
ok(
  html.includes("width:8px") && html.includes("height:8px"),
  "el cuadro de designación mide en píxeles el lado que pide la preferencia",
);
ok(html.includes('data-testid="cad-snap-aperture"'), "la apertura de captura conserva su testid");
ok(
  html.includes("width:20px") && html.includes("height:20px"),
  "la apertura se dibuja con el DIÁMETRO: la preferencia da el radio (10 → 20 px)",
);

// ── Y el tamaño lo manda la preferencia, no una constante escondida ─────────
const grande = renderToStaticMarkup(
  createElement(CadCrosshairOverlay, {
    crosshairPercent: 100,
    pickBoxPx: 12,
    aperturePx: 4,
  }),
);
ok(
  grande.includes("width:100vw") && grande.includes("height:100vh"),
  "al 100 % los brazos cruzan la pantalla entera, como el CURSORSIZE máximo de AutoCAD",
);
ok(
  grande.includes("width:12px") && grande.includes("width:8px"),
  "el cuadro de designación (12 px) y la apertura (4 → 8 px) siguen a sus preferencias",
);

console.log(`✔ cruz filar: ${verdes} aserciones verdes`);
