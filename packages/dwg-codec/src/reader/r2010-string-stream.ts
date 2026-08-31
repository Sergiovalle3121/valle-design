/**
 * FLUJO DE CADENAS del cuerpo de objeto R2010+ (AC1024/AC1027/AC1032) —
 * intake 2026-08-31 (`VALLE-CORPUS-R2010-STRING-STREAM` en SOURCE_REGISTER).
 *
 * QUÉ DESBLOQUEA. Es el segundo de los dos frentes que `readR2004Database`
 * nombra al fallar cerrado para las tres versiones modernas. Sin cadenas no
 * hay NOMBRES: ni de capa, ni de bloque, ni de estilo, ni el contenido de un
 * TEXT. `readR2010EntityBody` sólo decodifica las cinco entidades SIN cadena
 * precisamente por esto, y falla cerrado en cuanto el bit de presencia vale 1.
 *
 * DISPOSICIÓN MEDIDA. Contando hacia atrás desde el bit de presencia —que
 * `VALLE-CORPUS-R2010-OBJECT-BODY` ya situó exactamente un bit antes del flujo
 * de handles— el cuerpo termina así:
 *
 *     [ ... datos del tipo ... ]
 *     [ flujo de cadenas: N bits ]
 *     [ tamaño del flujo: RS de 16 bits, valor N ]
 *     [ bit de presencia = 1 ]
 *     [ flujo de handles ]  [ relleno hasta el byte ]
 *
 * y dentro del flujo, cada cadena es un `TU`: un `BS` con el número de
 * CARACTERES seguido de esos caracteres en UTF-16LE.
 *
 * FALSACIÓN, POR TRES CAMINOS QUE TENDRÍAN QUE FALLAR JUNTOS (15/15 objetos
 * con cadena del corpus, 5 por versión):
 *
 *  1. El campo RS de 16 bits vale EXACTAMENTE los bits que ocupan el `BS` de
 *     longitud más los datos UTF-16 — un número calculado del gemelo AC1015,
 *     no leído del archivo moderno: **15/15**.
 *  2. El inicio derivado como `bitPresencia - 16 - N` cae EXACTAMENTE donde
 *     empieza ese `BS`: **15/15**.
 *  3. El texto decodificado coincide byte a byte con el del gemelo: **15/15**.
 *
 * Y el bit de presencia vale 1 en los 15, frente a 0 en los 72 objetos sin
 * cadena ya medidos: la semántica del bit queda confirmada por los dos lados.
 *
 * CAPACIDAD AUSENTE, DECLARADA. El corpus admitido sólo ejercita objetos con
 * UNA cadena. El orden de VARIAS cadenas dentro de un mismo flujo NO está
 * medido, así que `readR2010SingleString` EXIGE que la única cadena consuma el
 * flujo entero y falla cerrado si sobra algo — antes que suponer que las
 * siguientes van seguidas y devolver un nombre de capa plausible y equivocado.
 * Ese chequeo es además un falsador en tiempo de ejecución: si el modelo fuera
 * incorrecto para algún objeto, sobraría o faltaría.
 *
 * Tampoco hay cadenas no-ASCII en el corpus: que la codificación sea UTF-16LE
 * está medido, pero sólo sobre puntos de código latinos básicos. Los pares
 * suplentes (fuera del BMP) no están ejercitados y viajan crudos como unidades
 * de código, sin combinarse.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import type { R2010ObjectHeader } from "../container/r2010-object-envelope.js";
import { throwDwgError } from "../security/parse-error.js";

/** Anchura MEDIDA del campo de tamaño del flujo: un RS. */
const SIZE_FIELD_BITS = 16;

/**
 * Techo de caracteres por cadena. No es una constante del formato: es un
 * presupuesto del laboratorio para que un contador corrupto no reserve
 * memoria sin límite. El máximo observado en el corpus admitido es 12.
 */
const MAX_STRING_CHARS = 0x10000;

