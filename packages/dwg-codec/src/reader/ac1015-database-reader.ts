/**
 * Lector de la BASE DE DATOS neutral R2000 (AC1015) — fase D4, el ensamblado.
 *
 * El hito donde el laboratorio deja de leer objetos sueltos: `readAc1015Database`
 * orquesta TODO el pipeline existente — firma, cabecera de archivo, marcos de
 * las secciones de variables y clases, mapa de objetos y, por cada offset del
 * mapa, envoltura → prólogo/común → decodificador por tipo — y devuelve una
 * base neutral: capas, bloques con su contenido, entidades de model space,
 * los tipos aún no decodificados ENUMERADOS (jamás descartados en silencio) y
 * diagnósticos.
 *
 * Resolución de referencias (certezas declaradas en el worklog):
 * - **Pertenencia entidad→bloque**: por el propietario del común (modo 0) —
 *   la cabeza del flujo de handles que la fase D4 interpreta — contra los
 *   BLOCK_RECORD del mapa. Un propietario nulo, desconocido o que no es un
 *   BLOCK_RECORD deja la entidad en model space CON diagnóstico.
 * - **INSERT→bloque**: por el hard pointer del flujo del INSERT. Si no
 *   resuelve a un BLOCK_RECORD, el INSERT queda con `insertedBlockName`
 *   indefinido y un diagnóstico de error — no silencioso.
 * - **BLOCK/ENDBLK**: se atan a su registro por el propietario; un nombre de
 *   BLOCK que no coincide con el del registro es diagnóstico, no corrupción.
 *
 * Reglas del laboratorio:
 * - **Presupuesto cobrado**: `createDwgLimits` + `ResourceBudget`; el archivo
 *   se cobra al snapshot y al cursor, y cada objeto cobra ADEMÁS su cuerpo al
 *   decodificarlo — límites bajos fallan con el error tipado de recursos.
 * - **Fallo cerrado**: corrupción en cualquier tramo aborta la lectura con su
 *   error tipado y offset; sólo lo `unsupported` se enumera y continúa.
 * - **Determinista**: mismo archivo y mismos límites → misma base, en el
 *   orden del mapa de objetos.
 *
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER); implementación
 * original; el producto permanece `available:false`.
 */
import type { DwgDiagnostic } from "../api/diagnostics.js";
import { createDwgLimits, type DwgLimitOverrides } from "../api/limits.js";
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import type { DwgResolvedHandle } from "../codecs/bitcodes.js";
import { parseAc1015FileHeader } from "../container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../container/ac1015-object-map.js";
import {
  AC1015_CLASSES_SENTINELS,
  AC1015_HEADER_VARIABLES_SENTINELS,
  readAc1015SectionFrame,
} from "../container/ac1015-section-frame.js";
import { detectDwgSignature } from "../container/signature.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import {
  decodeAc1015EntityBody,
  AC1015_TYPE_3DFACE,
  AC1015_TYPE_ARC,
  AC1015_TYPE_ATTDEF,
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_ELLIPSE,
  AC1015_TYPE_RAY,
  AC1015_TYPE_SOLID,
  AC1015_TYPE_SPLINE,
  AC1015_TYPE_TRACE,
  AC1015_TYPE_XLINE,
  AC1015_TYPE_DIM_ALIGNED,
  AC1015_TYPE_DIM_ANGULAR_2LN,
  AC1015_TYPE_DIM_ANGULAR_3PT,
  AC1015_TYPE_DIM_DIAMETER,
  AC1015_TYPE_DIM_LINEAR,
  AC1015_TYPE_DIM_ORDINATE,
  AC1015_TYPE_DIM_RADIUS,
  AC1015_TYPE_HATCH,
  AC1015_TYPE_INSERT,
  AC1015_TYPE_LEADER,
  AC1015_TYPE_MLINE,
  AC1015_TYPE_TOLERANCE,
  AC1015_TYPE_VIEWPORT,
  AC1015_TYPE_LINE,
  AC1015_TYPE_LWPOLYLINE,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_POINT,
  AC1015_TYPE_POLYLINE_2D,
  AC1015_TYPE_POLYLINE_3D,
  AC1015_TYPE_POLYLINE_MESH,
  AC1015_TYPE_POLYLINE_PFACE,
  AC1015_TYPE_SEQEND,
  AC1015_TYPE_TEXT,
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
  type Ac1015DecodedEntity,
} from "../objects/entities-core.js";
import {
  AC1015_TYPE_BLOCK,
  AC1015_TYPE_BLOCK_CONTROL,
  AC1015_TYPE_BLOCK_HEADER,
  AC1015_TYPE_ENDBLK,
  decodeAc1015BlockBeginBody,
  decodeAc1015BlockControlBody,
  decodeAc1015BlockEndBody,
  decodeAc1015BlockRecordBody,
  type Ac1015DecodedBlockBegin,
  type Ac1015DecodedBlockEnd,
} from "../objects/table-block.js";
import {
  AC1015_TYPE_LAYER,
  AC1015_TYPE_LAYER_CONTROL,
  decodeAc1015LayerBody,
  decodeAc1015LayerControlBody,
} from "../objects/table-layer.js";
import { createInputSnapshot } from "../security/input-snapshot.js";
import { DwgParseError, throwDwgError } from "../security/parse-error.js";
import { ResourceBudget } from "../security/resource-budget.js";

