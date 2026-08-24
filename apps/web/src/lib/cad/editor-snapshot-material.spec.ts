/**
 * El `materialId` de un activo sobrevive la reproyección canónica, igual que
 * su capa, grupo, tags y notas — mismo defecto potencial que ya se cerró para
 * esos cuatro campos (`editor-snapshot-group.spec.ts`), verificado ahora para
 * el quinto: sin esta ida y vuelta, elegir una textura por la paleta se
 * perdería en el primer guardado canónico (`snapshotDocument()` corre en
 * CADA orden, no sólo al guardar de verdad).
 */
import { strict as assert } from "node:assert";
import {
  cadDocumentToEditorSnapshot,
  editorSnapshotToCadDocument,
} from "./editor-snapshot";
import {
  layoutToCadDocument,
  replaceEditorProjection,
  type CadDocument,
} from "./cad-document";

function boxOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(entity && entity.type === "box", `se esperaba una box ${id}`);
  return entity;
}

function circleOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(entity && entity.type === "circle", `se esperaba un circle ${id}`);
  return entity;
}

// Un muro con textura elegida, uno sin ella (no debe estrenar un valor), y
// una mesa redonda (shape:"circle", que persiste por la vía `legacy` aparte).
const source = layoutToCadDocument({
  assets: [
    {
      id: "muro-1",
      kind: "wall",
      x: 0,
      y: 0,
      w: 4000,
      h: 200,
      rotation: 0,
      layer: "WALLS",
      materialId: "brick-red",
    },
    {
      id: "muro-2",
      kind: "wall",
      x: 0,
      y: 500,
      w: 4000,
      h: 200,
      rotation: 0,
      layer: "WALLS",
    },
    {
      id: "mesa-1",
      kind: "workbench",
      x: 1000,
      y: 1000,
      w: 800,
      h: 800,
      rotation: 0,
      shape: "circle",
      materialId: "wood-oak",
    },
  ],
});

assert.equal(boxOf(source, "muro-1").materialId, "brick-red", "el documento canónico SÍ tiene sitio para el material");
assert.equal(circleOf(source, "mesa-1").legacy?.materialId, "wood-oak", "también en el sidecar legacy de circle");

// ---------------------------------------------------------------------------
// El ida y vuelta que hace el editor en CADA guardado canónico
// ---------------------------------------------------------------------------

const reprojected = editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(source));

assert.equal(
  boxOf(reprojected, "muro-1").materialId,
  "brick-red",
  "el material tiene que sobrevivir a la reproyección — si no, la paleta lo deja elegir y el guardado lo pierde",
);
assert.equal(
  boxOf(reprojected, "muro-2").materialId,
  undefined,
  "un activo sin material elegido no estrena uno vacío",
);
assert.equal(
  boxOf(reprojected, "muro-1").layer,
  "WALLS",
  "la capa ya sobrevivía y tiene que seguir haciéndolo",
);
assert.equal(
  circleOf(reprojected, "mesa-1").legacy?.materialId,
  "wood-oak",
  "el material de un activo circular sobrevive por su propio sidecar",
);

// Y el ida y vuelta es estable: reproyectar dos veces no degrada.
const twice = editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(reprojected));
assert.equal(boxOf(twice, "muro-1").materialId, "brick-red", "guardar dos veces seguidas tampoco puede perderlo");
assert.equal(circleOf(twice, "mesa-1").legacy?.materialId, "wood-oak");

// ---------------------------------------------------------------------------
// Abrir: la reproyección contra el documento canónico NO puede mutilarlo
// ---------------------------------------------------------------------------

{
  const canonical = source;
  const snapshot = cadDocumentToEditorSnapshot(canonical);

  const withMaterials = replaceEditorProjection(canonical, editorSnapshotToCadDocument(snapshot));
  assert.equal(
    boxOf(withMaterials, "muro-1").materialId,
    "brick-red",
    "abrir con la proyección completa conserva el material del documento canónico",
  );

  const stripped = replaceEditorProjection(
    canonical,
    editorSnapshotToCadDocument({
      ...snapshot,
      assets: snapshot.assets.map((asset) => ({ ...asset, materialId: undefined })),
    }),
  );
  assert.equal(
    boxOf(stripped, "muro-1").materialId,
    undefined,
    "y si la proyección se arma sin materiales, los borra: por eso el camino de apertura tiene que pasarlos",
  );
}

console.log(
  "editor-snapshot: el material de un activo (box y circle) sobrevive a la reproyección canónica, igual que su capa, grupo, tags y notas",
);
