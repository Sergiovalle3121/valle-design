/**
 * BEDIT — sesión de edición en el propio lienzo de una definición de bloque.
 *
 * ## El problema que resuelve
 *
 * Redefinir un bloque ya funciona: `redefineCadBlock` sustituye su lista de
 * entidades y cada INSERT vivo se regenera solo (`resolveCadInsert` lee la
 * definición en cada resolución, no guarda copia). Lo que falta es la
 * SUPERFICIE de edición: hoy no hay manera de dibujar/mover/recortar dentro
 * de un bloque sin salir a «seleccionar geometría + BLOCK con el mismo
 * nombre» (el panel de bloques, `engine/commands/blocks-edit.ts`).
 *
 * ## Por qué esto NO es una segunda vía de mutación
 *
 * `entity-commands.ts` lo dice de su propio archivo: «todo cambio de
 * geometría del editor pasa por aquí, no hay una segunda vía» — y
 * `applyCadBlockEditCommands`, más abajo, lo respeta al pie de la letra:
 * llama a `executeCadEntityCommand`/`executeCadEntityCommandBatch`,
 * exactamente las mismas funciones que usa el editor real, sin reimplementar
 * ni un caso.
 *
 * Lo que SÍ es distinto es el DOCUMENTO al que se aplican. Una sesión BEDIT
 * opera sobre un documento de EJEMPLAR (las `entities` del bloque, con
 * `layers`/`styles`/`blocks` compartidos con el documento real para que el
 * texto y los INSERT anidados resuelvan) que nunca es
 * `loadedCadDocumentRef.current`. Confundir los dos —aplicar una edición de
 * sesión por el embudo del documento real (`commitCanonicalDocument` /
 * `commitBlockMutation` en `Layout3DEditor.tsx`)— dispararía el autoguardado
 * (`markDirty`, PATCH a los 2s) con contenido de fragmento de bloque y
 * pisaría el dibujo real; por eso este módulo no importa `markDirty` ni
 * ninguna ref del editor — no tiene forma de tocarlos aunque quisiera. La
 * única vez que el documento real cambia es al GUARDAR
 * (`saveCadBlockEditSession`), una única llamada, y va por el mismo
 * `redefineCadBlock` que ya usa el panel de bloques.
 *
 * ## Qué queda fuera de la v1 (decisión explícita, no olvido)
 *
 * - **ATTDEF**: `block-workflow.ts` saca las definiciones de atributo de
 *   `block.entities` y las guarda aparte en `block.attributes` al definir el
 *   bloque. Esta sesión edita `block.entities` tal cual, así que los
 *   marcadores ATTDEF (p. ej. de un cajetín) no aparecen ni son editables.
 * - **Bloques anidados / XREF**: se resuelven como unidad opaca
 *   (`resolveDefinition` ya lo hace), no se puede entrar a editarlos desde
 *   dentro de esta sesión.
 * - **Tabla de capas**: la sesión COMPARTE `layers` con el documento real
 *   para que el color/bloqueo por capa se lea igual, pero si algo llegara a
 *   crear o editar una capa durante la sesión ese cambio NO se conserva al
 *   guardar — `saveCadBlockEditSession` sólo traslada `entities`. Ningún
 *   comando de tabla de capas se ofrece todavía desde dentro de una sesión
 *   (eso es de la fase de lienzo); si algún día se ofrece, tendrá que
 *   fundirse con el documento real aquí primero.
 * - **Restricciones paramétricas**: la sesión nace con `constraints: []`, así
 *   que `propagateCadConstraints` es un no-op dentro de ella a propósito.
 */
import {
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
} from "./cad-document";
import {
  executeCadEntityCommand,
  executeCadEntityCommandBatch,
  type CadEntityCommand,
  type CadEntityCommandResult,
} from "./entity-commands";
import { propagateCadConstraints } from "./constraint-propagation";
import { redefineCadBlock } from "./professional-blocks";
import { CanonicalHistory } from "./canonical-history";

