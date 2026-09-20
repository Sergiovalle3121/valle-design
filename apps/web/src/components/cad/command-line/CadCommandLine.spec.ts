/**
 * T-73(h): tres huecos «media» en el prompt vivo que juntos eran un callejón
 * sin salida — la caja no anunciaba con qué diálogo iba (`aria-describedby`),
 * el diálogo no podía recibir foco para releerse, y F2 (la tecla de AutoCAD
 * para esto) no existía.
 *
 * El tacto con teclado (F2, flechas, Escape) exige un DOM interactivo que
 * este runner no tiene — mismo trato que otros componentes de esta carpeta.
 * Lo que SÍ se prueba sin jsdom: el marcado sale enlazado desde el primer
 * render, y por lectura de fuente, que F2 existe y que las filas del
 * historial usan una clave estable (no el índice, que cambia al recortarse
 * `history` a los últimos 60 renglones y forzaría un remontaje completo del
 * diálogo en cada paso — el aviso entero se releería de más en cada línea).
 *
 * Correr: npx tsx src/components/cad/command-line/CadCommandLine.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadCommandLine } from "./CadCommandLine";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

{
  const html = renderToStaticMarkup(
    createElement(CadCommandLine, {
      prompt: null,
      history: [{ id: 1, text: "LINE", level: "info" }],
      onSubmit: () => undefined,
      onKeyword: () => undefined,
      onCancel: () => undefined,
      onRepeat: () => undefined,
    }),
  );
  ok(html.includes('id="cad-command-line-log"'), "el diálogo tiene un id fijo para enlazarse");
  ok(html.includes('aria-describedby="cad-command-line-log"'), "la caja describe con qué diálogo va");
  ok(html.includes('tabindex="0"'), "el diálogo puede recibir foco (releerse con teclado)");
  ok(html.includes('role="log"') && html.includes('aria-live="polite"'), "sigue siendo una región viva educada");
}

{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(fuente.includes('event.key === "F2"'), "F2 existe como atajo del prompt vivo");
  ok(
    fuente.includes("history.map((entry) =>") && fuente.includes("key={entry.id}"),
    "la clave de cada renglón es su id estable, no su índice",
  );
  ok(
    !/key=\{`\$\{index\}/.test(fuente),
    "no queda una clave basada en índice que reintroduzca el remontaje completo",
  );
}

// T-74(c): sin nada tecleado, no hay sugerencias que anunciar — el
// `combobox` empieza cerrado.
{
  const html = renderToStaticMarkup(
    createElement(CadCommandLine, {
      prompt: null,
      history: [],
      onSubmit: () => undefined,
      onKeyword: () => undefined,
      onCancel: () => undefined,
      onRepeat: () => undefined,
    }),
  );
  ok(!html.includes('role="listbox"'), "sin texto, no se pinta la lista de sugerencias");
  ok(html.includes('role="combobox"'), "la caja se anuncia como combobox");
  ok(html.includes('aria-expanded="false"'), "el combobox declara que empieza cerrado");
}

// T-74(c): el filtro de sugerencias es por PREFIJO del nombre canónico, y
// las flechas/Tab sólo actúan sobre ellas cuando de verdad hay alguna
// — comprobado por fuente porque exige teclear de verdad para ejercitarlo.
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(fuente.includes("c.nombre.startsWith(valor)"), "las sugerencias filtran por prefijo del nombre");
  ok(
    fuente.includes('prompt || value.includes(" ")'),
    "no hay sugerencias con un prompt activo o ya escribiendo argumentos (con espacio)",
  );
  ok(
    fuente.includes("suggestions.length > 0 && (event.key ===") &&
      fuente.includes('event.key === "Tab"'),
    "las flechas y Tab sólo se apropian de la sugerencia cuando hay alguna visible",
  );
  // T-74(c), REGRESIÓN REAL medida en CI: Intro con sugerencias visibles
  // ejecutaba la resaltada EN VEZ de lo tecleado. «L» es alias de LINE (la
  // resolución de alias vive en el motor, no aquí) pero es también PREFIJO
  // del nombre canónico de LTYPE/LAYER/LIST/LEADER/…; con el hijack, Intro
  // tras «L» ejecutaba la que encabezara esa lista — no LINE — rompiendo el
  // gesto más básico de AutoCAD. `e2e/golden/85-cad-diez-segundos.spec.ts`
  // («L ⏎ empieza LINE», «M ⏎ pide objetos, como MOVE») lo cazó en CI real,
  // no aquí: por eso queda como guarda de fuente explícita.
  ok(
    !/suggestions\.length > 0 && event\.key === "Enter"/.test(fuente),
    "Intro NUNCA sustituye lo tecleado por una sugerencia — siempre envía el texto literal, " +
      "que es lo único que el motor sabe resolver por alias (L→LINE, M→MOVE...)",
  );
  ok(
    fuente.includes("role=\"combobox\"") &&
      fuente.includes("aria-controls={suggestions.length > 0 ? suggestionListId : undefined}") &&
      fuente.includes("aria-activedescendant={suggestions.length > 0 ?"),
    "el combobox enlaza con la lista y con la opción resaltada cuando hay sugerencias",
  );
  ok(
    !/useEffect\(\(\) => \{\s*setSuggestionIndex/.test(fuente),
    "el índice resaltado no se reinicia desde un efecto (react-hooks/set-state-in-effect)",
  );
}

// OLA «comando»: de píldora flotante de 480 px (`absolute bottom-3 left-3`,
// `w-[min(30rem,42vw)]`) a franja acoplada de ancho completo. Estas
// comprobaciones fijan el contrato de layout por FUENTE — sin navegador, no
// hay `getBoundingClientRect` que medir — y por eso son deliberadamente
// literales: si alguien reintroduce `absolute`/`fixed`/`bottom-`/`left-` o la
// vieja clase de ancho, el string aparece y la comprobación lo caza.
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  // Sólo dentro de `className="..."`: el archivo cita a propósito, EN
  // COMENTARIOS, las clases viejas (`bottom-3`, `w-[min(...)]`) que esta ola
  // quitó — un `includes` sobre el texto entero cazaría la propia
  // explicación de por qué ya no están.
  const clases = [...fuente.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
  const enAlgunaClase = (token: RegExp | string) =>
    clases.some((c) => (typeof token === "string" ? c.includes(token) : token.test(c)));
  ok(!enAlgunaClase(/\bfixed\b/), "ninguna clase de Tailwind en este archivo declara `fixed`");
  ok(!enAlgunaClase(/\babsolute\b/), "ninguna clase declara `absolute`");
  ok(!enAlgunaClase(/\bbottom-\d/), "ninguna clase declara `bottom-<n>`");
  ok(!enAlgunaClase(/\bleft-\d/), "ninguna clase declara `left-<n>`");
  ok(!enAlgunaClase("w-[min("), "ya no queda la píldora de ancho `w-[min(30rem,42vw)]`");
  ok(
    Boolean(clases[0]) && /\bw-full\b/.test(clases[0]),
    "la raíz declara `w-full`: la franja es tan ancha como la ventana, no una píldora",
  );
  // Posición de los desplegables flotantes: por `style`, no por clase — es la
  // EXCEPCIÓN documentada a la regla de arriba, y vive fuera de la raíz (en
  // un portal a `<body>`), así que no la contradice.
  ok(
    fuente.includes('position: "fixed"') && fuente.includes("createPortal"),
    "las listas flotantes (sugerencias, historial) se posicionan por `style`, en un portal — no son la raíz del muelle",
  );
}

// (b) El registro se pliega por defecto y sólo el botón/F2 lo despliega; los
// dos números de alto salen de `cad-shell-layout.ts`, nunca escritos a mano.
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(
    fuente.includes("CAD_SHELL_METRICS.commandRow") && fuente.includes("CAD_SHELL_METRICS.commandExpanded"),
    "el alto plegado/desplegado se LEE de cad-shell-layout.ts, no se reinventa",
  );
  ok(
    fuente.includes("height: CAD_SHELL_METRICS.commandRow"),
    "el renglón único mide exactamente CAD_SHELL_METRICS.commandRow (26 px hoy)",
  );
  ok(
    /logExpanded \? LOG_EXPANDED_HEIGHT : 0/.test(fuente),
    "el registro plegado mide 0 px extra; desplegado suma hasta commandExpanded",
  );
  ok(
    fuente.includes("LOG_EXPANDED_HEIGHT = CAD_SHELL_METRICS.commandExpanded - CAD_SHELL_METRICS.commandRow"),
    "el alto del registro desplegado se DERIVA de los dos números publicados, no es un tercero suelto",
  );
  ok(
    fuente.includes('data-testid="cad-command-log-toggle"'),
    "existe un botón dedicado para plegar/desplegar el registro",
  );
  ok(
    fuente.includes('event.key === "F2"') && fuente.includes("setLogExpanded"),
    "F2 seguía siendo el atajo de AutoCAD, y ahora pliega/despliega en vez de sólo mover el foco",
  );
  ok(
    fuente.includes("readCommandLogExpanded") && fuente.includes("writeCommandLogExpanded"),
    "la preferencia se lee/guarda con el módulo puro (command-log-preference.ts), no a mano",
  );
}

// (c) Historial completo: un desplegable nuevo que enseña TODO lo tecleado,
// sin tocar el recorrido de flechas ya existente (que sigue probado arriba).
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(
    fuente.includes('data-testid="cad-command-history-toggle"') &&
      fuente.includes('data-testid="cad-command-history"'),
    "hay un botón que abre un desplegable de historial completo, separado del recorrido por flechas",
  );
  ok(
    fuente.includes("if (historyOpen)") && fuente.includes("setHistoryOpen(false)"),
    "Esc cierra el desplegable de historial en su propio paso",
  );
}

// (e) El recorrido guiado y la consola LISP NO viven en este archivo: si
// aparecieran aquí, inflarían la franja que este componente mide en píxeles
// exactos. Viven en CadCommandLineDock, portados fuera de esta raíz.
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(
    !fuente.includes("CadGuidedTourDock") && !fuente.includes("CadLispDock"),
    "el recorrido guiado y la consola LISP no se importan aquí: no pueden inflar la franja",
  );
}

{
  const dockFuente = readFileSync(path.join(__dirname, "CadCommandLineDock.tsx"), "utf8");
  ok(
    dockFuente.includes('data-testid="cad-command-dock"'),
    "CadCommandLineDock publica la raíz que CadShellFrame cuelga en su ranura commandDock",
  );
  ok(
    !/className="[^"]*\babsolute\b[^"]*"/.test(dockFuente.split("createPortal")[0]) &&
      !/data-testid="cad-command-dock"[\s\S]{0,80}\bfixed\b/.test(dockFuente),
    "la raíz cad-command-dock (antes del portal) no se posiciona a sí misma",
  );
  ok(
    dockFuente.includes("createPortal") && dockFuente.includes("document.body"),
    "el recorrido guiado y LISP se portan a <body> desde aquí, no se apilan dentro de la franja",
  );
}

console.log(`CadCommandLine: ${checks}/${checks} comprobaciones verdes`);
