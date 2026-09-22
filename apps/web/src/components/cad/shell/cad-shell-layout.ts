/**
 * EL ARMAZÓN — geometría del estudio, en un solo sitio.
 *
 * Antes de esta ola cada pieza del `cad-shell` traía su propio número: la
 * barra superior 48/56 px según densidad, la cinta 104 px por su cuenta, los
 * muelles 240/250/256/560 px fijos, la línea de comandos una píldora flotante
 * de 480 px. Nadie podía preguntar «¿cuánto lienzo queda?» sin sumar seis
 * archivos a mano — y la respuesta, medida en producción, era 49,8 % de la
 * ventana en una laptop de 1366×768.
 *
 * Este módulo es la única fuente de verdad de esos números. `CadShellFrame`,
 * `CadDockRail` y `Layout3DEditor` LOS LEEN; ninguno escribe un número de
 * layout nuevo — esa regla es el contrato de la ola (`docs/execution/
 * DEUDA-MONOLITO.md`, «armazón»). `cadShellCanvasBox` es la función pura que
 * responde la pregunta de arriba, y `cad-shell-layout.spec.ts` fija los
 * porcentajes de aceptación sobre ella, sin navegador.
 */

/** Todas las medidas en píxeles CSS. */
export const CAD_SHELL_METRICS = {
  /** Fila superior: cerrar, título, pestañas de la cinta y accesos rápidos. */
  appBar: 32,
  /** Cuerpo de la cinta desplegada — los grupos de botones. */
  ribbonBody: 72,
  /**
   * Fila de pestañas de la cinta. Vive DENTRO del alto de `appBar` (las
   * pestañas se pintan en la misma fila que cerrar/título/accesos, no en una
   * fila propia) — esta constante documenta cuánto de esos 32 px son suyos,
   * para quien calcule el alto TOTAL de "la cinta" como concepto visual
   * (pestañas + cuerpo = 104 px con la cinta desplegada).
   */
  ribbonTabs: 32,
  /** Línea de comandos acoplada, en reposo (una sola línea). */
  commandRow: 26,
  /** Línea de comandos con el historial desplegado. */
  commandExpanded: 78,
  /** Barra de estado — una sola fila de iconos. */
  statusRow: 26,
  /** Riel de iconos de un muelle plegado (izquierdo o derecho). */
  rail: 44,
  /** Panel abierto de un muelle, además de su riel. */
  panel: 280,
  /** Ancho MÁXIMO de un panel profesional (hatch, dimensión, bloques…). */
  panelProMax: 360,
} as const;

export interface CadShellCanvasBoxInput {
  /** Ancho de la ventana (o del contenedor del estudio), en px CSS. */
  width: number;
  /** Alto de la ventana (o del contenedor del estudio), en px CSS. */
  height: number;
  /** El panel IZQUIERDO está abierto (280 px) además de su riel (44 px). */
  leftOpen: boolean;
  /** El panel DERECHO está abierto (280 px) además de su riel (44 px). */
  rightOpen: boolean;
  /** La cinta está minimizada (0 px) en vez de desplegada (72 px de cuerpo). */
  ribbonCollapsed: boolean;
}

export interface CadShellCanvasBox {
  /** Ancho resultante del lienzo, en px CSS. */
  width: number;
  /** Alto resultante del lienzo, en px CSS. */
  height: number;
  /** `(width * height) / (viewport.width * viewport.height)`, en [0, 1]. */
  ratio: number;
}

/**
 * Cuánto lienzo queda con esta combinación de estado — la pregunta que antes
 * exigía sumar seis archivos a mano. Pura y sin DOM a propósito: así
 * `cad-shell-layout.spec.ts` fija el contrato con `tsx`, sin levantar un
 * navegador que esta máquina no puede permitirse.
 *
 * La línea de comandos y la barra de estado SIEMPRE restan su fila mínima
 * (`commandRow`, `statusRow`): el historial desplegado de la línea de
 * comandos (`commandExpanded`) es un estado transitorio de quien la usa, no
 * parte del contrato de reparto por defecto que miden los goldens.
 */
export function cadShellCanvasBox({
  width,
  height,
  leftOpen,
  rightOpen,
  ribbonCollapsed,
}: CadShellCanvasBoxInput): CadShellCanvasBox {
  const chromeHeight =
    CAD_SHELL_METRICS.appBar +
    (ribbonCollapsed ? 0 : CAD_SHELL_METRICS.ribbonBody) +
    CAD_SHELL_METRICS.commandRow +
    CAD_SHELL_METRICS.statusRow;
  const leftWidth = CAD_SHELL_METRICS.rail + (leftOpen ? CAD_SHELL_METRICS.panel : 0);
  const rightWidth = CAD_SHELL_METRICS.rail + (rightOpen ? CAD_SHELL_METRICS.panel : 0);
  const canvasWidth = Math.max(0, width - leftWidth - rightWidth);
  const canvasHeight = Math.max(0, height - chromeHeight);
  const viewportArea = width * height;
  const ratio = viewportArea > 0 ? (canvasWidth * canvasHeight) / viewportArea : 0;
  return { width: canvasWidth, height: canvasHeight, ratio };
}
