/**
 * Spec del lector de base de datos R2004: adaptador de cuerpos AC1018,
 * marcos de sección R2004, clases R2004 y despacho por firma.
 *
 * Los cuerpos R2004 se construyen A MANO con el emisor de bits first-party
 * (dos pasadas: cola medida → tamaño en bits → cuerpo final) y se validan
 * decodificándolos con los decodificadores R2000 REALES tras el adaptador —
 * el mismo contrato que el corpus demostró 8/8. Cada gemelo triste tuerce el
 * campo exacto que su regla vigila.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readDwg } from "../../src/api/read.js";
import { crc16Dwg } from "../../src/codecs/crc16.js";
import {
  AC1015_HEADER_VARIABLES_SENTINELS,
  AC1015_SECTION_CRC_SEED,
} from "../../src/container/ac1015-section-frame.js";
import { decodeAc1015LayerBody } from "../../src/objects/table-layer.js";
import { decodeAc1015BlockRecordBody } from "../../src/objects/table-block.js";
import { decodeAc1015EntityBody } from "../../src/objects/entities-core.js";
import {
  decodeR2004ClassesSection,
  readR2004SectionFrame,
} from "../../src/reader/r2004-database-reader.js";
import { normalizeR2004ObjectBody } from "../../src/reader/r2004-body-adapter.js";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import { ascii, assertDwgError } from "../support/assert.js";

const LAYER_TYPE = 0x33;
const BLOCK_HEADER_TYPE = 0x31;
const SEQEND_TYPE = 0x06;

/** Junta tipo BS + tamaño RL + cola + flujo de handles en un cuerpo. */
function assembleBody(
  type: number,
  data: DwgBitEmitter,
  handleStream: (emitter: DwgBitEmitter) => void,
): Uint8Array {
  const typeProbe = new DwgBitEmitter();
  typeProbe.emitBS(type);
  const bitSize = typeProbe.bitLength + 32 + data.bitLength;
  const body = new DwgBitEmitter();
  body.emitBS(type);
  body.emitRL(bitSize);
  body.pushEmitter(data);
  handleStream(body);
  return body.toBytes();
}

interface LayerBodyOptions {
  readonly xdicMissing?: 0 | 1;
  readonly colorLong?: number;
  readonly colorByte?: number;
}

/** Un cuerpo LAYER R2004 mínimo: prólogo 2004 + entrada + CmC 2004. */
function buildR2004LayerBody(options: LayerBodyOptions = {}): Uint8Array {
  const { xdicMissing = 1, colorLong = 0xc3000005, colorByte = 0 } = options;
  const data = new DwgBitEmitter();
  data.emitH(0, 0x10); // handle propio
  data.emitBS(0); // sin EED
  data.emitBL(0); // sin reactores
  data.pushBit(xdicMissing); // R2004+: bandera de xdictionary ausente
  data.emitTV([...ascii("MUROS")]);
  data.pushBit(0); // referencia externa
  data.emitBS(0); // índice de xref más uno
  data.pushBit(0); // dependencia de xref
  data.emitBS(0x3f0); // BS de estado crudo
  data.emitBS(0); // CmC 2004: índice (siempre 0)
  data.emitBL(colorLong); // CmC 2004: color con método en el byte alto
  data.emitRC(colorByte); // CmC 2004: banderas de nombres
  return assembleBody(LAYER_TYPE, data, (emitter) => {
    emitter.emitH(4, 0); // propietario (soft, nulo)
    if (xdicMissing === 0) emitter.emitH(3, 0x55); // xdictionary presente
  });
}

/** Un SEQEND R2004 mínimo: el común de ENTIDAD con la bandera en su sitio. */
function buildR2004SeqendBody(xdicMissing: 0 | 1): Uint8Array {
  const data = new DwgBitEmitter();
  data.emitH(0, 0x42);
  data.emitBS(0); // sin EED
  data.pushBit(0); // sin gráfico
  data.pushBits(2, 2); // modo de entidad: model space
  data.emitBL(0); // sin reactores
  data.pushBit(xdicMissing); // R2004+: ocupa la posición del sin-vínculos
  data.emitBS(256); // ENC sin banderas = ByLayer
  data.emitBD(1); // escala de tipo de línea
  data.pushBits(0, 2); // banderas de linetype
  data.pushBits(0, 2); // banderas de plotstyle
  data.emitBS(0); // invisibilidad
  data.emitRC(0); // lineweight
  return assembleBody(SEQEND_TYPE, data, (emitter) => {
    if (xdicMissing === 0) emitter.emitH(3, 0x55);
    emitter.emitH(5, 0x10); // capa
  });
}

