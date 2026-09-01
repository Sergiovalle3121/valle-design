/**
 * Lector de la BASE DE DATOS neutral de la familia R2004 — campaña
 * 2026-08-21, decodificación de objetos AC1018.
 *
 * `readR2004Database` orquesta el pipeline completo sobre el contenedor
 * R2004 ya validado (container/r2004-*): cabecera cifrada → mapas → secciones
 * ensambladas → marco y variables de cabecera (sabor R2004) → clases R2004 →
 * mapa de handles (la MISMA codificación modular R2000, con offsets DENTRO
 * del payload de AcDb:AcDbObjects — hecho registrado, ODS §23.2) → envoltura
 * R2000 por objeto → ADAPTADOR de cuerpo R2004→R2000 → despacho y ensamblado
 * COMPARTIDOS con AC1015 (`database-assembly.ts`) — cero decodificadores
 * gemelos.
 *
 * Alcance HONESTO de esta ola: AC1018 completo (los 8 reales del corpus
 * abren con matriz diferencial limpia). AC1024/AC1027/AC1032 comparten este
 * contenedor y, desde el intake 2026-08-31, también su ENCABEZADO de objeto
 * (`container/r2010-object-envelope.ts`) y el CUERPO de las cinco entidades
 * sin cadenas — LINE/POINT/CIRCLE/ARC/LWPOLYLINE — decodifican geometría
 * EXACTA (`reader/r2010-entity-body.ts`, 72/72 objetos del corpus admitido).
 * Lo que falta para ensamblar una base neutral completa es el FLUJO DE
 * HANDLES (propietario, capa, xdictionary) y las tablas de símbolos de
 * R2010+, así que `readR2004Database` sigue fallando CERRADO para estas tres
 * versiones con un mensaje que dice exactamente eso — este módulo todavía no
 * llama a `readR2010EntityBody`, que vive como capacidad de laboratorio
 * independiente hasta que el flujo de handles también decodifique.
 * Evidencia en docs/cad/evidence/dwg-r2004-container.json,
 * docs/cad/evidence/dwg-r2010-object-header.json y
 * docs/cad/evidence/dwg-r2010-object-body.json.
 *
 * Intake 2026-08-23 (VALLE-CORPUS-INTAKE-A60EBE2): el marco de sección de
 * datos R2010+ (AcDb:Header/AcDb:Classes) usa un campo de tamaño de 8 bytes
 * en vez de los 4 de R2000/AC1018 — `readR2004SectionFrame` acepta ahora
 * `sizeFieldWidth` para las dos formas. El envoltorio de objeto R2010+ (sin
 * tamaño al frente) queda en `container/r2010-object-envelope.ts`. Ninguna de
 * las dos piezas decodifica el TIPO del objeto: la codificación BOT sigue sin
 * fuente registrada suficiente (BLOCKED_BY_SOURCE_GATE, ver DWG0_WORKLOG) y
 * `readR2004Database` sigue fallando cerrado para AC1024/AC1027/AC1032.
 *
 * Reglas del laboratorio: presupuesto cobrado por byte y por objeto; fallo
 * cerrado con offset (los offsets de objeto son RELATIVOS al payload de
 * AcDb:AcDbObjects, y así se declara); determinista. Implementación original
 * desde hechos registrados (ADR-0007).
 */
