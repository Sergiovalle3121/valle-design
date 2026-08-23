/**
 * Colaboración SOBRE el dibujo: chinchetas de comentario ancladas a
 * coordenadas y cursores de los demás. DOM imperativo, cero React por cuadro
 * — el mismo patrón y por la misma razón que `live-cursor.ts`.
 *
 * ## Por qué no es un componente
 *
 * Esto se mueve con la cámara. Panear un plano de 20.000 entidades cabe hoy en
 * 8,1 ms de p95 y hay un trinquete que no deja que empeore
 * (`lib/cad/benchmark/plan-budget.spec.ts`). Un `setState` por cuadro de paneo
 * reconciliaría el árbol del estudio entero para mover doce chinchetas: sería
 * el gasto más caro del cuadro con diferencia. Aquí se recalculan las
 * posiciones —aritmética pura, probada en `overlay-model.spec.ts`— y se
 * escriben en `style.transform` de nodos que ya existen.
 *
 * Tres cosas más que protegen ese presupuesto:
 *
 *  · El repintado se agrupa en UN `requestAnimationFrame`. La cámara puede
 *    emitir varios cambios por cuadro (tamaño + centro + zoom); el overlay
 *    dibuja una vez.
 *  · Los nodos se REUTILIZAN por id. Recrear el DOM en cada cuadro es basura
 *    para el recolector justo mientras se arrastra.
 *  · El escucha de `pointermove` es pasivo y sólo guarda dos números. Quien
 *    los convierte en coordenada de dibujo es el cuadro, no el evento: a 1.000
 *    Hz de ratón gaming eso es la diferencia entre 60 y 8 proyecciones.
 *
 * ## Modo «colocar»
 *
 * Mientras se coloca un comentario el overlay se vuelve alcanzable al puntero
 * y TAPA el lienzo. Es deliberado: si el clic llegara además al editor, elegir
 * dónde va la nota designaría entidades o arrancaría un comando. El modo se
 * apaga solo al colocar o con Escape.
 */
import type { CadPoint2 } from "@/lib/cad/cad-document";
import {
  placeCadCommentPins,
  placeCadPeerCursors,
  type CadCommentPin,
} from "@/lib/cad/collab/overlay-model";
import type { CadPresencePeer } from "@/lib/cad/collab/presence";
import type { CadCollabViewport } from "@/lib/cad/collab/viewport-registry";

export interface CadCollabOverlayCallbacks {
  /** Clic en una chincheta: abre su hilo. */
  open(commentId: string): void;
  /** Clic sobre el plano en modo colocar, ya en coordenadas de DIBUJO. */
  place(point: CadPoint2): void;
  /** Escape o clic derecho en modo colocar. */
  cancel(): void;
  /** Cursor propio en coordenadas de DIBUJO (null al salir del lienzo). */
  cursor(point: CadPoint2 | null): void;
}

export interface CadCollabPinData extends CadCommentPin {
  author: string;
  body: string;
}

/*
 * La base SIN `pointer-events`, porque esa utilidad se ALTERNA y no se acumula.
 *
 * Antes la base la llevaba puesta (`pointer-events-none`) y el modo colocar
 * añadía `pointer-events-auto` detrás. En el atributo `class` el orden no
 * decide nada: quien decide es el orden de las reglas en la hoja de Tailwind, y
 * ahí `pointer-events-none` gana. Resultado: en modo colocar la capa seguía
 * siendo transparente al ratón, el lienzo de THREE se quedaba el clic
 * —«<canvas … three.js> intercepts pointer events», literal en el golden 55— y
 * anclar un comentario sobre el plano NUNCA funcionó. Separar la base de la
 * utilidad alternada es lo que hace que el comentario del método —«alternar
 * pointer-events es LO que decide si el clic llega al editor o se queda aquí»—
 * sea por fin cierto.
 */
const ROOT_BASE = "absolute inset-0 z-20 overflow-hidden";

/**
 * La clase de la capa según esté o no colocando. Exportada para su spec: el
 * fallo que arregla no se ve en ninguna aserción de dominio —la capa existe, es
 * visible y está donde toca—, sólo se ve en si el clic llega. Una función pura
 * con una prueba de una línea es lo que impide que vuelva a colarse.
 */
export function cadCollabOverlayRootClass(placing: boolean): string {
  return placing
    ? `${ROOT_BASE} pointer-events-auto cursor-crosshair`
    : `${ROOT_BASE} pointer-events-none`;
}

const ROOT_CLASS = cadCollabOverlayRootClass(false);
const PIN_CLASS =
  "pointer-events-auto absolute left-0 top-0 -ml-3 -mt-3 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold shadow-lg will-change-transform";
