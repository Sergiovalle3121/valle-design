/** Snapshot del editor ↔ CadDocument sin pérdida (CAD-NEXT-011 pieza 2). */
import { strict as assert } from "node:assert";
import {
  cadDocumentToEditorSnapshot,
  editorSnapshotToCadDocument,
  joinTags,
  splitTags,
  type CadEditorSnapshot,
} from "./editor-snapshot";
import { cadDocumentStats, serializeCadDocument } from "./cad-document";

// --- tags: normalización invertible -----------------------------------------
assert.deepEqual(splitTags("wall, architecture,drafted"), ["wall", "architecture", "drafted"]);
assert.deepEqual(splitTags(undefined), []);
assert.equal(joinTags(["wall", "architecture"]), "wall, architecture");

// --- golden round-trip: un snapshot realista del editor ----------------------
// Dos estaciones (una con capa asignada y tags), assets con círculo/capas/tags,
// nota + cota (la cota con capa asignada) y un conector.
const snapshot: CadEditorSnapshot = {
  placements: [
    ["st1", { x: 0, y: 0, w: 1200, h: 800, rotation: 0 }],
    ["st2", { x: 2000, y: 0, w: 1000, h: 700, rotation: 90 }],
  ],
  assets: [
    { id: "a1", kind: "workbench", x: 100, y: 50, w: 1500, h: 800, rotation: 0, label: "Mesa" },
    { id: "a2", kind: "zone", x: 0, y: 2000, w: 3000, h: 3000, rotation: 45, shape: "circle" },
  ],
  annotations: [
    { id: "n1", type: "text", x: 10, y: 20, text: "Nota", color: "#fff" },
    { id: "d1", type: "dim", x: 0, y: 0, x2: 5000, y2: 0, text: "5000 mm" },
  ],
  connectors: [{ from: "st1", to: "st2", kind: "conveyor" }, { from: "a1", to: "st1" }],
  layers: { a1: "equipment", st2: "layout", d1: "measurements" },
  tags: { a1: "use:smt, requires:power", st2: "linea-a, cuello-botella" },
};

const doc = editorSnapshotToCadDocument(snapshot);
const stats = cadDocumentStats(doc);
assert.equal(stats.station, 2, "2 estaciones en el documento");
assert.equal(stats.box, 2, "2 assets");
assert.equal(stats.text, 1, "1 nota");
assert.equal(stats.dimension, 1, "1 cota");
assert.equal(stats.connector, 2, "2 conectores");

const back = cadDocumentToEditorSnapshot(doc);
const norm = (s: CadEditorSnapshot) => ({
  placements: [...s.placements].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  assets: [...s.assets].sort((a, b) => (a.id < b.id ? -1 : 1)),
  annotations: [...s.annotations].sort((a, b) => (a.id < b.id ? -1 : 1)),
  connectors: [...s.connectors].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1)),
  layers: s.layers,
  tags: s.tags,
});
assert.deepEqual(norm(back), norm(snapshot), "round-trip del snapshot sin pérdida");

// --- el documento es determinista: mismo snapshot → mismo texto --------------
assert.equal(
  serializeCadDocument(editorSnapshotToCadDocument(snapshot)),
  serializeCadDocument(doc),
  "dos conversiones del mismo snapshot serializan idéntico",
);

// --- capa por defecto no colisiona con capas del editor ----------------------
// Un asset SIN capa asignada no debe volver con una entrada en layers.
const bare: CadEditorSnapshot = {
  placements: [["st9", { x: 0, y: 0, w: 100, h: 100, rotation: 0 }]],
  assets: [{ id: "a9", kind: "buffer", x: 0, y: 0, w: 10, h: 10, rotation: 0 }],
  annotations: [],
  connectors: [],
  layers: {},
  tags: {},
};
const bareBack = cadDocumentToEditorSnapshot(editorSnapshotToCadDocument(bare));
assert.deepEqual(bareBack.layers, {}, "sin asignaciones no se inventan capas");
assert.deepEqual(bareBack.tags, {}, "sin tags no se inventan tags");
assert.equal(bareBack.placements.length, 1, "la estación pelona sobrevive");

console.log("cad editor-snapshot specs passed");
