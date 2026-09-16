/**
 * T-74(i): «en un dibujo de sólo lectura la cinta se apaga ENTERA, incluidos
 * los comandos que no mutan nada». Antes, `readOnly` ponía
 * `pointer-events-none` sobre la tira de paneles completa; ahora sólo se
 * deshabilita botón por botón, y sólo los que SÍ tocan el documento
 * (`CadCommandDescriptor.mutates`).
 *
 * LINE muta (dibuja); LAYER no (abre el gestor, `mutates: false` en
 * `command-manifest.ts`) — el par real que demuestra la diferencia, y los
 * dos son botones grandes de Inicio, a la vista a 1280 px (el ancho que la
 * cinta asume sin ventana; LIST vive en Utilidades, que a ese ancho está
 * plegado y sólo se monta al abrir su desplegable).
 *
 * Correr: npx tsx src/components/cad/ribbon/CadRibbon.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadRibbon } from "./CadRibbon";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function disabledAttr(html: string, testId: string): boolean {
  const marker = `data-testid="${testId}"`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `no se encontró ${testId} en el marcado`);
  // El atributo `disabled` puede llegar antes o después del testid dentro
  // de la misma etiqueta <button>; se acota a la etiqueta que lo contiene.
  const tagStart = html.lastIndexOf("<button", start);
  const tagEnd = html.indexOf(">", start);
  const tag = html.slice(tagStart, tagEnd);
  return / disabled(=|>|\s)/.test(tag + " ");
}

{
  const htmlEditable = renderToStaticMarkup(
    createElement(CadRibbon, { dispatch: () => undefined, readOnly: false }),
  );
  ok(
    !disabledAttr(htmlEditable, "cad-ribbon-command-LINE"),
    "sin sólo-lectura, LINE (muta) está habilitado",
  );
  ok(
    !disabledAttr(htmlEditable, "cad-ribbon-command-LAYER"),
    "sin sólo-lectura, LAYER (no muta) está habilitado",
  );
  ok(
    !htmlEditable.includes("opacity-60"),
    "sin sólo-lectura, no hay bloqueo visual de bulto sobre el contenedor",
  );
}

{
  const htmlReadOnly = renderToStaticMarkup(
    createElement(CadRibbon, { dispatch: () => undefined, readOnly: true }),
  );
  ok(
    disabledAttr(htmlReadOnly, "cad-ribbon-command-LINE"),
    "en sólo-lectura, LINE (muta el documento) queda deshabilitado",
  );
  ok(
    !disabledAttr(htmlReadOnly, "cad-ribbon-command-LAYER"),
    "en sólo-lectura, LAYER (sólo consulta) SIGUE habilitado — la regresión real que esto arregla",
  );
  ok(
    !htmlReadOnly.includes("opacity-60"),
    "el bloqueo ya no es un apagón de bulto (opacity-60) sobre toda la tira",
  );
}

// T-74(j): «la cinta no recuerda nada» — la pestaña activa y si está
// minimizada se guardan en `localStorage`. La lectura va en el
// inicializador perezoso de `useState` (no en un efecto): un `setState`
// síncrono dentro de un efecto habría disparado
// `react-hooks/set-state-in-effect`, que este archivo verificó limpio a
// mano — se guarda aquí como regresión.
{
  const fuente = readFileSync(path.join(__dirname, "CadRibbon.tsx"), "utf8");
  ok(
    fuente.includes('useState<CadRibbonTabId>(() => leerPestanaGuardada()'),
    "la pestaña activa se restaura en el inicializador perezoso de useState",
  );
  ok(
    fuente.includes("useState<boolean>(() => leerColapsoGuardado()"),
    "el colapso se restaura en el inicializador perezoso de useState",
  );
  ok(
    !/useEffect\(\(\) => \{[^}]*setActiveTab|useEffect\(\(\) => \{[^}]*setCollapsed\(le/.test(
      fuente.replace(/\n/g, " "),
    ),
    "no se reintroduce un efecto que llame a setActiveTab/setCollapsed al montar",
  );
}

// Sin scroll: a 1280 px (el ancho que la cinta asume sin ventana) Inicio se
// monta con Dibujo y Modificar desplegados, Capas reducido a su botón grande
// y el resto plegado a un botón; nada de insignias de conteo en las pestañas.
{
  const html = renderToStaticMarkup(createElement(CadRibbon, { dispatch: () => undefined }));
  ok(html.includes('data-strip-width="1280"'), "sin ventana la tira asume 1280 px, el viewport de los goldens");
  ok(!/rounded-full px-1\.5 py-px/.test(html), "las pestañas ya no llevan la insignia con el conteo de botones");
  for (const name of ["LINE", "CIRCLE", "ARC", "MOVE", "COPY", "ROTATE", "TRIM", "ERASE", "LAYER"]) {
    ok(html.includes(`data-testid="cad-ribbon-command-${name}"`), `${name} está montado sin abrir nada a 1280 px`);
  }
  ok(!html.includes('data-testid="cad-ribbon-command-LIST"'), "LIST (Utilidades, plegado) no está en el DOM hasta abrir el desplegable");
  ok(html.includes('data-testid="cad-ribbon-panel-toggle-Utilidades"'), "Utilidades se pliega a un botón que abre su desplegable");
  ok(!html.includes("cad-ribbon-panel-flyout-"), "ningún desplegable está abierto en reposo");
  ok(html.includes('data-testid="cad-ribbon-panel-Capas"') && /data-testid="cad-ribbon-panel-Capas"[^>]*data-layout="reduced"/.test(html), "Capas queda reducido a su botón grande a 1280 px");
}

console.log(`CadRibbon: ${checks}/${checks} comprobaciones verdes`);
