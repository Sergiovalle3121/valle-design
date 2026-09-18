/**
 * CUÁNTO CABE EN LA CINTA — decidido con datos, no con scroll.
 *
 * ## Por qué existe este módulo
 *
 * La tira de paneles de Inicio medía ~10 700 px con la barra de scroll
 * oculta: a 1366 px de ventana se veían ~20 botones de 159 y nadie sabía que
 * había más. AutoCAD no desplaza la cinta: cuando la pestaña no cabe, los
 * paneles de la derecha pierden botones pequeños, luego se quedan sólo con
 * los grandes y al final se pliegan a un único botón con el icono del panel.
 * Aquí se hace lo mismo, y se decide AQUÍ, como función pura sobre los datos
 * de la pestaña y el ancho disponible, para que una spec de Node pueda
 * afirmar sin navegador qué se ve a 1280 y a 1366 px.
 *
 * ## Por qué los anchos son constantes y no medidas del DOM
 *
 * Porque cada botón de la cinta tiene ancho FIJO (`CadRibbonButton.tsx`,
 * `CadRibbonPanel.tsx`): un botón grande mide 4,25 rem, uno pequeño 7 rem,
 * un panel plegado 4,5 rem. Con anchos fijos el plan se calcula del dato y
 * el golden 214 comprueba en el navegador que `scrollWidth <= clientWidth`,
 * es decir, que estas constantes no mienten. Si alguien cambia un `w-*` sin
 * tocar este archivo, el golden lo dice.
 */
import type { CadRibbonCommand, CadRibbonPanel, CadRibbonTab } from "./ribbon";
import { CAD_RIBBON_PANEL_COLLAPSE_ORDER } from "./ribbon-order";

/** Píxeles, en correspondencia UNO A UNO con las clases de los componentes. */
export const CAD_RIBBON_METRICS = {
  /** Botón grande: `w-[4.25rem]`. */
  large: 68,
  /** Botón pequeño: `w-28`. */
  small: 112,
  /** `gap-0.5` entre botones, columnas y bloques. */
  gap: 2,
  /** Panel: `px-2` (16) + `border-r` (1). */
  panelPad: 17,
  /** Panel plegado a un botón: `px-0.5` (4) + `w-[4.5rem]` (72) + `border-r` (1). */
  collapsed: 77,
  /** Filas de botones pequeños: `grid-rows-3`. */
  rows: 3,
  /** Columnas de botones pequeños como mucho, desplegado del todo. */
  maxColumns: 2,
  /** Holgura frente a redondeos de subpíxel entre navegadores. */
  safety: 12,
} as const;

export type CadRibbonPanelState = "expanded" | "reduced" | "collapsed";

export interface CadRibbonPanelLayout {
  state: CadRibbonPanelState;
  /** Columnas de botones pequeños a la vista (0 si está reducido o plegado). */
  columns: number;
}

/** Botones grandes y pequeños de un panel, en el orden declarado. */
export function splitCadRibbonPanel(panel: CadRibbonPanel): {
  primaries: CadRibbonCommand[];
  smalls: CadRibbonCommand[];
} {
  const primaries = panel.commands.filter((command) => command.primary);
  const smalls = panel.commands.filter((command) => !command.primary);
  return { primaries, smalls };
}

/** Columnas que necesita el panel para mostrar TODOS sus botones pequeños. */
export function cadRibbonPanelNaturalColumns(panel: CadRibbonPanel): number {
  const { smalls } = splitCadRibbonPanel(panel);
  return Math.min(CAD_RIBBON_METRICS.maxColumns, Math.ceil(smalls.length / CAD_RIBBON_METRICS.rows));
}

/** Qué comandos se ven en la cinta y cuáles van al desplegable, dado un plan. */
export function cadRibbonPanelSplit(
  panel: CadRibbonPanel,
  layout: CadRibbonPanelLayout,
): { large: CadRibbonCommand[]; small: CadRibbonCommand[]; flyout: CadRibbonCommand[] } {
  const { primaries, smalls } = splitCadRibbonPanel(panel);
  if (layout.state === "collapsed") return { large: [], small: [], flyout: [...panel.commands] };
  const visible = layout.state === "reduced" ? 0 : layout.columns * CAD_RIBBON_METRICS.rows;
  return { large: primaries, small: smalls.slice(0, visible), flyout: smalls.slice(visible) };
}

