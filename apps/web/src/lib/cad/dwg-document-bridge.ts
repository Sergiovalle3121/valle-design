/**
 * El puente entre la base de datos neutral DWG y el documento canónico.
 *
 * POR QUÉ EXISTE HOY, CON LA PUERTA CERRADA. El laboratorio clean-room ya
 * ensambla una base neutral —capas, bloques con contenido, entidades de model
 * space y los tipos que aún no decodifica, ENUMERADOS— y el producto tiene un
 * documento canónico maduro. Lo único que faltaba entre los dos era este
 * mapeo, y escribirlo no requiere ninguna firma: mapear una estructura de datos
 * a otra no lee un solo byte de DWG y no habilita nada. Lo que sí requiere
 * firma —decodificar bytes de un archivo real— vive detrás del gate y hoy está
 * cerrado.
 *
 * LA SEPARACIÓN ES DELIBERADA, y es lo que permite que esto esté PROBADO hoy:
 *
 * - `dwgNeutralDatabaseToCadDocument` es PURA y siempre invocable (no
 *   decodifica bytes, no habilita nada). No siempre tiene éxito: si el
 *   mapeo no produce ni una entidad ni un bloque falla cerrado, igual que ya
 *   hacen DXF y shapefile — un documento vacío "exitoso" sería el peor tipo
 *   de fallo. Sus specs corren contra estructuras sintéticas y demuestran el
 *   mapeo entero.
 * - `importDwgDocumentBytes` es la única que tocaría bytes, y falla cerrado
 *   mientras el gate no esté abierto. Hoy falla siempre.
 *
 * Sin esa separación el puente sería código muerto sin evidencia ejecutable, y
 * en este repositorio nada cuenta sin evidencia ejecutable.
 *
 * CÓMO MAPEA. No inventa un segundo mapeo canónico: traduce la geometría
 * neutral a los mismos intermedios que el importador DXF ya usa —la
 * primitiva plana para geometría simple, y `CadDxfMText`/
 * `CadDxfSemanticDimension`/`CadDxfHatch` para las tres que no caben en una
 * primitiva— y delega en `cadDxfPrimitivesToCanonicalEntities`,
 * `cadDxfBlocksToCadDocumentParts` y sus tres análogos
 * (`cadDxfMTextsToNativeEntities` y compañía), que están probados y son los
 * que producen entidades canónicas de verdad. Un segundo camino hacia
 * `CadEntity` sería un segundo conjunto de errores.
 *
 * LO QUE SE PIERDE SE DECLARA. Los nombres y los textos viajan como BYTES en la
 * página de códigos del dibujo, que el límite binario no interpreta a propósito.
 * El puente los lee como Latin-1 —lo único que puede hacer sin adivinar— y
 * anota una pérdida por cada uno. Un acento mal leído que nadie declara es peor
 * que un acento mal leído que aparece en el informe.
 *
 * No importa nada del laboratorio: el guardián `check:dwg` debe seguir contando
 * cero importaciones en runtime. Los tipos son el espejo estructural de
 * `dwg-neutral-model`.
 */
import {
  layoutToCadDocument,
  migrateCadDocument,
  type CadEntity,
  type CadLayerDef,
  type CadLossManifestEntry,
  type CadOpaqueEntity,
} from "./cad-document";
import { MAX_DWG_IMPORT_BYTES, type DocumentImportReport } from "./document-import";
// Tabla ACI↔RGB real y ya usada por el resto del producto (plotting); el
// laboratorio deja dicho en su propio mapeo canónico que "la tabla ACI
// completa es del adaptador de integración" — este archivo es ese adaptador.
import { aciToHex } from "./plot/aci-palette";
import {
  cadDxfBlocksToCadDocumentParts,
  cadDxfHatchesToNativeEntities,
  cadDxfMTextsToNativeEntities,
  cadDxfPrimitivesToCanonicalEntities,
  cadDxfSemanticDimensionsToNativeEntities,
} from "./dxf-cad-document";
import type {
  CadDxfHatch,
  CadDxfMText,
  CadDxfPrimitive,
  CadDxfSemanticBlock,
  CadDxfSemanticDimension,
  CadDxfSemanticInsert,
} from "./dxf-import";
// Mapeo por entidad (extraído por presupuesto de monolito, Fase 3): las
// funciones puras que traducen UNA entidad ya viven ahí; reexportadas más
// abajo para que specs y consumidores existentes no cambien su import.
import {
  decodeCodePageBytes,
  degrees,
  droppedLwPolylineProperties,
  droppedTextProperties,
  dwgDimensionToCadDxfSemanticDimension,
  dwgGeometryToPrimitive,
  dwgHatchToCadDxfHatch,
  dwgMTextToCadDxfMText,
  dwgWireframe3dGeometryToOpaquePayload,
  point2,
  type DwgWireframe3dOpaquePayload,
} from "./dwg-document-bridge-primitives";
import {
  DWG_IMPORT_DISABLED_REASON,
  dwgImportIsEnabled,
  dwgPromotionBlockers,
  type DwgPromotionGates,
} from "./dwg-interop-flag";
import type {
  DwgNeutralBlock,
  DwgNeutralDatabase,
  DwgNeutralDatabaseReader,
  DwgNeutralEntityRecord,
  DwgNeutralLayer,
} from "./dwg-neutral-model";

