/**
 * Decodificador del INSERT R2000 (AC1015) — fase D4.
 *
 * El INSERT es la primera entidad del laboratorio cuyo SENTIDO está fuera de
 * ella: coloca un bloque en el dibujo. Su dato codifica la colocación —
 * punto de inserción, escalas, rotación, extrusión y la bandera de ATTRIBs —
 * y su flujo de handles lleva la referencia al BLOCK_RECORD insertado, que
 * esta fase SÍ interpreta (el despachador de `entities-core.ts` la extrae
 * tras la cabeza común del flujo).
 *
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC): código de
 * tipo BS 0x07; datos = inserción 3BD, doble bandada BB de escalas, rotación
 * BD, extrusión BE y bit de ATTRIBs. La bandada de escalas ahorra los casos
 * frecuentes:
 *
 * - `0b00`: X viaja como RD y las Y/Z como DD contra la X;
 * - `0b01`: X vale 1.0 y las Y/Z viajan como DD contra 1.0;
 * - `0b10`: un único RD vale para las tres escalas (escala uniforme);
 * - `0b11`: las tres escalas valen 1.0 y no viaja ningún double.
 *
 * Certeza declarada en el worklog: ALTA en las formas 00/11 y en el orden
 * general del dato; MEDIA (pendiente de corpus real) en la asignación exacta
 * de 01/10. El writer espejo emite SOLO las formas 00 y 11 — como con DD, lo
 * dudoso se acepta al leer pero no se emite.
 *
 * Reglas del laboratorio: fallo cerrado (doubles no finitos, truncamientos),
 * presupuesto cobrado a través del cursor acotado y cero dependencias. Los
 * ATTRIBs que sigan a un INSERT quedan como pendiente DECLARADO: la bandera
 * viaja en el modelo y los objetos ATTRIB caen como `unsupported` en la base.
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type { DwgInsertEntity, DwgPoint3 } from "../model/entity-geometry.js";
import { finiteDecoded, frozenPoint3, readFiniteExtrusion } from "./entity-common.js";

/** Código de tipo BS del INSERT (hecho registrado). */
export const AC1015_TYPE_INSERT = 0x07;

/**
 * Decodifica los datos específicos del INSERT con el lector posicionado tras
 * la cabecera común. La referencia al bloque NO está aquí: vive en el flujo
 * de handles y la extrae el despachador tras verificar el tamaño en bits.
 */
export function decodeInsert(reader: DwgBitReader): DwgInsertEntity {
  const position = frozenPoint3(
    finiteDecoded(reader, reader.readBD(), "an insert position"),
    finiteDecoded(reader, reader.readBD(), "an insert position"),
    finiteDecoded(reader, reader.readBD(), "an insert position"),
  );
  const scale = decodeScale(reader);
  const rotation = finiteDecoded(reader, reader.readBD(), "an insert rotation");
  const extrusion = readFiniteExtrusion(reader);
  const attributesFollow = reader.readB() === 1;
  return Object.freeze({
    kind: "insert" as const,
    position,
    scale,
    rotation,
    extrusion,
    attributesFollow,
  });
}

/** La doble bandada de escalas, forma a forma (ver cabecera del módulo). */
function decodeScale(reader: DwgBitReader): DwgPoint3 {
  const flags = reader.readBB();
  if (flags === 0b11) {
    // Las tres escalas unitarias: el caso más frecuente, sin doubles.
    return frozenPoint3(1, 1, 1);
  }
  if (flags === 0b10) {
    // Escala uniforme: un único RD vale para los tres ejes.
    const uniform = finiteDecoded(reader, reader.readRD(), "an insert scale");
    return frozenPoint3(uniform, uniform, uniform);
  }
  // 0b01: la X vale 1.0 y no viaja; 0b00: la X viaja como RD. En ambos, las
  // Y/Z llegan como DD contra la X (el defecto del formato).
  const x =
    flags === 0b01
      ? 1
      : finiteDecoded(reader, reader.readRD(), "an insert scale");
  const y = finiteDecoded(reader, reader.readDD(x), "an insert scale");
  const z = finiteDecoded(reader, reader.readDD(x), "an insert scale");
  return frozenPoint3(x, y, z);
}
