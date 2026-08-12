/**
 * Menú del grip caliente e insignia de la acción activa — DOM imperativo,
 * cero React, calcado del patrón de `live-cursor.ts`. Implementa la
 * superficie que `native-grip-controller.ts` declara, así que el controlador
 * se prueba en Node con un doble y este archivo sólo aporta píxeles.
 */
import type { CadGripAction, CadGripActionKind } from "@/lib/cad/grip-actions";
import type { CadGripMenuSurface } from "./native-grip-controller";

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

const MENU_CLASS =
  "pointer-events-auto absolute z-40 flex min-w-32 flex-col rounded-md border border-white/15 bg-[#0b1020]/97 p-1 text-[12px] shadow-xl backdrop-blur";
const MENU_ITEM_CLASS =
  "rounded px-2 py-1 text-left font-mono text-cyan-200 transition-colors hover:bg-white/10";
const BADGE_CLASS =
  "pointer-events-none absolute z-30 rounded bg-cyan-500/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-950 shadow will-change-transform";

export class CadGripMenuOverlay implements CadGripMenuSurface {
  private readonly menu: HTMLDivElement;
  private readonly badge: HTMLDivElement;
  private open_ = false;

  constructor(
    container: HTMLElement,
    private readonly callbacks: {
      choose(kind: CadGripActionKind): void;
      dismiss(): void;
    },
  ) {
    this.menu = element("div", MENU_CLASS, "cad-grip-menu");
    this.menu.style.display = "none";
    // El menú vive DENTRO del lienzo: sus gestos no pueden llegar al onDown /
    // onUp del editor o el clic que elige una acción también designaría.
    for (const type of ["pointerdown", "pointerup", "click"] as const)
      this.menu.addEventListener(type, (event) => event.stopPropagation());
    this.badge = element("div", BADGE_CLASS, "cad-grip-action-badge");
    this.badge.style.display = "none";
    container.append(this.menu, this.badge);
  }

  open(x: number, y: number, actions: readonly CadGripAction[]): void {
    this.menu.replaceChildren(
      ...actions.map((action) => {
        const button = element(
          "button",
          MENU_ITEM_CLASS,
          `cad-grip-action-${action.kind}`,
        );
        button.type = "button";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          this.close();
          this.callbacks.choose(action.kind);
        });
        return button;
      }),
    );
    this.menu.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    this.menu.style.display = "flex";
    this.open_ = true;
  }

  close(): void {
    this.menu.style.display = "none";
    this.open_ = false;
  }

  get isOpen(): boolean {
    return this.open_;
  }

  showBadge(x: number, y: number, action: CadGripAction): void {
    this.badge.textContent = `${action.label} · Espacio cambia`;
    this.badge.dataset.action = action.kind;
    this.badge.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
    this.badge.style.display = "block";
  }

  hideBadge(): void {
    this.badge.style.display = "none";
  }

  dispose(): void {
    this.menu.remove();
    this.badge.remove();
  }
}