/** Códigos de pérdida del puente. Estables: la interfaz los agrupa por código. */
export const DWG_BRIDGE_LOSS_CODES = Object.freeze({
  codePage: "dwg_codepage_undecoded",
  unsupportedObject: "dwg_unsupported_object",
  diagnostic: "dwg_decoder_diagnostic",
  danglingLayer: "dwg_layer_handle_unresolved",
  danglingBlock: "dwg_insert_block_unresolved",
  hatchCurvedBoundary: "dwg_hatch_curved_boundary_dropped",
  layerStateFlags: "dwg_layer_state_flags_unmapped",
  unitAssumed: "dwg_unit_assumed",
  blockBasePointAssumed: "dwg_block_base_point_assumed",
  primitiveProperty: "dwg_primitive_property_dropped",
  // Perfil 3D heredado propuesto (ADR-0009 §9): geometría REAL, con Z
  // verdadera, conservada en `unsupportedEntities` porque el editor 2D/3D
  // todavía no la dibuja — nunca "no decodificada", el laboratorio la lee
  // completa (ver el adaptador autorizado corriente arriba de este puente).
  wireframe3dPreservedOpaque: "dwg_3d_wireframe_preserved_opaque",
});

/**
 * INSUNITS (variables de cabecera, capítulo 9) → unidad del documento
 * canónico. La semántica del entero es del propio sistema de variables de
 * AutoCAD (pública, la misma para DXF y DWG) — no un hecho de la capa
 * binaria. Sólo se listan las cinco unidades que el documento canónico sabe
 * representar hoy (`UNIT_TO_MM` en `associative-dimension.ts`): el resto
 * (0=sin unidad, millas, kilómetros, unidades astronómicas…) es capacidad
 * ausente de este perfil de producto, y `resolveDwgUnit` devuelve
 * `undefined` para que la pérdida se declare en vez de inventar una unidad.
 */
const INSUNITS_TO_CAD_UNIT: Readonly<Record<number, string>> = Object.freeze({
  1: "in",
  2: "ft",
  4: "mm",
  5: "cm",
  6: "m",
});

function resolveDwgUnit(insunits: number): string | undefined {
  return INSUNITS_TO_CAD_UNIT[insunits];
}

/** Error tipado del puente: nunca un `Error` genérico, nunca un éxito a medias. */
export class DwgBridgeError extends Error {
  readonly code: "DWG_IMPORT_DISABLED" | "DWG_NO_DECODER" | "DWG_INPUT_REJECTED";
  readonly blockers: readonly string[];

  constructor(
    code: "DWG_IMPORT_DISABLED" | "DWG_NO_DECODER" | "DWG_INPUT_REJECTED",
    message: string,
    blockers: readonly string[] = [],
  ) {
    super(message);
    this.name = "DwgBridgeError";
    this.code = code;
    this.blockers = Object.freeze([...blockers]);
  }
}

// ---------------------------------------------------------------------------
// Bytes de la página de códigos → cadena, con la pérdida declarada
// ---------------------------------------------------------------------------

/**
 * Latin-1, y consta que es una suposición.
 *
 * La capa binaria NO decodifica texto a propósito: la página de códigos del
 * dibujo vive en las variables de cabecera y ésas siguen opacas. Latin-1 es la
 * única lectura que no requiere adivinar nada (byte ↔ code point), acierta en
 * los planos latinoamericanos habituales y falla de forma VISIBLE en el resto.
 * Cada uso anota una pérdida: el usuario tiene que poder ver por qué un nombre
 * de capa salió raro en vez de creer que su archivo estaba mal.
 */
