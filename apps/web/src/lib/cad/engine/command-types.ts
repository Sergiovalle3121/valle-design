/**
 * Contrato del motor de comandos CAD.
 *
 * ## Por qué existe
 *
 * Hoy el dibujo interactivo son 162 líneas con **siete** comandos cableados
 * (`line`, `polyline`, `rect`, `circle`, `move`, `copy`, `offset`). `TRIM`,
 * `FILLET`, `ARRAY` o `MIRROR` no se pueden escribir porque no existen como
 * nombre: se alcanzan desde controles sueltos del panel derecho. Y la caja que
 * parece una línea de comandos es un copiloto en lenguaje natural que exige
 * escribir prosa, pulsar *Preview* y luego *Aplicar*.
 *
 * Eso no es una carencia de funciones: es la ausencia del mecanismo con el que
 * se usa un CAD. La velocidad de AutoCAD vive en teclear el nombre, leer las
 * opciones entre corchetes, elegir una con una letra y repetir con Espacio.
 *
 * ## Qué modela este archivo
 *
 * Un comando es una **máquina de estados pura**: recibe entradas —un punto, una
 * distancia, una palabra clave, Enter, Esc— y devuelve el siguiente prompt más,
 * al terminar, los comandos de entidad que hay que aplicar. No toca React, ni
 * THREE, ni el documento: eso lo hace el anfitrión. Así cada comando se prueba
 * en Node como una función.
 *
 * Tres reglas que el diseño impone y que conviene tener presentes:
 *
 * - **La frontera de deshacer es el comando.** Un comando termina emitiendo UN
 *   lote (`executeCadEntityCommandBatch`), no N mutaciones sueltas.
 * - **El nombre canónico es invariante; el prompt es traducible.** `LINE` se
 *   escribe igual en cualquier idioma, como en AutoCAD; el texto que lo
 *   acompaña no. Sin esa separación, i18n rompería las macros y los scripts.
 * - **El motor no sabe de snaps.** Los catorce modos de `snap-engine.ts` entran
 *   como un override por paso, así que añadir modos no toca el motor.
 */
import type {
  CadBlockDefinition, CadConstraint, CadDocument, CadEntity, CadLayerDef,
  CadPaperSpace, CadParameter, CadPoint2, CadPoint3,
} from "../cad-document";
import type { CadPlotStyleTable } from "../plot/plot-style-table";
import type { CadBounds } from "../entity-runtime";
import type { CadSolidFaceRef } from "../cad-entities-v5";
import type { CadEntityCommand } from "../entity-commands";
import type { SnapType } from "../snap-engine";
// Sólo TIPOS: la importación se borra al compilar, así que el motor sigue sin
// depender en tiempo de ejecución ni de la vista, ni del trazado, ni de las
// referencias externas, ni de los catálogos de sesión, y no hay ciclo que
// `benchmark:cad:smoke` pueda destapar.
import type { CadViewRequest } from "../view/view-navigation";
import type { CadXrefCatalogEntry } from "../xref/xref-paths";
import type { CadHostRequest } from "./host-requests";
import type { CadSystemVariableValue, CadVariableAccess } from "../system-variables";
import type { CadClipboardReader } from "../clipboard";
import type { CadNamedLayerState } from "../layer-states";
import type { CadLinetypeDefinition } from "../linetype-lin";
import type { CadNamedSelectionFilter } from "../selection/selection-filter";
import type { CadToolPalette } from "../tool-palettes";
import type { CadNamedUcs } from "../ucs";

export type CadCommandKind = "draw" | "modify" | "annotate" | "inquiry" | "view" | "manage";

/**
 * Qué espera un comando respecto de la selección previa.
 *
 * - `none`: no le interesa.
 * - `optional`: la usa si la hay.
 * - `required`: si no hay nada seleccionado, pide una selección antes de seguir.
 * - `command-first`: ignora la selección previa y siempre pide objetos, como
 *   hace TRIM con sus bordes de corte.
 */
export type CadSelectionRule = "none" | "optional" | "required" | "command-first";

export interface CadKeyword {
  /** Palabra completa: `Close`. */
  keyword: string;
  /** Letras que la eligen: `C`. Se compara sin distinguir mayúsculas. */
  shortcut: string;
  /** Texto mostrado si difiere de `keyword` (localizable). */
  label?: string;
}

