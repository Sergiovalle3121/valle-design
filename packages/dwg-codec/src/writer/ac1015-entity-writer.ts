/**
 * Writer de cuerpos de entidad R2000 — fases D2/D3/D4 (espejo del
 * decodificador).
 *
 * Emite el cuerpo COMPLETO de una entidad real (LINE, POINT, CIRCLE, ARC,
 * LWPOLYLINE y TEXT desde la fase D3, INSERT desde la D4, ELLIPSE y MTEXT
 * desde la ola de escritura V1→V3 de 2026-08-31, ATTRIB y SEQEND desde el
 * 2026-09-04 — sin ellos un cuadro de rótulo se exportaba MUDO):
 * tipo BS, tamaño RL en bits, handle propio H, cabecera común mínima
 * coherente, datos del tipo y un flujo de handles final confesadamente
 * mínimo; los CRITERIOS de entrada de cada clase viven en
 * `ac1015-entity-validators.ts` (presupuesto de líneas del monorepo). El
 * cuerpo resultante es válido para la envoltura de la fase D1
 * (`wrapAc1015ObjectBody`), de modo que `writeAc1015Container({objects})`
 * pueda emitir entidades REALES y el pipeline lector completo (mapa →
 * envoltura → común → tipo) recupere la geometría EXACTA.
 *
 * El común mínimo coherente que emite esta fase, campo a campo:
 * - handle propio con código 0 y bytes mínimos big-endian;
 * - EED vacío (tamaño BS = 0) y sin gráfico (bit 0);
 * - modo 2 (model space: sin handle de propietario en el flujo) o, desde la
 *   fase D4, modo 0 cuando la entidad pertenece a un bloque — su flujo abre
 *   entonces con el handle del BLOCK_RECORD propietario;
 * - 0 reactores y bit de sin-vínculos a 1;
 * - color ByLayer (CmC 256), escala de tipo de línea 1.0, banderas de
 *   linetype y plotstyle ByLayer (0), invisibilidad 0 y lineweight 0x1D;
 * - flujo de handles final: xdictionary NULO y capa NULA — placeholders
 *   CONFESOS (resolver la capa de una entidad sigue pendiente), más el hard
 *   pointer al bloque insertado cuando la entidad es un INSERT.
 *
 * Reglas del laboratorio: determinista (misma entidad y handle → mismos
 * bits), fallo cerrado ante geometría no finita o specs imposibles, cero
 * dependencias, y NINGUNA constante gemela: los atajos BD/BT/BE/DD son el
 * espejo exacto de `DwgBitReader` y el round-trip los mantiene honestos.
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER); implementación
 * original; certezas declaradas en DWG0_WORKLOG.
 */
import {
  DWG_GEOMETRY_ENTITY_KINDS,
  isFiniteDwgPoint3,
  type DwgEllipseEntity,
  type DwgGeometryEntity,
  type DwgHatchEntity,
  type DwgInsertEntity,
  type DwgLwPolylineEntity,
  type DwgMTextEntity,
  type DwgPoint3,
  type DwgTextEntity,
} from "../model/entity-geometry.js";
import {
  AC1015_TYPE_ARC,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_INSERT,
  AC1015_TYPE_LINE,
  AC1015_TYPE_LWPOLYLINE,
  AC1015_TYPE_POINT,
  AC1015_TYPE_TEXT,
} from "../objects/entities-core.js";
import {
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_SEQEND,
} from "../objects/entities-annotation.js";
import {
  emitAttrib,
  emitEllipse,
  emitHatch,
  emitInsert,
  emitLwPolyline,
  emitMText,
  emitText,
} from "./ac1015-entity-emitters.js";
import {
  validateAttrib,
  validateHatch,
  validateLwPolyline,
  validateMText,
  validateTextFields,
} from "./ac1015-entity-validators.js";
import { AC1015_TYPE_HATCH } from "../objects/entities-complex.js";
import { AC1015_TYPE_ELLIPSE } from "../objects/entities-curves-surfaces.js";
import { throwDwgError } from "../security/parse-error.js";

import {
  AC1015_ENTITY_WRITER_MAX_BITS,
  DwgBitEmitter,
} from "./dwg-bit-emitter.js";

// El emisor vive en su propio módulo desde la fase D4 (presupuesto de
// líneas); se re-exporta aquí para conservar la superficie de las fases
// anteriores — specs y writers hermanos siguen importando de este módulo.
export { AC1015_ENTITY_WRITER_MAX_BITS, DwgBitEmitter };

