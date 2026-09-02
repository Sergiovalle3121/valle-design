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
 *   3. Dentro de la pestaña, el panel sale de `CAD_PANEL_NAME_PATTERNS` y el
 *      ORDEN de paneles y botones de `ribbon-order.ts`, declarado: antes lo
 *      decidía un `localeCompare` y LINE era el botón 15 de «Dibujo».
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
import {
  CAD_RIBBON_COMMAND_ORDER,
  CAD_RIBBON_INICIO_ESPEJOS,
  CAD_RIBBON_PANEL_ORDER,
  compareDeclared,
} from "./ribbon-order";

export type CadRibbonTabId =
  | "inicio"
  | "insertar"
  | "anotar"
  | "parametrico"
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
  { id: "parametrico", label: "Paramétrico" },
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
 * Patrones de nombre → pestaña, en orden de prioridad y ANCLADOS (`^…$`).
 * Cubren lo que el `kind` por sí solo no separa: sin ellos casi todo lo no
 * gráfico caía en «Administrar» (81 comandos de `kind: manage`), y las capas,
 * los bloques y las propiedades —que en AutoCAD viven en Inicio— quedaban a
 * dos pestañas de distancia. Sin ancla, `DIMSTYLE` caía en «Cotas» y
 * `LINETYPE` en «Dibujo» (medido antes de anclar).
 */
const CAD_TAB_NAME_PATTERNS: readonly [RegExp, CadRibbonTabId][] = [
  [
    /^(GC[A-Z]+|DC(LINEAR|ANGULAR|RADIUS|DIAMETER)|AUTOCONSTRAIN|GEOMCONSTRAINT|DELCONSTRAINT|DIMCONSTRAINT|PARAMETERS)$/,
    "parametrico",
  ],
  [
    /^(-?LAYER|LAYERSTATE|LAY(?!OUT|TRANS)[A-Z]+|VPLAYER|PROPERTIES|MATCHPROP|COLOR|-?LINETYPE|LWEIGHT|LTSCALE|CELTSCALE|-?INSERT|BLOCK|-?BEDIT|WBLOCK|ATTDEF|ATTEDIT|BURST|BASE|GROUP|UNGROUP|DRAWORDER|QSELECT|FILTER|SELECTSIMILAR|SETBYLAYER|CHPROP)$/,
    "inicio",
  ],
  [
    /^(-?XREF|XATTACH|XCLIP|XBIND|REFEDIT|ADCENTER|DESIGNCENTER|DXFIN|DXFATTACH|IMAGE|IMPORT|DATAEXTRACTION|GEOGRAPHICLOCATION|MAPIMPORT)$/,
    "insertar",
  ],
  [
    /^(-?PLOT|PUBLISH|-?PAGESETUP|-?LAYOUT|MVIEW|-?VPORTS?|SOLVIEW|SOLDRAW|FLATSHOT|SOLPROF|DXFOUT|EXPORT|EXPORTPDF|EXPORTLAYOUT|SHEETSET|ETRANSMIT)$/,
    "salida",
  ],
  [/^(-?TOOLPALETTES|-?UCSMAN|UCS|UCSICON|MSPACE|PSPACE)$/, "vista"],
  [
    /^(CHECKSTANDARDS|GETVAR|SETVAR|NORMAMX|MEXSTANDARD|LAYTRANS|AUDIT|RECOVER|PURGE|RENAME|OPTIONS)$/,
    "administrar",
  ],
  [/^(-?STYLE|-?DIMSTYLE|-?MLEADERSTYLE|TABLESTYLE)$/, "anotar"],
];

function ribbonTabForCommand(descriptor: CadCommandDescriptor): CadRibbonTabId {
  for (const [pattern, tab] of CAD_TAB_NAME_PATTERNS) {
    if (pattern.test(descriptor.name)) return tab;
  }
  return CAD_KIND_TAB[descriptor.kind];
}

/**
 * Patrones de nombre → panel, sólo dentro de su pestaña. Agrupación de
 * presentación, anclada (`^…$`): «Estilos» va ANTES que «Cotas», «Directrices»
 * y «Texto y tablas» para que DIMSTYLE, MLEADERSTYLE y TABLESTYLE no se
 * dispersen uno por panel. Si nada coincide, el comando sigue apareciendo —en
 * el panel de reposo de su pestaña—, así que un patrón incompleto nunca
 * esconde un comando; antes de anclar, ese reposo («Dibujo») tenía 31 botones
 * de los que 15 no dibujaban (medido).
 */
