import assert from "node:assert/strict";
import {
  serializeCadDocument,
  migrateCadDocument,
  commitChange,
  type CadDocument,
} from "./cad-document";

/**
 * Regresión P0 — el orden de dibujo sobrevive al guardado.
 *
 * `modelSpace.entityIds` ES el z-order del dibujo. `serializeCadDocument`
 * lo ordenaba alfabéticamente, y como el serializado es también el formato de
 * recarga, CADA guardado reescribía el orden de dibujo por id. Eso rompe
 * Bring to front / Send to back, el apilado de hatches, los wipeouts y las
 * anotaciones: un plano guardado no volvía a abrirse como se dibujó.
 */

function documentWithOrder(entityIds: string[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: entityIds.map((id, index) => ({
      id,
      type: "line" as const,
      start: { x: index, y: 0, z: 0 },
      end: { x: index + 1, y: 1, z: 0 },
      layer: "0",
    })),
    history: [],
    modelSpace: { entityIds },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument);
}

// Orden deliberadamente NO alfabético: "zeta" se dibuja primero (al fondo) y
// "alfa" al final (encima). Ordenar por id invertiría exactamente esto.
const drawOrder = ["zeta", "medio", "alfa"];
const document = documentWithOrder(drawOrder);

assert.deepEqual(
  document.modelSpace.entityIds,
  drawOrder,
  "el documento parte con el orden de dibujo dado",
);

// --- El guardado preserva el orden ----------------------------------------

const reloaded = migrateCadDocument(
  JSON.parse(serializeCadDocument(document)) as CadDocument,
);

assert.deepEqual(
  reloaded.modelSpace.entityIds,
  drawOrder,
  "guardar y recargar NO debe reordenar el z-order alfabéticamente",
);

// --- El determinismo se mantiene ------------------------------------------

assert.equal(
  serializeCadDocument(document),
  serializeCadDocument(documentWithOrder([...drawOrder])),
  "mismo contenido y mismo orden => mismo texto (hashes reproducibles)",
);

// --- Un orden distinto es contenido distinto ------------------------------

assert.notEqual(
  serializeCadDocument(documentWithOrder(["zeta", "medio", "alfa"])),
  serializeCadDocument(documentWithOrder(["alfa", "medio", "zeta"])),
  "cambiar el orden de dibujo DEBE cambiar el serializado: es contenido",
);

// --- Bring to front / Send to back sobreviven a un commit + guardado ------

const broughtToFront: CadDocument = commitChange(
  {
    ...document,
    modelSpace: { entityIds: ["medio", "alfa", "zeta"] },
  },
  "draworder:bring-to-front",
);

assert.deepEqual(
  migrateCadDocument(
    JSON.parse(serializeCadDocument(broughtToFront)) as CadDocument,
  ).modelSpace.entityIds,
  ["medio", "alfa", "zeta"],
  "reordenar y guardar debe conservar el nuevo z-order",
);

console.log("draw-order.spec.ts OK");
