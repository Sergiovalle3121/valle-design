/** Documento CAD canónico y adaptador sin pérdida (CAD-NEXT-010). */
import { strict as assert } from "node:assert";
import {
  cadDocumentStats,
  cadDocumentToLayout,
  commitChange,
  layoutToCadDocument,
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  CAD_DOCUMENT_SCHEMA,
  type CadDocument,
  type LayoutInput,
} from "./cad-document";

// --- fixture representativa: caja, círculo, texto, cota y conector ----------
const layout: LayoutInput = {
  assets: [
    { id: "a2", kind: "wall", x: 0, y: 0, w: 300, h: 15, rotation: 0, label: "Muro", layer: "architecture" },
    { id: "a1", kind: "zone", x: 20, y: 30, w: 24, h: 24, rotation: 0, shape: "circle", label: "Columna", group: "g1" },
    { id: "a3", kind: "zone", x: 100, y: 100, w: 50, h: 40, rotation: 45 },
  ],
  annotations: [
    { id: "n1", type: "text", x: 5, y: 5, text: "Nota" },
    { id: "d1", type: "dim", x: 0, y: 0, x2: 300, y2: 0, text: "300 mm" },
  ],
  connectors: [{ from: "s1", to: "s2", kind: "conveyor" }],
  layers: [
    { id: "architecture", name: "Arquitectura", color: "#888", visible: true, locked: false },
    { id: "layout", name: "Layout", color: "#4af", visible: true, locked: false },
  ],
};

// --- round-trip sin pérdida -------------------------------------------------
const doc = layoutToCadDocument(layout, { unit: "mm" });
const back = cadDocumentToLayout(doc);

// El asset redondo conserva su forma, etiqueta y grupo.
const circle = back.assets.find((a) => a.id === "a1");
assert.ok(circle, "el círculo sobrevive el round-trip");
assert.equal(circle?.shape, "circle", "shape:circle preservado");
assert.equal(circle?.group, "g1", "grupo preservado");
assert.equal(circle?.label, "Columna", "etiqueta preservada");

// Un asset sin capa NO gana una capa espuria (default '0' es implícito).
const plain = back.assets.find((a) => a.id === "a3");
assert.equal(plain?.layer, undefined, "asset sin capa vuelve sin capa");
assert.equal(plain?.rotation, 45, "rotación preservada");
assert.equal(plain?.shape, undefined, "asset rectangular no gana shape");

// La cota recupera su segundo punto.
const dim = back.annotations.find((a) => a.id === "d1");
assert.equal(dim?.type, "dim");
assert.equal(dim?.x2, 300, "x2 de la cota preservado");
assert.equal(dim?.text, "300 mm", "texto de la cota preservado");

// El conector recupera from/to/kind.
assert.equal(back.connectors.length, 1, "un conector");
assert.equal(back.connectors[0].from, "s1");
assert.equal(back.connectors[0].kind, "conveyor");

// Igualdad estructural exacta entrada↔salida (normalizando el orden por id).
const norm = (l: Required<LayoutInput>) => ({
  assets: [...l.assets].sort((a, b) => (a.id < b.id ? -1 : 1)),
  annotations: [...l.annotations].sort((a, b) => (a.id < b.id ? -1 : 1)),
  connectors: [...l.connectors].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1)),
  layers: [...l.layers].sort((a, b) => (a.id < b.id ? -1 : 1)),
  stations: [...l.stations].sort((a, b) => (a.id < b.id ? -1 : 1)),
});
assert.deepEqual(
  norm(back),
  norm({
    assets: layout.assets ?? [],
    annotations: layout.annotations ?? [],
    connectors: layout.connectors ?? [],
    layers: layout.layers ?? [],
    stations: [],
  }),
  "round-trip idéntico al layout original",
);

// --- determinismo: el orden de entrada no cambia el serializado ------------
const shuffled: LayoutInput = {
  assets: [layout.assets![2], layout.assets![0], layout.assets![1]],
  annotations: [layout.annotations![1], layout.annotations![0]],
  connectors: layout.connectors,
  layers: [layout.layers![1], layout.layers![0]],
};
assert.equal(
  serializeCadDocument(layoutToCadDocument(shuffled, { unit: "mm" })),
  serializeCadDocument(doc),
  "mismo contenido en otro orden → mismo texto serializado",
);
assert.deepEqual(
  norm(cadDocumentToLayout(parseCadDocument(serializeCadDocument(doc)))),
  norm(back),
  "serializar → parsear → proyectar conserva cajas, círculo, texto, cota y conector",
);

