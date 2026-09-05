/**
 * Anfitrión sobre un `CadDocument`. La implementación concreta del puerto.
 *
 * Hace dos cosas a la vez, y las dos hacen falta:
 *
 *  1. **Aplica en el acto** sobre un documento de trabajo, para que la rutina
 *     vea lo que acaba de escribir. `(entmake …)` seguido de `(entlast)` tiene
 *     que devolver la entidad nueva; si las escrituras se acumularan sin
 *     aplicarse, devolvería la anterior y la rutina trabajaría sobre el objeto
 *     equivocado sin enterarse.
 *  2. **Acumula el lote completo**, para que quien conduce la sesión lo pase de
 *     una sola vez por `commitNativeCommands`. Una rutina que dibuja un cajetín
 *     de cuarenta líneas es UN paso de deshacer, no cuarenta.
 *
 * Los documentos intermedios se tiran: su `meta.version` sube en cada
 * aplicación y no significa nada: la versión que cuenta es la que produce el
 * anfitrión real al aplicar el lote entero.
 *
 * ## Cómo lo monta el editor
 *
 * Construye el anfitrión con el documento cargado, corre la rutina, y al
 * terminar pasa `pendingCommands` a `commitNativeCommands`. Ahí es donde vive
 * la disciplina CAS —`expectedCadDocumentVersion`, la ruta gzip para más de un
 * mega, la resolución del 409—, y el subsistema LISP no la duplica ni la
 * conoce: la hereda por construcción, porque su única salida es esa.
 */
import {
  type CadDocument,
  type CadEntity,
  type CadLayerDef,
} from "../cad/cad-document";
import {
  executeCadEntityCommandBatch,
  type CadEntityCommand,
} from "../cad/entity-commands";
import {
  createCadVariableAccess,
  type CadVariableAccess,
} from "../cad/system-variables";
import type { LispHostServices } from "./host";

export interface CadLispHostOptions {
  /** Capa de las entidades que no declaran la suya. */
  activeLayer?: string;
  /**
   * Generador de identificadores. Inyectado para que las specs y la golden
   * sean deterministas: con `crypto.randomUUID` no se puede comparar el
   * documento que produjo una rutina con el que debería producir.
   */
  newEntityId?: () => string;
  /** Tope de escrituras por sesión. Véase abajo. */
  maxCommands?: number;
  /**
   * La tabla de variables de sistema DE LA SESIÓN, prestada por el editor.
   *
   * Es la misma que escriben SETVAR, UNITS y OSNAP tecleados, y por eso se
   * presta en vez de fabricarse: con dos tablas, `(getvar "OSMODE")` no vería
   * el `OSNAP` que el dibujante acaba de configurar, y el `(setvar "OSMODE" 0)`
   * de una rutina no apagaría nada de lo que él tiene puesto. Quien no la
   * presta —las specs, y cualquier anfitrión que todavía no la tenga a mano—
   * recibe una tabla propia sembrada con el documento; entonces las variables
   * viven lo que vive la ejecución, que es un límite, no una mentira.
   */
  variables?: CadVariableAccess;
}

/**
 * Tope de escrituras de una sola rutina. No es un límite de rendimiento: es la
 * última barrera del sandbox por el lado del documento. Una rutina puede
 * respetar el presupuesto de celdas y aun así intentar crear un millón de
 * entidades en un bucle barato, y un documento de un millón de entidades nuevas
 * no es algo que el usuario pueda deshacer cómodamente ni guardar en un CAS.
 */
const DEFAULT_MAX_COMMANDS = 20_000;

export class CadDocumentLispHost implements LispHostServices {
  private working: CadDocument;
  private index: Map<string, CadEntity>;
  private readonly batch: CadEntityCommand[] = [];
  private readonly labels: string[] = [];
  private readonly maxCommands: number;
  private readonly systemVariables: CadVariableAccess;
  private serial = 0;