/**
 * Opciones de la fase D4 para el cuerpo de una entidad:
 * - `ownerBlockHandle`: la entidad PERTENECE a un bloque — viaja en modo 0 y
 *   su flujo de handles abre con el propietario (el BLOCK_RECORD).
 * - `insertBlockHandle`: obligatorio para un INSERT (y prohibido para el
 *   resto): el hard pointer al BLOCK_RECORD insertado, tras la cabeza común
 *   del flujo.
 * - `insertAttributeHandles`: obligatorio EXACTAMENTE cuando el INSERT dice
 *   llevar atributos, y prohibido en cualquier otro caso.
 */
export interface Ac1015EntityWriteOptions {
  readonly ownerBlockHandle?: number;
  readonly insertBlockHandle?: number;
  readonly insertAttributeHandles?: Ac1015InsertAttributeHandles;
}

/**
 * Los tres handles que un INSERT con ATTRIBs añade a su flujo, tal como los
 * MIDIÓ `VALLE-CORPUS-INSERT-ATRIBUTOS` en los cuatro INSERT con atributos
 * del corpus admitido: primer ATTRIB y último ATTRIB como punteros BLANDOS
 * (código 4) y el SEQEND como propietario DURO (código 3), en ese orden y
 * justo detrás del hard pointer al BLOCK_RECORD.
 *
 * Con un solo atributo, primero y último son el MISMO handle: así lo escribe
 * el INSERT 0x117 de `22-nested-attribs`, y por eso no se exige que difieran.
 */
export interface Ac1015InsertAttributeHandles {
  readonly firstAttribHandle: number;
  readonly lastAttribHandle: number;
  readonly seqendHandle: number;
}

/**
 * Emite el cuerpo completo de una entidad nuclear con el handle propio dado.
 * El resultado (tipo incluido) es exactamente lo que `decodeAc1015EntityBody`
 * espera y lo que `wrapAc1015ObjectBody` envuelve para el contenedor.
 */
export function writeAc1015EntityBody(
  entity: DwgGeometryEntity,
  ownHandle: number,
  options: Ac1015EntityWriteOptions = {},
): Uint8Array {
  validateEntity(entity);
  if (!Number.isSafeInteger(ownHandle) || ownHandle < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An entity handle must be a positive safe integer.",
    );
  }
  const ownerBlockHandle = optionalHandle(
    options.ownerBlockHandle,
    "An owner block handle",
  );
  const insertBlockHandle = optionalHandle(
    options.insertBlockHandle,
    "An insert block handle",
  );
  if (entity.kind === "insert" && insertBlockHandle === undefined) {
    // Un INSERT sin bloque no significa nada: se rechaza cerrado en vez de
    // emitir una referencia nula que sólo aplazaría el error.
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An insert entity requires the handle of its block record.",
    );
  }
  if (entity.kind !== "insert" && insertBlockHandle !== undefined) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Only an insert entity may reference an inserted block.",
    );
  }
  const attributeHandles = validatedAttributeHandles(entity, options);

  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, ownHandle, ownerBlockHandle !== undefined);
  emitEntitySpecific(tail, entity);

  // Flujo de handles mínimo coherente con las banderas emitidas: propietario
  // SOLO en modo 0 (código 4, decisión de laboratorio declarada — el lector
  // acepta cualquier código absoluto 2–5), xdictionary y capa NULOS
  // (placeholders confesos) y, en un INSERT, el hard pointer al bloque con
  // código 5 (hecho registrado). Ni reactores (0), ni ltype ni plotstyle
  // (banderas 0) esperan handle alguno.
  return composeAc1015ObjectBody(typeOf(entity), tail, (stream) => {
    if (ownerBlockHandle !== undefined) {
      stream.emitH(4, ownerBlockHandle);
    }
    stream.emitH(0, 0); // xdictionary nulo
    stream.emitH(0, 0); // capa nula
    if (insertBlockHandle !== undefined) {
      stream.emitH(5, insertBlockHandle);
    }
    if (attributeHandles !== undefined) {
      stream.emitH(4, attributeHandles.firstAttribHandle);
      stream.emitH(4, attributeHandles.lastAttribHandle);
      stream.emitH(3, attributeHandles.seqendHandle);
    }
  });
}

