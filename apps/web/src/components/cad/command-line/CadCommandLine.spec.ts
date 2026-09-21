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

// T-«comandos vivos», carril «la línea de comandos se siente viva»:
// (f) qué ORDEN está activa, sin tener que leer el prompt para adivinarlo.
{
  const conOrden = renderToStaticMarkup(
    createElement(CadCommandLine, {
      prompt: { message: "Precise el centro del círculo", options: [] },
      history: [],
      activeCommand: "CIRCLE",
      onSubmit: () => undefined,
      onKeyword: () => undefined,
      onCancel: () => undefined,
      onRepeat: () => undefined,
    }),
  );
  ok(
    conOrden.includes('data-testid="cad-command-active"') && conOrden.includes("CIRCLE"),
    "con un comando en curso, su nombre canónico se ve sin tener que leer el prompt entero",
  );

  const sinOrden = renderToStaticMarkup(
    createElement(CadCommandLine, {
      prompt: null,
      history: [],
      activeCommand: null,
      onSubmit: () => undefined,
      onKeyword: () => undefined,
      onCancel: () => undefined,
      onRepeat: () => undefined,
    }),
  );
  ok(
    !sinOrden.includes('data-testid="cad-command-active"'),
    "sin comando en curso no queda una insignia de orden activa a medias",
  );
}

// (g) Autocompletado con icono y alias, como el de AutoCAD: no sólo el
// nombre canónico y el resumen — también el DIBUJO del comando (mismo
// catálogo que la cinta, `command-icons.ts`) y el atajo corto («L», no sólo
// «LINE», el PRIMER alias del manifiesto).
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(
    fuente.includes("alias: entry.shortcut"),
    "cada sugerencia lleva su alias más corto, tomado del mismo registro que ya resuelve Ctrl+K",
  );
  ok(
    fuente.includes("CAD_COMMAND_ICONS[s.nombre]") && fuente.includes("CAD_COMMAND_ICONS[activeCommand.toUpperCase()]"),
    "el icono de la sugerencia y el de la insignia activa salen del MISMO catálogo que ya usa la cinta, sin un segundo mapa",
  );
  // `cadCommandIcon()` (la función) dispara `react-hooks/static-components`
  // — «componente creado durante el render» — porque el linter no puede
  // demostrar que una LLAMADA a función siempre da el mismo componente,
  // aunque el catálogo sea estático. `CadRibbonButton.tsx` ya resuelve esto
  // con el acceso directo por índice; este archivo hace lo mismo.
  ok(
    !fuente.includes("import { cadCommandIcon }"),
    "el icono se lee por índice directo del catálogo (CAD_COMMAND_ICONS[...]), no importando la función envoltorio",
  );
  ok(
    fuente.includes("s.alias &&"),
    "el alias sólo se pinta cuando el comando tiene uno — no todos los 291 lo tienen",
  );
}

// (h) «El historial se ve»: un asomo de las últimas líneas del diálogo,
// visible SIN pedirlo, que no puede crecer el `commandDock` — ahí vive el
// 74 % de lienzo medido en la ola «armazón» — así que flota en vez de
// empujar la rejilla.
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(
    fuente.includes('data-testid="cad-command-transcript-peek"'),
    "existe el asomo del diálogo, separado del registro completo (F2)",
  );
  ok(
    fuente.includes("showTranscriptPeek = !logExpanded && !historyOpen && suggestions.length === 0 && history.length > 0"),
    "el asomo sólo se pinta plegado el registro y sin otro desplegable abierto encima",
  );
  ok(
    fuente.includes("history.slice(-3)"),
    "el asomo enseña como mucho las últimas 3 líneas, no el diálogo entero (eso sigue siendo F2)",
  );
  ok(
    /cad-command-transcript-peek[\s\S]{0,40}aria-hidden="true"/.test(fuente),
    "el asomo se oculta a los lectores de pantalla: el registro real de abajo (role=log) ya anuncia, y duplicarlo repetiría cada línea dos veces",
  );
  ok(
    /cad-command-transcript-peek[\s\S]{0,400}pointer-events-none/.test(fuente),
    "el asomo no puede comerse el clic del lienzo que sobrevuela: `pointer-events-none`, igual que el recorrido guiado y la consola LISP",
  );
  ok(
    /cad-command-transcript-peek[\s\S]{0,400}style=\{floatingStyle\(anchor\)\}/.test(fuente),
    "el asomo se posiciona con el mismo mecanismo que sugerencias e historial — por `style`, no por una clase nueva que sumara altura al commandDock",
  );
}

