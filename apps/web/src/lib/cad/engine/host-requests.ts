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
import type { CadLossManifestEntry } from "../cad-document";
import type { CadPlotRequest } from "../plot/page-setup";
import type { CadVisualStyleId } from "../view/visual-styles";
import type { CadUcsPlanView } from "../ucs-view";

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
   * `PLAN`: encuadra la vista en la planta del SCU que viaja dentro.
   *
   * Va por aquí y no por `CadViewRequest` a propósito. Una petición de vista
   * describe un ENCUADRE —centro, altura, factor— y la planta de un SCU no es
   * eso: es una ORIENTACIÓN, y expresarla exige una dirección de cámara que el
   * modelo de navegación 2D no tiene. Colarla como un zoom más habría obligado
   * a meter el SCU dentro del módulo de vista, que en esta ola pertenece a otra
   * sesión, para acabar teniendo dos sitios donde vive la orientación.
   *
   * El anfitrión decide qué puede hacer con ella: con `twistDeg` no nulo, girar
   * la vista 2D basta; con `twistDeg` nulo hace falta la cámara 3D, y quien no
   * la tenga lo dice en vez de enseñar un plano inclinado como si fuera plano.
   */
  | { kind: "ucs-plan"; plan: CadUcsPlanView }
  /**
   * Cambia el estilo visual del visor (VSCURRENT/SHADEMODE). Es estado del
   * VISOR, no del documento: cambiar cómo se mira un sólido no ensucia el
   * dibujo ni deja paso de deshacer, igual que en AutoCAD.
   */
  | { kind: "visual-style"; styleId: CadVisualStyleId }
  /**
   * Entrega el DXF que produjo `DXFOUT`.
   *
   * El fichero VIENE HECHO. Escribir DXF es aritmética sobre cadenas y el motor
   * la hace entera, así que lo único que queda fuera es la descarga —`Blob`,
   * URL y un ancla que se pulsa sola—, que es exactamente el reparto de PLOT.
   * Que el contenido viaje en la petición es lo que permite probar `DXFOUT` en
   * Node comparando texto DXF real en vez de espiar al navegador.
   *
   * `losses` viaja al lado del contenido, no detrás: el usuario tiene que poder
   * leer qué NO lleva el archivo ANTES de mandárselo al estructurista, y un
   * manifiesto que llega por otro canal es un manifiesto que la interfaz puede
   * olvidarse de enseñar.
   */
  | {
      kind: "dxf-export";
      fileName: string;
      content: string;
      entityCount: number;
      layers: readonly string[];
      losses: readonly CadLossManifestEntry[];
    };
