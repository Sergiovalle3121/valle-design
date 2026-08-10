/**
 * Las tablas de símbolos por la ruta canónica de mutación.
 *
 * Lo que se afirma aquí no es que las funciones "funcionen": es que definir un
 * bloque, borrar la geometría que sustituye y crear su INSERT sean UNA
 * transacción, con UN paso de historia. Esa es la propiedad que hacía imposible
 * BLOCK antes de este cambio, porque `defineCadBlock` llamaba a `commitChange`
 * por su cuenta y deshacer partía la orden por la mitad.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument } from "./cad-document";
import { applyCadSymbolTables } from "./cad-symbol-tables";
import { executeCadEntityCommandBatch } from "./entity-commands";
import type { CadNativeEntity } from "./entity-runtime";

const line = (id: string, x: number): Extract<CadNativeEntity, { type: "line" }> => ({
  id,
  type: "line",
  start: { x, y: 0, z: 0 },
  end: { x, y: 100, z: 0 },
  layer: "0",
});

function baseDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [line("line-a", 0), line("line-b", 200)],
  });
}

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- 1. BLOCK es UNA transacción --------------------------------------------
{
  const document = baseDocument();
  const result = executeCadEntityCommandBatch(
    document,
    [
      {
        type: "block",
        op: "define",
        definition: {
          id: "block:door",
          name: "DOOR",
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [line("block:door:entity:0", 0)],
        },
      },
      { type: "delete", entityId: "line-a" },
      {
        type: "insert",
        entity: {
          id: "insert-1",
          type: "insert",
          block: "block:door",
          insertion: { x: 500, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 0,
          layer: "0",
        },
      },
    ],
    "BLOCK",
  );
  const next = result.document;
  assert.equal(next.blocks.length, 1, "la definición quedó escrita");
  assert.equal(next.blocks[0].name, "DOOR", "con su nombre");
  assert.equal(next.meta.version, document.meta.version + 1, "UNA sola versión nueva");
  assert.equal(next.history.length, document.history.length + 1, "UN solo paso de historia");
  assert.equal(next.history[next.history.length - 1].label, "BLOCK", "con la etiqueta del comando");
  ok(
    !next.entities.some((entity) => entity.id === "line-a") &&
      next.entities.some((entity) => entity.id === "insert-1"),
    "la geometría se sustituyó por el INSERT en el mismo lote",
  );
  ok(
    next.modelSpace.entityIds.includes("insert-1") &&
      !next.modelSpace.entityIds.includes("line-a"),
    "el orden de dibujo se actualizó igual",
  );
}

// --- 2. Un nombre de bloque repetido se rechaza -----------------------------
{
  const document = baseDocument();
  const define = (id: string, name: string) =>
    ({
      type: "block" as const,
      op: "define" as const,
      definition: {
        id,
        name,
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line(`${id}:entity:0`, 0)],
      },
    });
  assert.throws(
    () => executeCadEntityCommandBatch(document, [define("a", "DOOR"), define("b", "door")], "BLOCK"),
    /already exists/,
    "dos definiciones con el mismo nombre harían ambiguo cada INSERT",
  );
  checks += 1;
}

// --- 3. Un ciclo de bloques se rechaza ANTES de escribir ---------------------
{
  const document = baseDocument();
  assert.throws(
    () =>
      executeCadEntityCommandBatch(
        document,
        [
          {
            type: "block",
            op: "define",
            definition: {
              id: "block:self",
              name: "SELF",
              basePoint: { x: 0, y: 0, z: 0 },
              entities: [
                {
                  id: "block:self:entity:0",
                  type: "insert",
                  block: "block:self",
                  insertion: { x: 0, y: 0, z: 0 },
                  scale: { x: 1, y: 1, z: 1 },
                  rotation: 0,
                  layer: "0",
                },
              ],
            },
          },
        ],
        "BLOCK",
      ),
    /cycle/i,
    "un bloque que se contiene a sí mismo cuelga a quien lo resuelva",
  );
  checks += 1;
}

// --- 4. No se borra un bloque que sigue insertado ---------------------------
{
  const seeded = executeCadEntityCommandBatch(
    baseDocument(),
    [
      {
        type: "block",
        op: "define",
        definition: {
          id: "block:door",
          name: "DOOR",
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [line("block:door:entity:0", 0)],
        },
      },
      {
        type: "insert",
        entity: {
          id: "insert-1",
          type: "insert",
          block: "block:door",
          insertion: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 0,
          layer: "0",
        },
      },
    ],
    "BLOCK",
  ).document;
  assert.throws(
    () =>
      executeCadEntityCommandBatch(
        seeded,
        [{ type: "block", op: "delete", blockId: "block:door" }],
        "PURGE",
      ),
    /still inserted/,
    "purgar un bloque en uso dejaría INSERTs colgando",
  );
  checks += 1;
  // …y borrando primero la inserción, en el MISMO lote, sí se puede.
  const purged = executeCadEntityCommandBatch(
    seeded,
    [
      { type: "delete", entityId: "insert-1" },
      { type: "block", op: "delete", blockId: "block:door" },
    ],
    "PURGE",
  ).document;
  assert.equal(purged.blocks.length, 0, "sin inserciones, la definición se va");
  checks += 1;
}

// --- 5. Las dos tablas conviven en UN lote ---------------------------------
// Las capas las escribe `entity-command-tables.ts` y los bloques este módulo.
// Que sean dos aplicadores es un detalle interno: para quien teclea la orden
// tiene que seguir siendo UNA transacción, y ninguno de los dos puede pisar la
// tabla del otro al construir el documento.
{
  const document = baseDocument();
  const both = executeCadEntityCommandBatch(
    document,
    [
      {
        type: "layer",
        op: "upsert",
        layer: { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
      },
      {
        type: "block",
        op: "define",
        definition: {
          id: "puerta",
          name: "PUERTA",
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [line("puerta:entity:0", 0)],
        },
      },
    ],
    "BLOCK",
  ).document;
  assert.equal(both.meta.version, document.meta.version + 1, "UN paso de deshacer para las dos");
  assert.ok(both.layers.some((layer) => layer.id === "MUROS"), "la capa entró");
  assert.ok(both.blocks.some((block) => block.id === "puerta"), "y el bloque también");
  checks += 3;
}

// --- 6. Un lote que no toca una tabla la devuelve TAL CUAL ------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "ZETA", name: "ZETA", color: "#ffffff", visible: true, locked: false },
      { id: "ALFA", name: "ALFA", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [line("line-a", 0)],
  });
  const order = document.layers.map((layer) => layer.id);
  const defined = executeCadEntityCommandBatch(
    document,
    [
      {
        type: "block",
        op: "define",
        definition: {
          id: "b",
          name: "B",
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [line("b:entity:0", 0)],
        },
      },
    ],
    "BLOCK",
  ).document;
  assert.deepEqual(
    defined.layers.map((layer) => layer.id),
    order,
    "definir un bloque no reordena la tabla de CAPAS: cambiaría el serializado —y el hash— sin que nadie lo pida",
  );
  checks += 1;

  const tables = applyCadSymbolTables(document, [], document.entities);
  assert.equal(tables.blocks, document.blocks, "un lote sin órdenes devuelve el MISMO array de bloques");
  assert.equal(
    tables.externalReferences,
    document.externalReferences,
    "y el mismo de referencias: no se copia lo que no se toca",
  );
  checks += 2;
}

// --- 7. Referencias externas -------------------------------------------------
{
  const document = baseDocument();
  const attached = executeCadEntityCommandBatch(
    document,
    [
      {
        type: "xref",
        op: "upsert",
        reference: {
          id: "xref-1",
          name: "PLANTA",
          uri: "tenant-layout://asset-1/rev-3",
          loaded: true,
          mode: "attachment",
        },
      },
    ],
    "XATTACH",
  ).document;
  assert.equal(attached.externalReferences.length, 1, "la referencia quedó escrita");
  assert.equal(attached.externalReferences[0].uri, "tenant-layout://asset-1/rev-3", "con su URI");
  checks += 2;
  const detached = executeCadEntityCommandBatch(
    attached,
    [{ type: "xref", op: "delete", xrefId: "xref-1" }],
    "XREF Detach",
  ).document;
  assert.equal(detached.externalReferences.length, 0, "y se puede desligar");
  checks += 1;
  assert.throws(
    () =>
      executeCadEntityCommandBatch(
        detached,
        [{ type: "xref", op: "delete", xrefId: "xref-1" }],
        "XREF Detach",
      ),
    /was not found/,
    "desligar lo que no está se dice, no se ignora",
  );
  checks += 1;
}

console.log(`cad-document-tables.spec: ${checks} comprobaciones OK`);