const CAD_PANEL_NAME_PATTERNS: readonly [RegExp, string][] = [
  [/^(-?LAYER|LAYERSTATE|LAY(?!OUT|TRANS)[A-Z]+|VPLAYER)$/, "Capas"],
  [/^(PROPERTIES|MATCHPROP|COLOR|-?LINETYPE|LWEIGHT|LTSCALE|CELTSCALE|SETBYLAYER|CHPROP)$/, "Propiedades"],
  [/^(-?INSERT|BLOCK|-?BEDIT|WBLOCK|ATTDEF|ATTEDIT|BURST|BASE)$/, "Bloque"],
  [/^(GROUP|UNGROUP)$/, "Grupos"],
  [/^(GC[A-Z]+|AUTOCONSTRAIN|GEOMCONSTRAINT)$/, "Geométricas"],
  [/^(DC(LINEAR|ANGULAR|RADIUS|DIAMETER)|DIMCONSTRAINT)$/, "Dimensionales"],
  [/^(PARAMETERS|DELCONSTRAINT)$/, "Gestionar"],
  [/^(-?STYLE|-?DIMSTYLE|-?MLEADERSTYLE|TABLESTYLE)$/, "Estilos"],
  [/^(-?DIM[A-Z]*|QDIM)$/, "Cotas"],
  [/^(-?LEADER|MLEADER|QLEADER)$/, "Directrices"],
  [/^(-?HATCH|GRADIENT|-?BOUNDARY)$/, "Sombreado"],
  [/^(-?TEXT|MTEXT|DTEXT|SPELL|-?TABLE|DDEDIT|TEXTALIGN)$/, "Texto y tablas"],
  [/^TOLERANCE$/, "Tolerancias"],
  [/^(-?WALL|DOOR|WINDOW|-?OPENING|STAIR|ROOF|SLAB)$/, "Arquitectura"],
  [/^(PIPE|DUCT|CABLETRAY|MEPSYMBOL)$/, "Instalaciones"],
  [
    /^(LINE|XLINE|RAY|-?PLINE|POLYGON|RECTANG|CIRCLE|ARC|ELLIPSE|-?SPLINE|DONUT|-?POINT|DIVIDE|MEASURE|-?REGION|SOLID|REVCLOUD|WIPEOUT)$/,
    "Dibujo",
  ],
  [
    /^(MOVE|COPY|ROTATE|SCALE|MIRROR|-?ARRAY|ARRAYEDIT|-?ALIGN|STRETCH|TRIM|EXTEND|FILLET|CHAMFER|BREAK|JOIN|BLEND|-?PEDIT|SPLINEDIT|OFFSET|EXPLODE|XPLODE|NCOPY|ERASE|LENGTHEN|OVERKILL|DRAWORDER)$/,
    "Modificar",
  ],
  [
    /^(BOX|SPHERE|CYLINDER|CONE|WEDGE|TORUS|PYRAMID|POLYSOLID|EXTRUDE|REVOLVE|SWEEP|LOFT|UNION|SUBTRACT|INTERSECT|SLICE|SHELL|SOLIDEDIT|MASSPROP|PRESSPULL|FILLETEDGE|CHAMFEREDGE|SECTION|INTERFERE)$/,
    "Sólidos",
  ],
  [/^(-?DIST|-?AREA|-?LIST|-?ID|-?QSELECT|SELECT|FILTER|SELECTSIMILAR|ADDSELECTED)$/, "Utilidades"],
  [/^(COPYCLIP|PASTECLIP|CUTCLIP|COPYBASE|PASTEORIG)$/, "Portapapeles"],
  [/^(-?XREF|XATTACH|XCLIP|XBIND|REFEDIT|IMAGE)$/, "Referencias"],
  [/^(DXFIN|IMPORT|DATAEXTRACTION)$/, "Importar y extraer"],
  // Map 3D (Ola G): el panel «Ubicación» de la pestaña Insertar de AutoCAD.
  [/^(GEOGRAPHICLOCATION|MAPIMPORT)$/, "Ubicación"],
  [/^(ADCENTER|DESIGNCENTER|-?TOOLPALETTES)$/, "Paletas"],
  [/^(ZOOM|-?PAN)$/, "Encuadre y zoom"],
  [/^(3DORBIT|3DFORBIT|3DPAN|3DZOOM|VPOINT|PLAN|-?VIEW)$/, "Vistas 3D"],
  [/^(-?VISUALSTYLES?|SHADEMODE|VSCURRENT)$/, "Estilos visuales"],
  [/^(REGEN|REGENALL)$/, "Vistas"],
  [/^(UCS|UCSICON|-?UCSMAN)$/, "SCU"],
  [/^(-?VPORTS?|MVIEW|MSPACE|PSPACE)$/, "Ventanas"],
  [/^(-?PLOT|PUBLISH|-?PAGESETUP|SHEETSET|ETRANSMIT|-?LAYOUT)$/, "Trazar y publicar"],
  [/^(DXFOUT|EXPORT|EXPORTPDF|EXPORTLAYOUT|FLATSHOT|SOLPROF|SOLVIEW|SOLDRAW)$/, "Exportar"],
  [/^(-?UNITS|DDPTYPE|-?OSNAP|-?DSETTINGS|SETVAR|GETVAR|OPTIONS)$/, "Variables"],
  [/^(MEXSTANDARD|NORMAMX|CHECKSTANDARDS|LAYTRANS|AUDIT|RECOVER|PURGE|RENAME)$/, "Normas y reparación"],
  [/^(-?SCRIPT|RSCRIPT|LISP|APPLOAD|VLIDE|VBA)$/, "AutoLISP y scripts"],
];