/** Ancho del panel en píxeles para un plan, con las constantes de arriba. */
export function cadRibbonPanelWidth(panel: CadRibbonPanel, layout: CadRibbonPanelLayout): number {
  const m = CAD_RIBBON_METRICS;
  if (layout.state === "collapsed") return m.collapsed;
  const { primaries } = splitCadRibbonPanel(panel);
  const primaryCols = primaries.length > CAD_RIBBON_METRICS.maxColumns
    ? CAD_RIBBON_METRICS.maxColumns
    : primaries.length;
  const largeBlock = primaryCols * m.large + Math.max(0, primaryCols - 1) * m.gap;
  const columns = layout.state === "reduced" ? 0 : layout.columns;
  const smallBlock = columns > 0 ? columns * m.small + (columns - 1) * m.gap + m.gap : 0;
  return m.panelPad + largeBlock + smallBlock;
}

export function cadRibbonTabWidth(tab: CadRibbonTab, plan: ReadonlyMap<string, CadRibbonPanelLayout>): number {
  return tab.panels.reduce((total, panel) => total + cadRibbonPanelWidth(panel, plan.get(panel.label)!), 0);
}

/**
 * EL PLAN: qué estado tiene cada panel para que la pestaña quepa en
 * `availableWidth`. Cinco pasadas, en este orden, y se para en cuanto cabe:
 *
 *   1. Los paneles del orden de plegado bajan a UNA columna de pequeños.
 *   2. Los mismos se quedan sólo con sus botones grandes (reducidos).
 *   3. Los mismos se pliegan a un botón.
 *   4. Los paneles protegidos (los que no están en el orden: Dibujo,
 *      Modificar, Capas…) bajan a una columna, del último al primero.
 *   5. Los protegidos se reducen a sus botones grandes, del último al primero.
 *
 * Así a 1920 px Anotación y Bloque siguen con sus botones grandes a la vista
 * mientras Instalaciones ya es un botón; y a 1280 px Dibujo y Modificar
 * conservan su primera columna (Círculo, Arco, Rectángulo · Girar, Recortar,
 * Borrar) y Capas su botón grande, que es lo que los goldens 61 y 86 pulsan.
 * Un panel plegado A MANO por el usuario empieza plegado y no se toca.
 *
 * Si ni así cabe (una ventana de tableta), la tira se desplaza: el plan es
 * el mínimo y la cinta no esconde ningún botón detrás de un borde sin que
 * se pueda llegar a él.
 */
export function planCadRibbonLayout(
  tab: CadRibbonTab,
  availableWidth: number,
  manuallyCollapsed: ReadonlySet<string> = new Set(),
): Map<string, CadRibbonPanelLayout> {
  const plan = new Map<string, CadRibbonPanelLayout>();
  for (const panel of tab.panels) {
    plan.set(
      panel.label,
      manuallyCollapsed.has(panel.label)
        ? { state: "collapsed", columns: 0 }
        : { state: "expanded", columns: cadRibbonPanelNaturalColumns(panel) },
    );
  }
  const budget = availableWidth - CAD_RIBBON_METRICS.safety;
  const fits = () => cadRibbonTabWidth(tab, plan) <= budget;
  if (fits()) return plan;

  const labels = new Set(tab.panels.map((panel) => panel.label));
  const collapsible = CAD_RIBBON_PANEL_COLLAPSE_ORDER[tab.id].filter(
    (label) => labels.has(label) && !manuallyCollapsed.has(label),
  );
  const protectedPanels = tab.panels
    .map((panel) => panel.label)
    .filter((label) => !collapsible.includes(label) && !manuallyCollapsed.has(label))
    .reverse();

  const passes: readonly [readonly string[], (layout: CadRibbonPanelLayout) => CadRibbonPanelLayout | null][] = [
    [collapsible, (layout) => (layout.state === "expanded" && layout.columns > 1 ? { state: "expanded", columns: 1 } : null)],
    [collapsible, (layout) => (layout.state === "expanded" ? { state: "reduced", columns: 0 } : null)],
    [collapsible, (layout) => (layout.state !== "collapsed" ? { state: "collapsed", columns: 0 } : null)],
    [protectedPanels, (layout) => (layout.state === "expanded" && layout.columns > 1 ? { state: "expanded", columns: 1 } : null)],
    [protectedPanels, (layout) => (layout.state === "expanded" ? { state: "reduced", columns: 0 } : null)],
  ];
  for (const [order, step] of passes) {
    for (const label of order) {
      const next = step(plan.get(label)!);
      if (!next) continue;
      plan.set(label, next);
      if (fits()) return plan;
    }
  }
  return plan;
}

/** Los nombres de comando con botón A LA VISTA (sin abrir ningún desplegable). */
export function cadRibbonVisibleNames(tab: CadRibbonTab, plan: ReadonlyMap<string, CadRibbonPanelLayout>): Set<string> {
  const visible = new Set<string>();
  for (const panel of tab.panels) {
    const split = cadRibbonPanelSplit(panel, plan.get(panel.label)!);
    for (const command of [...split.large, ...split.small]) visible.add(command.name);
  }
  return visible;
}
