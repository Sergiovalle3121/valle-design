/**
 * El GRUPO de un objeto moría en el ida y vuelta del snapshot del editor.
 *
 * EL DEFECTO. `CadEditorSnapshot` lleva `layers` y `tags` por objeto, pero NO
 * `group`. El documento canónico sí tiene sitio —una entidad `box` declara
 * `group?: string`, y `layoutToCadDocument` lo rellena—, así que el hueco está
 * exactamente en la proyección que el editor usa para reconstruir el documento
 * en cada guardado.
 *
 * Consecuencia: en un documento moderno, `snapshotDocument()` reproyecta y el
 * grupo desaparece. Sólo sobrevivía por la vía HEREDADA (`saveLegacy` escribe
 * `group: objectGroups[a.id]` en `assets`), que no corre cuando hay
 * `documentId`. Y al reabrir, los grupos se restauran leyendo `d.assets[].group`
 * — un campo que el guardado canónico nunca actualiza.
 *
 * Es la misma familia que las celdas: estado que la interfaz deja cambiar, que
 * ensucia el dibujo, que provoca un guardado con respuesta 200, y que no está
 * en lo guardado.
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

// Un layout heredado con grupo, capa y tags por asset: las tres cosas que el
// editor deja tocar por objeto.
const source = layoutToCadDocument({
  assets: [
    {
      id: "a1",
      kind: "wall",
      x: 0,
      y: 0,
      w: 100,
      h: 10,
      rotation: 0,
      layer: "WALLS",
      group: "Nave norte",
      tags: ["estructural", "fase-1"],
    },
    {
      id: "a2",
      kind: "wall",
      x: 0,
      y: 50,
      w: 100,
      h: 10,
      rotation: 0,
      layer: "WALLS",
    },
  ],
});

assert.equal(boxOf(source, "a1").group, "Nave norte", "el documento canónico SÍ tiene sitio para el grupo");

// ---------------------------------------------------------------------------
// El ida y vuelta que hace el editor en CADA guardado canónico
// ---------------------------------------------------------------------------

const reprojected = editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(source));

assert.equal(
  boxOf(reprojected, "a1").group,
  "Nave norte",
  "el grupo tiene que sobrevivir a la reproyección: era el defecto — la interfaz lo deja poner, el guardado responde 200 y el grupo no está en lo guardado",
);
assert.equal(
  boxOf(reprojected, "a1").layer,
  "WALLS",
  "la capa ya sobrevivía y tiene que seguir haciéndolo",
);
assert.deepEqual(
  boxOf(reprojected, "a1").tags,
  ["estructural", "fase-1"],
  "los tags ya sobrevivían y tienen que seguir haciéndolo",
);
assert.equal(
  boxOf(reprojected, "a2").group,
  undefined,
  "un objeto sin grupo no estrena uno vacío",
);

// Y el ida y vuelta es estable: reproyectar dos veces no degrada.
const twice = editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(reprojected));
assert.equal(
  boxOf(twice, "a1").group,
  "Nave norte",
  "guardar dos veces seguidas tampoco puede perderlo",
);

// ---------------------------------------------------------------------------
// Abrir: la reproyección contra el documento canónico NO puede mutilarlo
// ---------------------------------------------------------------------------

{
  // Al abrir, el editor construye una proyección desde el modelo heredado y la
  // mezcla con el documento canónico del servidor. Si esa proyección se arma
  // SIN grupos, `replaceEditorProjection` deja las cajas sin grupo — y el
  // siguiente guardado persiste la versión ya mutilada. Ése era el camino que
  // anulaba el arreglo entero, en silencio y sin tocar el guardado.
  const canonical = source;
  const snapshot = cadDocumentToEditorSnapshot(canonical);

  const withGroups = replaceEditorProjection(
    canonical,
    editorSnapshotToCadDocument(snapshot),
  );
  assert.equal(
    boxOf(withGroups, "a1").group,
    "Nave norte",
    "abrir con la proyección completa conserva el grupo del documento canónico",
  );

  const stripped = replaceEditorProjection(
    canonical,
    editorSnapshotToCadDocument({ ...snapshot, groups: {} }),
  );
  assert.equal(
    boxOf(stripped, "a1").group,
    undefined,
    "y si la proyección se arma sin grupos, los borra: por eso el camino de apertura tiene que pasarlos",
  );
}

console.log(
  "editor-snapshot: el grupo de un objeto sobrevive a la reproyección canónica, igual que su capa y sus tags",
);
