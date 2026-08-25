/**
 * ENSAMBLADO COMPARTIDO de la base de datos neutral — extraído de
 * `ac1015-database-reader.ts` para que el lector de la familia R2004 reutilice
 * EXACTAMENTE el mismo despacho por tipo y la misma resolución de referencias,
 * sin gemelos (campaña 2026-08-21, decodificación de objetos R2004).
 *
 * Este módulo es agnóstico del CONTENEDOR: recibe cuerpos de objeto ya
 * extraídos de su envoltura (y, en R2004, ya NORMALIZADOS a la forma R2000
 * por el adaptador del lector R2004) y produce la base neutral. Todo lo que
 * está aquí se movió VERBATIM del lector AC1015; las reglas no cambian:
 *
 * - **Fallo cerrado** en entidades y tablas D3/D4; lo `unsupported` se
 *   ENUMERA y continúa; las familias auxiliares D5 caen a `unsupported` sin
 *   abortar (contrato fijado por los cuerpos sintéticos D1).
 * - **Determinista**: mismo mapa de objetos → misma base, en su orden.
 * - Los offsets de error se TRASLADAN al byte real del archivo.
 */
import type { DwgDiagnostic } from "../api/diagnostics.js";
import type { DwgResolvedHandle } from "../codecs/bitcodes.js";
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
import {
  buildAc1015NeutralTables,
  decodeAc1015SymbolFamilyObject,
  type Ac1015DatabaseDictionary,
  type Ac1015DatabaseSymbolTables,
  type Ac1015DecodedSymbolObject,
} from "../objects/tables-symbol.js";
import {
  decodeAc1015DictionaryFamilyObject,
  type Ac1015ClassRecord,
  type Ac1015DecodedDictionaryFamily,
} from "../objects/objects-dictionary.js";
import { DwgParseError, throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

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
  /** Bytes del nombre DXF de la clase, cuando el tipo es de clase (D5). */
  readonly className?: readonly number[];
}

/** La base de datos neutral que devuelve el ensamblado de las fases D4/D5. */
export interface Ac1015NeutralDatabase {
  readonly layers: readonly Ac1015DatabaseLayer[];
  readonly blocks: readonly Ac1015DatabaseBlock[];
  readonly modelSpaceEntities: readonly Ac1015DatabaseEntityRecord[];
  /** BS crudo de INSUNITS (variables de cabecera, capítulo 9): unidades del dibujo. */
  readonly insunits: number;
  /** Fase D5: tablas de símbolos, diccionarios (nombre → handle) y el mapa de clases (número → nombre). */
  readonly tables: Ac1015DatabaseSymbolTables;
  readonly dictionaries: readonly Ac1015DatabaseDictionary[];
  readonly classMap: readonly Ac1015ClassRecord[];
  readonly unsupported: readonly Ac1015UnsupportedDatabaseObject[];
  readonly diagnostics: readonly DwgDiagnostic[];
}

/**
 * Los tipos FIJOS cuyo cuerpo es de ENTIDAD (cabecera común de entidad, no
 * prólogo de objeto). Exportado para que el adaptador R2004 decida qué forma
 * de prólogo normalizar con EXACTAMENTE el mismo censo que este despacho.
 */