/** Recorte del documento real que necesita abrir una sesión: nada más. */
export type CadBlockEditSessionSource = Pick<
  CadDocument,
  "blocks" | "layers" | "styles" | "meta"
>;

export interface CadBlockEditSession {
  /** `id` resuelto del bloque, no la clave (nombre o id) que se pasó a `begin`. */
  readonly blockId: string;
  readonly blockName: string;
  /**
   * Única fuente de verdad del documento de sesión: `history.value()` ES el
   * documento vigente. No se duplica en un campo aparte para que no pueda
   * desincronizarse — ver `applyCadBlockEditCommands`.
   */
  readonly history: CanonicalHistory<CadDocument>;
}

function buildScratchDocument(
  source: CadBlockEditSessionSource,
  block: CadBlockDefinition,
): CadDocument {
  const entities: CadEntity[] = [...block.entities];
  return {
    meta: {
      version: 0,
      schema: source.meta.schema,
      unit: source.meta.unit,
      linetypeScale: source.meta.linetypeScale,
    },
    layers: source.layers,
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: source.styles,
    blocks: source.blocks,
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/**
 * Abre una sesión BEDIT sobre `blockKey` (acepta `id` o `name`, igual que el
 * resto de operaciones de bloque). Lanza si el bloque no existe o su
 * definición está vacía — un documento de sesión sin entidades no serviría
 * para nada y `redefineCadBlock` lo rechazaría igualmente al guardar.
 */
export function beginCadBlockEditSession(
  source: CadBlockEditSessionSource,
  blockKey: string,
): CadBlockEditSession {
  const block = source.blocks.find(
    (candidate) => candidate.id === blockKey || candidate.name === blockKey,
  );
  if (!block) throw new Error(`Block ${blockKey} was not found.`);
  if (!block.entities.length)
    throw new Error(`Block ${blockKey} has no entities to edit.`);
  return {
    blockId: block.id,
    blockName: block.name,
    history: new CanonicalHistory<CadDocument>(buildScratchDocument(source, block)),
  };
}

/**
 * Aplica un lote de comandos al documento de sesión — el MISMO ejecutor que
 * usa el editor real (ver el comentario de cabecera). Cada llamada deja un
 * paso en `session.history`, aislado del historial del documento real porque
 * es una instancia de `CanonicalHistory` propia de la sesión, nunca la del
 * editor.
 */
export function applyCadBlockEditCommands(
  session: CadBlockEditSession,
  commands: readonly CadEntityCommand[],
  label: string,
): CadEntityCommandResult {
  if (commands.length === 0)
    throw new Error("A block-edit command batch needs at least one command.");
  const document = session.history.value();
  const result =
    commands.length === 1
      ? executeCadEntityCommand(document, commands[0])
      : executeCadEntityCommandBatch(document, commands, label);
  const touchedIds = new Set([
    ...result.affectedEntityIds,
    ...result.createdEntityIds,
    ...result.deletedEntityIds,
  ]);
  const propagated = propagateCadConstraints(
    result.document,
    touchedIds,
  ).document;
  session.history.checkpoint(propagated);
  return { ...result, document: propagated };
}

/**
 * Traslada el resultado de la sesión al documento real: sustituye
 * `block.entities` por el estado actual de la sesión y sube la versión del
 * bloque, así que cada INSERT vivo se regenera. Es la ÚNICA escritura al
 * documento real que produce una sesión, y ocurre una vez, al guardar — nunca
 * durante la edición. Pensada para usarse directamente como el `mutate` de
 * `commitBlockMutation`, igual que ya hace `redefineProfessionalBlock` para
 * la redefinición por selección:
 *
 * ```ts
 * commitBlockMutation(
 *   (document) => saveCadBlockEditSession(document, session),
 *   nativeSelectionIdsRef.current,
 *   "Definición actualizada; todas sus instancias se regeneraron.",
 * );
 * ```
 */
export function saveCadBlockEditSession(
  document: CadDocument,
  session: CadBlockEditSession,
): CadDocument {
  return redefineCadBlock(
    document,
    session.blockId,
    session.history.value().entities,
  );
}
