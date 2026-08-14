/**
 * Writer de objetos sintéticos y del mapa de objetos R2000 — fase D1.
 *
 * Es la mitad emisora del round-trip que mantiene honestos al lector del mapa
 * poblado y al de envolturas: emite envolturas de objeto OPACAS (tamaño MS +
 * tipo BS + relleno determinista + CRC RS little-endian) y la sección del
 * mapa con sus páginas big-endian, sus CRC y su terminadora. No inventa
 * constantes propias — la semilla del CRC y el tope de página se importan de
 * los MISMOS módulos que usa el lector; si un hecho está mal transcrito,
 * fallan juntos y el test lo delata.
 *
 * Los objetos de esta fase son CONFESAMENTE sintéticos: el cuerpo es el tipo
 * BS seguido de bytes de relleno deterministas (función pura del tipo y de la
 * posición), no un remedo de entidad real. Decodificar cuerpos es de la fase
 * D2, y escribirlos de una posterior.
 *
 * Reglas del laboratorio: determinista (misma entrada → mismos bytes), fallo
 * cerrado en toda opción inválida y cero dependencias. Hechos de
 * ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER); implementación original.
 */
import { crc16Dwg } from "../codecs/crc16.js";
import {
  AC1015_OBJECT_MAP_MAX_PAGE_SIZE,
  type Ac1015ObjectMapEntry,
} from "../container/ac1015-object-map.js";
import { AC1015_SECTION_CRC_SEED } from "../container/ac1015-section-frame.js";
import {
  copyInspectedByteView,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";

/** Tope de objetos por archivo en esta fase: límite de LABORATORIO. */
export const AC1015_WRITER_MAX_OBJECTS = 10_000;

/** Tope de bytes de relleno por objeto: límite de LABORATORIO. */
export const AC1015_WRITER_MAX_OBJECT_FILL = 0x7f00;

/** Tope de bytes del dato de un objeto envuelto: límite de LABORATORIO. */
export const AC1015_WRITER_MAX_OBJECT_BODY = 0x8000;

/** Relleno por defecto: suficiente para que la envoltura no sea trivial. */
export const AC1015_WRITER_DEFAULT_OBJECT_FILL = 8;

/** Especificación de un objeto sintético opaco. */
export interface Ac1015SyntheticObjectSpec {
  /** Tipo BS con que arranca el cuerpo (0–65535). */
  readonly type: number;
  /**
   * Handle del objeto en el mapa. Por defecto, el anterior más uno (desde 1).
   * Debe ser estrictamente creciente respecto del objeto previo.
   */
  readonly handle?: number;
  /** Bytes de relleno determinista tras el tipo. Por defecto, 8. */
  readonly bodyFillLength?: number;
}

/**
 * Emite la envoltura completa de un objeto sintético: tamaño MS del dato,
 * cuerpo (tipo BS + relleno determinista) y CRC-16 RS little-endian con
 * semilla 0xC0C1 sobre [tamaño + cuerpo] (hecho registrado).
 */
export function writeAc1015ObjectEnvelope(
  spec: Ac1015SyntheticObjectSpec,
): Uint8Array {
  const type = spec.type;
  if (!Number.isInteger(type) || type < 0 || type > 0xffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An object type must fit in an unsigned 16-bit value.",
    );
  }
  const fillLength = spec.bodyFillLength ?? AC1015_WRITER_DEFAULT_OBJECT_FILL;
  if (!Number.isInteger(fillLength) || fillLength < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An object body fill must be a non-negative integer.",
    );
  }
  if (fillLength > AC1015_WRITER_MAX_OBJECT_FILL) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "An object body fill exceeds the phase-D laboratory limit.",
    );
  }

  // El cuerpo: el BS del tipo (2, 10 o 18 bits; los bits sobrantes del último
  // byte quedan a cero) seguido del relleno determinista. El relleno es
  // función pura del tipo y de la posición — mismo spec, mismos bytes.
  const emitter = new MsbBitEmitter();
  emitBS(emitter, type);
  const typeBytes = emitter.toBytes();
  const body = new Uint8Array(typeBytes.length + fillLength);
  body.set(typeBytes, 0);
  for (let index = 0; index < fillLength; index += 1) {
    body[typeBytes.length + index] = (type * 7 + index * 11 + 3) & 0xff;
  }

  return wrapAc1015ObjectBody(body);
}

