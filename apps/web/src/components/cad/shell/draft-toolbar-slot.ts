"use client";

/**
 * RANURA ACOPLADA DE LA PÍLDORA DE DIBUJO (ORTO · Terminar · Cerrar).
 *
 * En el modo Esencial la píldora que el monolito monta durante LINE / RECTANG /
 * WALL (`studio/draft-toolbar.tsx`) no flota sobre el lienzo con `absolute
 * top-12`: se PINTA dentro de la barra esencial, en el hueco
 * `cad-essential-bar-tools` que `CadEssentialBar` deja a la derecha. Es el
 * mismo mecanismo que `ribbon-body-slot.ts` usa para llevar el cuerpo de la
 * cinta a la fila `ribbon` del armazón: un anfitrión fuera de React que
 * guarda el `<div>` destino y avisa a quien lo lea con `useSyncExternalStore`.
 *
 * Quien monta la píldora no cambia (Layout3DEditor.tsx, sin tocar); quien
 * decide DÓNDE se pinta es la propia píldora, leyendo esta ranura y el modo.
 */
class CadDraftToolbarSlot {
  private target: HTMLElement | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HTMLElement | null => this.target;

  getServerSnapshot = (): HTMLElement | null => null;

  attach = (element: HTMLElement | null): void => {
    if (element === this.target) return;
    this.target = element;
    for (const listener of this.listeners) listener();
  };
}

export const cadDraftToolbarSlot = new CadDraftToolbarSlot();

export const attachCadDraftToolbarSlot = cadDraftToolbarSlot.attach;
