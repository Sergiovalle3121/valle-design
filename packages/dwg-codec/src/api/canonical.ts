/**
 * Mapeo PURO base-neutral ↔ documento canónico — campaña 2026-08-21, OLA 4.
 *
 * Convierte la base neutral del lector DWG a un JSON con la FORMA del
 * `CadDocument` canónico del producto (apps/web/src/lib/cad/cad-document.ts,
 * esquema 9) y de vuelta. ADR-0007 prohíbe importar el producto desde el
 * laboratorio, así que este módulo declara TIPOS ESPEJO estructurales: el
 * adaptador de integración (futuro, del lado del producto) consumirá este
 * JSON directamente. Cualquier divergencia entre el espejo y el canónico es
 * un hallazgo del paquete de promoción, no un parche silencioso.
 *
 * Contrato de honestidad: TODO lo que no viaja se declara en el manifiesto
 * de pérdidas — por entidad y por propiedad, en ambos sentidos. El
 * round-trip DWG→canónico→DWG sólo puede diferir dentro de esas pérdidas
 * declaradas (spec sobre el corpus del laboratorio).
 */
import type { CanonicalPaperSpaceJson } from "./canonical-paper.js";
import { canonicalPaperSpaceFromDwg } from "./canonical-paper.js";
import type {
  Ac1015DatabaseEntityRecord,
  Ac1015NeutralDatabase,
} from "../reader/ac1015-database-reader.js";
import type {
  DwgAttribEntity,
  DwgGeometryEntity,
  DwgPoint3,
  DwgViewportEntity,
} from "../model/entity-geometry.js";
import { mapCanonicalLayers } from "./canonical-layers.js";
// La traducción de UNA entidad —y las cuatro ayudas que sólo ella usa— vive en
// `canonical-from-dwg.ts` desde el 2026-09-04 (presupuesto de 800 líneas).
import {
  decodeBytes,
  handleId,
  mapEntity,
  point3,
  PROVIDER,
} from "./canonical-from-dwg.js";

// ---------------------------------------------------------------------------
// Tipos espejo del documento canónico (subconjunto que este mapeo produce)
// ---------------------------------------------------------------------------

export interface CanonicalPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CanonicalLossEntry {
  readonly code: string;
  readonly entityId?: string;
  readonly sourceType?: string;
  readonly detail: string;
  readonly severity: "info" | "warning" | "error";
}

export interface CanonicalOpaqueEntity {
  readonly id: string;
  readonly provider: string;
  readonly sourceType: string;
  readonly layer?: string;
  readonly raw: string;
  readonly editable: false;
}

/** Documento canónico en su forma JSON (espejo estructural del esquema 9). */
export interface CanonicalCadDocumentJson {
  readonly meta: {
    readonly version: number;
    readonly schema: number;
    readonly unit: string;
    readonly linetypeScale?: number;
  };
  readonly layers: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly visible: boolean;
    readonly locked: boolean;
    /**
     * CONGELADA, que NO es apagada: ni se dibuja, ni se regenera, ni entra en
     * selección. Se separa de `visible` porque el estado que este laboratorio
     * mide es la congelación —el bit 0, contra el oráculo DXF— y el apagado
     * NO: plegar una en la otra afirmaría de más.
     */
    readonly frozen?: boolean;
    /**
     * NOMBRE del tipo de línea de la capa, leído del archivo. Ausente cuando
     * no se pudo resolver: nunca se rellena con `CONTINUOUS`, que es un tipo
     * de línea real y no un «no sé».
     */
    readonly linetype?: string;
  }[];
  readonly entities: Record<string, unknown>[];
  readonly history: { readonly version: number; readonly label: string }[];
  readonly modelSpace: { readonly entityIds: string[] };
  /** LAS HOJAS. Qué de ellas viaja al archivo lo decide `canonical-paper.ts`;
   * la dirección DWG→canónico sigue devolviendo `[]` (pendiente declarado). */
  readonly paperSpaces: readonly CanonicalPaperSpaceJson[];
  readonly styles: {
    readonly text: Record<string, { fontFamily?: string; height?: number }>;
    readonly dimension: Record<string, Record<string, unknown>>;
    readonly table: Record<string, never>;
    readonly plot: Record<string, never>;
    readonly linetype?: Record<
      string,
      { pattern: number[]; description?: string }
    >;
  };
  readonly blocks: {
    readonly id: string;
    readonly name: string;
    readonly basePoint: CanonicalPoint3;
    readonly entities: Record<string, unknown>[];
    readonly attributes?: Record<
      string,
      {
        defaultValue?: string;
        prompt?: string;
        position?: CanonicalPoint3;
        height?: number;
      }
    >;
  }[];
  readonly constraints: never[];
  readonly externalReferences: never[];
  readonly unsupportedEntities: CanonicalOpaqueEntity[];
  readonly lossManifest: CanonicalLossEntry[];
  readonly publications: never[];
}

