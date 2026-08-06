/**
 * Un documento no son sólo sus entidades.
 *
 * `mergeCadDocuments` fusionaba `entities` y clonaba TODO lo demás de `mine`.
 * Es decir: fusionar descartaba en silencio las capas, bloques, estilos,
 * layouts, xrefs, restricciones, publicaciones, opacas y manifiesto de pérdida
 * que hubiese guardado la otra sesión — y podía dejar una entidad suya
 * apuntando a una capa que sólo existía en su lado, que es una referencia rota
 * que el validador del servidor rechaza al guardar.
 *
 * Estos specs describen la fusión de DOCUMENTO: cada sección con su identidad
 * estable y la misma regla a tres vías, más el cierre referencial del
 * resultado.
 */
import { strict as assert } from "node:assert";
import {
  mergeCadDocuments,
  type CadSectionResolution,
} from "./cad-collaboration";
import type {
  CadBlockDefinition,
  CadDocument,
  CadEntity,
  CadExternalReference,
  CadLayerDef,
  CadPaperSpace,
} from "./cad-document";

function layer(id: string, color = "#ffffff"): CadLayerDef {
  return { id, name: id, color, visible: true, locked: false };
}

function line(
  id: string,
  layerId: string,
  x = 0,
): Extract<CadEntity, { type: "line" }> {
  return {
    id,
    type: "line",
    start: { x, y: 0, z: 0 },
    end: { x: x + 100, y: 0, z: 0 },
    layer: layerId,
  };
}

function paperSpace(id: string, entityIds: string[] = []): CadPaperSpace {
  return {
    id,
    name: id,
    entityIds,
    page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
  };
}

function block(id: string, entities: CadEntity[] = []): CadBlockDefinition {
  return { id, name: id, basePoint: { x: 0, y: 0, z: 0 }, entities };
}

function xref(id: string): CadExternalReference {
  return { id, name: id, uri: `tenant://assets/${id}`, loaded: true };
}

function document(patch: Partial<CadDocument> = {}): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm", gridSize: 100 },
    layers: [layer("0"), layer("WALLS")],
    entities: [line("wall-1", "WALLS")],
    history: [],
    modelSpace: { entityIds: ["wall-1"] },
    paperSpaces: [paperSpace("L1")],
    styles: { text: { Standard: { height: 2.5 } }, dimension: {}, table: {}, plot: {} },
    blocks: [block("DOOR")],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    ...patch,
  };
}

const base = document();

// ---------------------------------------------------------------------------
// 1. Lo que la otra sesión añadió en CUALQUIER sección sobrevive a la fusión
// ---------------------------------------------------------------------------

const theirs = document({
  layers: [layer("0"), layer("WALLS"), layer("ELEC", "#facc15")],
  entities: [line("wall-1", "WALLS"), line("elec-1", "ELEC", 500)],
  modelSpace: { entityIds: ["wall-1", "elec-1"] },
  paperSpaces: [paperSpace("L1"), paperSpace("L2")],
  blocks: [block("DOOR"), block("WINDOW")],
  styles: {
    text: { Standard: { height: 2.5 }, Titulo: { height: 7 } },
    dimension: {},
    table: {},
    plot: {},
  },
  constraints: [{ id: "c-1", kind: "horizontal", entityIds: ["wall-1"], enabled: true }],
  externalReferences: [xref("site-plan")],
  unsupportedEntities: [
    { id: "op-1", provider: "dxf", sourceType: "MESH", layer: "ELEC", raw: "0\nMESH\n", editable: false },
  ],
  lossManifest: [
    { code: "unsupported_entity", entityId: "op-1", detail: "MESH conservado en opacas", severity: "warning" },
  ],
  publications: [
    {
      id: "pub-1",
      paperSpaceIds: ["L1"],
      fileName: "L1.pdf",
      sha256: "a".repeat(64),
      bytes: 1024,
      publishedAt: "2026-08-06T10:00:00.000Z",
      publishedBy: "otra-sesion",
    },
  ],
});

// `mine` toca una sección distinta: añade una entidad propia y una capa propia.
const mine = document({
  layers: [layer("0"), layer("WALLS"), layer("COTAS", "#22d3ee")],
  entities: [line("wall-1", "WALLS"), line("cota-1", "COTAS", 900)],
  modelSpace: { entityIds: ["wall-1", "cota-1"] },
});

const merged = mergeCadDocuments(base, mine, theirs);

assert.equal(merged.unresolved.length, 0, "cambios disjuntos no colisionan");
assert.equal(
  merged.unresolvedSections.length,
  0,
  "secciones disjuntas tampoco colisionan",
);