export interface CadPrompt {
  /** Petición principal, ya localizada: «Precise el siguiente punto». */
  message: string;
  /** Opciones; se renderizan entre corchetes: `[Close/Undo]`. */
  options: readonly CadKeyword[];
  /** Opción por defecto al pulsar Enter; se muestra entre ángulos. */
  defaultOption?: string;
  /** Valor por defecto al pulsar Enter; se muestra entre ángulos. */
  defaultValue?: string;
}

/** Qué acepta el paso actual. Bits, porque casi siempre acepta varias cosas. */
export type CadInputMask = number;
export const CAD_ACCEPT_POINT = 1;
export const CAD_ACCEPT_DISTANCE = 2;
export const CAD_ACCEPT_ANGLE = 4;
export const CAD_ACCEPT_TEXT = 8;
export const CAD_ACCEPT_KEYWORD = 16;
export const CAD_ACCEPT_SELECTION = 32;
export const CAD_ACCEPT_ENTITY_PICK = 64;
/**
 * Designar una CARA de un sólido, no una entidad.
 *
 * Es el bit que faltaba para que el modo 3D deje de ser un visor. Una entidad
 * se designa con un id; una cara necesita además CUÁL de sus caras, y —esto es
 * lo importante— una referencia que sobreviva a que el sólido se reconstruya:
 * el índice de cara cambia cuando cambia el operando, así que lo que viaja es
 * la HUELLA geométrica (`CadSolidFaceRef`), con el índice sólo como vía rápida
 * que se comprueba antes de creerse.
 *
 * Quien la resuelve es el anfitrión de designación en el viewport, con el rayo
 * de cámara de `lib/cad/pick3d/face-ray.ts`. El motor sólo declara que la
 * espera.
 */
export const CAD_ACCEPT_FACE_PICK = 128;
/** El anfitrión puede designar UNA arista del sólido bajo el cursor. */
export const CAD_ACCEPT_EDGE_PICK = 256;

export type CadCommandInput =
  | { kind: "point"; point: CadPoint2; snap?: SnapType; source: "pointer" | "typed" | "tracked" }
  | { kind: "distance"; value: number }
  | { kind: "angle"; degrees: number }
  | { kind: "text"; value: string }
  | { kind: "keyword"; keyword: string }
  | { kind: "selection"; entityIds: readonly string[] }
  | { kind: "entityPick"; entityId: string; point: CadPoint2 }
  | {
      kind: "facePick";
      /** Entidad `solid3d` a la que pertenece la cara. */
      entityId: string;
      /** Huella de la cara designada; el índice es vía rápida, no verdad. */
      face: CadSolidFaceRef;
      /** Punto 3D exacto donde el rayo tocó la cara. */
      point: CadPoint3;
      /** Normal unitaria de la cara en ese punto: la dirección del empujón. */
      normal: CadPoint3;
    }
  | {
      kind: "edgePick";
      entityId: string;
      /** Índice de la arista en el cuerpo evaluado, como vía rápida. */
      edge: number;
      /** Los dos extremos en coordenadas del mundo: la huella que se comprueba. */
      from: CadPoint3;
      to: CadPoint3;
      /** Punto tocado sobre la arista, para el enganche. */
      point: CadPoint2;
    }
  | { kind: "enter" }
  | { kind: "cancel" };

/** Trazo efímero de previsualización (rubber-band). No se persiste. */
export interface CadPreviewPath {
  points: readonly CadPoint2[];
  closed?: boolean;
}

export interface CadViewSnapshot {
  pixelsPerUnit: number;
  centerX: number;
  centerY: number;
}

/**
 * Estado de SESIÓN del motor. No es del documento y no se guarda.
 *
 * `DIMBASELINE` y `DIMCONTINUE` encadenan desde «la cota anterior», y eso no es
 * una propiedad del dibujo: dos personas con el mismo plano abierto tienen cada
 * una la suya. Guardarlo en el documento lo haría viajar por la red y aparecer
 * en el diff; guardarlo en un módulo global lo haría compartido entre pestañas y
 * no comprobable en una spec. Va aquí, en el contexto, de SÓLO LECTURA para los
 * comandos: quien lo mantiene es el anfitrión, que es quien ve lo que se aplicó.
 */
