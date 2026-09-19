/**
 * La tarjeta del recorrido guiado: arranca plegada y se queda con sus clics.
 *
 * El defecto que vio el dueño en producción: la tarjeta flotaba encima de la
 * paleta de herramientas con `pointer-events-none`, así que pulsar su texto
 * encendía la herramienta de debajo («Pasillo», «Área», «Ajustar todo»). Ahora
 * se pinta en el muelle izquierdo (`tour-slot.ts`, probado en su spec) y, cuando
 * tiene que flotar, reclama el puntero para sí.
 *
 * Aquí se renderiza el componente de verdad —sin navegador, así que sin
 * muelle: la instantánea de servidor del hueco es `null` y sale la colocación
 * FLOTANTE, que es justo la que podía dejar pasar los clics—. La geometría
 * (que no pise la paleta ni el lienzo) la mide el golden 67 en Playwright.
 *
 * Correr: npx tsx src/components/cad/onboarding/CadGuidedTourDock.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CadCommandEngineHost } from "../command-line/command-engine-host";
import { CadGuidedTourDock } from "./CadGuidedTourDock";
import { cadTourHost } from "./tour-host";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** El recorrido sólo lee el dibujo en su latido, que en el servidor no corre. */
const host = { documentView: () => null } as unknown as CadCommandEngineHost;

const render = () => renderToStaticMarkup(createElement(CadGuidedTourDock, { host }));

/** Las clases de la `<section>` del recorrido, que es la TARJETA. */
function cardClasses(html: string): string[] {
  const section = /<section[^>]*data-testid="cad-guided-tour"[^>]*>/.exec(html)?.[0] ?? "";
  return (/class="([^"]*)"/.exec(section)?.[1] ?? "").split(/\s+/);
}

// --- 1. UN RECIÉN LLEGADO: PLEGADO, FLOTANDO SIN MUELLE, CON SUS CLICS ------
{
  cadTourHost.reset();
  const html = render();
  ok(html.includes('data-testid="cad-guided-tour"'), "el recorrido sale la primera vez");
  ok(html.includes('data-collapsed="true"'), "arranca plegado: una línea, no cinco pasos encima del plano");
  ok(html.includes('aria-expanded="false"'), "el botón del pliegue anuncia que está plegado");
  ok(!html.includes("cad-guided-tour-progress"), "plegado no pinta la barra de progreso");
  ok(html.includes("Primeros cinco minutos"), "plegado sigue diciendo qué es");
  ok(
    /data-testid="cad-guided-tour-title"[^>]*>[^<]*lámina/i.test(html),
    "plegado sigue diciendo EN QUÉ PASO va (el primero: la lámina)",
  );
  ok(html.includes('data-placement="floating"'), "sin muelle a la vista, flota");

  const classes = cardClasses(html);
  ok(
    classes.includes("pointer-events-auto"),
    "flotando, la tarjeta reclama el puntero: pulsarla no enciende lo de debajo",
  );
  ok(
    !classes.includes("pointer-events-none"),
    "la tarjeta NO deja pasar los clics a la paleta que tiene debajo",
  );
}

// --- 2. DESPLEGADO A PETICIÓN -----------------------------------------------
{
  cadTourHost.dispatch({ type: "minimize", minimized: false });
  const html = render();
  ok(html.includes('data-collapsed="false"'), "el usuario lo despliega");
  ok(html.includes("cad-guided-tour-progress"), "desplegado enseña el progreso");
  for (const id of ["lamina", "muro", "puerta", "cota", "pdf"])
    ok(html.includes(`cad-guided-tour-step-${id}`), `desplegado enseña el paso ${id}`);
  ok(
    !cardClasses(html).includes("pointer-events-none"),
    "desplegado tampoco deja pasar los clics",
  );
}

// --- 3. SALTADO, NO HAY TARJETA ----------------------------------------------
{
  cadTourHost.dispatch({ type: "skip", now: 1 });
  ok(render() === "", "saltado, el recorrido no pinta nada");
  cadTourHost.reset();
}

console.log(`CadGuidedTourDock.spec: ${checks}/${checks} comprobaciones verdes`);
