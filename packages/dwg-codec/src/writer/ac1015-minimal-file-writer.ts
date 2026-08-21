/**
 * Writer del ARCHIVO AC1015 COMPLETO — campaña 2026-08-21, OLA 3.
 *
 * `writeAc1015MinimalFile` emite un .dwg R2000 entero, listo para un lector
 * AJENO: cabecera con SEIS registros de directorio, AuxHeader (registro 5,
 * en el hueco tras la cabecera), previsualización mínima, sección de
 * variables REALES (`createAc1015HeaderVariables` /
 * `encodeAc1015HeaderVariables`), sección de clases con las tres clases que
 * este archivo usa (ACDBDICTIONARYWDFLT, ACDBPLACEHOLDER, LAYOUT), el
 * relleno de 512 bytes pos-clases, el cuerpo de objetos con el ESQUEMA
 * CANÓNICO de handles, el mapa de objetos, ObjFreeSpace (registro 3), el
 * SECOND FILE HEADER con sus centinelas y sus 14 registros de handle, y el
 * Template (registro 4, con MEASUREMENT) cerrando el archivo.
 *
 * DISPOSICIONES: capítulos 8 (preview), 10 (clases), 21 (ObjFreeSpace),
 * 22 (Template), 26 (second header) y 27 (AuxHeader) de
 * ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER), con los VALORES y codificaciones
 * medidos bit a bit en el fixture 01-vacio de NUESTRO corpus admitido
 * (dibujo first-party convertido por la herramienta independiente con
 * licencia; medición del 2026-08-21). En particular: el second header es un
 * FLUJO DE BITS (localización y localizadores como BL), lleva DOS registros
 * extra (ids 4 y 5) además de los cuatro del capítulo 26, y su CRC (semilla
 * 0xC0C1) cubre desde el campo de tamaño hasta el último registro de handle.
 * Este writer fuerza la forma RL de todos los BL de localizador para que los
 * registros de handle queden alineados a byte — forma válida para cualquier
 * lector de BL y la más robusta frente a verificadores estrictos.
 *
 * Esquema canónico de handles (medido; los defaults de
 * `createAc1015HeaderVariables` ya lo llevan): 0x01-0x0B controles, 0x0C NOD,
 * 0x0D grupo, 0x0E ACDBDICTIONARYWDFLT, 0x0F placeholder, 0x10 capa "0",
 * 0x11 STYLE Standard, 0x12 APPID ACAD, 0x14/0x15/0x16 LTYPE
 * ByBlock/ByLayer/Continuous, 0x17 dicc. mlinestyle, 0x18 MLINESTYLE,
 * 0x19 dicc. plotsettings, 0x1A dicc. layouts, 0x1B/0x1C *Paper_Space y su
 * LAYOUT, 0x1D/0x1E *Model_Space y su LAYOUT, 0x20 DIMSTYLE, 0x21 VPORT; los
 * handles dinámicos (capas extra, bloques, entidades y los BLOCK/ENDBLK de
 * los espacios) siguen desde 0x22 y HANDSEED es el siguiente libre.
 *
 * PROHIBICIÓN DECLARADA: este writer NO emite ni imita el watermark
 * TrustedDWG de Autodesk — jamás.
 *
 * Reglas del laboratorio: determinista, fallo cerrado, cero dependencias y
 * NINGUNA constante gemela: magia, centinelas, marcos, envolturas, mapa y
 * emisores de objetos vienen de los MISMOS módulos que ya usan lector y
 * writer de contenedor.
 */
import { crc16Dwg } from "../codecs/crc16.js";
import {
  AC1015_FILE_HEADER_END_SENTINEL,
  AC1015_MAGIC,
} from "../container/ac1015-file-header.js";
import type { Ac1015HeaderVariables } from "../container/ac1015-header-variables.js";
import type { Ac1015ObjectMapEntry } from "../container/ac1015-object-map.js";
import {
  AC1015_CLASSES_SENTINELS,
  AC1015_HEADER_VARIABLES_SENTINELS,
} from "../container/ac1015-section-frame.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import { AC1015_TYPE_BLOCK_CONTROL } from "../objects/table-block.js";
import { AC1015_TYPE_LAYER_CONTROL } from "../objects/table-layer.js";
import { throwDwgError } from "../security/parse-error.js";
import { buildAc1015SectionFrame } from "./ac1015-container-writer.js";
import {
  createAc1015HeaderVariables,
  encodeAc1015HeaderVariables,
} from "./ac1015-header-writer.js";
import {
  AC1015_WRITER_MAX_OBJECTS,
  buildAc1015ObjectMapSection,
  wrapAc1015ObjectBody,
} from "./ac1015-object-writer.js";
import {
  AC1015_TYPE_APPID_CONTROL,
  AC1015_TYPE_DIMSTYLE_CONTROL,
  AC1015_TYPE_LTYPE_CONTROL,
  AC1015_TYPE_STYLE_CONTROL,
  AC1015_TYPE_UCS_CONTROL,
  AC1015_TYPE_VIEW_CONTROL,
  AC1015_TYPE_VPENT_CONTROL,
  AC1015_TYPE_VPORT_CONTROL,
  writeAc1015AppIdBody,
  writeAc1015DictionaryBody,
  writeAc1015DimStyleBody,
  writeAc1015LayoutBody,
  writeAc1015LinetypeBody,
  writeAc1015MlineStyleBody,
  writeAc1015PlaceholderBody,
  writeAc1015ResolvedEntityBody,
  writeAc1015ResolvedLayerBody,
  writeAc1015StructBlockBeginBody,
  writeAc1015StructBlockEndBody,
  writeAc1015StructBlockRecordBody,
  writeAc1015StructTableControlBody,
  writeAc1015TextStyleBody,
  writeAc1015VportBody,
} from "./ac1015-structure-writers.js";
import { DwgBitEmitter } from "./dwg-bit-emitter.js";

