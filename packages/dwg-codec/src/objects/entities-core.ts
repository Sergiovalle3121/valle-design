/**
 * Decodificadores de las entidades geométricas nucleares R2000 — fases D2/D3.
 *
 * La geometría real del laboratorio: LINE, POINT, CIRCLE y ARC (fase D2) más
 * TEXT (fase D3; LWPOLYLINE vive en su hermano `entities-poly.ts`). Cada
 * decodificador es una función pura sobre lo que sigue a la cabecera común
 * (`entity-common.ts`) y produce el modelo neutral de `src/model/`; el
 * despachador `decodeAc1015EntityBody` une las piezas: común interpretado,
 * geometría del tipo y tramos opacos contabilizados (EED, gráfico y el flujo
 * de handles del final del objeto).
 *
 * Códigos de TIPO BS de estas entidades (hechos registrados en
 * SOURCE_REGISTER, ODA-ODS-DWG-5.4.1-PUBLIC): 0x01 TEXT, 0x07 INSERT (su
 * decodificador vive en `entity-insert.ts`), 0x11 ARC, 0x12 CIRCLE,
 * 0x13 LINE, 0x1B POINT, 0x4D LWPOLYLINE.
 *
 * Reglas del laboratorio:
 * - **Unsupported no es corrupt**: un tipo BS que esta fase no decodifica
 *   lanza `DWG_VERSION_DECODER_UNSUPPORTED` — el archivo puede ser perfecto;
 *   somos nosotros los que aún no llegamos.
 * - **Fallo cerrado**: datos truncados, doubles no finitos, radios negativos
 *   o un tamaño en bits que no cuadra con lo decodificado → error tipado con
 *   su byte relativo al cuerpo.
 * - **Nada se ignora en silencio**: el flujo de handles del final (desde el
 *   bit que declara `bitSize` hasta el último bit del cuerpo) queda anotado
 *   como tramo opaco con su posición exacta.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  DwgBitReader,
  resolveDwgHandleReference,
  type DwgResolvedHandle,
} from "../codecs/bitcodes.js";
import type {
  DwgArcEntity,
  DwgCircleEntity,
  DwgGeometryEntity,
  DwgLineEntity,
  DwgPoint2,
  DwgPoint3,
  DwgPointEntity,
  DwgTextEntity,
  DwgTextFields,
} from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import { AC1015_TYPE_INSERT, decodeInsert } from "./entity-insert.js";
import { AC1015_TYPE_LWPOLYLINE, decodeLwPolyline } from "./entities-poly.js";
import {
  AC1015_TYPE_ATTDEF,
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_DIM_ALIGNED,
  AC1015_TYPE_DIM_ANGULAR_2LN,
  AC1015_TYPE_DIM_ANGULAR_3PT,
  AC1015_TYPE_DIM_DIAMETER,
  AC1015_TYPE_DIM_LINEAR,
  AC1015_TYPE_DIM_ORDINATE,
  AC1015_TYPE_DIM_RADIUS,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_SEQEND,
  decodeAttdef,
  decodeAttrib,
  decodeDimension,
  decodeMText,
  decodeSeqend,
  dimensionKindOfType,
} from "./entities-annotation.js";
import {
  AC1015_TYPE_POLYLINE_2D,
  AC1015_TYPE_POLYLINE_3D,
  AC1015_TYPE_POLYLINE_MESH,
  AC1015_TYPE_POLYLINE_PFACE,
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
  decodePfaceFace,
  decodePolyfaceMesh,
  decodePolyline2d,
  decodePolyline3d,
  decodePolylineMesh,
  decodeVertex2d,
  decodeVertex3d,
  decodeVertexMesh,
  decodeVertexPface,
} from "./entities-polyline-classic.js";
import {
  AC1015_TYPE_3DFACE,
  AC1015_TYPE_ELLIPSE,
  AC1015_TYPE_RAY,
  AC1015_TYPE_SOLID,
  AC1015_TYPE_SPLINE,
  AC1015_TYPE_TRACE,
  AC1015_TYPE_XLINE,
  decode3dFace,
  decodeEllipse,
  decodeRay,
  decodeSolid,
  decodeSpline,
  decodeTrace,
  decodeXline,
} from "./entities-curves-surfaces.js";
import {
  decodeTextFields,
  finiteDecoded,
  frozenPoint3,
  readAc1015EntityCommon,
  readAc1015EntityHandleHead,
  readFiniteExtrusion,
  type Ac1015EntityCommon,
  type Ac1015EntityHandleHead,
  type Ac1015OpaqueSpan,
} from "./entity-common.js";

/** Códigos de tipo BS de las entidades nucleares (hechos registrados). */
export const AC1015_TYPE_TEXT = 0x01;
export const AC1015_TYPE_ARC = 0x11;
export const AC1015_TYPE_CIRCLE = 0x12;
export const AC1015_TYPE_LINE = 0x13;
export const AC1015_TYPE_POINT = 0x1b;
export { AC1015_TYPE_LWPOLYLINE } from "./entities-poly.js";
export { AC1015_TYPE_INSERT } from "./entity-insert.js";
export {
  AC1015_TYPE_ATTDEF,
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_DIM_ALIGNED,
  AC1015_TYPE_DIM_ANGULAR_2LN,
  AC1015_TYPE_DIM_ANGULAR_3PT,
  AC1015_TYPE_DIM_DIAMETER,
  AC1015_TYPE_DIM_LINEAR,
  AC1015_TYPE_DIM_ORDINATE,
  AC1015_TYPE_DIM_RADIUS,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_SEQEND,
} from "./entities-annotation.js";
export {
  AC1015_TYPE_POLYLINE_2D,
  AC1015_TYPE_POLYLINE_3D,
  AC1015_TYPE_POLYLINE_MESH,
  AC1015_TYPE_POLYLINE_PFACE,
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
} from "./entities-polyline-classic.js";
export {
  AC1015_TYPE_3DFACE,
  AC1015_TYPE_ELLIPSE,
  AC1015_TYPE_RAY,
  AC1015_TYPE_SOLID,
  AC1015_TYPE_SPLINE,
  AC1015_TYPE_TRACE,
  AC1015_TYPE_XLINE,
} from "./entities-curves-surfaces.js";

