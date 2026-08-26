/**
 * Documentos canónicos de las suites REALES (studio-real-api y afines):
 * fixtures puros de datos, sin red ni Playwright. Viven aparte para que la
 * suite serial — que tiene asignación de tamaño en el presupuesto de
 * monolito — crezca en ASERTOS y no en corpus.
 */
export function canonicalDocument(radius = 120) {
  return {
    meta: {
      version: 1,
      schema: 3,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "REAL", name: "REAL", color: "#60a5fa", visible: true, locked: false },
    ],
    entities: [
      {
        id: "real-arc",
        type: "arc",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius,
        startAngle: 0,
        endAngle: 180,
        layer: "REAL",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["real-arc"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

export function largeCanonicalDocument(entityCount = 12_000) {
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `bulk-${String(index).padStart(6, "0")}`,
    type: "arc" as const,
    center: {
      x: (index % 1_000) * 20 + 10,
      y: Math.floor(index / 1_000) * 20 + 10,
      z: 0,
    },
    radius: 8,
    startAngle: 0,
    endAngle: 180,
    layer: "REAL",
    context: {
      metadata: {
        corpus: `professional-large-document-${String(index).padStart(6, "0")}`,
      },
    },
  }));
  return {
    ...canonicalDocument(),
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  };
}
