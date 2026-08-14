/**
 * Writer de cuerpos de entidad R2000 — fases D2/D3 (espejo del decodificador).
 *
 * Emite el cuerpo COMPLETO de una entidad real (LINE, POINT, CIRCLE, ARC y,
 * desde la fase D3, LWPOLYLINE y TEXT):
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
 * - modo 2 (model space: sin handle de propietario en el flujo);
 * - 0 reactores y bit de sin-vínculos a 1;
 * - color ByLayer (CmC 256), escala de tipo de línea 1.0, banderas de
 *   linetype y plotstyle ByLayer (0), invisibilidad 0 y lineweight 0x1D;
 * - flujo de handles final: xdictionary NULO y capa NULA — placeholders
 *   CONFESOS (el laboratorio aún no escribe tablas de símbolos), coherentes
 *   con las banderas emitidas: ni propietario, ni reactores, ni ltype, ni
 *   plotstyle esperan handle.
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
  type DwgLwPolylineEntity,
  type DwgPoint3,
  type DwgTextEntity,
} from "../model/entity-geometry.js";
import {
  AC1015_TYPE_ARC,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_LINE,
  AC1015_TYPE_LWPOLYLINE,
  AC1015_TYPE_POINT,
  AC1015_TYPE_TEXT,
} from "../objects/entities-core.js";
import { throwDwgError } from "../security/parse-error.js";

const FLOAT_SCRATCH = new DataView(new ArrayBuffer(8));

/** Tope de bits por cuerpo emitido: límite de LABORATORIO, no del formato. */
export const AC1015_ENTITY_WRITER_MAX_BITS = 0x1_0000;

/**
 * Emisor de bits MSB-first con todos los códigos que esta fase escribe. Es el
 * espejo de `DwgBitReader`: mismo orden de bits, mismos atajos, y por eso los
 * tests de round-trip delatan cualquier asimetría. Se exporta para que los
 * specs compongan también cuerpos HOSTILES a mano (gemelos tristes).
 */
export class DwgBitEmitter {
  readonly #bits: (0 | 1)[] = [];

  get bitLength(): number {
    return this.#bits.length;
  }

  pushBit(bit: 0 | 1): void {
    if (bit !== 0 && bit !== 1) {
      throwDwgError("DWG_INPUT_INVALID", "input", 0, "A bit must be 0 or 1.");
    }
    if (this.#bits.length >= AC1015_ENTITY_WRITER_MAX_BITS) {
      throwDwgError(
        "DWG_FILE_LIMIT_EXCEEDED",
        "resource",
        0,
        "An entity body exceeds the phase-D2 laboratory bit limit.",
      );
    }
    this.#bits.push(bit);
  }

