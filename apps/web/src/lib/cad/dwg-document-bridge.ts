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
 * - `dwgNeutralDatabaseToCadDocument` es PURA y siempre invocable. Recibe una
 *   base ya decodificada y produce el informe de importación canónico. Sus
 *   specs corren contra estructuras sintéticas y demuestran el mapeo entero.
 * - `importDwgDocumentBytes` es la única que tocaría bytes, y falla cerrado
 *   mientras el gate no esté abierto. Hoy falla siempre.
 *
 * Sin esa separación el puente sería código muerto sin evidencia ejecutable, y
 * en este repositorio nada cuenta sin evidencia ejecutable.
 *
 * CÓMO MAPEA. No inventa un segundo mapeo canónico: traduce la geometría
 * neutral a la primitiva intermedia que el importador DXF ya usa y delega en
 * `cadDxfPrimitivesToCanonicalEntities` y `cadDxfBlocksToCadDocumentParts`, que
 * están probados y son los que producen entidades canónicas de verdad. Un
 * segundo camino hacia `CadEntity` sería un segundo conjunto de errores.
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
} from "./cad-document";
import { MAX_DWG_IMPORT_BYTES, type DocumentImportReport } from "./document-import";
import {
  cadDxfBlocksToCadDocumentParts,
  cadDxfPrimitivesToCanonicalEntities,
} from "./dxf-cad-document";
import type {
  CadDxfPoint,
  CadDxfPrimitive,
  CadDxfSemanticBlock,
  CadDxfSemanticInsert,
} from "./dxf-import";
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
  DwgNeutralGeometry,
  DwgNeutralLayer,
} from "./dwg-neutral-model";

/** Códigos de pérdida del puente. Estables: la interfaz los agrupa por código. */
export const DWG_BRIDGE_LOSS_CODES = Object.freeze({
  codePage: "dwg_codepage_undecoded",
  unsupportedObject: "dwg_unsupported_object",
  diagnostic: "dwg_decoder_diagnostic",
  danglingLayer: "dwg_layer_handle_unresolved",
  danglingBlock: "dwg_insert_block_unresolved",
});

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
function decodeCodePageBytes(bytes: readonly number[]): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte & 0xff);
  return out;
}

const point2 = (value: { readonly x: number; readonly y: number }): CadDxfPoint => ({
  x: value.x,
  y: value.y,
});

const degrees = (radians: number): number => (radians * 180) / Math.PI;

// ---------------------------------------------------------------------------
// Geometría neutral → primitiva intermedia
// ---------------------------------------------------------------------------

/**
 * Traduce una entidad neutral a la primitiva que el pipeline canónico consume.
 *
 * Devuelve `null` cuando la entidad no tiene primitiva equivalente; el llamador
 * la anota como pérdida. Los INSERT no pasan por aquí: son referencias entre
 * objetos y viajan por el canal de bloques.
 */
export function dwgGeometryToPrimitive(
  entity: DwgNeutralGeometry,
  layer: string,
): CadDxfPrimitive | null {
  switch (entity.kind) {
    case "line":
      return { kind: "line", layer, points: [point2(entity.start), point2(entity.end)] };
    case "point":
      return {
        kind: "point",
        layer,
        points: [point2(entity.position)],
        schema4: { kind: "point" },
      };
    case "circle":
      return {
        kind: "circle",
        layer,
        points: [point2(entity.center)],
        radius: entity.radius,
      };
    case "arc":
      // El modelo neutral guarda radianes porque así viajan en el archivo; la
      // primitiva canónica habla en grados. La conversión se hace UNA vez, aquí.
      return {
        kind: "arc",
        layer,
        points: [point2(entity.center)],
        radius: entity.radius,
        startAngle: degrees(entity.startAngle),
        endAngle: degrees(entity.endAngle),
      };
    case "lwpolyline":
      return {
        kind: "polyline",
        layer,
        closed: entity.closed,
        // El bulge pertenece al vértice donde ARRANCA el segmento, igual que el
        // grupo 42 de DXF: los dos modelos coinciden y no hay que desplazarlo.
        points: entity.vertices.map((vertex, index) => {
          const bulge = entity.bulges?.[index];
          return bulge === undefined || bulge === 0
            ? point2(vertex)
            : { ...point2(vertex), bulge };
        }),
      };
    case "text":
      return {
        kind: "text",
        layer,
        points: [point2(entity.insertion)],
        text: decodeCodePageBytes(entity.valueBytes),
        textHeight: entity.height,
      };
    case "ellipse":
      // `majorAxisEndpoint` ya es el vector relativo al centro que la
      // primitiva espera: mismo contrato que el DXF, sólo cambia de dónde
      // sale el radián que hay que pasar a grados.
      return {
        kind: "ellipse",
        layer,
        points: [point2(entity.center)],
        majorAxis: point2(entity.majorAxisEndpoint),
        axisRatio: entity.axisRatio,
        startAngle: degrees(entity.startAngle),
        endAngle: degrees(entity.endAngle),
      };
    case "spline": {
      // El perfil ya filtró a escenario 1 (nudos + puntos de control) en
      // `toBetaProfileGeometry`; esta comprobación es sólo por el `undefined`
      // que el tipo sigue permitiendo (escenario 2 lo deja así), no una
      // segunda validación de negocio.
      const controlPoints = entity.controlPoints;
      if (controlPoints === undefined || controlPoints.length < 2) return null;
      return {
        kind: "spline",
        layer,
        points: controlPoints.map(point2),
        degree: entity.degree,
        ...(entity.knots !== undefined && entity.knots.length > 0
          ? { knots: [...entity.knots] }
          : {}),
      };
    }
    default:
      return null;
  }
}

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
  readonly losses: CadLossManifestEntry[];
}

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