// ---------------------------------------------------------------------------
// Esquema canónico de handles (hechos medidos del corpus).
// ---------------------------------------------------------------------------
const H_BLOCK_CONTROL = 0x01;
const H_LAYER_CONTROL = 0x02;
const H_STYLE_CONTROL = 0x03;
const H_LTYPE_CONTROL = 0x05;
const H_VIEW_CONTROL = 0x06;
const H_UCS_CONTROL = 0x07;
const H_VPORT_CONTROL = 0x08;
const H_APPID_CONTROL = 0x09;
const H_DIMSTYLE_CONTROL = 0x0a;
const H_VPENT_CONTROL = 0x0b;
const H_NOD = 0x0c;
const H_GROUP_DICT = 0x0d;
const H_PLOTSTYLE_DICT = 0x0e;
const H_PLACEHOLDER = 0x0f;
const H_LAYER_ZERO = 0x10;
const H_STYLE_STANDARD = 0x11;
const H_APPID_ACAD = 0x12;
const H_LTYPE_BYBLOCK = 0x14;
const H_LTYPE_BYLAYER = 0x15;
const H_LTYPE_CONTINUOUS = 0x16;
const H_MLSTYLE_DICT = 0x17;
const H_MLINESTYLE = 0x18;
const H_PLOTSETTINGS_DICT = 0x19;
const H_LAYOUTS_DICT = 0x1a;
const H_PAPER_RECORD = 0x1b;
const H_PAPER_LAYOUT = 0x1c;
const H_MODEL_RECORD = 0x1d;
const H_MODEL_LAYOUT = 0x1e;
const H_DIMSTYLE_STANDARD = 0x20;
const H_VPORT_ACTIVE = 0x21;
/** Primer handle dinámico: capas extra, bloques, entidades y marcadores. */
const H_DYNAMIC_BASE = 0x22;

/** Códigos de clase de ESTE archivo: 500 + índice en la lista de clases. */
const CLASS_TYPE_DICTIONARYWDFLT = 500;
const CLASS_TYPE_PLACEHOLDER = 501;
const CLASS_TYPE_LAYOUT = 502;

/** Disposición fija de la cabecera de 6 registros (0x61 bytes). */
const FILE_HEADER_LENGTH = 0x15 + 4 + 6 * 9 + 2 + 16;
const AUX_HEADER_START = FILE_HEADER_LENGTH; // 0x61, hueco tras la cabecera
const AUX_HEADER_LENGTH = 123;
const PREVIEW_START = AUX_HEADER_START + AUX_HEADER_LENGTH; // 0xDC
const PREVIEW_LENGTH = 37;
const HEADER_VARIABLES_START = PREVIEW_START + PREVIEW_LENGTH; // 0x101
/** Relleno R13C3 tras la sección de clases (capítulo 11: 0x200 ceros). */
const POST_CLASSES_PADDING = 0x200;

/** Página de códigos del DIBUJO (código DWG, no Windows): ANSI_1252 = 30. */
const DRAWING_CODEPAGE = 30;
/** Versión de mantenimiento medida en el corpus R2000. */
const MAINTENANCE_VERSION = 6;
/** Timestamps deterministas (los del fixture 01-vacio, también en defaults). */
const TDCREATE = [2461273, 58247617] as const;
const TDUPDATE = [2461273, 58247625] as const;

/** Centinelas del SECOND FILE HEADER (capítulo 26, hecho registrado). */
const SECOND_HEADER_BEGIN_SENTINEL = [
  0xd4, 0x7b, 0x21, 0xce, 0x28, 0x93, 0x9f, 0xbf, 0x53, 0x24, 0x40, 0x09,
  0x12, 0x3c, 0xaa, 0x01,
] as const;
const SECOND_HEADER_END_SENTINEL = [
  0x2b, 0x84, 0xde, 0x31, 0xd7, 0x6c, 0x60, 0x40, 0xac, 0xdb, 0xbf, 0xf6,
  0xed, 0xc3, 0x55, 0xfe,
] as const;

/** Centinela de apertura del área de previsualización (capítulo 8). */
const PREVIEW_BEGIN_SENTINEL = [
  0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f,
  0x9d, 0x44, 0x10, 0x2b,
] as const;

/**
 * Los seis bytes que el productor real escribe entre la versión de
 * mantenimiento y los localizadores del second header (medidos bit a bit;
 * los cuatro últimos son los RC que el capítulo 26 lista como
 * 0x18,0x78,0x01,0x04|0x05 — el corpus R2000 lleva 0x06 al final).
 */
const SECOND_HEADER_MAGIC_BYTES = [0x10, 0x5c, 0x18, 0x78, 0x01, 0x06] as const;

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

/** Una capa adicional a la capa "0" del esquema canónico. */
export interface Ac1015MinimalFileLayerSpec {
  readonly name: readonly number[];
  /** Índice de color CmC. Por defecto 7. */
  readonly colorIndex?: number;
}

/** Un bloque de usuario con su contenido. */
export interface Ac1015MinimalFileBlockSpec {
  readonly name: readonly number[];
  readonly entities: readonly DwgGeometryEntity[];
}

/** Una entidad de model space. */
export interface Ac1015MinimalFileEntitySpec {
  readonly entity: DwgGeometryEntity;
  /** 0 = capa "0" (por defecto); 1.. = índice+1 en `layers`. */
  readonly layerIndex?: number;
  /** Sólo INSERT: índice del bloque insertado en `blocks`. */
  readonly insertBlockIndex?: number;
}

export interface Ac1015MinimalFileOptions {
  readonly layers?: readonly Ac1015MinimalFileLayerSpec[];
  readonly blocks?: readonly Ac1015MinimalFileBlockSpec[];
  readonly entities?: readonly Ac1015MinimalFileEntitySpec[];
  /** Variable MEASUREMENT del Template: 0 = inglés (defecto), 1 = métrico. */
  readonly measurement?: 0 | 1;
}