export interface CadCommandSession {
  /**
   * Id de la última cota creada en esta sesión, si sigue existiendo.
   *
   * Puede faltar —sesión recién abierta, o la cota se borró— y entonces
   * `DIMBASELINE`/`DIMCONTINUE` PIDEN la cota base en vez de fallar: es lo que
   * hace AutoCAD y la única respuesta honesta cuando no hay de dónde encadenar.
   */
  lastDimensionId?: string;
}

/**
 * Lo que un comando puede LEER del documento. Es un `Pick` y no el documento
 * entero para que quede escrito qué secciones entran en el contrato del motor:
 * historia, colaboración y publicaciones no son asunto de un comando.
 */
export type CadCommandDocumentView = Pick<
  CadDocument,
  | "meta"
  | "entities"
  | "blocks"
  | "layers"
  | "styles"
  | "externalReferences"
  | "modelSpace"
  /**
   * Las dos secciones que sólo mira quien EXPORTA. `DXFOUT` tiene que declarar
   * lo que el fichero no va a llevar, y las dos pérdidas más caras viven aquí:
   * una imagen cuyos píxeles el DXF nunca guarda, y una entidad que llegó de un
   * fichero ajeno y se conserva sin interpretar. Sin verlas, el manifiesto de
   * pérdidas callaría justo lo que más duele descubrir tarde.
   */
  | "imageDefinitions"
  | "unsupportedEntities"
  /**
   * Los estados de capa del esquema 9. LAYERSTATE los LEE de aquí — listar y
   * restituir son consultas — y los escribe por el lote, como todo.
   */
  | "layerStates"
>;

