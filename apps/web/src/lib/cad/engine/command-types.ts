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
  CadBlockDefinition, CadConstraint, CadDocument, CadEntity, CadPaperSpace,
  CadParameter, CadPoint2,
} from "../cad-document";
import type { CadBounds } from "../entity-runtime";
import type { CadEntityCommand } from "../entity-commands";
import type { SnapType } from "../snap-engine";
// Sólo TIPOS: la importación se borra al compilar, así que el motor sigue sin
// depender en tiempo de ejecución ni de la vista, ni del trazado, ni de las
// referencias externas, y no hay ciclo que `benchmark:cad:smoke` pueda destapar.
import type { CadViewRequest } from "../view/view-navigation";
import type { CadXrefCatalogEntry } from "../xref/xref-paths";
import type { CadHostRequest } from "./host-requests";

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

export type CadCommandInput =
  | { kind: "point"; point: CadPoint2; snap?: SnapType; source: "pointer" | "typed" | "tracked" }
  | { kind: "distance"; value: number }
  | { kind: "angle"; degrees: number }
  | { kind: "text"; value: string }
  | { kind: "keyword"; keyword: string }
  | { kind: "selection"; entityIds: readonly string[] }
  | { kind: "entityPick"; entityId: string; point: CadPoint2 }
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
  "meta" | "entities" | "blocks" | "layers" | "styles" | "externalReferences" | "modelSpace"
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
  selection: readonly string[];
  activeLayer: string;
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
  /** Posición actual del puntero en unidades de dibujo, si se conoce. */
  cursor?: CadPoint2;
  /** Rastro de lo hecho en esta sesión. Ver `CadCommandSession`. */
  session?: CadCommandSession;
  /**
   * Generador de identificadores, inyectado. Los comandos no llaman a
   * `crypto.randomUUID()` por su cuenta: si lo hicieran, sus specs no serían
   * deterministas y no se podrían comparar documentos.
   */
  newEntityId: () => string;
}

export type CadCommandResult =
  | { kind: "document"; commands: readonly CadEntityCommand[]; label: string }
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