/** Panel de reposo por pestaña: donde cae un comando que ningún patrón reclama. */
export const CAD_RIBBON_FALLBACK_PANEL: Readonly<Record<CadRibbonTabId, string>> = {
  inicio: "Dibujo",
  insertar: "Referencias",
  anotar: "Anotación",
  parametrico: "Geométricas",
  vista: "Vistas",
  salida: "Trazar y publicar",
  administrar: "Herramientas",
};

function ribbonPanelForCommand(descriptor: CadCommandDescriptor): { panel: string; matched: boolean } {
  for (const [pattern, panel] of CAD_PANEL_NAME_PATTERNS) {
    if (pattern.test(descriptor.name)) return { panel, matched: true };
  }
  return { panel: CAD_RIBBON_FALLBACK_PANEL[ribbonTabForCommand(descriptor)], matched: false };
}

/** Nombres que ningún patrón de panel reclamó. La red de seguridad debe estar VACÍA. */
const RIBBON_PANEL_FALLBACKS: string[] = [];
export function cadRibbonPanelFallbacks(): readonly string[] {
  return RIBBON_PANEL_FALLBACKS;
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
  const byName = new Map<string, CadRibbonCommand>();
  for (const descriptor of CAD_COMMAND_DESCRIPTORS) {
    if (descriptor.name in CAD_RIBBON_UNEXPOSED) continue;
    const tabId = ribbonTabForCommand(descriptor);
    const { panel: panelLabel, matched } = ribbonPanelForCommand(descriptor);
    if (!matched) RIBBON_PANEL_FALLBACKS.push(descriptor.name);
    const panels = byTab.get(tabId)!;
    const commands = panels.get(panelLabel) ?? [];
    const command: CadRibbonCommand = {
      name: descriptor.name,
      aliases: descriptor.aliases,
      summary: cadCommandSummary(descriptor.name),
      panel: panelLabel,
    };
    commands.push(command);
    byName.set(command.name, command);
    panels.set(panelLabel, commands);
  }
  // Espejos en Inicio (Home > Annotation de AutoCAD). Un nombre que no exista
  // en el registro es un cadáver en la tabla: se dice en voz alta al cargar.
  // Es una COPIA con `panel` propio: el icono del botón sale de `command.panel`
  // (CadRibbonButton.tsx), no del panel donde se monta.
  const inicio = byTab.get("inicio")!;
  for (const [panelLabel, names] of Object.entries(CAD_RIBBON_INICIO_ESPEJOS)) {
    const commands = inicio.get(panelLabel) ?? [];
    for (const name of names) {
      const original = byName.get(name);
      if (!original) throw new Error(`ribbon: el espejo «${name}» no existe en el registro`);
      commands.push({ ...original, panel: panelLabel });
    }
    inicio.set(panelLabel, commands);
  }
  return CAD_RIBBON_TABS.map((meta) => {
    const panels = [...byTab.get(meta.id)!.entries()]
      .sort(([a], [b]) => compareDeclared(CAD_RIBBON_PANEL_ORDER[meta.id], a, b))
      .map(([label, commands]) => ({
        label,
        commands: [...commands].sort((a, b) =>
          compareDeclared(CAD_RIBBON_COMMAND_ORDER[label], a.name, b.name),
        ),
      }));
    return {
      ...meta,
      panels,
      // Botones, espejos incluidos: es lo que la pestaña muestra en su insignia.
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
  const exposed = cadRibbonExposedNames();
  const gaps: string[] = [];
  for (const descriptor of CAD_COMMAND_DESCRIPTORS) {
    if (exposed.has(descriptor.name)) continue;
    if (descriptor.name in CAD_RIBBON_UNEXPOSED) continue;
    gaps.push(descriptor.name);
  }
  return gaps;
}

/**
 * Nombres ÚNICOS con botón. Con los espejos de Inicio, `commandCount` suma
 * botones y no comandos; la cobertura del registro se mide con esto.
 */
export function cadRibbonExposedNames(): ReadonlySet<string> {
  const exposed = new Set<string>();
  for (const tab of CAD_RIBBON_DATA) {
    for (const panel of tab.panels) {
      for (const command of panel.commands) exposed.add(command.name);
    }
  }
  return exposed;
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