import { createDwgLimits, type DwgLimitOverrides } from "../api/limits.js";
import { checkedBigIntToNumber } from "../binary/checked-arithmetic.js";
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import { crc16Dwg } from "../codecs/crc16.js";
import {
  decodeR2004HeaderVariables,
  type R2004HeaderVariables,
} from "../container/r2004-header-variables.js";
import { readAc1015ObjectEnvelope } from "../container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../container/ac1015-object-map.js";
import {
  AC1015_CLASSES_SENTINELS,
  AC1015_HEADER_VARIABLES_SENTINELS,
  AC1015_SECTION_CRC_SEED,
  AC1015_SECTION_SENTINEL_LENGTH,
  type Ac1015SectionSentinelPair,
} from "../container/ac1015-section-frame.js";
import {
  parseR2004FileHeader,
  readR2004PageMap,
  R2004_FAMILY_VERSIONS,
  type R2004VersionCode,
} from "../container/r2004-pages.js";
import {
  findR2004Section,
  readR2004SectionMap,
  readR2004SectionPayload,
  R2004_CORE_SECTION_NAMES,
} from "../container/r2004-sections.js";
import { detectDwgSignature } from "../container/signature.js";
import type { Ac1015ClassRecord } from "../objects/objects-dictionary.js";
import { createInputSnapshot } from "../security/input-snapshot.js";
import { DwgParseError, throwDwgError } from "../security/parse-error.js";
import {
  ResourceBudget,
  type ResourceBudgetOptions,
} from "../security/resource-budget.js";
import {
  assembleDatabase,
  decodeMappedObject,
  AC1015_ENTITY_BODY_TYPES,
  type Ac1015NeutralDatabase,
  type Ac1015UnsupportedDatabaseObject,
  type DecodedObject,
} from "./database-assembly.js";
import { normalizeR2004ObjectBody } from "./r2004-body-adapter.js";
import { pairR2010ObjectBounds } from "../container/r2010-object-envelope.js";
import { assembleR2010Database } from "./r2010-database-assembly.js";

/** Tipo fijo del ACAD_PROXY_ENTITY: cuerpo de ENTIDAD (ODS §20.3). */
const PROXY_ENTITY_TYPE = 0x1f2;
/** itemclassid de las clases que producen ENTIDADES (hecho registrado). */
const ENTITY_ITEM_CLASS_ID = 0x1f2;
/** RL sin nombre con que abre el payload de AcDb:AcDbObjects en R18+ (§20). */
const OBJECTS_SECTION_PRELUDE = 0x0dca;

/**
 * Lee la base de datos neutral completa de un archivo de la familia R2004.
 * Hoy decodifica objetos SOLO para AC1018; las versiones R2010+ de la
 * familia fallan cerradas con el motivo exacto (ver cabecera del módulo).
 * `cancellation` es ADITIVO, mismo contrato que en `readAc1015Database`.
 */