// --- estadísticas -----------------------------------------------------------
const stats = cadDocumentStats(doc);
assert.equal(stats.box, 2, "2 cajas");
assert.equal(stats.circle, 1, "1 círculo de primera clase");
assert.equal(stats.text, 1, "1 texto");
assert.equal(stats.dimension, 1, "1 cota");
assert.equal(stats.connector, 1, "1 conector");

// --- versionado inmutable ---------------------------------------------------
const v2 = commitChange(doc, "mover columna");
assert.equal(doc.meta.version, 1, "el documento original no se muta");
assert.equal(v2.meta.version, 2, "commitChange incrementa la versión");
assert.equal(v2.history.at(-1)?.label, "mover columna", "el cambio queda en el historial");
assert.equal(doc.history.length, 0, "el historial original sigue vacío");
// El contenido geométrico no cambia al versionar.
assert.equal(
  serializeCadDocument({ ...v2, meta: doc.meta, history: [] }),
  serializeCadDocument(doc),
  "versionar no altera entidades ni capas",
);

// --- v2 (CAD-NEXT-011): tags en cajas + colocaciones de estación -------------
// El snapshot de undo del editor lleva assets con tags Y estaciones colocadas;
// el documento canónico debe sostener AMBOS sin pérdida para poder ser la
// fuente de verdad del undo/persistencia.
const snapshotLike = layoutToCadDocument({
  assets: [
    { id: "a1", kind: "workbench", x: 0, y: 0, w: 100, h: 50, rotation: 0, tags: ["use:smt", "requires:power"] },
  ],
  stations: [
    { id: "st1", x: 500, y: 200, w: 1200, h: 800, rotation: 90 },
    { id: "st0", x: 0, y: 0, w: 1000, h: 700, rotation: 0 },
  ],
});
const snapshotBack = cadDocumentToLayout(snapshotLike);
assert.deepEqual(
  snapshotBack.assets[0]?.tags,
  ["use:smt", "requires:power"],
  "los tags sobreviven el round-trip",
);
assert.equal(snapshotBack.stations.length, 2, "las estaciones sobreviven el round-trip");
assert.deepEqual(
  snapshotBack.stations.find((s) => s.id === "st1"),
  { id: "st1", x: 500, y: 200, w: 1200, h: 800, rotation: 90 },
  "cada colocación conserva su geometría y rotación",
);
assert.equal(cadDocumentStats(snapshotLike).station, 2, "stats cuenta estaciones");
// Determinismo: los tags y estaciones también serializan estable.
const snapshotShuffled = layoutToCadDocument({
  stations: [
    { id: "st0", x: 0, y: 0, w: 1000, h: 700, rotation: 0 },
    { id: "st1", x: 500, y: 200, w: 1200, h: 800, rotation: 90 },
  ],
  assets: [
    { id: "a1", kind: "workbench", x: 0, y: 0, w: 100, h: 50, rotation: 0, tags: ["use:smt", "requires:power"] },
  ],
});
assert.equal(
  serializeCadDocument(snapshotShuffled),
  serializeCadDocument(snapshotLike),
  "tags/estaciones en otro orden → mismo texto serializado",
);
// Compatibilidad: un layout v1 (sin tags ni estaciones) sigue redondo.
const v1Back = cadDocumentToLayout(layoutToCadDocument({ assets: layout.assets }));
assert.equal(v1Back.assets.length, layout.assets!.length, "layout v1 sigue redondo");
assert.ok(v1Back.assets.every((a) => a.tags === undefined), "sin tags no se inventan tags");
assert.deepEqual(v1Back.stations, [], "sin estaciones no se inventan estaciones");

