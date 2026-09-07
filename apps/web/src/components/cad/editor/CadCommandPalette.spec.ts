/**
 * F9 P-06: la paleta Ctrl+K se anuncia como diálogo con nombre y foco atrapado.
 *
 * El montaje real (Tab que cicla, Escape que cierra) exige un DOM interactivo
 * que este runner no tiene — mismo trato que `CadDialogShell.spec.ts`. Lo que
 * SÍ se prueba sin jsdom:
 * - el marcado base (`role="dialog"`, `aria-modal`, `aria-label`) sale desde
 *   el primer render, no detrás de un efecto;
 * - la FORMA del DOM que cuatro goldens dan por hecha: el placeholder textual,
 *   y que del `<input>` al contenedor hay exactamente dos `<div>` (los goldens
 *   toman `ancestor::div[2]` y enumeran los `button` de dentro);
 * - la búsqueda y los recientes se pintan igual que cuando vivían en el
 *   monolito: tope de nueve filas, «Sin resultados CAD.» cuando no hay nada,
 *   «Recientes» sólo con la consulta vacía;
 * - por lectura de fuente, que el atrapador escucha Tab en fase de captura y
 *   que la caja de buscar sigue cerrando con Escape; y que el monolito ya no
 *   pinta la paleta a mano, sino que delega en este componente.
 *
 * Correr: npx tsx src/components/cad/editor/CadCommandPalette.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadCommandPalette } from "./CadCommandPalette";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const NOMBRE = "Buscar comando, herramienta o símbolo";
const PLACEHOLDER = "Buscar comando, herramienta o símbolo...";

const pintar = (query: string, recent: string[] = []) =>
  renderToStaticMarkup(
    createElement(CadCommandPalette, {
      query,
      onQueryChange: () => undefined,
      onClose: () => undefined,
      recent,
      onRun: () => undefined,
    }),
  );

const botones = (html: string) => (html.match(/<button\b/g) ?? []).length;

// --- el diálogo tiene rol, nombre y modalidad desde el primer render ---------
{
  const html = pintar("");
  ok(html.startsWith("<div"), "el contenedor es el primer nodo: sin envoltorio nuevo");
  ok(html.includes('role="dialog"'), "la paleta se anuncia como diálogo");
  ok(html.includes('aria-modal="true"'), "la paleta se anuncia como modal (lleva atrapador de foco)");
  ok(
    html.includes(`aria-label="${NOMBRE}"`),
    "el diálogo tiene nombre accesible, no sólo un placeholder dentro",
  );
  ok(html.includes(`placeholder="${PLACEHOLDER}"`), "el placeholder se conserva tal cual: los goldens lo buscan");
  ok(
    /<input\b[^>]*aria-label="Buscar comando, herramienta o símbolo"/.test(html),
    "la caja de buscar tiene nombre propio además del placeholder",
  );
  ok(
    /<input\b[^>]*focus-visible:ring-2 focus-visible:ring-ring/.test(html),
    "la caja de buscar enseña el foco (F9 P-05: outline-none con sustituto)",
  );
}

// --- la forma del DOM que los goldens dan por hecha: input → div → contenedor
{
  const html = pintar("");
  const hastaInput = html.slice(0, html.indexOf("<input"));
  ok(hastaInput.length > 0, "hay una caja de buscar");
  const divsAbiertos = (hastaInput.match(/<div\b/g) ?? []).length;
  const divsCerrados = (hastaInput.match(/<\/div>/g) ?? []).length;
  assert.equal(
    divsAbiertos - divsCerrados,
    2,
    "del input al contenedor hay exactamente dos div: `ancestor::div[2]` es la paleta",
  );
}

// --- búsqueda: tope de nueve, vacío honesto ----------------------------------
{
  const todo = pintar("");
  assert.equal(botones(todo), 9, "con la consulta vacía se ofrecen nueve filas, no el registro entero");
  ok(!todo.includes("Sin resultados CAD."), "con resultados no se anuncia el vacío");

  const trim = pintar("TRIM");
  ok(botones(trim) >= 1, "«TRIM» ofrece al menos una fila");
  ok(trim.includes(">TRIM<"), "la fila enseña el nombre del comando");

  const nada = pintar("zzqqxxwwvv");
  assert.equal(botones(nada), 0, "una consulta sin coincidencias no ofrece filas");
  ok(nada.includes("Sin resultados CAD."), "el vacío se dice, no se deja en blanco");
}

// --- recientes: sólo con la consulta vacía ------------------------------------
{
  const conRecientes = pintar("", ["tool:line", "engine:TRIM"]);
  ok(conRecientes.includes("Recientes"), "con consulta vacía se enseñan los recientes");
  ok(conRecientes.includes(">line<"), "el reciente enseña el id, sin el prefijo de familia");
  ok(conRecientes.includes(">TRIM<"), "cada reciente sale como ficha");

  const buscando = pintar("tr", ["tool:line"]);
  ok(!buscando.includes("Recientes"), "mientras se busca, los recientes no estorban");

  ok(!pintar("", []).includes("Recientes"), "sin recientes no hay fila de recientes");
}

// --- por lectura de fuente: el atrapador y el Escape ---------------------------
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandPalette.tsx"), "utf8");
  ok(
    fuente.includes('if (event.key !== "Tab") return;'),
    "el atrapador sólo interviene en Tab: el resto de teclas sigue su camino",
  );
  ok(
    fuente.includes('document.addEventListener("keydown", alPulsar, { capture: true })'),
    "el atrapador escucha en fase de captura, como CadDialogShell",
  );
  ok(
    fuente.includes('document.removeEventListener("keydown", alPulsar, { capture: true })'),
    "el atrapador se retira al desmontar",
  );
  ok(
    /if \(e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*onClose\(\);/.test(fuente),
    "Escape en la caja de buscar sigue cerrando la paleta, como antes",
  );
  ok(
    !/\buseState\b/.test(fuente),
    "el componente es controlado: el estado se queda en el editor",
  );
}

// --- el monolito delega y ya no pinta la paleta a mano -------------------------
{
  const monolito = readFileSync(path.join(__dirname, "Layout3DEditor.tsx"), "utf8");
  ok(monolito.includes("<CadCommandPalette"), "Layout3DEditor.tsx monta CadCommandPalette");
  ok(
    !monolito.includes("Sin resultados CAD."),
    "el marcado de la paleta no vive por duplicado en el monolito",
  );
  ok(
    !monolito.includes("searchCadPalette("),
    "la búsqueda de la paleta se computa en el componente, no en el monolito",
  );
}

console.log(`CadCommandPalette: ${checks}/${checks} comprobaciones verdes`);