/**
 * Envuelve un cuerpo de objeto YA COMPUESTO (tipo BS incluido) con su marco
 * D1: tamaño MS del dato + cuerpo + CRC-16 RS little-endian con semilla
 * 0xC0C1 sobre [tamaño + cuerpo] (hecho registrado). Es la única forma de
 * emitir envolturas — los objetos sintéticos de esta misma fase y los cuerpos
 * de entidad REALES de la fase D2 pasan por aquí, sin marcos gemelos.
 */
export function wrapAc1015ObjectBody(bodyBytes: Uint8Array): Uint8Array {
  // Inspección y copia únicas (rechazando SharedArrayBuffer): a partir de
  // aquí el marco sólo mira bytes que posee, como el resto del writer.
  const body = copyInspectedByteView(inspectOrdinaryByteView(bodyBytes));
  if (body.length < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An object body must hold at least its type field.",
    );
  }
  if (body.length > AC1015_WRITER_MAX_OBJECT_BODY) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "An object body exceeds the phase-D laboratory limit.",
    );
  }
  const sizeBytes = encodeDwgModularShort(body.length);
  const envelope = new Uint8Array(sizeBytes.length + body.length + 2);
  envelope.set(sizeBytes, 0);
  envelope.set(body, sizeBytes.length);
  const crc = crc16Dwg(
    envelope.subarray(0, sizeBytes.length + body.length),
    AC1015_SECTION_CRC_SEED,
  );
  envelope[sizeBytes.length + body.length] = crc & 0xff;
  envelope[sizeBytes.length + body.length + 1] = (crc >> 8) & 0xff;
  return envelope;
}

/**
 * Emite la sección COMPLETA del mapa de objetos para las entradas dadas:
 * páginas de pares delta (handle sin signo, offset con signo) acumulados
 * desde 0 al inicio de la sección, cada página con su tamaño y su CRC
 * big-endian, cortada al tope del formato SIN partir ningún par, y la
 * terminadora al final. Con cero entradas emite exactamente los 4 bytes del
 * mapa vacío de la fase C.
 */
export function buildAc1015ObjectMapSection(
  entries: readonly Ac1015ObjectMapEntry[],
): Uint8Array {
  if (!Array.isArray(entries)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The object-map entries must be an array.",
    );
  }
  if (entries.length > AC1015_WRITER_MAX_OBJECTS) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The object map exceeds the phase-D laboratory object limit.",
    );
  }

  // Primero los pares, cada uno como unidad atómica de bytes; después el
  // corte en páginas. Cortar por pares (nunca por dentro de un modular) es el
  // hecho declarado con el que el lector parsea cada página completa.
  const maxDataPerPage = AC1015_OBJECT_MAP_MAX_PAGE_SIZE - 2;
  const pages: number[][] = [];
  let currentPage: number[] = [];
  let lastHandle = 0;
  let lastOffset = 0;
  const seenOffsets = new Set<number>();
  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.handle) ||
      entry.handle <= lastHandle ||
      !Number.isSafeInteger(entry.offset) ||
      entry.offset < 0
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Object-map entries need strictly increasing handles and non-negative offsets.",
      );
    }
    if (seenOffsets.has(entry.offset)) {
      // El lector rechaza offsets compartidos; el writer no emite lo que su
      // propio lector no aceptaría.
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Two object-map entries cannot share the same file offset.",
      );
    }
    seenOffsets.add(entry.offset);
    const pair = [
      ...encodeDwgUnsignedModularChar(entry.handle - lastHandle),
      ...encodeDwgSignedModularChar(entry.offset - lastOffset),
    ];
    if (currentPage.length + pair.length > maxDataPerPage) {
      pages.push(currentPage);
      currentPage = [];
    }
    currentPage.push(...pair);
    lastHandle = entry.handle;
    lastOffset = entry.offset;
  }
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  const out: number[] = [];
  for (const page of pages) {
    pushPage(out, page);
  }
  pushPage(out, []); // la terminadora: tamaño 2, sin datos
  return Uint8Array.from(out);
}