/**
 * La bandera de ATTRIBs y los tres handles que la sostienen van JUNTAS o no
 * va ninguna.
 *
 * Encender el bit sin los handles escribiría un INSERT que PROMETE atributos
 * que el archivo no lleva —un lector ajeno se iría a buscarlos—, y darlos con
 * el bit apagado dejaría tres punteros que nadie va a leer. Las dos formas
 * son un archivo que miente sobre sí mismo, así que las dos fallan cerrado.
 * Hasta el 2026-09-04 aquí sólo había el primer rechazo, con la bandera
 * clavada a 0: un cuadro de rótulo salía MUDO.
 */
function validatedAttributeHandles(
  entity: DwgGeometryEntity,
  options: Ac1015EntityWriteOptions,
): Ac1015InsertAttributeHandles | undefined {
  const given = options.insertAttributeHandles;
  const wanted = entity.kind === "insert" && entity.attributesFollow;
  if (!wanted && given === undefined) return undefined;
  if (wanted !== (given !== undefined)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An insert that declares attributes needs the handles of its first and last ATTRIB and of its SEQEND, and only such an insert may carry them.",
    );
  }
  const handles = given!;
  for (const [what, value] of [
    ["first attribute", handles.firstAttribHandle],
    ["last attribute", handles.lastAttribHandle],
    ["SEQEND", handles.seqendHandle],
  ] as const) {
    optionalHandle(value, `An insert ${what} handle`);
    if (value === undefined) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `An insert ${what} handle is required when the insert declares attributes.`,
      );
    }
  }
  return handles;
}

/**
 * El común mínimo coherente de entidad, campo a campo idéntico al que las
 * fases D2/D3 emitían inline; `ownerInStream` cambia SOLO el modo (0 en vez
 * de 2) — el handle del propietario lo emite el flujo final del llamador.
 * Exportado para que la tabla de bloques emita BLOCK/ENDBLK con el MISMO
 * común, sin constantes gemelas.
 */
export function emitAc1015EntityCommonTail(
  tail: DwgBitEmitter,
  ownHandle: number,
  ownerInStream: boolean,
): void {
  tail.emitH(0, ownHandle); // handle propio, código 0
  tail.emitBS(0); // EED vacío
  tail.pushBit(0); // sin gráfico de previsualización
  tail.pushBits(ownerInStream ? 0b00 : 0b10, 2); // modo 0 (bloque) o 2 (model)
  tail.emitBL(0); // cero reactores
  tail.pushBit(1); // sin vínculos de subentidad
  tail.emitCMC(256); // color ByLayer
  tail.emitBD(1); // escala de tipo de línea 1.0
  tail.pushBits(0b00, 2); // linetype ByLayer: sin handle en el flujo
  tail.pushBits(0b00, 2); // plotstyle ByLayer: sin handle en el flujo
  tail.emitBS(0); // visible
  tail.emitRC(0x1d); // lineweight ByLayer (placeholder registrado)
}

/**
 * Composición en dos pasadas de un cuerpo de objeto R2000: el tamaño RL
 * cuenta TODOS los bits del dato desde el primer bit del tipo — incluido el
 * propio RL — así que primero se mide y después se compone; el flujo de
 * handles queda FUERA del tamaño declarado. Es LA única composición del
 * writer: entidades, tablas y bloques pasan por aquí (cero marcos gemelos).
 */
export function composeAc1015ObjectBody(
  type: number,
  tail: DwgBitEmitter,
  emitHandleStream: (stream: DwgBitEmitter) => void,
): Uint8Array {
  const head = new DwgBitEmitter();
  head.emitBS(type);
  const bitSize = head.bitLength + 32 + tail.bitLength;

  const body = new DwgBitEmitter();
  body.pushEmitter(head);
  body.emitRL(bitSize);
  body.pushEmitter(tail);
  emitHandleStream(body);
  return body.toBytes();
}

