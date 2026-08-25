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
 * Campaña 2026-08-21 (objetos R2004): el despacho por tipo y el ensamblado
 * viven ahora en `database-assembly.ts`, COMPARTIDOS con el lector de la
 * familia R2004 — cero gemelos. Este módulo conserva el pipeline del
 * CONTENEDOR R2000 y re-exporta las interfaces públicas de la base para que
 * la superficie del paquete no cambie.
 *
 * Resolución de referencias (certezas declaradas en el worklog):
 * - **Pertenencia entidad→bloque**: por el propietario del común (modo 0)
 *   contra los BLOCK_RECORD del mapa; lo no resuelto queda en model space CON
 *   diagnóstico. **INSERT→bloque** por su hard pointer, con diagnóstico de
 *   error si no resuelve. **BLOCK/ENDBLK** se atan por su propietario.
 *
 * Reglas del laboratorio: presupuesto cobrado por byte y por objeto; fallo
 * cerrado con offset; determinista. Hechos de ODA-ODS-DWG-5.4.1-PUBLIC
 * (SOURCE_REGISTER); implementación original; el producto permanece
 * `available:false`.
 */
import { createDwgLimits, type DwgLimitOverrides } from "../api/limits.js";
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { parseAc1015FileHeader } from "../container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../container/ac1015-object-map.js";
import {
  AC1015_CLASSES_SENTINELS,
  AC1015_HEADER_VARIABLES_SENTINELS,
  readAc1015SectionFrame,
} from "../container/ac1015-section-frame.js";
import { decodeAc1015HeaderVariables } from "../container/ac1015-header-variables.js";
import { detectDwgSignature } from "../container/signature.js";
import { decodeAc1015ClassesSection } from "../objects/objects-dictionary.js";
import { createInputSnapshot } from "../security/input-snapshot.js";
import { throwDwgError } from "../security/parse-error.js";
import { ResourceBudget } from "../security/resource-budget.js";
import {
  assembleDatabase,
  decodeMappedObject,
  type Ac1015NeutralDatabase,
  type Ac1015UnsupportedDatabaseObject,
  type DecodedObject,
} from "./database-assembly.js";

// Las interfaces públicas de la base viven en el ensamblado compartido; se
// re-exportan aquí para que la superficie histórica del paquete no cambie.
export type {
  Ac1015DatabaseBlock,
  Ac1015DatabaseEntityRecord,
  Ac1015DatabaseLayer,
  Ac1015NeutralDatabase,
  Ac1015UnsupportedDatabaseObject,
} from "./database-assembly.js";

/** Identificadores de registro del directorio (hechos ya registrados). */
const HEADER_VARIABLES_RECORD_ID = 0;
const CLASSES_RECORD_ID = 1;
const OBJECT_MAP_RECORD_ID = 2;

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

  // Los marcos se VERIFICAN (centinelas + CRC). El payload de variables de
  // cabecera SÍ se decodifica (antes sólo se validaba el marco y el payload
  // quedaba opaco): hoy sólo INSUNITS cruza al puente del producto, el resto
  // de variables viaja decodificado aquí pero sin consumidor todavía. El de
  // clases se DECODIFICA (D5): decide los objetos de clase.
  const headerVariablesFrame = readAc1015SectionFrame(cursor, headerVariablesRecord, AC1015_HEADER_VARIABLES_SENTINELS);
  const headerVariables = decodeAc1015HeaderVariables(headerVariablesFrame.payload);
  const classesFrame = readAc1015SectionFrame(cursor, classesRecord, AC1015_CLASSES_SENTINELS);
  const classRecords = decodeAc1015ClassesSection(classesFrame.payload);
  const classNames = new Map(classRecords.map((record) => [record.classNumber, record.dxfClassName]));

  const mapEntries = readAc1015ObjectMap(cursor, objectMapRecord, limits);

  // Primera pasada: decodificar cada objeto del mapa. El presupuesto cobra el
  // cuerpo OTRA vez por decodificarlo — leerlo del archivo ya lo cobró el
  // cursor — de modo que un archivo con muchos objetos paga por objeto.
  const decodedObjects: DecodedObject[] = [];
  const unsupported: Ac1015UnsupportedDatabaseObject[] = [];
  for (const entry of mapEntries) {
    const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
    budget.consume(envelope.bodyBytes.length, entry.offset);
    const decoded = decodeMappedObject(envelope.type, envelope.bodyBytes, entry, classNames);
    if (decoded === null) {
      const className = classNames.get(envelope.type);
      unsupported.push(Object.freeze({ handle: entry.handle, type: envelope.type, ...(className === undefined ? {} : { className }) }));
      continue;
    }
    decodedObjects.push(decoded);
  }

  return assembleDatabase(decodedObjects, unsupported, classRecords, headerVariables.insunits);
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
