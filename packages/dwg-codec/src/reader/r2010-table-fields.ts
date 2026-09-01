/**
 * CAMPOS NO-NOMBRE de una ENTRADA DE TABLA en R2010+ (AC1024/AC1027/AC1032)
 * — intake 2026-09-01 (VALLE-CORPUS-R2010-LAYER-ESTADO-Y-COLOR).
 *
 * Cubre hoy LAYER (estado y color) y LTYPE (patrón y trazos). Están juntos a
 * propósito: la ANCHURA DE CABEZA que los precede se midió por separado en
 * cada uno y salió LA MISMA, y esa coincidencia entre dos tipos con datos de
 * tamaño muy distinto es parte de la evidencia. Partirlos en dos módulos
 * invitaría a que esa constante se duplicara y divergiera.
 *
 * CORRECCIÓN FECHADA DE UNA AFIRMACIÓN PROPIA. El corte anterior publicó, en
 * la cabecera de `r2010-database-assembly.ts`, que «las banderas de capa de
 * R2010+ no son el `BS` de R2000 en ninguna posición», tras un barrido de
 * 0..120 bits con CERO aciertos. **Es falso: sí lo son**, y están en una
 * posición fija por versión. El barrido no falló por el formato, falló por
 * cómo lo interrogué:
 *
 *  1. **Puse un hecho medible detrás de uno inmedible.** La sonda sólo
 *     apuntaba un acierto de estado si ANTES coincidían los tres campos de
 *     xref, y esos tres son constantes en todo el corpus admitido: no
 *     discriminan nada. Una lectura equivocada de lo que no se puede falsar
 *     vetaba la lectura correcta de lo que sí.
 *  2. **No reusé un hecho que el repo ya tenía medido.** La sonda leía el
 *     color como el `CmC` de R2000 (un simple `BS`) cuando el adaptador
 *     AC1018 —8/8, 0 discrepancias— ya documentaba que desde R2004 son TRES
 *     campos: `BS` + `BL` + `RC`.
 *  3. **Describí esos campos de xref como «ceros».** Tampoco es exacto:
 *     `xrefRef` vale `true` en las 18 capas del gemelo. Lo que impide
 *     falsarlos no es que valgan cero, es que valen SIEMPRE LO MISMO. Constante
 *     no es cero, y la distinción importa: la primera redacción sugería que el
 *     modelo acertaba por defecto cuando en realidad acertaba por falta de
 *     variedad.
 *
 * LO QUE SÍ SE MIDIÓ (54/54 capas, 18 por versión, TRES condiciones a la vez).
 * A una distancia FIJA del primer bit de dato que devuelve
 * `readR2010ObjectHeader` —7 bits en AC1024, 8 en AC1027 y AC1032, la misma
 * diferencia de un bit que ya separa el prefijo común de entidad— hay:
 *
 *   `BS` de estado · `BS` índice de color · `BL` color · `RC` byte de nombre
 *
 * y se exigió simultáneamente que (1) el `BS` de estado reprodujera el valor
 * del gemelo AC1015, (2) el color proyectara al MISMO índice ACI, y (3) el
 * dato terminara EXACTAMENTE donde empieza el flujo de cadenas ya medido.
 * Las tres se cumplen en 54/54, con una ÚNICA anchura de cabeza por versión.
 * La falsación es fuerte porque los valores varían: tres estados distintos
 * (1008, 1009 congelada, 1016 bloqueada) y siete índices ACI distintos.
 *
 * LO QUE NO SE MIDIÓ, Y NO SE FINGE. Qué hay EXACTAMENTE en esos 7/8 bits de
 * cabeza no está resuelto, y con este corpus no puede estarlo: caben al menos
 * dos lecturas —`EED`(BS) + reactores(BL) + xdic(B) [+ un B en AC1027+] y
 * luego o bien un `BS` de índice de xref, o bien los dos bits de bandera de
 * xref— y AMBAS reproducen los valores del gemelo, porque no hay en el corpus
 * ni un objeto con EED, ni uno con reactores, ni una entrada dependiente de
 * xref. Elegir una sería inventar. Por eso este módulo NO decodifica los
 * campos de xref en R2010+ y trata la cabeza por su ANCHURA medida.
 *
 * SEGURO CONTRA DESALINEAMIENTO. Que la anchura sea fija sólo está validado
 * para lo que el corpus ejercita. El aterrizaje exacto EXIGIDO al final es la
 * red: si un archivo trae EED, reactores o cualquier cabeza distinta, el dato
 * no termina donde empieza el flujo de cadenas y esto falla CERRADO con
 * `DWG_VERSION_DECODER_UNSUPPORTED` —capacidad ausente— en vez de devolver un
 * color plausible y equivocado. Es la misma red que ya usa el cuerpo de
 * entidad, y la razón de que la ambigüedad de la cabeza no sea peligrosa:
 * cualquier archivo que la resolviera de otra forma se delata al no aterrizar.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import type { R2010ObjectHeader } from "../container/r2010-object-envelope.js";
import { projectR2004ColorIndex } from "../objects/color-2004.js";
import { throwDwgError } from "../security/parse-error.js";
import type { R2010MeasuredVersion } from "./r2010-entity-body.js";

/**
 * Distancia MEDIDA, en bits, entre el primer bit de dato de una entrada de
 * tabla y su primer campo propio. Un bit más en AC1027+ que en AC1024, igual
 * que en el prefijo común de entidad.
 *
 * No es una anchura elegida, y no se midió una sola vez: sale LA MISMA en las
 * 54 capas (`BS` de estado + color) y en los 78 LTYPE (patrón + trazos) del
 * corpus, en las tres versiones. Que dos tipos distintos, con datos de 25 y
 * de 429 bits, la compartan es lo que la convierte en la cabeza COMÚN de una
 * entrada de tabla y no en una casualidad de un tipo.
 */
