/**
 * Preservación opaca de la familia ACIS (3DSOLID, REGION, BODY) — sesión
 * DWG-B (3D), 2026-08-31.
 *
 * NO hay que entender ACIS: hay que no destruirlo. Este módulo no decodifica
 * un solo campo específico de 3DSOLID/REGION/BODY — ni la versión del
 * modelador, ni el flujo SAT/SAB, ni las banderas de historial. Captura TODO
 * lo que hay entre el fin de la cabecera común de entidad (ya decodificada
 * por `entity-common.ts`, sin cambios) y el límite `bitSize` ya declarado
 * por el propio objeto — el mismo límite que usa cualquier otro tipo R2000 —
 * como bytes crudos, alineados a byte, con el desplazamiento de bit exacto
 * para reconstruir el rango preciso sin adivinar nada.
 *
 * CERO fuentes nuevas. Ningún hecho de este módulo es nuevo: la cabecera
 * común y el límite `bitSize` ya estaban registrados (ODA-ODS-DWG-5.4.1-
 * PUBLIC, SOURCE_REGISTER) y decodificados para otros veinte tipos de
 * entidad. ACIS es formato de Spatial/Dassault, no de ODA — por eso este
 * módulo no le pide NADA al formato ACIS: sólo usa el sobre R2000 que ya
 * conocíamos.
 *
 * QUÉ FALTA, DECLARADO SIN SUAVIZAR. Esta función NO está conectada al
 * despachador (`decodeMappedObject`/`AC1015_ENTITY_BODY_TYPES` en
 * `src/reader/database-assembly.ts`, fuera del alcance de esta sesión).
 * 3DSOLID/REGION/BODY son tipos de CLASE (AutoCAD 2000+): su código BS no es
 * fijo como el de LINE o CIRCLE, varía por archivo según el orden de su
 * propia sección CLASSES, y se resuelve por NOMBRE contra `classNames` — un
 * mecanismo que hoy sólo tiene el lector de base, no el despachador de
 * `entities-core.ts` (`DECODED_ENTITY_TYPES` es un `Set<number>` de códigos
 * FIJOS; no hay ningún número fijo que darle a un tipo de clase). Conectar
 * esto exige que el lector de base, al resolver un objeto cuyo nombre de
 * clase sea exactamente "3DSOLID"/"REGION"/"BODY", llame a
 * `decodeAcisOpaqueEntityBody` en vez de cerrar como `unsupported` — ese
 * cambio vive en `src/reader/`, territorio de otra sesión de esta campaña.
 */
import type { DwgAcisOpaqueEntity } from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import { readAc1015EntityCommon } from "./entity-common.js";

/**
 * Los tres nombres de clase de la familia ACIS que este módulo reconoce, en
 * ASCII (la página de códigos del dibujo no importa aquí: son nombres de
 * clase internos de AutoCAD, siempre ASCII, el mismo alfabeto que ya usan
 * los fixtures de este repositorio — `dxf-external-corpus.ts`,
 * `generate-entity-dxf-3.mjs` — sin necesitar fuente nueva).
 */
export const DWG_ACIS_CLASS_NAMES = Object.freeze(["3DSOLID", "REGION", "BODY"] as const);

export type DwgAcisClassName = (typeof DWG_ACIS_CLASS_NAMES)[number];

const DWG_ACIS_CLASS_NAME_BYTES: ReadonlyMap<DwgAcisClassName, readonly number[]> = new Map(
  DWG_ACIS_CLASS_NAMES.map((name) => [name, Object.freeze([...name].map((c) => c.charCodeAt(0)))]),
);

/**
 * ¿Coinciden estos bytes de nombre de clase con 3DSOLID, REGION o BODY?
 * Comparación byte a byte, sin decodificar página de códigos: son nombres de
 * clase ASCII, no texto de usuario.
 */
export function dwgAcisClassNameOf(
  classNameBytes: readonly number[],
): DwgAcisClassName | null {
  for (const name of DWG_ACIS_CLASS_NAMES) {
    const expected = DWG_ACIS_CLASS_NAME_BYTES.get(name)!;
    if (
      classNameBytes.length === expected.length &&
      expected.every((byte, index) => classNameBytes[index] === byte)
    ) {
      return name;
    }
  }
  return null;
}

/**
 * Decodifica el cuerpo de un objeto ACIS (3DSOLID/REGION/BODY) capturando
 * sus datos específicos como bytes opacos, sin interpretar ni un bit de
 * ellos.
 *
 * `bodyBytes` son los bytes exactos del dato de la envoltura D1 (tipo BS
 * incluido), igual que para cualquier otro decodificador de este directorio.
 * `classNameBytes` es el nombre de clase YA RESUELTO por el llamador (el
 * lector de base, que conoce la sección CLASSES); esta función no lo valida
 * contra `dwgAcisClassNameOf` — quien la invoque decide si el nombre
 * corresponde a esta familia antes de llamarla, igual que el resto del
 * laboratorio separa "reconocer el tipo" de "decodificar el cuerpo".
 *
 * Fallo cerrado: los mismos dos casos que ya usa `decodeAc1015EntityBody`
 * para cualquier objeto R2000 — un `bitSize` que no cabe en el cuerpo lo
 * rechaza `readAc1015EntityCommon` antes de llegar aquí, y esta función
 * añade el caso simétrico de un `bitSize` MENOR que lo que la cabecera
 * común ya consumió (un objeto cuya cabecera común, por sí sola, ya no
 * cabría en el límite que el propio objeto declara — estructura
 * desincronizada, no "ACIS raro").
 */
export function decodeAcisOpaqueEntityBody(
  bodyBytes: Uint8Array,
  classNameBytes: readonly number[],
): DwgAcisOpaqueEntity {
  const { common, reader } = readAc1015EntityCommon(bodyBytes);

  if (common.bitSize < reader.bitPosition) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The declared entity bit size ends before its own common header finishes.",
    );
  }

  const startBit = reader.bitPosition;
  const dataBitLength = common.bitSize - startBit;
  const startByte = Math.floor(startBit / 8);
  const leadingBitOffset = startBit % 8;
  const endByte = Math.ceil(common.bitSize / 8);

  // `readAc1015ObjectPrologue` (dentro de `readAc1015EntityCommon`) ya exigió
  // `bitSize <= bodyBitLength`, así que `endByte` siempre cabe en `bodyBytes`;
  // se revalida aquí de todos modos porque es la última copia antes de
  // fabricar el resultado — la regla del laboratorio es no confiar en una
  // invariante ajena sin comprobarla en el punto de uso.
  if (endByte > bodyBytes.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      bodyBytes.length,
      "The ACIS-bearing object's declared bit size exceeds its own body bytes.",
    );
  }

  const rawBytes = Object.freeze(Array.from(bodyBytes.slice(startByte, endByte)));

  return Object.freeze({
    kind: "acisOpaque" as const,
    classNameBytes: Object.freeze([...classNameBytes]),
    dataBitLength,
    leadingBitOffset,
    rawBytes,
  });
}
