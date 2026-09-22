import type { Theme3D } from "../studio/editor-presentation";
import { THEMES } from "../studio/editor-presentation";

/**
 * Cómo se ve la ventana de selección — la mitad que le faltaba a
 * `Layout3DEditor.drawMarquee`.
 *
 * Antes, la ventana (izq→der) y la captura (der→izq) sólo se distinguían por
 * el color de la LÍNEA — 0x22d3ee / 0x34d399 a mano, ninguno de los dos un
 * token del sistema de diseño — y las dos llevaban trazo continuo. En AutoCAD
 * la ventana es azul con borde continuo y la captura es verde con borde
 * DISCONTINUO; esa segunda señal es la que deja distinguir el modo sin leer
 * ningún texto, y es la que faltaba aquí (queja del dueño: la selección «no
 * parece de un CAD»).
 *
 * Esta función resuelve QUÉ color y QUÉ trazo, a partir de `THEMES`
 * (`axisY` para la captura — mismo verde que el icono UCS, `selectWindow`
 * para la ventana). `Layout3DEditor` sólo la llama y aplica el resultado; no
 * decide un color por su cuenta.
 *
 * ESTADO DE CABLEADO (dicho también en «pendiente» de la entrega): el
 * presupuesto de líneas de `Layout3DEditor.tsx` (monolito, sólo puede
 * PERDER) no dio para cablear también `dash`/`fillOpacity` — eso pedía un
 * segundo material (`THREE.LineDashedMaterial`) y una malla de relleno, con
 * su propio ciclo de vida. Hoy sólo se lee `.color`; `dash`/`fillOpacity`
 * quedan listos, probados, y a la espera de esa ola.
 */
export type CadSelectionMarqueeKind = "window" | "crossing";

export interface CadSelectionMarqueeStyle {
  /** Color de la línea/relleno, ya resuelto contra el tema activo. */
  color: number;
  /**
   * Patrón de trazo para `THREE.LineDashedMaterial` — `[trazo, hueco]`, en
   * unidades de mundo. `null` significa borde CONTINUO (ventana).
   */
  dash: readonly [number, number] | null;
  /** Opacidad sugerida para un relleno translúcido sobre este color. */
  fillOpacity: number;
}

const DASH_LENGTH = 0.08;
const GAP_LENGTH = 0.08;
const FILL_OPACITY = 0.14;

export function cadSelectionMarqueeStyle(
  kind: CadSelectionMarqueeKind,
  theme: Theme3D,
): CadSelectionMarqueeStyle {
  const palette = THEMES[theme];
  if (kind === "window") {
    return { color: palette.selectWindow, dash: null, fillOpacity: FILL_OPACITY };
  }
  return {
    color: palette.axisY,
    dash: [DASH_LENGTH, GAP_LENGTH],
    fillOpacity: FILL_OPACITY,
  };
}

/**
 * Ventana si el arrastre fue izquierda→derecha (x1 >= x0), captura si fue al
 * revés — la misma regla que ya usaba `drawMarquee`, aislada para poder
 * fijarla con una prueba sin construir un `PointerEvent`.
 */
export function cadSelectionMarqueeKind(x0: number, x1: number): CadSelectionMarqueeKind {
  return x1 >= x0 ? "window" : "crossing";
}