export function readR2004Database(
  input: Uint8Array,
  limitOverrides?: DwgLimitOverrides,
  cancellation: ResourceBudgetOptions = {},
): Ac1015NeutralDatabase {
  const limits = createDwgLimits(limitOverrides);
  const budget = new ResourceBudget(limits, cancellation);
  const snapshot = createInputSnapshot(input, limits, budget);

  const signature = detectDwgSignature(snapshot, budget);
  if (!(R2004_FAMILY_VERSIONS as readonly string[]).includes(signature.code)) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "Only the AC1018/AC1024/AC1027/AC1032 containers are read by the R2004 laboratory reader.",
    );
  }
  const version = signature.code as R2004VersionCode;
  const cursor = new BoundedByteCursor(snapshot, budget);
  const fileHeader = parseR2004FileHeader(cursor);
  const pages = readR2004PageMap(cursor, fileHeader, limits);
  const sections = readR2004SectionMap(cursor, fileHeader, pages, limits);
  const payloads = R2004_CORE_SECTION_NAMES.map((name) => {
    const section = findR2004Section(sections, name);
    if (section === null) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        `The section map does not name the required ${name} section.`,
      );
    }
    const payload = readR2004SectionPayload(cursor, section, pages, limits);
    // El presupuesto cobra cada payload ensamblado: descomprimir no es gratis.
    budget.consume(payload.length, 0);
    return payload;
  });
  const [headerPayload, classesPayload, handlesPayload, objectsPayload] =
    payloads as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];

  // Variables de cabecera: marco con centinelas + CRC y la secuencia del
  // capítulo 9 en sabor R2004. Se decodifican para VALIDAR la sección
  // completa (fallo cerrado) y hoy además para proyectar INSUNITS al puente
  // del producto — el resto de variables sigue sin consumidor.
  // El marco de las secciones de DATOS lleva un campo de tamaño de 8 bytes en
  // R2010+ y de 4 en AC1018 — hecho ya medido y soportado por
  // `readR2004SectionFrame`, que hasta este intake nadie seleccionaba porque
  // el lector fallaba cerrado antes de llegar aquí.
  const sizeFieldWidth = version === "AC1018" ? 4 : 8;
  const headerFrame = readR2004SectionFrame(
    headerPayload,
    AC1015_HEADER_VARIABLES_SENTINELS,
    sizeFieldWidth,
  );
  // Sólo AC1018 decodifica las variables: la disposición R2010+ diverge (un
  // BD con bandera 0b11, que el formato no define, aparece al leerla con la
  // forma de AC1018) y no está medida. El marco SÍ se valida en las dos: sus
  // centinelas y su CRC son la comprobación que de verdad protege la sección.
  const headerVariables =
    version === "AC1018"
      ? decodeR2004HeaderVariables(headerFrame.payload)
      : null;

  const classesFrame = readR2004SectionFrame(
    classesPayload,
    AC1015_CLASSES_SENTINELS,
    sizeFieldWidth,
  );
  // Mismo criterio que con las variables de cabecera: el marco se valida
  // siempre (centinelas + CRC), pero los REGISTROS sólo se decodifican en
  // AC1018. En R2010+ los nombres de clase no viajan en la forma de cadena de
  // AC1018 —leerlos así da «A text value extends outside the input»— y su
  // disposición no está medida. El ensamblado R2010+ no consume el mapa de
  // clases: despacha por tipo fijo y enumera lo demás en `unsupported`.
  const classRecords =
    version === "AC1018" ? decodeR2004ClassesSection(classesFrame.payload) : [];
  const classNames = new Map(
    classRecords.map((record) => [record.classNumber, record.dxfClassName]),
  );
  const classEntityTypes = new Set(
    classRecords
      .filter((record) => record.itemClassId === ENTITY_ITEM_CLASS_ID)
      .map((record) => record.classNumber),
  );

  // El payload de objetos abre con un RL fijo sin nombre (medido 32/32); los
  // offsets del mapa de handles cuentan desde el byte 0 del payload.
  if (
    objectsPayload.length < 4 ||
    readUint32(objectsPayload, 0) !== OBJECTS_SECTION_PRELUDE
  ) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "The AcDb:AcDbObjects payload does not open with its fixed prelude.",
    );
  }

  const handlesCursor = new BoundedByteCursor(handlesPayload, budget);
  const mapEntries = readAc1015ObjectMap(
    handlesCursor,
    { start: 0, size: handlesPayload.length },
    limits,
    objectsPayload.length,
  );

  if (version !== "AC1018") {
    // CAMINO PROPIO DE R2010+ (intake 2026-08-31). No pasa por el adaptador a
    // la forma R2000 a propósito: en R2010+ el nombre vive en un flujo de
    // cadenas propio y los handles en otro, así que normalizar sería inventar
    // una forma que el archivo no tiene. Ver `r2010-database-assembly.ts` para
    // lo que produce y, sobre todo, para lo que declara ausente.
    const bounds = pairR2010ObjectBounds(
      mapEntries.map((entry) => ({
        handle: entry.handle,
        offset: entry.offset,
      })),
      objectsPayload.length,
    );
    return assembleR2010Database(objectsPayload, bounds, {
      version,
      insunits: undefined,
      classMap: classRecords,
    });
  }

  const objectsCursor = new BoundedByteCursor(objectsPayload, budget);
  const decodedObjects: DecodedObject[] = [];
  const unsupported: Ac1015UnsupportedDatabaseObject[] = [];
  for (const entry of mapEntries) {
    const envelope = readAc1015ObjectEnvelope(objectsCursor, entry.offset, []);
    budget.consume(envelope.bodyBytes.length, entry.offset);
    const isEntity =
      envelope.type === PROXY_ENTITY_TYPE ||
      AC1015_ENTITY_BODY_TYPES.has(envelope.type) ||
      classEntityTypes.has(envelope.type);
    const bodyBytes = adaptBody(envelope.bodyBytes, isEntity, entry);
    const decoded =
      bodyBytes === null
        ? null
        : decodeMappedObject(envelope.type, bodyBytes, entry, classNames);
    if (decoded === null) {
      const className = classNames.get(envelope.type);
      unsupported.push(
        Object.freeze({
          handle: entry.handle,
          type: envelope.type,
          ...(className === undefined ? {} : { className }),
        }),
      );
      continue;
    }
    decodedObjects.push(decoded);
  }

  return assembleDatabase(
    decodedObjects,
    unsupported,
    classRecords,
    headerVariables?.insunits ?? 0,
    budget,
  );
}

