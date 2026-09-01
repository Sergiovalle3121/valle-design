/**
 * CUERPO de objeto R2010+ (AC1024/AC1027/AC1032) para las entidades SIN
 * cadenas — intake 2026-08-31 (M4, continuación del encabezado ya resuelto
 * en `container/r2010-object-envelope.ts`).
 *
 * MEDICIÓN (VALLE-CORPUS-R2010-OBJECT-BODY en SOURCE_REGISTER.json, sin
 * fuente documental nueva, mismo corpus y mismo método diferencial que el
 * encabezado): el primer bit de dato ESPECÍFICO DEL TIPO cae a una distancia
 * FIJA, por versión, del handle propio que decodifica `readR2010ObjectHeader`
 * — 39 bits en AC1024, 40 en AC1027 y AC1032 — localizada por búsqueda bit a
 * bit del double IEEE-754 exacto del primer campo geométrico del gemelo
 * AC1015 en LINE/CIRCLE/ARC/POINT, con la MISMA cifra para los cuatro tipos
 * dentro de cada versión pese a que cada uno resta una cantidad distinta de
 * bits de su propio prefijo (falsación: un ancho equivocado en cualquier
 * campo previo los habría desalineado de forma DISTINTA por tipo).
 *
 * QUÉ HAY EN ESE TRAMO. No se sabe, y no se finge saberlo: `readAc1015EntityCommon`
 * ya decodifica de forma sensata la primera mitad (EED, gráfico, modo,
 * reactores, sin-vínculos/xdic-missing, color, escala y banderas — 16 de esos
 * 39/40 bits en el corpus medido, todo en sus valores por defecto), pero el
 * resto (23/24 bits) no tiene semántica identificada: puede ser invisibilidad
 * y lineweight reordenados, o un campo nuevo del formato. Inventar su
 * disposición sería el peor modo de fallo posible aquí (un dato plausible y
 * equivocado que además desalinea la geometría), así que este módulo trata
 * el tramo COMPLETO como opaco y sólo confía en su ANCHURA TOTAL medida.
 *
 * ADENDA 2026-08-31 (VALLE-CORPUS-R2010-HANDLE-STREAM). Esa primera mitad SÍ
 * se puede usar, y desde entonces se usa: `deriveR2010HandleShape`
 * (`reader/r2010-handle-stream.ts`) la decodifica con el bit de xdic-missing
 * ANTES del de sin-vínculos y así deduce la forma del flujo de handles,
 * coincidiendo con el gemelo en 105/105. La decisión de este módulo NO cambia
 * —para localizar la geometría sigue bastando la anchura total, y la segunda
 * mitad sigue sin identificar— pero la frase «el tramo COMPLETO como opaco»
 * describe lo que este módulo hace, no lo que el tramo permite.
 *
 * SEGURO CONTRA DESALINEAMIENTO, NO GARANTIZADO. La anchura fija sólo está
 * validada para el único caso que el corpus ejercita (EED ausente, sin
 * gráfico, 0 reactores, modo de entidad 2, banderas por defecto). El aterrizaje
 * exacto EXIGIDO al final —el bit de presencia de cadenas debe caer EXACTAMENTE
 * un bit antes del flujo de handles ya conocido por MS/UMC— detecta la
 * mayoría de los desalineamientos que un valor distinto produciría, pero no
 * lo garantiza matemáticamente: es la misma clase de riesgo residual que ya
 * acepta el adaptador R2004→R2000 para AC1018.
 *
 * BIT DE PRESENCIA DE CADENAS. El hecho ya registrado de ODA-ODS-DWG-5.4.1-PUBLIC
 * ("AC1021+ introduce el flujo de STRINGS separado al final del cuerpo... el
 * bit de presencia del final del dato") predijo su EXISTENCIA; este intake
 * midió su POSICIÓN (el bit inmediatamente anterior al flujo de handles) y
 * confirmó su valor en 0 para las 72 observaciones — ninguna de las cinco
 * entidades sin cadena lo necesita. Un objeto con ese bit en 1 declara un
 * flujo de strings que este laboratorio no decodifica: falla cerrado, no se
 * ignora el bit.
 *
 * `objectSize` (MS) EXCLUYE sus propios bytes y los del campo UMC que lo
 * preceden (medido en este mismo intake): el límite del flujo de handles se
 * calcula con `bodyBytes.length`, nunca con `header.objectSize`.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import {
  readR2010ObjectHeader,
  type R2010ObjectHeader,
} from "../container/r2010-object-envelope.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import {
  AC1015_TYPE_ARC,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_LINE,
  AC1015_TYPE_POINT,
  AC1015_TYPE_TEXT,
  decodeArc,
  decodeCircle,
  decodeLine,
  decodePoint,
  decodeTextWithExternalValue,
} from "../objects/entities-core.js";
import {
  AC1015_TYPE_LWPOLYLINE,
  decodeLwPolyline,
} from "../objects/entities-poly.js";
import { AC1015_TYPE_INSERT, decodeInsert } from "../objects/entity-insert.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  locateR2010StringStream,
  readR2010ObjectName,
} from "./r2010-string-stream.js";

/** Las tres versiones cuyo prefijo común-hasta-tipo está medido. */
export type R2010MeasuredVersion = "AC1024" | "AC1027" | "AC1032";

/**
 * Anchura MEDIDA, en bits, entre el handle propio (fin de `dataBitOffset`) y
 * el primer bit de dato del TIPO — ver la cabecera del módulo. Capacidad
 * ausente declarada para cualquier otra versión: no se adivina.
 */