export const R2010_TABLE_ENTRY_HEAD_BITS: Readonly<
  Record<R2010MeasuredVersion, number>
> = Object.freeze({ AC1024: 7, AC1027: 8, AC1032: 8 });

/** Los dos campos no-nombre de una capa que este intake sí mide. */
export interface R2010LayerFields {
  /** `BS` de estado crudo (misma semántica pendiente que en R2000). */
  readonly stateFlags: number;
  /** Índice ACI proyectado con el criterio compartido de R2004. */
  readonly colorIndex: number;
}

/**
 * Lee el estado y el color de un LAYER de R2010+. `stringStreamStartBit` es
 * el inicio del flujo de cadenas del MISMO objeto, ya localizado: se usa como
 * comprobación de aterrizaje, y su desacuerdo es un fallo cerrado.
 */
export function readR2010LayerFields(
  bodyBytes: Uint8Array,
  header: R2010ObjectHeader,
  stringStreamStartBit: number,
  version: R2010MeasuredVersion,
): R2010LayerFields {
  const start = header.dataBitOffset + R2010_TABLE_ENTRY_HEAD_BITS[version];
  if (start >= stringStreamStartBit) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      Math.max(0, Math.floor(header.dataBitOffset / 8)),
      "An R2010+ LAYER shorter than its measured head is not decoded.",
    );
  }

  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  // Mismo modismo de posicionamiento que el flujo de cadenas: el lector
  // avanza bit a bit, así que un cuerpo corto falla donde toca y no aquí.
  for (let index = 0; index < start; index += 1) reader.readB();
  const stateFlags = reader.readBS();
  const colorStartBit = reader.bitPosition;
  reader.readBS();
  const rawColor = reader.readBL() >>> 0;
  const colorByte = reader.readRC();
  const colorIndex = projectR2004ColorIndex(
    rawColor,
    colorByte,
    Math.floor(colorStartBit / 8),
  );

  // El aterrizaje es la red: una cabeza distinta de la medida (EED, reactores,
  // una entrada de xref) NO produce un color equivocado, produce este error.
  if (reader.bitPosition !== stringStreamStartBit) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      Math.max(0, Math.floor(start / 8)),
      "An R2010+ LAYER whose data does not end at its string stream is not decoded.",
    );
  }

  return Object.freeze({ stateFlags, colorIndex });
}

/**
 * Los campos propios de un LTYPE que este intake mide, con los MISMOS nombres
 * que produce el camino AC1015 — el validador y el mapeo canónico leen los dos
 * por la misma clave, así que nombrarlos distinto sería inventar una tabla de
 * traducción para nada.
 */