/**
 * Adapta un cuerpo AC1018 a la forma R2000 con el MISMO contrato de errores
 * que el despacho compartido: capacidad ausente → `null` (el llamador lo
 * enumera); corrupción → error tipado con el offset trasladado a la entrada.
 */
function adaptBody(
  bodyBytes: Uint8Array,
  isEntity: boolean,
  entry: { readonly handle: number; readonly offset: number },
): Uint8Array | null {
  try {
    return normalizeR2004ObjectBody(bodyBytes, isEntity);
  } catch (error) {
    if (
      error instanceof DwgParseError &&
      error.detail.code === "DWG_VERSION_DECODER_UNSUPPORTED"
    ) {
      return null;
    }
    if (error instanceof DwgParseError) {
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

/** Marco verificado de una sección de datos R2004 con centinelas R2000. */
export interface R2004SectionFrame {
  readonly declaredSize: number;
  readonly payload: Uint8Array;
  readonly crc: number;
  /** Bytes tras el centinela de cierre (relleno declarado, no interpretado). */
  readonly slackLength: number;
}

/**
 * Verifica el marco de las secciones AcDb:Header y AcDb:Classes de la
 * familia R2004: centinela de apertura, tamaño (RL de 4 bytes en R2000/
 * AC1018; 8 bytes little-endian en R2010+ — hecho medido
 * VALLE-CORPUS-INTAKE-A60EBE2, intake 2026-08-23), payload, CRC-16 (semilla
 * de sección sobre tamaño + payload) y centinela de cierre. A diferencia de
 * R2000, tras el cierre queda RELLENO hasta el tamaño lógico de la sección
 * (medido: aleatorio en AcDb:Header, ceros en AcDb:Classes): se DECLARA como
 * slack, no se interpreta. Los offsets de error son relativos al payload de
 * la sección ensamblada.
 *
 * `sizeFieldWidth` selecciona la forma: 4 (por defecto, R2000/AC1018) u 8
 * (R2010+). El campo de 8 bytes se lee con aritmética comprobada: los 4
 * bytes altos deben caber en un entero seguro, igual que cualquier otro
 * tamaño no confiable del laboratorio.
 */
export function readR2004SectionFrame(
  sectionPayload: Uint8Array,
  sentinels: Ac1015SectionSentinelPair,
  sizeFieldWidth: 4 | 8 = 4,
): R2004SectionFrame {
  const minimum = AC1015_SECTION_SENTINEL_LENGTH * 2 + sizeFieldWidth + 2;
  if (sectionPayload.length < minimum) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "The section payload is too small to hold a sentinel frame.",
    );
  }
  for (let index = 0; index < AC1015_SECTION_SENTINEL_LENGTH; index += 1) {
    if (sectionPayload[index] !== sentinels.begin[index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        index,
        "The section begin sentinel is not in place.",
      );
    }
  }
  const sizeOffset = AC1015_SECTION_SENTINEL_LENGTH;
  const declaredSize =
    sizeFieldWidth === 8
      ? readUint64LEChecked(sectionPayload, sizeOffset)
      : readUint32(sectionPayload, sizeOffset);
  const crcOffset = sizeOffset + sizeFieldWidth + declaredSize;
  if (crcOffset + 2 + AC1015_SECTION_SENTINEL_LENGTH > sectionPayload.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      sizeOffset,
      "The declared section size does not fit inside the section payload.",
    );
  }
  const payload = sectionPayload.subarray(
    sizeOffset + sizeFieldWidth,
    crcOffset,
  );
  const crc =
    sectionPayload[crcOffset]! + sectionPayload[crcOffset + 1]! * 0x100;
  const computed = crc16Dwg(
    sectionPayload.subarray(sizeOffset, crcOffset),
    AC1015_SECTION_CRC_SEED,
  );
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcOffset,
      "The section CRC does not match its contents.",
    );
  }
  for (let index = 0; index < AC1015_SECTION_SENTINEL_LENGTH; index += 1) {
    if (sectionPayload[crcOffset + 2 + index] !== sentinels.end[index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        crcOffset + 2 + index,
        "The section end sentinel is not in place.",
      );
    }
  }
  const slackLength =
    sectionPayload.length - (crcOffset + 2 + AC1015_SECTION_SENTINEL_LENGTH);
  return Object.freeze({
    declaredSize,
    payload: Uint8Array.from(payload),
    crc,
    slackLength,
  });
}