export interface CadCommandContext {
  /** Entidades presentes, sólo para consultar; el motor no las muta. */
  entityIds: readonly string[];
  /**
   * Lectura de una entidad por id. Los comandos que necesitan mirar la
   * geometría —OFFSET calcula el desfase real, no una traslación— la reciben
   * así en vez de recibir el documento entero: no pueden mutarlo aunque
   * quieran, y sus specs se montan con un objeto de tres líneas.
   */
  entity?: (entityId: string) => CadEntity | undefined;
  /**
   * Definiciones de bloque del documento, si el anfitrión las expone.
   *
   * EXPLODE de un INSERT no se puede resolver sin ellas: hay que ir a buscar el
   * contenido del bloque y aplicarle la inserción. Es opcional porque la
   * inmensa mayoría de los comandos no la necesita y obligar a montarla haría
   * más caras todas sus specs; quien la necesite y no la reciba se niega
   * diciéndolo, en vez de explotar el bloque a la nada.
   */
  blocks?: () => readonly CadBlockDefinition[];
  /**
   * Lectura del documento entero, sólo para CONSULTAR.
   *
   * Las órdenes de gestión —PURGE, XREF, ADCENTER— no operan sobre una
   * selección: operan sobre las TABLAS. PURGE tiene que saber qué capas hay y
   * a qué apunta cada estilo antes de proponer nada, y no hay forma de
   * responder eso con `entity()` y `blocks()`.
   *
   * Es opcional, y quien la necesita y no la recibe se NIEGA diciéndolo: un
   * PURGE que responde «no hay nada que purgar» cuando en realidad no puede
   * mirar es exactamente la clase de mentira que borra un dibujo por
   * confianza. Escribir sigue yendo por el lote de comandos, como todo.
   */
  document?: () => CadCommandDocumentView;
  /**
   * Biblioteca de dibujos del inquilino que se pueden referenciar.
   *
   * XATTACH y la RESOLUCIÓN DE RUTAS de XREF la necesitan: sin un catálogo no
   * hay forma de saber si `plantas/base` existe, ni de decir por cuál de las
   * tres rutas se encontró. Traerla es I/O, y el motor es síncrono y puro, así
   * que la aporta el anfitrión ya cargada. Quien la necesita y no la recibe lo
   * dice —«el anfitrión no expone la biblioteca»— en vez de responder «no
   * existe», que culparía al dibujo de una carencia del editor.
   */
  xrefCatalog?: () => readonly CadXrefCatalogEntry[];
  /**
   * Qué volumen levanta un objeto de planta, por su `kind`.
   *
   * Un `box` no guarda altura: el visor 3D la saca de su catálogo de arquetipos
   * y por eso la sabe el ANFITRIÓN, no el motor. Sin esta función, `FLATSHOT` y
   * `SOLPROF` sólo pueden aplanar sólidos B-rep — que es lo que hacían, y por
   * eso «el modelo del arquitecto no podía usar el único camino con oculta
   * exacta» (defecto (c) del informe de distancia). Cablear una tabla de
   * alturas dentro del motor sería tener dos verdades sobre lo que mide un
   * muro. `null` para un `kind` sin altura declarada: el objeto se queda fuera
   * del aplanado y la orden lo cuenta.
   *
   * `opening: true` marca lo que es un HUECO —una puerta— y se resta del muro
   * que atraviesa en vez de dibujarse como un bloque (defecto (b)).
   */
  objectVolume?: (kind: string) => { height: number; opening?: boolean } | null;
  selection: readonly string[];
  activeLayer: string;
  /**
   * Tabla de capas del documento, sólo para CONSULTAR.
   *
   * `-LAYER` no puede trabajar sin ella: crear una capa que ya existe, apagar
   * una que no existe o colorear a ciegas son las tres formas de estropear una
   * tabla de capas desde la línea de comandos. Escribir va por el lote, como
   * todo lo demás.
   */
  layers?: () => readonly CadLayerDef[];
  /**
   * Restricciones y parámetros del documento, sólo para CONSULTAR.
   *
   * Opcionales porque el anfitrión puede no aportarlos, y los comandos que los
   * usan lo dicen en voz alta en vez de fingir que la tabla está vacía: un
   * `PARAMETERS` que responde «no hay ninguno» cuando en realidad no puede
   * mirar es peor que uno que responde «no puedo mirar».
   *
   * Escribir NO va por aquí: va por el lote de comandos, como la geometría.
   */
  constraints?: readonly CadConstraint[];
  parameters?: readonly CadParameter[];
  /**
   * Presentaciones del documento, sólo para CONSULTAR.
   *
   * LAYOUT y MVIEW no se pueden resolver sin ellas: hay que saber qué pestañas
   * existen, cómo se llaman y qué ventanas tienen. Es opcional por lo mismo que
   * `blocks`: la inmensa mayoría de los comandos no las necesita, y obligar a
   * montarlas encarecería todas sus specs. Quien las necesite y no las reciba
   * se niega diciéndolo, en vez de inventar una hoja.
   *
   * Escribir NO va por aquí: va por el lote, con órdenes `paper-space`.
   */
  paperSpaces?: () => readonly CadPaperSpace[];
  /** Nombre o id de la pestaña abierta. `undefined` en espacio modelo. */
  activeLayout?: string;
  /** Unidad del documento (`mm`, `cm`, `m`, `in`). Decide los milímetros de papel. */
  unit?: string;
  /**
   * Envolvente de lo dibujado. La calcula el anfitrión —necesita el registro de
   * adaptadores entero— y los comandos la piden para encuadrar una ventana
   * nueva sobre el modelo real en vez de sobre un rectángulo inventado.
   */
  drawingExtents?: () => CadBounds | null;
  view: CadViewSnapshot;
  /**
   * Variables de sistema, sólo para CONSULTAR.
   *
   * Es lo que hace que DIST imprima `3'-6"` en vez de `3.5` sin que DIST sepa
   * nada de unidades. Opcional como el resto de capacidades: quien no la
   * recibe usa los valores de fábrica, que es lo que ve un dibujo recién
   * abierto, no una mentira.
   *
   * Escribir NO va por aquí: va en el resultado del comando, como la
   * geometría, para que el anfitrión tenga un solo sitio donde aplicar efectos.
   */
  variables?: CadVariableAccess;
  /**
   * Catálogos de sesión que no caben en `CadDocument` —filtros de selección con
   * nombre, estados de capa, paletas de herramientas, SCU con nombre—. Se pasan
   * como capacidad opcional por la misma razón que `blocks`: la inmensa mayoría
   * de los comandos no los necesita y obligar a montarlos encarecería todas sus
   * specs.
   */
  catalogs?: CadSessionCatalogs;
  /** Posición actual del puntero en unidades de dibujo, si se conoce. */
  cursor?: CadPoint2;
  /**
   * Lo que hay en el portapapeles de geometría (Ola D, 2026-09-02): PASTECLIP
   * y PASTEORIG lo LEEN. Escribirlo es un efecto y va por `CadHostRequest`
   * `clipboard`. Opcional por la misma razón que `variables`: una spec del
   * motor montada con un puente de tres líneas no tiene por qué traerlo.
   */
  clipboard?: CadClipboardReader;
  /** Rastro de lo hecho en esta sesión. Ver `CadCommandSession`. */
  session?: CadCommandSession;
  /**
   * Generador de identificadores, inyectado. Los comandos no llaman a
   * `crypto.randomUUID()` por su cuenta: si lo hicieran, sus specs no serían
   * deterministas y no se podrían comparar documentos.
   */
  newEntityId: () => string;
}