/**
 * Las referencias interpretadas de una entidad (fase D4): la cabeza del flujo
 * de handles y, SOLO para un INSERT, el hard pointer a su BLOCK_RECORD — la
 * referencia que da sentido al INSERT y que el formato sitúa tras la cabeza
 * común (hecho registrado; certeza declarada en el worklog).
 */
export interface Ac1015EntityReferences extends Ac1015EntityHandleHead {
  readonly blockRecord: DwgResolvedHandle | undefined;
}

/** Una entidad decodificada por completo: común, geometría y restos opacos. */
export interface Ac1015DecodedEntity {
  readonly common: Ac1015EntityCommon;
  readonly entity: DwgGeometryEntity;
  /** EED y gráfico (si los hubo) más el flujo de handles final. */
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
  /** La cabeza del flujo interpretada; el tramo sigue contabilizado opaco. */
  readonly references: Ac1015EntityReferences;
}

/**
 * Decodifica el cuerpo COMPLETO de una entidad nuclear R2000: cabecera común,
 * datos del tipo y contabilidad de los tramos opacos. `bodyBytes` son los
 * bytes exactos del dato de la envoltura D1 (tipo BS incluido); los offsets
 * de error son relativos a su inicio.
 */
export function decodeAc1015EntityBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedEntity {
  // El tipo se decide ANTES de interpretar nada más: los objetos que no son
  // estas cuatro entidades (diccionarios, tablas, otras entidades) tienen
  // cuerpos cuya disposición esta fase no conoce, y fingir que su prólogo es
  // el común de entidad sería desincronizarse en silencio. El tipo vive en el
  // byte 0 del cuerpo; lo desconocido es capacidad ausente, no corrupción.
  const type = peekEntityType(bodyBytes);
  if (!DECODED_ENTITY_TYPES.has(type)) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This entity type is not decoded by the laboratory.",
    );
  }

  const { common, opaqueSpans, reader, bodyBitLength } =
    readAc1015EntityCommon(bodyBytes);

  const entity = decodeEntitySpecific(common.type, reader);

  // El tamaño en bits declarado debe cuadrar EXACTAMENTE con el final de los
  // datos del tipo: ahí arranca el flujo de handles. Un descuadre en
  // cualquier dirección es una estructura desincronizada y no se "recupera".
  if (reader.bitPosition !== common.bitSize) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The declared bit size does not match the decoded entity data.",
    );
  }

  // El flujo de handles del final (propietario según el modo, reactores,
  // xdictionary, capa, ltype/plotstyle si sus banderas lo piden) más el
  // relleno del último byte: opaco, contabilizado, nunca ignorado en silencio.
  const spans: Ac1015OpaqueSpan[] = [...opaqueSpans];
  const handleStreamBits = bodyBitLength - common.bitSize;
  if (handleStreamBits > 0) {
    spans.push(
      Object.freeze({
        kind: "handle-stream" as const,
        startBit: common.bitSize,
        bitLength: handleStreamBits,
      }),
    );
  }

  // La cabeza del flujo se interpreta ADEMÁS de contabilizarse: propietario
  // (la pertenencia entidad→bloque de la fase D4), xdictionary y capa; y en
  // un INSERT, el siguiente handle es el hard pointer a su BLOCK_RECORD —
  // sin él, el INSERT no significa nada. El resto del flujo (ATTRIBs de un
  // INSERT, estilo de un TEXT) sigue opaco y declarado pendiente.
  const head = readAc1015EntityHandleHead(reader, common);
  const blockRecord =
    common.type === AC1015_TYPE_INSERT
      ? resolveDwgHandleReference(reader.readH(), common.ownHandle.value)
      : undefined;

  return Object.freeze({
    common,
    entity,
    opaqueSpans: Object.freeze(spans),
    references: Object.freeze({ ...head, blockRecord }),
  });
}

