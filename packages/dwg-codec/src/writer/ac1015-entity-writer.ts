/**
 * Writer de cuerpos de entidad R2000 — fases D2/D3/D4 (espejo del
 * decodificador).
 *
 * Emite el cuerpo COMPLETO de una entidad real (LINE, POINT, CIRCLE, ARC,
 * LWPOLYLINE y TEXT desde la fase D3, INSERT desde la D4, ELLIPSE y MTEXT
 * desde la ola de escritura V1→V3 de 2026-08-31):
 * tipo BS, tamaño RL en bits, handle propio H, cabecera común mínima
 * coherente, datos del tipo y un flujo de handles final confesadamente
 * mínimo. El cuerpo resultante es válido para la envoltura de la fase D1
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
  isFiniteDwgPoint2,
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
import { AC1015_TYPE_MTEXT } from "../objects/entities-annotation.js";
import {
  emitEllipse,
  emitHatch,
  emitInsert,
  emitLwPolyline,
  emitMText,
  emitText,
} from "./ac1015-entity-emitters.js";
import {
  AC1015_TYPE_HATCH,
  HATCH_PATH_POLYLINE_BIT,
} from "../objects/entities-complex.js";
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
 */
export interface Ac1015EntityWriteOptions {
  readonly ownerBlockHandle?: number;
  readonly insertBlockHandle?: number;
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
  });
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
    case "insert":
    case "ellipse":
    case "mtext":
      break;
    case "hatch":
      // SÓLO EL RELLENO SÓLIDO. Un HATCH con patrón lleva, después de los
      // caminos, un bloque que el sólido no tiene: ángulo, escala, doble
      // trama y las líneas de definición con sus trazos. Nada de eso se puede
      // deducir de los contornos, así que emitirlo exigiría inventarlo. El
      // writer falla cerrado y quien llama declara la pérdida — jamás un
      // patrón a medias que el lector ajeno interpretaría como otro dibujo.
      if (!entity.solidFill) {
        throwDwgError(
          "DWG_VERSION_DECODER_UNSUPPORTED",
          "unsupported",
          0,
          "Writing a patterned HATCH is not implemented: its pattern definition lines cannot be derived from the boundaries.",
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
      validateText(entity, invalid);
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
      if (entity.attributesFollow) {
        // Emitir ATTRIBs es pendiente DECLARADO de la fase D4: fallo cerrado
        // en vez de emitir una bandera que promete objetos que no existen.
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "Writing insert attributes is not implemented by the phase-D4 laboratory.",
        );
      }
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
  }
}

/**
 * La polilínea del modelo debe ser emitible tal cual: al menos un vértice
 * finito, arrays de bulges/anchos alineados vértice a vértice cuando existen,
 * anchos y ancho constante no negativos, y opcionales o bien ausentes
 * (`undefined`) o bien finitos — exactamente lo que el lector aceptará.
 */
function validateLwPolyline(
  entity: DwgLwPolylineEntity,
  invalid: () => never,
): void {
  if (
    typeof entity.closed !== "boolean" ||
    !Array.isArray(entity.vertices) ||
    entity.vertices.length < 1
  ) {
    invalid();
  }
  for (const vertex of entity.vertices) {
    if (!isFiniteDwgPoint2(vertex)) invalid();
  }
  if (entity.bulges !== undefined) {
    if (
      !Array.isArray(entity.bulges) ||
      entity.bulges.length !== entity.vertices.length ||
      entity.bulges.some((bulge) => !Number.isFinite(bulge))
    ) {
      invalid();
    }
  }
  if (entity.widths !== undefined) {
    if (
      !Array.isArray(entity.widths) ||
      entity.widths.length !== entity.vertices.length ||
      entity.widths.some(
        (width) =>
          !Number.isFinite(width.start) ||
          width.start < 0 ||
          !Number.isFinite(width.end) ||
          width.end < 0,
      )
    ) {
      invalid();
    }
  }
  if (
    entity.constantWidth !== undefined &&
    (!Number.isFinite(entity.constantWidth) || entity.constantWidth < 0)
  ) {
    invalid();
  }
  if (entity.elevation !== undefined && !Number.isFinite(entity.elevation)) {
    invalid();
  }
  if (entity.thickness !== undefined && !Number.isFinite(entity.thickness)) {
    invalid();
  }
  if (entity.extrusion !== undefined && !isFiniteDwgPoint3(entity.extrusion)) {
    invalid();
  }
}

/**
 * El texto del modelo debe ser emitible tal cual: inserción finita, altura
 * finita no negativa, opcionales ausentes o finitos, códigos BS en rango y
 * bytes de cadena 0–255 (el emisor TV los revalida bit a bit).
 */
function validateText(entity: DwgTextEntity, invalid: () => never): void {
  if (
    !isFiniteDwgPoint2(entity.insertion) ||
    !Number.isFinite(entity.height) ||
    entity.height < 0 ||
    !Array.isArray(entity.valueBytes)
  ) {
    invalid();
  }
  if (entity.alignment !== undefined && !isFiniteDwgPoint2(entity.alignment)) {
    invalid();
  }
  for (const optional of [
    entity.elevation,
    entity.obliqueAngle,
    entity.rotation,
    entity.widthFactor,
  ]) {
    if (optional !== undefined && !Number.isFinite(optional)) invalid();
  }
  for (const code of [
    entity.generation,
    entity.horizontalAlignment,
    entity.verticalAlignment,
  ]) {
    if (
      code !== undefined &&
      (!Number.isInteger(code) || code < 0 || code > 0xffff)
    ) {
      invalid();
    }
  }
}

/**
 * El MTEXT del modelo debe ser emitible tal cual: los tres puntos y los
 * cinco campos BD/DD sueltos finitos, los códigos BS en rango, la cadena
 * como array de bytes y el bit final estrictamente 0 o 1 — el decodificador
 * no le da otro significado, así que el writer tampoco inventa uno.
 */
function validateMText(entity: DwgMTextEntity, invalid: () => never): void {
  if (
    !isFiniteDwgPoint3(entity.insertion) ||
    !isFiniteDwgPoint3(entity.extrusion) ||
    !isFiniteDwgPoint3(entity.xAxisDirection) ||
    !Array.isArray(entity.valueBytes)
  ) {
    invalid();
  }
  for (const value of [
    entity.rectWidth,
    entity.height,
    entity.extentsHeight,
    entity.extentsWidth,
    entity.lineSpacingFactor,
  ]) {
    if (!Number.isFinite(value)) invalid();
  }
  for (const code of [
    entity.attachment,
    entity.drawingDirection,
    entity.lineSpacingStyle,
  ]) {
    if (!Number.isInteger(code) || code < 0 || code > 0xffff) invalid();
  }
  if (entity.trailingBit !== 0 && entity.trailingBit !== 1) invalid();
}