export interface CanonicalMappingResult {
  readonly document: CanonicalCadDocumentJson;
  readonly lossManifest: readonly CanonicalLossEntry[];
}

const CANONICAL_SCHEMA = 9;


// ---------------------------------------------------------------------------
// DWG → canónico
// ---------------------------------------------------------------------------

/**
 * Proyecta la base neutral a un documento canónico JSON con su manifiesto de
 * pérdidas. Función pura: mismos datos, mismo documento.
 */
export function dwgDatabaseToCanonicalDocument(
  database: Ac1015NeutralDatabase,
): CanonicalMappingResult {
  const losses: CanonicalLossEntry[] = [];
  const layers = mapCanonicalLayers(database, losses);

  const layerNameByHandle = new Map<number, string>();
  for (const layer of database.layers) {
    layerNameByHandle.set(layer.handle, decodeBytes(layer.name));
  }
  const layerOf = (record: Ac1015DatabaseEntityRecord): string =>
    record.layerHandle === undefined
      ? "0"
      : (layerNameByHandle.get(record.layerHandle) ?? "0");

  const entities: Record<string, unknown>[] = [];
  const opaque: CanonicalOpaqueEntity[] = [];
  const entityIds: string[] = [];

  // LA HOJA VUELVE (2026-09-04). El lector sigue COLOCANDO las entidades de
  // papel en `modelSpaceEntities` —pendiente declarado— pero ya dice de qué
  // espacio son, así que aquí se reparten: la ventana arma la lámina y lo
  // demás (cajetín, marco, rótulos) va a sus `entityIds`. Sin esto, un
  // archivo con hoja volvía con la hoja disuelta en el modelo.
  const hoja = { entityIds: [] as string[], viewports: [] as DwgViewportEntity[] };
  for (const record of database.modelSpaceEntities) {
    const enHoja = record.space === "paper";
    if (enHoja && record.entity.kind === "viewport") {
      hoja.viewports.push(record.entity);
      continue;
    }
    const mapped = mapEntity(record, layerOf(record), losses, opaque);
    if (mapped === null) continue;
    entities.push(mapped);
    (enHoja ? hoja.entityIds : entityIds).push(mapped["id"] as string);
  }

  const blocks = database.blocks
    .filter((block) => {
      const name = decodeBytes(block.name);
      return !name.startsWith("*");
    })
    .map((block) => {
      const blockEntities: Record<string, unknown>[] = [];
      const attributes: Record<
        string,
        {
          defaultValue?: string;
          prompt?: string;
          position?: CanonicalPoint3;
          height?: number;
        }
      > = {};
      for (const record of block.entities) {
        if (record.entity.kind === "attdef") {
          const attdef = record.entity;
          attributes[decodeBytes(attdef.tagBytes)] = {
            defaultValue: decodeBytes(attdef.valueBytes),
            prompt: decodeBytes(attdef.promptBytes),
            position: Object.freeze({
              x: attdef.insertion.x,
              y: attdef.insertion.y,
              z: 0,
            }),
            height: attdef.height,
          };
          continue;
        }
        const mapped = mapEntity(record, layerOf(record), losses, opaque);
        if (mapped !== null) blockEntities.push(mapped);
      }
      const name = decodeBytes(block.name);
      return {
        id: handleId(block.handle),
        name,
        basePoint: Object.freeze({ x: 0, y: 0, z: 0 }),
        entities: blockEntities,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      };
    });

  // Los bloques anónimos (*D..., *Model_Space...) no se proyectan como
  // bloques del documento; sus cotas ya viajan como entidades dimension.
  const anonymous = database.blocks.filter((b) =>
    decodeBytes(b.name).startsWith("*"),
  ).length;
  if (anonymous > 0) {
    losses.push({
      code: "anonymous-blocks-not-projected",
      detail: `${anonymous} bloque(s) anónimo(s) (*D, espacios) no se proyectan: las cotas viajan como entidades y los espacios son estructura del formato.`,
      severity: "info",
    });
  }

  const unsupportedCounts = new Map<number, number>();
  for (const item of database.unsupported) {
    unsupportedCounts.set(
      item.type,
      (unsupportedCounts.get(item.type) ?? 0) + 1,
    );
    const className =
      item.className === undefined ? undefined : decodeBytes(item.className);
    opaque.push({
      id: handleId(item.handle),
      provider: PROVIDER,
      sourceType:
        className === undefined
          ? `dwg-type-0x${item.type.toString(16)}`
          : `dwg-class:${className}`,
      raw: `handle=0x${item.handle.toString(16)};type=0x${item.type.toString(16)}`,
      editable: false,
    });
  }
  for (const [type, count] of [...unsupportedCounts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    losses.push({
      code: "object-type-not-decoded",
      sourceType: `0x${type.toString(16)}`,
      detail: `${count} objeto(s) de tipo 0x${type.toString(16)} enumerados sin decodificar; viajan como opacos.`,
      severity: "info",
    });
  }

  // Las tablas de símbolos de la fase D5 viajan al catálogo de estilos del
  // documento: tipos de línea con su patrón .lin (49 firmados), estilos de
  // texto con su altura fija y los NOMBRES de los estilos de cota (el núcleo
  // de DIMVARs se proyecta en la integración; pérdida declarada).
  const linetypeStyles: Record<
    string,
    { pattern: number[]; description?: string }
  > = {};
  for (const entry of database.tables?.linetypes ?? []) {
    const name = decodeBytes(entry.name);
    const dashes = entry.fields["dashLengths"];
    linetypeStyles[name] = {
      pattern: Array.isArray(dashes) ? dashes.map((d) => Number(d)) : [],
      ...(entry.fields["description"] !== undefined &&
      Array.isArray(entry.fields["description"]) &&
      (entry.fields["description"] as readonly number[]).length > 0
        ? {
            description: decodeBytes(
              entry.fields["description"] as readonly number[],
            ),
          }
        : {}),
    };
  }
  const textStyles: Record<string, { height?: number }> = {};
  for (const entry of database.tables?.styles ?? []) {
    const height = entry.fields["fixedHeight"];
    textStyles[decodeBytes(entry.name)] = {
      ...(typeof height === "number" && height !== 0 ? { height } : {}),
    };
  }
  const dimensionStyles: Record<string, Record<string, unknown>> = {};
  for (const entry of database.tables?.dimstyles ?? []) {
    dimensionStyles[decodeBytes(entry.name)] = {};
  }
  if (Object.keys(dimensionStyles).length > 0) {
    losses.push({
      code: "dimstyle-variables-not-projected",
      sourceType: "DIMSTYLE",
      detail: `${Object.keys(dimensionStyles).length} estilo(s) de cota se proyectan por NOMBRE; el núcleo de DIMVARs al CadDimensionStyleDefinition es del adaptador de integración.`,
      severity: "info",
    });
  }

  const document: CanonicalCadDocumentJson = {
    meta: { version: 1, schema: CANONICAL_SCHEMA, unit: "mm" },
    layers,
    entities,
    history: [{ version: 1, label: "importado por valle-dwg-codec" }],
    modelSpace: { entityIds },
    paperSpaces: canonicalPaperSpaceFromDwg(hoja),
    styles: {
      text: textStyles,
      dimension: dimensionStyles,
      table: {},
      plot: {},
      ...(Object.keys(linetypeStyles).length > 0
        ? { linetype: linetypeStyles }
        : {}),
    },
    blocks,
    constraints: [],
    externalReferences: [],
    unsupportedEntities: opaque,
    lossManifest: losses,
    publications: [],
  };
  return { document, lossManifest: losses };
}


// ---------------------------------------------------------------------------
// canónico → DWG (subconjunto escribible)
// ---------------------------------------------------------------------------

/** Una entidad neutral lista para el writer, con su capa por nombre. */
export interface CanonicalToDwgEntity {
  readonly entity: DwgGeometryEntity;
  readonly layerName: string;
  /** Ausente o "model" = model space; "paper" = la hoja «Layout1». */
  readonly space?: "model" | "paper";
  readonly blockName?: string;
  readonly canonicalId: string;
  /**
   * Sólo INSERT: los ATTRIB del rótulo, ya con su geometría. Van en la capa
   * del INSERT —es lo que hace el producto, que no le da capa propia a un
   * atributo— y sólo existen cuando `entity.attributesFollow` es true.
   */
  readonly attributes?: readonly DwgAttribEntity[];
}

export interface CanonicalToDwgResult {
  readonly entities: readonly CanonicalToDwgEntity[];
  readonly layerNames: readonly string[];
  readonly lossManifest: readonly CanonicalLossEntry[];
}

export { canonicalDocumentToDwgEntities } from "./canonical-to-dwg.js";
export type { CanonicalPaperSpaceJson, CanonicalPaperViewportJson, CanonicalRectJson } from "./canonical-paper.js";
