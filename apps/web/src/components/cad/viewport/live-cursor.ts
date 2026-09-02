/**
 * Cursor vivo del viewport: marcador de captura, entrada dinámica y menú de
 * palabras clave — todo en DOM imperativo, fuera de React.
 *
 * ## Por qué no es un componente
 *
 * Esto se mueve con el ratón. Un `setState` por `pointermove` es un render del
 * árbol entero por cada muestra del ratón, y el árbol de aquí abajo es el JSX
 * de 6.000 líneas del editor: a 60 Hz eso no es lento, es inutilizable. La
 * regla que impone el producto —«el marcador del snap y su tooltip tienen que
 * seguir al cursor a 60 FPS sin pasar por React en cada movimiento»— se cumple
 * escribiendo `style.transform` sobre nodos ya creados. Cero reconciliación,
 * cero asignaciones por evento.
 *
 * Y de paso no gasta ni un `useState` del presupuesto del monolito.
 *
 * ## Qué hay dentro
 *
 * - **Marcador de captura**: la insignia con el modo OSNAP resuelto. Los
 *   catorce modos ya los calcula `snap-engine.ts`; aquí sólo se muestran.
 * - **Entrada dinámica**: las cajas de distancia y ángulo junto al cursor, con
 *   Tab para saltar entre ellas, como en AutoCAD. Escribir en una CONGELA su
 *   valor: si el cursor siguiera sobrescribiendo lo tecleado, no se podría
 *   teclear nada.
 * - **Menú contextual**: las palabras clave del paso actual, que el motor ya
 *   expone en su `prompt`. Se abre con el botón derecho.
 */
import type { SnapType } from "@/lib/cad/snap-engine";
import type { CadKeyword } from "@/lib/cad/engine/command-types";
import { CAD_OSNAP_HUD_LABELS } from "@/components/cad/palettes/draft-settings-host";

export type CadLiveCursorField = "distance" | "angle";

export interface CadLiveCursorCallbacks {
  /** Enter en una caja: distancia y/o ángulo confirmados por teclado. */
  commit(values: { distance: number | null; angle: number | null }): void;
  /** Una palabra clave elegida en el menú contextual. */
  keyword(shortcut: string): void;
  /** Esc dentro del cursor vivo. */
  cancel(): void;
}

/** Un nodo con estilo, creado de una vez para no repetir seis líneas. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  testId?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (testId) node.dataset.testid = testId;
  return node;
}

const ROOT_CLASS =
  "pointer-events-none absolute left-0 top-0 z-30 flex items-start gap-1.5 will-change-transform";
const BADGE_CLASS =
  "rounded bg-cyan-500/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-950 shadow";
// `pointer-events-none`: los campos siguen al puntero y NUNCA deben recibirlo.
// Medido en el golden 46: el cuadro se colocaba en la última muestra de
// `pointermove`, el siguiente salto del ratón caía ENCIMA del campo «ángulo»,
// y desde ahí el lienzo dejaba de ver `pointermove`, el clic y el `contextmenu`
// —el cursor vivo se quedaba clavado y el botón derecho no abría el menú de
// palabras clave—. Se teclea en ellos por Tab (`focusField`), como en la
// entrada dinámica de AutoCAD, no con el ratón.
const FIELD_CLASS =
  "pointer-events-none w-20 rounded border border-cyan-300/60 bg-gray-950/95 px-1 py-0.5 text-right font-mono text-[11px] text-cyan-100 outline-none focus:border-cyan-200";
const MENU_CLASS =
  "pointer-events-auto absolute z-40 flex min-w-32 flex-col rounded-md border border-white/15 bg-[#0b1020]/97 p-1 text-[12px] shadow-xl backdrop-blur";
const MENU_ITEM_CLASS =
  "rounded px-2 py-1 text-left font-mono text-cyan-200 transition-colors hover:bg-white/10";

/**
 * Dónde se dibuja la insignia respecto del punto que se está precisando.
 *
 * Con RATÓN, 14 px abajo a la derecha: la flecha del cursor mide eso y la
 * insignia queda justo fuera de ella.
 *
 * Con DEDO no vale. Un contacto adulto ronda los 12 px de radio y la mano que
 * lo sostiene tapa todo lo que hay debajo y a la derecha; la sonda midió la
 * insignia a 21 px del contacto, es decir DENTRO de lo que el propio dedo
 * oculta. Se va ARRIBA y a la derecha, a ~40 px: fuera de la huella y fuera de
 * la mano. Lo que hay que poder mirar mientras se apunta no puede estar debajo
 * de lo que impide mirar.
 */
