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
import { interpretLayerStateFlags } from "../objects/layer-state.js";
import {
  MODEL_SPACE_NAME,
  PAPER_SPACE_NAME,
  buildEntityRecord,
  diagnostic,
  findBlockByName,
  freezeEntityRecord,
  resolveToBlock,
  sameBytes,
  type MutableEntityRecord,
} from "./database-assembly-records.js";
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

import type {
  Ac1015DatabaseBlock,
  Ac1015DatabaseEntityRecord,
  Ac1015DatabaseLayer,
  Ac1015NeutralDatabase,
  Ac1015UnsupportedDatabaseObject,
} from "./database-model.js";

/** Tipos en `database-model.js`; re-exportados para no cambiar imports. */
export type * from "./database-model.js";

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
  | {
      readonly kind: "entity";
      readonly handle: number;
      readonly offset: number;
      readonly decoded: Ac1015DecodedEntity;
    }
  | {
      readonly kind: "layer";
      readonly handle: number;
      readonly offset: number;
      readonly name: readonly number[];
      readonly colorIndex: number;
      readonly stateFlags: number;
    }
  | {
      readonly kind: "blockRecord";
      readonly handle: number;
      readonly offset: number;
      readonly name: readonly number[];
    }
  | {
      readonly kind: "blockBegin";
      readonly handle: number;
      readonly offset: number;
      readonly decoded: Ac1015DecodedBlockBegin;
    }
  | {
      readonly kind: "blockEnd";
      readonly handle: number;
      readonly offset: number;
      readonly decoded: Ac1015DecodedBlockEnd;
    }
  | {
      readonly kind: "control";
      readonly handle: number;
      readonly offset: number;
    }
  | {
      readonly kind: "symbol";
      readonly handle: number;
      readonly offset: number;
      readonly result: Ac1015DecodedSymbolObject;
    }
  | {
      readonly kind: "dictionaryFamily";
      readonly handle: number;
      readonly offset: number;
      readonly result: Ac1015DecodedDictionaryFamily;
    };

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
        return {
          kind: "blockBegin",
          handle: entry.handle,
          offset: entry.offset,
          decoded,
        };
      }
      case AC1015_TYPE_ENDBLK: {
        const decoded = decodeAc1015BlockEndBody(bodyBytes);
        assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
        return {
          kind: "blockEnd",
          handle: entry.handle,
          offset: entry.offset,
          decoded,
        };
      }
      default: {
        if (AC1015_ENTITY_BODY_TYPES.has(type)) {
          const decoded = decodeAc1015EntityBody(bodyBytes);
          assertBodyHandleMatchesMap(decoded.common.ownHandle.value, entry);
          return {
            kind: "entity",
            handle: entry.handle,
            offset: entry.offset,
            decoded,
          };
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
    if (symbol === null)
      member = decodeAc1015DictionaryFamilyObject(type, bodyBytes, classNames);
  } catch (error) {
    if (error instanceof DwgParseError && error.detail.category !== "resource")
      return null;
    throw error;
  }
  if (symbol !== null) {
    assertBodyHandleMatchesMap(symbol.handle, entry);
    return {
      kind: "symbol",
      handle: entry.handle,
      offset: entry.offset,
      result: symbol,
    };
  }
  if (member !== null) {
    assertBodyHandleMatchesMap(member.handle, entry);
    return {
      kind: "dictionaryFamily",
      handle: entry.handle,
      offset: entry.offset,
      result: member,
    };
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
      case "symbol":
        symbolObjects.push(object.result);
        break;
      case "dictionaryFamily":
        dictionaryObjects.push(object.result);
        break;
      case "layer": {
        // El estado se resuelve AQUÍ, en el origen, con el criterio único del
        // códec: así el documento canónico y el adaptador del producto reciben
        // congelada y bloqueada ya decididas y ninguno descifra el `BS` por su
        // cuenta. Dos criterios de «qué bit es congelada» no los vería divergir
        // ninguna prueba.
        const state = interpretLayerStateFlags(object.stateFlags);
        layers.push(
          Object.freeze({
            handle: object.handle,
            name: object.name,
            colorIndex: object.colorIndex,
            stateFlags: object.stateFlags,
            frozen: state.frozen,
            locked: state.locked,
            unmeasuredStateBits: state.unmeasuredBits,
          }),
        );
        break;
      }
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
        if (common.entityMode === 0 && SEQUENCE_MEMBER_TYPES.has(common.type)) {
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
      if (
        common.type === AC1015_TYPE_SEQEND &&
        (ownerIsInsert || ownerIsPolyline)
      ) {
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

  const { tables, dictionaries } = buildAc1015NeutralTables(
    symbolObjects,
    dictionaryObjects,
  );

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
