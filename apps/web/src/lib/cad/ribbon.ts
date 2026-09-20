/**
 * LA CINTA, GENERADA DEL REGISTRO — no una lista escrita a mano.
 *
 * `CAD_COMMAND_DESCRIPTORS` (`engine/index.ts`) es la única fuente de verdad
 * de los comandos reales: la paleta Ctrl+K, la línea de comandos y ahora la
 * cinta leen todas de ahí. Cuántos son lo dice el registro, y por eso no se
 * escribe aquí: este comentario llegó a decir «~192» cuando ya eran 294. Una lista paralela de botones se desincroniza
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
 * (`CAD_RIBBON_UNEXPOSED`). Hoy lo son sólo las órdenes que AÚN NO HACEN NADA
 * (`engine/command-availability.ts`): responden en la línea de comandos que no
 * están disponibles, y un botón que no hace nada —RENDER era el botón grande de
 * Salida › Render— es peor que un botón que no está. No es un escondite para
 * trabajo a medias: la razón viaja con cada nombre y el día que la orden
 * funcione se borra de esa tabla y vuelve a su panel sola.
 */
import {
  CAD_COMMAND_DESCRIPTORS,
  type CadCommandDescriptor,
  type CadCommandKind,
} from "./engine";
import { CAD_COMANDOS_AUN_NO_DISPONIBLES } from "./engine/command-availability";
import { cadCommandLabel } from "./engine/command-labels";
import { cadCommandSummary } from "./engine/command-summaries";
import {
  CAD_RIBBON_COMMAND_ORDER,
  CAD_RIBBON_INICIO_ESPEJOS,
  CAD_RIBBON_PANEL_ORDER,
  CAD_RIBBON_PRIMARY,
  compareDeclared,
} from "./ribbon-order";