export interface R2010LinetypeFields {
  readonly patternLength: number;
  readonly alignment: number;
  readonly dashLengths: readonly number[];
  readonly dashShapeCodes: readonly number[];
  readonly dashXOffsets: readonly number[];
  readonly dashYOffsets: readonly number[];
  readonly dashScales: readonly number[];
  readonly dashRotations: readonly number[];
  readonly dashShapeFlags: readonly number[];
}

/**
 * Techo de trazos por LTYPE: presupuesto de este lector, no del formato. Se
 * cobra ANTES de reservar nada, igual que hace el camino AC1015 con su cota.
 */
const MAX_DASHES_PER_LINETYPE = 64;

/**
 * Lee el patrón y los trazos de un LTYPE de R2010+.
 *
 * MEDIDO (78/78 en las tres versiones, con la misma cabeza que la capa): tras
 * la cabeza van `BD` longitud del patrón, `RC` alineación, `RC` número de
 * trazos y, por trazo, la MISMA séptupla que en R2000 (`BD` longitud, `BS`
 * código de forma, `RD` y `RD` desplazamientos, `BD` escala, `BD` rotación,
 * `BS` banderas). Y una diferencia real con R2000, medida y no supuesta: el
 * **área de texto de 256 bytes NO está** en R2010+. Se probaron las dos
 * variantes sobre todo el corpus y sólo la variante SIN área aterriza; con
 * ella la coincidencia es 0/78.
 *
 * LÍMITE DE LA EVIDENCIA, SIN SUAVIZAR: de esos 78 LTYPE sólo **6** (dos por
 * versión) llevan un patrón NO vacío —`TRAZOS`, con longitud 1 y trazos
 * [0.75, −0.25]—; los otros 72 son patrones vacíos de 25/26 bits de dato.
 * Que la MISMA cabeza sirva para un dato de 25 bits y para uno de 429 es lo
 * que hace fuerte la medición, pero un solo patrón no vacío es poca variedad
 * y así queda dicho: los campos por trazo que no varían en el corpus
 * (desplazamientos, escala, rotación, banderas) están leídos, no falsados.
 */
export function readR2010LinetypeFields(
  bodyBytes: Uint8Array,
  header: R2010ObjectHeader,
  stringStreamStartBit: number,
  version: R2010MeasuredVersion,
): R2010LinetypeFields {
  const start = header.dataBitOffset + R2010_TABLE_ENTRY_HEAD_BITS[version];
  if (start >= stringStreamStartBit) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      Math.max(0, Math.floor(header.dataBitOffset / 8)),
      "An R2010+ LTYPE shorter than its measured head is not decoded.",
    );
  }

  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < start; index += 1) reader.readB();
  const patternLength = reader.readBD();
  const alignment = reader.readRC();
  const dashCount = reader.readRC();
  if (dashCount > MAX_DASHES_PER_LINETYPE) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The R2010+ linetype declares more dashes than this reader budgets.",
    );
  }

  const dashLengths: number[] = [];
  const dashShapeCodes: number[] = [];
  const dashXOffsets: number[] = [];
  const dashYOffsets: number[] = [];
  const dashScales: number[] = [];
  const dashRotations: number[] = [];
  const dashShapeFlags: number[] = [];
  for (let index = 0; index < dashCount; index += 1) {
    dashLengths.push(reader.readBD());
    dashShapeCodes.push(reader.readBS());
    dashXOffsets.push(reader.readRD());
    dashYOffsets.push(reader.readRD());
    dashScales.push(reader.readBD());
    dashRotations.push(reader.readBD());
    dashShapeFlags.push(reader.readBS());
  }

  // La misma red que en la capa: una cabeza distinta de la medida, o un área
  // de texto que este intake midió AUSENTE y resultara presente, no producen
  // un patrón equivocado — producen capacidad ausente.
  if (reader.bitPosition !== stringStreamStartBit) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      Math.max(0, Math.floor(start / 8)),
      "An R2010+ LTYPE whose data does not end at its string stream is not decoded.",
    );
  }

  return Object.freeze({
    patternLength,
    alignment,
    dashLengths: Object.freeze(dashLengths),
    dashShapeCodes: Object.freeze(dashShapeCodes),
    dashXOffsets: Object.freeze(dashXOffsets),
    dashYOffsets: Object.freeze(dashYOffsets),
    dashScales: Object.freeze(dashScales),
    dashRotations: Object.freeze(dashRotations),
    dashShapeFlags: Object.freeze(dashShapeFlags),
  });
}