const PIN_OPEN_CLASS = "border-amber-200/70 bg-amber-400 text-gray-950";
const PIN_RESOLVED_CLASS = "border-emerald-200/60 bg-emerald-500/85 text-gray-950";
const PIN_EDGE_CLASS = "opacity-70 ring-2 ring-white/30";
const CURSOR_CLASS =
  "pointer-events-none absolute left-0 top-0 z-30 flex items-center gap-1 will-change-transform";
const CURSOR_LABEL_CLASS =
  "translate-x-2 translate-y-2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-gray-950 shadow";
const HINT_CLASS =
  "pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-amber-300/40 bg-gray-950/95 px-3 py-1 text-[11px] font-medium text-amber-100 shadow-xl";

export class CadCollabOverlay {
  private readonly root: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly pinNodes = new Map<string, HTMLButtonElement>();
  private readonly cursorNodes = new Map<string, HTMLDivElement>();

  private viewport: CadCollabViewport | null = null;
  private unsubscribeViewport: (() => void) | null = null;
  private pins: readonly CadCollabPinData[] = [];
  private peers: readonly CadPresencePeer[] = [];
  private placing = false;
  private activeId: string | null = null;
  /** Último píxel del ratón dentro del lienzo. Se convierte en el cuadro. */
  private pointer: { x: number; y: number } | null = null;
  private pointerDirty = false;
  private frame = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: CadCollabOverlayCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.className = ROOT_CLASS;
    this.root.dataset.testid = "cad-collab-overlay";
    this.hint = document.createElement("div");
    this.hint.className = HINT_CLASS;
    this.hint.dataset.testid = "cad-collab-place-hint";
    this.hint.textContent =
      "Haz clic sobre el plano para anclar el comentario · Esc para cancelar";
    this.hint.hidden = true;
    this.root.append(this.hint);
    this.container.append(this.root);

    this.container.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
    this.container.addEventListener("pointerleave", this.onPointerLeave, {
      passive: true,
    });
    this.root.addEventListener("click", this.onRootClick);
    this.root.addEventListener("contextmenu", this.onRootContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
  }

  /** Conecta (o desconecta con `null`) la cámara viva. */
  setViewport(viewport: CadCollabViewport | null): void {
    if (this.disposed || this.viewport === viewport) return;
    this.unsubscribeViewport?.();
    this.unsubscribeViewport = null;
    this.viewport = viewport;
    if (viewport) {
      this.unsubscribeViewport = viewport.onChange(() => this.schedule());
    } else {
      // Sin cámara no hay dónde anclar: se apaga TODO en vez de dejar la
      // última posición pintada sobre un lienzo que ya no es ése.
      this.clearNodes();
      this.setPlacing(false);
    }
    this.schedule();
  }

  setPins(pins: readonly CadCollabPinData[]): void {
    if (this.disposed) return;
    this.pins = pins;
    this.schedule();
  }

  setPeers(peers: readonly CadPresencePeer[]): void {
    if (this.disposed) return;
    this.peers = peers;
    this.schedule();
  }

  /** Resalta el hilo abierto en el panel para que se vea cuál es en el plano. */
  setActive(commentId: string | null): void {
    if (this.disposed || this.activeId === commentId) return;
    this.activeId = commentId;
    this.schedule();
  }

  setPlacing(placing: boolean): void {
    if (this.disposed || this.placing === placing) return;
    this.placing = placing;
    this.hint.hidden = !placing;
    // La clase completa se reescribe: alternar `pointer-events` es LO que
    // decide si el clic llega al editor o se queda aquí.
    this.root.className = cadCollabOverlayRootClass(placing);
    this.root.dataset.placing = placing ? "true" : "false";
  }

