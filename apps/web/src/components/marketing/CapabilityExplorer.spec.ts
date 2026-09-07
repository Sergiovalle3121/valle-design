/**
 * EL EXPLORADOR DE CAPACIDADES, EN ASERCIONES.
 *
 * ## Por qué este spec y no uno de Vitest/RTL
 *
 * Este repositorio no tiene Vitest ni React Testing Library instalados —
 * `npm test` corre `scripts/run-specs.mjs`, que ejecuta cada `src/**\/*.spec.ts`
 * con `tsx` y espera aserciones de `node:assert` más un `console.log` final
 * (ver ese script para el porqué del segundo requisito). El patrón real para
 * probar un componente de React en este repo —sin jsdom, sin DOM vivo— es
 * `renderToStaticMarkup` sobre marcado estático, exactamente como hace
 * `src/components/ui/primitives-contract.spec.ts` con `Tabs`. Este spec sigue
 * ESE patrón, que es el que de verdad corre en `npm test`, en vez de inventar
 * una dependencia que el proyecto no tiene.
 *
 * ## Qué se prueba y qué no
 *
 * - Que existen las seis pestañas, con la etiqueta y el orden pedidos.
 * - Que cambiar de pestaña cambia el panel visible: `CapabilityExplorerPanels`
 *   es un componente CONTROLADO (recibe `activeId`, no tiene estado propio) y
 *   por eso se puede renderizar con cualquier pestaña activa sin simular un
 *   clic — el mismo truco que `primitives-contract.spec.ts` usa para probar
 *   `Tabs` con un `value` fijo.
 * - El contrato ARIA de teclado: `role="tablist"`, `role="tab"` × 6,
 *   `aria-selected` en la activa, `tabindex="-1"` en las inactivas y
 *   `aria-controls`/`id` enlazando cada pestaña con su panel — el mismo
 *   contrato estático que `primitives-contract.spec.ts` verifica sobre la
 *   propia primitiva `Tabs`, aquí verificado sobre este componente porque es
 *   el que de verdad se publica. Este explorador no reimplementa ni un
 *   `onKeyDown`: reutiliza `Tabs` sin tocarlo, así que hereda su
 *   comportamiento de flechas/Inicio/Fin/Tab tal cual esté. Lo que exige un
 *   DOM vivo para probarse —las flechas moviendo el foco de verdad— no tiene
 *   hoy un e2e propio para `Tabs` en este repositorio; este spec no finge esa
 *   cobertura, sólo prueba lo que un render estático puede probar.
 * - Que los activos son reales: las tres capturas referenciadas existen en
 *   `public/product/`, y las tres plantillas de Toolsets existen en el
 *   catálogo real (no son ids inventados). El panel de 3D declara por escrito
 *   que es un diagrama y no una captura, y el de Colaboración no lleva
 *   ninguna `<img>` ni un nombre propio — nada que pueda leerse como una
 *   captura o un testimonio fabricados.
 *
 * Correr:  npx tsx src/components/marketing/CapabilityExplorer.spec.ts
 */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  CAPABILITY_TABS,
  CapabilityExplorer,
  CapabilityExplorerPanels,
  type CapabilityTabId,
} from "./CapabilityExplorer";
import { galleryTemplate } from "@/lib/marketing/template-gallery";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../../");

/* ── 1 · LAS SEIS PESTAÑAS EXISTEN, EN EL ORDEN PEDIDO ───────────────────── */
{
  assert.equal(
    CAPABILITY_TABS.length,
    6,
    "el explorador debe tener seis pestañas",
  );
  const ids = CAPABILITY_TABS.map((tab) => tab.id);
  assert.deepEqual(
    ids,
    ["dibujo", "anotacion", "entrega", "3d", "toolsets", "colaboracion"],
    "Dibujo · Anotación · Entrega · 3D · Toolsets · Colaboración, en ese orden",
  );
  const labels = CAPABILITY_TABS.map((tab) => tab.tabLabel);
  assert.deepEqual(labels, [
    "Dibujo",
    "Anotación",
    "Entrega",
    "3D",
    "Toolsets",
    "Colaboración",
  ]);
  // Ninguna pestaña se queda sin contenido real: título y al menos un punto.
  for (const tab of CAPABILITY_TABS) {
    assert.ok(tab.title.length > 0, `${tab.id} sin título`);
    assert.ok(tab.bullets.length > 0, `${tab.id} sin contenido`);
  }
}

