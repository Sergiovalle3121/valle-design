/**
 * Las celdas se guardaban sólo por la vía HEREDADA.
 *
 * EL DEFECTO. `createCell` y `deleteCell` mutaban `cellsRef`, llamaban a
 * `markDirty()` y ya está. En un documento moderno (`/studio/[documentId]`)
 * `save()` va por `runCanonicalSave` → `snapshotDocument()` →
 * `editorSnapshotToCadDocument`, y ahí las celdas NO existían: `CadDocument` no
 * tenía dónde ponerlas. El único sitio que las escribía era `saveLegacy`, que
 * sólo corre cuando NO hay `documentId`.
 *
 * O sea: crear una celda ensuciaba el dibujo, disparaba un autosave que
 * respondía 200 y limpiaba `dirty` — con la celda fuera de lo guardado. No es
 * sólo perder trabajo: es perderlo con confirmación positiva de que se guardó.
 * Y sin entrada de historial, así que deshacer tampoco la alcanzaba.
 *
 * Las celdas son dominio industrial, no núcleo arquitectónico, así que entran
 * como sección OPCIONAL: un documento que nunca las tuvo se serializa igual que
 * antes, y uno que las tiene las conserva por guardado, recarga y fusión.
 */
import { strict as assert } from "node:assert";
import {
  CAD_DOCUMENT_SCHEMA,
  commitChange,
  migrateCadDocument,
  serializeCadDocument,
  type CadCellDefinition,
  type CadDocument,
} from "./cad-document";

function baseDocument(patch: Partial<CadDocument> = {}): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    modelSpace: { entityIds: [] },
    ...patch,
  } as unknown as CadDocument);
}

const cells: CadCellDefinition[] = [
  { id: "cell-1", name: "Celda 1", color: "#f59e0b", stationIds: ["st-a", "st-b"] },
  { id: "cell-2", name: "Celda 2", color: "#34d399", stationIds: [] },
];

// ---------------------------------------------------------------------------
// 1. Una celda sobrevive a `commitChange`, que es por donde pasa todo guardado
// ---------------------------------------------------------------------------

{
  const committed = commitChange(baseDocument({ cells }), "crear celda");
  assert.deepEqual(
    committed.cells?.map((cell) => cell.id),
    ["cell-1", "cell-2"],
    "guardar no puede tirar las celdas: era exactamente el defecto",
  );
  assert.deepEqual(
    committed.cells?.[0].stationIds,
    ["st-a", "st-b"],
    "y con sus estaciones, no vacías",
  );
  // Copia profunda: mutar el resultado no puede alcanzar al documento previo.
  const source = baseDocument({ cells });
  const clone = commitChange(source, "x");
  clone.cells![0].stationIds.push("intruso");
  assert.deepEqual(
    source.cells?.[0].stationIds,
    ["st-a", "st-b"],
    "`commitChange` clona: el documento anterior no se muta por detrás",
  );
}

// ---------------------------------------------------------------------------
// 2. Sobrevive a la migración, ida y vuelta
// ---------------------------------------------------------------------------

{
  const migrated = migrateCadDocument(baseDocument({ cells }));
  assert.deepEqual(migrated.cells?.map((cell) => cell.id), ["cell-1", "cell-2"]);

  // Y un documento REAL guardado antes de que existiera la sección se sigue
  // leyendo sin inventarle nada.
  const legacy = migrateCadDocument(baseDocument());
  assert.equal(
    legacy.cells,
    undefined,
    "un documento que nunca tuvo celdas no estrena una lista vacía",
  );
}

// ---------------------------------------------------------------------------
// 3. La serialización sigue siendo determinista, y no cambia sin celdas
// ---------------------------------------------------------------------------

{
  const withCells = baseDocument({ cells });
  assert.equal(
    serializeCadDocument(withCells),
    serializeCadDocument(baseDocument({ cells })),
    "misma entrada, misma salida",
  );
  assert.equal(
    serializeCadDocument(baseDocument()).includes('"cells"'),
    false,
    "un documento sin celdas se serializa EXACTAMENTE como antes: la sección es opcional y no se materializa",
  );
  assert.equal(
    serializeCadDocument(withCells).includes('"cells"'),
    true,
    "y uno con celdas sí las lleva",
  );
}

// ---------------------------------------------------------------------------
// 4. Round-trip por JSON: es como viaja al servidor y vuelve
// ---------------------------------------------------------------------------

{
  const reopened = migrateCadDocument(
    JSON.parse(serializeCadDocument(baseDocument({ cells }))) as CadDocument,
  );
  assert.deepEqual(
    reopened.cells,
    cells,
    "guardar, cerrar y reabrir devuelve las celdas exactas",
  );
}

console.log(
  "cad-cells: las celdas viajan por el documento canónico y sobreviven a guardar, migrar y reabrir",
);
