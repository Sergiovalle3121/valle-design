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
  private serial = 0;

  constructor(
    document: CadDocument,
    private readonly options: CadLispHostOptions = {},
  ) {
    this.working = document;
    this.index = new Map(document.entities.map((entity) => [entity.id, entity]));
    this.maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS;
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

  activeLayer(): string {
    return this.options.activeLayer ?? "0";
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