export const AC1015_ENTITY_BODY_TYPES: ReadonlySet<number> = new Set([
  AC1015_TYPE_LINE,
  AC1015_TYPE_POINT,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_ARC,
  AC1015_TYPE_LWPOLYLINE,
  AC1015_TYPE_TEXT,
  AC1015_TYPE_INSERT,
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_ATTDEF,
  AC1015_TYPE_SEQEND,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_DIM_ORDINATE,
  AC1015_TYPE_DIM_LINEAR,
  AC1015_TYPE_DIM_ALIGNED,
  AC1015_TYPE_DIM_ANGULAR_3PT,
  AC1015_TYPE_DIM_ANGULAR_2LN,
  AC1015_TYPE_DIM_RADIUS,
  AC1015_TYPE_DIM_DIAMETER,
  AC1015_TYPE_POLYLINE_2D,
  AC1015_TYPE_POLYLINE_3D,
  AC1015_TYPE_POLYLINE_MESH,
  AC1015_TYPE_POLYLINE_PFACE,
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
  AC1015_TYPE_3DFACE,
  AC1015_TYPE_ELLIPSE,
  AC1015_TYPE_RAY,
  AC1015_TYPE_SOLID,
  AC1015_TYPE_SPLINE,
  AC1015_TYPE_TRACE,
  AC1015_TYPE_XLINE,
  AC1015_TYPE_VIEWPORT,
  AC1015_TYPE_LEADER,
  AC1015_TYPE_TOLERANCE,
  AC1015_TYPE_MLINE,
  AC1015_TYPE_HATCH,
  AC1015_TYPE_BLOCK,
  AC1015_TYPE_ENDBLK,
]);

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
export type DecodedObject =
  | { readonly kind: "entity"; readonly handle: number; readonly offset: number; readonly decoded: Ac1015DecodedEntity }
  | { readonly kind: "layer"; readonly handle: number; readonly offset: number; readonly name: readonly number[]; readonly colorIndex: number; readonly stateFlags: number }
  | { readonly kind: "blockRecord"; readonly handle: number; readonly offset: number; readonly name: readonly number[] }
  | { readonly kind: "blockBegin"; readonly handle: number; readonly offset: number; readonly decoded: Ac1015DecodedBlockBegin }
  | { readonly kind: "blockEnd"; readonly handle: number; readonly offset: number; readonly decoded: Ac1015DecodedBlockEnd }
  | { readonly kind: "control"; readonly handle: number; readonly offset: number }
  | { readonly kind: "symbol"; readonly handle: number; readonly offset: number; readonly result: Ac1015DecodedSymbolObject }
  | { readonly kind: "dictionaryFamily"; readonly handle: number; readonly offset: number; readonly result: Ac1015DecodedDictionaryFamily };

/**
 * Decodifica un cuerpo según su tipo BS. Devuelve `null` cuando el tipo no
 * está cubierto por el laboratorio — el llamador lo ENUMERA como unsupported;
 * la corrupción en una ENTIDAD o tabla D3/D4 se propaga y aborta la lectura
 * (las familias auxiliares D5 tienen su propio contrato, ver abajo).
 */
