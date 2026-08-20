/**
 * Writer de cuerpos de entidad R2000 — fases D2/D3/D4 (espejo del
 * decodificador).
 *
 * Emite el cuerpo COMPLETO de una entidad real (LINE, POINT, CIRCLE, ARC,
 * LWPOLYLINE y TEXT desde la fase D3, INSERT desde la D4):
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
  type DwgGeometryEntity,
  type DwgInsertEntity,
  type DwgLwPolylineEntity,
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
  tail.emitBS(256); // color ByLayer
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
  }
}

/**
 * INSERT: inserción 3BD y la doble bandada de escalas — este writer emite
 * SOLO sus formas totales, 0b11 (las tres escalas exactamente 1.0, bit a
 * bit) o 0b00 (X como RD y las Y/Z como DD contra la X); las formas 0b01 y
 * 0b10 son compresión que el lector ya acepta, como con DD. Después la
 * rotación BD, la extrusión 3BD — hecho 3 del intake 2026-08-20: los 6
 * INSERT reales desmintieron la BE que declaraba la ODS, y writer y lector
 * se corrigieron JUNTOS — y el bit de ATTRIBs (siempre 0 aquí: emitir
 * ATTRIBs queda declarado pendiente y el writer falla cerrado si el modelo
 * lo pide).
 */
function emitInsert(emitter: DwgBitEmitter, entity: DwgInsertEntity): void {
  emitter.emitBD(entity.position.x);
  emitter.emitBD(entity.position.y);
  emitter.emitBD(entity.position.z);
  const { x, y, z } = entity.scale;
  if (Object.is(x, 1) && Object.is(y, 1) && Object.is(z, 1)) {
    emitter.pushBits(0b11, 2);
  } else {
    emitter.pushBits(0b00, 2);
    emitter.emitRD(x);
    emitter.emitDD(y, x);
    emitter.emitDD(z, x);
  }
  emitter.emitBD(entity.rotation);
  emitter.emitBD(entity.extrusion.x);
  emitter.emitBD(entity.extrusion.y);
  emitter.emitBD(entity.extrusion.z);
  emitter.pushBit(0); // sin ATTRIBs: pendiente declarado de la fase D4
}

/**
 * LWPOLYLINE: la bandera BS se DERIVA de la presencia de cada campo del
 * modelo (`undefined` = el archivo no lo lleva), los opcionales presentes se
 * emiten en el orden del formato y los vértices tras el primero viajan como
 * 2DD contra el anterior — el atajo DD sólo con igualdad exacta de bits, como
 * en el resto del writer.
 */
function emitLwPolyline(
  emitter: DwgBitEmitter,
  entity: DwgLwPolylineEntity,
): void {
  let flags = 0;
  if (entity.extrusion !== undefined) flags |= 0x1;
  if (entity.thickness !== undefined) flags |= 0x2;
  if (entity.constantWidth !== undefined) flags |= 0x4;
  if (entity.elevation !== undefined) flags |= 0x8;
  if (entity.bulges !== undefined) flags |= 0x10;
  if (entity.widths !== undefined) flags |= 0x20;
  if (entity.closed) flags |= 0x200;
  emitter.emitBS(flags);

  if (entity.constantWidth !== undefined) emitter.emitBD(entity.constantWidth);
  if (entity.elevation !== undefined) emitter.emitBD(entity.elevation);
  if (entity.thickness !== undefined) emitter.emitBD(entity.thickness);
  if (entity.extrusion !== undefined) emitter.emitBE(entity.extrusion);

  emitter.emitBL(entity.vertices.length);
  if (entity.bulges !== undefined) emitter.emitBL(entity.bulges.length);
  if (entity.widths !== undefined) emitter.emitBL(entity.widths.length);

  const first = entity.vertices[0]!;
  emitter.emitRD(first.x);
  emitter.emitRD(first.y);
  for (let index = 1; index < entity.vertices.length; index += 1) {
    const vertex = entity.vertices[index]!;
    const previous = entity.vertices[index - 1]!;
    emitter.emitDD(vertex.x, previous.x);
    emitter.emitDD(vertex.y, previous.y);
  }

  if (entity.bulges !== undefined) {
    for (const bulge of entity.bulges) {
      emitter.emitBD(bulge);
    }
  }
  if (entity.widths !== undefined) {
    for (const width of entity.widths) {
      emitter.emitBD(width.start);
      emitter.emitBD(width.end);
    }
  }
}

/**
 * TEXT: el RC de banderas se DERIVA de la presencia — un bit a 1 declara el
 * campo AUSENTE, así que cada `undefined` del modelo enciende su bit y no
 * emite nada. La alineación viaja como 2DD contra la inserción y la cadena
 * como TV de bytes crudos.
 */
function emitText(emitter: DwgBitEmitter, entity: DwgTextEntity): void {
  let dataFlags = 0;
  if (entity.elevation === undefined) dataFlags |= 0x01;
  if (entity.alignment === undefined) dataFlags |= 0x02;
  if (entity.obliqueAngle === undefined) dataFlags |= 0x04;
  if (entity.rotation === undefined) dataFlags |= 0x08;
  if (entity.widthFactor === undefined) dataFlags |= 0x10;
  if (entity.generation === undefined) dataFlags |= 0x20;
  if (entity.horizontalAlignment === undefined) dataFlags |= 0x40;
  if (entity.verticalAlignment === undefined) dataFlags |= 0x80;
  emitter.emitRC(dataFlags);

  if (entity.elevation !== undefined) emitter.emitRD(entity.elevation);
  emitter.emitRD(entity.insertion.x);
  emitter.emitRD(entity.insertion.y);
  if (entity.alignment !== undefined) {
    emitter.emitDD(entity.alignment.x, entity.insertion.x);
    emitter.emitDD(entity.alignment.y, entity.insertion.y);
  }
  emitter.emitBE(entity.extrusion);
  emitter.emitBT(entity.thickness);
  if (entity.obliqueAngle !== undefined) emitter.emitRD(entity.obliqueAngle);
  if (entity.rotation !== undefined) emitter.emitRD(entity.rotation);
  emitter.emitRD(entity.height);
  if (entity.widthFactor !== undefined) emitter.emitRD(entity.widthFactor);
  emitter.emitTV(entity.valueBytes);
  if (entity.generation !== undefined) emitter.emitBS(entity.generation);
  if (entity.horizontalAlignment !== undefined) {
    emitter.emitBS(entity.horizontalAlignment);
  }
  if (entity.verticalAlignment !== undefined) {
    emitter.emitBS(entity.verticalAlignment);
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
  }
}

/** Geometría no finita o specs imposibles: el writer falla cerrado. */
function validateEntity(entity: DwgGeometryEntity): void {
  if (
    typeof entity !== "object" ||
    entity === null ||
    !(DWG_GEOMETRY_ENTITY_KINDS as readonly string[]).includes(entity.kind)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An entity spec must be one of the phase-D2 geometry kinds.",
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