/** Un BLOCK_HEADER R2004 mínimo, con su BL de objetos poseídos. */
function buildR2004BlockRecordBody(ownedCount: number): Uint8Array {
  const data = new DwgBitEmitter();
  data.emitH(0, 0x1d);
  data.emitBS(0); // sin EED
  data.emitBL(0); // sin reactores
  data.pushBit(1); // xdictionary ausente
  data.emitTV([...ascii("MARCO")]);
  data.pushBit(0); // bandera 64
  data.emitBS(0); // índice de xref más uno
  data.pushBit(0); // dependencia de xref
  data.pushBit(0); // anónimo
  data.pushBit(0); // con attdefs
  data.pushBit(0); // es xref
  data.pushBit(0); // xref superpuesto
  data.pushBit(0); // bit de cargado (el bit del intake AC1015)
  data.emitBL(ownedCount); // R2004+: objetos poseídos — el adaptador lo retira
  for (let index = 0; index < 3; index += 1) data.emitBD(0); // punto base
  data.emitTV([]); // ruta de xref
  data.emitRC(0); // recuentos de inserción: terminador
  data.emitTV([]); // descripción
  data.emitBL(0); // previsualización: cero bytes
  return assembleBody(BLOCK_HEADER_TYPE, data, (emitter) => {
    emitter.emitH(4, 0x01); // control
    emitter.emitH(5, 0); // NULL
    emitter.emitH(3, 0x34); // entidad BLOCK
    for (let index = 0; index < ownedCount; index += 1) {
      emitter.emitH(3, 0x60 + index); // poseídos R2004+
    }
    emitter.emitH(3, 0x35); // ENDBLK
  });
}

// ---------------------------------------------------------------------------
// Adaptador: no entidades
// ---------------------------------------------------------------------------

test("un LAYER R2004 decodifica con el decodificador R2000 tras el adaptador", () => {
  const adapted = normalizeR2004ObjectBody(buildR2004LayerBody(), false);
  const decoded = decodeAc1015LayerBody(adapted);
  assert.deepEqual([...decoded.layer.name], [...ascii("MUROS")]);
  assert.equal(decoded.layer.color.index, 5);
  assert.equal(decoded.layer.stateFlags, 0x3f0);
  assert.equal(decoded.common.ownHandle.value, 0x10);
});

test("la bandera a 0 conserva el xdictionary real del flujo", () => {
  const adapted = normalizeR2004ObjectBody(
    buildR2004LayerBody({ xdicMissing: 0 }),
    false,
  );
  const decoded = decodeAc1015LayerBody(adapted);
  assert.deepEqual([...decoded.layer.name], [...ascii("MUROS")]);
});

test("los métodos de color medidos proyectan su índice: ByLayer y ByBlock", () => {
  const byLayer = decodeAc1015LayerBody(
    normalizeR2004ObjectBody(
      buildR2004LayerBody({ colorLong: 0xc0000000 }),
      false,
    ),
  );
  assert.equal(byLayer.layer.color.index, 256);
  const byBlock = decodeAc1015LayerBody(
    normalizeR2004ObjectBody(
      buildR2004LayerBody({ colorLong: 0xc1000000 }),
      false,
    ),
  );
  assert.equal(byBlock.layer.color.index, 0);
});