// Reexportadas desde el módulo de primitivas: mismo punto de entrada público
// para specs y otros consumidores existentes.
export {
  dwgDimensionToCadDxfSemanticDimension,
  dwgGeometryToPrimitive,
  dwgHatchToCadDxfHatch,
  dwgMTextToCadDxfMText,
};

// ---------------------------------------------------------------------------
// Base neutral → informe de importación canónico
// ---------------------------------------------------------------------------

export interface DwgBridgeOptions {
  /** Prefijo de los ids generados. Por defecto `dwg`. */
  readonly idPrefix?: string;
}

interface MappedEntities {
  readonly primitives: CadDxfPrimitive[];
  readonly inserts: CadDxfSemanticInsert[];
  readonly mtexts: CadDxfMText[];
  readonly dimensions: CadDxfSemanticDimension[];
  readonly hatches: CadDxfHatch[];
  readonly opaques: CadOpaqueEntity[];
  readonly losses: CadLossManifestEntry[];
}

/** Nombre legible por tipo, para `sourceType`: el que usa el propio dibujo DXF. */
const WIREFRAME_3D_SOURCE_TYPE_NAME: Readonly<Record<DwgWireframe3dOpaquePayload["kind"], string>> =
  Object.freeze({
    face3d: "3DFACE",
    polyline3d: "POLYLINE_3D",
    polymesh: "POLYLINE_MESH",
    polyfaceMesh: "POLYLINE_PFACE",
  });

function layerNameFor(
  record: DwgNeutralEntityRecord,
  layerNames: Map<number, string>,
  losses: CadLossManifestEntry[],
): string {
  if (record.layerHandle === undefined) return "0";
  const name = layerNames.get(record.layerHandle);
  if (name !== undefined) return name;
  // Una capa que no resuelve NO se inventa: la entidad cae a "0" y consta.
  losses.push({
    code: DWG_BRIDGE_LOSS_CODES.danglingLayer,
    sourceType: record.entity.kind,
    detail: `La entidad ${record.handle} apunta a una capa (${record.layerHandle}) que no está en la tabla; se coloca en la capa 0.`,
    severity: "warning",
  });
  return "0";
}

/**
 * Los ATTRIB de un INSERT (`record.attributes`, ya estrechados al perfil V3
 * por la frontera de producto) como el mismo mapa tag→valor que ya usa DXF
 * (`CadDxfSemanticInsert.attributes`). Esa frontera garantiza que cada
 * miembro es `kind: "attrib"`; se comprueba de todos modos en vez de
 * forzarlo con un `as`, por la misma razón que allí: un cambio futuro en esa
 * garantía no debe colar un tipo ajeno en el mapa sin que el puente lo note.
 */
function insertAttributeMap(
  attributes: readonly DwgNeutralEntityRecord[] | undefined,
): Record<string, string> {
  if (attributes === undefined || attributes.length === 0) return {};
  const map: Record<string, string> = {};
  for (const attribute of attributes) {
    if (attribute.entity.kind !== "attrib") continue;
    map[decodeCodePageBytes(attribute.entity.tagBytes)] = decodeCodePageBytes(
      attribute.entity.valueBytes,
    );
  }
  return map;
}

/**
 * `context` distingue model space de contenido de bloque. MTEXT/DIMENSION/
 * HATCH sólo se proyectan en model space: `CadDxfSemanticBlock` no tiene
 * campo para ninguno de los tres —ni siquiera para DXF, donde un bloque sólo
 * lleva primitivas planas e INSERTs—, así que dentro de un bloque caen al
 * mismo diagnóstico que cualquier tipo sin representación ahí.
 */