/* ── 2 · EL CONTRATO DE TECLADO DE LA LISTA DE PESTAÑAS ──────────────────── */
{
  const html = render(createElement(CapabilityExplorer, {}));
  assert.match(
    html,
    /role="tablist"/,
    "sin tablist no hay pestañas, hay botones",
  );
  assert.match(
    html,
    /aria-label="Capacidades por disciplina"/,
    "la lista de pestañas se nombra para quien no la ve",
  );
  const tabCount = (html.match(/role="tab"/g) ?? []).length;
  assert.equal(
    tabCount,
    6,
    "deben pintarse las seis pestañas, no un subconjunto",
  );

  for (const tab of CAPABILITY_TABS) {
    assert.match(
      html,
      new RegExp(`data-testid="capability-tab-${tab.id}"`),
      `falta el data-testid de la pestaña ${tab.id}`,
    );
  }

  // La primera pestaña (Dibujo) es la activa por defecto: aria-selected y
  // tabindex son los dos lados del mismo contrato — sólo el tab activo entra
  // en el orden de tabulación normal, el resto se navega con flechas.
  assert.match(
    html,
    /aria-selected="true"/,
    "la pestaña activa por defecto debe anunciarse seleccionada",
  );
  const selectedFalse = (html.match(/aria-selected="false"/g) ?? []).length;
  assert.equal(
    selectedFalse,
    5,
    "las cinco pestañas restantes deben anunciarse no seleccionadas",
  );
  const negativeTabIndex = (html.match(/tabindex="-1"/g) ?? []).length;
  assert.equal(
    negativeTabIndex,
    5,
    "las pestañas inactivas salen del recorrido de Tab: dentro de la lista se navega con flechas",
  );

  // Cada botón de pestaña controla su panel por id — el enlace que un lector
  // de pantalla usa para saber qué contenido pertenece a qué pestaña.
  for (const tab of CAPABILITY_TABS) {
    assert.match(html, new RegExp(`aria-controls="panel-${tab.id}"`));
  }
}

/* ── 3 · CAMBIAR DE PESTAÑA CAMBIA EL PANEL VISIBLE ──────────────────────── */
{
  const casos: Array<[CapabilityTabId, string]> = [
    ["dibujo", "Dibujo 2D con la precisión que exige un plano"],
    ["3d", "Un sólido y su cota, en el mismo documento"],
    ["colaboracion", "Proyectos en la nube, con red debajo"],
  ];
  for (const [activeId, tituloEsperado] of casos) {
    const html = render(createElement(CapabilityExplorerPanels, { activeId }));
    assert.match(
      html,
      new RegExp(`data-testid="capability-panel-${activeId}"`),
      `el panel de ${activeId} debe estar visible cuando está activo`,
    );
    assert.match(
      html,
      new RegExp(tituloEsperado),
      `falta el título de ${activeId}`,
    );

    // Ningún otro panel se pinta a la vez: TabPanel devuelve null si no está
    // activo, así que sólo debe existir UN "capability-panel-" en el marcado.
    const paneles = (html.match(/data-testid="capability-panel-/g) ?? [])
      .length;
    assert.equal(
      paneles,
      1,
      `sólo el panel de ${activeId} debería renderizarse`,
    );

    // Y los títulos de las otras pestañas no aparecen filtrados por accidente.
    for (const [otroId, otroTitulo] of casos) {
      if (otroId === activeId) continue;
      assert.ok(
        !html.includes(otroTitulo),
        `el panel de ${activeId} no debería mostrar el título de ${otroId}`,
      );
    }
  }
}

/* ── 4 · LOS ACTIVOS SON REALES, NINGUNO INVENTADO ───────────────────────── */
{
  // Las tres capturas que reutilizan Dibujo, Anotación y Entrega ya existían
  // en public/product/ — el spec falla si algún día una de las tres se borra
  // o se renombra sin actualizar el componente.
  const capturas = [
    "public/product/paleta-propiedades.png",
    "public/product/linea-de-comandos.png",
    "public/product/espacio-papel.png",
  ];
  for (const relativo of capturas) {
    assert.ok(
      existsSync(path.join(webRoot, relativo)),
      `${relativo} no existe: Dibujo/Anotación/Entrega reutilizan capturas reales, no inventadas`,
    );
  }

  // Las tres plantillas de Toolsets existen en el catálogo real: si el id
  // estuviera mal escrito o la plantilla se retirase, esto lo dice.
  for (const id of [
    "civil-site-utilities",
    "structural-grid-core",
    "mep-plantroom",
  ]) {
    assert.ok(
      galleryTemplate(id),
      `${id} no existe en el catálogo real de plantillas`,
    );
  }

  // El panel de 3D es un diagrama y lo dice: nunca finge ser una captura.
  const panel3d = render(
    createElement(CapabilityExplorerPanels, {
      activeId: "3d" as CapabilityTabId,
    }),
  );
  assert.match(
    panel3d,
    /Diagrama del kernel, no una captura/,
    "el panel de 3D debe declarar que es un diagrama, no una captura de pantalla",
  );

  // El panel de Colaboración es una maqueta con las primitivas del sistema:
  // sin <img> (no hay captura que mostrar todavía) y sin nombre propio (no es
  // un testimonio).
  const panelColab = render(
    createElement(CapabilityExplorerPanels, {
      activeId: "colaboracion" as CapabilityTabId,
    }),
  );
  assert.ok(
    !/<img/.test(panelColab),
    "la maqueta de Colaboración no debe incluir una imagen que finja ser una captura",
  );
  assert.match(
    panelColab,
    /Compañero de equipo/,
    "la maqueta usa un rol genérico, nunca el nombre de una persona real",
  );
}

console.log(
  "CapabilityExplorer: seis pestañas, contrato de teclado, panel visible por pestaña y activos reales — verificado",
);