/** El plan determinista de handles de un archivo mínimo. */
export interface Ac1015MinimalFilePlan {
  /** Handle de cada capa: [capa "0", ...capas extra]. */
  readonly layerHandles: readonly number[];
  /** Handle del BLOCK_RECORD de cada bloque de usuario. */
  readonly blockRecordHandles: readonly number[];
  /** Handles de las entidades de model space, en orden de las opciones. */
  readonly modelEntityHandles: readonly number[];
  /** Handles de las entidades de cada bloque, en orden. */
  readonly blockEntityHandles: readonly (readonly number[])[];
  /** El siguiente handle libre: la HANDSEED del archivo. */
  readonly handseed: number;
}

/**
 * Calcula el plan de handles del archivo SIN emitir nada: función pura de
 * las opciones, compartida por el writer y por quien quiera comparar el
 * archivo campo a campo (specs y harness del oráculo externo).
 */
export function planAc1015MinimalFile(
  options: Ac1015MinimalFileOptions = {},
): Ac1015MinimalFilePlan {
  const { layers, blocks, entities } = validateOptions(options);
  let next = H_DYNAMIC_BASE;
  const layerHandles = [H_LAYER_ZERO, ...layers.map(() => next++)];
  const blockRecordHandles: number[] = [];
  const blockEntityHandles: number[][] = [];
  for (const block of blocks) {
    blockRecordHandles.push(next++);
    next++; // BLOCK del bloque
    blockEntityHandles.push(block.entities.map(() => next++));
    next++; // ENDBLK del bloque
  }
  const modelEntityHandles = entities.map(() => next++);
  next += 4; // BLOCK/ENDBLK de model space y de paper space
  return Object.freeze({
    layerHandles: Object.freeze(layerHandles),
    blockRecordHandles: Object.freeze(blockRecordHandles),
    modelEntityHandles: Object.freeze(modelEntityHandles),
    blockEntityHandles: Object.freeze(blockEntityHandles.map((h) => Object.freeze(h))),
    handseed: next,
  });
}

/**
 * Escribe el archivo AC1015 COMPLETO. Determinista: mismas opciones → mismos
 * bytes. El archivo resultante debe abrirse con `readAc1015Database` (el
 * espejo propio) y ese round-trip es la mitad de la evidencia; la otra mitad
 * — el lector AJENO — vive en `scripts/dwg/oda-roundtrip.mjs`.
 */