const POINTER_BADGE_OFFSET = {
  mouse: { x: 14, y: 14 },
  touch: { x: 22, y: -34 },
} as const;

/** Qué aparato está apuntando. Cambia dónde se dibuja lo que hay que mirar. */
export type CadPointerKind = keyof typeof POINTER_BADGE_OFFSET;

export class CadLiveCursorOverlay {
  private readonly root: HTMLDivElement;
  private readonly badge: HTMLSpanElement;
  private readonly distance: HTMLInputElement;
  private readonly angle: HTMLInputElement;
  private readonly fields: HTMLDivElement;
  private readonly menu: HTMLDivElement;
  /**
   * Campos que el usuario está escribiendo. Mientras uno esté congelado, el
   * cursor deja de sobrescribirlo: si no, teclear `1500` sería imposible porque
   * cada pixel de movimiento borraría lo escrito.
   */
  private readonly frozen = new Set<CadLiveCursorField>();
  private pointerKind: CadPointerKind = "mouse";
  private disposed = false;

  /**
   * Espejo del modo de captura en el aviso superior del viewport.
   *
   * El HUD que ya existía imprimía el modo resuelto junto a la distancia, y esa
   * lectura es la que un operador usa para confiar en dónde va a caer el punto.
   * Con el puntero enrutado al motor, quien lo conoce es este cursor vivo, así
   * que lo escribe también ahí — imperativamente, sin render.
   */
  private mirror: (() => HTMLElement | null) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: CadLiveCursorCallbacks,
  ) {
    this.root = element("div", ROOT_CLASS, "cad-live-cursor");
    this.root.style.transform = "translate3d(-9999px, -9999px, 0)";
    this.badge = element("span", BADGE_CLASS, "cad-live-snap");
    this.badge.hidden = true;
    this.fields = element("div", "flex items-center gap-1", "cad-live-dynamic-input");
    this.fields.hidden = true;
    this.distance = element("input", FIELD_CLASS, "cad-live-distance");
    this.distance.setAttribute("aria-label", "Distancia");
    this.distance.placeholder = "dist";
    this.angle = element("input", FIELD_CLASS, "cad-live-angle");
    this.angle.setAttribute("aria-label", "Ángulo");
    this.angle.placeholder = "áng";
    this.fields.append(this.distance, this.angle);
    this.root.append(this.badge, this.fields);
    this.menu = element("div", MENU_CLASS, "cad-pointer-menu");
    this.menu.hidden = true;
    this.container.append(this.root, this.menu);

    for (const [field, input] of [
      ["distance", this.distance],
      ["angle", this.angle],
    ] as const) {
      input.addEventListener("keydown", (event) => this.onFieldKey(field, event));
      input.addEventListener("input", () => {
        if (input.value.trim()) this.frozen.add(field);
        else this.frozen.delete(field);
      });
    }
  }

  /** Conecta el espejo del aviso superior. */
  setMirror(mirror: (() => HTMLElement | null) | null): void {
    this.mirror = mirror;
  }

  /** Coloca el cursor vivo. Es lo ÚNICO que corre en cada `pointermove`. */
  moveTo(x: number, y: number): void {
    if (this.disposed) return;
    // Se desplaza para que la insignia no quede debajo de lo que apunta, que es
    // justo lo que hay que poder mirar mientras se dibuja. Cuánto, lo decide el
    // aparato: un dedo tapa mucho más que una flecha.
    const offset = POINTER_BADGE_OFFSET[this.pointerKind];
    this.root.style.transform = `translate3d(${Math.round(x) + offset.x}px, ${Math.round(y) + offset.y}px, 0)`;
  }

  /**
   * Declara con qué se está apuntando. Lo llama el enrutador en cada muestra,
   * porque en una tableta con teclado y lápiz el aparato cambia sin avisar.
   */
  setPointerKind(kind: CadPointerKind): void {
    this.pointerKind = kind;
  }

  setSnap(snap: SnapType | null): void {
    if (this.disposed) return;
    const label = snap ? CAD_OSNAP_HUD_LABELS[snap] : "";
    const mirror = this.mirror?.();
    if (mirror && mirror.textContent !== label)
      mirror.textContent = label ? ` · ${label}` : "";
    if (!snap) {
      this.badge.hidden = true;
      delete this.badge.dataset.snap;
      return;
    }
    this.badge.hidden = false;
    this.badge.dataset.snap = snap;
    this.badge.textContent = label;
  }

  /** Muestra u oculta las cajas de coordenadas. Ocultarlas descongela todo. */
  setDynamicVisible(visible: boolean): void {
    if (this.disposed) return;
    this.fields.hidden = !visible;
    if (!visible) this.clearFields();
  }

  get dynamicVisible(): boolean {
    return !this.fields.hidden;
  }

  /**
   * Refresca los valores medidos. Un campo congelado —el usuario lo está
   * escribiendo— no se toca.
   */
  setMeasurements(distance: number, angleDeg: number): void {
    if (this.disposed || this.fields.hidden) return;
    if (!this.frozen.has("distance"))
      this.distance.value = formatMeasurement(distance);
    if (!this.frozen.has("angle")) this.angle.value = formatMeasurement(angleDeg);
  }

  /** Da el foco a un campo. Tab alterna, como en la entrada dinámica de AutoCAD. */
  focusField(field: CadLiveCursorField): void {
    if (this.disposed || this.fields.hidden) return;
    const input = field === "distance" ? this.distance : this.angle;
    input.focus();
    input.select();
  }

  get focusedField(): CadLiveCursorField | null {
    if (document.activeElement === this.distance) return "distance";
    if (document.activeElement === this.angle) return "angle";
    return null;
  }

  /** true si el foco está dentro del cursor vivo: las teclas son suyas. */
  get owns(): boolean {
    return this.focusedField !== null;
  }

  openMenu(x: number, y: number, keywords: readonly CadKeyword[]): boolean {
    if (this.disposed || keywords.length === 0) return false;
    this.menu.replaceChildren();
    for (const option of keywords) {
      const item = element(
        "button",
        MENU_ITEM_CLASS,
        `cad-pointer-keyword-${option.keyword}`,
      );
      item.type = "button";
      item.textContent = option.label ?? option.keyword;
      item.title = `Atajo: ${option.shortcut.toUpperCase()}`;
      item.addEventListener("click", () => {
        this.closeMenu();
        this.callbacks.keyword(option.shortcut);
      });
      this.menu.append(item);
    }
    this.menu.hidden = false;
    this.menu.style.left = `${Math.round(x)}px`;
    this.menu.style.top = `${Math.round(y)}px`;
    return true;
  }

  closeMenu(): void {
    if (this.disposed) return;
    this.menu.hidden = true;
    this.menu.replaceChildren();
  }

  get menuOpen(): boolean {
    return !this.menu.hidden;
  }

  /** Apaga todo: fin del comando, o el puntero salió del lienzo. */
  hide(): void {
    if (this.disposed) return;
    this.setSnap(null);
    this.setDynamicVisible(false);
    this.closeMenu();
    this.root.style.transform = "translate3d(-9999px, -9999px, 0)";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.remove();
    this.menu.remove();
  }

  private clearFields(): void {
    this.frozen.clear();
    this.distance.value = "";
    this.angle.value = "";
    if (this.owns) (document.activeElement as HTMLElement).blur();
  }

  private onFieldKey(field: CadLiveCursorField, event: KeyboardEvent): void {
    if (event.key === "Tab") {
      event.preventDefault();
      this.focusField(field === "distance" ? "angle" : "distance");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.clearFields();
      this.callbacks.cancel();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    // Se envían LOS DOS: un ángulo tecleado sin distancia es una restricción de
    // dirección, y una distancia sin ángulo es entrada directa de distancia.
    // Quien decide qué hacer con la pareja es el enrutador, no la caja.
    const values = {
      distance: parseMeasurement(this.distance.value),
      angle: this.frozen.has("angle") ? parseMeasurement(this.angle.value) : null,
    };
    this.clearFields();
    this.callbacks.commit(values);
  }
}

/** Tres decimales como mucho: más dígitos no caben ni se leen bajo el cursor. */
function formatMeasurement(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Math.abs(value) >= 100
    ? String(Math.round(value))
    : String(Math.round(value * 1_000) / 1_000);
}

export function parseMeasurement(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
