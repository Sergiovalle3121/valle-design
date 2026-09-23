/**
 * La barra del modo Esencial, en Node: la tabla (doce ids en su orden, cada
 * orden registrada, expuesta en la cinta y disponible, con icono) y el
 * marcado (`renderToStaticMarkup`): sólo lectura apaga lo que muta y deja
 * Seleccionar, Buscar y Más; sin `absolute` ni `fixed`; icono de 16 px y
 * rótulo a la derecha; ranura vacía al final.
 *
 * Correr: npx tsx src/components/cad/essential/CadEssentialBar.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CAD_COMANDOS_AUN_NO_DISPONIBLES } from "@/lib/cad/engine/command-availability";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine/index";
import { cadRibbonExposedNames, findCadRibbonCommand } from "@/lib/cad/ribbon";
import { cadRibbonButtonTitle } from "../ribbon/CadRibbonButton";
import { cadCommandIcon } from "../ribbon/command-icons";
import { CadEssentialBar } from "./CadEssentialBar";
import { CAD_ESSENTIAL_TOOLS } from "./essential-tools";
import { CadActiveCommandContext } from "@/components/cad/ribbon/active-command";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** El atributo `disabled` de la etiqueta <button> que lleva ese testid. */
function disabledAttr(html: string, testId: string): boolean {
  const marker = `data-testid="${testId}"`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `no se encontró ${testId} en el marcado`);
  const tagStart = html.lastIndexOf("<button", start);
  const tagEnd = html.indexOf(">", start);
  const tag = html.slice(tagStart, tagEnd);
  return / disabled(=|>|\s)/.test(tag + " ");
}

const IDS = [
  "select",
  "wall",
  "door",
  "window",
  "line",
  "rect",
  "circle",
  "text",
  "dim",
  "erase",
  "undo",
  "redo",
] as const;
const ROTULOS = [
  "Seleccionar",
  "Muro",
  "Puerta",
  "Ventana",
  "Línea",
  "Rectángulo",
  "Círculo",
  "Texto",
  "Cota",
  "Borrar",
  "Deshacer",
  "Rehacer",
];
const ORDENES: Record<string, string> = {
  wall: "WALL",
  door: "DOOR",
  window: "WINDOW",
  line: "LINE",
  rect: "RECTANG",
  circle: "CIRCLE",
  text: "TEXT",
  dim: "DIMLINEAR",
  erase: "ERASE",
  undo: "U",
  redo: "REDO",
};

// ── La tabla ───────────────────────────────────────────────────────────────
assert.deepEqual(
  CAD_ESSENTIAL_TOOLS.map((tool) => tool.id),
  IDS,
  "doce ids exactos, en ese orden",
);
checks += 1;
assert.deepEqual(
  CAD_ESSENTIAL_TOOLS.map((tool) => tool.label),
  ROTULOS,
  "doce rótulos exactos, en español y sin truncar",
);
checks += 1;
assert.deepEqual(
  CAD_ESSENTIAL_TOOLS[0].run,
  { tool: "select" },
  "Seleccionar es el modo del editor, no una orden",
);
checks += 1;
ok(!CAD_ESSENTIAL_TOOLS[0].mutates, "Seleccionar no muta: nunca se apaga en sólo lectura");

