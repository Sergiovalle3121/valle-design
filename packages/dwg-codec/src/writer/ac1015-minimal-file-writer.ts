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
import { encodeLayerStateFlags } from "../objects/layer-state.js";
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
  writeAc1015StructTableControlBody,
  writeAc1015TextStyleBody,
  writeAc1015VportBody,
} from "./ac1015-structure-writers.js";
import {
  writeAc1015ResolvedEntityBody,
  writeAc1015ResolvedLayerBody,
  writeAc1015StructBlockBeginBody,
  writeAc1015StructBlockEndBody,
  writeAc1015StructBlockRecordBody,
} from "./ac1015-resolved-writers.js";
import { DwgBitEmitter } from "./dwg-bit-emitter.js";


import {
  ascii,
  AUX_HEADER_LENGTH,
  AUX_HEADER_START,
  buildAuxHeader,
  buildClassesPayload,
  buildObjFreeSpace,
  buildPreviewBlob,
  buildSecondHeader,
  byteLengthOf,
  CLASS_TYPE_DICTIONARYWDFLT,
  CLASS_TYPE_LAYOUT,
  CLASS_TYPE_PLACEHOLDER,
  DRAWING_CODEPAGE,
  FILE_HEADER_LENGTH,
  H_APPID_ACAD,
  H_APPID_CONTROL,
  H_BLOCK_CONTROL,
  H_DIMSTYLE_CONTROL,
  H_DIMSTYLE_STANDARD,
  H_DYNAMIC_BASE,
  H_GROUP_DICT,
  H_LAYER_CONTROL,
  H_LAYER_ZERO,
  H_LAYOUTS_DICT,
  H_LTYPE_BYBLOCK,
  H_LTYPE_BYLAYER,
  H_LTYPE_CONTINUOUS,
  H_LTYPE_CONTROL,
  H_MLINESTYLE,
  H_MLSTYLE_DICT,
  H_MODEL_LAYOUT,
  H_MODEL_RECORD,
  H_NOD,
  H_PAPER_LAYOUT,
  H_PAPER_RECORD,
  H_PLACEHOLDER,
  H_PLOTSETTINGS_DICT,
  H_PLOTSTYLE_DICT,
  H_STYLE_CONTROL,
  H_STYLE_STANDARD,
  H_UCS_CONTROL,
  H_VIEW_CONTROL,
  H_VPENT_CONTROL,
  H_VPORT_ACTIVE,
  H_VPORT_CONTROL,
  HEADER_VARIABLES_START,
  MAINTENANCE_VERSION,
  POST_CLASSES_PADDING,
  PREVIEW_LENGTH,
  PREVIEW_START,
  pushRecord,
  pushUint16LE,
  pushUint32LE,
  validateOptions,
} from "./ac1015-minimal-file-support.js";

// ---------------------------------------------------------------------------
// Opciones — los tipos públicos viven en `ac1015-minimal-file-support.ts`
// (presupuesto de 800 líneas del monorepo) y se re-exportan aquí tal cual,
// para que nada que ya importe de este módulo note el traslado.
// ---------------------------------------------------------------------------
export type {
  Ac1015MinimalFileBlockEntityInput,
  Ac1015MinimalFileBlockSpec,
  Ac1015MinimalFileEntitySpec,
  Ac1015MinimalFileLayerSpec,
  Ac1015MinimalFileOptions,
  Ac1015MinimalFilePlan,
} from "./ac1015-minimal-file-support.js";
import type {
  Ac1015MinimalFileBlockSpec,
  Ac1015MinimalFileEntitySpec,
  Ac1015MinimalFileLayerSpec,
  Ac1015MinimalFileOptions,
  Ac1015MinimalFilePlan,
} from "./ac1015-minimal-file-support.js";

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
          // EL ESTADO SE ESCRIBE DESDE EL 2026-09-01. Antes no se pasaba nunca,
          // así que caía al 1008 por defecto y TODA capa exportada salía
          // descongelada y desbloqueada: un round-trip perdía los dos hechos
          // sin declararlos. El criterio es el mismo que los lee.
          stateFlags: encodeLayerStateFlags(layer),
          controlHandle: H_LAYER_CONTROL,
          plotStyleHandle: H_PLACEHOLDER,
          // ESTE ARCHIVO SÓLO TIENE UNA ENTRADA LTYPE. Apuntar aquí a
          // Continuous no es una elección: es la única que existe. Que eso sea
          // una PÉRDIDA cuando el dibujo pedía otra cosa lo declara el llamador
          // público, que es quien sabe qué pedía el documento.
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
    block.entities.forEach((spec, entityIndex) => {
      const layerHandle = plan.layerHandles[spec.layerIndex ?? 0]!;
      push(
        contentHandles[entityIndex]!,
        writeAc1015ResolvedEntityBody(spec.entity, contentHandles[entityIndex]!, {
          ownerBlockHandle: recordHandle,
          layerHandle,
          chainPosition: chainPositionFor(entityIndex, contentHandles.length),
          ...(spec.entity.kind === "text" ? { textStyleHandle: H_STYLE_STANDARD } : {}),
          ...(spec.insertBlockIndex === undefined
            ? {}
            : { insertBlockHandle: plan.blockRecordHandles[spec.insertBlockIndex]! }),
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

function chainPositionFor(
  index: number,
  total: number,
): "isolated" | "first" | "middle" | "last" {
  if (total <= 1) return "isolated";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

