/**
 * LA SEMÁNTICA DEL ANCLAJE DE MTEXT, MEDIDA — Y SU COBERTURA REAL.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE. El anclaje (`attachment`) es el único campo del
 * cuerpo MTEXT cuyo SIGNIFICADO no estaba disponible. El hecho registrado de
 * la fuente (`ODA-ODS-DWG-5.4.1-PUBLIC`) documenta su DISPOSICIÓN —«attachment
 * BS» en esa posición del cuerpo— pero no qué quiere decir cada número, y sin
 * eso el camino público no podía escribir la clase sin adivinar dónde queda
 * anclado el texto. Vive en su propio módulo porque lo usan las DOS
 * direcciones —la lectura al canónico y la escritura al writer— y una tabla
 * duplicada es una tabla que se desincroniza.
 *
 * DE DÓNDE SALE. De medir, no de leer una implementación ajena: cada fixture
 * DWG del corpus admitido tiene su DXF fuente gemelo, y el DXF numera el
 * anclaje en el código 71 con la semántica que el propio producto ya deriva de
 * la especificación DXF pública. La sonda `scripts/dwg/probe-mtext-fields.mjs`
 * compara los dos lados del mismo dibujo y contrasta cinco hipótesis rivales
 * —identidad, ±1, la inversión 10-x y la constante 1—. Sólo la identidad
 * sobrevive: 5 de 5 parejas, con dos valores distintos en juego. La constante
 * 1 muere en el MTEXT anclado al centro; la inversión sobrevive SÓLO en ese
 * mismo caso y muere en los otros cuatro. La evidencia está congelada en
 * `docs/cad/evidence/dwg-mtext-fields.json`.
 *
 * LA COBERTURA, DICHA ENTERA. El corpus ejerce DOS de los nueve anclajes: el 1
 * (arriba-izquierda) y el 5 (centro). Para los otros siete la identidad es la
 * única hipótesis que queda en pie, pero eso NO es una medición, y este
 * laboratorio no llama medido a lo que no midió. Por eso `ANCLAJES_MEDIDOS`
 * existe por separado: quien escribe uno de los siete restantes declara la
 * pérdida `mtext-attachment-unmeasured` y quien reexporta puede leerla.
 */

/** Nombre de alineación del editor por código de anclaje del cuerpo MTEXT. */
export const ALINEACION_POR_ANCLAJE: Readonly<Record<number, string>> =
  Object.freeze({
    1: "top-left",
    2: "top-center",
    3: "top-right",
    4: "middle-left",
    5: "middle-center",
    6: "middle-right",
    7: "bottom-left",
    8: "bottom-center",
    9: "bottom-right",
  });

/** La vuelta, derivada de la ida: una sola tabla, dos direcciones. */
export const ANCLAJE_POR_ALINEACION: Readonly<Record<string, number>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(ALINEACION_POR_ANCLAJE).map(([code, name]) => [
        name,
        Number(code),
      ]),
    ),
  );

/**
 * Los anclajes que el corpus admitido EJERCE. No es «los que funcionan»: es
 * los que están respaldados por una comparación contra el oráculo.
 */
export const ANCLAJES_MEDIDOS: ReadonlySet<number> = Object.freeze(
  new Set([1, 5]),
) as ReadonlySet<number>;

/** El anclaje por defecto del editor, y por tanto el de un canónico sin dato. */
export const ANCLAJE_POR_DEFECTO = 1;