function mapRecords(
  records: readonly DwgNeutralEntityRecord[],
  layerNames: Map<number, string>,
  context: "modelSpace" | "block",
): MappedEntities {
  const primitives: CadDxfPrimitive[] = [];
  const inserts: CadDxfSemanticInsert[] = [];
  const mtexts: CadDxfMText[] = [];
  const dimensions: CadDxfSemanticDimension[] = [];
  const hatches: CadDxfHatch[] = [];
  const opaques: CadOpaqueEntity[] = [];
  const losses: CadLossManifestEntry[] = [];

  for (const record of records) {
    const layer = layerNameFor(record, layerNames, losses);
    if (record.entity.kind === "insert") {
      if (record.insertedBlockName === undefined) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.danglingBlock,
          sourceType: "insert",
          detail: `El INSERT ${record.handle} no resuelve a ningún bloque; no se coloca.`,
          severity: "error",
        });
        continue;
      }
      inserts.push({
        block: decodeCodePageBytes(record.insertedBlockName),
        insertion: point2(record.entity.position),
        scaleX: record.entity.scale.x,
        scaleY: record.entity.scale.y,
        rotation: degrees(record.entity.rotation),
        layer,
        attributes: insertAttributeMap(record.attributes),
      });
      // `attributesFollow` es la bandera del FORMATO; `record.attributes` es
      // lo que el laboratorio de verdad ató a este INSERT (fase D4, ya
      // decodificada). Si el archivo declara atributos y ninguno se ató —el
      // ATTRIB no resolvió a su propietario, una anomalía real del archivo,
      // no una limitación del decodificador— se declara igual, con el motivo
      // correcto en vez del genérico "todavía no lee" que ya no es verdad.
      if (record.entity.attributesFollow && (record.attributes?.length ?? 0) === 0) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "attrib",
          detail: `El INSERT ${record.handle} declara atributos, pero ninguno se pudo atar a este INSERT.`,
          severity: "warning",
        });
      }
      continue;
    }

    if (
      record.entity.kind === "face3d" ||
      record.entity.kind === "polyline3d" ||
      record.entity.kind === "polymesh" ||
      record.entity.kind === "polyfaceMesh"
    ) {
      // El perfil 3D heredado no gana un canal semántico propio todavía
      // (§9): se conserva REAL en `unsupportedEntities`, nunca como
      // primitiva plana (que la aplanaría) ni como "no decodificada" (que
      // sería falso). `record.handle` es único en el archivo, así que sirve
      // de id sin necesitar un contador que coordine entre model space y
      // cada bloque.
      const payload = dwgWireframe3dGeometryToOpaquePayload(record.entity, record.vertices);
      if (payload !== null) {
        const sourceType = WIREFRAME_3D_SOURCE_TYPE_NAME[payload.kind];
        opaques.push({
          id: `dwg:opaque:wireframe3d:${record.handle.toString(16).padStart(8, "0")}`,
          provider: "dwg-neutral-bridge",
          sourceType,
          layer,
          raw: JSON.stringify(payload),
          editable: false,
        });
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.wireframe3dPreservedOpaque,
          sourceType,
          detail:
            `El objeto ${record.handle} (${sourceType}) se conserva completo, con su Z real, ` +
            "en unsupportedEntities: el editor todavía no lo dibuja ni lo edita interactivamente " +
            "(perfil AC1015_3D_WIREFRAME_V1 propuesto, ADR-0009 §9, sin firma del titular).",
          severity: "warning",
        });
      }
      continue;
    }

    if (
      (record.entity.kind === "mtext" ||
        record.entity.kind === "dimension" ||
        record.entity.kind === "hatch") &&
      context === "block"
    ) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
        sourceType: record.entity.kind,
        detail: `El objeto ${record.handle} de tipo ${record.entity.kind} no se coloca dentro del bloque: el modelo de bloques del producto todavía no representa este tipo ahí (tampoco lo hace para DXF).`,
        severity: "warning",
      });
      continue;
    }

    if (record.entity.kind === "mtext") {
      mtexts.push(dwgMTextToCadDxfMText(record.entity, layer));
      continue;
    }

    if (record.entity.kind === "dimension") {
      const dimension = dwgDimensionToCadDxfSemanticDimension(record.entity, layer);
      if (dimension === null) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "dimension",
          detail: `La cota ${record.handle} (${record.entity.dimensionKind}) no se pudo reconstruir: le faltan los puntos que la definen o su geometría es degenerada.`,
          severity: "warning",
        });
        continue;
      }
      dimensions.push(dimension);
      continue;
    }

    if (record.entity.kind === "hatch") {
      const { hatch, droppedPaths } = dwgHatchToCadDxfHatch(record.entity, layer);
      if (hatch === null) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "hatch",
          detail: `El HATCH ${record.handle} no tiene ningún contorno poligonal: todos sus caminos son curvos y el perfil todavía no los representa.`,
          severity: "warning",
        });
        continue;
      }
      hatches.push(hatch);
      if (droppedPaths > 0) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.hatchCurvedBoundary,
          sourceType: "hatch",
          detail: `El HATCH ${record.handle} conserva sus contornos poligonales; ${droppedPaths} contorno(s) curvo(s) no se importaron.`,
          severity: "warning",
        });
      }
      continue;
    }

    const primitive = dwgGeometryToPrimitive(record.entity, layer);
    if (primitive === null) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
        sourceType: record.entity.kind,
        detail: `El objeto ${record.handle} de tipo ${record.entity.kind} no tiene equivalente canónico.`,
        severity: "warning",
      });
      continue;
    }
    // `CadDxfPrimitive` es una forma plana compartida con DXF: lo que no cabe
    // ahí (rotación/alineación de TEXT, elevación/ancho de LWPOLYLINE…) se
    // descarta en el mapeo de arriba. Se declara aquí en vez de callarlo —
    // vacío cuando el archivo usaba sólo los valores por defecto.
    const droppedProperties =
      record.entity.kind === "text"
        ? droppedTextProperties(record.entity)
        : record.entity.kind === "lwpolyline"
          ? droppedLwPolylineProperties(record.entity)
          : [];
    if (droppedProperties.length > 0) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.primitiveProperty,
        sourceType: record.entity.kind,
        detail: `El objeto ${record.handle} (${record.entity.kind}) conserva su geometría pero no: ${droppedProperties.join(", ")}.`,
        severity: "warning",
      });
    }
    primitives.push(primitive);
  }

  return { primitives, inserts, mtexts, dimensions, hatches, opaques, losses };
}

