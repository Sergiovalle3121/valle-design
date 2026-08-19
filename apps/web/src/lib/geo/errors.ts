/**
 * El error tipado de todo lo geoespacial. Un solo tipo, un código por causa.
 *
 * ## Por qué un error y no un aviso
 *
 * En el resto del producto, un archivo ajeno que entra mal produce un INFORME:
 * el DXF dice qué perdió y el dibujante decide. Aquí no. Un plano de linderos
 * no admite el mismo trato: si el vértice tres de un predio se lee con la
 * coordenada equivocada porque el archivo venía truncado, lo que sale por la
 * impresora es un polígono plausible —cerrado, con superficie, con rumbos— que
 * NO es el predio. Nadie lo va a notar mirándolo, y el que lo note será el
 * vecino, en un juzgado.
 *
 * Por eso todo este subárbol falla CERRADO: ante cualquier ambigüedad se lanza
 * un `GeoError` con su código y se abandona la lectura entera. Nunca se
 * devuelve la parte que sí se entendió, porque «la parte que sí se entendió»
 * de un archivo corrupto es exactamente la trampa: parece un resultado.
 *
 * ## Por qué el código va aparte del mensaje
 *
 * El mensaje está en español y se le enseña al arquitecto. El código es
 * estable, se prueba en las specs y no se traduce nunca. Mezclarlos obligaría
 * a que un cambio de redacción rompiera una prueba, y entonces las pruebas
 * dejarían de comprobar la CAUSA para comprobar la ortografía.
 */

/**
 * Causas por las que este subárbol se niega a seguir.
 *
 * Están agrupadas por dónde se detectan; el prefijo no significa nada para el
 * programa, sólo hace legible una lista que va a crecer.
 */
export type GeoErrorCode =
  // --- el archivo no es lo que dice ser -------------------------------------
  /** El número mágico de la cabecera no corresponde al formato pedido. */
  | "formato-desconocido"
  /** La versión del formato existe pero esta implementación no la cubre. */
  | "variante-no-soportada"
  /** El archivo se acaba antes de lo que su propia cabecera anuncia. */
  | "archivo-truncado"
  /** Un campo declara un tamaño que no cabe en el archivo, o es absurdo. */
  | "longitud-incoherente"
  // --- el contenido no se sostiene ------------------------------------------
  /** Una coordenada es NaN, infinita, o cae fuera del dominio del formato. */
  | "coordenada-invalida"
  /** La geometría existe pero está mal formada (anillo de dos puntos, etc.). */
  | "geometria-invalida"
  /** Los índices internos (partes, registros, sidecar) no cuadran entre sí. */
  | "indice-incoherente"
  /** Un atributo de la tabla no se puede interpretar como su tipo declarado. */
  | "atributo-ilegible"
  // --- sistemas de referencia -----------------------------------------------
  /** No se pudo determinar en qué sistema de referencia están las coordenadas. */
  | "crs-desconocido"
  /** El sistema se identificó y esta implementación no lo sabe reproyectar. */
  | "crs-no-soportado"
  /** El punto cae fuera del dominio donde la reproyección está verificada. */
  | "fuera-de-dominio"
  // --- límites de recursos ---------------------------------------------------
  /** El archivo supera el límite declarado; leerlo tumbaría la pestaña. */
  | "demasiado-grande";

/**
 * Fallo de lectura o de reproyección geoespacial.
 *
 * `detail` lleva SIEMPRE el dato numérico que provocó el rechazo (el offset de
 * bytes, el valor leído, el que se esperaba). Sin él, «archivo corrupto» obliga
 * a quien depura a abrir el binario a mano; con él, el mensaje ya dice por
 * dónde empezar. Es la diferencia entre un error que informa y uno que sólo
 * interrumpe.
 */
export class GeoError extends Error {
  readonly code: GeoErrorCode;
  /** Ruta o nombre del archivo, cuando se conoce. Vacío si se leyó de memoria. */
  readonly source: string;
  /** Contexto numérico del rechazo, listo para pegar en un informe de fallo. */
  readonly detail: Readonly<Record<string, string | number>>;

  constructor(
    code: GeoErrorCode,
    message: string,
    options: {
      source?: string;
      detail?: Readonly<Record<string, string | number>>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "GeoError";
    this.code = code;
    this.source = options.source ?? "";
    this.detail = options.detail ?? {};
  }
}

/**
 * Atajo para el caso abrumadoramente mayoritario: comprobar una condición y
 * abandonar si no se cumple.
 *
 * Se escribe como aserción de TypeScript para que el estrechamiento de tipos
 * sobreviva a la comprobación; si no, cada guardia obligaría a un `else` que
 * sólo existe para contentar al compilador y que enturbia la lectura de un
 * archivo binario, donde las guardias son mayoría del código.
 */
export function geoAssert(
  condition: unknown,
  code: GeoErrorCode,
  message: string,
  options: {
    source?: string;
    detail?: Readonly<Record<string, string | number>>;
  } = {},
): asserts condition {
  if (!condition) throw new GeoError(code, message, options);
}

/** `true` si el error viene de este subárbol. Útil en el borde con la interfaz. */
export function isGeoError(value: unknown): value is GeoError {
  return value instanceof GeoError;
}
