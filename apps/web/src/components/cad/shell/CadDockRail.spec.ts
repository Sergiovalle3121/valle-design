/**
 * EL RIEL: el punto de «aquí hay algo que ver».
 *
 * Por qué existe esta comprobación. Hasta la ola «legible», designar cualquier
 * objeto DESPLEGABA solo el muelle derecho: el lienzo pasaba de 1190 a 911 px
 * de ancho y volvía al soltar la designación, en cada clic, reescalando el
 * dibujo bajo el cursor (medido el 20-sep-2026). Se quitó —AutoCAD tampoco
 * abre la paleta de propiedades al designar—, pero eso se llevaba por delante
 * la ÚNICA señal de que había propiedades que tocar. El punto la repone sin
 * mover un píxel del plano.
 *
 * Tres afirmaciones, y las tres importan:
 *
 *   1. Con algo designado y el panel plegado, el botón lleva el punto Y LO
 *      DICE: `aria-label` cambia. Un aviso que sólo es un color no existe para
 *      quien usa lector de pantalla — ni para quien no distingue ese color.
 *   2. En el botón ABIERTO no hay punto: su contenido está a la vista, y
 *      avisar de algo que se ve es ruido.
 *   3. Sin nada designado no hay punto en ninguno.
 *
 * Correr: npx tsx src/components/cad/shell/CadDockRail.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadDockRail } from "./CadDockRail";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const items = [
  { id: "properties", icon: null, ariaLabel: "Abrir propiedades" },
  { id: "selection", icon: null, ariaLabel: "Abrir selección profesional" },
];

const pintar = (activeId: string | null, badgeId: string | null) =>
  renderToStaticMarkup(
    createElement(CadDockRail, {
      side: "right" as const,
      items,
      activeId,
      badgeId,
      onToggle: () => undefined,
    }),
  );

// (1) Designado y plegado: punto, y el nombre accesible lo dice.
{
  const html = pintar(null, "properties");
  ok(html.includes('data-badge="true"'), "el botón marcado lleva el punto");
  ok(
    html.includes('aria-label="Abrir propiedades (hay algo que ver)"'),
    "el aviso también se OYE: el nombre accesible cambia, no sólo el color",
  );
  ok(
    !/data-testid="cad-rail-selection"[^>]*data-badge/.test(html),
    "el punto va sólo en el botón que tiene algo, no en todos",
  );
}

// (2) El panel ABIERTO no se avisa a sí mismo.
{
  const html = pintar("properties", "properties");
  ok(!html.includes('data-badge="true"'), "con el panel abierto no hay punto");
  ok(
    html.includes('aria-label="Abrir propiedades"'),
    "y el nombre accesible vuelve a ser el de siempre",
  );
  ok(html.includes('aria-pressed="true"'), "el botón abierto sigue anunciándose pulsado");
}

// (3) Sin nada designado, ningún punto.
{
  const html = pintar(null, null);
  ok(!html.includes("data-badge"), "sin nada que ver, ningún botón lleva punto");
  ok(
    html.includes('data-testid="cad-rail-properties"') &&
      html.includes('data-testid="cad-rail-selection"'),
    "los botones siguen ahí: el punto es un añadido, no una condición para pintarlos",
  );
}

console.log(`CadDockRail: ${checks}/${checks} comprobaciones verdes`);