function mapLayers(layers: readonly DwgNeutralLayer[]): {
  names: Map<number, string>;
  definitions: CadLayerDef[];
  losses: CadLossManifestEntry[];
} {
  const names = new Map<number, string>();
  const losses: CadLossManifestEntry[] = [];
  const seen = new Set<string>(["0"]);
  const definitions: CadLayerDef[] = [
    // ACI 7 es el color por defecto tradicional de la capa "0" (blanco/negro
    // según fondo) — no es un dato del archivo, es el bootstrap sintético que
    // existe aunque la base neutral no traiga ninguna capa.
    { id: "0", name: "0", color: aciToHex(7), visible: true, locked: false },
  ];

  for (const layer of layers) {
    const name = decodeCodePageBytes(layer.name);
    names.set(layer.handle, name);
    if (layer.name.some((byte) => byte > 0x7f)) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.codePage,
        sourceType: "layer",
        detail: `El nombre de la capa ${layer.handle} lleva bytes fuera de ASCII y la página de códigos del dibujo no se decodifica: se leyó como Latin-1.`,
        severity: "warning",
      });
    }
    // El laboratorio expone `stateFlags` CRUDO a propósito: su semántica bit a
    // bit (apagada/congelada/bloqueada/trazado) queda pendiente de corpus real
    // que la confirme para el binario DWG (regla registrada junto a la tabla
    // de capas del códec). Interpretarla aquí sería adivinar exactamente lo
    // que esa regla prohíbe — se declara la pérdida en vez de fingir
    // off/frozen/locked.
    if (layer.stateFlags !== 0) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.layerStateFlags,
        sourceType: "layer",
        detail: `La capa "${name}" (handle ${layer.handle}) trae banderas de estado con valor crudo ${layer.stateFlags} (posible apagada/congelada/bloqueada/trazado): su significado bit a bit no está confirmado contra corpus real todavía, así que no se aplican al documento — la capa se importa visible y desbloqueada.`,
        severity: "warning",
      });
    }
    if (seen.has(name)) continue;
    seen.add(name);
    definitions.push({
      id: name,
      name,
      // ACI real del archivo (índices 1–9/250–255 exactos, 10–249 por rampa
      // reproducible) en vez de una paleta rotatoria inventada por posición.
      color: aciToHex(layer.colorIndex),
      visible: true,
      locked: false,
    });
  }
  return { names, definitions, losses };
}