/**
 * Catálogo con nombre que vive en la SESIÓN, no en el documento.
 *
 * Filtros de selección, estados de capa, paletas de herramientas y SCU con
 * nombre tienen todos la misma forma —una lista de cosas con nombre que se
 * guardan y se restauran— y ninguno tiene sección en `CadDocument`. Un solo
 * contrato para los cuatro evita cuatro interfaces que se parecen y cuatro
 * comandos que las usan de cuatro maneras distintas.
 */
export interface CadNamedCatalog<T extends { name: string }> {
  list(): readonly T[];
  get(name: string): T | undefined;
  save(item: T): void;
  remove(name: string): boolean;
}

export interface CadSessionCatalogs {
  filters?: CadNamedCatalog<CadNamedSelectionFilter>;
  linetypes?: CadNamedCatalog<CadLinetypeDefinition>;
  layerStates?: CadNamedCatalog<CadNamedLayerState>;
  toolPalettes?: CadNamedCatalog<CadToolPalette>;
  coordinateSystems?: CadNamedCatalog<CadNamedUcs>;
  /**
   * Tablas de plumas cargadas en la SESIÓN. No usa `CadNamedCatalog` porque su
   * clave es el NOMBRE DE ARCHIVO —`acad.ctb` y `acad.stb` comparten nombre y
   * son tablas distintas— y porque el motor sólo necesita LEER: cargar una
   * pide un archivo, y eso es del anfitrión.
   */
  plotStyles?: {
    /** Nombres de archivo cargados, en orden estable. */
    list(): readonly string[];
    /** La tabla de un nombre, con o sin extensión y sin distinguir caja. */
    find(name: string): CadPlotStyleTable | null;
  };
}

/**
 * Lo que un comando pide a la INTERFAZ: abrir una paleta, un cuadro, un
 * selector de archivo.
 *
 * El motor no abre nada —no sabe que existe React— y tampoco fabrica texto de
 * interfaz. Devuelve QUÉ quiere y el anfitrión decide si puede servirlo. Así
 * `LAYER` es un comando normal, probado en Node como los demás, y la única
 * parte que depende del navegador es la línea que atiende la petición.
 */
export type CadUiTarget =
  | "layer-manager"
  | "layer-states"
  | "properties"
  | "draft-settings"
  | "osnap"
  | "options"
  | "styles"
  | "tool-palettes"
  | "ucs-manager"
  | "quick-select"
  | "filter"
  /**
   * El panel de bloques del editor, que es lo que BEDIT abre en su v1. La
   * redefinición REAL ya existe por otra puerta —BLOCK con el mismo nombre
   * redefine y los INSERT se actualizan solos— así que abrir el panel con el
   * bloque a la vista es entregar el flujo, no fingir un editor in situ que no
   * hay. `params.block` lleva el nombre para prefiltrar cuando el anfitrión
   * sepa hacerlo.
   */
  | "block-editor"
  | "script-file"
  /**
   * El GRABADOR DE ACCIONES. `params.action` dice qué se pide —`start`, `stop`,
   * `list` o `play`— y `params.name` el nombre del macro. Lo atiende el propio
   * anfitrión del motor y no un panel de React, porque grabar es quedarse con
   * la sucesión de acciones y ese hilo sólo pasa por ahí.
   */
  | "action-recorder"
  | "linetype-file"
  /**
   * Selector de archivo de `STYLESMANAGER`: el `.ctb` o `.stb` del despacho, el
   * que lleva años decidiendo qué grosor tiene cada color en sus planos. Puede
   * venir COMPRIMIDO detrás de la cabecera de AutoCAD, así que llega en bytes y
   * no en texto — mismo reparto que `image-file`, por la misma razón.
   */
  | "plot-style-file"
  /**
   * Selector de archivo de `DXFIN`. Leer un fichero es del navegador y volver a
   * meter su contenido por el motor es del anfitrión: el comando está DENTRO
   * del motor y no puede reentrar en él sin reentrar en sí mismo. Mismo reparto
   * que `script-file`, por la misma razón exacta.
   */
  | "dxf-file"
  /**
   * Selector de archivos de `MAPIMPORT` (Ola G): VARIOS a la vez, porque un
   * shapefile son cuatro archivos y dos son binarios. El anfitrión los
   * empaqueta en un texto (`geo-import-bundle.ts`) y los entrega por la misma
   * puerta que el DXF. Mismo reparto, por la misma razón exacta.
   */
  | "geo-file"
  /**
   * Selector de archivo de `IMAGEATTACH` (Ola H): el navegador decodifica la
   * imagen para saber su tamaño y la entrega como `data:` dentro de un sobre
   * JSON por la misma puerta de texto (`image-attach-payload.ts`).
   */
  | "image-file"
  /**
   * Selector de archivo de `PDFATTACH` y `PDFIMPORT`: el levantamiento del
   * topógrafo o la lámina del municipio. Llega en BYTES —un PDF no es texto—
   * y el anfitrión lo empaqueta como `data:` con
   * `cadPdfAttachPayloadFor` (`lib/cad/pdf/pdf-attach-payload.ts`). A
   * diferencia de `image-file`, el sobre NO declara páginas ni tamaños: el
   * lector de PDF vive dentro del motor y los deduce él.
   */
  | "pdf-file";