/** Cierra una página: tamaño BE (cuenta sus 2 bytes), datos y CRC BE. */
function pushPage(out: number[], data: readonly number[]): void {
  const pageSize = 2 + data.length;
  const pageBytes = Uint8Array.from([
    (pageSize >> 8) & 0xff,
    pageSize & 0xff,
    ...data,
  ]);
  const crc = crc16Dwg(pageBytes, AC1015_SECTION_CRC_SEED);
  out.push(...pageBytes, (crc >> 8) & 0xff, crc & 0xff);
}

/**
 * Entero modular sin signo: 7 bits útiles por byte con bit alto de
 * continuación; el primer byte lleva los menos significativos. Es el espejo
 * exacto de `DwgBitReader.readUnsignedMC`.
 */
export function encodeDwgUnsignedModularChar(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An unsigned modular char needs a non-negative safe integer.",
    );
  }
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

/**
 * Entero modular con signo: como el anterior, pero el último byte reserva el
 * bit 0x40 para el signo y sólo aporta 6 bits de magnitud. Espejo de
 * `DwgBitReader.readSignedMC`.
 */
export function encodeDwgSignedModularChar(value: number): number[] {
  if (!Number.isSafeInteger(value)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A signed modular char needs a safe integer.",
    );
  }
  const negative = value < 0;
  let magnitude = Math.abs(value);
  const bytes: number[] = [];
  while (magnitude > 0x3f) {
    bytes.push((magnitude & 0x7f) | 0x80);
    magnitude = Math.floor(magnitude / 0x80);
  }
  bytes.push((negative ? 0x40 : 0x00) | magnitude);
  return bytes;
}

/**
 * Entero modular short: palabras little-endian de 15 bits útiles con bit alto
 * de continuación, dos palabras como máximo (espejo del tope del lector).
 */
export function encodeDwgModularShort(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x3fff_ffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A modular short must fit in two 15-bit words.",
    );
  }
  if (value < 0x8000) {
    return [value & 0xff, (value >> 8) & 0xff];
  }
  const low = (value & 0x7fff) | 0x8000;
  const high = Math.floor(value / 0x8000);
  return [low & 0xff, (low >> 8) & 0xff, high & 0xff, (high >> 8) & 0xff];
}

/**
 * Emisor de bits MSB-first: el espejo del orden que `DwgBitReader` fija al
 * leer. Sólo emite lo que esta fase necesita (el BS del tipo); un writer de
 * cuerpos completos es de fases posteriores.
 */
class MsbBitEmitter {
  readonly #bytes: number[] = [];
  #bitCount = 0;

  pushBits(value: number, width: number): void {
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      const bit = (value >> shift) & 1;
      if (this.#bitCount % 8 === 0) {
        this.#bytes.push(0);
      }
      const byteIndex = this.#bytes.length - 1;
      this.#bytes[byteIndex] =
        this.#bytes[byteIndex]! | (bit << (7 - (this.#bitCount % 8)));
      this.#bitCount += 1;
    }
  }

  /** Bytes emitidos; los bits sobrantes del último quedan a cero. */
  toBytes(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}

/**
 * BS: se elige la forma más corta que el formato define para el valor — los
 * atajos de 0 y 256, el byte corto o el RS literal (bytes little-endian
 * dentro del flujo de bits). Espejo de `DwgBitReader.readBS`.
 */
function emitBS(emitter: MsbBitEmitter, value: number): void {
  if (value === 0) {
    emitter.pushBits(0b10, 2);
    return;
  }
  if (value === 256) {
    emitter.pushBits(0b11, 2);
    return;
  }
  if (value <= 0xff) {
    emitter.pushBits(0b01, 2);
    emitter.pushBits(value, 8);
    return;
  }
  emitter.pushBits(0b00, 2);
  emitter.pushBits(value & 0xff, 8);
  emitter.pushBits((value >> 8) & 0xff, 8);
}