function mapBlocks(
  blocks: readonly DwgNeutralBlock[],
  layerNames: Map<number, string>,
): { semantic: CadDxfSemanticBlock[]; opaques: CadOpaqueEntity[]; losses: CadLossManifestEntry[] } {
  const semantic: CadDxfSemanticBlock[] = [];
  const opaques: CadOpaqueEntity[] = [];
  const losses: CadLossManifestEntry[] = [];
  for (const block of blocks) {
    const mapped = mapRecords(block.entities, layerNames, "block");
    opaques.push(...mapped.opaques);
    losses.push(...mapped.losses);
    const name = decodeCodePageBytes(block.name);
    // El punto base real vive en el registro del bloque, que el laboratorio
    // todavía no decodifica: el origen es la única suposición honesta — pero
    // se declara, no se esconde. Un INSERT de este bloque puede aparecer
    // desplazado si el punto base real del archivo no era {0,0}.
    losses.push({
      code: DWG_BRIDGE_LOSS_CODES.blockBasePointAssumed,
      sourceType: "block",
      detail: `El bloque "${name}" (handle ${block.handle}) usa el punto base {x:0,y:0} sin confirmar contra el archivo: el laboratorio todavía no decodifica el punto base real del registro del bloque.`,
      severity: "warning",
    });
    semantic.push({
      name,
      basePoint: { x: 0, y: 0 },
      primitives: mapped.primitives,
      inserts: mapped.inserts,
      attributes: {},
    });
  }
  return { semantic, opaques, losses };
}

/**
 * Mapea una base neutral ya decodificada al informe de importación canónico.
 *
 * PURA: no decodifica nada, no lee bytes y por tanto no habilita nada. Es la
 * mitad del puente que se puede probar hoy. Lanza `Error` (fallo cerrado, no
 * un `Error` sin tipar que se filtre por accidente) cuando el mapeo no
 * produce ni una entidad ni un bloque — ver la nota más abajo.
 */
export function dwgNeutralDatabaseToCadDocument(
  database: DwgNeutralDatabase,
  options: DwgBridgeOptions = {},
): DocumentImportReport {
  const prefix = options.idPrefix ?? "dwg";
  const provider = "dwg-neutral-bridge";
  const { names, definitions, losses: layerLosses } = mapLayers(database.layers);
  const model = mapRecords(database.modelSpaceEntities, names, "modelSpace");
  const blockMap = mapBlocks(database.blocks, names);
  const resolvedUnit = resolveDwgUnit(database.insunits);

  const lossManifest: CadLossManifestEntry[] = [
    // INSUNITS SÍ se lee en el camino de lectura (ver `decodeAc1015HeaderVariables`
    // / `decodeR2004HeaderVariables`, ya wireados en los dos lectores). Lo que
    // sigue siendo una suposición es la unidad cuando el archivo declara un
    // valor que el documento canónico todavía no representa (`resolveDwgUnit`
    // devuelve `undefined`) — y una suposición silenciosa es justo lo que esta
    // campaña prohíbe: se declara siempre que se asume, no sólo cuando "algo
    // salió mal". Prominente y persistente porque vive en el manifiesto del
    // documento, no en un toast que desaparece.
    ...(resolvedUnit === undefined
      ? [
          {
            code: DWG_BRIDGE_LOSS_CODES.unitAssumed,
            sourceType: "document",
            detail:
              database.insunits === 0
                ? "El archivo no declara unidades de dibujo (INSUNITS=0, sin unidad): el documento se " +
                  "asume en milímetros sin poder confirmarlo contra el archivo."
                : `El archivo declara INSUNITS=${database.insunits}, una unidad que esta beta todavía ` +
                  "no representa (sólo pulgadas, pies, milímetros, centímetros y metros): el documento " +
                  "se asume en milímetros sin poder confirmarlo contra el archivo.",
            severity: "warning" as const,
          },
        ]
      : []),
    ...layerLosses,
    ...model.losses,
    ...blockMap.losses,
    // Lo que el decodificador enumeró sin decodificar se PUBLICA. Callarlo
    // dejaría al usuario creyendo que tiene el plano entero.
    ...database.unsupported.map((object) => ({
      code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
      sourceType: `type:${object.type}`,
      detail: `El objeto ${object.handle} es de un tipo (${object.type}) que el decodificador todavía no lee.`,
      severity: "warning" as const,
    })),
    ...database.diagnostics.map((diagnostic) => ({
      code: DWG_BRIDGE_LOSS_CODES.diagnostic,
      sourceType: diagnostic.code,
      detail: `${diagnostic.message} (offset ${diagnostic.offset})`,
      severity: diagnostic.severity,
    })),
  ];

  const blockParts = cadDxfBlocksToCadDocumentParts(blockMap.semantic, model.inserts, {
    idPrefix: prefix,
    provider,
  });
  const entities: CadEntity[] = [
    ...cadDxfPrimitivesToCanonicalEntities(model.primitives, {
      idPrefix: prefix,
      provider,
    }),
    ...blockParts.inserts,
    ...cadDxfMTextsToNativeEntities(model.mtexts, { idPrefix: prefix, provider }),
    ...cadDxfSemanticDimensionsToNativeEntities(model.dimensions, { idPrefix: prefix, provider }),
    ...cadDxfHatchesToNativeEntities(model.hatches, { idPrefix: prefix, provider }),
  ];

  const opaqueEntities: CadOpaqueEntity[] = [...model.opaques, ...blockMap.opaques];

  // Fallo cerrado: un archivo del que no sale ni una entidad ni un bloque ni
  // siquiera un objeto preservado opaco. Aplicarlo se vería como un éxito
  // silencioso — la peor forma de fallar en una importación, exactamente
  // como ya lo tratan DXF y shapefile en este mismo módulo
  // (`importDocumentText`/`importDocumentBytes`). El objeto preservado
  // cuenta aquí a propósito: un DWG que sólo trae 3DFACE/POLYLINE 3D/malla no
  // debe fallar cerrado cuando sí conservó algo real, sólo sin dibujarlo.
  if (!entities.length && !blockParts.blocks.length && !opaqueEntities.length) {
    throw new Error(
      "El DWG se leyó, pero ninguna de sus entidades produjo algo importable en el perfil " +
        "actual de esta beta. Nada ha cambiado en el plano.",
    );
  }

  const empty = layoutToCadDocument({}, { unit: resolvedUnit ?? "mm" });
  const document = migrateCadDocument({
    ...empty,
    layers: definitions,
    entities,
    // El orden del mapa de objetos ES el orden de dibujo del archivo.
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    blocks: blockParts.blocks,
    unsupportedEntities: [...empty.unsupportedEntities, ...opaqueEntities],
    lossManifest,
  });

  return {
    format: "dwg",
    document,
    importedEntityCount: document.entities.length,
    importedBlockCount: document.blocks.length,
    warnings: lossManifest.map((entry) => ({ code: entry.code, message: entry.detail })),
  };
}

