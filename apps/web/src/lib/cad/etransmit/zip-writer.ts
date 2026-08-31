/**
 * Escritor de ZIP mínimo, sin dependencias.
 *
 * `ETRANSMIT` necesita empaquetar el documento, su manifiesto y —cuando el
 * anfitrión los resuelva— sus xrefs e imágenes en un único archivo que se
 * abra con cualquier cosa. Añadir una dependencia nueva por un formato tan
 * simple no se justifica: el método STORE (sin comprimir) es ZIP válido de
 * punta a punta, lo abre cualquier sistema operativo y cualquier librería, y
 * ciento cincuenta líneas de aritmética sobre bytes son más baratas de auditar
 * que una dependencia nueva en `package-lock.json`.
 *
 * ## Por qué STORE y no DEFLATE
 *
 * Comprimir exige un códec, y el que trae Node (`zlib`) no está disponible en
 * el navegador sin un `polyfill` — el mismo problema que ya resolvió `PLOT`
 * escribiendo su propio PDF en vez de tirar de una librería atada a un
 * entorno. Un ZIP sin comprimir es más grande; sigue siendo un ZIP correcto,
 * y es sincero: no promete una compresión que no hay.
 */

/** Tabla CRC-32 (polinomio IEEE 802.3), calculada una vez al cargar el módulo. */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 estándar (el mismo algoritmo que `zlib.crc32` de Node). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1)
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface CadZipEntry {
  /** Ruta DENTRO del archivo, con `/` como separador — nunca `\`. */
  path: string;
  bytes: Uint8Array;
}

/** Fecha/hora DOS de una entrada. Fija: el ZIP de una entrega no debe variar por el reloj de quien lo generó. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 9) | (1 << 5) | 1; // 1980-01-01, el epoch DOS.

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/**
 * Construye un `.zip` con método STORE.
 *
 * Determinista: mismas entradas, mismos bytes de salida — dos publicaciones
 * del mismo dibujo producen el mismo archivo, que es lo que permite comparar
 * paquetes byte a byte en una prueba.
 */
export function buildZip(entries: readonly CadZipEntry[]): Uint8Array {
  const nameBytes = entries.map((entry) => new TextEncoder().encode(entry.path));
  const crcs = entries.map((entry) => crc32(entry.bytes));

  const localParts: number[][] = [];
  const offsets: number[] = [];
  let offset = 0;
  entries.forEach((entry, index) => {
    offsets.push(offset);
    const name = nameBytes[index];
    const header = [
      ...u32(0x04034b50),
      ...u16(20), // versión mínima
      ...u16(0), // flags
      ...u16(0), // método: STORE
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crcs[index]),
      ...u32(entry.bytes.length),
      ...u32(entry.bytes.length),
      ...u16(name.length),
      ...u16(0), // sin campo extra
      ...Array.from(name),
      ...Array.from(entry.bytes),
    ];
    localParts.push(header);
    offset += header.length;
  });

  const centralParts: number[][] = [];
  entries.forEach((entry, index) => {
    const name = nameBytes[index];
    centralParts.push([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crcs[index]),
      ...u32(entry.bytes.length),
      ...u32(entry.bytes.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offsets[index]),
      ...Array.from(name),
    ]);
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const localSize = localParts.reduce((total, part) => total + part.length, 0);
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(localSize),
    ...u16(0), // sin comentario
  ];

  const total = localSize + centralSize + end.length;
  const zip = new Uint8Array(total);
  let cursor = 0;
  for (const part of localParts) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  zip.set(end, cursor);
  return zip;
}