/**
 * Relee el tipo BS inicial del cuerpo sobre un cursor propio, sin mover nada
 * del llamador. Un cuerpo que no alcanza ni para su tipo es corrupción.
 */
function peekEntityType(bodyBytes: Uint8Array): number {
  return new DwgBitReader(new BoundedByteCursor(bodyBytes)).readBS();
}

/** Los tipos de entidad que el despachador decodifica hoy. */
const DECODED_ENTITY_TYPES: ReadonlySet<number> = new Set([
  AC1015_TYPE_LINE,
  AC1015_TYPE_POINT,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_ARC,
  AC1015_TYPE_LWPOLYLINE,
  AC1015_TYPE_TEXT,
  AC1015_TYPE_INSERT,
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_ATTDEF,
  AC1015_TYPE_SEQEND,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_DIM_ORDINATE,
  AC1015_TYPE_DIM_LINEAR,
  AC1015_TYPE_DIM_ALIGNED,
  AC1015_TYPE_DIM_ANGULAR_3PT,
  AC1015_TYPE_DIM_ANGULAR_2LN,
  AC1015_TYPE_DIM_RADIUS,
  AC1015_TYPE_DIM_DIAMETER,
  AC1015_TYPE_POLYLINE_2D,
  AC1015_TYPE_POLYLINE_3D,
  AC1015_TYPE_POLYLINE_MESH,
  AC1015_TYPE_POLYLINE_PFACE,
  AC1015_TYPE_VERTEX_2D,
  AC1015_TYPE_VERTEX_3D,
  AC1015_TYPE_VERTEX_MESH,
  AC1015_TYPE_VERTEX_PFACE,
  AC1015_TYPE_VERTEX_PFACE_FACE,
  AC1015_TYPE_3DFACE,
  AC1015_TYPE_ELLIPSE,
  AC1015_TYPE_RAY,
  AC1015_TYPE_SOLID,
  AC1015_TYPE_SPLINE,
  AC1015_TYPE_TRACE,
  AC1015_TYPE_XLINE,
]);

