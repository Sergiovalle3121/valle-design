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
import type { CadLossManifestEntry, CadPoint2 } from "../cad-document";
import type { CadSystemVariableValue } from "../system-variables";
import type { CadPlotRequest } from "../plot/page-setup";
import type { CadVisualStyleId } from "../view/visual-styles";
import type { CadUcsPlanView } from "../ucs-view";

export type CadHostRequest =
  /** Abre el cuadro de configuración de página de una presentación. */
  /**
   * Deshacer o rehacer N pasos del historial del editor.
   *
   * La pila de deshacer NO vive en el documento ni en el motor: la sostiene el
   * editor (`CanonicalHistory`), porque es estado de SESIÓN —dos personas con
   * el mismo plano abierto tienen cada una la suya— y porque deshacer no es una
   * mutación más, es viajar entre snapshots. Un comando que la manipulara
   * directamente tendría que conocer el editor entero.
   *
   * Así que `U`, `UNDO` y `REDO` piden el viaje y el editor lo hace, exactamente
   * como PLOT pide un PDF. El anfitrión devuelve el renglón que se lee en la
   * línea de comandos («Deshecho: 1 operación», «Nada que deshacer»), que es lo
   * que un dibujante espera ver.
   */
  | { kind: "history"; action: "undo" | "redo"; steps: number }
  /**
   * Adjunta OTRO dibujo del inquilino como referencia externa.
   *
   * Traer el contenido de un activo es I/O y el motor es síncrono: por eso
   * `XATTACH` no podía adjuntar nada mientras el anfitrión no le precargara la
   * biblioteca entera, y el estudio no tiene ninguna que precargar —el panel de
   * referencias externas pide el activo por su id y lo descarga cuando el
   * usuario pulsa. Esta petición es ese mismo camino, abierto a la orden: el
   * motor dice QUÉ adjuntar y DÓNDE, y el anfitrión lo trae y lo proyecta con
   * la misma función que el panel (`attachCadXref`).
   *
   * Es exactamente el reparto de PLOT: el comando decide, el anfitrión ejecuta.
   */
  | {
      kind: "xref-attach";
      /** Lo que el usuario tecleó: id del activo o su nombre. */
      assetId: string;
      /** Revisión pedida; `UNIVERSAL` es la vigente. */
      revision: string;
      mode: "attachment" | "overlay";
      insertion: CadPoint2;
      scale: number;
      rotation: number;
    }
  /**
   * Trae OTRO dibujo del inquilino para compararlo con el abierto.
   *
   * Es el mismo reparto que `xref-attach` y por la misma razón: el motor
   * decide qué comparar, el anfitrión lo descarga. La diferencia es que
   * aquí NO se proyecta nada en el documento — el dibujo traído se compara
   * y se tira, y lo único que se escribe son las nubes de revisión.
   */
  | {
      kind: "compare-fetch";
      /** Lo que el usuario tecleó: id del activo o su nombre. */
      assetId: string;
      /** Revisión pedida; `UNIVERSAL` es la vigente. */
      revision: string;
      /** Qué hacer al recibirlo: marcar con nubes o sólo informar. */
      mode: "clouds" | "report";
    }
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
    }
  /**
   * Entrega el CSV que produjo `DATAEXTRACTION` en su variante `CSV`.
   *
   * Igual que `dxf-export`: el texto VIENE HECHO, calculado por el comando a
   * partir de `buildCadBimSchedule`, y lo único que falta es la descarga.
   */
  | { kind: "data-extraction-csv"; fileName: string; content: string }
  /**
   * Entrega el paquete de `ETRANSMIT`: los bytes de un ZIP ya construidos por
   * el comando (`buildCadTransmittalPackage`), con su manifiesto de qué viaja
   * y qué falta. Mismo reparto que `dxf-export` y `data-extraction-csv`: el
   * motor hace la aritmética de bytes, el anfitrión sólo entrega el archivo.
   */
  | {
      kind: "etransmit";
      fileName: string;
      bytes: Uint8Array;
      included: readonly string[];
      missing: readonly string[];
    }
  /**
   * Gestión de un conjunto de planos: `PUBLISH` reutiliza `"publish"`, y
   * `SHEETSET` entra por aquí para las tres operaciones que se pueden teclear
   * sin abrir un panel — añadir la hoja activa, renumerar y leer el índice.
   *
   * `sheet` sólo viaja en `"add"`; en las otras dos operaciones no hace falta
   * más que el identificador del conjunto.
   */
  | {
      kind: "sheet-set-command";
      action: "add" | "renumber" | "list";
      sheetSetId: string;
      sheet?: { documentId: string; layoutId: string; title: string };
    }
  /**
   * COPYCLIP, CUTCLIP y COPYBASE (Ola D, 2026-09-02): el comando designa y
   * decide el punto base; el ANFITRIÓN lee las entidades, las mete en el
   * portapapeles compartido de la pestaña y, en `cut`, borra los originales
   * como UN lote. Va por aquí porque escribir en un almacén es un efecto, y el
   * motor es un reductor puro: el comando se prueba en Node comprobando la
   * petición, y el anfitrión se prueba comprobando el portapapeles.
   */
  | {
      kind: "clipboard";
      op: "copy" | "cut";
      entityIds: readonly string[];
      /** Tecleado en COPYBASE; `null` = la esquina inferior izquierda de la envolvente. */
      basePoint: CadPoint2 | null;
    }
  /**
   * ADDSELECTED (Ola D, 2026-09-02): «dibuja uno como éste». El comando decide
   * QUÉ orden y con qué CLAYER/CECOLOR/CELTYPE; el anfitrión pone las
   * variables, arranca la orden y las DEVUELVE a su valor cuando ésta termina.
   * Va por aquí porque un reductor no puede encadenar una orden ni ver el
   * final de la siguiente: sólo el anfitrión, que despacha, sabe cuándo acabó.
   */
  | {
      kind: "chain-command";
      command: string;
      variables: Readonly<Record<string, CadSystemVariableValue>>;
    };