// ---------------------------------------------------------------------------
// La mitad que toca bytes: cerrada
// ---------------------------------------------------------------------------

/**
 * Importa un archivo binario DWG. Falla cerrado mientras el gate esté cerrado.
 *
 * `reader` es el puerto del decodificador y el producto no trae ninguno: la
 * implementación llegará del laboratorio DESPUÉS del ADR de promoción, y ni
 * siquiera pasándola por aquí se salta el gate — la bandera se comprueba antes
 * de mirar el argumento, y antes de mirar un solo byte.
 */
export function importDwgDocumentBytes(
  bytes: Uint8Array,
  reader: DwgNeutralDatabaseReader | null = null,
  options: DwgBridgeOptions & { readonly gates?: DwgPromotionGates; readonly flag?: boolean } = {},
): DocumentImportReport {
  const blockers = dwgPromotionBlockers(options.gates);
  if (!dwgImportIsEnabled(options.flag, options.gates)) {
    throw new DwgBridgeError("DWG_IMPORT_DISABLED", DWG_IMPORT_DISABLED_REASON, blockers);
  }
  if (reader === null) {
    throw new DwgBridgeError(
      "DWG_NO_DECODER",
      "No hay decodificador registrado: el gate está abierto pero nadie ha conectado el lector.",
      blockers,
    );
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new DwgBridgeError("DWG_INPUT_REJECTED", "El archivo está vacío o no son bytes.");
  }
  if (bytes.byteLength > MAX_DWG_IMPORT_BYTES) {
    throw new DwgBridgeError(
      "DWG_INPUT_REJECTED",
      `El archivo supera el límite de ${Math.floor(MAX_DWG_IMPORT_BYTES / 1_000_000)} MB.`,
    );
  }
  return dwgNeutralDatabaseToCadDocument(reader(bytes), options);
}

/** Estado del puente para la interfaz: qué pasa hoy y por qué, sin adornos. */
export function dwgBridgeStatus(
  flag?: boolean,
  gates?: DwgPromotionGates,
): { available: boolean; reason: string; blockers: string[] } {
  const blockers = dwgPromotionBlockers(gates);
  const available = dwgImportIsEnabled(flag, gates);
  return {
    available,
    reason: available ? "" : DWG_IMPORT_DISABLED_REASON,
    blockers,
  };
}