function mapRecords(
  records: readonly DwgNeutralEntityRecord[],
  layerNames: Map<number, string>,
): MappedEntities {
  const primitives: CadDxfPrimitive[] = [];
  const inserts: CadDxfSemanticInsert[] = [];
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
        // Los ATTRIB del formato no los decodifica el laboratorio: la bandera
        // se conserva como pérdida en vez de fingir un mapa de atributos vacío.
        attributes: {},
      });
      if (record.entity.attributesFollow) {
        losses.push({
          code: DWG_BRIDGE_LOSS_CODES.unsupportedObject,
          sourceType: "attrib",
          detail: `El INSERT ${record.handle} declara atributos que el decodificador todavía no lee.`,
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
    primitives.push(primitive);
  }

  return { primitives, inserts, losses };
}

function mapLayers(layers: readonly DwgNeutralLayer[]): {
  names: Map<number, string>;
  definitions: CadLayerDef[];
  losses: CadLossManifestEntry[];
} {
  const palette = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"];
  const names = new Map<number, string>();
  const losses: CadLossManifestEntry[] = [];
  const seen = new Set<string>(["0"]);
  const definitions: CadLayerDef[] = [
    { id: "0", name: "0", color: palette[0], visible: true, locked: false },
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
    if (seen.has(name)) continue;
    seen.add(name);
    definitions.push({
      id: name,
      name,
      color: palette[definitions.length % palette.length],
      visible: true,
      locked: false,
    });
  }
  return { names, definitions, losses };
}

function mapBlocks(
  blocks: readonly DwgNeutralBlock[],
  layerNames: Map<number, string>,
): { semantic: CadDxfSemanticBlock[]; losses: CadLossManifestEntry[] } {
  const semantic: CadDxfSemanticBlock[] = [];
  const losses: CadLossManifestEntry[] = [];
  for (const block of blocks) {
    const mapped = mapRecords(block.entities, layerNames);
    losses.push(...mapped.losses);
    semantic.push({
      name: decodeCodePageBytes(block.name),
      // El punto base real vive en el registro del bloque, que el laboratorio
      // todavía no decodifica: el origen es la única suposición honesta.
      basePoint: { x: 0, y: 0 },
      primitives: mapped.primitives,
      inserts: mapped.inserts,
      attributes: {},
    });
  }
  return { semantic, losses };
}

/**
 * Mapea una base neutral ya decodificada al informe de importación canónico.
 *
 * PURA y siempre invocable: no decodifica nada, no lee bytes y por tanto no
 * habilita nada. Es la mitad del puente que se puede probar hoy.
 */
export function dwgNeutralDatabaseToCadDocument(
  database: DwgNeutralDatabase,
  options: DwgBridgeOptions = {},
): DocumentImportReport {
  const prefix = options.idPrefix ?? "dwg";
  const provider = "dwg-neutral-bridge";
  const { names, definitions, losses: layerLosses } = mapLayers(database.layers);
  const model = mapRecords(database.modelSpaceEntities, names);
  const blockMap = mapBlocks(database.blocks, names);

  const lossManifest: CadLossManifestEntry[] = [
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
  ];

  const empty = layoutToCadDocument({}, { unit: "mm" });
  const document = migrateCadDocument({
    ...empty,
    layers: definitions,
    entities,
    // El orden del mapa de objetos ES el orden de dibujo del archivo.
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    blocks: blockParts.blocks,
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