export interface CadUiRequest {
  target: CadUiTarget;
  /** Qué pestaña, qué filtro precargado… Sólo cadenas: viaja hasta React. */
  params?: Readonly<Record<string, string>>;
  /**
   * Qué hacer si nadie atiende la petición. Un comando que abre un cuadro
   * TIENE que decir qué se pierde el usuario cuando ese cuadro no existe
   * todavía en su espacio de trabajo; si no, la orden se traga en silencio.
   */
  unavailable: string;
  /**
   * `true` cuando el ANFITRIÓN contesta esta petición sin abrir nada ni pedirle
   * nada al usuario.
   *
   * Existe por un defecto concreto: `cadCommandsNeedingInterface` marca «abre un
   * cuadro» a toda orden cuyo primer paso devuelve `ui`, y el ejecutor de `.scr`
   * se para ante ellas. Con el grabador de acciones eso sería FALSO —ACTSTOP lo
   * atiende el propio anfitrión de la línea de órdenes, sin interfaz—, y el
   * módulo del ejecutor ya dice por qué un aviso falso es peor que ninguno: se
   * aprende a ignorarlo, y el día que uno sea verdad también se ignora.
   */
  scriptable?: boolean;
}

export type CadCommandResult =
  | {
      kind: "document";
      commands: readonly CadEntityCommand[];
      label: string;
      /**
       * Lo que la orden quiere DECIR además de escribir. STAIR reparte
       * contrahuellas y huellas y el dibujante tiene que leer los números sin
       * abrir el panel; sin este campo una orden que escribe es muda (el
       * anfitrión aplica el lote y no imprime la etiqueta). Se registra como
       * mensaje DESPUÉS del lote.
       */
      notice?: string;
    }
  /**
   * Cambio de ENCUADRE, no de documento.
   *
   * ZOOM, PAN y VIEW no mutan nada: mueven la cámara. Colarlos por
   * `"document"` los metería en la pila de deshacer —Ctrl+Z desharía un
   * zoom en vez de la línea anterior— y obligaría a inventar un
   * `CadEntityCommand` que no toca ninguna entidad.
   *
   * Lo que viaja es una PETICIÓN declarativa, no una `CadView` ya resuelta: el
   * comando no sabe cuánto mide el lienzo ni dónde está la envolvente del
   * dibujo, y fingir que lo sabe volvería a meter el estado de la vista dentro
   * del motor. Resolverla es trabajo del anfitrión, con
   * `applyCadViewRequest`.
   */
  | { kind: "view"; request: CadViewRequest; label: string }
  /**
   * Trabajo del ANFITRIÓN con efecto fuera del documento: trazar a PDF,
   * publicar un conjunto de planos, abrir un cuadro de configuración.
   *
   * Igual que `"view"`, viaja una petición declarativa. Un comando puro no
   * puede fabricar un PDF —necesita fuentes, `Blob` y una descarga— y meter eso
   * en el motor lo ataría al navegador y haría imposible probarlo en Node.
   */
  | { kind: "host"; request: CadHostRequest; label: string }
  | { kind: "message"; text: string }
  /**
   * Escritura de variables de sistema. UNITS, LTSCALE, COLOR, LINETYPE,
   * LWEIGHT, OSNAP y SETVAR terminan todos aquí, y las consultas la usan para
   * publicar `AREA`, `PERIMETER` y `DISTANCE` como hace AutoCAD.
   *
   * `system` marca la escritura que hace el PRODUCTO y no el usuario: es la
   * única que puede tocar una variable de sólo lectura.
   */
  | {
      kind: "variables";
      patch: Readonly<Record<string, CadSystemVariableValue>>;
      system?: boolean;
      text?: string;
    }
  | { kind: "ui"; request: CadUiRequest; text?: string }
  /**
   * Cambia lo DESIGNADO. Es el resultado de QSELECT y de FILTER, y no cabe en
   * ninguno de los otros: no toca el documento —deshacer no debe devolver una
   * selección— pero tampoco es un mensaje, porque el efecto es real.
   */
  | { kind: "selection"; entityIds: readonly string[]; text?: string }
  | { kind: "none" };

