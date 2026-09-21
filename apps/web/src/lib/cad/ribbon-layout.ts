/**
 * Distribuye los paneles según el ancho disponible, manteniendo los comandos
 * frecuentes a la vista. El resto sigue accesible en desplegables.
 *
 * Las métricas se comparten con los componentes. Los botones pequeños tienen
 * un mínimo de 80/112 px y crecen según el rótulo; cada columna ocupa el ancho
 * de su botón mayor. Tras plegar paneles se recuperan comandos en los huecos
 * disponibles, respetando siempre los plegados manuales.
 *
 * Golden 214 comprueba en DOM que no hay desplazamiento ni texto recortado;
 * golden 223 exige al menos 24 comandos visibles en Inicio a 1366 px.
 */
import type { CadRibbonCommand, CadRibbonPanel, CadRibbonTab } from "./ribbon";
import {
  CAD_RIBBON_PANEL_COLLAPSE_ORDER,
  CAD_RIBBON_PROTECTED_REDUCE_ORDER,
} from "./ribbon-order";

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
  /** Ancho mínimo del botón pequeño en el escalón disperso. */
  small: 112,
  /** `gap-0.5` entre botones, columnas y bloques. */
  gap: 2,
  /** Panel: `px-1` (8) + `border-r` (1). */
  panelPad: 9,
  /** Panel plegado a un botón: `px-0.5` (4) + `w-[5rem]` (80) + `border-r` (1). */
  collapsed: 85,
  /** Filas de botones pequeños: `grid-rows-3`. */
  rows: 3,
  /** Columnas de botones pequeños como mucho, desplegado del todo. */
  maxColumns: 2,
  /** Holgura frente a redondeos de subpíxel entre navegadores. */
  safety: 12,
} as const;

/**
 * Por debajo de 1920 px se usan hasta cuatro columnas con un mínimo de 80 px
 * por botón pequeño. Desde ese ancho el mínimo es 112 px y el máximo son dos
 * columnas. Ambos conservan tres filas y el mismo alto de cinta.
 *
 * El mínimo no recorta el texto: cadRibbonSmallWidth reserva espacio para el
 * rótulo completo, y el plan utiliza ese mismo ancho. El objetivo es mostrar
 * comandos reconocibles sin esconder el nombre detrás de una elipsis.
 */
export const CAD_RIBBON_DENSE_BREAKPOINT = 1920;

/** Mínimos del escalón denso; el ancho crece para conservar el rótulo. */
export const CAD_RIBBON_DENSE_METRICS = {
  ...CAD_RIBBON_METRICS,
  /** Ancho mínimo del botón pequeño denso: icono y rótulo completo. */
  small: 80,
  /** Con el botón más angosto que el disperso, caben hasta cuatro columnas. */
  maxColumns: 4,
} as const;

