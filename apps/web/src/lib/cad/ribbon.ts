/**
 * LA CINTA, GENERADA DEL REGISTRO — no una lista escrita a mano.
 *
 * `CAD_COMMAND_DESCRIPTORS` (`engine/index.ts`) es la única fuente de verdad
 * de los ~192 comandos reales: la paleta Ctrl+K, la línea de comandos y ahora
 * la cinta leen todas de ahí. Una lista paralela de botones se desincroniza
 * el primer día que alguien añade un comando y no toca cuatro archivos a la
 * vez; este módulo en cambio es una FUNCIÓN sobre el registro — un comando
 * nuevo aparece en su pestaña sin que nadie edite este archivo.
 *
 * ## Cómo se clasifica un comando
 *
 * El descriptor V2 sólo trae `kind` (`draw | modify | annotate | inquiry |
 * view | manage`, `command-types.ts`), y ese eje por sí solo no separa
 * "Insertar" ni "Salida" de "Administrar" — la mayoría de los comandos no
 * gráficos caen en `manage`. Así que la pestaña se decide en dos pasos:
 *
 *   1. Patrón del NOMBRE canónico (p. ej. `PLOT`, `XREF`, `INSERT`): cubre
 *      las familias que un `kind` de seis valores no distingue.
 *   2. Si ningún patrón coincide, se cae al `kind` (tabla `CAD_KIND_TAB`).
 *
 * El resultado es TOTAL: todo comando cae en alguna pestaña, así que la
 * cobertura del registro es un invariante de construcción, no una promesa —
 * `scripts/cad/check-ribbon-coverage.mjs` lo vuelve a comprobar en CI por si
 * un futuro cambio rompiera esa totalidad.
 *
 * Un comando puede además declararse "no expuesto" con razón explícita
 * (`CAD_RIBBON_UNEXPOSED`, hoy vacía): existe para el día en que aparezca un
 * comando interno que de verdad no deba tener botón — no para esconder
 * trabajo pendiente.
 */
import {
  CAD_COMMAND_DESCRIPTORS,
  type CadCommandDescriptor,
  type CadCommandKind,
} from "./engine";
import { cadCommandSummary } from "./engine/command-summaries";

export type CadRibbonTabId =
  | "inicio"
  | "insertar"
  | "anotar"
  | "vista"
  | "salida"
  | "administrar";

export interface CadRibbonTabMeta {
  id: CadRibbonTabId;
  label: string;
}

export const CAD_RIBBON_TABS: readonly CadRibbonTabMeta[] = [
  { id: "inicio", label: "Inicio" },
  { id: "insertar", label: "Insertar" },
  { id: "anotar", label: "Anotar" },
  { id: "vista", label: "Vista" },
  { id: "salida", label: "Salida" },
  { id: "administrar", label: "Administrar" },
];

/** Cae aquí cuando ningún patrón de nombre reclama el comando. */
const CAD_KIND_TAB: Readonly<Record<CadCommandKind, CadRibbonTabId>> = {
  draw: "inicio",
  modify: "inicio",
  inquiry: "inicio",
  annotate: "anotar",
  view: "vista",
  manage: "administrar",
};

/**
 * Patrones de nombre → pestaña, en orden de prioridad. Cubren las familias
 * que el `kind` por sí solo mete todas en "administrar": inserción de
 * contenido externo (bloques, xrefs, DXF) y salida de lámina (trazar,
 * publicar, exportar, la vista derivada de sólidos).
 */
const CAD_TAB_NAME_PATTERNS: readonly [RegExp, CadRibbonTabId][] = [
  [
    /^(-?INSERT|BLOCK|-?BEDIT|WBLOCK|MINSERT|DDINSERT|BLOCKREPLACE|GROUP|-?XREF|XATTACH|XCLIP|XBIND|REFEDIT|ADCENTER|DESIGNCENTER|DXFIN|DXFATTACH)/,
    "insertar",
  ],
  [
    /^(PLOT|-?PLOT|PUBLISH|PAGESETUP|-?PAGESETUP|LAYOUT|-?LAYOUT|MVIEW|VPORTS?|-?VPORTS|SOLVIEW|SOLDRAW|FLATSHOT|SOLPROF|DXFOUT|EXPORT|EXPORTPDF|EXPORTLAYOUT|SHEETSET)/,
    "salida",
  ],
];