export type CadRibbonTabId =
  | "inicio"
  | "insertar"
  | "anotar"
  | "parametrico"
  | "vista"
  | "solidos3d"
  | "salida"
  | "administrar"
  | "superficies"
  | "mallas";

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
  // «Sólidos 3D» es pestaña propia, como en AutoCAD: antes sus 23 comandos
  // eran el 13.º panel de Inicio, invisible sin desplazar la cinta (medido:
  // ~10 700 px de tira a 1366 px de ventana).
  { id: "solidos3d", label: "Sólidos 3D" },
  { id: "salida", label: "Salida" },
  { id: "administrar", label: "Administrar" },
  { id: "superficies", label: "Superficies" },
  { id: "mallas", label: "Mallas" },
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
    /^(BOX|SPHERE|CYLINDER|CONE|WEDGE|TORUS|PYRAMID|POLYSOLID|EXTRUDE|REVOLVE|SWEEP|LOFT|PRESSPULL|UNION|SUBTRACT|INTERSECT|INTERFERE|SLICE|FILLETEDGE|CHAMFEREDGE|SOLIDEDIT|SECTION|MASSPROP)$/,
    "solidos3d",
  ],
  [
    /^(GC[A-Z]+|DC(LINEAR|ANGULAR|RADIUS|DIAMETER)|AUTOCONSTRAIN|GEOMCONSTRAINT|DELCONSTRAINT|DIMCONSTRAINT|PARAMETERS)$/,
    "parametrico",
  ],
  [
    /^(-?WALL|DOOR|WINDOW|-?OPENING|STAIR|ROOF|SLAB|PIPE|DUCT|CABLETRAY|MEPSYMBOL|AEWIRE|AEWIRELIST|AECIRCUIT|AECHECK|AETAG|AETAGLIST|AESYMBOL|PIDLINE|PIDLIST|PIDEQUIP|PIDEQUIPLIST|PIDROUTE|PIDMTO|PIDISO|PLANESURF|SURF(?!ACE)[A-Z]+|CONVTOSURFACE)$/,
    "superficies",
  ],
  [
    /^(MESH|CONVTOMESH|CONVTOSOLID|MESH[A-Z]+|RULESURF|TABSURF|REVSURF|EDGESURF|3DFACE)$/,
    "mallas",
  ],
  [
    /^(-?LAYER|LAYERSTATE|LAY(?!OUT|TRANS)[A-Z]+|VPLAYER|PROPERTIES|MATCHPROP|COLOR|-?LINETYPE|LWEIGHT|LTSCALE|CELTSCALE|-?INSERT|BLOCK|-?BEDIT|WBLOCK|ATTDEF|ATTEDIT|ATTSYNC|BURST|BASE|BLOQUEDIN|BLOQUEDINSET|BLOQUEDINLIST|BLOQUEDINDEF|REFEDIT|REFSET|REFCLOSE|GROUP|UNGROUP|DRAWORDER|QSELECT|FILTER|SELECTSIMILAR|SETBYLAYER|CHPROP)$/,
    "inicio",
  ],
  [
    /^(-?XREF|XATTACH|XCLIP|XBIND|REFEDIT|ADCENTER|DESIGNCENTER|DXFIN|DXFATTACH|IMAGE|IMAGEATTACH|IMAGECLIP|IMAGEADJUST|VECTORIZE|IMPORT|DATAEXTRACTION|GEOGRAPHICLOCATION|MAPIMPORT|COGO|CUADROCONSTRUCCION|STDPART|STEELSHAPE|PDFATTACH|PDFIMPORT|PDFCLIP|PDFADJUST|PDFPAGE|PDFSCALE|PDFDETACH|PDFUNLOAD|PDFRELOAD|PDFLIST)$/,
    "insertar",
  ],
  [
    /^(RENDER[A-Z]*|MATERIAL[A-Z]*|[A-Z]*LIGHT|SUNPROPERTIES)$/,
    "salida",
  ],
  [
    /^(-?PLOT|PLOTSTAMP|PUBLISH|-?PAGESETUP|STYLESMANAGER|-?LAYOUT|MVIEW|-?VPORTS?|SOLVIEW|SOLDRAW|FLATSHOT|SOLPROF|DXFOUT|SAVEAS|EXPORT|EXPORTPDF|EXPORTLAYOUT|SHEETSET|ETRANSMIT)$/,
    "salida",
  ],
  [/^(-?TOOLPALETTES|-?UCSMAN|UCS|UCSICON|MSPACE|PSPACE)$/, "vista"],
  [
    /^(CHECKSTANDARDS|GETVAR|SETVAR|NORMAMX|MEXSTANDARD|LAYTRANS|AUDIT|RECOVER|PURGE|RENAME|REVISA|OPTIONS|COMPARE)$/,
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
  [/^(-?INSERT|BLOCK|-?BEDIT|WBLOCK|ATTDEF|ATTEDIT|ATTSYNC|BURST|BASE|BLOQUEDIN|BLOQUEDINSET|BLOQUEDINLIST|BLOQUEDINDEF|REFEDIT|REFSET|REFCLOSE)$/, "Bloque"],
  [/^(GROUP|UNGROUP)$/, "Grupos"],
  [/^(GC[A-Z]+|AUTOCONSTRAIN|GEOMCONSTRAINT)$/, "Geométricas"],
  [/^(DC(LINEAR|ANGULAR|RADIUS|DIAMETER)|DIMCONSTRAINT)$/, "Dimensionales"],
  [/^(PARAMETERS|DELCONSTRAINT)$/, "Gestionar"],
  [/^(-?STYLE|-?DIMSTYLE|-?MLEADERSTYLE|TABLESTYLE)$/, "Estilos"],
  [/^(-?DIM[A-Z]*|QDIM|CENTERMARK|CENTERLINE)$/, "Cotas"],
  [/^(-?LEADER|MLEADER|QLEADER)$/, "Directrices"],
  [/^(-?TEXT|MTEXT|DTEXT|SPELL|-?TABLE|TABLEDIT|DDEDIT|TEXTALIGN|FIELD|UPDATEFIELD|TCOUNT|TXT2MTXT)$/, "Texto y tablas"],
  [/^TOLERANCE$/, "Tolerancias"],
  [/^(-?WALL|DOOR|WINDOW|-?OPENING|STAIR|ROOF|SLAB)$/, "Arquitectura"],
  [/^(PIPE|DUCT|CABLETRAY|MEPSYMBOL|AEWIRE|AEWIRELIST|AECIRCUIT|AECHECK|AETAG|AETAGLIST|AESYMBOL|PIDLINE|PIDLIST|PIDEQUIP|PIDEQUIPLIST|PIDROUTE|PIDMTO|PIDISO)$/, "Instalaciones"],
  // Mechanical (Ola I): normalizados en Insertar; globo, lista y símbolos en Anotar.
  [/^(STDPART|STEELSHAPE)$/, "Normalizados"],
  [/^(BALLOON|BOM|WELDSYMBOL|SURFACESYMBOL)$/, "Mecánica"],
  [
    // El sombreado va en Dibujo, como en el panel Draw de AutoCAD (HATCH,
    // GRADIENT y BOUNDARY son `kind: draw`); un panel «Sombreado» aparte era
    // uno de los trece de Inicio, y a 1366 px no caben trece.
    /^(LINE|XLINE|RAY|-?PLINE|POLYGON|RECTANG|CIRCLE|ARC|ELLIPSE|-?SPLINE|DONUT|-?POINT|DIVIDE|MEASURE|-?REGION|SOLID|REVCLOUD|WIPEOUT|BREAKLINE|-?HATCH|GRADIENT|-?BOUNDARY)$/,
    "Dibujo",
  ],
  [
    /^(MOVE|COPY|ROTATE|SCALE|MIRROR|-?ARRAY|ARRAYEDIT|-?ALIGN|STRETCH|TRIM|EXTEND|FILLET|CHAMFER|BREAK|BREAKATPOINT|REVERSE|JOIN|BLEND|-?PEDIT|SPLINEDIT|OFFSET|EXPLODE|XPLODE|NCOPY|ERASE|LENGTHEN|OVERKILL|DRAWORDER|FLATTEN|3DMOVE|3DROTATE|3DSCALE|3DALIGN|MIRROR3D|3DARRAY)$/,
    "Modificar",
  ],
  // Pestaña Sólidos 3D: los paneles Primitivas · Sólido · Booleanas · Edición
  // de sólidos · Consulta 3D de la pestaña Solid de AutoCAD.
  [/^(BOX|SPHERE|CYLINDER|CONE|WEDGE|TORUS|PYRAMID|POLYSOLID)$/, "Primitivas"],
  [/^(EXTRUDE|REVOLVE|SWEEP|LOFT|PRESSPULL)$/, "Sólido"],
  [/^(UNION|SUBTRACT|INTERSECT|INTERFERE)$/, "Booleanas"],
  [/^(SLICE|FILLETEDGE|CHAMFEREDGE|SOLIDEDIT|SECTION)$/, "Edición de sólidos"],
  [/^MASSPROP$/, "Consulta 3D"],
  // COMPARE: la pestaña Colaborar de AutoCAD no existe aquí; Administrar es la
  // equivalente, y comparar dos dibujos merece su propio panel.
  [/^COMPARE$/, "Comparar"],
  [/^(-?DIST|-?AREA|-?LIST|-?ID|-?QSELECT|SELECT|FILTER|SELECTSIMILAR|ADDSELECTED|ABOUT|STATUS|FIND|TIME)$/, "Utilidades"],
  // `U`, `UNDO` y `REDO` van con MODIFICAR y no con Dibujo, que es donde los
  // dejaba el reposo de la pestaña Inicio: deshacer no dibuja nada, y en la
  // cinta de AutoCAD viven con las órdenes que cambian lo dibujado.
  [/^(U|UNDO|REDO|MREDO|OOPS)$/, "Modificar"],
  [/^(COPYCLIP|PASTECLIP|CUTCLIP|COPYBASE|PASTEORIG)$/, "Portapapeles"],
  [/^(-?XREF|XATTACH|XCLIP|XBIND|REFEDIT|IMAGE|IMAGEATTACH|IMAGECLIP|IMAGEADJUST|VECTORIZE|PDFATTACH|PDFIMPORT|PDFCLIP|PDFADJUST|PDFPAGE|PDFSCALE|PDFDETACH|PDFUNLOAD|PDFRELOAD|PDFLIST)$/, "Referencias"],
  [/^(DXFIN|IMPORT|DATAEXTRACTION)$/, "Importar y extraer"],
  // Map 3D (Ola G): el panel «Ubicación» de la pestaña Insertar de AutoCAD.
  [/^(GEOGRAPHICLOCATION|MAPIMPORT|COGO|CUADROCONSTRUCCION)$/, "Ubicación"],
  [/^(ADCENTER|DESIGNCENTER|-?TOOLPALETTES)$/, "Paletas"],
  [/^(ZOOM|-?PAN)$/, "Encuadre y zoom"],
  [/^(3DORBIT|3DFORBIT|3DPAN|3DZOOM|VPOINT|PLAN|-?VIEW|PERSPECTIVE|3DWALK|3DFLY|3DSWIVEL|VIEWRES|CAMERA|DVIEW|NAVVCUBE|NAVBAR)$/, "Vistas 3D"],
  [/^(-?VISUALSTYLES?|SHADEMODE|VSCURRENT|VISUALSTYLES)$/, "Estilos visuales"],
  [/^(REGEN|REGENALL|REDRAW|VIEWBASE|VIEWPROJ|VIEWSECTION|VIEWDETAIL|VIEWEDIT|VIEWUPDATE)$/, "Vistas"],
  [/^(PLANESURF|SURF[A-Z]+|CONVTOSURFACE)$/, "Superficies"],
  // Hoy ningún comando de render, luz o material funciona y todos están en
  // CAD_RIBBON_UNEXPOSED, así que el panel no se monta. El patrón se queda para
  // que el primero que funcione vuelva a Salida › Render al salir de
  // `command-availability.ts`; ribbon.spec y ribbon-icons.spec pedirán entonces
  // su botón grande (ribbon-order) y el icono del panel (ribbon-icons).
  [/^(RENDER[A-Z]*|MATERIAL[A-Z]*|[A-Z]*LIGHT|SUNPROPERTIES)$/, "Render"],
  [/^(MESH|CONVTOMESH|CONVTOSOLID|MESH[A-Z]+|RULESURF|TABSURF|REVSURF|EDGESURF|3DFACE)$/, "Mallas"],
  [/^(UCS|UCSICON|-?UCSMAN)$/, "SCU"],
  [/^(-?VPORTS?|MVIEW|MSPACE|PSPACE)$/, "Ventanas"],
  [/^(-?PLOT|PLOTSTAMP|PUBLISH|-?PAGESETUP|STYLESMANAGER|SHEETSET|ETRANSMIT|-?LAYOUT)$/, "Trazar y publicar"],
  [/^(DXFOUT|SAVEAS|EXPORT|EXPORTPDF|EXPORTLAYOUT|FLATSHOT|SOLPROF|SOLVIEW|SOLDRAW)$/, "Exportar"],
  [/^(-?UNITS|DDPTYPE|-?OSNAP|-?DSETTINGS|SETVAR|GETVAR|OPTIONS|FILL)$/, "Variables"],
  [
    /^(MEXSTANDARD|NORMAMX|CHECKSTANDARDS|LAYTRANS|AUDIT|RECOVER|PURGE|RENAME|REVISA)$/,
    "Normas y reparación",
  ],
  [/^(-?SCRIPT|RSCRIPT|LISP|APPLOAD|VLIDE|VBA|ACTRECORD|ACTSTOP|ACTMANAGER)$/, "AutoLISP y scripts"],

];