export interface CadCommandStep<S = unknown> {
  state: S;
  prompt: CadPrompt;
  accepts: CadInputMask;
  /** Geometría transitoria bajo el cursor. */
  preview?: readonly CadPreviewPath[];
  /** Modos de snap forzados sólo para este paso (p. ej. TANGENTE en CIRCLE TTR). */
  osnapOverride?: readonly SnapType[];
  /**
   * Presente cuando el comando ha terminado. Que exista `result` es lo que
   * indica el final; no hay un `done` aparte que pueda quedar descoordinado.
   */
  result?: CadCommandResult;
}

export interface CadCommandDescriptor<S = unknown> {
  /** Nombre canónico en mayúsculas. Invariante entre idiomas. */
  name: string;
  aliases: readonly string[];
  kind: CadCommandKind;
  /** Invocable con `'` dentro de otro comando, como `'ZOOM`. */
  transparent: boolean;
  selection: CadSelectionRule;
  /** Espacio o Enter con el lienzo enfocado lo repiten. */
  repeatable: boolean;
  /** `false` para consultas y vistas: no piden permiso de escritura. */
  mutates: boolean;
  /**
   * `true` si el comando sabe escribir geometría FUERA del plano XY del mundo.
   *
   * Existe por una razón concreta y medible: con un SCU apoyado en una cara
   * inclinada, un comando que aplana los puntos a `z = 0` deja el trazo en
   * pantalla donde el usuario lo puso y en el modelo un metro más abajo. Eso no
   * se ve, no da error y se descubre al exportar.
   *
   * Así que el motor lo cierra: si hay un SCU inclinado y el comando MUTA el
   * documento sin declararse espacial, el punto se rechaza con su motivo en vez
   * de aceptarse a medias. Un comando se marca cuando su geometría conserva la
   * cota de punta a punta, no cuando «debería funcionar».
   *
   * Dos grados desde la Ola C (2026-09-02):
   *
   * - `true`: dibuja EN el plano del SCU, inclinado o no (LINE, PLINE, RECTANG).
   * - `"elevation"`: conserva la cota del punto, así que honra un SCU llano
   *   pero ELEVADO (la planta a +3000) y no uno inclinado (CIRCLE, ARC y las
   *   primitivas de sólido, cuya forma vive en el plano horizontal). Un
   *   círculo sobre un faldón sería una elipse en planta, y eso el documento
   *   todavía no lo guarda; declararlo `true` mentiría exactamente ahí.
   */
  spatial?: boolean | "elevation";
  begin(context: CadCommandContext): CadCommandStep<S>;
  step(state: S, input: CadCommandInput, context: CadCommandContext): CadCommandStep<S>;
  /** Cursor que muestra el viewport: cruz para puntos, caja para seleccionar. */
  cursor?: "crosshair" | "pick" | "none";
}

/**
 * Descriptor con su estado ya olvidado. El registro guarda comandos de estados
 * distintos en la misma lista, y sin esto TypeScript no deja mezclarlos.
 */
export type CadAnyCommandDescriptor = CadCommandDescriptor<never>;

/** Convierte un descriptor tipado en uno almacenable en el registro. */
export function asCadCommand<S>(descriptor: CadCommandDescriptor<S>): CadAnyCommandDescriptor {
  return descriptor as unknown as CadAnyCommandDescriptor;
}
