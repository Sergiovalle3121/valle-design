/**
 * LO QUE FLOTA SOBRE LA CINTA — el desplegable de un panel y la etiqueta de
 * ayuda de un botón — se pinta FUERA de la cinta, colocado a mano.
 *
 * ## Por qué existe este módulo
 *
 * Los dos colgaban de la tira de paneles con `absolute top-full`. La tira es
 * `overflow-x-auto` (la red para tabletas de `CadRibbon.tsx`) y, por CSS, un
 * `overflow-x` que no es `visible` convierte `overflow-y` en `auto`: la tira
 * de 77 px RECORTABA todo lo que colgaba por debajo. Medido en la vista previa
 * de la PR #209 a 1366×768: del desplegable de Modificar se veían 76 de 187 px
 * y de la etiqueta de «Línea» 7 de 65. Además el `focus()` del primer comando,
 * sin `preventScroll`, desplazaba la tira 78 px y la cinta se tapaba a sí
 * misma; y el desplegable, con `left-0 min-w-max` y seis filas, medía 1175 px
 * y se salía 82 px por la derecha.
 *
 * El arreglo: portal a `<body>` y `position: fixed` calculada desde el botón
 * que lo abre, recolocada para no salirse de la ventana. `position: fixed`
 * DENTRO de la cinta no basta: el `backdrop-blur` de `CadRibbon.tsx` hace de
 * la cinta el bloque contenedor de sus descendientes fijos.
 *
 * Todo lo que decide DÓNDE va es función pura sobre rectángulos; lo que toca
 * el DOM recibe objetos con la forma mínima que usa (no `HTMLElement`), para
 * que una spec de Node lo ejercite con dobles sin navegador.
 */

/** Rectángulo en coordenadas de la ventana (lo que da `getBoundingClientRect`). */
export interface CadRibbonFloatingRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CadRibbonFloatingOptions {
  /** `start`: alineado al borde izquierdo del ancla (el desplegable bajo su panel). `center`: centrado (la etiqueta de ayuda). */
  align?: "start" | "center";
  /** Separación entre el ancla y lo que flota, en px. */
  gap?: number;
  /** Distancia mínima a los bordes de la ventana, en px. */
  margin?: number;
}

export interface CadRibbonFloatingPlacement {
  left: number;
  top: number;
  /** Lo que mide como mucho: si el contenido es mayor, se desplaza por dentro. */
  maxWidth: number;
  maxHeight: number;
  /** Debajo del ancla o, si abajo no cabe y arriba sí, encima. */
  side: "bottom" | "top";
}

/** Separación a los bordes de la ventana: la misma holgura que `CAD_RIBBON_METRICS.safety` deja de sobra. */
export const CAD_RIBBON_FLOATING_MARGIN = 8;
/** El `mt-0.5` que tenía el desplegable bajo su panel. */
export const CAD_RIBBON_FLYOUT_GAP = 2;
/** El `mt-2` que tenía la etiqueta de ayuda bajo su botón. */
export const CAD_RIBBON_TOOLTIP_GAP = 8;
/**
 * Espera antes de mostrar la etiqueta al pasar el ratón. Sin ella, cruzar la
 * cinta camino del lienzo encendía una etiqueta por botón atravesado.
 */
export const CAD_RIBBON_TOOLTIP_DELAY_MS = 300;

/**
 * DÓNDE VA. Horizontal: donde pide `align`, empujado hacia dentro si se sale
 * por la derecha y, si ni así cabe, pegado al margen izquierdo con el ancho
 * de la ventana como tope. Vertical: debajo del ancla; encima sólo si abajo
 * no cabe y arriba hay más sitio; si no cabe en ninguno, en el lado con más
 * sitio y con ese alto como tope (el contenido se desplaza por dentro).
 */
export function placeCadRibbonFloating(
  anchor: CadRibbonFloatingRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  options: CadRibbonFloatingOptions = {},
): CadRibbonFloatingPlacement {
  const margin = options.margin ?? CAD_RIBBON_FLOATING_MARGIN;
  const gap = options.gap ?? CAD_RIBBON_FLYOUT_GAP;
  const maxWidth = Math.max(0, viewport.width - 2 * margin);
  const width = Math.min(size.width, maxWidth);
  const preferred =
    options.align === "center" ? anchor.left + (anchor.right - anchor.left - width) / 2 : anchor.left;
  const left = Math.max(margin, Math.min(preferred, viewport.width - margin - width));

  const below = Math.max(0, viewport.height - margin - (anchor.bottom + gap));
  const above = Math.max(0, anchor.top - gap - margin);
  if (size.height <= below || below >= above) {
    return { left: Math.round(left), top: Math.round(anchor.bottom + gap), maxWidth, maxHeight: Math.floor(below), side: "bottom" };
  }
  const height = Math.min(size.height, above);
  return { left: Math.round(left), top: Math.round(anchor.top - gap - height), maxWidth, maxHeight: Math.floor(above), side: "top" };
}

