/**
 * UNA SOLA RESOLUCIÓN nombre → patrón de tipo de línea, con respaldo de fábrica.
 *
 * Medido el 2026-09-02: un dibujo nuevo con la capa EJES=CENTER de la norma
 * mexicana no lleva `styles.linetype` (sólo lo puebla la importación de un
 * DXF con tabla LTYPE), así que su catálogo estaba vacío, el visor no tenía
 * ranura, la lámina no llevaba guion y el DXF exportaba CENTER con patrón `[]`
 * («referenciado pero no definido»). Los nueve tipos de fábrica existían
 * (`linetype-lin.ts`) pero sólo alimentaban el catálogo de SESIÓN. Aquí se
 * consultan detrás del catálogo del documento, por nombre y sin distinguir
 * mayúsculas: el importador guarda las claves tal cual vienen del fichero.
 */
import type { CadDocument } from "./cad-document";
import { CAD_BUILTIN_LINETYPES } from "./linetype-lin";

type LinetypeSource = { styles?: Pick<CadDocument["styles"], "linetype"> | CadDocument["styles"] };

/** Patrón `.lin` (>0 trazo, <0 hueco, 0 punto) o `undefined` si nadie lo define. Continua = `[]`. */
export function cadLinetypePatternFor(
  document: LinetypeSource | undefined,
  name: string,
): readonly number[] | undefined {
  const wanted = name.trim().toUpperCase();
  if (wanted === "" ) return undefined;
  const catalog = (document?.styles as { linetype?: Record<string, { pattern: number[] }> } | undefined)?.linetype;
  if (catalog) {
    for (const [key, entry] of Object.entries(catalog)) {
      if (key.toUpperCase() === wanted) return entry.pattern;
    }
  }
  return CAD_BUILTIN_LINETYPES.find((entry) => entry.name.toUpperCase() === wanted)?.pattern;
}

/**
 * De la secuencia `.lin` a la alternancia trazo/hueco que entienden el PDF
 * (`d`) y el SVG (`stroke-dasharray`). Un punto (0) se dibuja como un trazo de
 * `dotLength`: con `setLineCap('butt')` un segmento de longitud cero no pinta.
 */
export function cadLinetypeDashArray(
  pattern: readonly number[],
  scale = 1,
  dotLength = 0.25,
): number[] {
  const dash: number[] = [];
  for (const value of pattern) {
    if (value > 0) dash.push(value * scale);
    else if (value < 0) dash.push(Math.abs(value) * scale);
    else dash.push(dotLength);
  }
  return dash;
}
