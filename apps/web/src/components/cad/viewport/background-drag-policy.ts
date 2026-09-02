/**
 * QUÉ HACE UN ARRASTRE SOBRE EL FONDO DEL LIENZO.
 *
 * Medido en Chromium (sonda Playwright, 2026-09-02; estudio en 2D, modo
 * «pick», dos líneas sembradas): un arrastre izquierdo sin Shift alrededor de
 * las dos líneas dejaba «0 sel» y la cámara se movía ~2550 unidades (el HUD
 * del centro pasaba de 4000|3007 a 1450|1956); sólo Shift+arrastre designaba.
 * Y el botón central hacía ZOOM: OrbitControls trae MIDDLE=DOLLY de fábrica.
 * En AutoCAD es al revés: arrastrar sobre el fondo abre una ventana (izq→der)
 * o un cruce (der→izq), y el botón central encuadra
 * (docs/competitive/liston-autocad-completo.md, «Rueda / botón central»).
 *
 * Esta tabla es pura y la lee el `pointerdown` del editor. Lo que decide:
 *
 * - `camera`: el botón central. Se corta ANTES de los hit-tests, que hoy
 *   corren para cualquier botón y podían arrastrar un objeto con el central.
 *   El editor hace `preventDefault()` para que Windows no arranque el
 *   autoscroll. Sólo el central: el derecho sigue su curso (menú contextual).
 * - `marquee`: abre ventana/cruce. Con Shift siempre (como antes); sin Shift
 *   sólo en 2D, con la herramienta de selección, sin comando del motor y con
 *   la preferencia `backgroundDrag` en «marquee». CON EL DEDO NUNCA: un dedo
 *   designa por toque y dos dedos son la cámara (`camera-policy.ts`); medido
 *   que deshabilitar OrbitControls en el primer contacto mata el encuadre a
 *   dos dedos (golden 56).
 * - `clear`: el gesto de siempre — limpiar la selección y dejar que
 *   OrbitControls encuadre.
 */
import type { CadBackgroundDrag } from "@/lib/cad/cad-workspace";

export interface CadBackgroundDragInput {
  readonly pointerType: string;
  readonly button: number;
  readonly shiftKey: boolean;
  readonly viewMode: "2d" | "3d";
  readonly tool: string;
  readonly engineActive: boolean;
  /** Operación de la paleta de selección: «replace» limpia antes de designar. */
  readonly selectionOperation: "replace" | "add" | "remove" | "toggle";
  readonly backgroundDrag: CadBackgroundDrag;
}

export type CadBackgroundDragGesture =
  | { kind: "camera" }
  | { kind: "marquee"; clearSelection: boolean }
  | { kind: "clear" }
  | { kind: "continue" };

/** Sólo el botón central se decide antes de los hit-tests. */
export function cadPointerDownBeforeHit(input: Pick<CadBackgroundDragInput, "button">): CadBackgroundDragGesture {
  return input.button === 1 ? { kind: "camera" } : { kind: "continue" };
}

/** Nada bajo el puntero: ventana/cruce, o limpiar y dejar encuadrar. */
export function cadBackgroundDragGesture(input: CadBackgroundDragInput): CadBackgroundDragGesture {
  if (input.button !== 0) return { kind: "continue" };
  if (input.shiftKey) return { kind: "marquee", clearSelection: false };
  const marqueeByDefault =
    input.pointerType !== "touch" &&
    input.viewMode === "2d" &&
    input.tool === "select" &&
    !input.engineActive &&
    input.backgroundDrag === "marquee";
  if (marqueeByDefault) return { kind: "marquee", clearSelection: input.selectionOperation === "replace" };
  return { kind: "clear" };
}