/**
 * LA FORMA DEL DESPLEGABLE: cuántas filas lleva su rejilla (que se llena por
 * columnas). Hasta seis comandos, una columna; a partir de ahí se abren
 * columnas de seis filas hasta un máximo de cuatro (y las que quepan en la
 * ventana), y lo que sobre alarga las columnas. Antes eran seis filas fijas:
 * los 32 comandos de Modificar hacían seis columnas y 1175 px de ancho; ahora
 * son cuatro columnas de ocho filas, 788 px, a 1366 y a 1280.
 */
export const CAD_RIBBON_FLYOUT_METRICS = {
  /** Fila de menú de `CadRibbonButton` (`size="menu"`): `w-48`. */
  column: 192,
  /** `gap-0.5` de la rejilla. */
  gap: 2,
  /** `p-1.5` (6 + 6) más el `border` (1 + 1) del desplegable. */
  chrome: 14,
  /** Filas antes de abrir otra columna: el `grid-rows-6` de siempre. */
  minRows: 6,
  /** Columnas como mucho: más ancho que esto es una pared de botones. */
  maxColumns: 4,
} as const;

export function cadRibbonFlyoutRows(
  count: number,
  viewportWidth: number,
  margin: number = CAD_RIBBON_FLOATING_MARGIN,
): number {
  if (count <= 0) return 1;
  const m = CAD_RIBBON_FLYOUT_METRICS;
  const usable = viewportWidth - 2 * margin - m.chrome;
  const byWidth = Math.floor((usable + m.gap) / (m.column + m.gap));
  const columns = Math.max(1, Math.min(m.maxColumns, byWidth, Math.ceil(count / m.minRows)));
  return Math.max(Math.min(count, m.minRows), Math.ceil(count / columns));
}

/* ── Lo que toca el DOM, con la forma mínima que usa ─────────────────────── */

/** Lo que flota: se mide y se le escriben `style` y `data-side`. */
export interface CadRibbonFloatingElement {
  style: { position: string; left: string; top: string; maxWidth: string; maxHeight: string; visibility: string };
  dataset: { [key: string]: string | undefined };
  getBoundingClientRect(): { width: number; height: number };
}

export interface CadRibbonFloatingAnchor {
  getBoundingClientRect(): CadRibbonFloatingRect;
}

export interface CadRibbonFloatingView {
  innerWidth: number;
  innerHeight: number;
}

/**
 * Coloca `floating` junto a `anchor`, dentro de `view`. Primero lo lleva a
 * (0,0) y le quita los topes para medir su tamaño natural (en la misma tarea,
 * sin pintar entre medias: no parpadea); luego escribe la posición, los topes
 * y lo hace visible. Nace con `invisible` para que el primer cuadro, aún sin
 * colocar, no se vea en la esquina.
 */
export function positionCadRibbonFloating(
  floating: CadRibbonFloatingElement,
  anchor: CadRibbonFloatingAnchor,
  view: CadRibbonFloatingView,
  options: CadRibbonFloatingOptions = {},
): CadRibbonFloatingPlacement {
  const style = floating.style;
  style.position = "fixed";
  style.left = "0px";
  style.top = "0px";
  style.maxWidth = "";
  style.maxHeight = "";
  const natural = floating.getBoundingClientRect();
  const placement = placeCadRibbonFloating(
    anchor.getBoundingClientRect(),
    { width: Math.ceil(natural.width), height: Math.ceil(natural.height) },
    { width: view.innerWidth, height: view.innerHeight },
    options,
  );
  style.left = `${placement.left}px`;
  style.top = `${placement.top}px`;
  style.maxWidth = `${placement.maxWidth}px`;
  style.maxHeight = `${placement.maxHeight}px`;
  style.visibility = "visible";
  floating.dataset.side = placement.side;
  return placement;
}

