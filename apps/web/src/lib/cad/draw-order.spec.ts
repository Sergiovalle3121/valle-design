import assert from "node:assert/strict";
import {
  serializeCadDocument,
  migrateCadDocument,
  commitChange,
  replaceEntityIdsAt,
  preserveDrawOrder,
  replaceEditorProjection,
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

// --- replaceEntityIdsAt: sustitución POSICIONAL -----------------------------
//
// Es lo que hace que definir un bloque y explotarlo sea visualmente inocuo.

// Sustituir en el medio conserva lo de abajo y lo de arriba.
assert.deepEqual(
  replaceEntityIdsAt(["a", "b", "c", "d"], new Set(["b"]), ["nuevo"]),
  ["a", "nuevo", "c", "d"],
  "el reemplazo ocupa la posición del retirado",
);

// Varios retirados dispersos: el resultado va a la posición del MÁS ALTO,
// porque es el que determinaba qué cubría el conjunto.
assert.deepEqual(
  replaceEntityIdsAt(["a", "b", "c", "d"], new Set(["a", "c"]), ["bloque"]),
  ["b", "bloque", "d"],
  "con varios retirados manda el índice mayor",
);

// Explotar devuelve varias entidades en su propio orden relativo.
assert.deepEqual(
  replaceEntityIdsAt(["fondo", "insert", "frente"], new Set(["insert"]), [
    "p1",
    "p2",
  ]),
  ["fondo", "p1", "p2", "frente"],
  "las entidades explotadas entran donde estaba el INSERT",
);

// Retirar el elemento superior deja el reemplazo arriba.
assert.deepEqual(
  replaceEntityIdsAt(["a", "b"], new Set(["b"]), ["x"]),
  ["a", "x"],
  "sustituir el más alto mantiene el reemplazo al frente",
);

// Nada que retirar => se añade al frente (comportamiento de alta normal).
assert.deepEqual(
  replaceEntityIdsAt(["a", "b"], new Set(["ausente"]), ["x"]),
  ["a", "b", "x"],
  "sin coincidencias, el nuevo id va al final",
);

// Definir bloque y explotarlo debe ser un ROUND-TRIP del z-order.
const original = ["fondo", "geo1", "geo2", "frente"];
const defined = replaceEntityIdsAt(original, new Set(["geo1", "geo2"]), [
  "insert",
]);
assert.deepEqual(defined, ["fondo", "insert", "frente"]);
assert.deepEqual(
  replaceEntityIdsAt(defined, new Set(["insert"]), ["geo1", "geo2"]),
  original,
  "definir un bloque y explotarlo devuelve el orden de dibujo original",
);

// --- preserveDrawOrder ----------------------------------------------------

assert.deepEqual(
  preserveDrawOrder(["zeta", "alfa"], ["alfa", "zeta"]),
  ["zeta", "alfa"],
  "el orden previo manda sobre el orden en que lleguen las entidades",
);
assert.deepEqual(
  preserveDrawOrder(["zeta", "alfa"], ["alfa", "nuevo", "zeta"]),
  ["zeta", "alfa", "nuevo"],
  "lo nuevo entra al frente sin tocar el orden previo",
);
assert.deepEqual(
  preserveDrawOrder(["zeta", "medio", "alfa"], ["zeta", "alfa"]),
  ["zeta", "alfa"],
  "lo eliminado desaparece y el resto conserva su orden relativo",
);
assert.deepEqual(
  preserveDrawOrder([], ["b", "a"]),
  ["b", "a"],
  "sin orden previo se respeta el orden de llegada, no el alfabético",
);

// --- REGRESIÓN ADVERSARIAL: reproyectar NO debe alfabetizar el z-order -----
//
// Éste es el defecto que sobrevivió a la primera corrección y que mis tests no
// veían porque usaban IDs ya alfabéticos. `replaceEditorProjection` corre tras
// editar una propiedad, transformar o mover un grip, y reconstruía el orden de
// dibujo desde un array `entities` ordenado por id: `zeta, alfa` se convertía
// en `alfa, zeta`. Los IDs de abajo son deliberadamente NO alfabéticos.

const adversarial = documentWithOrder(["zeta", "alfa"]);
assert.deepEqual(adversarial.modelSpace.entityIds, ["zeta", "alfa"]);

const reprojected = replaceEditorProjection(adversarial, adversarial);
assert.deepEqual(
  reprojected.modelSpace.entityIds,
  ["zeta", "alfa"],
  "reproyectar el editor NO debe alfabetizar el orden de dibujo",
);

// Una entidad nueva aparecida en la proyección va al frente, sin reordenar.
const grown = replaceEditorProjection(
  adversarial,
  documentWithOrder(["zeta", "alfa", "beta"]),
);
assert.deepEqual(
  grown.modelSpace.entityIds,
  ["zeta", "alfa", "beta"],
  "la entidad nueva entra al frente y el orden previo sobrevive",
);

console.log("draw-order.spec.ts OK");
