/**
 * CRC-16 del formato DWG.
 *
 * El formato protege su cabecera de archivo y varias secciones con un CRC-16
 * table-driven (polinomio reflejado 0xA001) cuya semilla aporta quien llama.
 *
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (ver SOURCE_REGISTER). Implementación
 * original; la tabla se genera en el arranque del módulo, no se copia.
 *
 * HISTORIA DE UNA MÁSCARA QUE NO EXISTÍA. La ODS declara que el CRC de la
 * CABECERA se enmascara con una constante XOR según el recuento de registros
 * localizadores (3→0xA598, 4→0x8101, 5→0x3CC4, 6→0x8461). El corpus real la
 * desmintió: los 8 AC1015 de una implementación independiente guardan el CRC
 * CRUDO (XOR observado 0x0000 con 6 registros, 8/8). La tabla se eliminó de
 * este módulo el 2026-08-20; el hecho medido es
 * `VALLE-CORPUS-AC1015-INTAKE-DAE5E77` en SOURCE_REGISTER.
 */

const CRC16_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ 0xa001 : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

/** CRC-16 reflejado sobre los bytes dados, con la semilla del llamador. */
export function crc16Dwg(bytes: Uint8Array, seed: number): number {
  let crc = seed & 0xffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ bytes[index]!) & 0xff]!;
  }
  return crc & 0xffff;
}
