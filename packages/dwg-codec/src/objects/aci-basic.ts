/**
 * La tabla ACI básica, en LAS DOS DIRECCIONES — una sola fuente.
 *
 * POR QUÉ VIVE APARTE. La dirección índice → hex la usaba el mapeo canónico
 * para leer; la dirección hex → índice hace falta para ESCRIBIR, y sin ella
 * el writer público perdía el color de cada capa en silencio (medido el
 * 2026-09-01: una capa cian, ACI 4, salía escrita como ACI 7). Dos tablas
 * separadas es exactamente donde una divergencia entre leer y escribir no la
 * vería ninguna prueba: la de ida diría cian y la de vuelta blanco.
 *
 * ES LA TABLA BÁSICA, NO LA COMPLETA. Cubre los índices con nombre propio
 * (1..9) y el tramo de grises (250..255). Un color fuera de ella no se
 * aproxima al más cercano: se declara. Aproximar convertiría «este color no
 * lo sé escribir» en «este color es gris», que es una afirmación sobre el
 * dibujo del usuario que este laboratorio no puede hacer.
 */

/** Índice ACI → color hexadecimal en mayúsculas. */
export const ACI_BASIC_HEX: Record<number, string> = {
  1: "#FF0000",
  2: "#FFFF00",
  3: "#00FF00",
  4: "#00FFFF",
  5: "#0000FF",
  6: "#FF00FF",
  7: "#FFFFFF",
  8: "#808080",
  9: "#C0C0C0",
  250: "#333333",
  251: "#505050",
  252: "#696969",
  253: "#828282",
  254: "#BEBEBE",
  255: "#FFFFFF",
};

/**
 * Inverso de `ACI_BASIC_HEX`. Se construye UNA vez desde la misma tabla, no a
 * mano: una segunda lista escrita a mano se desincroniza el día que alguien
 * toque un solo valor.
 *
 * AMBIGÜEDAD REAL Y RESUELTA A PROPÓSITO: el blanco `#FFFFFF` es a la vez el
 * índice 7 y el 255. Gana el MENOR, que es el blanco convencional y el color
 * por defecto de la capa "0"; escribir 255 donde el dibujo dice blanco sería
 * técnicamente válido y sorprendente para cualquiera que abra el archivo.
 */
const ACI_BY_HEX: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [index, hex] of Object.entries(ACI_BASIC_HEX)) {
    const numeric = Number(index);
    const previous = map.get(hex);
    if (previous === undefined || numeric < previous) map.set(hex, numeric);
  }
  return map;
})();

/**
 * Índice ACI de un color hexadecimal, o `undefined` si no está en la tabla
 * básica. El llamador DECLARA la ausencia; nunca aproxima al más cercano.
 */
export function aciIndexFromHex(hex: string): number | undefined {
  return ACI_BY_HEX.get(hex.trim().toUpperCase());
}