export function writeAc1015MinimalFile(
  options: Ac1015MinimalFileOptions = {},
): Uint8Array {
  const { layers, blocks, entities, measurement } = validateOptions(options);
  const plan = planAc1015MinimalFile(options);

  // ---- cuerpo de objetos, en orden ESTRICTO de handle -----------------
  const objects: { handle: number; body: Uint8Array }[] = [];
  const push = (handle: number, body: Uint8Array): void => {
    objects.push({ handle, body });
  };

  const modelMarkers = {
    modelBegin: plan.handseed - 4,
    modelEnd: plan.handseed - 3,
    paperBegin: plan.handseed - 2,
    paperEnd: plan.handseed - 1,
  };

  push(
    H_BLOCK_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_BLOCK_CONTROL,
      plan.blockRecordHandles,
      H_BLOCK_CONTROL,
      [
        { code: 3, value: H_MODEL_RECORD },
        { code: 3, value: H_PAPER_RECORD },
      ],
    ),
  );
  push(
    H_LAYER_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_LAYER_CONTROL,
      plan.layerHandles,
      H_LAYER_CONTROL,
    ),
  );
  push(
    H_STYLE_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_STYLE_CONTROL,
      [H_STYLE_STANDARD],
      H_STYLE_CONTROL,
    ),
  );
  push(
    H_LTYPE_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_LTYPE_CONTROL,
      [H_LTYPE_CONTINUOUS],
      H_LTYPE_CONTROL,
      [
        { code: 3, value: H_LTYPE_BYBLOCK },
        { code: 3, value: H_LTYPE_BYLAYER },
      ],
    ),
  );
  push(
    H_VIEW_CONTROL,
    writeAc1015StructTableControlBody(AC1015_TYPE_VIEW_CONTROL, [], H_VIEW_CONTROL),
  );
  push(
    H_UCS_CONTROL,
    writeAc1015StructTableControlBody(AC1015_TYPE_UCS_CONTROL, [], H_UCS_CONTROL),
  );
  push(
    H_VPORT_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_VPORT_CONTROL,
      [H_VPORT_ACTIVE],
      H_VPORT_CONTROL,
    ),
  );
  push(
    H_APPID_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_APPID_CONTROL,
      [H_APPID_ACAD],
      H_APPID_CONTROL,
    ),
  );
  push(
    H_DIMSTYLE_CONTROL,
    writeAc1015StructTableControlBody(
      AC1015_TYPE_DIMSTYLE_CONTROL,
      [H_DIMSTYLE_STANDARD],
      H_DIMSTYLE_CONTROL,
      [],
      1, // el byte extra medido del control de DIMSTYLE
    ),
  );
  push(
    H_VPENT_CONTROL,
    writeAc1015StructTableControlBody(AC1015_TYPE_VPENT_CONTROL, [], H_VPENT_CONTROL),
  );
  push(
    H_NOD,
    writeAc1015DictionaryBody(
      {
        ownerHandle: 0,
        entries: [
          { name: ascii("ACAD_GROUP"), handle: H_GROUP_DICT },
          { name: ascii("ACAD_PLOTSTYLENAME"), handle: H_PLOTSTYLE_DICT },
          { name: ascii("ACAD_MLINESTYLE"), handle: H_MLSTYLE_DICT },
          { name: ascii("ACAD_PLOTSETTINGS"), handle: H_PLOTSETTINGS_DICT },
          { name: ascii("ACAD_LAYOUT"), handle: H_LAYOUTS_DICT },
        ],
      },
      H_NOD,
    ),
  );
  push(
    H_GROUP_DICT,
    writeAc1015DictionaryBody(
      { ownerHandle: H_NOD, reactorHandles: [H_NOD], entries: [] },
      H_GROUP_DICT,
    ),
  );
  push(
    H_PLOTSTYLE_DICT,
    writeAc1015DictionaryBody(
      {
        type: CLASS_TYPE_DICTIONARYWDFLT,
        ownerHandle: H_NOD,
        reactorHandles: [H_NOD],
        entries: [{ name: ascii("Normal"), handle: H_PLACEHOLDER }],
        defaultEntryHandle: H_PLACEHOLDER,
      },
      H_PLOTSTYLE_DICT,
    ),
  );
  push(
    H_PLACEHOLDER,
    writeAc1015PlaceholderBody(CLASS_TYPE_PLACEHOLDER, H_PLOTSTYLE_DICT, H_PLACEHOLDER),
  );
  push(
    H_LAYER_ZERO,
    writeAc1015ResolvedLayerBody(
      {
        name: [0x30], // "0"
        controlHandle: H_LAYER_CONTROL,
        plotStyleHandle: H_PLACEHOLDER,
        linetypeHandle: H_LTYPE_CONTINUOUS,
      },
      H_LAYER_ZERO,
    ),
  );
  push(
    H_STYLE_STANDARD,
    writeAc1015TextStyleBody(
      { name: ascii("Standard"), controlHandle: H_STYLE_CONTROL },
      H_STYLE_STANDARD,
    ),
  );
  push(
    H_APPID_ACAD,
    writeAc1015AppIdBody(
      { name: ascii("ACAD"), controlHandle: H_APPID_CONTROL },
      H_APPID_ACAD,
    ),
  );
  push(
    H_LTYPE_BYBLOCK,
    writeAc1015LinetypeBody(
      { name: ascii("ByBlock"), controlHandle: H_LTYPE_CONTROL },
      H_LTYPE_BYBLOCK,
    ),
  );
  push(
    H_LTYPE_BYLAYER,
    writeAc1015LinetypeBody(
      { name: ascii("ByLayer"), controlHandle: H_LTYPE_CONTROL },
      H_LTYPE_BYLAYER,
    ),
  );
  push(
    H_LTYPE_CONTINUOUS,
    writeAc1015LinetypeBody(
      {
        name: ascii("Continuous"),
        description: ascii("Solid line"),
        controlHandle: H_LTYPE_CONTROL,
      },
      H_LTYPE_CONTINUOUS,
    ),
  );
  push(
    H_MLSTYLE_DICT,
    writeAc1015DictionaryBody(
      {
        ownerHandle: H_NOD,
        reactorHandles: [H_NOD],
        entries: [{ name: ascii("Standard"), handle: H_MLINESTYLE }],
      },
      H_MLSTYLE_DICT,
    ),
  );
  push(
    H_MLINESTYLE,
    writeAc1015MlineStyleBody(
      { name: ascii("Standard"), dictionaryHandle: H_MLSTYLE_DICT },
      H_MLINESTYLE,
    ),
  );
  push(
    H_PLOTSETTINGS_DICT,
    writeAc1015DictionaryBody(
      { ownerHandle: H_NOD, reactorHandles: [H_NOD], entries: [] },
      H_PLOTSETTINGS_DICT,
    ),
  );
  push(
    H_LAYOUTS_DICT,
    writeAc1015DictionaryBody(
      {
        ownerHandle: H_NOD,
        reactorHandles: [H_NOD],
        entries: [
          { name: ascii("Layout1"), handle: H_PAPER_LAYOUT },
          { name: ascii("Model"), handle: H_MODEL_LAYOUT },
        ],
      },
      H_LAYOUTS_DICT,
    ),
  );
  push(
    H_PAPER_RECORD,
    writeAc1015StructBlockRecordBody(
      {
        name: ascii("*Paper_Space"),
        controlHandle: H_BLOCK_CONTROL,
        blockEntityHandle: modelMarkers.paperBegin,
        endblkHandle: modelMarkers.paperEnd,
        layoutHandle: H_PAPER_LAYOUT,
      },
      H_PAPER_RECORD,
    ),
  );
  push(
    H_PAPER_LAYOUT,
    writeAc1015LayoutBody(
      {
        type: CLASS_TYPE_LAYOUT,
        name: ascii("Layout1"),
        tabOrder: 1,
        layoutsDictionaryHandle: H_LAYOUTS_DICT,
        blockRecordHandle: H_PAPER_RECORD,
        profile: "paper",
      },
      H_PAPER_LAYOUT,
    ),
  );
  push(
    H_MODEL_RECORD,
    writeAc1015StructBlockRecordBody(
      {
        name: ascii("*Model_Space"),
        controlHandle: H_BLOCK_CONTROL,
        blockEntityHandle: modelMarkers.modelBegin,
        ...(plan.modelEntityHandles.length === 0
          ? {}
          : {
              firstEntityHandle: plan.modelEntityHandles[0]!,
              lastEntityHandle:
                plan.modelEntityHandles[plan.modelEntityHandles.length - 1]!,
            }),
        endblkHandle: modelMarkers.modelEnd,
        layoutHandle: H_MODEL_LAYOUT,
      },
      H_MODEL_RECORD,
    ),
  );
  push(
    H_MODEL_LAYOUT,
    writeAc1015LayoutBody(
      {
        type: CLASS_TYPE_LAYOUT,
        name: ascii("Model"),
        tabOrder: 0,
        layoutsDictionaryHandle: H_LAYOUTS_DICT,
        blockRecordHandle: H_MODEL_RECORD,
        profile: "model",
      },
      H_MODEL_LAYOUT,
    ),
  );
  push(
    H_DIMSTYLE_STANDARD,
    writeAc1015DimStyleBody(
      {
        name: ascii("Standard"),
        controlHandle: H_DIMSTYLE_CONTROL,
        textStyleHandle: H_STYLE_STANDARD,
      },
      H_DIMSTYLE_STANDARD,
    ),
  );
  push(
    H_VPORT_ACTIVE,
    writeAc1015VportBody(
      { name: ascii("*Active"), controlHandle: H_VPORT_CONTROL },
      H_VPORT_ACTIVE,
    ),
  );

  // ---- dinámicos: capas extra, bloques de usuario, entidades, marcadores --
  layers.forEach((layer, index) => {
    push(
      plan.layerHandles[index + 1]!,
      writeAc1015ResolvedLayerBody(
        {
          name: layer.name,
          ...(layer.colorIndex === undefined ? {} : { colorIndex: layer.colorIndex }),
          controlHandle: H_LAYER_CONTROL,
          plotStyleHandle: H_PLACEHOLDER,
          linetypeHandle: H_LTYPE_CONTINUOUS,
        },
        plan.layerHandles[index + 1]!,
      ),
    );
  });

  blocks.forEach((block, index) => {
    const recordHandle = plan.blockRecordHandles[index]!;
    const beginHandle = recordHandle + 1;
    const contentHandles = plan.blockEntityHandles[index]!;
    const endHandle =
      contentHandles.length === 0
        ? beginHandle + 1
        : contentHandles[contentHandles.length - 1]! + 1;
    push(
      recordHandle,
      writeAc1015StructBlockRecordBody(
        {
          name: block.name,
          controlHandle: H_BLOCK_CONTROL,
          blockEntityHandle: beginHandle,
          ...(contentHandles.length === 0
            ? {}
            : {
                firstEntityHandle: contentHandles[0]!,
                lastEntityHandle: contentHandles[contentHandles.length - 1]!,
              }),
          endblkHandle: endHandle,
        },
        recordHandle,
      ),
    );
    push(
      beginHandle,
      writeAc1015StructBlockBeginBody(
        {
          name: block.name,
          mode: 0,
          ownerBlockRecordHandle: recordHandle,
          layerHandle: H_LAYER_ZERO,
        },
        beginHandle,
      ),
    );
    block.entities.forEach((entity, entityIndex) => {
      push(
        contentHandles[entityIndex]!,
        writeAc1015ResolvedEntityBody(entity, contentHandles[entityIndex]!, {
          ownerBlockHandle: recordHandle,
          layerHandle: H_LAYER_ZERO,
          chainPosition: chainPositionFor(entityIndex, contentHandles.length),
          ...(entity.kind === "text" ? { textStyleHandle: H_STYLE_STANDARD } : {}),
        }),
      );
    });
    push(
      endHandle,
      writeAc1015StructBlockEndBody(
        { mode: 0, ownerBlockRecordHandle: recordHandle, layerHandle: H_LAYER_ZERO },
        endHandle,
      ),
    );
  });

  entities.forEach((spec, index) => {
    const handle = plan.modelEntityHandles[index]!;
    const layerHandle = plan.layerHandles[spec.layerIndex ?? 0]!;
    push(
      handle,
      writeAc1015ResolvedEntityBody(spec.entity, handle, {
        layerHandle,
        chainPosition: chainPositionFor(index, entities.length),
        ...(spec.entity.kind === "text" ? { textStyleHandle: H_STYLE_STANDARD } : {}),
        ...(spec.insertBlockIndex === undefined
          ? {}
          : { insertBlockHandle: plan.blockRecordHandles[spec.insertBlockIndex]! }),
      }),
    );
  });

  push(
    modelMarkers.modelBegin,
    writeAc1015StructBlockBeginBody(
      { name: ascii("*Model_Space"), mode: 2, layerHandle: H_LAYER_ZERO },
      modelMarkers.modelBegin,
    ),
  );
  push(
    modelMarkers.modelEnd,
    writeAc1015StructBlockEndBody(
      { mode: 2, layerHandle: H_LAYER_ZERO },
      modelMarkers.modelEnd,
    ),
  );
  push(
    modelMarkers.paperBegin,
    writeAc1015StructBlockBeginBody(
      { name: ascii("*Paper_Space"), mode: 1, layerHandle: H_LAYER_ZERO },
      modelMarkers.paperBegin,
    ),
  );
  push(
    modelMarkers.paperEnd,
    writeAc1015StructBlockEndBody(
      { mode: 1, layerHandle: H_LAYER_ZERO },
      modelMarkers.paperEnd,
    ),
  );

  if (objects.length > AC1015_WRITER_MAX_OBJECTS) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The minimal file exceeds the laboratory object limit.",
    );
  }
  for (let index = 1; index < objects.length; index += 1) {
    if (objects[index]!.handle <= objects[index - 1]!.handle) {
      throwDwgError(
        "DWG_INTERNAL_ERROR",
        "internal",
        0,
        "The minimal file writer produced a non-increasing handle order.",
      );
    }
  }

  // ---- secciones ------------------------------------------------------
  const baseVariables = createAc1015HeaderVariables();
  const variables: Ac1015HeaderVariables = Object.freeze({
    ...baseVariables,
    handles: Object.freeze({
      ...baseVariables.handles,
      handseed: Object.freeze({
        code: 0,
        value: plan.handseed,
        byteLength: byteLengthOf(plan.handseed),
      }),
    }),
  });
  const variablesFrame = buildAc1015SectionFrame(
    AC1015_HEADER_VARIABLES_SENTINELS,
    encodeAc1015HeaderVariables(variables),
  );
  const classesFrame = buildAc1015SectionFrame(
    AC1015_CLASSES_SENTINELS,
    buildClassesPayload(),
  );

  const variablesStart = HEADER_VARIABLES_START;
  const classesStart = variablesStart + variablesFrame.length;
  const objectsStart = classesStart + classesFrame.length + POST_CLASSES_PADDING;

  const envelopes = objects.map((object) => wrapAc1015ObjectBody(object.body));
  const mapEntries: Ac1015ObjectMapEntry[] = [];
  let offset = objectsStart;
  objects.forEach((object, index) => {
    mapEntries.push(Object.freeze({ handle: object.handle, offset }));
    offset += envelopes[index]!.length;
  });
  const objectMapStart = offset;
  const objectMapBytes = buildAc1015ObjectMapSection(mapEntries);

  const objFreeStart = objectMapStart + objectMapBytes.length;
  const objFreeBytes = buildObjFreeSpace(objects.length, objectsStart);
  const secondHeaderStart = objFreeStart + objFreeBytes.length;
  const secondHeaderBytes = buildSecondHeader(secondHeaderStart, {
    headerVariables: { start: variablesStart, size: variablesFrame.length },
    classes: { start: classesStart, size: classesFrame.length },
    objectMap: { start: objectMapStart, size: objectMapBytes.length },
    objFreeSpace: { start: objFreeStart, size: objFreeBytes.length },
    handseed: plan.handseed,
  });
  const templateStart = secondHeaderStart + secondHeaderBytes.length;
  const templateBytes = Uint8Array.from([0, 0, measurement & 0xff, (measurement >> 8) & 0xff]);
  const fileLength = templateStart + templateBytes.length;

  // ---- cabecera de archivo con los SEIS registros ----------------------
  const head: number[] = [];
  head.push(...AC1015_MAGIC);
  head.push(0, 0, 0, 0, 0);
  head.push(MAINTENANCE_VERSION);
  head.push(0x01);
  pushUint32LE(head, PREVIEW_START);
  head.push(0, 0); // versión/mantenimiento de la aplicación escritora propia
  pushUint16LE(head, DRAWING_CODEPAGE);
  pushUint32LE(head, 6);
  pushRecord(head, 0, variablesStart, variablesFrame.length);
  pushRecord(head, 1, classesStart, classesFrame.length);
  pushRecord(head, 2, objectMapStart, objectMapBytes.length);
  pushRecord(head, 3, objFreeStart, objFreeBytes.length);
  pushRecord(head, 4, templateStart, templateBytes.length);
  pushRecord(head, 5, AUX_HEADER_START, AUX_HEADER_LENGTH);
  pushUint16LE(head, crc16Dwg(Uint8Array.from(head), 0xc0c1));
  head.push(...AC1015_FILE_HEADER_END_SENTINEL);
  if (head.length !== FILE_HEADER_LENGTH) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      head.length,
      "The minimal file writer produced a header of unexpected length.",
    );
  }

  // ---- ensamblado ------------------------------------------------------
  const file = new Uint8Array(fileLength);
  file.set(Uint8Array.from(head), 0);
  file.set(buildAuxHeader(plan.handseed), AUX_HEADER_START);
  file.set(buildPreviewBlob(), PREVIEW_START);
  file.set(variablesFrame, variablesStart);
  file.set(classesFrame, classesStart);
  // el relleno pos-clases queda a cero (el Uint8Array nace a cero)
  let cursor = objectsStart;
  for (const envelope of envelopes) {
    file.set(envelope, cursor);
    cursor += envelope.length;
  }
  file.set(objectMapBytes, objectMapStart);
  file.set(objFreeBytes, objFreeStart);
  file.set(secondHeaderBytes, secondHeaderStart);
  file.set(templateBytes, templateStart);
  return file;
}