/** Panel de reposo por pestaña: donde cae un comando que ningún patrón reclama. */
export const CAD_RIBBON_FALLBACK_PANEL: Readonly<Record<CadRibbonTabId, string>> = {
  inicio: "Dibujo",
  insertar: "Referencias",
  anotar: "Anotación",
  parametrico: "Geométricas",
  vista: "Vistas",
  solidos3d: "Sólido",
  salida: "Trazar y publicar",
  administrar: "Herramientas",
  superficies: "Superficies",
  mallas: "Mallas",
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
  /** Rótulo del botón en español (`command-labels.ts`): «Línea», no LINE. */
  label: string;
  summary: string;
  panel: string;
  /**
   * T-74(i): en un dibujo de sólo lectura, la cinta apagaba el tira ENTERA
   * de golpe (`CadRibbon.tsx`, `pointer-events-none` sobre el contenedor) —
   * incluidos comandos que no tocan el documento (LIST, DIST, ID…). El
   * registro ya sabe cuáles mutan (`CadCommandDescriptor.mutates`); sólo
   * faltaba que llegara hasta aquí para apagar SÓLO ésos.
   */
  mutates: boolean;
  /**
   * Botón GRANDE del panel (`CAD_RIBBON_PRIMARY`, uno o dos por panel): se
   * pinta con icono grande y rótulo, y siempre a la vista aunque el panel se
   * reduzca; los demás son botones pequeños o van al desplegable del panel.
   */
  primary: boolean;
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
 *
 * Son exactamente las órdenes que aún no están disponibles
 * (`CAD_COMANDOS_AUN_NO_DISPONIBLES`), con su motivo. Se DERIVA de esa tabla y
 * no se escribe aparte: una orden que empieza a funcionar sale de allí y
 * recupera su botón sin que nadie se acuerde de tocar este archivo, y una que
 * deja de funcionar no puede quedarse con botón por olvido. La cobertura
 * registro ↔ cinta sigue siendo total: `cadRibbonCoverageGaps` cuenta cada
 * nombre en la cinta o aquí, y `check-ribbon-coverage.mjs` exige que las dos
 * cifras sumen el registro.
 */
export const CAD_RIBBON_UNEXPOSED: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CAD_COMANDOS_AUN_NO_DISPONIBLES).map(([name, motivo]) => [
    name,
    `aún no disponible: ${motivo}`,
  ]),
);

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
      label: cadCommandLabel(descriptor.name),
      summary: cadCommandSummary(descriptor.name),
      panel: panelLabel,
      mutates: descriptor.mutates,
      primary: (CAD_RIBBON_PRIMARY[panelLabel] ?? []).includes(descriptor.name),
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
      if (!original) continue; // D5: degradación correcta, no excepción en producción
      commands.push({
        ...original,
        panel: panelLabel,
        primary: (CAD_RIBBON_PRIMARY[panelLabel] ?? []).includes(name),
      });
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
