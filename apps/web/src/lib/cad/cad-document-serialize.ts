/**
 * Versionado + serialización determinista del documento canónico.
 *
 * Salió de `cad-document.ts` por el trinquete de tamaño (`check-monolith-budget`),
 * igual que `cad-document-stats.ts`, `-migrate.ts` y `-projection.ts`: el
 * contrato no cambia y `cad-document.ts` sigue siendo la puerta pública
 * (reexporta `commitChange` y `serializeCadDocument`). Importa de
 * `cad-document.ts` SÓLO tipos, que se borran al compilar: no hay ciclo.
 */
import type { CadDocument, CadEntity } from "./cad-document";
import { byId, byName } from "./cad-document-shared";

/**
 * Devuelve una copia del documento con la versión incrementada y un registro
 * añadido al historial. Inmutable: no muta el documento de entrada.
 */
export function commitChange(doc: CadDocument, label: string): CadDocument {
  const version = doc.meta.version + 1;
  return {
    ...doc,
    meta: { ...doc.meta, version },
    entities: doc.entities.map((e) => ({ ...e })),
    layers: doc.layers.map((l) => ({ ...l })),
    modelSpace: { entityIds: [...doc.modelSpace.entityIds] },
    paperSpaces: structuredClone(doc.paperSpaces),
    styles: structuredClone(doc.styles),
    blocks: structuredClone(doc.blocks),
    constraints: structuredClone(doc.constraints),
    ...(doc.parameters ? { parameters: structuredClone(doc.parameters) } : {}),
    externalReferences: structuredClone(doc.externalReferences),
    unsupportedEntities: structuredClone(doc.unsupportedEntities),
    lossManifest: structuredClone(doc.lossManifest),
    publications: structuredClone(doc.publications),
    collaboration: doc.collaboration ? structuredClone(doc.collaboration) : undefined,
    ...(doc.cells ? { cells: structuredClone(doc.cells) } : {}),
    ...(doc.imageDefinitions ? { imageDefinitions: structuredClone(doc.imageDefinitions) } : {}),
    ...(doc.layerStates ? { layerStates: structuredClone(doc.layerStates) } : {}),
    ...(doc.dxfBackgroundLossManifest ? { dxfBackgroundLossManifest: structuredClone(doc.dxfBackgroundLossManifest) } : {}),
    history: [...doc.history, { version, label }],
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function orderedEntity(e: CadEntity): Record<string, unknown> {
  // Orden recursivo de claves sin cambiar la forma del schema. El serializado
  // también es un formato de reload; no se aplana ni descarta contexto v3.
  return stableValue(e) as Record<string, unknown>;
}

/**
 * Serializa el documento a un JSON determinista: entidades y capas ordenadas
 * por id, claves en orden fijo. Dos documentos con el MISMO contenido producen
 * el MISMO texto aunque las entradas llegaran en otro orden — base para diffs y
 * hashes de versión reproducibles.
 */
export function serializeCadDocument(doc: CadDocument): string {
  const payload = {
    // La huella y la rejilla viajan con el documento: reconstruir `meta` con
    // sólo {version, schema, unit} las borraba en CADA guardado, y como este
    // serializado es también el formato de recarga, el dibujo se reabría con
    // el lienzo y el paso de rejilla del default legacy.
    meta: {
      version: doc.meta.version,
      schema: doc.meta.schema,
      unit: doc.meta.unit,
      ...(doc.meta.footprintW === undefined ? {} : { footprintW: doc.meta.footprintW }),
      ...(doc.meta.footprintH === undefined ? {} : { footprintH: doc.meta.footprintH }),
      ...(doc.meta.gridSize === undefined ? {} : { gridSize: doc.meta.gridSize }),
    },
    layers: [...doc.layers].sort(byId).map(stableValue),
    entities: [...doc.entities].sort(byId).map(orderedEntity),
    history: doc.history.map((h) => ({ version: h.version, label: h.label })),
    // NO ordenar: `entityIds` ES el orden de dibujo (draw order). Ordenarlo
    // alfabéticamente destruía en cada guardado el z-order del dibujo, y con
    // él Bring to front / Send to back, el apilado de hatches, wipeouts y
    // anotaciones. El determinismo no se pierde: dos documentos con el mismo
    // contenido siguen produciendo el mismo texto, porque el orden de dibujo
    // ES contenido — si difiere, los documentos son legítimamente distintos.
    modelSpace: { entityIds: [...doc.modelSpace.entityIds] },
    // NO ordenar: el orden de las láminas ES el orden del juego de planos que
    // compuso el usuario, igual que `entityIds` es el z-order del modelo.
    paperSpaces: doc.paperSpaces.map(stableValue),
    styles: stableValue(doc.styles),
    // La TABLA de bloques sí es un índice de definiciones (se resuelve por
    // nombre), así que ordenarla es canonicalización legítima. Las entidades
    // DENTRO de un bloque no: ese array es su z-order interno.
    blocks: [...doc.blocks].sort(byId).map((block) => stableValue({
      ...block,
      entities: [...block.entities],
    })),
    constraints: [...doc.constraints].sort(byId).map(stableValue),
    ...(doc.parameters ? { parameters: [...doc.parameters].sort(byName).map(stableValue) } : {}),
    externalReferences: [...doc.externalReferences].sort(byId).map(stableValue),
    unsupportedEntities: [...doc.unsupportedEntities].sort(byId).map(stableValue),
    lossManifest: doc.lossManifest.map(stableValue),
    publications: doc.publications.map(stableValue),
    collaboration: doc.collaboration ? stableValue(doc.collaboration) : undefined,
    ...(doc.cells ? { cells: [...doc.cells].sort(byId).map(stableValue) } : {}),
    // Catálogo, no orden de dibujo: ordenarlo por id es canonicalización
    // legítima, igual que con `blocks`.
    ...(doc.imageDefinitions
      ? { imageDefinitions: [...doc.imageDefinitions].sort(byId).map(stableValue) }
      : {}),
    // Catálogo por NOMBRE: ordenarlo es canonicalización legítima, como blocks.
    ...(doc.layerStates ? { layerStates: [...doc.layerStates].sort(byName).map(stableValue) } : {}),
    ...(doc.dxfBackgroundLossManifest ? { dxfBackgroundLossManifest: doc.dxfBackgroundLossManifest.map(stableValue) } : {}),
  };
  return JSON.stringify(payload);
}