const registrados = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
const expuestos = cadRibbonExposedNames();
for (const tool of CAD_ESSENTIAL_TOOLS.slice(1)) {
  ok("command" in tool.run, `${tool.id} es una orden del motor`);
  const name = "command" in tool.run ? tool.run.command : "";
  ok(name === ORDENES[tool.id], `${tool.id} despacha ${ORDENES[tool.id]}, no ${name}`);
  ok(registrados.has(name), `${name} está en CAD_COMMAND_REGISTRY_V2`);
  ok(expuestos.has(name), `${name} tiene botón en la cinta (cadRibbonExposedNames)`);
  ok(
    !(name in CAD_COMANDOS_AUN_NO_DISPONIBLES),
    `${name} está disponible, no en la lista de «aún no»`,
  );
  const icon = cadCommandIcon(name);
  ok(icon !== null && tool.icon === icon, `${name} lleva el icono del catálogo por comando`);
  const ribbon = findCadRibbonCommand(name);
  ok(
    ribbon !== undefined && tool.title === cadRibbonButtonTitle(ribbon),
    `${name}: title «rótulo · NOMBRE (alias) — resumen» como en la cinta`,
  );
  ok(
    ribbon !== undefined && tool.mutates === ribbon.mutates,
    `${name}: mismo criterio de sólo lectura que la cinta`,
  );
}
ok(
  CAD_ESSENTIAL_TOOLS.slice(1).every((tool) => tool.mutates),
  "las once órdenes mutan el documento (U y REDO incluidos): todas se apagan en sólo lectura",
);

{
  const labels = CAD_ESSENTIAL_TOOLS.map((tool) => tool.label);
  ok(
    new Set(labels).size === labels.length,
    "rótulos únicos: ningún localizador por nombre resuelve a dos botones",
  );
  // Nombres que ya tienen dueño en la suite e2e (golden 223,
  // cad-ribbon-collapse, presets de cámara): la barra no añade un segundo.
  const ajenos = new Set([
    "Girar",
    "Terminar",
    "Minimizar la cinta",
    "Mostrar la cinta",
    "Vista superior",
    "Ajustar a la planta",
    "Vista isométrica",
  ]);
  ok(
    labels.every((label) => !ajenos.has(label)),
    "ningún rótulo repite un nombre ambiguo de la suite",
  );
}

// ── El marcado ─────────────────────────────────────────────────────────────
const props = {
  dispatch: () => undefined,
  onSelectTool: () => undefined,
  onOpenPalette: () => undefined,
  onMore: () => undefined,
};

{
  const html = renderToStaticMarkup(
    createElement(CadEssentialBar, { ...props, readOnly: true }),
  );
  for (const id of IDS.slice(1)) {
    ok(disabledAttr(html, `cad-essential-tool-${id}`), `sólo lectura: ${id} queda deshabilitado`);
  }
  ok(!disabledAttr(html, "cad-essential-tool-select"), "sólo lectura: Seleccionar sigue habilitado");
  ok(!disabledAttr(html, "cad-essential-search"), "sólo lectura: Buscar sigue habilitado");
  ok(!disabledAttr(html, "cad-essential-more"), "sólo lectura: Más herramientas sigue habilitado");
}