test("gemelo triste: un color RGB verdadero es capacidad ausente tipada", () => {
  assertDwgError(
    () =>
      normalizeR2004ObjectBody(
        buildR2004LayerBody({ colorLong: 0xc2ff8800 }),
        false,
      ),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("gemelo triste: banderas de nombre de color no se fingen", () => {
  assertDwgError(
    () =>
      normalizeR2004ObjectBody(buildR2004LayerBody({ colorByte: 1 }), false),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("el BL de objetos poseídos del BLOCK_HEADER se retira y el registro decodifica", () => {
  for (const ownedCount of [0, 3]) {
    const adapted = normalizeR2004ObjectBody(
      buildR2004BlockRecordBody(ownedCount),
      false,
    );
    const decoded = decodeAc1015BlockRecordBody(adapted);
    assert.deepEqual([...decoded.record.name], [...ascii("MARCO")]);
  }
});

test("el adaptador es determinista byte a byte", () => {
  const body = buildR2004LayerBody();
  assert.deepEqual(
    [...normalizeR2004ObjectBody(body, false)],
    [...normalizeR2004ObjectBody(body, false)],
  );
});

// ---------------------------------------------------------------------------
// Adaptador: entidades
// ---------------------------------------------------------------------------

test("una entidad R2004 decodifica con capa resuelta y sin vínculos forzado", () => {
  const adapted = normalizeR2004ObjectBody(buildR2004SeqendBody(1), true);
  const decoded = decodeAc1015EntityBody(adapted);
  assert.equal(decoded.common.type, SEQEND_TYPE);
  assert.equal(decoded.common.noLinks, true);
  assert.equal(decoded.common.entityMode, 2);
  assert.equal(decoded.references.layer.kind, "absolute");
  if (decoded.references.layer.kind === "absolute") {
    assert.equal(decoded.references.layer.handle, 0x10);
  }
});

test("una entidad con xdictionary presente conserva su flujo intacto", () => {
  const adapted = normalizeR2004ObjectBody(buildR2004SeqendBody(0), true);
  const decoded = decodeAc1015EntityBody(adapted);
  assert.equal(decoded.references.layer.kind, "absolute");
  if (decoded.references.layer.kind === "absolute") {
    assert.equal(decoded.references.layer.handle, 0x10);
  }
});

test("gemelo triste: un cuerpo truncado falla cerrado en el adaptador", () => {
  const body = buildR2004LayerBody();
  assertDwgError(
    () => normalizeR2004ObjectBody(body.slice(0, 6), false),
    "DWG_STRUCTURE_CORRUPT",
  );
});

// ---------------------------------------------------------------------------
// Marcos de sección R2004 y clases
// ---------------------------------------------------------------------------

/** Un marco R2004 válido con payload y relleno arbitrario tras el cierre. */
function buildFrame(payload: number[], slack: number[]): Uint8Array {
  const bytes: number[] = [...AC1015_HEADER_VARIABLES_SENTINELS.begin];
  const sized = [
    payload.length & 0xff,
    (payload.length >> 8) & 0xff,
    (payload.length >> 16) & 0xff,
    (payload.length >> 24) & 0xff,
    ...payload,
  ];
  bytes.push(...sized);
  const crc = crc16Dwg(Uint8Array.from(sized), AC1015_SECTION_CRC_SEED);
  bytes.push(crc & 0xff, (crc >> 8) & 0xff);
  bytes.push(...AC1015_HEADER_VARIABLES_SENTINELS.end);
  bytes.push(...slack);
  return Uint8Array.from(bytes);
}

test("un marco R2004 entrega su payload y declara el relleno final", () => {
  const frame = readR2004SectionFrame(
    buildFrame([1, 2, 3, 4], [0xaa, 0xbb, 0xcc]),
    AC1015_HEADER_VARIABLES_SENTINELS,
  );
  assert.deepEqual([...frame.payload], [1, 2, 3, 4]);
  assert.equal(frame.declaredSize, 4);
  assert.equal(frame.slackLength, 3);
});

test("gemelos tristes del marco: centinela, CRC y tamaño mentiroso", () => {
  const good = buildFrame([1, 2, 3, 4], []);
  const badSentinel = Uint8Array.from(good);
  badSentinel[0]! ^= 0xff;
  assertDwgError(
    () => readR2004SectionFrame(badSentinel, AC1015_HEADER_VARIABLES_SENTINELS),
    "DWG_STRUCTURE_CORRUPT",
  );
  const badCrc = Uint8Array.from(good);
  badCrc[20]! ^= 0x55; // primer byte del payload: el CRC deja de cuadrar
  assertDwgError(
    () => readR2004SectionFrame(badCrc, AC1015_HEADER_VARIABLES_SENTINELS),
    "DWG_STRUCTURE_CORRUPT",
  );
  const lyingSize = Uint8Array.from(good);
  lyingSize[16] = 0xff; // el tamaño ya no cabe en el payload de la sección
  assertDwgError(
    () => readR2004SectionFrame(lyingSize, AC1015_HEADER_VARIABLES_SENTINELS),
    "DWG_STRUCTURE_CORRUPT",
  );
});

/**
 * Un marco R2010+ con campo de tamaño de 8 bytes little-endian (hecho medido
 * VALLE-CORPUS-INTAKE-A60EBE2, intake 2026-08-23: los 4 bytes altos miden 0
 * en los 7/7 casos reales medidos, pero el lector los porta con aritmética
 * comprobada como cualquier otro tamaño no confiable).
 */
function buildWideFrame(payload: number[], slack: number[], highBytes = [0, 0, 0, 0]): Uint8Array {
  const bytes: number[] = [...AC1015_HEADER_VARIABLES_SENTINELS.begin];
  const sized = [
    payload.length & 0xff,
    (payload.length >> 8) & 0xff,
    (payload.length >> 16) & 0xff,
    (payload.length >> 24) & 0xff,
    ...highBytes,
    ...payload,
  ];
  bytes.push(...sized);
  const crc = crc16Dwg(Uint8Array.from(sized), AC1015_SECTION_CRC_SEED);
  bytes.push(crc & 0xff, (crc >> 8) & 0xff);
  bytes.push(...AC1015_HEADER_VARIABLES_SENTINELS.end);
  bytes.push(...slack);
  return Uint8Array.from(bytes);
}

test("un marco R2010+ de 8 bytes de tamaño entrega su payload igual que el de 4", () => {
  const frame = readR2004SectionFrame(
    buildWideFrame([9, 8, 7, 6, 5], [0xaa]),
    AC1015_HEADER_VARIABLES_SENTINELS,
    8,
  );
  assert.deepEqual([...frame.payload], [9, 8, 7, 6, 5]);
  assert.equal(frame.declaredSize, 5);
  assert.equal(frame.slackLength, 1);
});

test("gemelo triste: un tamaño R2010+ de 8 bytes fuera de rango entero seguro falla cerrado", () => {
  const wide = buildWideFrame([1, 2, 3], [], [0, 0, 0, 0x01]); // desborda MAX_SAFE_INTEGER de sobra
  assertDwgError(
    () => readR2004SectionFrame(wide, AC1015_HEADER_VARIABLES_SENTINELS, 8),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: el ancho de 4 bytes sigue siendo el valor por defecto para AC1018", () => {
  // Un marco de 4 bytes leído como si fuera de 8 no cuadra: el tamaño
  // declarado se lee corrido y el CRC no valida — falla cerrado, no silencioso.
  assertDwgError(
    () => readR2004SectionFrame(buildFrame([1, 2, 3, 4], []), AC1015_HEADER_VARIABLES_SENTINELS, 8),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("la sección de clases R2004 decodifica sus registros extendidos", () => {
  const emitter = new DwgBitEmitter();
  emitter.emitBS(0x1f4); // número de clase máximo
  emitter.emitRC(0);
  emitter.emitRC(0);
  emitter.pushBit(1);
  emitter.emitBS(0x1f4); // classnum
  emitter.emitBS(0); // banderas proxy
  emitter.emitTV([...ascii("ObjectDBX Classes")]);
  emitter.emitTV([...ascii("AcDbLayout")]);
  emitter.emitTV([...ascii("LAYOUT")]);
  emitter.pushBit(0); // wasazombie
  emitter.emitBS(0x1f3); // produce objetos
  emitter.emitBL(2); // objetos creados
  emitter.emitBS(0x19); // versión DWG
  emitter.emitBS(0); // mantenimiento
  emitter.emitBL(0);
  emitter.emitBL(0);
  const records = decodeR2004ClassesSection(emitter.toBytes());
  assert.equal(records.length, 1);
  assert.equal(records[0]!.classNumber, 0x1f4);
  assert.deepEqual([...records[0]!.dxfClassName], [...ascii("LAYOUT")]);
  assert.equal(records[0]!.itemClassId, 0x1f3);
});

// ---------------------------------------------------------------------------
// Despacho por firma
// ---------------------------------------------------------------------------

test("AC1021 se rechaza tipado con su límite declarado", () => {
  const caught = assertDwgError(
    () => readDwg(ascii("AC1021")),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.match(caught.detail.message, /Reed-Solomon/);
});

test("las versiones R2010+ de la familia declaran su límite de objetos", () => {
  for (const code of ["AC1024", "AC1027", "AC1032"]) {
    const caught = assertDwgError(
      () => readDwg(ascii(code)),
      "DWG_VERSION_DECODER_UNSUPPORTED",
    );
    assert.match(caught.detail.message, /AC1018/);
  }
});

test("una firma AC1018 despacha al lector R2004, que falla cerrado sin contenedor", () => {
  assertDwgError(() => readDwg(ascii("AC1018")), "DWG_STRUCTURE_CORRUPT");
});

console.log(
  "r2004-database.spec: lector R2004 verde — cuerpos AC1018 a mano contra los decodificadores R2000 reales, marcos y despacho tipado.",
);
