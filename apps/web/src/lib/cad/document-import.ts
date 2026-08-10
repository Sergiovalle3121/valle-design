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

export const MAX_DXF_IMPORT_BYTES = 12_000_000;
export const MAX_JSON_IMPORT_BYTES = 20_000_000;

export type DocumentImportFormat = "dxf" | "json";

export interface DocumentImportReport {
  format: DocumentImportFormat;
  document: CadDocument;
  importedEntityCount: number;
  importedBlockCount: number;
  warnings: Array<{ code: string; message: string }>;
}

export function importLimitForFileName(fileName: string): number {
  return extension(fileName) === "dxf"
    ? MAX_DXF_IMPORT_BYTES
    : MAX_JSON_IMPORT_BYTES;
}

export function validateImportFile(fileName: string, size: number): void {
  const kind = extension(fileName);
  if (kind !== "dxf" && kind !== "json") {
    throw new Error("Formato no soportado. Usa DXF de texto o JSON canónico.");
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
  return extension(fileName) === "dxf"
    ? importDxfDocument(content)
    : importCanonicalJson(content);
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
  const document = migrateCadDocument({
    ...empty,
    layers: buildLayers(imported.layers),
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
  };
}

function buildLayers(names: string[]): CadLayerDef[] {
  const palette = ["#ffffff", "#ff5252", "#4fc3f7", "#ffd54f", "#81c784"];
  const unique = [...new Set(["0", ...names])].sort();
  return unique.map((name, index) => ({
    id: name,
    name,
    color: palette[index % palette.length],
    visible: true,
    locked: false,
  }));
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