{
  const html = renderToStaticMarkup(
    createElement(CadEssentialBar, { ...props, readOnly: false }),
  );
  for (const id of IDS) {
    ok(!disabledAttr(html, `cad-essential-tool-${id}`), `editable: ${id} habilitado`);
  }
  ok(
    !/\b(absolute|fixed)\b/.test(html),
    "sin absolute ni fixed: es una ranura del armazón, no un flotante",
  );
  const raiz = /<div[^>]*data-testid="cad-essential-bar"[^>]*>/.exec(html)?.[0] ?? "";
  ok(
    raiz.includes('role="toolbar"') && raiz.includes('aria-label="Herramientas esenciales"'),
    "la raíz es cad-essential-bar, role=toolbar con nombre «Herramientas esenciales»",
  );
  ok(/\bh-14\b/.test(raiz), "la barra mide 56 px (h-14 = CAD_SHELL_METRICS.essentialBar)");
  let cursor = -1;
  for (const [i, id] of IDS.entries()) {
    const at = html.indexOf(`data-testid="cad-essential-tool-${id}"`);
    ok(at > cursor, `${id} está montado y después de ${IDS[i - 1] ?? "el inicio"}`);
    cursor = at;
    ok(html.includes(`>${ROTULOS[i]}<`), `${id} pinta su rótulo «${ROTULOS[i]}» a la vista`);
  }
  // lucide antepone sus propias clases («lucide lucide-minus …») a las del
  // botón, así que el icono se reconoce por el final de su `class`.
  const icono16 = /<svg[^>]*class="[^"]*\bh-4 w-4 shrink-0"[^>]*aria-hidden="true"[^>]*>/g;
  const iconos = html.match(icono16)?.length ?? 0;
  ok(
    iconos === IDS.length + 2,
    `catorce iconos de 16 px (doce herramientas, Buscar y Más), no ${iconos}`,
  );
  ok(
    /<svg[^>]*class="[^"]*\bh-4 w-4 shrink-0"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg><span[^>]*>Línea<\/span>/.test(
      html,
    ),
    "icono a la izquierda y rótulo a la derecha, en una sola fila",
  );
  ok(
    html.includes(`title="${cadRibbonButtonTitle(findCadRibbonCommand("LINE")!)}"`),
    "el title de Línea trae LINE (L) y el resumen",
  );
  ok(
    /data-testid="cad-essential-search"[^>]*aria-keyshortcuts="Control\+K"/.test(html),
    "Buscar anuncia Ctrl K a la tecnología de apoyo",
  );
  ok(html.includes(">Buscar · Ctrl K<"), "Buscar dice «Buscar · Ctrl K»");
  ok(
    html.includes('data-testid="cad-essential-more"') && html.includes(">Más herramientas<"),
    "Más herramientas está y dice su nombre",
  );
  const slot = html.indexOf('data-testid="cad-essential-bar-tools"');
  ok(
    slot > html.indexOf('data-testid="cad-essential-more"'),
    "la ranura de herramientas va al final, a la derecha",
  );
  ok(
    /<div data-testid="cad-essential-bar-tools" class="[^"]*ml-auto[^"]*"><\/div>/.test(html),
    "la ranura nace vacía y pegada a la derecha",
  );
  ok(
    !/bg-primary|bg-brand/.test(html),
    "EN REPOSO, sin relleno --primary/brand en los botones: relleno y tinta son tokens distintos, y una barra en calma es lo que se midió como bueno. El comando EN CURSO sí se rellena, y eso se comprueba abajo, con su tinta emparejada",
  );
  ok(
    html.includes("focus-visible:ring-ring") && html.includes("hover:bg-muted"),
    "anillo de foco y hover del sistema",
  );
  ok(
    !/#[0-9a-fA-F]{3,8}\b/.test(html) && !/text-\[[0-9.]+(px|rem)\]/.test(html),
    "sin hex ni tamaños de letra fuera de la escala",
  );
}

// ── La herramienta que tienes en la mano se VE ───────────────────────────────
{
  const conMuro = renderToStaticMarkup(
    createElement(CadActiveCommandContext, { value: "LINE" }, createElement(CadEssentialBar, props)),
  );
  ok(conMuro.includes('data-active="true"'), "la herramienta del comando en curso se marca");
  ok(conMuro.includes('aria-pressed="true"'), "y se anuncia como presionada");
  ok(
    (conMuro.match(/data-active="true"/g) ?? []).length === 1,
    "y sólo UNA a la vez: dos herramientas encendidas mentirían sobre lo que hace el ratón",
  );
  ok(
    /bg-brand-strong[^"]*text-primary-foreground|text-primary-foreground[^"]*bg-brand-strong/.test(conMuro),
    "la herramienta armada lleva el relleno de marca CON su tinta emparejada, nunca el relleno solo",
  );

  // En reposo manda «Seleccionar», que es el estado de AutoCAD sin comando.
  const reposo = renderToStaticMarkup(createElement(CadEssentialBar, props));
  const marcado = reposo.match(/data-testid="cad-essential-tool-([a-z]+)"[^>]*data-active="true"/);
  ok(marcado?.[1] === "select", "sin comando abierto, la herramienta encendida es «Seleccionar»");
}

console.log(`CadEssentialBar: ${checks}/${checks} comprobaciones verdes`);