  constructor(
    document: CadDocument,
    private readonly options: CadLispHostOptions = {},
  ) {
    this.working = document;
    this.index = new Map(document.entities.map((entity) => [entity.id, entity]));
    this.maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS;
    // La tabla propia nace SEMBRADA con lo que el documento ya dice: la capa
    // activa en `CLAYER` y la unidad del dibujo en `INSUNITS`. Sembrarla con
    // los valores de fábrica habría hecho que `(getvar "CLAYER")` contestara
    // «0» estando el dibujante en MUROS — que es peor que no contestar.
    this.systemVariables =
      options.variables ??
      createCadVariableAccess({
        CLAYER: options.activeLayer ?? "0",
        INSUNITS: insunitsOfDocument(document),
      });
  }

  document(): CadDocument {
    return this.working;
  }

  /**
   * Ids en ORDEN DE DIBUJO. Se filtra contra el índice porque
   * `modelSpace.entityIds` puede citar una entidad que ya no está en un
   * documento heredado, y `entnext` no debe entregar un nombre muerto.
   */
  entityIds(): readonly string[] {
    return this.working.modelSpace.entityIds.filter((id) => this.index.has(id));
  }

  entity(id: string): CadEntity | undefined {
    return this.index.get(id);
  }

  layers(): readonly CadLayerDef[] {
    return this.working.layers;
  }

  /**
   * La capa de los objetos nuevos ES `CLAYER`, no un campo aparte.
   *
   * Que lo sean el mismo dato es lo que hace que `(setvar "CLAYER" "MUROS")`
   * tenga efecto de verdad: la entidad siguiente nace en MUROS. Con dos sitios
   * donde guardarlo, esa escritura habría sido un «éxito sin efecto» de manual
   * —la tabla diría MUROS y el `entmake` seguiría dibujando en «0»—, que es
   * justo lo que la regla 2 de la casa prohíbe.
   */
  activeLayer(): string {
    const clayer = this.systemVariables.get("CLAYER");
    if (typeof clayer === "string" && clayer !== "") return clayer;
    return this.options.activeLayer ?? "0";
  }

  variables(): CadVariableAccess {
    return this.systemVariables;
  }

  newEntityId(): string {
    if (this.options.newEntityId) return this.options.newEntityId();
    this.serial += 1;
    return `lisp:${this.serial}`;
  }

  apply(commands: readonly CadEntityCommand[], label: string): void {
    if (commands.length === 0) return;
    if (this.batch.length + commands.length > this.maxCommands)
      throw new Error(
        `La rutina superó el tope de ${this.maxCommands} escrituras en el documento. ` +
          `Se cortó antes de aplicar "${label}".`,
      );
    const result = executeCadEntityCommandBatch(this.working, commands, label);
    this.working = result.document;
    this.index = new Map(this.working.entities.map((entity) => [entity.id, entity]));
    this.batch.push(...commands);
    this.labels.push(label);
  }

  /** El lote completo, para pasarlo por `commitNativeCommands`. */
  get pendingCommands(): readonly CadEntityCommand[] {
    return this.batch;
  }

  /** Etiqueta única del paso de deshacer que producirá la rutina. */
  undoLabel(routine: string): string {
    return `LISP ${routine}`;
  }

  /** Qué hizo la rutina, en orden. Sirve para diagnosticar y para las specs. */
  get appliedLabels(): readonly string[] {
    return this.labels;
  }
}

/**
 * `meta.unit` → código INSUNITS del DXF.
 *
 * La unidad del dibujo la lleva la cabecera del documento, y la tabla de
 * variables la publica bajo el nombre con el que la pregunta una rutina traída
 * de fuera. Vive aquí —al lado de quien siembra la tabla— para que el mapeo
 * exista UNA vez: escrito en dos sitios, el día que alguien añada los pies
 * quedaría medio producto contestando 4.
 */
export function insunitsOfDocument(document: CadDocument): number {
  const unit = document.meta.unit;
  if (unit === "in") return 1;
  if (unit === "ft") return 2;
  if (unit === "cm") return 5;
  if (unit === "m") return 6;
  return 4;
}
