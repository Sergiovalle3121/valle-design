/**
 * El `context` de una entidad moría en la reproyección de cada guardado.
 *
 * EL DEFECTO. `CadEntityContext` guarda cosas que NO son decorativas:
 *
 *   presentation  color, tipo de línea y grosor explícitos por entidad —
 *                 anulaciones ByLayer/ByBlock, o sea núcleo de un CAD
 *   provenance    de qué proveedor y qué fichero vino al importar
 *   handle        el identificador estable del DXF de origen
 *   elevation     la cota Z del objeto
 *   metadata      lo que cuelgue el pack industrial
 *   businessLink  el vínculo con la entidad de negocio
 *
 * `CadEditorSnapshot` no lo llevaba —cero menciones— y
 * `replaceEditorProjection` REEMPLAZA en bloque las entidades `box`, `station`,
 * `text` y `connector` desde la proyección, conservando sólo las demás. Así que
 * para esos cuatro tipos el `context` se perdía en cada `snapshotDocument()`:
 * cada guardado del estudio moderno borraba el color explícito de un muro y la
 * procedencia de todo lo importado por DXF.
 *
 * Misma familia que las celdas y los grupos, pero peor: aquí lo que se pierde
 * lo puso el usuario con intención (una anulación de color) o lo necesita el
 * round-trip de importación (handle y provenance).
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
  type CadEntityContext,
} from "./cad-document";

const CONTEXT: CadEntityContext = {
  handle: "1A2B",
  elevation: 250,
  presentation: {
    color: { source: "explicit", value: "#ff0066" },
    linetype: { source: "explicit", value: "DASHED", scale: 2 },
    lineweight: { source: "explicit", value: 50 },
  },
  provenance: { provider: "dxf", sourceId: "planta-baja.dxf" },
  metadata: { fase: "1", certificado: true },
};

function entityOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(entity, `falta la entidad ${id}`);
  return entity;
}

const source: CadDocument = (() => {
  const document = layoutToCadDocument({
    assets: [
      { id: "a1", kind: "wall", x: 0, y: 0, w: 100, h: 10, rotation: 0, layer: "WALLS" },
    ],
    stations: [{ id: "s1", x: 10, y: 10, w: 20, h: 20, rotation: 0 }],
  });
  // Un documento REAL trae context en las entidades importadas o retocadas.
  return {
    ...document,
    entities: document.entities.map((entity) =>
      entity.id === "a1" || entity.id === "s1"
        ? ({ ...entity, context: structuredClone(CONTEXT) } as typeof entity)
        : entity,
    ),
  };
})();

assert.deepEqual(
  entityOf(source, "a1").context,
  CONTEXT,
  "el esquema canónico SÍ tiene sitio para el context",
);

// ---------------------------------------------------------------------------
// El ida y vuelta que hace el editor en CADA guardado canónico
// ---------------------------------------------------------------------------

const reprojected = replaceEditorProjection(
  source,
  editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(source)),
);

assert.deepEqual(
  entityOf(reprojected, "a1").context,
  CONTEXT,
  "una BOX no puede perder su color explícito ni su procedencia al guardar",
);
assert.deepEqual(
  entityOf(reprojected, "s1").context,
  CONTEXT,
  "una STATION tampoco: es uno de los cuatro tipos que la reproyección reemplaza en bloque",
);

// Lo importante, en detalle: el override de color es una decisión del usuario.
const presentation = entityOf(reprojected, "a1").context?.presentation;
assert.equal(presentation?.color?.value, "#ff0066");
assert.equal(presentation?.color?.source, "explicit");
assert.equal(presentation?.linetype?.value, "DASHED");
assert.equal(presentation?.lineweight?.value, 50);
// Y la procedencia es lo que sostiene el round-trip de importación.
assert.equal(entityOf(reprojected, "a1").context?.provenance?.provider, "dxf");
assert.equal(entityOf(reprojected, "a1").context?.handle, "1A2B");

// Guardar dos veces seguidas tampoco puede degradarlo.
const twice = replaceEditorProjection(
  reprojected,
  editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(reprojected)),
);
assert.deepEqual(
  entityOf(twice, "a1").context,
  CONTEXT,
  "ni al segundo guardado",
);

// Una entidad sin context no estrena uno vacío.
const plain = layoutToCadDocument({
  assets: [{ id: "b1", kind: "wall", x: 0, y: 0, w: 10, h: 10, rotation: 0 }],
});
assert.equal(
  entityOf(
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(plain)),
    "b1",
  ).context,
  undefined,
  "sin context no se inventa uno",
);

console.log(
  "editor-snapshot: el context de una entidad —color explícito, procedencia, handle— sobrevive al guardado canónico",
);