/** Despacha al decodificador del tipo ya verificado como soportado. */
function decodeEntitySpecific(
  type: number,
  reader: DwgBitReader,
): DwgGeometryEntity {
  const dimensionKind = dimensionKindOfType(type);
  if (dimensionKind !== null) return decodeDimension(reader, dimensionKind);
  switch (type) {
    case AC1015_TYPE_LINE:
      return decodeLine(reader);
    case AC1015_TYPE_POINT:
      return decodePoint(reader);
    case AC1015_TYPE_CIRCLE:
      return decodeCircle(reader);
    case AC1015_TYPE_ARC:
      return decodeArc(reader);
    case AC1015_TYPE_LWPOLYLINE:
      return decodeLwPolyline(reader);
    case AC1015_TYPE_TEXT:
      return decodeText(reader);
    case AC1015_TYPE_INSERT:
      return decodeInsert(reader);
    case AC1015_TYPE_ATTRIB:
      return decodeAttrib(reader);
    case AC1015_TYPE_ATTDEF:
      return decodeAttdef(reader);
    case AC1015_TYPE_SEQEND:
      return decodeSeqend();
    case AC1015_TYPE_MTEXT:
      return decodeMText(reader);
    case AC1015_TYPE_POLYLINE_2D:
      return decodePolyline2d(reader);
    case AC1015_TYPE_POLYLINE_3D:
      return decodePolyline3d(reader);
    case AC1015_TYPE_POLYLINE_MESH:
      return decodePolylineMesh(reader);
    case AC1015_TYPE_POLYLINE_PFACE:
      return decodePolyfaceMesh(reader);
    case AC1015_TYPE_VERTEX_2D:
      return decodeVertex2d(reader);
    case AC1015_TYPE_VERTEX_3D:
      return decodeVertex3d(reader);
    case AC1015_TYPE_VERTEX_MESH:
      return decodeVertexMesh(reader);
    case AC1015_TYPE_VERTEX_PFACE:
      return decodeVertexPface(reader);
    case AC1015_TYPE_VERTEX_PFACE_FACE:
      return decodePfaceFace(reader);
    case AC1015_TYPE_3DFACE:
      return decode3dFace(reader);
    case AC1015_TYPE_ELLIPSE:
      return decodeEllipse(reader);
    case AC1015_TYPE_RAY:
      return decodeRay(reader);
    case AC1015_TYPE_XLINE:
      return decodeXline(reader);
    case AC1015_TYPE_SOLID:
      return decodeSolid(reader);
    case AC1015_TYPE_TRACE:
      return decodeTrace(reader);
    case AC1015_TYPE_SPLINE:
      return decodeSpline(reader);
    default:
      // Inalcanzable: el despachador sólo se llama tras el filtro de tipos.
      // Si llega, el error es NUESTRO, no del archivo.
      throwDwgError(
        "DWG_INTERNAL_ERROR",
        "internal",
        0,
        "The entity dispatcher reached an unfiltered type.",
      );
  }
}

/**
 * LINE (R2000+): el formato ahorra bits codificando el punto final como
 * deltas DD contra el inicial, y las Z con un bit que declara si ambas son
 * cero. Después, grosor BT y extrusión BE.
 */
function decodeLine(reader: DwgBitReader): DwgLineEntity {
  const zeroZ = reader.readB() === 1;
  const startX = finiteDecoded(reader, reader.readRD(), "a line start X");
  const endX = finiteDecoded(reader, reader.readDD(startX), "a line end X");
  const startY = finiteDecoded(reader, reader.readRD(), "a line start Y");
  const endY = finiteDecoded(reader, reader.readDD(startY), "a line end Y");
  let startZ = 0;
  let endZ = 0;
  if (!zeroZ) {
    startZ = finiteDecoded(reader, reader.readRD(), "a line start Z");
    endZ = finiteDecoded(reader, reader.readDD(startZ), "a line end Z");
  }
  const thickness = finiteDecoded(reader, reader.readBT(), "a line thickness");
  const extrusion = readFiniteExtrusion(reader);
  return Object.freeze({
    kind: "line" as const,
    start: frozenPoint3(startX, startY, startZ),
    end: frozenPoint3(endX, endY, endZ),
    thickness,
    extrusion,
  });
}

