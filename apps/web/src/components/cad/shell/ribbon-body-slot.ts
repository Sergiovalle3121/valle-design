"use client";

/**
 * DÓNDE SE PINTA el cuerpo de la cinta: la ranura `ribbon` de `CadShellFrame`.
 *
 * ## El problema
 *
 * `CadRibbon` es UN componente con estado compartido (pestaña activa,
 * plegado, ancho medido) entre su fila de pestañas (que vive en la ranura
 * `appBar`, 32 px) y su cuerpo — los grupos de botones (que vive en la
 * ranura `ribbon`, 0/72 px, la fila de ABAJO). Son dos ranuras de rejilla
 * DISTINTAS: un componente no puede devolver dos raíces en dos sitios del
 * árbol sin partirse en dos, y partirlo en dos costaría duplicar ese estado
 * o subirlo a `Layout3DEditor`, que es justo lo que su presupuesto de líneas
 * y `useState` prohíbe.
 *
 * ## La solución — igual que `onboarding/tour-slot.ts`
 *
 * `Layout3DEditor` monta un `<div>` vacío en la ranura `ribbon` y publica su
 * nodo aquí con un `ref` callback (`attachCadRibbonBodySlot`); `CadRibbon`
 * lee ese nodo con `useSyncExternalStore` y manda su cuerpo ahí por portal
 * (`react-dom`). Ningún `useState` nuevo en el monolito — el ref callback no
 * cuesta ninguno — y `CadRibbon` sigue siendo UN componente con UN estado.
 */

class CadRibbonBodySlot {
  private target: HTMLElement | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HTMLElement | null => this.target;

  /** Para el render en servidor: allí no hay ranura. */
  getServerSnapshot = (): HTMLElement | null => null;

  /**
   * El `ref` de la ranura. React lo llama con el elemento al montar y con
   * `null` al desmontar. Propiedad flecha para que su identidad no cambie
   * entre renders: un `ref` nuevo en cada render desmontaría y montaría la
   * ranura sin necesidad.
   */
  attach = (element: HTMLElement | null): void => {
    if (element === this.target) return;
    this.target = element;
    for (const listener of this.listeners) listener();
  };
}

export const cadRibbonBodySlot = new CadRibbonBodySlot();

/**
 * El `ref` callback de la ranura, suelto: el lint de React lee `algo.attach`
 * en un `ref` como si fuera leer `ref.current` durante el render. Es la
 * misma función.
 */
export const attachCadRibbonBodySlot = cadRibbonBodySlot.attach;
