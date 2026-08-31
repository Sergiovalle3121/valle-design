/**
 * FLUJO DE HANDLES del cuerpo de objeto R2010+ (AC1024/AC1027/AC1032) —
 * intake 2026-08-31 (`VALLE-CORPUS-R2010-HANDLE-STREAM` en SOURCE_REGISTER).
 *
 * QUÉ DESBLOQUEA. `readR2004Database` falla cerrado para las tres versiones
 * modernas citando por su nombre lo que falta: «no decodifica el flujo de
 * handles R2010+ ni las tablas de símbolos». Éste es el primero de esos dos.
 * Sin él una entidad tiene geometría pero no tiene CAPA ni PROPIETARIO — no es
 * un dibujo, es una nube de coordenadas.
 *
 * MEDICIÓN (sin fuente documental nueva; oráculo diferencial contra el gemelo
 * AC1015 del MISMO dibujo, ya validado con 0 discrepancias):
 *
 *  - El tramo se consume EXACTAMENTE leyendo códigos H consecutivos hasta que
 *    restan menos de 8 bits: **105/105 objetos**, 35/35 por versión. Un H
 *    mínimo ocupa 8 bits (4 de código + 4 de contador vacío), así que el
 *    residuo sólo puede ser el relleno hasta el byte — y el histograma
 *    observado cubre todo el rango 0..7, que es justo lo que produce un
 *    relleno y NO lo que produciría una lectura desalineada.
 *  - Esa secuencia reproduce, como PREFIJO exacto y en orden, las referencias
 *    del gemelo tras filtrar los handles NULOS y los enlaces a la entidad
 *    anterior y siguiente: **105/105**.
 *  - Se contrastaron CUATRO modelos, no uno: `completo` 0/105, `sinEnlaces`
 *    0/105, `sinNulos` 45/105, `sinEnlacesNiNulos` 90/105 con coincidencia
 *    total. Que los dos modelos que conservan los nulos acierten CERO es la
 *    observación que sostiene el hecho: **en R2010+ un handle nulo no se
 *    escribe** (no se escribe como código nulo: no se escribe).
 *  - Las tres versiones dan cifras idénticas: el flujo no cambia entre
 *    AC1024, AC1027 y AC1032.
 *
 * DÓNDE ESTÁ EL CORTE, Y POR QUÉ ESTÁ AQUÍ. La DECODIFICACIÓN es medida y no
 * necesita nada de fuera: `readR2010HandleStream` lee golosamente y exige
 * consumo exacto, que es literalmente lo que se midió 105/105. La
 * INTERPRETACIÓN (cuál de esos handles es la capa, cuál el propietario) SÍ
 * necesita la forma —`entityMode`, `reactorCount`, xdictionary, banderas de
 * linetype y plotstyle—. Esa forma se DEDUCE del propio archivo moderno con
 * `deriveR2010HandleShape` (105/105 medido; ver su documentación), pero sigue
 * siendo un argumento explícito de `interpretR2010HandleStream` y no una
 * llamada interna: un llamador que tenga la forma por otra vía —el gemelo, un
 * intake futuro— la aporta, y ninguno recibe una capa adivinada en silencio.
 * Producir una capa plausible y equivocada es el peor modo de fallo posible
 * aquí, y la separación existe para que no pueda ocurrir sin que se vea.
 *
 * LÍMITE DECLARADO. Los 5 TEXT del corpus (15 observaciones = 5 × 3 versiones)
 * llevan UN handle por encima de las referencias que el gemelo modela; resuelto
 * contra su mapa de objetos, apunta en las 15 a un tipo `0x35` (STYLE). No es
 * una divergencia entre versiones: es la misma referencia que el propio
 * `readAc1015EntityHandleHead` deja declarada dentro de su tramo opaco
 * pendiente. Se devuelve en `extra`, nunca se descarta en silencio.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  DwgBitReader,
  resolveDwgHandleReference,
  type DwgResolvedHandle,
} from "../codecs/bitcodes.js";
import type { R2010ObjectHeader } from "../container/r2010-object-envelope.js";
import { throwDwgError } from "../security/parse-error.js";

/**
 * Techo de handles por objeto. No es una constante del formato: es un
 * presupuesto del laboratorio para que un tramo corrupto no gire indefinido.
 * El máximo observado en el corpus admitido es 2.
 */
const MAX_HANDLES_PER_OBJECT = 256;

