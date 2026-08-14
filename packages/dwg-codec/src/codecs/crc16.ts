/**
 * CRC-16 del formato DWG.
 *
 * El formato protege su cabecera de archivo y varias secciones con un CRC-16
 * table-driven (polinomio reflejado 0xA001) cuya semilla aporta quien llama,
 * y el CRC de la CABECERA además se enmascara con una constante que depende
 * del número de registros localizadores — así un archivo al que se le añade
 * o quita una sección no conserva un CRC válido por accidente.
 *
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (ver SOURCE_REGISTER). Implementación
 * original; la tabla se genera en el arranque del módulo, no se copia.
 *
 * Límite declarado: hasta validar contra corpus real con derechos (fase de
 * intake), la evidencia de estas constantes es el round-trip de laboratorio.
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

/**
 * Máscara XOR del CRC de la cabecera de archivo según el número de registros
 * localizadores. Fuera de 3–6 registros el formato no define máscara: el
 * contenedor lo trata como no soportado, no lo adivina.
 */
export const FILE_HEADER_CRC_XOR_BY_RECORD_COUNT: ReadonlyMap<number, number> =
  new Map([
    [3, 0xa598],
    [4, 0x8101],
    [5, 0x3cc4],
    [6, 0x8461],
  ]);