  /** `width` bits de `value`, del más significativo al menos (como el lector). */
  pushBits(value: number, width: number): void {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      !Number.isSafeInteger(width) ||
      width < 0 ||
      width > 32 ||
      value >= 2 ** width
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A bit field must be a non-negative integer that fits its width.",
      );
    }
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      this.pushBit(Math.floor(value / 2 ** shift) % 2 === 1 ? 1 : 0);
    }
  }

  /** Replica los bits de otro emisor (composición en dos pasadas). */
  pushEmitter(other: DwgBitEmitter): void {
    for (const bit of other.#bits) {
      this.pushBit(bit);
    }
  }

  emitRC(value: number): void {
    this.pushBits(value, 8);
  }

  /** RS: 16 bits crudos, bytes little-endian dentro del flujo de bits. */
  emitRS(value: number): void {
    this.emitRC(value & 0xff);
    this.emitRC((value >> 8) & 0xff);
  }

  /** RL: 32 bits crudos, bytes little-endian. */
  emitRL(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An RL value must fit in an unsigned 32-bit integer.",
      );
    }
    this.emitRS(value % 0x1_0000);
    this.emitRS(Math.floor(value / 0x1_0000));
  }

  /** RD: double IEEE-754 de 8 bytes little-endian. */
  emitRD(value: number): void {
    FLOAT_SCRATCH.setFloat64(0, value, true);
    for (let index = 0; index < 8; index += 1) {
      this.emitRC(FLOAT_SCRATCH.getUint8(index));
    }
  }

  /** BS: la forma más corta que el formato define (espejo de readBS). */
  emitBS(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A BS value must fit in an unsigned 16-bit integer.",
      );
    }
    if (value === 0) {
      this.pushBits(0b10, 2);
    } else if (value === 256) {
      this.pushBits(0b11, 2);
    } else if (value <= 0xff) {
      this.pushBits(0b01, 2);
      this.emitRC(value);
    } else {
      this.pushBits(0b00, 2);
      this.emitRS(value);
    }
  }

  /** BL: como BS pero sin el atajo de 256 (la bandera 11 no existe). */
  emitBL(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A BL value must fit in an unsigned 32-bit integer.",
      );
    }
    if (value === 0) {
      this.pushBits(0b10, 2);
    } else if (value <= 0xff) {
      this.pushBits(0b01, 2);
      this.emitRC(value);
    } else {
      this.pushBits(0b00, 2);
      this.emitRL(value);
    }
  }

  /**
   * BD: los atajos de 0.0 y 1.0 sólo se toman con igualdad EXACTA de bits
   * (`Object.is`): un −0.0 viaja como RD completo para que el round-trip
   * devuelva el mismo double, bit a bit.
   */
  emitBD(value: number): void {
    assertFiniteDouble(value);
    if (Object.is(value, 1)) {
      this.pushBits(0b01, 2);
    } else if (Object.is(value, 0)) {
      this.pushBits(0b10, 2);
    } else {
      this.pushBits(0b00, 2);
      this.emitRD(value);
    }
  }

  /**
   * DD: esta fase emite sólo las dos formas totales — 00 (igual al defecto,
   * con igualdad exacta) o 11 (RD completo). Los parches de 4/6 bytes son
   * formas de COMPRESIÓN opcionales que el lector ya acepta; no emitirlas es
   * válido y mantiene el writer simple y sin ambigüedad.
   */
  emitDD(value: number, defaultValue: number): void {
    assertFiniteDouble(value);
    if (Object.is(value, defaultValue)) {
      this.pushBits(0b00, 2);
    } else {
      this.pushBits(0b11, 2);
      this.emitRD(value);
    }
  }

  /** BT: grosor cero en un bit; cualquier otro, bit 0 + BD (espejo de readBT). */
  emitBT(value: number): void {
    assertFiniteDouble(value);
    if (Object.is(value, 0)) {
      this.pushBit(1);
    } else {
      this.pushBit(0);
      this.emitBD(value);
    }
  }

  /** BE: la extrusión canónica (0,0,1) en un bit; cualquier otra, 3BD. */
  emitBE(extrusion: DwgPoint3): void {
    if (
      Object.is(extrusion.x, 0) &&
      Object.is(extrusion.y, 0) &&
      Object.is(extrusion.z, 1)
    ) {
      this.pushBit(1);
    } else {
      this.pushBit(0);
      this.emitBD(extrusion.x);
      this.emitBD(extrusion.y);
      this.emitBD(extrusion.z);
    }
  }

  /**
   * TV: longitud BS + esos bytes tal cual (la página de códigos es de una
   * capa superior, igual que en `readTV`). Espejo exacto del lector.
   */
  emitTV(bytes: readonly number[]): void {
    if (!Array.isArray(bytes) || bytes.length > 0xffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A text value needs at most 65535 byte values.",
      );
    }
    this.emitBS(bytes.length);
    for (const byte of bytes) {
      // pushBits valida que cada valor sea un entero de 0 a 255.
      this.emitRC(byte);
    }
  }

  /** H: código de 4 bits + contador + bytes big-endian mínimos del valor. */
  emitH(code: number, value: number): void {
    if (
      !Number.isInteger(code) ||
      code < 0 ||
      code > 0xf ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A handle needs a 4-bit code and a non-negative safe value.",
      );
    }
    const bytes: number[] = [];
    let rest = value;
    while (rest > 0) {
      bytes.unshift(rest % 0x100);
      rest = Math.floor(rest / 0x100);
    }
    this.pushBits(code, 4);
    this.pushBits(bytes.length, 4);
    for (const byte of bytes) {
      this.emitRC(byte);
    }
  }

  /** Bytes emitidos; los bits sobrantes del último byte quedan a cero. */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.#bits.length / 8));
    this.#bits.forEach((bit, index) => {
      if (bit === 1) {
        bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
      }
    });
    return bytes;
  }
}

/**
 * Emite el cuerpo completo de una entidad nuclear con el handle propio dado.
 * El resultado (tipo incluido) es exactamente lo que `decodeAc1015EntityBody`
 * espera y lo que `wrapAc1015ObjectBody` envuelve para el contenedor.
 */
export function writeAc1015EntityBody(
  entity: DwgGeometryEntity,
  ownHandle: number,
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

  // Composición en dos pasadas: el tamaño RL cuenta TODOS los bits del dato
  // desde el primer bit del tipo hasta el arranque de los handles — incluido
  // el propio RL — así que primero se mide y después se compone.
  const head = new DwgBitEmitter();
  head.emitBS(typeOf(entity));

  const tail = new DwgBitEmitter();
  tail.emitH(0, ownHandle); // handle propio, código 0
  tail.emitBS(0); // EED vacío
  tail.pushBit(0); // sin gráfico de previsualización
  tail.pushBits(0b10, 2); // modo 2: model space, sin propietario en el flujo
  tail.emitBL(0); // cero reactores
  tail.pushBit(1); // sin vínculos de subentidad
  tail.emitBS(256); // color ByLayer
  tail.emitBD(1); // escala de tipo de línea 1.0
  tail.pushBits(0b00, 2); // linetype ByLayer: sin handle en el flujo
  tail.pushBits(0b00, 2); // plotstyle ByLayer: sin handle en el flujo
  tail.emitBS(0); // visible
  tail.emitRC(0x1d); // lineweight ByLayer (placeholder registrado)
  emitEntitySpecific(tail, entity);

  const bitSize = head.bitLength + 32 + tail.bitLength;

  const body = new DwgBitEmitter();
  body.pushEmitter(head);
  body.emitRL(bitSize);
  body.pushEmitter(tail);
  // Flujo de handles mínimo coherente con las banderas emitidas: xdictionary
  // y capa NULOS (placeholders confesos; las tablas de símbolos son de fases
  // posteriores). Ni propietario (modo 2), ni reactores (0), ni ltype ni
  // plotstyle (banderas 0) esperan handle alguno.
  body.emitH(0, 0);
  body.emitH(0, 0);
  return body.toBytes();
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
  }
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

function assertFiniteDouble(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A double field must be a finite number.",
    );
  }
}