/** Qué juego de métricas usar para un ancho de tira dado. */
export function cadRibbonMetricsFor(availableWidth: number): CadRibbonMetrics {
  return availableWidth < CAD_RIBBON_DENSE_BREAKPOINT
    ? CAD_RIBBON_DENSE_METRICS
    : CAD_RIBBON_METRICS;
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
export function cadRibbonPanelNaturalColumns(
  panel: CadRibbonPanel,
  dense = false,
): number {
  const { smalls } = splitCadRibbonPanel(panel);
  const m = dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS;
  return Math.min(m.maxColumns, Math.ceil(smalls.length / m.rows));
}

/** Qué comandos se ven en la cinta y cuáles van al desplegable, dado un plan. */
export function cadRibbonPanelSplit(
  panel: CadRibbonPanel,
  layout: CadRibbonPanelLayout,
): {
  large: CadRibbonCommand[];
  small: CadRibbonCommand[];
  flyout: CadRibbonCommand[];
} {
  const { primaries, smalls } = splitCadRibbonPanel(panel);
  if (layout.state === "collapsed")
    return { large: [], small: [], flyout: [...panel.commands] };
  const rows = (layout.dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS)
    .rows;
  const visible = layout.state === "reduced" ? 0 : layout.columns * rows;
  return {
    large: primaries,
    small: smalls.slice(0, visible),
    flyout: smalls.slice(visible),
  };
}

/**
 * ANCHO ESTIMADO DEL RÓTULO DE UN PANEL, en píxeles — SIN navegador.
 *
 * ## Por qué es una ESTIMACIÓN y no una medida
 *
 * `ribbon-layout.ts` corre en Node (`npx tsx ribbon-layout.spec.ts`, sin DOM), así que no hay
 * `getBoundingClientRect` que consultar: el ancho de un rótulo se aproxima contando caracteres.
 *
 * ## De dónde salen los números
 *
 * El rótulo pinta con `.type-micro` (`globals.css`): Inter, 11 px (`0.6875rem`), peso 500.
 * `ctx.measureText` en un `<canvas>` con esa MISMA fuente (navegador real, sin depender de ninguna
 * caja del DOM) dio el ancho exacto de los 43 rótulos de panel que existen hoy en las ocho
 * pestañas —de «SCU» (23,3 px) a «Normas y reparación» (110,0 px)— con un avance de 4,9 a 7,8 px
 * por carácter según las letras (más alto en palabras cortas: «SCU», 3 letras, pesa 7,8 px/car
 * sólo por el redondeo fijo). Ninguna recta `caracteres × avance` pasa nunca por debajo de los 43
 * puntos a la vez —se probó por barrido—, así que `CAD_RIBBON_LABEL_PX_PER_CHAR` (5,6) y
 * `CAD_RIBBON_LABEL_MARGIN` (8) son la pareja con el margen más ajustado (0,7 px en el peor caso,
 * «Encuadre y zoom») que SIGUE sin quedar corta en ninguno de los 43: nunca por debajo del ancho
 * real, que es lo que importa —subestimar el rótulo es lo que dejaba la tira 132 px corta a
 * 1280 px (ver el comentario de `CAD_RIBBON_FOOTER_PADDING_WITH_FLYOUT`, más abajo)—, y tampoco
 * tan generoso como para plegar de más un panel que en realidad cabía. Quien verifica que la cota
 * sigue siendo válida —para estos 43 rótulos y para cualquiera que se añada— es el golden 214
 * (`e2e/golden/214-cad-cinta-cabe-1366.spec.ts`) en un navegador real: mide `scrollWidth` contra
 * `clientWidth` de la tira Y de cada rótulo de panel.
 */
export const CAD_RIBBON_LABEL_PX_PER_CHAR = 5.6;
export const CAD_RIBBON_LABEL_MARGIN = 8;

export function cadRibbonLabelWidth(label: string): number {
  return (
    Math.ceil(label.length * CAD_RIBBON_LABEL_PX_PER_CHAR) +
    CAD_RIBBON_LABEL_MARGIN
  );
}

/** El rótulo completo manda sobre el mínimo del botón pequeño. */
export function cadRibbonSmallWidth(
  command: CadRibbonCommand,
  dense: boolean,
): number {
  const minimum = (dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS).small;
  // Icono 16 + separación 4 + padding de 4/8; margen adicional para el avance
  // de letras anchas. El DOM se comprueba en golden 214, sin tolerar elipsis.
  return Math.max(
    minimum,
    cadRibbonLabelWidth(command.label) + (dense ? 30 : 34),
  );
}

/**
 * CUÁNTO RÓTULO CABE en un panel PLEGADO sin recortarse con puntos suspensivos. El botón plegado
 * mide `w-[5rem]` (80 px, `CAD_RIBBON_METRICS.collapsed`) con `px-0.5` (4 px) de relleno
 * horizontal alrededor del rótulo (`CadRibbonPanelFlyout.tsx`, variante "panel"): 76 px libres,
 * medido en un navegador real (`rotulo.clientWidth` de «Bloque» y «Propiedades» plegados). Un
 * panel cuyo rótulo no quepa ahí NO puede plegarse a un botón: `truncate` lo recortaría con «…», y
 * el golden 214 exige `scrollWidth <= clientWidth` en cada rótulo de panel —esconder el nombre del
 * panel no es una opción—. `planCadRibbonLayout` comprueba esto ANTES de plegar cualquier panel
 * del orden de plegado.
 */
export const CAD_RIBBON_COLLAPSED_LABEL_BUDGET = 76;

export function cadRibbonLabelFitsCollapsed(label: string): boolean {
  return cadRibbonLabelWidth(label) <= CAD_RIBBON_COLLAPSED_LABEL_BUDGET;
}

/**
 * EL PIE DE UN PANEL NO PLEGADO (el rótulo, bajo la fila de botones) mide más que sólo el texto —
 * y `cadRibbonPanelWidth` lo ignoraba entero: sólo contaba la fila de botones, nunca el pie. Un
 * panel "reduced" (Grupos, Utilidades, Portapapeles en Inicio: sin botón grande) no PINTA fila de
 * botones — el pie es lo ÚNICO que hay — así que el ancho previsto caía a los 17 px del borde y el
 * relleno, cuando el pie real medía hasta 92 px (Utilidades) o 109 (Portapapeles): 54 px que
 * faltaban en la cuenta, la mitad de los 132 px de más que medía la tira a 1280 px.
 *
 *   · Si al panel le queda algo sin enseñar —el desplegable no está vacío—, el pie es un BOTÓN
 *     (`CadRibbonPanelFlyout`, variante "title"): `px-1` (8) + `gap-0.5` (2) + la flecha
 *     `h-3 w-3` (12) alrededor del rótulo. Un panel "reduced" SIEMPRE tiene algo en el desplegable
 *     (si no tuviera comandos, el panel no existiría), así que su pie SIEMPRE lleva flecha.
 *   · Si el panel enseña TODO (desplegable vacío) el pie es sólo el `<span>` con `px-1` (8), sin
 *     flecha.
 */
export const CAD_RIBBON_FOOTER_PADDING_WITH_FLYOUT = 22; // px-1 (8) + gap-0.5 (2) + flecha h-3 w-3 (12)
export const CAD_RIBBON_FOOTER_PADDING_PLAIN = 8; // px-1 (8), sin flecha

/** Ancho del panel en píxeles para un plan, con las constantes de arriba. */
export function cadRibbonPanelWidth(
  panel: CadRibbonPanel,
  layout: CadRibbonPanelLayout,
): number {
  const m = layout.dense ? CAD_RIBBON_DENSE_METRICS : CAD_RIBBON_METRICS;
  // Plegado: un único botón de ancho FIJO (`w-[5rem]`, con el rótulo recortado por `truncate`
  // si hiciera falta — de ahí que este golden mida `scrollWidth` contra `clientWidth` de cada
  // rótulo, para que un panel con un nombre demasiado largo no se cuele mudo). El ancho no
  // depende del rótulo, así que aquí no hace falta estimarlo.
  if (layout.state === "collapsed") return m.collapsed;
  const { primaries, smalls } = splitCadRibbonPanel(panel);
  const primaryCols =
    primaries.length > m.maxColumns ? m.maxColumns : primaries.length;
  const largeBlock =
    primaryCols * m.large + Math.max(0, primaryCols - 1) * m.gap;
  const columns = layout.state === "reduced" ? 0 : layout.columns;
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(
      m.small,
      ...smalls
        .slice(column * m.rows, (column + 1) * m.rows)
        .map((command) => cadRibbonSmallWidth(command, !!layout.dense)),
    ),
  );
  const smallBlock =
    columns > 0
      ? columnWidths.reduce((sum, width) => sum + width, 0) +
        (columns - 1) * m.gap +
        m.gap
      : 0;
  const rowWidth = m.panelPad + largeBlock + smallBlock;

  // El pie va DEBAJO de la fila (columna, no lado a lado): el panel mide lo que pida el más ancho
  // de los dos, nunca la suma.
  const shownSmalls = columns * m.rows;
  const hasFlyout = smalls.length > shownSmalls;
  const footerWidth =
    m.panelPad +
    cadRibbonLabelWidth(panel.label) +
    (hasFlyout
      ? CAD_RIBBON_FOOTER_PADDING_WITH_FLYOUT
      : CAD_RIBBON_FOOTER_PADDING_PLAIN);

  return Math.max(rowWidth, footerWidth);
}

