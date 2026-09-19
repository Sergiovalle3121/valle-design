"use client";

/**
 * DÓNDE SE PINTA el recorrido guiado: el hueco del muelle izquierdo.
 *
 * ## El defecto que esto arregla
 *
 * El acompañante vivía encima de la línea de comandos, flotando sobre el
 * lienzo, y la mitad de su caja caía ENCIMA de la paleta de herramientas. Para
 * no robarle el ratón al plano se pintaba con `pointer-events-none`, así que
 * pulsar la tarjeta activaba lo que había debajo: el usuario tocaba el texto
 * del recorrido y se le encendía «Pasillo», «Área» o «Ajustar todo». A
 * 1.366×768 paleta, recorrido y aviso de la demo se comían el 40 % del lienzo.
 *
 * El muelle izquierdo es la columna que no tapa nada: el lienzo empieza donde
 * termina él. Así que el recorrido se pinta ahí —por portal, sin moverlo de
 * `CadCommandLineDock`, que es quien tiene el anfitrión del motor— y sólo
 * vuelve a flotar cuando el muelle no está a la vista.
 *
 * ## Por qué un almacén y no una prop
 *
 * El muelle y la línea de comandos son hermanos lejanos dentro de
 * `Layout3DEditor.tsx`, cuyo presupuesto de líneas y `useState` sólo puede
 * BAJAR. Pasar un ref de uno a otro costaría líneas en el monolito; este módulo
 * los une por fuera, igual que `tour-host.ts` guarda el registro por fuera.
 *
 * ## «Registrado» no es «a la vista»
 *
 * El muelle se oculta por CSS —`max-[1100px]:hidden` en una tableta, `hidden`
 * en modo enfoque— sin desmontarse. Un hueco montado pero oculto se tragaría
 * el recorrido entero, así que lo que se publica es el hueco sólo mientras
 * tiene caja (`getClientRects()`), y un `ResizeObserver` avisa cuando la pierde
 * o la recupera. Sin hueco visible, el recorrido flota sobre la línea de
 * comandos, que es la única superficie que existe en todas las ventanas.
 */

/** Un hueco sin caja es un hueco que nadie ve: `display: none` no da rectángulos. */
function isShown(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

class CadTourSlot {
  private element: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  /** Lo publicado: el hueco SÓLO si se ve. `useSyncExternalStore` compara por identidad. */
  private target: HTMLElement | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HTMLElement | null => this.target;

  /** Para el render en servidor: allí no hay muelle. */
  getServerSnapshot = (): HTMLElement | null => null;

  /**
   * El `ref` del hueco. React lo llama con el elemento al montar y con `null`
   * al desmontar (muelle plegado a su riel, o apagado en el espacio de
   * trabajo). Es una propiedad flecha para que su identidad no cambie entre
   * renders: un `ref` nuevo en cada render desmontaría y montaría el hueco.
   */
  attach = (element: HTMLElement | null): void => {
    if (element === this.element) return;
    this.observer?.disconnect();
    this.observer = null;
    this.element = element;
    if (element && typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.refresh());
      this.observer.observe(element);
    }
    this.refresh();
  };

  /** Vuelve a medir. El observador la llama sola; queda pública para las specs. */
  refresh = (): void => {
    const next = this.element && isShown(this.element) ? this.element : null;
    if (next === this.target) return;
    this.target = next;
    for (const listener of this.listeners) listener();
  };
}

export const cadTourSlot = new CadTourSlot();

/**
 * El `ref` callback del hueco, suelto: el lint de React lee `algo.attach` en un
 * `ref` como si fuera leer `ref.current` durante el render. Es la misma función.
 */
export const attachCadTourSlot = cadTourSlot.attach;