function ribbonTabForCommand(descriptor: CadCommandDescriptor): CadRibbonTabId {
  for (const [pattern, tab] of CAD_TAB_NAME_PATTERNS) {
    if (pattern.test(descriptor.name)) return tab;
  }
  return CAD_KIND_TAB[descriptor.kind];
}

/**
 * Patrones de nombre → panel, sólo dentro de su pestaña. Es agrupación de
 * presentación (como hacen ya las paletas montadas, `CadPaletteOverlays`):
 * si nada coincide, el comando sigue apareciendo — sólo en el panel genérico
 * de su pestaña — así que un patrón incompleto nunca esconde un comando.
 */
const CAD_PANEL_NAME_PATTERNS: readonly [RegExp, string][] = [
  [/^(DIM|-?DIM)/, "Cotas"],
  [/^(LEADER|MLEADER|QLEADER|-?LEADER)/, "Directrices"],
  [/^(HATCH|GRADIENT|-?HATCH|BOUNDARY|-?BOUNDARY)/, "Sombreado"],
  [/^(TEXT|MTEXT|DTEXT|-?TEXT|SPELL|TABLE|-?TABLE)/, "Texto y tablas"],
  [/^(TOLERANCE)/, "Tolerancias"],
  [/^(STYLE|-?STYLE|DIMSTYLE|-?DIMSTYLE|MLEADERSTYLE|-?MLEADERSTYLE|TABLESTYLE)/, "Estilos"],
  [/^(LINE|XLINE|RAY|PLINE|-?PLINE|POLYGON|RECTANG|CIRCLE|ARC|SPLINE|-?SPLINE|DONUT|POINT|-?POINT|DIVIDE|MEASURE|WALL|-?WALL|OPENING|-?OPENING|REGION|-?REGION)/, "Dibujo"],
  [/^(MOVE|COPY|ROTATE|SCALE|MIRROR|ARRAY|-?ARRAY|ALIGN|-?ALIGN|STRETCH|TRIM|EXTEND|FILLET|CHAMFER|BREAK|JOIN|BLEND|PEDIT|-?PEDIT|OFFSET|EXPLODE|ERASE|LENGTHEN|OVERKILL|PURGE)/, "Modificar"],
  [/^(BOX|SPHERE|CYLINDER|CONE|WEDGE|TORUS|EXTRUDE|REVOLVE|SWEEP|LOFT|UNION|SUBTRACT|INTERSECT|SLICE|SHELL|MASSPROP|PRESSPULL)/, "Sólidos"],
  [/^(DIST|-?DIST|AREA|-?AREA|LIST|-?LIST|ID|-?ID|QSELECT|-?QSELECT|SELECT)/, "Utilidades"],
  [/^(LAYER|-?LAYER|LAY(?!OUT)[A-Z]+|PROPERTIES|-?PROPERTIES|MATCHPROP)/, "Capas y propiedades"],
  [/^(COPYCLIP|PASTECLIP|CUTCLIP|COPYBASE)/, "Portapapeles"],
  [/^(ZOOM|PAN|-?PAN)/, "Encuadre y zoom"],
  [/^(3DORBIT|3DFORBIT|3DPAN|3DZOOM|VPOINT|PLAN|VIEW|-?VIEW)/, "Vistas 3D"],
  [/^(VISUALSTYLES?|-?VISUALSTYLES?|SHADEMODE)/, "Estilos visuales"],
  [/^(UCS|UCSICON|-?UCSMAN)/, "SCU"],
  [/^(VPORTS?|-?VPORTS|MVIEW)/, "Ventanas"],
  [/^(UNITS|-?UNITS|DDPTYPE|OSNAP|-?OSNAP|DSETTINGS|-?DSETTINGS|LINETYPE|-?LINETYPE|MEXSTANDARD|NORMAMX)/, "Variables"],
  [/^(SCRIPT|-?SCRIPT|LISP|APPLOAD|VLIDE|VBA)/, "AutoLISP y scripts"],
  [/^(TOOLPALETTES|-?TOOLPALETTES|ADCENTER|DESIGNCENTER)/, "Plugins y paletas"],
];