// ---------------------------------------------------------------------------
// Secciones auxiliares
// ---------------------------------------------------------------------------

/** Las tres clases mínimas del archivo (capítulo 10; valores medidos). */
function buildClassesPayload(): Uint8Array {
  const emitter = new DwgBitEmitter();
  const appName = ascii("ObjectDBX Classes");
  const emitClass = (
    classnum: number,
    cppName: string,
    dxfName: string,
  ): void => {
    emitter.emitBS(classnum);
    emitter.emitBS(0); // versión/banderas proxy (0 medido en estas tres)
    emitter.emitTV(appName);
    emitter.emitTV(ascii(cppName));
    emitter.emitTV(ascii(dxfName));
    emitter.pushBit(0); // wasazombie
    emitter.emitBS(0x1f3); // itemclassid: clase que produce OBJETOS
  };
  emitClass(CLASS_TYPE_DICTIONARYWDFLT, "AcDbDictionaryWithDefault", "ACDBDICTIONARYWDFLT");
  emitClass(CLASS_TYPE_PLACEHOLDER, "AcDbPlaceHolder", "ACDBPLACEHOLDER");
  emitClass(CLASS_TYPE_LAYOUT, "AcDbLayout", "LAYOUT");
  return emitter.toBytes();
}

/** AuxHeader (capítulo 27): 123 bytes, campo a campo con los valores medidos. */
function buildAuxHeader(handseed: number): Uint8Array {
  const out: number[] = [];
  out.push(0xff, 0x77, 0x01);
  pushUint16LE(out, 23); // versión DWG: AC1015
  pushUint16LE(out, MAINTENANCE_VERSION);
  pushUint32LE(out, 1); // número de guardados
  pushUint32LE(out, 0xffffffff);
  pushUint16LE(out, 1); // guardados, parte 1
  pushUint16LE(out, 0); // guardados, parte 2
  pushUint32LE(out, 0);
  pushUint16LE(out, 23);
  pushUint16LE(out, MAINTENANCE_VERSION);
  pushUint16LE(out, 23);
  pushUint16LE(out, MAINTENANCE_VERSION);
  pushUint16LE(out, 0x0005);
  pushUint16LE(out, 0x0893);
  pushUint16LE(out, 0x0005);
  pushUint16LE(out, 0x0893);
  pushUint16LE(out, 0x0000);
  pushUint16LE(out, 0x0001);
  for (let index = 0; index < 5; index += 1) pushUint32LE(out, 0);
  pushUint32LE(out, TDCREATE[0]);
  pushUint32LE(out, TDCREATE[1]);
  pushUint32LE(out, TDUPDATE[0]);
  pushUint32LE(out, TDUPDATE[1]);
  pushUint32LE(out, handseed <= 0x7fffffff ? handseed : 0xffffffff);
  pushUint32LE(out, 0); // sello de plot educativo
  pushUint16LE(out, 0);
  pushUint16LE(out, 1); // parte 1 − parte 2
  pushUint32LE(out, 0);
  pushUint32LE(out, 0);
  pushUint32LE(out, 0);
  pushUint32LE(out, 1); // número de guardados
  for (let index = 0; index < 4; index += 1) pushUint32LE(out, 0);
  if (out.length !== AUX_HEADER_LENGTH) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      out.length,
      "The aux header emitter produced an unexpected length.",
    );
  }
  return Uint8Array.from(out);
}

