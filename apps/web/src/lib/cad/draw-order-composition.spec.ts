/**
 * El orden de dibujo cuando DOS cosas lo tocan en el MISMO lote.
 *
 * ## Por qué existe esta prueba
 *
 * `modelSpace.entityIds` lo escriben ahora dos mecanismos que llegaron por
 * caminos distintos y se encontraron en un merge:
 *
 *  1. **El orden base del lote.** Lo creado con `drawOrder: "back"` va al
 *     fondo, delante de todo lo demás; lo que sobrevive conserva su posición
 *     relativa exacta; lo creado normal entra al frente.
 *  2. **DRAWORDER**, que reordena ENCIMA de ese resultado lo que el usuario
 *     designó.
 *
 * Quedarse con uno solo compila, pasa el resto de la suite y produce un dibujo
 * plausible: las mismas entidades, las mismas coordenadas, todo visible. Lo
 * único que cambia es QUIÉN TAPA A QUIÉN, y eso no se ve en un plano de cuatro
 * líneas — se ve cuando un sombreado empieza a ocultar la pieza que rellena, o
 * cuando un wipeout se come la cota que debía quedar encima.
 *
 * Por eso las afirmaciones de abajo son sobre la LISTA COMPLETA y en orden, no
 * sobre pertenencia: `includes` habría pasado con los dos fallos.
 *
 * Los ids son adversariales a propósito —el orden de dibujo es el inverso del
 * alfabético— para que un `.sort()` accidental no pueda confundirse con «no
 * pasó nada».
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument } from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";
import type { CadNativeEntity } from "./entity-runtime";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = (id: string): Extract<CadNativeEntity, { type: "line" }> => ({
  id,
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 1_000, y: 0, z: 0 },
  layer: "0",
});

/** Orden de dibujo `zeta, medio, alfa`: el inverso exacto del alfabético. */
function documento(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [line("zeta"), line("medio"), line("alfa")],
    modelSpace: { entityIds: ["zeta", "medio", "alfa"] },
  });
}

// --- 1. El orden base: al fondo, supervivientes, al frente -------------------
{
  const next = executeCadEntityCommandBatch(
    documento(),
    [
      { type: "insert", entity: line("sombreado"), drawOrder: "back" },
      { type: "insert", entity: line("cota") },
    ],
    "HATCH + DIM",
  ).document;
  assert.deepEqual(
    next.modelSpace.entityIds,
    ["sombreado", "zeta", "medio", "alfa", "cota"],
    "lo creado al fondo va DELANTE de todo; lo normal, al final; el resto intacto",
  );
  checks += 1;
}

// --- 2. DRAWORDER se aplica ENCIMA del orden base, en el mismo lote ---------
// Ésta es la que cae si alguien resuelve el conflicto quedándose con el orden
// base: la entidad nace al fondo y el DRAWORDER del mismo lote no la mueve.
{
  const next = executeCadEntityCommandBatch(
    documento(),
    [
      { type: "insert", entity: line("sombreado"), drawOrder: "back" },
      { type: "draw-order", entityIds: ["alfa"], placement: "front" },
    ],
    "HATCH + DRAWORDER",
  ).document;
  assert.deepEqual(
    next.modelSpace.entityIds,
    ["sombreado", "zeta", "medio", "alfa"],
    "«alfa al frente» se cumple SOBRE el orden base, no sobre el documento de partida",
  );
  checks += 1;
}

// --- 3. Y al revés: DRAWORDER no puede tragarse el «al fondo» ---------------
// Ésta es la que cae si alguien pasa a DRAWORDER una entrada distinta del
// orden base —el `modelSpace` de partida, por ejemplo—: el sombreado recién
// creado aparecería al final, tapando lo que rellena.
{
  const next = executeCadEntityCommandBatch(
    documento(),
    [
      { type: "insert", entity: line("sombreado"), drawOrder: "back" },
      { type: "draw-order", entityIds: ["zeta"], placement: "back" },
    ],
    "HATCH + DRAWORDER atrás",
  ).document;
  assert.deepEqual(
    next.modelSpace.entityIds,
    ["zeta", "sombreado", "medio", "alfa"],
    "«zeta al fondo» pasa por delante del sombreado, pero el sombreado sigue debajo del resto",
  );
  ok(
    next.modelSpace.entityIds.indexOf("sombreado") < next.modelSpace.entityIds.indexOf("medio"),
    "y sobre todo: el sombreado NO acaba tapando la geometría que rellena",
  );
  checks += 1;
}

// --- 4. Un borrado no deja hueco ni fantasma --------------------------------
{
  const next = executeCadEntityCommandBatch(
    documento(),
    [
      { type: "delete", entityId: "medio" },
      { type: "draw-order", entityIds: ["alfa"], placement: "back" },
    ],
    "ERASE + DRAWORDER",
  ).document;
  assert.deepEqual(
    next.modelSpace.entityIds,
    ["alfa", "zeta"],
    "el borrado sale de la lista y DRAWORDER opera sobre lo que queda",
  );
  checks += 1;
}

// --- 5. Las tablas de símbolos no tocan el orden de dibujo ------------------
// BLOCK borra geometría y crea un INSERT en el mismo lote: el INSERT entra al
// frente como cualquier creación, y las definiciones de bloque —que van por el
// otro aplicador de tablas— no reordenan nada.
{
  const next = executeCadEntityCommandBatch(
    documento(),
    [
      { type: "delete", entityId: "medio" },
      {
        type: "block",
        op: "define",
        definition: {
          id: "puerta",
          name: "PUERTA",
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [line("puerta:entity:0")],
        },
      },
      {
        type: "insert",
        entity: {
          id: "insert-puerta",
          type: "insert",
          block: "puerta",
          insertion: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 0,
          layer: "0",
        },
      },
    ],
    "BLOCK",
  ).document;
  assert.deepEqual(
    next.modelSpace.entityIds,
    ["zeta", "alfa", "insert-puerta"],
    "definir un bloque no reordena el espacio modelo; su INSERT entra al frente",
  );
  checks += 1;
}

console.log(`draw-order-composition.spec: ${checks} comprobaciones OK`);
