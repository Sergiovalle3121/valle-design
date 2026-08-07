/**
 * La HUELLA del dibujo —ancho, alto y paso de rejilla— no llegaba al documento.
 *
 * EL DEFECTO. `meta.footprintW`, `meta.footprintH` y `meta.gridSize` son de
 * dónde el editor saca el lienzo al abrir: `footprintFromMeta` en el adaptador
 * heredado los lee de ahí y no de ningún otro sitio. Pero al GUARDAR:
 *
 *   · `editorSnapshotToCadDocument` sólo aceptaba `unit`, así que la proyección
 *     nacía sin huella;
 *   · `replaceEditorProjection` reconstruye `meta` desde el documento BASE y
 *     sólo dejaba pasar `unit`, así que la huella del documento cargado se
 *     reimponía sobre cualquier cambio.
 *
 * La huella sólo viajaba por `saveLegacy`, que manda `footprint` aparte en su
 * payload — y esa vía NO corre cuando hay `documentId`, o sea nunca en el
 * estudio moderno. Resultado: redimensionar la planta o cambiar el paso de
 * rejilla marcaba el dibujo como modificado, guardaba con 200, y al recargar
 * la planta volvía a su tamaño anterior.
 *
 * Misma familia que las celdas, los grupos y el `context`: la proyección del
 * editor es una vista PARCIAL, y lo que no sabe expresar lo perdía el guardado.
 */
import { strict as assert } from "node:assert";
import {
  cadDocumentToEditorSnapshot,
  editorSnapshotToCadDocument,
} from "./editor-snapshot";
import {
  layoutToCadDocument,
  replaceEditorProjection,
  migrateCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "./cad-document";

const FOOTPRINT = { footprintW: 30_000, footprintH: 18_000, gridSize: 250 };

// ---------------------------------------------------------------------------
// `layoutToCadDocument` tiene que saber escribir la huella
// ---------------------------------------------------------------------------

const built = layoutToCadDocument(
  { assets: [{ id: "a1", kind: "wall", x: 0, y: 0, w: 100, h: 10, rotation: 0 }] },
  { unit: "mm", ...FOOTPRINT },
);
assert.equal(built.meta.footprintW, 30_000, "el ancho de la planta va en meta");
assert.equal(built.meta.footprintH, 18_000, "y el alto");
assert.equal(built.meta.gridSize, 250, "y el paso de rejilla");

// Sin huella no se inventa una: un documento que nunca la declaró tiene que
// seguir sin declararla, para que el adaptador aplique SU valor por defecto.
const bare = layoutToCadDocument({ assets: [] }, { unit: "mm" });
assert.equal(bare.meta.footprintW, undefined, "sin huella no se estrena una");
assert.equal(bare.meta.footprintH, undefined);
assert.equal(bare.meta.gridSize, undefined);

// ---------------------------------------------------------------------------
// El ida y vuelta que hace el editor en CADA guardado canónico
// ---------------------------------------------------------------------------

/** Documento tal y como lo tiene el servidor: planta de 12 × 10 m, rejilla 100. */
const server: CadDocument = layoutToCadDocument(
  {
    assets: [{ id: "a1", kind: "wall", x: 0, y: 0, w: 100, h: 10, rotation: 0 }],
    stations: [{ id: "s1", x: 10, y: 10, w: 20, h: 20, rotation: 0 }],
  },
  { unit: "mm", footprintW: 12_000, footprintH: 10_000, gridSize: 100 },
);

{
  // El usuario agranda la planta y afina la rejilla. El editor reproyecta con
  // la huella NUEVA sobre el documento cargado, que aún trae la vieja.
  const resized = replaceEditorProjection(
    server,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(server), {
      unit: "mm",
      ...FOOTPRINT,
    }),
  );
  assert.equal(
    resized.meta.footprintW,
    30_000,
    "redimensionar la planta tiene que llegar al documento: era el defecto — la interfaz lo deja, el guardado responde 200 y el tamaño nuevo no está en lo guardado",
  );
  assert.equal(resized.meta.footprintH, 18_000);
  assert.equal(resized.meta.gridSize, 250, "y el paso de rejilla igual");
  // Y no se lleva por delante nada del documento base.
  assert.equal(resized.entities.length, server.entities.length);
  assert.equal(resized.meta.unit, "mm");

  // Guardar dos veces seguidas no degrada.
  const twice = replaceEditorProjection(
    resized,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(resized), {
      unit: "mm",
      ...FOOTPRINT,
    }),
  );
  assert.equal(twice.meta.footprintW, 30_000, "ni al segundo guardado");
  assert.equal(twice.meta.gridSize, 250);
}

{
  // Una proyección SIN huella no puede borrar la del documento. El editor la
  // arma desde `data.footprint`, que no siempre está hidratado —y el defecto
  // simétrico (perder la huella al guardar) sería igual de grave.
  const untouched = replaceEditorProjection(
    server,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(server), { unit: "mm" }),
  );
  assert.equal(
    untouched.meta.footprintW,
    12_000,
    "lo que la proyección no sabe expresar no puede destruirlo",
  );
  assert.equal(untouched.meta.footprintH, 10_000);
  assert.equal(untouched.meta.gridSize, 100);
}

// ---------------------------------------------------------------------------
// Y sobrevive al viaje completo: migrar y serializar
// ---------------------------------------------------------------------------

{
  const resized = replaceEditorProjection(
    server,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(server), {
      unit: "mm",
      ...FOOTPRINT,
    }),
  );
  const roundTrip = migrateCadDocument(
    JSON.parse(serializeCadDocument(resized)) as Record<string, unknown>,
  );
  assert.equal(roundTrip.meta.footprintW, 30_000, "serializar conserva la huella");
  assert.equal(roundTrip.meta.footprintH, 18_000);
  assert.equal(roundTrip.meta.gridSize, 250);
}

console.log(
  "footprint: redimensionar la planta y cambiar la rejilla llegan al documento canónico, y una proyección sin huella no borra la que hay",
);