/** Dónde vive el flujo de cadenas de un objeto, o que no lo lleva. */
export interface R2010StringStreamSpan {
  /** El bit de presencia, exactamente uno antes del flujo de handles. */
  readonly presenceBit: number;
  readonly present: boolean;
  /** Bits del flujo, sin contar el campo de tamaño. 0 cuando no lo lleva. */
  readonly sizeBits: number;
  /** Primer bit del flujo. Igual a `presenceBit` cuando no lo lleva. */
  readonly startBit: number;
}

/**
 * Localiza el flujo de cadenas contando hacia atrás desde el final del cuerpo.
 *
 * Falla cerrado (corrupt) si el tamaño declarado no cabe entre el final del
 * encabezado y el campo de tamaño: un flujo que empieza antes de que existan
 * datos no es un flujo, es un descuadre.
 */
export function locateR2010StringStream(
  bodyBytes: Uint8Array,
  header: R2010ObjectHeader,
): R2010StringStreamSpan {
  const totalBits = bodyBytes.length * 8;
  const presenceBit = totalBits - header.handleStreamBits - 1;
  if (presenceBit < header.dataBitOffset) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "The R2010+ string-presence bit would fall before the object header ends.",
    );
  }

  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < presenceBit; index += 1) reader.readB();
  if (reader.readB() === 0) {
    return Object.freeze({
      presenceBit,
      present: false,
      sizeBits: 0,
      startBit: presenceBit,
    });
  }

  if (presenceBit - SIZE_FIELD_BITS < header.dataBitOffset) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "An R2010+ object declares a string stream with no room for its size field.",
    );
  }
  const sizeReader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < presenceBit - SIZE_FIELD_BITS; index += 1) {
    sizeReader.readB();
  }
  const sizeBits = sizeReader.readRS();
  const startBit = presenceBit - SIZE_FIELD_BITS - sizeBits;
  if (startBit < header.dataBitOffset) {
    // El offset se acota a 0: un tamaño que desborda el cuerpo produce un
    // `startBit` NEGATIVO, y un byte negativo en un error tipado no señala
    // ningún sitio. El defecto es del objeto entero, no de una posición.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.max(0, Math.floor(startBit / 8)),
      "An R2010+ string stream declares more bits than the object body can hold.",
    );
  }
  return Object.freeze({ presenceBit, present: true, sizeBits, startBit });
}

/**
 * Lee la ÚNICA cadena del flujo como unidades de código UTF-16, en el orden en
 * que viajan. `TU` = `BS` con el número de caracteres seguido de esos
 * caracteres en little-endian.
 *
 * Falla cerrado (corrupt) si el objeto no declara flujo, y —esto es lo que
 * importa— si la cadena NO consume el flujo entero: el corpus sólo ejercita
 * objetos de una cadena, así que un sobrante significa o un modelo incorrecto
 * o un objeto con varias, y ninguno de los dos se resuelve adivinando.
 */
export function readR2010SingleString(
  bodyBytes: Uint8Array,
  span: R2010StringStreamSpan,
): readonly number[] {
  if (!span.present) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "This R2010+ object declares no string stream, so it carries no string to read.",
    );
  }

  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < span.startBit; index += 1) reader.readB();

  const count = reader.readBS();
  if (count < 0 || count > MAX_STRING_CHARS) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "An R2010+ string declares a character count outside the laboratory budget.",
    );
  }

  const units: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const low = reader.readRC();
    const high = reader.readRC();
    units.push(low | (high << 8));
  }

  const consumed = reader.bitPosition - span.startBit;
  if (consumed !== span.sizeBits) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "This R2010+ string does not consume its declared stream exactly, so the object carries more strings than this laboratory has measured.",
    );
  }
  return Object.freeze(units);
}

/**
 * Las unidades de código como texto. Se hace aparte de la lectura para que el
 * llamador que sólo quiera comparar bytes no pague una conversión, y para que
 * el límite de los pares suplentes viva en un solo sitio.
 */
export function decodeR2010StringUnits(units: readonly number[]): string {
  return String.fromCharCode(...units);
}