/**
 * Tamaño u64 little-endian con aritmética comprobada: un tamaño de sección no
 * confiable nunca se usa para reservar antes de compararlo contra un entero
 * seguro (regla del laboratorio). Los 8 bytes reales del corpus R2010+
 * miden 0 en la mitad alta; un archivo que declare más no cabría en ningún
 * presupuesto del laboratorio y falla cerrado aquí, no al reservar memoria.
 */
function readUint64LEChecked(bytes: Uint8Array, offset: number): number {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]!);
  }
  return checkedBigIntToNumber(value, Number.MAX_SAFE_INTEGER, offset);
}

/**
 * Decodifica la sección de CLASES R2004 (el payload del marco): la cabecera
 * {BS de clase máxima, dos RC y un B — crudos, medidos 0/0/1 en corpus} y
 * registros {classnum BS, banderas proxy BS, tres TV, B, itemclassid BS,
 * recuento BL, versión BS, mantenimiento BS, dos BL} hasta agotar el área
 * (ODS §10.2). Se proyecta al MISMO registro de clase del ensamblado
 * compartido; las banderas proxy viajan crudas en el campo de versión.
 */
export function decodeR2004ClassesSection(
  payload: Uint8Array,
): readonly Ac1015ClassRecord[] {
  const reader = new DwgBitReader(new BoundedByteCursor(payload));
  const totalBits = payload.length * 8;
  reader.readBS(); // número de clase máximo
  reader.readRC();
  reader.readRC();
  reader.readB();
  const records: Ac1015ClassRecord[] = [];
  while (totalBits - reader.bitPosition >= 8) {
    const classNumber = reader.readBS();
    const versionFlags = reader.readBS();
    const appName = copyTextBytes(reader.readTV().bytes);
    const cppClassName = copyTextBytes(reader.readTV().bytes);
    const dxfClassName = copyTextBytes(reader.readTV().bytes);
    const wasAZombie = reader.readB() === 1;
    const itemClassId = reader.readBS();
    reader.readBL(); // objetos creados de este tipo
    reader.readBS(); // versión DWG
    reader.readBS(); // versión de mantenimiento
    reader.readBL();
    reader.readBL();
    records.push(
      Object.freeze({
        classNumber,
        versionFlags,
        appName,
        cppClassName,
        dxfClassName,
        wasAZombie,
        itemClassId,
      }),
    );
  }
  return Object.freeze(records);
}

/** Decodifica y valida SOLO las variables de cabecera de un AC1018 abierto. */
export function readR2004HeaderVariablesFromDatabaseInput(
  headerSectionPayload: Uint8Array,
): R2004HeaderVariables {
  const frame = readR2004SectionFrame(
    headerSectionPayload,
    AC1015_HEADER_VARIABLES_SENTINELS,
  );
  return decodeR2004HeaderVariables(frame.payload);
}

function copyTextBytes(bytes: Uint8Array): readonly number[] {
  const copy = new Array<number>(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    copy[index] = bytes[index]!;
  }
  return Object.freeze(copy);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x1_0000 +
    bytes[offset + 3]! * 0x100_0000
  );
}