// (i) El menú contextual del botón derecho: repetir/aceptar, las opciones
// de la orden en curso, cortar/copiar/pegar y cancelar — el mismo lenguaje
// visual que `cad-context-menu` del lienzo.
//
// ESCÉPTICO (carril «comandos-vivos», D-1 sobre 431cdf28): el menú vivía
// entero en CadCommandLine.tsx y lo dejaba en 902 líneas — 102 por encima
// del máximo de `check:monolith-budget` para un archivo no presupuestado
// (`npm run check:monolith-budget` fallaba, sin que ninguna de las
// «pruebas» reportadas lo hubiera corrido). Se extrajo a
// `CadCommandContextMenu.tsx`: mismo marcado, mismos testids, mismo
// comportamiento — estas comprobaciones ahora leen el fichero que
// corresponde a cada pieza.
{
  const fuenteLinea = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  const fuenteMenu = readFileSync(path.join(__dirname, "CadCommandContextMenu.tsx"), "utf8");
  ok(
    fuenteMenu.includes('data-testid="cad-command-context-menu"') && fuenteMenu.includes('role="menu"'),
    "hay un menú contextual propio para la línea de comandos",
  );
  ok(
    fuenteLinea.includes("onContextMenu={(event) => {") && fuenteLinea.includes("setMenu({ x: event.clientX, y: event.clientY })"),
    "el botón derecho abre el menú en las coordenadas del propio clic, como el del lienzo",
  );
  ok(
    fuenteLinea.includes("<CadCommandContextMenu"),
    "CadCommandLine monta el menú extraído cuando hay coordenadas de clic",
  );
  ok(
    fuenteMenu.includes('data-testid="cad-command-context-repeat"'),
    "el menú ofrece repetir la última orden (o aceptar, con una en curso)",
  );
  ok(
    fuenteMenu.includes("prompt && prompt.options.length > 0") && fuenteMenu.includes("Opciones de la orden en curso"),
    "el menú enseña las opciones de la orden EN CURSO cuando las hay, no sólo las del reposo",
  );
  ok(
    fuenteMenu.includes('data-testid="cad-command-context-cut"') &&
      fuenteMenu.includes('data-testid="cad-command-context-copy"') &&
      fuenteMenu.includes('data-testid="cad-command-context-paste"'),
    "cortar, copiar y pegar están los tres, cada uno con su propio botón",
  );
  ok(
    fuenteMenu.includes('data-testid="cad-command-context-cancel"'),
    "cancelar está en el menú, igual que Escape",
  );
  ok(
    // `runClipboardAction` (el que llama a `document.execCommand`) sigue en
    // CadCommandLine.tsx —necesita `inputRef`, que es del padre—; el menú
    // extraído sólo reenvía la acción por `onClipboardAction`.
    fuenteLinea.includes("document.execCommand(accion)") && fuenteMenu.includes("onClipboardAction"),
    "cortar/copiar/pegar actúan de verdad sobre la caja, no son botones mudos",
  );
  ok(
    fuenteLinea.includes("if (menu) {") && /if \(menu\) \{[\s\S]{0,120}Escape/.test(fuenteLinea),
    "con el menú abierto, Escape lo cierra en su propio paso antes que cualquier otro atajo (decidido en CadCommandLine, que es quien conoce el resto de atajos)",
  );
  ok(
    fuenteMenu.includes("style={contextMenuStyle(point)}") && fuenteMenu.includes('function contextMenuStyle('),
    "el menú se posiciona por `style` (coordenadas del clic, recortadas al borde de la ventana), no por una clase `fixed` — la regla de oro es de la raíz del muelle, y esto vive en un portal",
  );
  ok(
    fuenteMenu.includes("addEventListener(\"pointerdown\"") && fuenteMenu.includes("onClose()"),
    "el menú extraído se cierra solo con un clic fuera — no depende de que el padre se lo diga",
  );
}

// (j) SE PUEDE ESCRIBIR SIEMPRE. `-LAYER` ofrece diez opciones de golpe; el
// 2026-09-20 esa tira, marcada `shrink-0`, se quedaba el ancho entero y dejaba
// el input en CERO píxeles: a 1280 px no había dónde teclear el nombre de la
// capa. Dos reglas, y las dos hacen falta: la tira CEDE ancho y el input tiene
// SUELO. Si vuelve `shrink-0` en la tira, vuelve el fallo.
{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  const tira = fuente.match(/<span className="flex[^"]*overflow-x-auto"/)?.[0] ?? "";
  ok(tira.length > 0, "la tira de opciones sigue siendo un <span> flex con scroll propio");
  ok(
    !tira.includes("shrink-0"),
    `la tira de opciones debe poder ceder ancho, no aplastar el input: "${tira}"`,
  );
  const input = fuente.match(/data-testid="cad-command-input"[\s\S]{0,1600}?className="([^"]*)"/)?.[1] ?? "";
  ok(
    /min-w-\[\d/.test(input),
    `el input necesita un ancho mínimo explícito para no colapsar: "${input}"`,
  );
}

console.log(`CadCommandLine: ${checks}/${checks} comprobaciones verdes`);