/** Valida un handle opcional del flujo: ausente o entero seguro positivo. */
function optionalHandle(
  value: number | undefined,
  what: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} must be a positive safe integer.`,
    );
  }
  return value;
}

/** Los datos específicos del tipo, espejo campo a campo del decodificador. */
function emitEntitySpecific(
  emitter: DwgBitEmitter,
  entity: DwgGeometryEntity,
): void {
  switch (entity.kind) {
    case "line": {
      const zeroZ = Object.is(entity.start.z, 0) && Object.is(entity.end.z, 0);
      emitter.pushBit(zeroZ ? 1 : 0);
      emitter.emitRD(entity.start.x);
      emitter.emitDD(entity.end.x, entity.start.x);
      emitter.emitRD(entity.start.y);
      emitter.emitDD(entity.end.y, entity.start.y);
      if (!zeroZ) {
        emitter.emitRD(entity.start.z);
        emitter.emitDD(entity.end.z, entity.start.z);
      }
      emitter.emitBT(entity.thickness);
      emitter.emitBE(entity.extrusion);
      return;
    }
    case "point": {
      emitter.emitBD(entity.position.x);
      emitter.emitBD(entity.position.y);
      emitter.emitBD(entity.position.z);
      emitter.emitBT(entity.thickness);
      emitter.emitBE(entity.extrusion);
      emitter.emitBD(entity.xAxisAngle);
      return;
    }
    case "circle":
    case "arc": {
      emitter.emitBD(entity.center.x);
      emitter.emitBD(entity.center.y);
      emitter.emitBD(entity.center.z);
      emitter.emitBD(entity.radius);
      emitter.emitBT(entity.thickness);
      emitter.emitBE(entity.extrusion);
      if (entity.kind === "arc") {
        emitter.emitBD(entity.startAngle);
        emitter.emitBD(entity.endAngle);
      }
      return;
    }
    case "lwpolyline":
      emitLwPolyline(emitter, entity);
      return;
    case "text":
      emitText(emitter, entity);
      return;
    case "attrib":
      emitAttrib(emitter, entity);
      return;
    case "seqend":
      // SEQEND no lleva campos propios tras el común (hecho registrado, y
      // medido: en los cuatro SEQEND del corpus el tamaño en bits declarado
      // cae EXACTAMENTE donde termina la cabecera común). No emitir nada es
      // el cuerpo correcto, no una omisión.
      return;
    case "insert":
      emitInsert(emitter, entity);
      return;
    case "ellipse":
      emitEllipse(emitter, entity);
      return;
    case "mtext":
      emitMText(emitter, entity);
      return;
    case "hatch":
      emitHatch(emitter, entity);
      return;
  }
}

/** El código de tipo BS del modelo neutral (hechos registrados). */
function typeOf(entity: DwgGeometryEntity): number {
  switch (entity.kind) {
    case "line":
      return AC1015_TYPE_LINE;
    case "point":
      return AC1015_TYPE_POINT;
    case "circle":
      return AC1015_TYPE_CIRCLE;
    case "arc":
      return AC1015_TYPE_ARC;
    case "lwpolyline":
      return AC1015_TYPE_LWPOLYLINE;
    case "text":
      return AC1015_TYPE_TEXT;
    case "attrib":
      return AC1015_TYPE_ATTRIB;
    case "seqend":
      return AC1015_TYPE_SEQEND;
    case "insert":
      return AC1015_TYPE_INSERT;
    case "ellipse":
      return AC1015_TYPE_ELLIPSE;
    case "mtext":
      return AC1015_TYPE_MTEXT;
    case "hatch":
      return AC1015_TYPE_HATCH;
    default:
      // El lector ya decodifica más tipos de los que este writer emite; un
      // modelo que el writer no sabe escribir se rechaza cerrado y declarado,
      // no se emite a medias (pendiente declarado de la ola de escritura).
      throwDwgError(
        "DWG_VERSION_DECODER_UNSUPPORTED",
        "unsupported",
        0,
        `Writing a "${entity.kind}" entity is not implemented by the laboratory writer yet.`,
      );
  }
}

/**
 * El subconjunto del modelo neutral que este writer sabe emitir hoy. El
 * lector decodifica más tipos; escribirlos es pendiente DECLARADO de la ola
 * de escritura — un modelo fuera de esta unión se rechaza cerrado.
 */
type Ac1015WritableEntity =
  | import("../model/entity-geometry.js").DwgLineEntity
  | import("../model/entity-geometry.js").DwgPointEntity
  | import("../model/entity-geometry.js").DwgCircleEntity
  | import("../model/entity-geometry.js").DwgArcEntity
  | import("../model/entity-geometry.js").DwgLwPolylineEntity
  | import("../model/entity-geometry.js").DwgTextEntity
  | import("../model/entity-geometry.js").DwgAttribEntity
  | import("../model/entity-geometry.js").DwgSeqendEntity
  | import("../model/entity-geometry.js").DwgInsertEntity
  | import("../model/entity-geometry.js").DwgEllipseEntity
  | import("../model/entity-geometry.js").DwgMTextEntity
  | import("../model/entity-geometry.js").DwgHatchEntity;

/** Geometría no finita o specs imposibles: el writer falla cerrado. */
function validateEntity(
  entity: DwgGeometryEntity,
): asserts entity is Ac1015WritableEntity {
  if (
    typeof entity !== "object" ||
    entity === null ||
    !(DWG_GEOMETRY_ENTITY_KINDS as readonly string[]).includes(entity.kind)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An entity spec must be one of the neutral geometry kinds.",
    );
  }
  switch (entity.kind) {
    case "line":
    case "point":
    case "circle":
    case "arc":
    case "lwpolyline":
    case "text":
    case "attrib":
    case "seqend":
    case "insert":
    case "ellipse":
    case "mtext":
      break;
    case "hatch":
      // EL PATRÓN SE ESCRIBE CUANDO VIAJA CON EL MODELO (2026-09-04). Un
      // HATCH no sólido lleva, después de los caminos, un bloque que el
      // sólido no tiene: ángulo, escala, doble trama y las líneas de
      // definición con sus trazos. Ese bloque NO se deduce de los contornos
      // —eso sigue siendo cierto y por eso el rechazo se conserva— pero sí
      // llega en el modelo cuando quien llama lo trae, y entonces escribirlo
      // no inventa nada: es el espejo de lo que el decodificador lee. Sin
      // definición se falla cerrado y quien llama declara la pérdida, jamás
      // un patrón a medias que el lector ajeno interpretaría como otro dibujo.
      if (!entity.solidFill && entity.definitionLines === undefined) {
        throwDwgError(
          "DWG_VERSION_DECODER_UNSUPPORTED",
          "unsupported",
          0,
          "Writing a patterned HATCH requires its pattern definition lines: they cannot be derived from the boundaries.",
        );
      }
      break;
    default:
      throwDwgError(
        "DWG_VERSION_DECODER_UNSUPPORTED",
        "unsupported",
        0,
        `Writing a "${entity.kind}" entity is not implemented by the laboratory writer yet.`,
      );
  }
  const invalid = (): never =>
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An entity spec contains non-finite or impossible geometry.",
    );
  if (
    entity.kind !== "lwpolyline" &&
    entity.kind !== "seqend" &&
    entity.kind !== "insert" &&
    entity.kind !== "ellipse" &&
    entity.kind !== "mtext" &&
    entity.kind !== "hatch" &&
    (!Number.isFinite(entity.thickness) || !isFiniteDwgPoint3(entity.extrusion))
  ) {
    invalid();
  }
  switch (entity.kind) {
    case "line":
      if (!isFiniteDwgPoint3(entity.start) || !isFiniteDwgPoint3(entity.end)) {
        invalid();
      }
      return;
    case "point":
      if (
        !isFiniteDwgPoint3(entity.position) ||
        !Number.isFinite(entity.xAxisAngle)
      ) {
        invalid();
      }
      return;
    case "circle":
    case "arc":
      if (
        !isFiniteDwgPoint3(entity.center) ||
        !Number.isFinite(entity.radius) ||
        entity.radius < 0
      ) {
        invalid();
      }
      if (
        entity.kind === "arc" &&
        (!Number.isFinite(entity.startAngle) || !Number.isFinite(entity.endAngle))
      ) {
        invalid();
      }
      return;
    case "lwpolyline":
      validateLwPolyline(entity, invalid);
      return;
    case "text":
      validateTextFields(entity, invalid);
      return;
    case "attrib":
      validateAttrib(entity, invalid);
      return;
    case "seqend":
      // El SEQEND no tiene campos que validar: es un marcador con handle.
      return;
    case "insert":
      if (
        !isFiniteDwgPoint3(entity.position) ||
        !isFiniteDwgPoint3(entity.scale) ||
        !Number.isFinite(entity.rotation) ||
        !isFiniteDwgPoint3(entity.extrusion) ||
        typeof entity.attributesFollow !== "boolean"
      ) {
        invalid();
      }
      // La bandera de ATTRIBs ya no se rechaza aquí: la sostiene
      // `validatedAttributeHandles`, que exige los tres handles del flujo.
      return;
    case "ellipse":
      if (
        !isFiniteDwgPoint3(entity.center) ||
        !isFiniteDwgPoint3(entity.majorAxisEndpoint) ||
        !isFiniteDwgPoint3(entity.extrusion) ||
        !Number.isFinite(entity.axisRatio) ||
        entity.axisRatio < 0 ||
        !Number.isFinite(entity.startAngle) ||
        !Number.isFinite(entity.endAngle)
      ) {
        invalid();
      }
      return;
    case "mtext":
      validateMText(entity, invalid);
      return;
    case "hatch":
      validateHatch(entity, invalid);
      return;
  }
}

