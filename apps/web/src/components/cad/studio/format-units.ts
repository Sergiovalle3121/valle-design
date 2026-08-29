/**
 * Los tres formateadores de unidades del estudio.
 *
 * Vivían como constantes de módulo dentro de `Layout3DEditor.tsx`, donde no
 * estorbaban a nadie hasta que hubo que sacar de allí un cuadro que los usa:
 * el panel de cantidades formatea áreas y longitudes en cada fila. O se
 * duplicaban —dos definiciones del mismo redondeo es la forma de que un día
 * discrepen— o salían a un módulo propio. Salieron.
 *
 * La conversión a metros y a metros cuadrados es la del producto y no una
 * genérica: el documento canónico guarda milímetros por defecto, y `es-MX` es
 * la configuración regional de los usuarios, con su coma decimal y su punto de
 * millares.
 */

/** Una distancia en la unidad del documento, redondeada y con su sufijo. */
export const fmtDist = (d: number, unit: string) =>
  `${Math.round(d).toLocaleString("es-MX")} ${unit}`;

/** Un área en la unidad del documento, siempre publicada en m². */
export const fmtArea = (v: number, unit: string) => {
  const m2 = unit === "mm" ? v / 1e6 : unit === "cm" ? v / 1e4 : v; // → m²
  return `${m2.toLocaleString("es-MX", { maximumFractionDigits: m2 < 100 ? 2 : 0 })} m²`;
};

/** Una longitud en la unidad del documento, siempre publicada en metros. */
export const fmtLen = (v: number, unit: string) => {
  const m = unit === "mm" ? v / 1000 : unit === "cm" ? v / 100 : v; // → m
  return `${m.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m`;
};
