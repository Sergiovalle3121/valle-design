import {
  layoutToCadDocument,
  migrateCadDocument,
  type CadDocument,
  type CadLayerDef,
  type CadLossManifestEntry,
} from "./cad-document";
import {
  cadDxfBlocksToCadDocumentParts,
  cadDxfHatchesToNativeEntities,
  cadDxfMleadersToNativeEntities,
  cadDxfMTextsToNativeEntities,
  cadDxfPrimitivesToCanonicalEntities,
  cadDxfSemanticDimensionsToNativeEntities,
} from "./dxf-cad-document";
import { importDxfPrimitives } from "./dxf-import";
import {
  buildCadDxfImportReport,
  type CadDxfImportReport,
} from "./dxf-import-report";
import { shapefileToCadEntities } from "./geo-cad-document";
import { readGeoDataset } from "../geo";
import { dwgBetaImportIsEnabled, dwgImportIsEnabled } from "./dwg-interop-flag";
import { dwgNeutralDatabaseToCadDocument } from "./dwg-document-bridge";
import type { DwgNeutralDatabaseReader } from "./dwg-neutral-model";

export const MAX_DXF_IMPORT_BYTES = 12_000_000;
export const MAX_JSON_IMPORT_BYTES = 20_000_000;
/**
 * Tope del `.shp`.
 *
 * Un shapefile es binario y denso: 16 bytes por vértice, sin cabeceras por
 * medio. Ocho megas son medio millón de vértices, que ya es un municipio
 * entero y muy por encima de un predio con su manzana. El lector tiene además
 * su propio tope en vértices; éste corta antes, cuando todavía no se ha leído
 * nada.
 */
export const MAX_SHP_IMPORT_BYTES = 8_000_000;

/**
 * Límite del binario, declarado aunque hoy no se pueda alcanzar.
 *
 * Un DWG comprime, así que pesa menos que el DXF equivalente y aun así trae más
 * dentro: el límite es mayor que el de DXF y sigue siendo un tope, porque un
 * archivo sin tope es una denegación de servicio con extensión.
 */
export const MAX_DWG_IMPORT_BYTES = 24_000_000;

export type DocumentImportFormat = "dxf" | "json" | "shp" | "dwg";

export interface DocumentImportReport {
  format: DocumentImportFormat;
  document: CadDocument;
  importedEntityCount: number;
  importedBlockCount: number;
  warnings: Array<{ code: string; message: string }>;
  /**
   * Lo mismo que `warnings`, pero en español y accionable: qué entró íntegro,
   * qué entró peor y qué no entró.
   *
   * `warnings` era lo único que llegaba a la interfaz y era la lista de códigos
   * del importador —`unsupported_entity`, `anisotropic_insert`—, volcada tal
   * cual en el panel. Eso no informa a un arquitecto: le enseña el registro de
   * depuración del programa. Sólo existe en las importaciones DXF; un JSON
   * canónico es nuestro formato y no degrada nada.
   */
  dxfReport?: CadDxfImportReport;
}

export function importLimitForFileName(fileName: string): number {
  const kind = extension(fileName);
  if (kind === "dxf") return MAX_DXF_IMPORT_BYTES;
  if (kind === "shp") return MAX_SHP_IMPORT_BYTES;
  if (kind === "dwg") return MAX_DWG_IMPORT_BYTES;
  return MAX_JSON_IMPORT_BYTES;
}

/**
 * ¿Este archivo entra por bytes o por texto?
 *
 * El `.shp` es binario y los otros dos no. La pregunta la hace el worker antes
 * de leer el fichero, porque `File.text()` sobre un binario lo destroza:
 * decodifica como UTF-8 y sustituye cada byte inválido, y lo que llega al
 * lector ya no son los bytes del archivo.
 */
export function isBinaryImportFormat(fileName: string): boolean {
  const kind = extension(fileName);
  return kind === "shp" || kind === "dwg";
}