/** Previsualización mínima (capítulo 8): sin imágenes, 37 bytes medidos. */
function buildPreviewBlob(): Uint8Array {
  const out: number[] = [...PREVIEW_BEGIN_SENTINEL];
  pushUint32LE(out, 1); // tamaño del área: sólo el contador
  out.push(0); // cero imágenes
  out.push(...PREVIEW_BEGIN_SENTINEL.map((byte) => byte ^ 0xff));
  if (out.length !== PREVIEW_LENGTH) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      out.length,
      "The preview emitter produced an unexpected length.",
    );
  }
  return Uint8Array.from(out);
}

/** ObjFreeSpace (capítulo 21): 53 bytes con los valores que escribe la ODA. */
function buildObjFreeSpace(objectCount: number, objectsStart: number): Uint8Array {
  const out: number[] = [];
  pushUint32LE(out, 0);
  pushUint32LE(out, objectCount);
  pushUint32LE(out, TDUPDATE[0]);
  pushUint32LE(out, TDUPDATE[1]);
  pushUint32LE(out, objectsStart);
  out.push(4); // cuatro valores de 64 bits a continuación
  for (const value of [0x32, 0x64, 0x200, 0xffffffff]) {
    pushUint32LE(out, value);
    pushUint32LE(out, 0);
  }
  if (out.length !== 53) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      out.length,
      "The ObjFreeSpace emitter produced an unexpected length.",
    );
  }
  return Uint8Array.from(out);
}

