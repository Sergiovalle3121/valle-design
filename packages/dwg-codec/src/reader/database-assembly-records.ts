/**
 * Piezas del ensamblado de la base AC1015: el registro de entidad mutable y
 * los ayudantes de colocación por bloque.
 *
 * Vive aparte desde el 2026-09-01, cuando el intake de la semántica de estado
 * de capa empujó `database-assembly.ts` por encima del presupuesto de
 * monolito. La costura no es arbitraria: aquí está todo lo que trata un
 * registro de entidad como DATO —construirlo, congelarlo, buscarle su bloque—
 * y allá queda la decisión de QUÉ objeto va a dónde, que es el ensamblado
 * propiamente dicho.
 */

import type { DwgDiagnostic } from "../api/diagnostics.js";
import type { DwgResolvedHandle } from "../codecs/bitcodes.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import { AC1015_TYPE_INSERT } from "../objects/entity-insert.js";
import type { Ac1015DatabaseEntityRecord } from "./database-model.js";
import type { DecodedObject } from "./database-assembly.js";

/** El registro mutable durante el ensamblado; se congela al final. */
export interface MutableEntityRecord {
  readonly handle: number;
  readonly entity: DwgGeometryEntity;
  readonly layerHandle: number | undefined;
  readonly insertedBlockName: readonly number[] | undefined;
  readonly attributes: MutableEntityRecord[];
  readonly vertices: MutableEntityRecord[];
  sequenceEndHandle: number | undefined;
  /** Espacio declarado por el archivo; `undefined` dentro de un bloque. */
  readonly space: "model" | "paper" | undefined;
}

/** Congela un registro y sus atributos; sin atributos viaja `undefined`. */
export function freezeEntityRecord(
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
    space: record.space,
  });
}

/** La entidad de la base: geometría + capa + referencia de INSERT resuelta. */
export function buildEntityRecord(
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
    space: spaceOfEntityMode(common.entityMode),
  };
}

/**
 * El espacio que declara el modo de entidad: 1 = papel, 2 = modelo, 0 = la
 * entidad pertenece a un bloque y no vive en un espacio. Los tres valores son
 * los MEDIDOS en el corpus; el modo 3 lo rechaza antes el decodificador.
 */
export function spaceOfEntityMode(
  entityMode: number,
): "model" | "paper" | undefined {
  if (entityMode === 1) return "paper";
  if (entityMode === 2) return "model";
  return undefined;
}

/** Resuelve una referencia de la cabeza del flujo a un bloque conocido. */
export function resolveToBlock<T>(
  reference: DwgResolvedHandle | undefined,
  blocksByHandle: ReadonlyMap<number, T>,
): T | undefined {
  if (reference === undefined || reference.kind === "null") return undefined;
  return blocksByHandle.get(reference.handle);
}

/** "*Model_Space" y "*Paper_Space" en bytes, para los marcadores R2004+. */
export const MODEL_SPACE_NAME: readonly number[] = Object.freeze(
  [...`*Model_Space`].map((character) => character.charCodeAt(0)),
);
export const PAPER_SPACE_NAME: readonly number[] = Object.freeze(
  [...`*Paper_Space`].map((character) => character.charCodeAt(0)),
);

/**
 * Busca un bloque por nombre, byte a byte SIN distinguir mayúsculas ASCII —
 * los nombres de bloque del formato no las distinguen y los escritores
 * reales varían la caja de los espacios canónicos.
 */
export function findBlockByName<T extends { readonly name: readonly number[] }>(
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
export function sameBytes(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function diagnostic(
  code: string,
  severity: DwgDiagnostic["severity"],
  offset: number,
  message: string,
): DwgDiagnostic {
  return Object.freeze({ code, severity, offset, message });
}
