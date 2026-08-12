/**
 * Lo que un comando le pide al ANFITRIÓN, y que no cabe en el documento.
 *
 * PLOT tiene que producir un PDF: necesita fuentes, un `Blob` y una descarga.
 * PAGESETUP y PLOT preview tienen que abrir un cuadro. PUBLISH tiene que
 * recorrer varias hojas y encadenarlas. Nada de eso puede vivir dentro de una
 * máquina de estados pura, y meterlo dentro ataría el motor al navegador —
 * exactamente lo que este motor existe para evitar.
 *
 * Así que el comando emite una PETICIÓN declarativa, el anfitrión la ejecuta, y
 * el comando se prueba en Node comprobando la petición: qué hoja, qué papel,
 * qué tabla de plumas, qué área de trazado. Que el PDF salga bien es trabajo
 * del emisor de PDF, que tiene sus propias pruebas sobre bytes reales.
 *
 * Este archivo declara SÓLO tipos y no importa nada en tiempo de ejecución: es
 * la frontera, y una frontera con dependencias deja de serlo.
 */
import type { CadPlotRequest } from "../plot/page-setup";
import type { CadVisualStyleId } from "../view/visual-styles";

export type CadHostRequest =
  /** Abre el cuadro de configuración de página de una presentación. */
  | { kind: "page-setup"; layoutId: string }
  /** Traza. `preview` se queda en pantalla; `plot` produce el archivo. */
  | { kind: "plot"; mode: "preview" | "plot"; request: CadPlotRequest }
  /**
   * Publica un conjunto de planos por lotes a un único PDF paginado. El
   * conjunto NO vive dentro del documento —es un `.dst` aparte, con su propia
   * tabla— así que aquí sólo viaja su identificador.
   */
  | { kind: "publish"; sheetSetId: string; sheetIds?: readonly string[] }
  /** Cambia el espacio activo del editor: modelo o papel. */
  | { kind: "space"; space: "model" | "paper"; layoutId?: string }
  /**
   * Cambia el estilo visual del visor (VSCURRENT/SHADEMODE). Es estado del
   * VISOR, no del documento: cambiar cómo se mira un sólido no ensucia el
   * dibujo ni deja paso de deshacer, igual que en AutoCAD.
   */
  | { kind: "visual-style"; styleId: CadVisualStyleId };