interface SecondHeaderExtent {
  readonly start: number;
  readonly size: number;
}

interface SecondHeaderInput {
  readonly headerVariables: SecondHeaderExtent;
  readonly classes: SecondHeaderExtent;
  readonly objectMap: SecondHeaderExtent;
  readonly objFreeSpace: SecondHeaderExtent;
  readonly handseed: number;
}

/**
 * SECOND FILE HEADER (capítulo 26 + medición bit a bit del corpus): flujo de
 * bits entre centinelas, con la localización y los localizadores como BL en
 * forma RL FORZADA (válida para cualquier lector y alineada a byte para los
 * registros de handle), los seis bytes medidos tras el mantenimiento, los
 * registros extra {4: 0,1} y {5: AuxHeader}, los 14 registros de handle y el
 * CRC 0xC0C1 desde el campo de tamaño, más los 8 bytes de cola a cero.
 */
function buildSecondHeader(
  location: number,
  input: SecondHeaderInput,
): Uint8Array {
  const handleRecords: readonly { id: number; value: number }[] = [
    { id: 0, value: input.handseed },
    { id: 1, value: H_BLOCK_CONTROL },
    { id: 2, value: H_LAYER_CONTROL },
    { id: 3, value: H_STYLE_CONTROL },
    { id: 4, value: H_LTYPE_CONTROL },
    { id: 5, value: H_VIEW_CONTROL },
    { id: 6, value: H_UCS_CONTROL },
    { id: 7, value: H_VPORT_CONTROL },
    { id: 8, value: H_APPID_CONTROL },
    { id: 9, value: H_DIMSTYLE_CONTROL },
    { id: 10, value: H_VPENT_CONTROL },
    { id: 11, value: H_NOD },
    { id: 12, value: H_MLSTYLE_DICT },
    { id: 13, value: H_GROUP_DICT },
  ];
  const recordsBytes = handleRecords.reduce(
    (total, record) => total + 2 + Math.max(1, byteLengthOf(record.value)),
    0,
  );
  // 85 bytes fijos hasta el final del recuento BS(14) con los BL en forma RL.
  const PRE_RECORDS_BYTES = 85;
  const sectionSize = PRE_RECORDS_BYTES + recordsBytes + 2 + 8;

  const emitter = new DwgBitEmitter();
  emitter.emitRL(sectionSize);
  emitForcedLongBL(emitter, location);
  for (const byte of AC1015_MAGIC) emitter.emitRC(byte);
  for (let index = 0; index < 5; index += 1) emitter.emitRC(0);
  emitter.emitRC(MAINTENANCE_VERSION);
  emitter.pushBits(0, 4);
  for (const byte of SECOND_HEADER_MAGIC_BYTES) emitter.emitRC(byte);
  const locators: readonly { id: number; start: number; size: number }[] = [
    { id: 0, ...input.headerVariables },
    { id: 1, ...input.classes },
    { id: 2, ...input.objectMap },
    { id: 3, ...input.objFreeSpace },
    { id: 4, start: 0, size: 1 }, // registro extra medido (semántica sin nombrar)
    { id: 5, start: AUX_HEADER_START, size: AUX_HEADER_LENGTH },
  ];
  for (const locator of locators) {
    emitter.emitRC(locator.id);
    emitForcedLongBL(emitter, locator.start);
    emitForcedLongBL(emitter, locator.size);
  }
  emitter.emitBS(handleRecords.length);
  if (emitter.bitLength !== PRE_RECORDS_BYTES * 8) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      emitter.bitLength,
      "The second header prefix is not byte aligned as designed.",
    );
  }
  for (const record of handleRecords) {
    const bytes = handleValueBytes(record.value);
    emitter.emitRC(bytes.length);
    emitter.emitRC(record.id);
    for (const byte of bytes) emitter.emitRC(byte);
  }
  const crc = crc16Dwg(emitter.toBytes(), 0xc0c1);
  emitter.emitRS(crc);
  for (let index = 0; index < 8; index += 1) emitter.emitRC(0);

  const body = emitter.toBytes();
  if (body.length !== sectionSize) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      body.length,
      "The second header body does not match its declared size.",
    );
  }
  const out = new Uint8Array(16 + body.length + 16);
  out.set(Uint8Array.from(SECOND_HEADER_BEGIN_SENTINEL), 0);
  out.set(body, 16);
  out.set(Uint8Array.from(SECOND_HEADER_END_SENTINEL), 16 + body.length);
  return out;
}

