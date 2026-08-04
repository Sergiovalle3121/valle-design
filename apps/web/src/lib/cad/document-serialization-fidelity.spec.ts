import assert from "node:assert/strict";
import {
  serializeCadDocument,
  migrateCadDocument,
  type CadDocument,
  type CadPaperSpace,
} from "./cad-document";

/**
 * Regresión P0 — el guardado no puede perder ni reordenar contenido.
 *
 * `serializeCadDocument` NO es sólo un formato de hash: es el formato con el
 * que el documento se persiste y se vuelve a abrir. Todo lo que descarte o
 * reordene ahí se pierde de verdad en el dibujo del usuario.
 *
 * Dos defectos vivían en esa función:
 *
 *  1. `meta` se reconstruía como `{version, schema, unit}`, así que la HUELLA
 *     del dibujo (`footprintW`/`footprintH`) y el paso de rejilla (`gridSize`)
 *     desaparecían en cada guardado. Al reabrir, el editor caía al default
 *     legacy (20000×10000 mm, rejilla 500) — un plano de 12000×10000 con
 *     rejilla 100 volvía con otro lienzo y otro paso de movimiento.
 *  2. `paperSpaces` y las entidades DENTRO de cada bloque se ordenaban por id.
 *     El orden de las láminas de un juego de planos y el z-order interno de un
 *     bloque son contenido semántico, exactamente igual que
 *     `modelSpace.entityIds`.
 */

function baseDocument(overrides: Partial<CadDocument> = {}): CadDocument {
  return migrateCadDocument({
    meta: {
      version: 1,
      schema: 3,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    ...overrides,
  });
}

function line(id: string, x: number) {
  return {
    id,
    type: "line" as const,
    start: { x, y: 0, z: 0 },
    end: { x: x + 1_000, y: 0, z: 0 },
    layer: "0",
  };
}

function sheet(id: string): CadPaperSpace {
  return {
    id,
    name: id,
    entityIds: [],
    page: {
      width: 420,
      height: 297,
      unit: "mm",
      orientation: "landscape",
    },
  };
}

/* ── 1. La huella y la rejilla sobreviven al guardado ── */

const withFootprint = baseDocument();
assert.equal(withFootprint.meta.footprintW, 12_000, "migrar conserva la huella");
assert.equal(withFootprint.meta.footprintH, 10_000);
assert.equal(withFootprint.meta.gridSize, 100);

const reloaded = JSON.parse(serializeCadDocument(withFootprint)) as CadDocument;
assert.equal(
  reloaded.meta.footprintW,
  12_000,
  "guardar NO puede descartar el ancho de la huella",
);
assert.equal(
  reloaded.meta.footprintH,
  10_000,
  "guardar NO puede descartar el alto de la huella",
);
assert.equal(
  reloaded.meta.gridSize,
  100,
  "guardar NO puede descartar el paso de rejilla",
);

// Un documento sin huella declarada sigue siendo válido: no se inventan valores.
const withoutFootprint = migrateCadDocument({
  ...withFootprint,
  meta: { version: 1, schema: 3, unit: "mm" },
});
const reloadedBare = JSON.parse(
  serializeCadDocument(withoutFootprint),
) as CadDocument;
assert.equal(reloadedBare.meta.footprintW, undefined);
assert.equal(reloadedBare.meta.gridSize, undefined);
assert.equal(reloadedBare.meta.unit, "mm");

/* ── 2. El orden de las láminas es contenido, no un índice ── */

// IDs deliberadamente NO alfabéticos: con `.sort(byId)` el juego de planos
// volvía como [a, b, general] en vez del orden que compuso el usuario.
const sheetOrder = ["sheet-detail-b", "sheet-general", "sheet-detail-a"];
const withSheets = baseDocument({ paperSpaces: sheetOrder.map(sheet) });
const reloadedSheets = JSON.parse(
  serializeCadDocument(withSheets),
) as CadDocument;
assert.deepEqual(
  reloadedSheets.paperSpaces.map((space) => space.id),
  sheetOrder,
  "guardar NO puede alfabetizar el orden del juego de planos",
);

/* ── 3. El z-order dentro de un bloque es contenido ── */

const blockOrder = ["zeta", "alfa", "medio"];
const withBlock = baseDocument({
  blocks: [
    {
      id: "BLK",
      name: "BLK",
      basePoint: { x: 0, y: 0, z: 0 },
      entities: blockOrder.map((id, index) => line(id, index * 1_000)),
    },
  ],
});
const reloadedBlock = JSON.parse(
  serializeCadDocument(withBlock),
) as CadDocument;
assert.deepEqual(
  reloadedBlock.blocks[0].entities.map((entity) => entity.id),
  blockOrder,
  "guardar NO puede alfabetizar el z-order interno de un bloque",
);

/* ── 4. El determinismo real se conserva ── */

// Mismo contenido construido en otro orden de inserción de claves ⇒ mismo texto.
const twin = baseDocument({ paperSpaces: sheetOrder.map(sheet) });
assert.equal(
  serializeCadDocument(withSheets),
  serializeCadDocument(twin),
  "dos documentos con el mismo contenido siguen serializando igual",
);

// Y un orden distinto es legítimamente un documento distinto.
const shuffled = baseDocument({
  paperSpaces: ["sheet-general", "sheet-detail-a", "sheet-detail-b"].map(sheet),
});
assert.notEqual(
  serializeCadDocument(withSheets),
  serializeCadDocument(shuffled),
  "un orden de láminas distinto ES un documento distinto",
);

console.log("document-serialization-fidelity.spec.ts OK");
