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
 * VARIAS CADENAS: cómo se midió, y por qué el guardián valió la pena. La
 * primera pasada sólo cubrió los TEXT, que llevan UNA cadena, y este módulo
 * declaraba capacidad ausente para el resto exigiendo que esa única cadena
 * consumiera el flujo entero. Al aplicarlo a los objetos CON NOMBRE el fallo
 * cerrado saltó en 186 de 288 — «lleva más cadenas de las que este laboratorio
 * ha medido»— en vez de devolver un nombre de capa a medias. Eso no fue un
 * fallo del lector: fue el guardián señalando exactamente qué medir.
 *
 * Medido después: las cadenas van CONSECUTIVAS como `TU`, y la PRIMERA es el
 * valor del TEXT o el NOMBRE del objeto. Sobre los 303 objetos con cadena del
 * corpus —block-record 54, TEXT 15, layer 54, entradas de tabla 180— el
 * consumo del tramo es exacto en **303/303** y la primera cadena coincide con
 * la del gemelo en **303/303**. El histograma de cadenas por objeto es
 * `{1: 117, 2: 78, 3: 84, 5: 24}`: el caso de varias está ejercitado de
 * verdad, no por analogía con el de una.
 *
 * CAPACIDAD AUSENTE, DECLARADA. Sólo la PRIMERA cadena tiene significado
 * comprobado. Las siguientes se devuelven en orden pero NADIE ha medido qué
 * son en cada tipo, así que `readR2010ObjectName` expone la primera y el
 * llamador que quiera el resto usa `readR2010StringStream` sabiendo que las
 * está interpretando por su cuenta.
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
 * Techo de cadenas por objeto. No es una constante del formato: es un
 * presupuesto del laboratorio. El máximo observado en el corpus es 5.
 */
const MAX_STRINGS_PER_OBJECT = 64;

/**
 * Lee TODAS las cadenas del flujo, en orden, como unidades de código UTF-16.
 * `TU` = `BS` con el número de caracteres seguido de esos caracteres en
 * little-endian, y los `TU` van consecutivos hasta agotar el tramo.
 *
 * Falla cerrado (corrupt) si el objeto no declara flujo y —esto es lo que
 * importa— si las cadenas no consumen el tramo EXACTO. Ese chequeo es también
 * un falsador en tiempo de ejecución: si el modelo fuera incorrecto para algún
 * objeto, sobraría o faltaría, y es justo lo que destapó el caso de varias
 * cadenas en vez de devolver un nombre a medias.
 */
export function readR2010StringStream(
  bodyBytes: Uint8Array,
  span: R2010StringStreamSpan,
): readonly (readonly number[])[] {
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

  const strings: (readonly number[])[] = [];
  while (reader.bitPosition - span.startBit < span.sizeBits) {
    if (strings.length >= MAX_STRINGS_PER_OBJECT) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(reader.bitPosition / 8),
        "An R2010+ string stream exceeds the laboratory budget of strings per object.",
      );
    }
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
    strings.push(Object.freeze(units));
  }

  if (reader.bitPosition - span.startBit !== span.sizeBits) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The R2010+ strings do not consume their declared stream exactly.",
    );
  }
  return Object.freeze(strings);
}

/**
 * La PRIMERA cadena del flujo: el valor de un TEXT o el nombre de un objeto
 * con nombre. Es la única cuyo significado está medido (303/303); las demás se
 * obtienen con `readR2010StringStream` y las interpreta quien las pida.
 *
 * Falla cerrado (corrupt) si el flujo está declarado pero vacío: un objeto que
 * reserva bits para cadenas y no trae ninguna es una estructura descuadrada,
 * no un nombre vacío.
 */
export function readR2010ObjectName(
  bodyBytes: Uint8Array,
  span: R2010StringStreamSpan,
): readonly number[] {
  const strings = readR2010StringStream(bodyBytes, span);
  const first = strings[0];
  if (first === undefined) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "An R2010+ object declares a string stream that carries no string at all.",
    );
  }
  return first;
}

/**
 * Las unidades de código como texto. Se hace aparte de la lectura para que el
 * llamador que sólo quiera comparar bytes no pague una conversión, y para que
 * el límite de los pares suplentes viva en un solo sitio.
 */
export function decodeR2010StringUnits(units: readonly number[]): string {
  return String.fromCharCode(...units);
}