export const R2010_TYPE_DATA_OFFSET_BITS: Readonly<
  Record<R2010MeasuredVersion, number>
> = Object.freeze({
  AC1024: 39,
  AC1027: 40,
  AC1032: 40,
});

/**
 * Tipos CON cadena: su decodificador recibe además los bytes que vienen del
 * flujo de cadenas, porque en R2010+ el `TV` ya no viaja en la sección de
 * datos. Medido 15/15 sobre los TEXT del corpus, por dos caminos: todos los
 * campos coinciden con el gemelo AC1015 y el dato del tipo aterriza EXACTO en
 * el inicio del flujo de cadenas.
 */
type R2010StringEntityDecoder = (
  reader: DwgBitReader,
  valueBytes: readonly number[],
) => DwgGeometryEntity;
const R2010_STRING_ENTITY_DECODERS: ReadonlyMap<
  number,
  R2010StringEntityDecoder
> = new Map<number, R2010StringEntityDecoder>([
  [AC1015_TYPE_TEXT, decodeTextWithExternalValue],
]);

/** Los únicos tipos de entidad cuyo cuerpo R2010+ este laboratorio decodifica. */
type R2010EntityDecoder = (reader: DwgBitReader) => DwgGeometryEntity;
const R2010_ENTITY_DECODERS: ReadonlyMap<number, R2010EntityDecoder> = new Map<
  number,
  R2010EntityDecoder
>([
  [AC1015_TYPE_LINE, decodeLine],
  [AC1015_TYPE_POINT, decodePoint],
  [AC1015_TYPE_CIRCLE, decodeCircle],
  [AC1015_TYPE_ARC, decodeArc],
  [AC1015_TYPE_LWPOLYLINE, decodeLwPolyline],
  [AC1015_TYPE_INSERT, decodeInsert],
]);

/** Un cuerpo R2010+ decodificado: encabezado ya resuelto más geometría. */
export interface R2010EntityBody {
  readonly header: R2010ObjectHeader;
  readonly entity: DwgGeometryEntity;
}

/**
 * Decodifica el cuerpo de UN objeto R2010+ cuyo tipo es una de las cinco
 * entidades sin cadenas (LINE/POINT/CIRCLE/ARC/LWPOLYLINE). `bodyBytes` es el
 * cuerpo ya delimitado y verificado por CRC (`readR2010ObjectBody`);
 * `expectedHandle` se traslada tal cual a `readR2010ObjectHeader`.
 *
 * Falla cerrado (unsupported, no corrupt) si el tipo no es uno de los cinco
 * conocidos, si la versión no tiene su prefijo medido, o si el bit de
 * presencia de cadenas vale 1. Falla cerrado (corrupt) si el aterrizaje final
 * no cae EXACTAMENTE un bit antes del flujo de handles.
 */
export function readR2010EntityBody(
  bodyBytes: Uint8Array,
  version: R2010MeasuredVersion,
  expectedHandle?: number,
): R2010EntityBody {
  const typeDataOffsetBits = R2010_TYPE_DATA_OFFSET_BITS[version];
  const header = readR2010ObjectHeader(bodyBytes, expectedHandle);
  const decode = R2010_ENTITY_DECODERS.get(header.type);
  const decodeWithString = R2010_STRING_ENTITY_DECODERS.get(header.type);
  if (decode === undefined && decodeWithString === undefined) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This R2010+ object type has no measured body decoder yet.",
    );
  }

  const typeDataStart = header.dataBitOffset + typeDataOffsetBits;
  const totalBits = bodyBytes.length * 8;
  if (typeDataStart > totalBits) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      bodyBytes.length,
      "The measured R2010+ common header does not fit inside the object body.",
    );
  }

  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < typeDataStart; index += 1) reader.readB();

  // El flujo de cadenas SÓLO se localiza para los tipos que lo llevan. Para
  // los demás el camino no cambia en absoluto: un tipo sin cadena cuyo bit de
  // presencia valga 1 es CAPACIDAD AUSENTE, no corrupción, y localizar el
  // flujo antes de comprobarlo convertiría un error en el otro.
  if (decodeWithString !== undefined) {
    const span = locateR2010StringStream(bodyBytes, header);
    if (!span.present) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "An R2010+ entity of a string-bearing type declares no string stream.",
      );
    }
    const valueBytes = readR2010ObjectName(bodyBytes, span);
    const entity = decodeWithString(reader, valueBytes);
    if (reader.bitPosition !== span.startBit) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(reader.bitPosition / 8),
        "The decoded R2010+ entity data does not land exactly where its string stream begins.",
      );
    }
    return Object.freeze({ header, entity });
  }

  // Tipos SIN cadena: el dato termina exactamente un bit antes del flujo de
  // handles, y ese bit —el de presencia— debe valer 0. Que valga 1 en un tipo
  // que este laboratorio no sabe leer con cadena es capacidad ausente, no
  // corrupción, y se dice así.
  const entity = decode!(reader);

  // `objectSize` (MS) excluye sus propios bytes y los de UMC (medido): el
  // límite real usa `bodyBytes.length`, nunca `header.objectSize`.
  const handleStreamStart = totalBits - header.handleStreamBits;
  const hasStringsBitPosition = handleStreamStart - 1;
  if (reader.bitPosition !== hasStringsBitPosition) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The decoded R2010+ entity data does not land exactly one bit before the handle stream.",
    );
  }
  const hasStrings = reader.readB();
  if (hasStrings !== 0) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      Math.floor(reader.bitPosition / 8),
      "This R2010+ object declares a string stream, which this laboratory does not decode yet.",
    );
  }

  return Object.freeze({ header, entity });
}
