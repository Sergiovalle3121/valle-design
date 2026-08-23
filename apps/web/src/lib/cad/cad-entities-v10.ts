/**
 * Lo que estrena el ESQUEMA 10: los DIMVARs que gobiernan el DIBUJO.
 *
 * A diferencia de los esquemas 4 a 7, el 10 no estrena una entidad: estrena
 * SIETE CAMPOS sobre una que ya existía, `dimension`. Vive igual en su propio
 * archivo por dos razones. La primera es la del repositorio: `cad-document.ts`
 * tiene tope de 800 líneas y lo que se añade se extrae. La segunda es que la
 * historia de una subida de esquema se lee mejor junta que repartida por la
 * unión.
 *
 * ## Qué arregla
 *
 * DIMSTYLE ya tenía el núcleo de ~30 DIMVARs: se definían, se editaban, se
 * persistían y viajaban por DXF como tabla. Pero la ENTIDAD de cota no llevaba
 * encima la altura de texto, ni los colores, ni la posición del rótulo, así que
 * el render no tenía de dónde leerlos: un despacho podía fijar su norma de
 * acotación completa y el plano salía exactamente igual. Poder fijar una norma
 * que no se aplica es no poder fijarla.
 *
 * ## Por qué es aditivo de verdad
 *
 * Los siete son opcionales-AUSENTES, como `frozen` en el v9: una cota que no
 * los trae serializa byte a byte igual que antes de la subida, y el render la
 * dibuja con los respaldos de siempre —la altura, por ejemplo, vuelve a
 * derivarse de `arrowSize * 0,55`—. Se comprueba, no se supone:
 * `corpus-sha-provenance.spec.ts` recorre las cotas del corpus de referencia y
 * exige que ninguna estrene un solo campo.
 */

/** Los siete campos que el esquema 10 añade a `dimension`. */
export interface CadSchema10DimensionFields {
  /** DIMTXT — altura del rótulo. Sin ella se deriva de `arrowSize * 0,55`. */
  textHeight?: number;
  /** DIMTXSTY — estilo de texto del rótulo. */
  textStyle?: string;
  /** DIMCLRT — color del rótulo, que no tiene por qué ser el de las líneas. */
  textColor?: string;
  /** DIMCLRD — color de la línea de cota. */
  dimLineColor?: string;
  /** DIMCLRE — color de las líneas de extensión. */
  extensionLineColor?: string;
  /** DIMTAD — rótulo centrado en la línea de cota o encima de ella. */
  textVertical?: "centered" | "above";
  /** DIMJUST — rótulo centrado o pegado a una de las extensiones. */
  textJustification?: "centered" | "first" | "second";
}

/**
 * Lo que hay que ESCALAR al importar de DXF, y lo que no.
 *
 * De los siete campos, sólo `textHeight` es una MEDIDA: viaja en unidades de
 * dibujo y tiene que multiplicarse por el factor de proyección igual que las
 * flechas y los huecos. Los colores y las dos posiciones del rótulo no lo son;
 * multiplicarlos haría que importar un DXF en pulgadas cambiara el color del
 * texto. Vive aquí y no en el importador porque es una regla del ESQUEMA, no
 * del formato: quien añada un campo al v10 tiene que decidirlo en este archivo.
 */
export function cadSchema10ScaledFields(
  source: { textHeight?: number },
  scaleFactor: number,
): { textHeight?: number } {
  return source.textHeight === undefined
    ? {}
    : { textHeight: source.textHeight * scaleFactor };
}