function ribbonPanelForCommand(descriptor: CadCommandDescriptor): string {
  for (const [pattern, panel] of CAD_PANEL_NAME_PATTERNS) {
    if (pattern.test(descriptor.name)) return panel;
  }
  const fallback: Readonly<Record<CadRibbonTabId, string>> = {
    inicio: "Dibujo",
    insertar: "Bloques y referencias",
    anotar: "Anotación",
    vista: "Vistas",
    salida: "Trazar y publicar",
    administrar: "Herramientas",
  };
  return fallback[ribbonTabForCommand(descriptor)];
}

export interface CadRibbonCommand {
  name: string;
  aliases: readonly string[];
  summary: string;
  panel: string;
}

export interface CadRibbonPanel {
  label: string;
  commands: readonly CadRibbonCommand[];
}

export interface CadRibbonTab extends CadRibbonTabMeta {
  panels: readonly CadRibbonPanel[];
  commandCount: number;
}

/**
 * Comandos que declaran explícitamente por qué NO tienen botón de cinta.
 * Vacía hoy a propósito: todo comando de un `begin`/`step` interactivo puede
 * despacharse con un clic exactamente como si se tecleara su nombre — no hay
 * ningún comando del registro real que lo necesite hoy. Existe para que el
 * día que aparezca uno, la razón quede escrita aquí y no como un hueco
 * silencioso en la cinta.
 */
export const CAD_RIBBON_UNEXPOSED: Readonly<Record<string, string>> = {};

function buildRibbonTabs(): CadRibbonTab[] {
  const byTab = new Map<CadRibbonTabId, Map<string, CadRibbonCommand[]>>();
  for (const meta of CAD_RIBBON_TABS) byTab.set(meta.id, new Map());
  for (const descriptor of CAD_COMMAND_DESCRIPTORS) {
    if (descriptor.name in CAD_RIBBON_UNEXPOSED) continue;
    const tabId = ribbonTabForCommand(descriptor);
    const panelLabel = ribbonPanelForCommand(descriptor);
    const panels = byTab.get(tabId)!;
    const commands = panels.get(panelLabel) ?? [];
    commands.push({
      name: descriptor.name,
      aliases: descriptor.aliases,
      summary: cadCommandSummary(descriptor.name),
      panel: panelLabel,
    });
    panels.set(panelLabel, commands);
  }
  return CAD_RIBBON_TABS.map((meta) => {
    const panels = [...byTab.get(meta.id)!.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es-MX"))
      .map(([label, commands]) => ({
        label,
        commands: [...commands].sort((a, b) => a.name.localeCompare(b.name, "es-MX")),
      }));
    return {
      ...meta,
      panels,
      commandCount: panels.reduce((total, panel) => total + panel.commands.length, 0),
    };
  });
}

/** La cinta completa, calculada una vez al cargar el módulo. */
export const CAD_RIBBON_DATA: readonly CadRibbonTab[] = buildRibbonTabs();

/**
 * Cobertura registro ↔ cinta: todo nombre de `CAD_COMMAND_DESCRIPTORS` debe
 * aparecer en `CAD_RIBBON_DATA` o en `CAD_RIBBON_UNEXPOSED`. Es la misma
 * función que corre `scripts/cad/check-ribbon-coverage.mjs`, exportada para
 * que el gate y una spec de Node prueben exactamente el mismo código, no una
 * reimplementación paralela que pueda decir una cosa distinta.
 */
export function cadRibbonCoverageGaps(): string[] {
  const exposed = new Set<string>();
  for (const tab of CAD_RIBBON_DATA) {
    for (const panel of tab.panels) {
      for (const command of panel.commands) exposed.add(command.name);
    }
  }
  const gaps: string[] = [];
  for (const descriptor of CAD_COMMAND_DESCRIPTORS) {
    if (exposed.has(descriptor.name)) continue;
    if (descriptor.name in CAD_RIBBON_UNEXPOSED) continue;
    gaps.push(descriptor.name);
  }
  return gaps;
}

export function findCadRibbonCommand(name: string): CadRibbonCommand | undefined {
  const upper = name.toUpperCase();
  for (const tab of CAD_RIBBON_DATA) {
    for (const panel of tab.panels) {
      const found = panel.commands.find((command) => command.name === upper);
      if (found) return found;
    }
  }
  return undefined;
}