// --- v3: migración aditiva + entidades de primera clase --------------------
const legacyV2 = {
  meta: { version: 7, schema: 2, unit: "mm" },
  layers: [],
  entities: [{ id: "legacy-line", type: "box", kind: "wall", x: 0, y: 0, w: 100, h: 10, rotation: 0, layer: "0", shape: "rect" }],
  history: [{ version: 7, label: "legacy" }],
};
const migrated = migrateCadDocument(legacyV2);
assert.equal(migrated.meta.schema, CAD_DOCUMENT_SCHEMA, "v2 migra a schema vigente");
assert.deepEqual(migrated.modelSpace.entityIds, ["legacy-line"], "v2 gana model space determinista");
assert.deepEqual(migrated.constraints, [], "v2 gana constraint graph vacío");
assert.deepEqual(migrated.lossManifest, [], "v2 gana loss manifest explícito");

const professional: CadDocument = {
  ...migrated,
  entities: [
    {
      id: "line-1",
      type: "line",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      layer: "A-WALL",
      context: {
        handle: "1A",
        presentation: { color: { source: "byLayer" }, linetype: { source: "byLayer" } },
        metadata: { discipline: "architecture" },
      },
    },
    {
      id: "insert-1",
      type: "insert",
      block: "door",
      insertion: { x: 500, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      attributes: { MARK: "D-01" },
      layer: "A-DOOR",
    },
  ],
  modelSpace: { entityIds: ["line-1", "insert-1"] },
  blocks: [{
    id: "door",
    name: "Door",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: [],
    attributes: { MARK: { required: true } },
  }],
  constraints: [{
    id: "horizontal-line-1",
    kind: "horizontal",
    entityIds: ["line-1"],
    enabled: true,
  }],
  unsupportedEntities: [{
    id: "proxy-1",
    provider: "dxf",
    sourceType: "ACAD_PROXY_ENTITY",
    raw: "opaque-payload",
    editable: false,
  }],
  lossManifest: [{
    code: "proxy_preserved",
    entityId: "proxy-1",
    sourceType: "ACAD_PROXY_ENTITY",
    detail: "Preserved opaquely.",
    severity: "info",
  }],
};
const professionalText = serializeCadDocument(professional);
const professionalBack = parseCadDocument(professionalText);
assert.equal(serializeCadDocument(professionalBack), professionalText, "v3 round-trip conserva estilos, bloques, constraints y passthrough");
assert.equal(professionalBack.unsupportedEntities[0]?.raw, "opaque-payload", "passthrough opaco permanece intacto");
assert.equal(cadDocumentStats(professionalBack).line, 1, "stats cuenta entidades v3");
assert.throws(
  () => migrateCadDocument({ ...legacyV2, entities: [{ ...legacyV2.entities[0], x: Number.NaN }] }),
  /non-finite/,
  "rechaza coordenadas no finitas",
);

const legacyLeader = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [
    { id: "ld_leader", type: "dimension", a: { x: 0, y: 0 }, b: { x: 100, y: 80 }, layer: "NOTES" },
    { id: "ld_dogleg", type: "dimension", a: { x: 100, y: 80 }, b: { x: 260, y: 80 }, layer: "NOTES" },
    { id: "nt_content", type: "text", x: 260, y: 80, text: "Legacy note", layer: "NOTES" },
  ],
});
assert.equal(legacyLeader.entities.length, 1, "legacy DIM+DIM+TEXT folds into one entity only when unique");
assert.equal(legacyLeader.entities[0].type, "mleader");
if (legacyLeader.entities[0].type === "mleader") {
  assert.deepEqual(legacyLeader.entities[0].vertices, [{ x: 0, y: 0, z: 0 }, { x: 100, y: 80, z: 0 }]);
  assert.equal(legacyLeader.entities[0].text, "Legacy note");
  assert.equal(legacyLeader.entities[0].associationStatus, "detached");
}
const ambiguousLeader = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [
    { id: "ld_leader", type: "dimension", a: { x: 0, y: 0 }, b: { x: 100, y: 80 }, layer: "NOTES" },
    { id: "ld_dogleg", type: "dimension", a: { x: 100, y: 80 }, b: { x: 260, y: 80 }, layer: "NOTES" },
    { id: "nt_content_a", type: "text", x: 260, y: 80, text: "A", layer: "NOTES" },
    { id: "nt_content_b", type: "text", x: 260, y: 80, text: "B", layer: "NOTES" },
  ],
});
assert.equal(ambiguousLeader.entities.some((entity) => entity.type === "mleader"), false);
assert.equal(ambiguousLeader.lossManifest.some((entry) => entry.code === "legacy_mleader_ambiguous"), true);

console.log("cad cad-document specs passed");