/** POINT: posición 3BD, grosor BT, extrusión BE y ángulo BD del eje X. */
function decodePoint(reader: DwgBitReader): DwgPointEntity {
  const position = read3BDPoint(reader, "a point position");
  const thickness = finiteDecoded(reader, reader.readBT(), "a point thickness");
  const extrusion = readFiniteExtrusion(reader);
  const xAxisAngle = finiteDecoded(
    reader,
    reader.readBD(),
    "a point X-axis angle",
  );
  return Object.freeze({
    kind: "point" as const,
    position,
    thickness,
    extrusion,
    xAxisAngle,
  });
}

/** CIRCLE: centro 3BD, radio BD, grosor BT y extrusión BE. */
function decodeCircle(reader: DwgBitReader): DwgCircleEntity {
  const { center, radius, thickness, extrusion } = decodeCircleFields(reader);
  return Object.freeze({
    kind: "circle" as const,
    center,
    radius,
    thickness,
    extrusion,
  });
}

/** ARC: los campos del círculo más los ángulos BD inicial y final. */
function decodeArc(reader: DwgBitReader): DwgArcEntity {
  const { center, radius, thickness, extrusion } = decodeCircleFields(reader);
  const startAngle = finiteDecoded(reader, reader.readBD(), "an arc start angle");
  const endAngle = finiteDecoded(reader, reader.readBD(), "an arc end angle");
  return Object.freeze({
    kind: "arc" as const,
    center,
    radius,
    thickness,
    extrusion,
    startAngle,
    endAngle,
  });
}

/** Campos compartidos por CIRCLE y ARC, en su orden. */
function decodeCircleFields(reader: DwgBitReader): {
  center: DwgPoint3;
  radius: number;
  thickness: number;
  extrusion: DwgPoint3;
} {
  const center = read3BDPoint(reader, "a circle center");
  const radius = finiteDecoded(reader, reader.readBD(), "a circle radius");
  if (radius < 0) {
    // Un radio negativo no describe ningún círculo: estructura corrupta,
    // no una "convención" que inventar.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "A circle radius cannot be negative.",
    );
  }
  const thickness = finiteDecoded(reader, reader.readBT(), "a circle thickness");
  const extrusion = readFiniteExtrusion(reader);
  return { center, radius, thickness, extrusion };
}

/**
 * TEXT (R2000): un RC de banderas abre el dato y cada bit a 1 declara un
 * campo AUSENTE (0x01 elevación, 0x02 alineación, 0x04 oblicuo, 0x08
 * rotación, 0x10 factor de anchura, 0x20 generación, 0x40/0x80 alineaciones)
 * — el archivo ahorra los valores por defecto no escribiéndolos. Ausente se
 * modela `undefined`: inventar el defecto aquí sería fingir que viajó. La
 * alineación viaja como 2DD contra la inserción; la cadena TV llega como
 * BYTES (la página de códigos es de una capa superior); los códigos BS de
 * generación/alineación se conservan crudos.
 */
function decodeText(reader: DwgBitReader): DwgTextEntity {
  return Object.freeze({
    kind: "text" as const,
    ...decodeTextFields(reader),
  });
}

/** Un 3BD validado como punto finito del modelo neutral. */
function read3BDPoint(reader: DwgBitReader, what: string): DwgPoint3 {
  const { x, y, z } = reader.read3BD();
  return frozenPoint3(
    finiteDecoded(reader, x, what),
    finiteDecoded(reader, y, what),
    finiteDecoded(reader, z, what),
  );
}

function frozenPoint2(x: number, y: number): DwgPoint2 {
  return Object.freeze({ x, y });
}