/** Una capa de la base neutral. */
export interface Ac1015DatabaseLayer {
  readonly handle: number;
  /** Bytes del nombre en la página de códigos del dibujo. */
  readonly name: readonly number[];
  readonly colorIndex: number;
  /** BS de estado crudo (semántica bit a bit pendiente de corpus). */
  readonly stateFlags: number;
}

/** Una entidad colocada en la base: geometría, capa y referencia de INSERT. */
export interface Ac1015DatabaseEntityRecord {
  readonly handle: number;
  readonly entity: DwgGeometryEntity;
  /** Handle de capa resuelto del flujo; `undefined` cuando viaja nulo. */
  readonly layerHandle: number | undefined;
  /** Sólo INSERT: nombre del bloque insertado, resuelto por su handle. */
  readonly insertedBlockName: readonly number[] | undefined;
  /** Sólo INSERT con ATTRIBs: los atributos atados por su propietario. */
  readonly attributes: readonly Ac1015DatabaseEntityRecord[] | undefined;
  /** Sólo POLYLINE clásica: sus VERTEX (y caras polyface) en orden del mapa. */
  readonly vertices: readonly Ac1015DatabaseEntityRecord[] | undefined;
  /** Sólo INSERT/POLYLINE: handle del SEQEND que cierra su secuencia. */
  readonly sequenceEndHandle: number | undefined;
}

/** Un bloque de la base: registro, marcadores y contenido en orden del mapa. */
export interface Ac1015DatabaseBlock {
  readonly handle: number;
  readonly name: readonly number[];
  /** Handle de la entidad BLOCK que abre el contenido, si apareció. */
  readonly blockBeginHandle: number | undefined;
  /** Handle de la entidad ENDBLK que cierra el contenido, si apareció. */
  readonly blockEndHandle: number | undefined;
  readonly entities: readonly Ac1015DatabaseEntityRecord[];
}

/** Un objeto que el laboratorio aún no decodifica: enumerado, nunca callado. */
export interface Ac1015UnsupportedDatabaseObject {
  readonly handle: number;
  /** Tipo BS con que arranca su cuerpo. */
  readonly type: number;
}

/** La base de datos neutral que devuelve el ensamblado de la fase D4. */
export interface Ac1015NeutralDatabase {
  readonly layers: readonly Ac1015DatabaseLayer[];
  readonly blocks: readonly Ac1015DatabaseBlock[];
  readonly modelSpaceEntities: readonly Ac1015DatabaseEntityRecord[];
  readonly unsupported: readonly Ac1015UnsupportedDatabaseObject[];
  readonly diagnostics: readonly DwgDiagnostic[];
}

/** Identificadores de registro del directorio (hechos ya registrados). */
const HEADER_VARIABLES_RECORD_ID = 0;
const CLASSES_RECORD_ID = 1;
const OBJECT_MAP_RECORD_ID = 2;