export function validateImportFile(
  fileName: string,
  size: number,
  dwgBetaEnabled = false,
): void {
  const kind = extension(fileName);
  /**
   * `.dwg` entra por CUALQUIERA de dos gates, y hoy ninguno está abierto por
   * defecto:
   *
   * - `dwgImportIsEnabled()`: la promoción general de ADR-0007/0009 (7
   *   gates, incluida revisión jurídica externa). Sigue apagada.
   * - `dwgBetaImportIsEnabled(dwgBetaEnabled)`: la beta acotada
   *   `AC1015_MODELSPACE_2D_V3` que el dueño firmó 2026-08-24 (ADR-0009
   *   §6-bis, ampliada §6-ter y §6-quater), con el dictamen jurídico en
   *   paralelo. `dwgBetaEnabled` lo decide quien llama —el worker, a partir
   *   de una variable de build no pública por defecto— nunca este módulo,
   *   que no lee entorno.
   *
   * El mensaje SÍ cambió al integrar, y a propósito: el shapefile ya se admite,
   * así que callarlo dejaría al usuario sin saber que su `.shp` entra. Un
   * mensaje de error que enumera menos formatos de los que acepta el producto
   * es una mentira pequeña que cuesta una importación.
   */
  const admitted =
    kind === "dxf" ||
    kind === "json" ||
    kind === "shp" ||
    (kind === "dwg" && (dwgImportIsEnabled() || dwgBetaImportIsEnabled(dwgBetaEnabled)));
  if (!admitted) {
    throw new Error(
      "Formato no soportado. Usa DXF de texto, JSON canónico o shapefile (.shp).",
    );
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("El archivo está vacío o su tamaño no es válido.");
  }
  if (size > importLimitForFileName(fileName)) {
    throw new Error(
      `El archivo supera el límite de ${Math.floor(importLimitForFileName(fileName) / 1_000_000)} MB.`,
    );
  }
}

export function importDocumentText(
  fileName: string,
  content: string,
): DocumentImportReport {
  validateImportFile(fileName, new TextEncoder().encode(content).byteLength);
  if (isBinaryImportFormat(fileName))
    throw new Error(
      "Este formato es binario: no se puede importar como texto. Vuelve a elegir el archivo.",
    );
  return extension(fileName) === "dxf"
    ? importDxfDocument(content)
    : importCanonicalJson(content);
}

/**
 * Importa un archivo BINARIO: hoy, el shapefile de un predio.
 *
 * Los acompañantes son opcionales y cada ausencia se declara en el manifiesto
 * en vez de suponerse. En particular la del `.prj`: sin él, la geometría es
 * correcta entre sí y NO se sabe dónde está en el mundo, y decirlo es la
 * diferencia entre un plano de linderos defendible y uno que parece defendible.
 */
export function importDocumentBytes(
  fileName: string,
  bytes: ArrayBuffer | Uint8Array,
  sidecars: {
    shx?: ArrayBuffer | Uint8Array;
    dbf?: ArrayBuffer | Uint8Array;
    prj?: string;
    cpg?: string;
  } = {},
  dwg?: { readonly betaEnabled: boolean; readonly reader: DwgNeutralDatabaseReader },
): DocumentImportReport {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  validateImportFile(fileName, data.byteLength, dwg?.betaEnabled ?? false);
  if (extension(fileName) === "dwg") {
    if (dwg === undefined) {
      throw new Error("No hay lector DWG registrado para esta importación.");
    }
    return importDwgDocument(data, dwg.reader);
  }
  return importShapefileDocument(fileName, data, sidecars);
}

/**
 * DWG → documento canónico, perfil de beta `AC1015_MODELSPACE_2D_V3`.
 *
 * `validateImportFile` ya comprobó el gate y el tamaño: si esta función se
 * alcanza es porque la beta está habilitada. `reader` decodifica los bytes
 * hostiles a la base neutral; lo inyecta el worker desde el único adaptador
 * del producto autorizado a tocar el códec (`scripts/dwg/check-product-boundary.mjs`
 * lo verifica) — este archivo nunca lo importa directamente.
 * `dwgNeutralDatabaseToCadDocument` (`dwg-document-bridge.ts`) es la mitad
 * PURA del puente, ya probada, que proyecta esa base al documento canónico
 * con su manifiesto de pérdidas.
 */
function importDwgDocument(
  bytes: Uint8Array,
  reader: DwgNeutralDatabaseReader,
): DocumentImportReport {
  return dwgNeutralDatabaseToCadDocument(reader(bytes));
}

function importCanonicalJson(content: string): DocumentImportReport {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("El JSON no se puede analizar.");
  }
  assertSafeJson(raw);
  if (
    !raw ||
    typeof raw !== "object" ||
    !("meta" in raw) ||
    !Array.isArray((raw as { entities?: unknown }).entities)
  ) {
    throw new Error("El JSON no contiene un documento CAD canónico.");
  }
  const document = migrateCadDocument(raw);
  return {
    format: "json",
    document,
    importedEntityCount: document.entities.length,
    importedBlockCount: document.blocks.length,
    warnings: document.lossManifest.map((entry) => ({
      code: entry.code,
      message: entry.detail,
    })),
  };
}