export function cadRibbonTabWidth(
  tab: CadRibbonTab,
  plan: ReadonlyMap<string, CadRibbonPanelLayout>,
): number {
  return tab.panels.reduce(
    (total, panel) =>
      total + cadRibbonPanelWidth(panel, plan.get(panel.label)!),
    0,
  );
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

/** Recupera comandos que caben en el hueco dejado por el último plegado. */
function restoreVisibleCommands(
  tab: CadRibbonTab,
  plan: Map<string, CadRibbonPanelLayout>,
  budget: number,
  manuallyCollapsed: ReadonlySet<string>,
): Map<string, CadRibbonPanelLayout> {
  const visible = (panel: CadRibbonPanel, layout: CadRibbonPanelLayout) => {
    const split = cadRibbonPanelSplit(panel, layout);
    return split.large.length + split.small.length;
  };
  while (true) {
    const width = cadRibbonTabWidth(tab, plan);
    let best:
      | { label: string; layout: CadRibbonPanelLayout; value: number }
      | undefined;
    for (const panel of tab.panels) {
      if (manuallyCollapsed.has(panel.label)) continue;
      const current = plan.get(panel.label)!;
      const natural = cadRibbonPanelNaturalColumns(panel, current.dense);
      const candidates: CadRibbonPanelLayout[] = [];
      if (current.state === "collapsed")
        candidates.push({ ...current, state: "reduced", columns: 0 });
      if (current.state !== "expanded" && natural > 0)
        candidates.push({ ...current, state: "expanded", columns: 1 });
      if (current.state === "expanded" && current.columns < natural)
        candidates.push({ ...current, columns: current.columns + 1 });
      for (const candidate of candidates) {
        const gain = visible(panel, candidate) - visible(panel, current);
        const cost =
          cadRibbonPanelWidth(panel, candidate) -
          cadRibbonPanelWidth(panel, current);
        if (gain <= 0 || width + cost > budget) continue;
        const value = gain / Math.max(1, cost);
        if (!best || value > best.value)
          best = { label: panel.label, layout: candidate, value };
      }
    }
    if (!best) return plan;
    plan.set(best.label, best.layout);
  }
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
        : {
            state: "expanded",
            columns: cadRibbonPanelNaturalColumns(panel, dense),
            dense,
          },
    );
  }
  const budget = availableWidth - metrics.safety;
  const fits = () => cadRibbonTabWidth(tab, plan) <= budget;
  const finish = () =>
    restoreVisibleCommands(tab, plan, budget, manuallyCollapsed);
  if (fits()) return finish();

  const labels = new Set(tab.panels.map((panel) => panel.label));
  const collapsible = CAD_RIBBON_PANEL_COLLAPSE_ORDER[tab.id].filter(
    (label) => labels.has(label) && !manuallyCollapsed.has(label),
  );
  // Del último al primero, SALVO donde el producto haya dicho otra cosa
  // (`CAD_RIBBON_PROTECTED_REDUCE_ORDER`): en Inicio, Anotación cede antes que
  // Capas. Lo declarado manda y lo no declarado va detrás, en el orden inverso
  // de siempre, así que una pestaña sin entrada se comporta igual que antes.
  const orden = CAD_RIBBON_PROTECTED_REDUCE_ORDER[tab.id];
  const protectedPanels = tab.panels
    .map((panel) => panel.label)
    .filter(
      (label) => !collapsible.includes(label) && !manuallyCollapsed.has(label),
    )
    .reverse()
    .sort((a, b) => {
      if (!orden) return 0;
      const ia = orden.indexOf(a);
      const ib = orden.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  // El coste incluye el pie. Sólo se pliegan paneles cuyo rótulo cabe en
  // los 76 px útiles del botón; la recuperación posterior aprovecha huecos
  // sin contradecir los plegados solicitados por el usuario.
  if (reduceColumnsEvenly(collapsible, plan, fits)) return finish();
  for (const label of collapsible) {
    const layout = plan.get(label)!;
    if (layout.state === "expanded")
      plan.set(label, { ...layout, state: "reduced", columns: 0 });
    if (fits()) return finish();
  }
  for (const label of collapsible) {
    if (!cadRibbonLabelFitsCollapsed(label)) continue;
    const layout = plan.get(label)!;
    if (layout.state !== "collapsed")
      plan.set(label, { ...layout, state: "collapsed", columns: 0 });
    if (fits()) return finish();
  }

  if (reduceColumnsEvenly(protectedPanels, plan, fits)) return finish();
  for (const label of protectedPanels) {
    const layout = plan.get(label)!;
    if (layout.state === "expanded")
      plan.set(label, { ...layout, state: "reduced", columns: 0 });
    if (fits()) return finish();
  }
  return plan;
}

/** Los nombres de comando con botón A LA VISTA (sin abrir ningún desplegable). */
export function cadRibbonVisibleNames(
  tab: CadRibbonTab,
  plan: ReadonlyMap<string, CadRibbonPanelLayout>,
): Set<string> {
  const visible = new Set<string>();
  for (const panel of tab.panels) {
    const split = cadRibbonPanelSplit(panel, plan.get(panel.label)!);
    for (const command of [...split.large, ...split.small])
      visible.add(command.name);
  }
  return visible;
}