/** Un H mínimo: 4 bits de código más 4 de contador vacío. */
const MIN_HANDLE_BITS = 8;

/**
 * La forma del flujo: qué referencias trae y en qué orden. El llamador la
 * aporta explícitamente, y normalmente la obtiene de `deriveR2010HandleShape`
 * sobre el mismo cuerpo. Los nombres son los mismos campos del común R2000
 * para que el llamador no tenga que traducir nada.
 */
export interface R2010HandleStreamShape {
  /** El propietario abre el flujo sólo cuando el modo de entidad es 0. */
  readonly hasOwner: boolean;
  readonly reactorCount: number;
  /** Un xdictionary NULO no se escribe en R2010+: aquí va si existe o no. */
  readonly hasXdictionary: boolean;
  /** Sólo cuando las banderas de linetype valen 3. */
  readonly hasLinetype: boolean;
  /** Sólo cuando las banderas de plotstyle valen 3. */
  readonly hasPlotstyle: boolean;
}

/** Las referencias del flujo, ya interpretadas contra una forma declarada. */
export interface R2010HandleReferences {
  readonly owner: DwgResolvedHandle | undefined;
  readonly reactors: readonly DwgResolvedHandle[];
  readonly xdictionary: DwgResolvedHandle | undefined;
  /** Siempre presente: es la única referencia que el corpus nunca omite. */
  readonly layer: DwgResolvedHandle;
  readonly linetype: DwgResolvedHandle | undefined;
  readonly plotstyle: DwgResolvedHandle | undefined;
  /**
   * Los handles posteriores a la cabeza, devueltos sin interpretar. En el
   * corpus admitido son exactamente el puntero a STYLE de cada TEXT.
   */
  readonly extra: readonly DwgResolvedHandle[];
}

/**
 * Decodifica el flujo de handles del final de `bodyBytes` como la secuencia
 * ordenada de referencias resueltas contra el handle propio del objeto.
 *
 * La lectura es GOLOSA —se leen códigos H hasta que restan menos de 8 bits—
 * porque es exactamente lo que se midió consumiendo el tramo en 105/105
 * objetos. No se le dice cuántos handles esperar: el recuento es una salida,
 * no una entrada.
 *
 * Falla cerrado (corrupt) si el tramo empieza antes del final del encabezado,
 * si un H se sale del cuerpo, o si tras la lectura sobran 8 bits o más — ocho
 * bits sobrantes son un handle que no se leyó, no un relleno.
 */
export function readR2010HandleStream(
  bodyBytes: Uint8Array,
  header: R2010ObjectHeader,
): readonly DwgResolvedHandle[] {
  const totalBits = bodyBytes.length * 8;
  const streamStart = totalBits - header.handleStreamBits;
  if (streamStart < header.dataBitOffset) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "The R2010+ handle stream would start before the object header ends.",
    );
  }

  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < streamStart; index += 1) reader.readB();

  const handles: DwgResolvedHandle[] = [];
  while (totalBits - reader.bitPosition >= MIN_HANDLE_BITS) {
    if (handles.length >= MAX_HANDLES_PER_OBJECT) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(reader.bitPosition / 8),
        "The R2010+ handle stream exceeds the laboratory budget of handles per object.",
      );
    }
    handles.push(resolveDwgHandleReference(reader.readH(), header.handle));
  }

  const residual = totalBits - reader.bitPosition;
  if (residual < 0 || residual >= MIN_HANDLE_BITS) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The R2010+ handle stream does not consume its declared span down to byte padding.",
    );
  }
  return Object.freeze(handles);
}

/**
 * Deduce la forma del flujo LEYENDO EL PROPIO ARCHIVO MODERNO, sin gemelo.
 *
 * `r2010-entity-body.ts` declaró OPACO el tramo común de 39/40 bits porque no
 * identificó la semántica de su segunda mitad. Esa decisión sigue en pie para
 * la segunda mitad; lo que esta medición añade es que la PRIMERA sí decodifica,
 * y con qué orden exacto:
 *
 *  - grupos EED · bit de gráfico · modo BB · reactores BL · **bit de
 *    xdic-missing ANTES del de sin-vínculos** · color CmC · escala BD ·
 *    banderas BB de linetype y de plotstyle.
 *  - Con ese orden, los cinco campos que determinan la forma coinciden con el
 *    gemelo en **105/105** y predicen el recuento de la cabeza en **105/105**.
 *  - Con el orden inverso la predicción cae a **35/105**. Ese contraste es lo
 *    que convierte la ordenación en una medición y no en un ajuste: si el
 *    orden fuera indiferente, las dos puntuarían parecido.
 *
 * `noLinks` se lee y se DEVUELVE pero no entra en la forma: acierta 53/105,
 * que es una moneda al aire. No importa, y la razón es medida, no cómoda —
 * R2010+ no escribe los enlaces a la entidad anterior y siguiente, así que ese
 * bit no decide ningún handle. Se expone para no ocultar que se leyó.
 *
 * Falla cerrado (unsupported) ante EED o gráfico presentes: el corpus admitido
 * no ejercita ni uno solo de los dos (0/105), así que su disposición NO está
 * medida y saltárselos a ojo desalinearía todo lo que viene detrás.
 */