function importDxfDocument(content: string): DocumentImportReport {
  const imported = importDxfPrimitives(content);
  if (imported.warnings.some((warning) => warning.code === "parse_failed")) {
    throw new Error("El DXF está corrupto o no es un DXF de texto válido.");
  }

  const primitiveEntities = cadDxfPrimitivesToCanonicalEntities(
    imported.primitives.filter(
      (_, index) => imported.primitiveSources[index] !== "insert",
    ),
    { idPrefix: "dxf", provider: "native-dxf" },
  );
  const blockParts = cadDxfBlocksToCadDocumentParts(
    imported.blocks,
    imported.inserts,
    { idPrefix: "dxf", provider: "native-dxf" },
  );
  const entities = [
    ...primitiveEntities,
    ...cadDxfHatchesToNativeEntities(imported.hatches, {
      idPrefix: "dxf",
      provider: "native-dxf",
    }),
    ...cadDxfMTextsToNativeEntities(imported.mtexts, {
      idPrefix: "dxf",
      provider: "native-dxf",
    }),
    ...cadDxfSemanticDimensionsToNativeEntities(imported.semanticDimensions, {
      idPrefix: "dxf",
      provider: "native-dxf",
    }),
    ...cadDxfMleadersToNativeEntities(imported.mleaders, {
      idPrefix: "dxf",
      provider: "native-dxf",
    }),
    ...blockParts.inserts,
  ];
  if (!entities.length && !blockParts.blocks.length) {
    throw new Error("El DXF no contiene entidades compatibles para importar.");
  }

  const empty = layoutToCadDocument({}, { unit: "mm" });
  const lossManifest: CadLossManifestEntry[] = imported.warnings.map(
    (warning) => ({
      code: warning.code,
      sourceType: warning.entityType,
      detail: warning.message,
      severity: "warning",
    }),
  );
  const linetypeCatalog = Object.fromEntries(
    imported.linetypes.map((entry) => [
      entry.name,
      { pattern: entry.pattern, ...(entry.description ? { description: entry.description } : {}) },
    ]),
  );
  const document = migrateCadDocument({
    ...empty,
    meta: {
      ...empty.meta,
      // La escala global del guion llega del fichero o no llega: inventar un 1
      // cuando el fichero declara 25 dibujaría todos los ejes veinticinco veces
      // más cortos y no habría nada en el documento que lo delatase.
      ...(imported.linetypeScale !== undefined ? { linetypeScale: imported.linetypeScale } : {}),
    },
    styles: {
      ...empty.styles,
      // Sección OPCIONAL: sólo aparece si el fichero traía tabla LTYPE.
      ...(Object.keys(linetypeCatalog).length ? { linetype: linetypeCatalog } : {}),
      // La tabla DIMSTYLE del fichero puebla la norma de acotación del
      // documento: el estilo por nombre vuelve a gobernar, no sólo el aspecto
      // horneado de cada cota.
      ...(imported.dimensionStyles &&
      Object.keys(imported.dimensionStyles).length
        ? {
            dimension: {
              ...empty.styles.dimension,
              ...imported.dimensionStyles,
            },
          }
        : {}),
    },
    layers: buildLayers(imported.layers, imported.layerDefinitions),
    entities,
    // El orden en que el importador entrega las entidades ES el orden de
    // dibujo del fichero de origen. Ordenarlo por id descartaba esa fidelidad.
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    blocks: blockParts.blocks,
    // Catálogo de imágenes: sin él, las entidades IMAGE importadas apuntarían
    // a una definición que no existe y el documento quedaría roto en el mismo
    // acto de importarlo. Sección OPCIONAL: sólo se escribe si hay imágenes.
    ...(imported.imageDefinitions.length
      ? { imageDefinitions: imported.imageDefinitions }
      : {}),
    lossManifest,
  });
  return {
    format: "dxf",
    document,
    importedEntityCount: document.entities.length,
    importedBlockCount: document.blocks.length,
    warnings: imported.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    // Los recuentos salen del DOCUMENTO ya construido, no del importador: el
    // primero sabe qué quedó dentro y el segundo qué traía el fichero, y
    // derivar uno del otro es exactamente la mentira que el informe evita.
    dxfReport: buildCadDxfImportReport(imported, {
      entityCount: document.entities.length,
      blockCount: document.blocks.length,
    }),
  };
}

/**
 * Shapefile → documento canónico.
 *
 * El fallo cerrado del lector se propaga TAL CUAL: si el `.shp` está cortado o
 * su `.prj` dice NAD27, aquí no se captura ni se degrada a aviso. La
 * importación entera muere con el mensaje del lector, que ya explica qué pasó y
 * qué hacer. Convertir eso en «se importó con avisos» sería exactamente la
 * mentira que el subárbol `lib/geo` existe para no cometer.
 */