/** Tipos que viajan como miembros de una secuencia con propietario. */
const SEQUENCE_MEMBER_TYPES: ReadonlySet<number> = new Set([
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_SEQEND,
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
]);

/** Cabeceras de POLYLINE clásica: los destinos válidos de un VERTEX. */
const POLYLINE_HEADER_TYPES: ReadonlySet<number> = new Set([
  AC1015_TYPE_POLYLINE_2D,
  AC1015_TYPE_POLYLINE_3D,
  AC1015_TYPE_POLYLINE_MESH,
  AC1015_TYPE_POLYLINE_PFACE,
]);

/** Los VERTEX de todas las variantes (caras polyface incluidas). */
const VERTEX_TYPES: ReadonlySet<number> = new Set([
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
]);

/** Un objeto decodificado en la primera pasada, aún sin ensamblar. */
type DecodedObject =
  | { readonly kind: "entity"; readonly handle: number; readonly offset: number; readonly decoded: Ac1015DecodedEntity }
  | { readonly kind: "layer"; readonly handle: number; readonly offset: number; readonly name: readonly number[]; readonly colorIndex: number; readonly stateFlags: number }
  | { readonly kind: "blockRecord"; readonly handle: number; readonly offset: number; readonly name: readonly number[] }
  | { readonly kind: "blockBegin"; readonly handle: number; readonly offset: number; readonly decoded: Ac1015DecodedBlockBegin }
  | { readonly kind: "blockEnd"; readonly handle: number; readonly offset: number; readonly decoded: Ac1015DecodedBlockEnd }
  | { readonly kind: "control"; readonly handle: number; readonly offset: number };

/**
 * Lee la base de datos neutral completa de un archivo AC1015. `input` son los
 * bytes hostiles del archivo; `limitOverrides` ajusta los topes de
 * `createDwgLimits` (el presupuesto se cobra por byte y por objeto).
 */
export function readAc1015Database(
  input: Uint8Array,
  limitOverrides?: DwgLimitOverrides,
): Ac1015NeutralDatabase {
  const limits = createDwgLimits(limitOverrides);
  const budget = new ResourceBudget(limits);
  const snapshot = createInputSnapshot(input, limits, budget);

  // El probe de firma decide ANTES de tocar estructura: otra versión
  // reconocida es capacidad ausente, no corrupción.
  const signature = detectDwgSignature(snapshot, budget);
  if (signature.code !== "AC1015") {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "Only the AC1015 container is read by the phase-D4 laboratory.",
    );
  }

  const cursor = new BoundedByteCursor(snapshot, budget);
  const header = parseAc1015FileHeader(cursor);

  // Los tres registros obligatorios del contenedor mínimo, únicos por id. Un
  // id repetido sería un directorio ambiguo: fallo cerrado, no elegir.
  const headerVariablesRecord = requireRecord(header.records, HEADER_VARIABLES_RECORD_ID);
  const classesRecord = requireRecord(header.records, CLASSES_RECORD_ID);
  const objectMapRecord = requireRecord(header.records, OBJECT_MAP_RECORD_ID);

  // Los marcos se VERIFICAN (centinelas + CRC); sus payloads siguen opacos —
  // decodificar variables de cabecera y clases es de fases posteriores.
  readAc1015SectionFrame(cursor, headerVariablesRecord, AC1015_HEADER_VARIABLES_SENTINELS);
  readAc1015SectionFrame(cursor, classesRecord, AC1015_CLASSES_SENTINELS);

  const mapEntries = readAc1015ObjectMap(cursor, objectMapRecord, limits);

  // Primera pasada: decodificar cada objeto del mapa. El presupuesto cobra el
  // cuerpo OTRA vez por decodificarlo — leerlo del archivo ya lo cobró el
  // cursor — de modo que un archivo con muchos objetos paga por objeto.
  const decodedObjects: DecodedObject[] = [];
  const unsupported: Ac1015UnsupportedDatabaseObject[] = [];
  for (const entry of mapEntries) {
    const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
    budget.consume(envelope.bodyBytes.length, entry.offset);
    const decoded = decodeMappedObject(envelope.type, envelope.bodyBytes, entry);
    if (decoded === null) {
      unsupported.push(Object.freeze({ handle: entry.handle, type: envelope.type }));
      continue;
    }
    decodedObjects.push(decoded);
  }

  return assembleDatabase(decodedObjects, unsupported);
}