/** BL en forma larga forzada: bandera 00 + RL (válida para todo lector). */
function emitForcedLongBL(emitter: DwgBitEmitter, value: number): void {
  emitter.pushBits(0b00, 2);
  emitter.emitRL(value);
}

/**
 * Posición en la cadena de entidades de un espacio o bloque: el lector ajeno
 * RECORRE la lista enlazada desde el `first` del BLOCK_RECORD, así que cada
 * entidad declara su lugar (hecho verificado contra el oráculo el 2026-08-21:
 * con punteros nulos sólo sobrevivía la primera entidad de cada cadena).
 */
function chainPositionFor(
  index: number,
  total: number,
): "isolated" | "first" | "middle" | "last" {
  if (total <= 1) return "isolated";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Bytes big-endian mínimos de un handle; el 0 viaja como un byte a cero. */
function handleValueBytes(value: number): number[] {
  if (value === 0) return [0];
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0) {
    bytes.unshift(rest % 0x100);
    rest = Math.floor(rest / 0x100);
  }
  return bytes;
}

function byteLengthOf(value: number): number {
  let length = 0;
  let rest = value;
  while (rest > 0) {
    length += 1;
    rest = Math.floor(rest / 0x100);
  }
  return length;
}

// ---------------------------------------------------------------------------
// Validación de opciones (fallo cerrado)
// ---------------------------------------------------------------------------

interface ValidatedOptions {
  readonly layers: readonly Ac1015MinimalFileLayerSpec[];
  readonly blocks: readonly Ac1015MinimalFileBlockSpec[];
  readonly entities: readonly Ac1015MinimalFileEntitySpec[];
  readonly measurement: 0 | 1;
}

function validateOptions(options: Ac1015MinimalFileOptions): ValidatedOptions {
  if (typeof options !== "object" || options === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The minimal file options must be an object.",
    );
  }
  const layers = options.layers ?? [];
  const blocks = options.blocks ?? [];
  const entities = options.entities ?? [];
  const measurement = options.measurement ?? 0;
  if (!Array.isArray(layers) || !Array.isArray(blocks) || !Array.isArray(entities)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The minimal file layers, blocks and entities must be arrays.",
    );
  }
  if (measurement !== 0 && measurement !== 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The MEASUREMENT variable must be 0 (English) or 1 (metric).",
    );
  }
  for (const layer of layers) {
    assertNameBytes(layer.name, "A minimal file layer name");
  }
  for (const block of blocks) {
    assertNameBytes(block.name, "A minimal file block name");
    if (!Array.isArray(block.entities)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A minimal file block needs an entities array.",
      );
    }
    for (const entity of block.entities) {
      if (entity.kind === "insert") {
        // Un INSERT dentro de un bloque exigiría resolver el bloque anidado;
        // pendiente DECLARADO de esta ola — fallo cerrado, no silencio.
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "An INSERT inside a block definition is not supported by this wave.",
        );
      }
    }
  }
  entities.forEach((spec) => {
    const layerIndex = spec.layerIndex ?? 0;
    if (
      !Number.isInteger(layerIndex) ||
      layerIndex < 0 ||
      layerIndex > layers.length
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A minimal file entity layer index escapes the declared layers.",
      );
    }
    if (spec.entity.kind === "insert") {
      const blockIndex = spec.insertBlockIndex;
      if (
        blockIndex === undefined ||
        !Number.isInteger(blockIndex) ||
        blockIndex < 0 ||
        blockIndex >= blocks.length
      ) {
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "An INSERT entity needs the index of a declared block.",
        );
      }
    } else if (spec.insertBlockIndex !== undefined) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Only an INSERT entity may name an inserted block.",
      );
    }
  });
  return { layers, blocks, entities, measurement };
}

function assertNameBytes(name: readonly number[], what: string): void {
  if (!Array.isArray(name) || name.length < 1 || name.length > 0xff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} needs between 1 and 255 byte values.`,
    );
  }
  for (const byte of name) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `${what} must hold byte values between 0 and 255.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Primitivas de bytes little-endian del ensamblado
// ---------------------------------------------------------------------------

function pushUint16LE(into: number[], value: number): void {
  into.push(value & 0xff, (value >> 8) & 0xff);
}

function pushUint32LE(into: number[], value: number): void {
  into.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function pushRecord(into: number[], id: number, start: number, size: number): void {
  into.push(id & 0xff);
  pushUint32LE(into, start);
  pushUint32LE(into, size);
}