function importShapefileDocument(
  fileName: string,
  bytes: Uint8Array,
  sidecars: {
    shx?: ArrayBuffer | Uint8Array;
    dbf?: ArrayBuffer | Uint8Array;
    prj?: string;
    cpg?: string;
  },
): DocumentImportReport {
  const dataset = readGeoDataset({
    bytes,
    name: fileName,
    ...(sidecars.shx ? { shx: sidecars.shx } : {}),
    ...(sidecars.dbf ? { dbf: sidecars.dbf } : {}),
    ...(sidecars.prj !== undefined ? { prj: sidecars.prj } : {}),
    ...(sidecars.cpg !== undefined ? { cpg: sidecars.cpg } : {}),
  });
  if (dataset.kind !== "shapefile")
    throw new Error(
      "El archivo es una nube de puntos. El dibujo canónico no la representa como entidades; " +
        "hoy este producto la lee pero no la importa al plano.",
    );

  const converted = shapefileToCadEntities(dataset.shapefile, {
    idPrefix: "geo",
    layer: fileName,
    unit: "mm",
    ...(dataset.attributes ? { attributes: dataset.attributes } : {}),
  });
  // Fallo cerrado: un archivo legible del que no sale ni una entidad. Aplicarlo
  // se vería como un éxito silencioso, que es la peor forma de fallar en una
  // importación — el usuario cree que el predio entró y el plano sigue vacío.
  if (converted.entities.length === 0)
    throw new Error(
      "El shapefile se leyó, pero ninguna de sus geometrías produjo algo dibujable. Nada ha " +
        "cambiado en el plano.",
    );

  const empty = layoutToCadDocument({}, { unit: "mm" });
  const document = migrateCadDocument({
    ...empty,
    layers: converted.layers,
    entities: converted.entities,
    modelSpace: { entityIds: converted.entities.map((entity) => entity.id) },
    lossManifest: converted.losses,
  });
  return {
    format: "shp",
    document,
    importedEntityCount: document.entities.length,
    importedBlockCount: 0,
    warnings: converted.losses.map((entry) => ({
      code: entry.code,
      message: entry.detail,
    })),
  };
}

/**
 * Capas del documento a partir de los NOMBRES usados por las entidades, con lo
 * que la tabla LAYER del fichero declare de cada una.
 *
 * El grosor cruza aquí su única frontera de unidades: el fichero lo trae en
 * CENTÉSIMAS de milímetro y `CadLayerDef.lineweight` está en MILÍMETROS desde
 * que existe la paleta de capas, con −1 por «por defecto». La conversión de
 * vuelta vive en el escritor, y la resolución de la herencia en
 * `cad-effective-style.ts`; los tres sitios se editan juntos.
 */
function buildLayers(
  names: string[],
  definitions: readonly {
    name: string;
    linetype?: string;
    lineweight?: number;
    frozen?: boolean;
  }[] = [],
): CadLayerDef[] {
  const palette = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"];
  const declared = new Map(definitions.map((entry) => [entry.name, entry]));
  const unique = [...new Set(["0", ...names])].sort();
  return unique.map((name, index) => {
    const entry = declared.get(name);
    // −3 (DEFAULT en el fichero) se guarda como −1, que es lo que la paleta de
    // capas llama «por defecto». No es lo mismo que 0: cero es un grosor real.
    const lineweight =
      entry?.lineweight === undefined
        ? undefined
        : entry.lineweight < 0
          ? -1
          : entry.lineweight / 100;
    return {
      id: name,
      name,
      color: palette[index % palette.length],
      visible: true,
      locked: false,
      ...(entry?.linetype ? { linetype: entry.linetype } : {}),
      ...(lineweight !== undefined ? { lineweight } : {}),
      // El bit 1 del código 70 se leía y se descartaba justo aquí. Desde el
      // esquema 9 la capa congelada del remitente llega congelada.
      ...(entry?.frozen ? { frozen: true } : {}),
    };
  });
}

function assertSafeJson(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 0 },
  ];
  let visited = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    visited += 1;
    if (visited > 1_000_000 || depth > 128) {
      throw new Error("El JSON excede los límites estructurales seguros.");
    }
    if (!value || typeof value !== "object") continue;
    for (const [key, nested] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error("El JSON contiene una clave insegura.");
      }
      stack.push({ value: nested, depth: depth + 1 });
    }
  }
}

function extension(fileName: string): string {
  return fileName.trim().toLowerCase().split(".").pop() ?? "";
}