const layerIds = merged.document.layers.map((item) => item.id).sort();
assert.deepEqual(
  layerIds,
  ["0", "COTAS", "ELEC", "WALLS"],
  "la capa que creó la otra sesión sobrevive a la fusión",
);
assert.deepEqual(
  merged.document.blocks.map((item) => item.id).sort(),
  ["DOOR", "WINDOW"],
  "el bloque que creó la otra sesión sobrevive a la fusión",
);
assert.deepEqual(
  merged.document.paperSpaces.map((item) => item.id).sort(),
  ["L1", "L2"],
  "el layout que creó la otra sesión sobrevive a la fusión",
);
assert.deepEqual(
  Object.keys(merged.document.styles.text).sort(),
  ["Standard", "Titulo"],
  "el estilo de texto que creó la otra sesión sobrevive a la fusión",
);
assert.deepEqual(
  merged.document.constraints.map((item) => item.id),
  ["c-1"],
  "la restricción que creó la otra sesión sobrevive a la fusión",
);
assert.deepEqual(
  merged.document.externalReferences.map((item) => item.id),
  ["site-plan"],
  "la referencia externa que creó la otra sesión sobrevive a la fusión",
);
assert.deepEqual(
  merged.document.unsupportedEntities.map((item) => item.id),
  ["op-1"],
  "las entidades opacas no desaparecen al fusionar",
);
assert.equal(
  merged.document.lossManifest.length,
  1,
  "el manifiesto de pérdida no desaparece al fusionar",
);
assert.deepEqual(
  merged.document.publications.map((item) => item.id),
  ["pub-1"],
  "la publicación de la otra sesión sobrevive a la fusión",
);

// ---------------------------------------------------------------------------
// 2. Cierre referencial: nada apunta a lo que no existe
// ---------------------------------------------------------------------------

assert.deepEqual(
  merged.referenceBreaks,
  [],
  "una fusión limpia no deja referencias colgantes",
);
const mergedLayers = new Set(merged.document.layers.map((item) => item.id));
for (const entity of merged.document.entities) {
  const entityLayer = (entity as { layer?: string }).layer;
  if (entityLayer !== undefined)
    assert.ok(
      mergedLayers.has(entityLayer),
      `la entidad ${entity.id} quedó en la capa inexistente ${entityLayer}`,
    );
}

// El orden de dibujo conserva el de `mine` y añade lo nuevo al frente/final,
// nunca alfabetizado.
assert.deepEqual(
  merged.document.modelSpace.entityIds,
  ["wall-1", "cota-1", "elec-1"],
  "el orden de dibujo propio se conserva y lo nuevo se añade",
);

// ---------------------------------------------------------------------------
// 3. Una capa que ambos cambiaron distinto es una colisión TIPADA, no un
//    ganador silencioso
// ---------------------------------------------------------------------------

const mineLayerColor = document({
  layers: [layer("0"), { ...layer("WALLS"), color: "#ff0000" }],
});
const theirsLayerColor = document({
  layers: [layer("0"), { ...layer("WALLS"), color: "#00ff00" }],
});
const layerClash = mergeCadDocuments(base, mineLayerColor, theirsLayerColor);
assert.deepEqual(
  layerClash.unresolvedSections,
  ["layers:WALLS"],
  "la capa que ambos cambiaron distinto queda sin decidir",
);
const clash = layerClash.sectionCollisions[0];
assert.equal(clash.section, "layers", "la colisión dice a qué sección pertenece");
assert.equal(clash.resourceId, "WALLS", "la colisión dice qué recurso es");
assert.deepEqual(clash.minePaths, ["color"], "la colisión dice qué cambié yo");
assert.deepEqual(clash.theirsPaths, ["color"], "la colisión dice qué cambió la otra sesión");
assert.deepEqual(
  clash.dependents,
  ["wall-1"],
  "la colisión dice qué depende del recurso en disputa",
);

const resolvedTheirs = mergeCadDocuments(
  base,
  mineLayerColor,
  theirsLayerColor,
  {},
  { "layers:WALLS": { strategy: "theirs" } satisfies CadSectionResolution },
);
assert.equal(resolvedTheirs.unresolvedSections.length, 0, "la elección cierra la colisión");
assert.equal(
  resolvedTheirs.document.layers.find((item) => item.id === "WALLS")?.color,
  "#00ff00",
  "quedarse con lo suyo es exacto",
);

// ---------------------------------------------------------------------------
// 4. Borrar una capa que la otra sesión sigue usando NO se aplica en silencio
// ---------------------------------------------------------------------------

const mineDropsLayer = document({
  layers: [layer("0")],
  entities: [],
  modelSpace: { entityIds: [] },
});
const theirsUsesLayer = document({
  entities: [line("wall-1", "WALLS"), line("wall-2", "WALLS", 300)],
  modelSpace: { entityIds: ["wall-1", "wall-2"] },
});
const dangling = mergeCadDocuments(base, mineDropsLayer, theirsUsesLayer);
assert.ok(
  dangling.referenceBreaks.length > 0,
  "borrar una capa que la otra sesión sigue usando se detecta, no se guarda roto",
);
assert.equal(dangling.referenceBreaks[0].section, "layers");
assert.equal(dangling.referenceBreaks[0].resourceId, "WALLS");
assert.ok(
  dangling.referenceBreaks[0].dependents.includes("wall-2"),
  "la rotura dice exactamente qué se queda huérfano",
);
assert.equal(
  dangling.ok,
  false,
  "una fusión con referencias rotas no se declara aplicable",
);

// ---------------------------------------------------------------------------
// 5. La fusión limpia SÍ es aplicable y sigue siendo determinista
// ---------------------------------------------------------------------------

assert.equal(merged.ok, true, "una fusión sin colisiones ni roturas es aplicable");
assert.equal(
  JSON.stringify(mergeCadDocuments(base, mine, theirs).document),
  JSON.stringify(merged.document),
  "la fusión es determinista",
);

console.log("cad document-merge section specs passed");