/** Exactamente un registro del directorio con el id pedido. */
function requireRecord(
  records: readonly { readonly id: number; readonly start: number; readonly size: number }[],
  id: number,
): { readonly id: number; readonly start: number; readonly size: number } {
  const matches = records.filter((record) => record.id === id);
  if (matches.length !== 1) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "The section directory must name each required section exactly once.",
    );
  }
  return matches[0]!;
}

/**
 * Decodifica un cuerpo según su tipo BS. Devuelve `null` cuando el tipo no
 * está cubierto por el laboratorio — el llamador lo ENUMERA como unsupported;
 * la corrupción, en cambio, se propaga y aborta la lectura.
 */
function decodeMappedObject(
  type: number,
  bodyBytes: Uint8Array,
  entry: { readonly handle: number; readonly offset: number },
): DecodedObject | null {
  try {
    switch (type) {
      case AC1015_TYPE_LINE:
      case AC1015_TYPE_POINT:
      case AC1015_TYPE_CIRCLE:
      case AC1015_TYPE_ARC:
      case AC1015_TYPE_LWPOLYLINE:
      case AC1015_TYPE_TEXT:
      case AC1015_TYPE_INSERT:
      case AC1015_TYPE_ATTRIB:
      case AC1015_TYPE_ATTDEF:
      case AC1015_TYPE_SEQEND:
      case AC1015_TYPE_MTEXT:
      case AC1015_TYPE_DIM_ORDINATE:
      case AC1015_TYPE_DIM_LINEAR:
      case AC1015_TYPE_DIM_ALIGNED:
      case AC1015_TYPE_DIM_ANGULAR_3PT:
      case AC1015_TYPE_DIM_ANGULAR_2LN:
      case AC1015_TYPE_DIM_RADIUS:
      case AC1015_TYPE_DIM_DIAMETER:
      case AC1015_TYPE_POLYLINE_2D:
      case AC1015_TYPE_POLYLINE_3D:
      case AC1015_TYPE_POLYLINE_MESH:
      case AC1015_TYPE_POLYLINE_PFACE:
      case AC1015_TYPE_VERTEX_2D:
      case AC1015_TYPE_VERTEX_3D:
      case AC1015_TYPE_VERTEX_MESH:
      case AC1015_TYPE_VERTEX_PFACE:
      case AC1015_TYPE_VERTEX_PFACE_FACE:
      case AC1015_TYPE_3DFACE:
      case AC1015_TYPE_ELLIPSE:
      case AC1015_TYPE_RAY:
      case AC1015_TYPE_SOLID:
      case AC1015_TYPE_SPLINE:
      case AC1015_TYPE_TRACE:
      case AC1015_TYPE_XLINE:
      case AC1015_TYPE_VIEWPORT:
      case AC1015_TYPE_LEADER:
      case AC1015_TYPE_TOLERANCE:
      case AC1015_TYPE_MLINE:
      case AC1015_TYPE_HATCH: {
        const decoded = decodeAc1015EntityBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return { kind: "entity", handle: entry.handle, offset: entry.offset, decoded };
      }
      case AC1015_TYPE_LAYER: {
        const decoded = decodeAc1015LayerBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return {
          kind: "layer",
          handle: entry.handle,
          offset: entry.offset,
          name: decoded.layer.name,
          colorIndex: decoded.layer.color.index,
          stateFlags: decoded.layer.stateFlags,
        };
      }
      case AC1015_TYPE_LAYER_CONTROL: {
        const decoded = decodeAc1015LayerControlBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return { kind: "control", handle: entry.handle, offset: entry.offset };
      }
      case AC1015_TYPE_BLOCK_HEADER: {
        const decoded = decodeAc1015BlockRecordBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return {
          kind: "blockRecord",
          handle: entry.handle,
          offset: entry.offset,
          name: decoded.record.name,
        };
      }
      case AC1015_TYPE_BLOCK_CONTROL: {
        const decoded = decodeAc1015BlockControlBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return { kind: "control", handle: entry.handle, offset: entry.offset };
      }
      case AC1015_TYPE_BLOCK: {
        const decoded = decodeAc1015BlockBeginBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return { kind: "blockBegin", handle: entry.handle, offset: entry.offset, decoded };
      }
      case AC1015_TYPE_ENDBLK: {
        const decoded = decodeAc1015BlockEndBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return { kind: "blockEnd", handle: entry.handle, offset: entry.offset, decoded };
      }
      default:
        return null;
    }
  } catch (error) {
    if (
      error instanceof DwgParseError &&
      error.detail.code === "DWG_VERSION_DECODER_UNSUPPORTED"
    ) {
      // Un cuerpo de tipo conocido con rasgos que el laboratorio no modela
      // (p. ej. bits de bandera R2010+) también se ENUMERA, no se descarta.
      return null;
    }
    if (error instanceof DwgParseError) {
      // El decodificador habla en offsets relativos al cuerpo; el ensamblado
      // conoce el archivo: se TRASLADA el error a su byte real.
      throwDwgError(
        error.detail.code,
        error.detail.category,
        entry.offset + error.detail.offset,
        error.detail.message,
      );
    }
    throw error;
  }
}