export function decodeMappedObject(
  type: number,
  bodyBytes: Uint8Array,
  entry: { readonly handle: number; readonly offset: number },
  classNames: ReadonlyMap<number, readonly number[]>,
): DecodedObject | null {
  try {
    switch (type) {
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
      default: {
        if (AC1015_ENTITY_BODY_TYPES.has(type)) {
          const decoded = decodeAc1015EntityBody(bodyBytes);
          assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
          return { kind: "entity", handle: entry.handle, offset: entry.offset, decoded };
        }
        return decodeAuxiliaryObject(type, bodyBytes, entry, classNames);
      }
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
 * Los objetos AUXILIARES de la fase D5: tablas de símbolos, diccionarios y
 * objetos de clase. Un cuerpo de estas familias que no decodifica cae a
 * `null` — el llamador lo ENUMERA como unsupported (contrato fijado por los
 * cuerpos sintéticos D1: el canal de pérdida es `unsupported`, nunca el
 * silencio). Los errores de RECURSOS se propagan; el handle, FUERA del blindaje.
 */
function decodeAuxiliaryObject(
  type: number,
  bodyBytes: Uint8Array,
  entry: { readonly handle: number; readonly offset: number },
  classNames: ReadonlyMap<number, readonly number[]>,
): DecodedObject | null {
  let symbol = null;
  let member = null; // ambos se resuelven dentro del blindaje
  try {
    symbol = decodeAc1015SymbolFamilyObject(type, bodyBytes);
    if (symbol === null) member = decodeAc1015DictionaryFamilyObject(type, bodyBytes, classNames);
  } catch (error) {
    if (error instanceof DwgParseError && error.detail.category !== "resource") return null;
    throw error;
  }
  if (symbol !== null) {
    assertBodyHandleMatchesMap(symbol.handle, entry);
    return { kind: "symbol", handle: entry.handle, offset: entry.offset, result: symbol };
  }
  if (member !== null) {
    assertBodyHandleMatchesMap(member.handle, entry);
    return { kind: "dictionaryFamily", handle: entry.handle, offset: entry.offset, result: member };
  }
  return null;
}

/**
 * El índice y el objeto deben contar la misma historia: un cuerpo cuyo handle
 * propio no es el del mapa es un archivo mentiroso (decisión de laboratorio
 * declarada), no una discrepancia que promediar.
 */
export function assertBodyHandleMatchesMap(
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
/**
 * `budget` es el MISMO presupuesto que ya cobró el byte a byte de la
 * primera pasada — aquí se le cobra 1 unidad de trabajo por objeto en cada
 * bucle que lo recorre, la única forma en que esta segunda pasada nota una
 * cancelación o un deadline: antes de esto, `assembleDatabase` corría entera
 * fuera del presupuesto (ver la nota del lector sobre `readAc1015Database`).
 * `findBlockByName`, dentro del bucle principal, es O(bloques) por llamada
 * — cobrar por ITERACIÓN del bucle exterior es la misma granularidad que ya
 * usa el resto del laboratorio (nada comprueba a mitad de una operación
 * primitiva), no una comprobación parcial.
 */
export function assembleDatabase(
  decodedObjects: readonly DecodedObject[],
  unsupported: readonly Ac1015UnsupportedDatabaseObject[],
  classRecords: readonly Ac1015ClassRecord[],
  insunits: number,
  budget: ResourceBudget,
): Ac1015NeutralDatabase {
  const diagnostics: DwgDiagnostic[] = [];
  const layers: Ac1015DatabaseLayer[] = [];
  const modelSpace: MutableEntityRecord[] = [];
  const symbolObjects: Ac1015DecodedSymbolObject[] = [];
  const dictionaryObjects: Ac1015DecodedDictionaryFamily[] = [];

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
    budget.consume(1, object.offset);
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
    budget.consume(1, object.offset);
    switch (object.kind) {
      case "blockRecord":
      case "control":
        break;
      case "symbol": symbolObjects.push(object.result); break;
      case "dictionaryFamily": dictionaryObjects.push(object.result); break;
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
        // R2000: el marcador resuelve por su propietario (modo 0). R2004+
        // (medición 32/32 del corpus AC1018): los marcadores de los espacios
        // viajan con modo 1/2 y SIN propietario — se atan por su NOMBRE
        // contra los registros, y sólo entonces.
        const owner =
          resolveToBlock(object.decoded.references.owner, blocksByHandle) ??
          (object.decoded.common.entityMode !== 0
            ? findBlockByName(blockOrder, object.decoded.name)
            : undefined);
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
        // El ENDBLK no lleva nombre: en R2004+ (modo 1/2, sin propietario)
        // se ata al registro canónico de su espacio.
        const owner =
          resolveToBlock(object.decoded.references.owner, blocksByHandle) ??
          (object.decoded.common.entityMode !== 0
            ? findBlockByName(
                blockOrder,
                object.decoded.common.entityMode === 1
                  ? PAPER_SPACE_NAME
                  : MODEL_SPACE_NAME,
              )
            : undefined);
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
    budget.consume(1, object.offset);
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

  const { tables, dictionaries } = buildAc1015NeutralTables(symbolObjects, dictionaryObjects);

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
    insunits,
    tables,
    dictionaries,
    classMap: Object.freeze([...classRecords]),
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

/** "*Model_Space" y "*Paper_Space" en bytes, para los marcadores R2004+. */
const MODEL_SPACE_NAME: readonly number[] = Object.freeze(
  [...`*Model_Space`].map((character) => character.charCodeAt(0)),
);
const PAPER_SPACE_NAME: readonly number[] = Object.freeze(
  [...`*Paper_Space`].map((character) => character.charCodeAt(0)),
);

/**
 * Busca un bloque por nombre, byte a byte SIN distinguir mayúsculas ASCII —
 * los nombres de bloque del formato no las distinguen y los escritores
 * reales varían la caja de los espacios canónicos.
 */
function findBlockByName<T extends { readonly name: readonly number[] }>(
  blocks: readonly T[],
  name: readonly number[],
): T | undefined {
  const fold = (byte: number): number =>
    byte >= 0x61 && byte <= 0x7a ? byte - 0x20 : byte;
  for (const block of blocks) {
    if (block.name.length !== name.length) continue;
    let matches = true;
    for (let index = 0; index < name.length; index += 1) {
      if (fold(block.name[index]!) !== fold(name[index]!)) {
        matches = false;
        break;
      }
    }
    if (matches) return block;
  }
  return undefined;
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
