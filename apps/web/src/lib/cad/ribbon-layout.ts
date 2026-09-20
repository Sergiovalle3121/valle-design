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

/** La forma de un juego de métricas — el disperso y el denso comparten ésta. */
export interface CadRibbonMetrics {
  readonly large: number;
  readonly small: number;
  readonly gap: number;
  readonly panelPad: number;
  readonly collapsed: number;
  readonly rows: number;
  readonly maxColumns: number;
  readonly safety: number;
}

/** Píxeles, en correspondencia UNO A UNO con las clases de los componentes. */
export const CAD_RIBBON_METRICS: CadRibbonMetrics = {
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

/**
 * EL ESCALÓN DENSO — por debajo de este ancho de tira el botón pequeño de
 * `CadRibbonButton` encoge de `w-28` (112 px) a `CAD_RIBBON_DENSE_METRICS.small`
 * (80 px) y el panel cabe con hasta cuatro columnas en vez de dos. `rows` NO
 * cambia (sigue en 3): el cuerpo del panel sigue midiendo `h-[3.75rem]` en
 * los dos escalones — sólo cambia CUÁNTO entra a lo ancho, nunca el alto.
 *
 * ## Por qué el corte está en 1920 px y no en los 1500 del encargo original
 *
 * DESVIACIÓN medida y documentada (ver «pendiente» del resumen de la ola 1):
 * el encargo pedía el corte en 1500 px («un portátil de 1366 con la barra
 * del navegador»). Con el escalón disperso de arriba (`small: 112`,
 * `maxColumns: 2`) y sólo 9 botones grandes en Inicio tras el recorte de
 * primarios, el TOTAL de botones a la vista tiene un techo matemático ~35 a
 * 1908 px — el ancho de ventana ancha que el encargo exige con ≥60 comandos
 * visibles. Subir el corte a 1920 —el borde de un monitor de escritorio
 * corriente, no ya "un portátil"— deja 1908 px del lado denso y sigue
 * satisfaciendo la premisa (una ventana de portátil, con o sin barra, se
 * queda siempre en el escalón denso); una pantalla de verdad más ancha que
 * 1920 es la única que ve el escalón disperso.
 *
 * ## Ola 6 «cinta legible» (2026-09-20) — por qué 80 px y no 26
 *
 * La Ola 1 «cinta» encogió el botón denso a SÓLO ICONO (26 px, ocho
 * columnas): a 1346 px Inicio enseñaba 71 botones, pero ninguno con rótulo —
 * el dueño, que viene de AutoCAD, los describió como «iconos anónimos,
 * imposibles de distinguir de un vistazo». El encargo de esta ola lo dice
 * explícito: medir cuántos caben CON rótulo y elegir lo que maximice
 * «comandos RECONOCIBLES», no «comandos visibles» — 71 iconos mudos no es
 * una victoria si nadie sabe qué hacen sin pasar el ratón por los 71.
 *
 * Medido con `planCadRibbonLayout` sobre el registro real de Inicio (ver
 * `ribbon-layout.spec.ts`, bloque «ESCALÓN DENSO CON RÓTULO»), con `rows: 3`
 * fijo (el alto del panel no puede moverse) y variando sólo el ancho del
 * botón pequeño y `maxColumns`:
 *
 *   ancho | maxColumns | visibles a 1346 px | visibles a 1908 px
 *      64 |          6 |                  31 |                  58
 *      72 |          4 |                  28 |                  53
 *      80 |          4 |                  25 |                  45
 *      88 |          3 |                  25 |                  44
 *     112 |          2 |                  19 |                  35  (el disperso de siempre)
 *
 * 64 px da el conteo más alto pero dentro del botón sólo caben ~5 caracteres
 * antes de recortar (`icono 16 + gap 4 + padding 8` de presupuesto fijo, ver
 * `CadRibbonButton.tsx`): «Simetrí…» se reconoce, «Compen…» ya no tanto. A 80
 * px quedan ~8 caracteres — «Compensa…», «Rectáng…» — que es donde un rótulo
 * recortado sigue leyéndose como palabra y no como sílaba suelta. El precio
 * es 25 comandos con rótulo de verdad en vez de 71 mudos: MENOS botones,
 * TODOS reconocibles, que es exactamente el criterio del encargo.
 *
 * `maxColumns` baja de 8 a 4: con el botón cuatro veces más ancho que el de
 * la Ola 1, ocho columnas ya no caben en el presupuesto de ningún panel real
 * de Inicio (el más largo, Dibujo, necesita como mucho 4) y dejarlo en 8 no
 * ganaba ni una columna más — sólo quedaba como techo sin uso.
 */
export const CAD_RIBBON_DENSE_BREAKPOINT = 1920;

/** Las mismas métricas, con el botón pequeño encogido pero CON rótulo (recortado si no cabe). */
export const CAD_RIBBON_DENSE_METRICS = {
  ...CAD_RIBBON_METRICS,
  /** Botón pequeño denso: icono + rótulo recortado, `w-20` (Ola 6 «cinta legible»). */
  small: 80,
  /** Con el botón más angosto que el disperso, caben hasta cuatro columnas. */
  maxColumns: 4,
} as const;

/** Qué juego de métricas usar para un ancho de tira dado. */
export function cadRibbonMetricsFor(availableWidth: number): CadRibbonMetrics {
  return availableWidth < CAD_RIBBON_DENSE_BREAKPOINT ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS;
}

export type CadRibbonPanelState = "expanded" | "reduced" | "collapsed";

export interface CadRibbonPanelLayout {
  state: CadRibbonPanelState;
  /** Columnas de botones pequeños a la vista (0 si está reducido o plegado). */
  columns: number;
  /**
   * Escalón denso vigente para este plan (mismo valor en todos los paneles
   * de la pestaña: depende del ancho de la tira, no del panel). Ausente
   * (`undefined`) en un layout construido a mano fuera de `planCadRibbonLayout`
   * se trata como `false` — el escalón disperso de siempre.
   */
  dense?: boolean;
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
export function cadRibbonPanelNaturalColumns(panel: CadRibbonPanel, dense = false): number {
  const { smalls } = splitCadRibbonPanel(panel);
  const m = dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS;
  return Math.min(m.maxColumns, Math.ceil(smalls.length / m.rows));
}

/** Qué comandos se ven en la cinta y cuáles van al desplegable, dado un plan. */
export function cadRibbonPanelSplit(
  panel: CadRibbonPanel,
  layout: CadRibbonPanelLayout,
): { large: CadRibbonCommand[]; small: CadRibbonCommand[]; flyout: CadRibbonCommand[] } {
  const { primaries, smalls } = splitCadRibbonPanel(panel);
  if (layout.state === "collapsed") return { large: [], small: [], flyout: [...panel.commands] };
  const rows = (layout.dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS).rows;
  const visible = layout.state === "reduced" ? 0 : layout.columns * rows;
  return { large: primaries, small: smalls.slice(0, visible), flyout: smalls.slice(visible) };
}

/** Ancho del panel en píxeles para un plan, con las constantes de arriba. */
export function cadRibbonPanelWidth(panel: CadRibbonPanel, layout: CadRibbonPanelLayout): number {
  const m = layout.dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS;
  if (layout.state === "collapsed") return m.collapsed;
  const { primaries } = splitCadRibbonPanel(panel);
  const primaryCols = primaries.length > m.maxColumns ? m.maxColumns : primaries.length;
  const largeBlock = primaryCols * m.large + Math.max(0, primaryCols - 1) * m.gap;
  const columns = layout.state === "reduced" ? 0 : layout.columns;
  const smallBlock = columns > 0 ? columns * m.small + (columns - 1) * m.gap + m.gap : 0;
  return m.panelPad + largeBlock + smallBlock;
}

export function cadRibbonTabWidth(tab: CadRibbonTab, plan: ReadonlyMap<string, CadRibbonPanelLayout>): number {
  return tab.panels.reduce((total, panel) => total + cadRibbonPanelWidth(panel, plan.get(panel.label)!), 0);
}

/**
 * Quita UNA columna, de una en una, dando la vuelta al orden tantas veces
 * como haga falta — no un salto directo a una sola columna. Con el escalón
 * disperso (como mucho dos columnas) las dos formas coinciden; con el denso
 * (hasta ocho) un salto directo dejaría al último panel del orden con su
 * ancho NATURAL entero mientras los demás ya se quedaron en una columna —
 * un panel con muchos botones y el resto casi vacíos. Repartiendo el recorte
 * en pasos de una columna, entre TODOS los paneles del orden, el total de
 * botones a la vista para el mismo ancho es mayor y ningún panel acapara el
 * ahorro de los demás.
 */
function reduceColumnsEvenly(
  order: readonly string[],
  plan: Map<string, CadRibbonPanelLayout>,
  fits: () => boolean,
): boolean {
  let shrunkAny = true;
  while (shrunkAny) {
    shrunkAny = false;
    for (const label of order) {
      const layout = plan.get(label)!;
      if (layout.state !== "expanded" || layout.columns <= 1) continue;
      plan.set(label, { ...layout, columns: layout.columns - 1 });
      shrunkAny = true;
      if (fits()) return true;
    }
  }
  return fits();
}

/**
 * EL PLAN: qué estado tiene cada panel para que la pestaña quepa en
 * `availableWidth`. Cuatro pasadas, en este orden, y se para en cuanto cabe:
 *
 *   1. Los paneles del orden de plegado pierden columnas de pequeños de una
 *      en una (repartido entre todos, no de golpe uno solo a la vez).
 *   2. Los mismos se quedan sólo con sus botones grandes (reducidos), y
 *   3. se pliegan a un botón.
 *   4. Los paneles protegidos (los que no están en el orden: Dibujo,
 *      Modificar, Capas…) pierden columnas igual, del último al primero, y
 *      si ni así cabe, se reducen a sus botones grandes, del último al primero.
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
  const dense = availableWidth < CAD_RIBBON_DENSE_BREAKPOINT;
  const metrics = dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS;
  const plan = new Map<string, CadRibbonPanelLayout>();
  for (const panel of tab.panels) {
    plan.set(
      panel.label,
      manuallyCollapsed.has(panel.label)
        ? { state: "collapsed", columns: 0, dense }
        : { state: "expanded", columns: cadRibbonPanelNaturalColumns(panel, dense), dense },
    );
  }
  const budget = availableWidth - metrics.safety;
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
  // Un panel SIN botón grande (Ola 1 «cinta»: Grupos, Utilidades,
  // Portapapeles) ya cuesta lo mínimo (17 px, ni un botón) en "reduced": no
  // muestra nada, pero tampoco nada que mostrar tiene "collapsed" (77 px, el
  // botón-icono del panel) — pasar de uno a otro no gana ni un comando más a
  // la vista y sólo gasta presupuesto que un panel PROTEGIDO necesita más.
  // "collapsed" queda para los paneles que sí tienen un primario que esconder.
  const panelByLabel = new Map(tab.panels.map((panel) => [panel.label, panel]));
  const hasPrimary = (label: string) => splitCadRibbonPanel(panelByLabel.get(label)!).primaries.length > 0;

  if (reduceColumnsEvenly(collapsible, plan, fits)) return plan;
  for (const label of collapsible) {
    const layout = plan.get(label)!;
    if (layout.state === "expanded") plan.set(label, { ...layout, state: "reduced", columns: 0 });
    if (fits()) return plan;
  }
  for (const label of collapsible) {
    const layout = plan.get(label)!;
    if (layout.state !== "collapsed" && hasPrimary(label)) plan.set(label, { ...layout, state: "collapsed", columns: 0 });
    if (fits()) return plan;
  }

  if (reduceColumnsEvenly(protectedPanels, plan, fits)) return plan;
  for (const label of protectedPanels) {
    const layout = plan.get(label)!;
    if (layout.state === "expanded") plan.set(label, { ...layout, state: "reduced", columns: 0 });
    if (fits()) return plan;
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