/**
 * El índice y el objeto deben contar la misma historia: un cuerpo cuyo handle
 * propio no es el del mapa es un archivo mentiroso (decisión de laboratorio
 * declarada), no una discrepancia que promediar.
 */
function assertBodyHandleMatchesMap(
  bodyHandle: number,
  entry: { readonly handle: number; readonly offset: number },
): void {
  if (bodyHandle !== entry.handle) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.offset,
      "The object body handle does not match its object-map entry.",
    );
  }
}

/** Segunda pasada: resolver referencias y ensamblar la base neutral. */
function assembleDatabase(
  decodedObjects: readonly DecodedObject[],
  unsupported: readonly Ac1015UnsupportedDatabaseObject[],
): Ac1015NeutralDatabase {
  const diagnostics: DwgDiagnostic[] = [];
  const layers: Ac1015DatabaseLayer[] = [];
  const modelSpace: MutableEntityRecord[] = [];

  // Los BLOCK_RECORD primero: son el destino de todas las resoluciones y el
  // mapa no garantiza que aparezcan antes que sus entidades.
  interface MutableBlock {
    readonly handle: number;
    readonly name: readonly number[];
    blockBeginHandle: number | undefined;
    blockEndHandle: number | undefined;
    readonly entities: MutableEntityRecord[];
  }
  const blocksByHandle = new Map<number, MutableBlock>();
  const blockOrder: MutableBlock[] = [];
  const entityByHandle = new Map<
    number,
    { readonly record: MutableEntityRecord; readonly type: number }
  >();
  const pendingSequenceMembers: {
    readonly object: Extract<DecodedObject, { kind: "entity" }>;
    readonly record: MutableEntityRecord;
  }[] = [];
  for (const object of decodedObjects) {
    if (object.kind !== "blockRecord") continue;
    const block: MutableBlock = {
      handle: object.handle,
      name: object.name,
      blockBeginHandle: undefined,
      blockEndHandle: undefined,
      entities: [],
    };
    blocksByHandle.set(object.handle, block);
    blockOrder.push(block);
  }

  for (const object of decodedObjects) {
    switch (object.kind) {
      case "blockRecord":
      case "control":
        break;
      case "layer":
        layers.push(
          Object.freeze({
            handle: object.handle,
            name: object.name,
            colorIndex: object.colorIndex,
            stateFlags: object.stateFlags,
          }),
        );
        break;
      case "blockBegin": {
        const owner = resolveToBlock(object.decoded.references.owner, blocksByHandle);
        if (owner === undefined) {
          diagnostics.push(
            diagnostic(
              "database-block-marker-unresolved",
              "warning",
              object.offset,
              "A BLOCK entity does not resolve to a known block record; it was recorded but not attached.",
            ),
          );
          break;
        }
        owner.blockBeginHandle = object.handle;
        if (!sameBytes(object.decoded.name, owner.name)) {
          diagnostics.push(
            diagnostic(
              "database-block-name-mismatch",
              "warning",
              object.offset,
              "A BLOCK entity name does not match its block record name.",
            ),
          );
        }
        break;
      }
      case "blockEnd": {
        const owner = resolveToBlock(object.decoded.references.owner, blocksByHandle);
        if (owner === undefined) {
          diagnostics.push(
            diagnostic(
              "database-block-marker-unresolved",
              "warning",
              object.offset,
              "An ENDBLK entity does not resolve to a known block record; it was recorded but not attached.",
            ),
          );
          break;
        }
        owner.blockEndHandle = object.handle;
        break;
      }
      case "entity": {
        const record = buildEntityRecord(object, blocksByHandle, diagnostics);
        const { common } = object.decoded;
        entityByHandle.set(object.handle, { record, type: common.type });
        // Los miembros de secuencia (ATTRIB tras un INSERT, VERTEX de una
        // POLYLINE clásica, SEQEND que cierra ambas) se atan a su propietario
        // en una segunda pasada: el mapa no garantiza que el propietario
        // aparezca antes que sus miembros.
        if (
          common.entityMode === 0 &&
          SEQUENCE_MEMBER_TYPES.has(common.type)
        ) {
          pendingSequenceMembers.push({ object, record });
          break;
        }
        placeEntity(object, record);
        break;
      }
    }
  }

  // Segunda pasada: los miembros de secuencia buscan su propietario — ATTRIB
  // y su SEQEND van a un INSERT; los VERTEX y su SEQEND, a una cabecera de
  // POLYLINE clásica. Lo que no resuelve cae al camino normal (bloque o
  // model space) CON su diagnóstico — nunca se descarta.
  for (const { object, record } of pendingSequenceMembers) {
    const { references, common } = object.decoded;
    const ownerReference = references.owner;
    const target =
      ownerReference === undefined || ownerReference.kind === "null"
        ? undefined
        : entityByHandle.get(ownerReference.handle);
    if (target !== undefined) {
      const ownerIsInsert = target.type === AC1015_TYPE_INSERT;
      const ownerIsPolyline = POLYLINE_HEADER_TYPES.has(target.type);
      if (common.type === AC1015_TYPE_SEQEND && (ownerIsInsert || ownerIsPolyline)) {
        target.record.sequenceEndHandle = object.handle;
        continue;
      }
      if (common.type === AC1015_TYPE_ATTRIB && ownerIsInsert) {
        target.record.attributes.push(record);
        continue;
      }
      if (VERTEX_TYPES.has(common.type) && ownerIsPolyline) {
        target.record.vertices.push(record);
        continue;
      }
    }
    placeEntity(object, record);
  }

  return Object.freeze({
    layers: Object.freeze(layers),
    blocks: Object.freeze(
      blockOrder.map((block) =>
        Object.freeze({
          handle: block.handle,
          name: block.name,
          blockBeginHandle: block.blockBeginHandle,
          blockEndHandle: block.blockEndHandle,
          entities: Object.freeze(block.entities.map(freezeEntityRecord)),
        }),
      ),
    ),
    modelSpaceEntities: Object.freeze(modelSpace.map(freezeEntityRecord)),
    unsupported: Object.freeze([...unsupported]),
    diagnostics: Object.freeze(diagnostics),
  });

  /** Coloca una entidad en su bloque o en model space, con sus diagnósticos. */
  function placeEntity(
    object: Extract<DecodedObject, { kind: "entity" }>,
    record: MutableEntityRecord,
  ): void {
    const { common, references } = object.decoded;
    if (common.entityMode === 0) {
      const owner = resolveToBlock(references.owner, blocksByHandle);
      if (owner === undefined) {
        // Propietario nulo, desconocido o que no es un BLOCK_RECORD: la
        // entidad queda VISIBLE en model space y el hueco, diagnosticado
        // (certeza declarada en el worklog) — nunca descartada.
        diagnostics.push(
          diagnostic(
            "database-entity-owner-unresolved",
            "warning",
            object.offset,
            "An entity owner does not resolve to a known block record; the entity was kept in model space.",
          ),
        );
        modelSpace.push(record);
      } else {
        owner.entities.push(record);
      }
      return;
    }
    if (common.entityMode === 1) {
      // Paper space no se modela aún: la entidad queda en model space
      // con diagnóstico (decisión de laboratorio declarada).
      diagnostics.push(
        diagnostic(
          "database-paper-space-entity",
          "warning",
          object.offset,
          "A paper-space entity is not modeled yet; it was kept in model space.",
        ),
      );
    }
    modelSpace.push(record);
  }
}