export function deriveR2010HandleShape(
  bodyBytes: Uint8Array,
  header: R2010ObjectHeader,
): R2010HandleStreamShape & { readonly noLinks: boolean } {
  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  for (let index = 0; index < header.dataBitOffset; index += 1) reader.readB();

  if (reader.readBS() !== 0) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This R2010+ object carries EED, whose layout this laboratory has not measured.",
    );
  }
  if (reader.readB() !== 0) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This R2010+ object carries a preview graphic, whose layout this laboratory has not measured.",
    );
  }

  const entityMode = reader.readBB();
  const reactorCount = reader.readBL();
  const xdicMissing = reader.readB();
  const noLinks = reader.readB();
  reader.readBS(); // color CmC (índice); su valor no decide ningún handle
  reader.readBD(); // escala de tipo de línea; ídem
  const linetypeFlags = reader.readBB();
  const plotstyleFlags = reader.readBB();

  if (reactorCount < 0 || reactorCount > MAX_HANDLES_PER_OBJECT) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The R2010+ common header declares a reactor count outside the laboratory budget.",
    );
  }

  return Object.freeze({
    hasOwner: entityMode === 0,
    reactorCount,
    hasXdictionary: xdicMissing === 0,
    hasLinetype: linetypeFlags === 3,
    hasPlotstyle: plotstyleFlags === 3,
    noLinks: noLinks === 1,
  });
}

/**
 * Reparte la secuencia ya decodificada entre los roles que `shape` declara.
 *
 * El orden es el mismo que el del gemelo R2000 —propietario, reactores,
 * xdictionary, capa, linetype, plotstyle— MENOS los enlaces a la entidad
 * anterior y siguiente, que R2010+ no escribe (medido: los modelos que los
 * conservan aciertan 0/105).
 *
 * Falla cerrado (corrupt) si la forma declarada pide más handles de los que
 * el flujo trajo: una capa leída de un hueco sería un dato plausible y
 * equivocado, y eso es peor que no leer nada.
 */
export function interpretR2010HandleStream(
  handles: readonly DwgResolvedHandle[],
  shape: R2010HandleStreamShape,
): R2010HandleReferences {
  const required =
    (shape.hasOwner ? 1 : 0) +
    shape.reactorCount +
    (shape.hasXdictionary ? 1 : 0) +
    1 + // la capa, que el corpus nunca omite
    (shape.hasLinetype ? 1 : 0) +
    (shape.hasPlotstyle ? 1 : 0);
  if (shape.reactorCount < 0 || handles.length < required) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "The declared R2010+ handle shape needs more handles than the stream carries.",
    );
  }

  let cursor = 0;
  const take = (): DwgResolvedHandle => {
    const handle = handles[cursor];
    cursor += 1;
    // `required` ya garantizó que hay suficientes; este guardia existe para
    // que `noUncheckedIndexedAccess` no se sortee con un `!`.
    if (handle === undefined) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "The R2010+ handle stream ran out while assigning declared roles.",
      );
    }
    return handle;
  };

  const owner = shape.hasOwner ? take() : undefined;
  const reactors: DwgResolvedHandle[] = [];
  for (let index = 0; index < shape.reactorCount; index += 1)
    reactors.push(take());
  const xdictionary = shape.hasXdictionary ? take() : undefined;
  const layer = take();
  const linetype = shape.hasLinetype ? take() : undefined;
  const plotstyle = shape.hasPlotstyle ? take() : undefined;

  return Object.freeze({
    owner,
    reactors: Object.freeze(reactors),
    xdictionary,
    layer,
    linetype,
    plotstyle,
    extra: Object.freeze(handles.slice(cursor)),
  });
}
