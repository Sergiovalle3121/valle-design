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
 * BD, extrusión y bit de ATTRIBs. La bandada de escalas ahorra los casos
 * frecuentes:
 *
 * - `0b00`: X viaja como RD y las Y/Z como DD contra la X;
 * - `0b01`: X vale 1.0 y las Y/Z viajan como DD contra 1.0;
 * - `0b10`: un único RD vale para las tres escalas (escala uniforme);
 * - `0b11`: las tres escalas valen 1.0 y no viaja ningún double.
 *
 * Intake 2026-08-20 (`VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): los 6 INSERT
 * reales del corpus DESMINTIERON la extrusión BE que declaraba la ODS — la
 * extrusión del INSERT viaja como 3BD (con BE la decodificación quedaba 5
 * bits corta del tamaño declarado en los 6; con 3BD cuadra 6/6). La misma
 * medición CONFIRMÓ con valores reales las formas 0b00 (escalas (2,1.5,1) y
 * (0.5,0.5,1)) y 0b11; las formas 0b01/0b10 siguen sin observarse — el
 * lector las acepta y el writer espejo sigue emitiendo SOLO 00 y 11.
 *
 * Reglas del laboratorio: fallo cerrado (doubles no finitos, truncamientos),
 * presupuesto cobrado a través del cursor acotado y cero dependencias. Los
 * ATTRIBs que sigan a un INSERT quedan como pendiente DECLARADO: la bandera
 * viaja en el modelo y los objetos ATTRIB caen como `unsupported` en la base.
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type { DwgInsertEntity, DwgPoint3 } from "../model/entity-geometry.js";
import { finiteDecoded, frozenPoint3 } from "./entity-common.js";

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
  // Extrusión 3BD, no BE: hecho 3 del intake — los 6 INSERT reales cuadran
  // su tamaño en bits declarado sólo con tres BD completos.
  const extrusion = frozenPoint3(
    finiteDecoded(reader, reader.readBD(), "an insert extrusion"),
    finiteDecoded(reader, reader.readBD(), "an insert extrusion"),
    finiteDecoded(reader, reader.readBD(), "an insert extrusion"),
  );
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