  get isPlacing(): boolean {
    return this.placing;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.unsubscribeViewport?.();
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerleave", this.onPointerLeave);
    this.root.removeEventListener("click", this.onRootClick);
    this.root.removeEventListener("contextmenu", this.onRootContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    this.root.remove();
  }

  /* ─────────────────────────────── Interno ────────────────────────────────*/

  private schedule(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const size = {
      widthPx: viewport.view.widthPx,
      heightPx: viewport.view.heightPx,
    };

    if (this.pointerDirty) {
      this.pointerDirty = false;
      this.callbacks.cursor(
        this.pointer
          ? viewport.screenToWorld(this.pointer.x, this.pointer.y)
          : null,
      );
    }

    const placements = placeCadCommentPins(
      (point) => viewport.worldToScreen(point),
      size,
      this.pins,
    );
    const alive = new Set<string>();
    for (const placement of placements) {
      alive.add(placement.id);
      const source = this.pins.find((pin) => pin.id === placement.id);
      const node = this.pinNode(placement.id);
      node.className = [
        PIN_CLASS,
        placement.resolved ? PIN_RESOLVED_CLASS : PIN_OPEN_CLASS,
        placement.offscreen ? PIN_EDGE_CLASS : "",
        this.activeId === placement.id ? "ring-2 ring-cyan-300" : "",
      ]
        .filter(Boolean)
        .join(" ");
      node.style.transform = `translate3d(${Math.round(placement.x)}px, ${Math.round(placement.y)}px, 0)`;
      node.textContent = String(placement.ordinal);
      node.dataset.offscreen = placement.offscreen ? "true" : "false";
      node.dataset.resolved = placement.resolved ? "true" : "false";
      node.title = source
        ? `${source.author}: ${source.body.slice(0, 140)}${placement.offscreen ? " (fuera del encuadre)" : ""}`
        : "";
      node.setAttribute(
        "aria-label",
        `Comentario ${placement.ordinal}${placement.resolved ? " (resuelto)" : ""}`,
      );
    }
    for (const [id, node] of this.pinNodes)
      if (!alive.has(id)) {
        node.remove();
        this.pinNodes.delete(id);
      }

    const cursors = placeCadPeerCursors(
      (point) => viewport.worldToScreen(point),
      size,
      this.peers,
    );
    const aliveCursors = new Set<string>();
    for (const cursor of cursors) {
      aliveCursors.add(cursor.peerId);
      const node = this.cursorNode(cursor.peerId);
      node.style.transform = `translate3d(${Math.round(cursor.x)}px, ${Math.round(cursor.y)}px, 0)`;
      node.style.opacity = cursor.offscreen ? "0.45" : "1";
      const arrow = node.firstElementChild as SVGElement | null;
      arrow?.setAttribute("fill", cursor.color);
      const label = node.lastElementChild as HTMLElement | null;
      if (label) {
        label.style.backgroundColor = cursor.color;
        const name = cursor.name.trim() || "Invitado";
        if (label.textContent !== name) label.textContent = name;
      }
    }
    for (const [id, node] of this.cursorNodes)
      if (!aliveCursors.has(id)) {
        node.remove();
        this.cursorNodes.delete(id);
      }
  }

  private pinNode(id: string): HTMLButtonElement {
    const existing = this.pinNodes.get(id);
    if (existing) return existing;
    const node = document.createElement("button");
    node.type = "button";
    node.dataset.testid = `cad-collab-pin-${id}`;
    node.dataset.commentId = id;
    this.root.append(node);
    this.pinNodes.set(id, node);
    return node;
  }

  private cursorNode(peerId: string): HTMLDivElement {
    const existing = this.cursorNodes.get(peerId);
    if (existing) return existing;
    const node = document.createElement("div");
    node.className = CURSOR_CLASS;
    node.dataset.testid = `cad-collab-cursor-${peerId}`;
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("viewBox", "0 0 16 16");
    arrow.setAttribute("width", "14");
    arrow.setAttribute("height", "14");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M1 1 L1 13 L4.6 9.6 L7 15 L9.4 14 L7 8.8 L12 8.8 Z");
    arrow.append(path);
    const label = document.createElement("span");
    label.className = CURSOR_LABEL_CLASS;
    node.append(arrow, label);
    this.root.append(node);
    this.cursorNodes.set(peerId, node);
    return node;
  }

  private clearNodes(): void {
    for (const node of this.pinNodes.values()) node.remove();
    this.pinNodes.clear();
    for (const node of this.cursorNodes.values()) node.remove();
    this.cursorNodes.clear();
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.container.getBoundingClientRect();
    this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.pointerDirty = true;
    this.schedule();
  };

  private readonly onPointerLeave = (): void => {
    this.pointer = null;
    this.pointerDirty = true;
    this.schedule();
  };

  private readonly onRootClick = (event: MouseEvent): void => {
    const pin = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-comment-id]",
    );
    if (pin?.dataset.commentId) {
      event.stopPropagation();
      this.callbacks.open(pin.dataset.commentId);
      return;
    }
    if (!this.placing || !this.viewport) return;
    event.stopPropagation();
    const rect = this.container.getBoundingClientRect();
    const world = this.viewport.screenToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    // Fallo cerrado: si el píxel no da un punto de dibujo (cámara degenerada,
    // rayo paralelo al suelo), NO se ancla en ninguna parte. Se cancela y el
    // usuario vuelve a intentarlo, que es honesto; anclar en el (0,0) sería
    // una nota apuntando a un sitio que nadie eligió.
    if (!world) {
      this.callbacks.cancel();
      return;
    }
    this.callbacks.place(world);
  };

  private readonly onRootContextMenu = (event: MouseEvent): void => {
    if (!this.placing) return;
    event.preventDefault();
    this.callbacks.cancel();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.placing) return;
    this.callbacks.cancel();
  };
}
