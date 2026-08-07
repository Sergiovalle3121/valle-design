/**
 * Las NOTAS de un objeto no se guardaban en ningún sitio. En ninguno.
 *
 * EL DEFECTO, y es de otra clase que los anteriores. Con las celdas, los grupos
 * o el `context`, el documento canónico SÍ tenía sitio y el guardado los perdía
 * por el camino. Aquí no había sitio: `objectNotes` era estado de React y nada
 * más. No lo leía `snapshot()`, no viajaba en el payload heredado, no existía
 * campo en el esquema, y al abrir no se restauraba nada.
 *
 * Consecuencia: el usuario escribe "pendiente de validar con el cliente" en un
 * equipo, el dibujo se marca como modificado, el guardado responde 200, y la
 * nota desaparece al recargar. También al cambiar de documento y volver, sin
 * necesidad de recargar.
 *
 * DÓNDE VA. Como `group` y `tags`: campo de primera clase de la entidad. Se
 * descartó `context.metadata` porque `replaceEditorProjection` trata el
 * `context` como todo-o-nada —si la proyección trae uno, manda entero— así que
 * colgar ahí las notas habría borrado el color explícito y la procedencia que
 * el PR #35 acababa de rescatar.
 */
import { strict as assert } from "node:assert";
import {
  cadDocumentToEditorSnapshot,
  editorSnapshotToCadDocument,
} from "./editor-snapshot";
import {
  cadDocumentToLayout,
  layoutToCadDocument,
  migrateCadDocument,
  replaceEditorProjection,
  serializeCadDocument,
  type CadDocument,
  type CadEntityContext,
} from "./cad-document";

const NOTA = "Pendiente de validar con el cliente. Owner: J. Pérez.";
const NOTA_ESTACION = "Requiere toma de aire comprimido.";

/** Sólo `box` y `station` llevan nota; estrecharlo aquí es parte de lo afirmado. */
function entityOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(
    entity && (entity.type === "box" || entity.type === "station"),
    `falta la entidad ${id}, o no es de un tipo que lleve nota`,
  );
  return entity;
}

// ---------------------------------------------------------------------------
// El esquema tiene sitio, y el adaptador heredado lo conserva en los dos sentidos
// ---------------------------------------------------------------------------

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
      tags: ["estructural"],
      notes: NOTA,
    },
    { id: "a2", kind: "wall", x: 0, y: 50, w: 100, h: 10, rotation: 0 },
  ],
  stations: [
    { id: "s1", x: 10, y: 10, w: 20, h: 20, rotation: 0, notes: NOTA_ESTACION },
  ],
});

assert.equal(entityOf(source, "a1").notes, NOTA, "una box tiene sitio para su nota");
assert.equal(
  entityOf(source, "s1").notes,
  NOTA_ESTACION,
  "y una estación también: las notas se editan por objeto, sea del tipo que sea",
);
assert.equal(entityOf(source, "a2").notes, undefined, "sin nota no se estrena una vacía");

{
  // Round-trip del adaptador heredado: exacto en los dos sentidos.
  const layout = cadDocumentToLayout(source);
  assert.equal(layout.assets.find((a) => a.id === "a1")?.notes, NOTA);
  assert.equal(layout.assets.find((a) => a.id === "a2")?.notes, undefined);
  assert.equal(layout.stations.find((s) => s.id === "s1")?.notes, NOTA_ESTACION);
  assert.deepEqual(
    layoutToCadDocument(layout).entities,
    source.entities,
    "ida y vuelta sin pérdida, que es el contrato del adaptador",
  );
}

// ---------------------------------------------------------------------------
// El ida y vuelta que hace el editor en CADA guardado canónico
// ---------------------------------------------------------------------------

{
  const snapshot = cadDocumentToEditorSnapshot(source);
  assert.equal(
    snapshot.notes?.a1,
    NOTA,
    "la proyección del editor tiene que llevar la nota: sin esto el guardado la perdía",
  );
  assert.equal(snapshot.notes?.s1, NOTA_ESTACION);
  assert.equal(snapshot.notes?.a2, undefined);

  const reprojected = editorSnapshotToCadDocument(snapshot);
  assert.equal(entityOf(reprojected, "a1").notes, NOTA, "y sobrevive a la reproyección");
  assert.equal(entityOf(reprojected, "s1").notes, NOTA_ESTACION);
  assert.equal(entityOf(reprojected, "a2").notes, undefined);

  // Reproyectar dos veces no degrada.
  const twice = editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(reprojected));
  assert.equal(entityOf(twice, "a1").notes, NOTA, "ni al segundo guardado");
}

// ---------------------------------------------------------------------------
// Abrir: la reproyección contra el documento canónico NO puede mutilarlo
// ---------------------------------------------------------------------------

{
  // Mismo camino que anuló el arreglo de los grupos en su día: si la
  // proyección se arma SIN notas, `replaceEditorProjection` las borra y el
  // siguiente guardado persiste la versión ya mutilada.
  const withNotes = replaceEditorProjection(
    source,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(source)),
  );
  assert.equal(entityOf(withNotes, "a1").notes, NOTA);

  const stripped = replaceEditorProjection(
    source,
    editorSnapshotToCadDocument({
      ...cadDocumentToEditorSnapshot(source),
      notes: {},
    }),
  );
  assert.equal(
    entityOf(stripped, "a1").notes,
    undefined,
    "y si la proyección se arma sin notas, las borra: por eso el camino de apertura tiene que pasarlas",
  );
}

// ---------------------------------------------------------------------------
// La nota NO puede pisar lo que el PR #35 rescató
// ---------------------------------------------------------------------------

{
  const CONTEXT: CadEntityContext = {
    handle: "1A2B",
    presentation: { color: { source: "explicit", value: "#ff0066" } },
    provenance: { provider: "dxf", sourceId: "planta.dxf" },
  };
  const conContexto: CadDocument = {
    ...source,
    entities: source.entities.map((entity) =>
      entity.id === "a1"
        ? ({ ...entity, context: structuredClone(CONTEXT) } as typeof entity)
        : entity,
    ),
  };
  const guardado = replaceEditorProjection(
    conContexto,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(conContexto)),
  );
  assert.equal(entityOf(guardado, "a1").notes, NOTA, "la nota llega");
  assert.deepEqual(
    entityOf(guardado, "a1").context,
    CONTEXT,
    "y el color explícito y la procedencia siguen intactos — por eso la nota es un campo propio y no cuelga de `context`",
  );
}

// ---------------------------------------------------------------------------
// Y sobrevive al viaje completo: serializar y migrar
// ---------------------------------------------------------------------------

{
  const roundTrip = migrateCadDocument(
    JSON.parse(serializeCadDocument(source)) as Record<string, unknown>,
  );
  assert.equal(entityOf(roundTrip, "a1").notes, NOTA, "serializar conserva la nota");
  assert.equal(entityOf(roundTrip, "s1").notes, NOTA_ESTACION);
  assert.equal(entityOf(roundTrip, "a2").notes, undefined);
  // Determinista: el mismo contenido produce el mismo texto.
  assert.equal(serializeCadDocument(roundTrip), serializeCadDocument(source));
}

console.log(
  "object-notes: la nota de un objeto tiene sitio en el esquema, sobrevive al guardado canónico y no pisa el context",
);