export interface CadRibbonContainer {
  contains(node: Node | null): boolean;
}

/** ¿El objetivo de un evento cae dentro de alguno de estos contenedores? */
export function isInsideCadRibbonFloating(
  target: EventTarget | null,
  containers: readonly (CadRibbonContainer | null | undefined)[],
): boolean {
  if (!target) return false;
  return containers.some((container) => container?.contains(target as Node) ?? false);
}

export interface CadRibbonQueryable {
  querySelector(selector: string): Element | null;
}

/** El selector del primer comando que se puede pulsar: uno deshabilitado no toma el foco. */
export const CAD_RIBBON_FIRST_COMMAND_SELECTOR = '[data-testid^="cad-ribbon-command-"]:not([disabled])';

/**
 * Enfoca el primer comando del desplegable SIN desplazar nada: sin
 * `preventScroll`, el navegador desplazaba la tira para «mostrar» el botón y
 * la cinta saltaba 78 px.
 */
export function focusFirstCadRibbonCommand(container: CadRibbonQueryable | null): Element | null {
  const first = container?.querySelector(CAD_RIBBON_FIRST_COMMAND_SELECTOR) ?? null;
  (first as HTMLElement | null)?.focus?.({ preventScroll: true });
  return first;
}

type CadRibbonListener = (event: Event) => void;

export interface CadRibbonListenable {
  addEventListener(type: string, listener: CadRibbonListener, options?: boolean): void;
  removeEventListener(type: string, listener: CadRibbonListener, options?: boolean): void;
}

/**
 * EL DESPLEGABLE ABIERTO: lo coloca, enfoca su primer comando sin desplazar
 * nada y se queda escuchando mientras esté abierto:
 *
 *   · un `pointerdown` fuera del panel y del desplegable lo cierra (se
 *     escucha en `pointerdown`, no en `click`, para que el mismo gesto que
 *     abre otro desplegable cierre éste sin paso intermedio);
 *   · si la ventana cambia de tamaño, se cierra: la cinta vuelve a repartir
 *     sus paneles DESPUÉS del evento (su `ResizeObserver` y un render), así
 *     que recolocarlo ahí usaría el panel y las columnas de antes;
 *   · si algo de fuera se desplaza (la tira en una tableta), se recoloca; el
 *     desplazamiento DENTRO del desplegable (cuando es más alto que la
 *     ventana) no, porque recolocar lo mide sin topes y lo devolvería arriba
 *     del todo.
 *
 * Devuelve la limpieza para el efecto que lo abrió.
 */
export function openCadRibbonFlyout({
  popover,
  anchor,
  root,
  view,
  doc,
  onDismiss,
}: {
  popover: CadRibbonFloatingElement & CadRibbonContainer & CadRibbonQueryable;
  anchor: CadRibbonFloatingAnchor;
  /** El envoltorio del disparador: pulsar ahí lo gestiona el propio disparador. */
  root: CadRibbonContainer | null;
  view: CadRibbonFloatingView & CadRibbonListenable;
  doc: CadRibbonListenable;
  onDismiss: () => void;
}): () => void {
  const place = () => {
    positionCadRibbonFloating(popover, anchor, view, { align: "start", gap: CAD_RIBBON_FLYOUT_GAP });
  };
  place();
  focusFirstCadRibbonCommand(popover);
  const onPointerDown = (event: Event) => {
    if (!isInsideCadRibbonFloating(event.target, [root, popover])) onDismiss();
  };
  const onScroll = (event: Event) => {
    if (isInsideCadRibbonFloating(event.target, [popover])) return;
    place();
  };
  const onResize = () => onDismiss();
  doc.addEventListener("pointerdown", onPointerDown);
  view.addEventListener("resize", onResize);
  view.addEventListener("scroll", onScroll, true);
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown);
    view.removeEventListener("resize", onResize);
    view.removeEventListener("scroll", onScroll, true);
  };
}

/** `:focus-visible`: el foco llegó con el teclado (o tras él), no con un clic. */
export function cadRibbonFocusIsVisible(target: { matches?(selector: string): boolean } | null): boolean {
  try {
    return target?.matches?.(":focus-visible") ?? false;
  } catch {
    // Un navegador sin `:focus-visible` lanza al parsear el selector: sin
    // etiqueta por foco, como mucho; nunca rompe el botón.
    return false;
  }
}