/** El registro mutable durante el ensamblado; se congela al final. */
interface MutableEntityRecord {
  readonly handle: number;
  readonly entity: DwgGeometryEntity;
  readonly layerHandle: number | undefined;
  readonly insertedBlockName: readonly number[] | undefined;
  readonly attributes: MutableEntityRecord[];
  readonly vertices: MutableEntityRecord[];
  sequenceEndHandle: number | undefined;
}

/** Congela un registro y sus atributos; sin atributos viaja `undefined`. */
function freezeEntityRecord(
  record: MutableEntityRecord,
): Ac1015DatabaseEntityRecord {
  return Object.freeze({
    handle: record.handle,
    entity: record.entity,
    layerHandle: record.layerHandle,
    insertedBlockName: record.insertedBlockName,
    attributes:
      record.attributes.length === 0
        ? undefined
        : Object.freeze(record.attributes.map(freezeEntityRecord)),
    vertices:
      record.vertices.length === 0
        ? undefined
        : Object.freeze(record.vertices.map(freezeEntityRecord)),
    sequenceEndHandle: record.sequenceEndHandle,
  });
}

/** La entidad de la base: geometría + capa + referencia de INSERT resuelta. */
function buildEntityRecord(
  object: Extract<DecodedObject, { kind: "entity" }>,
  blocksByHandle: ReadonlyMap<number, { readonly name: readonly number[] }>,
  diagnostics: DwgDiagnostic[],
): MutableEntityRecord {
  const { entity, references, common } = object.decoded;
  const layerHandle =
    references.layer.kind === "null" ? undefined : references.layer.handle;

  let insertedBlockName: readonly number[] | undefined;
  if (common.type === AC1015_TYPE_INSERT) {
    const reference = references.blockRecord;
    const target =
      reference === undefined || reference.kind === "null"
        ? undefined
        : blocksByHandle.get(reference.handle);
    if (target === undefined) {
      // La referencia que da sentido al INSERT no resuelve: diagnóstico de
      // ERROR, nombre indefinido y la entidad sigue visible — no silencioso.
      diagnostics.push(
        diagnostic(
          "database-insert-block-unresolved",
          "error",
          object.offset,
          "An INSERT does not resolve to a known block record.",
        ),
      );
    } else {
      insertedBlockName = target.name;
    }
  }

  return {
    handle: object.handle,
    entity,
    layerHandle,
    insertedBlockName,
    attributes: [],
    vertices: [],
    sequenceEndHandle: undefined,
  };
}

/** Resuelve una referencia de la cabeza del flujo a un bloque conocido. */
function resolveToBlock<T>(
  reference: DwgResolvedHandle | undefined,
  blocksByHandle: ReadonlyMap<number, T>,
): T | undefined {
  if (reference === undefined || reference.kind === "null") return undefined;
  return blocksByHandle.get(reference.handle);
}

/** ¿Mismos bytes, byte a byte? Para contrastar nombres de bloque. */
function sameBytes(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function diagnostic(
  code: string,
  severity: DwgDiagnostic["severity"],
  offset: number,
  message: string,
): DwgDiagnostic {
  return Object.freeze({ code, severity, offset, message });
}
