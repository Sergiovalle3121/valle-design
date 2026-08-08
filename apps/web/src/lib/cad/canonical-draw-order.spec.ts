import assert from "node:assert/strict";
import {
  commitChange,
  migrateCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "./cad-document";
import { executeCadEntityCommand } from "./entity-commands";
import { mergeCadDocuments } from "./cad-collaboration";

/**
 * El Z-ORDER sobrevive a EDITAR, no sólo a guardar.
 *
 * `draw-order.spec.ts` ya fijaba que serializar y recargar no alfabetiza el
 * orden de dibujo. Faltaba el otro lado: `executeCadEntityCommand` —el embudo
 * de transform, properties, grip, copy y delete— terminaba con un `.sort()`
 * sobre `modelSpace.entityIds`, así que CUALQUIER edición reordenaba el plano
 * entero por id. Mover una entidad reenviaba al fondo todo lo que tuviese un
 * id alfabéticamente mayor: "traer al frente", el apilado de hatches, los
 * wipeouts y las anotaciones no sobrevivían a un solo arrastre.
 *
 * Los ids son deliberadamente adversariales: el orden de dibujo `zeta, medio,
 * alfa` es exactamente el inverso del alfabético, así que un `.sort()` es
 * imposible de confundir con "no pasó nada".
 */

const DRAW_ORDER = ["zeta", "medio", "alfa"];

function documentWithOrder(entityIds: string[] = DRAW_ORDER): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: entityIds.map((id, index) => ({
      id,
      type: "line" as const,
      start: { x: index * 100, y: 0, z: 0 },
      end: { x: index * 100 + 50, y: 100, z: 0 },
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

/** El orden de dibujo NUNCA puede tener fantasmas, omisiones ni duplicados. */
function assertConsistent(document: CadDocument, message: string) {
  const ids = document.modelSpace.entityIds;
  assert.equal(
    new Set(ids).size,
    ids.length,
    `${message}: sin ids duplicados en el orden de dibujo`,
  );
  const present = new Set(document.entities.map((entity) => entity.id));
  for (const id of ids)
    assert.ok(present.has(id), `${message}: ${id} está en el orden pero no existe`);
  for (const id of present)
    assert.ok(ids.includes(id), `${message}: ${id} existe pero no se dibuja`);
}

/* ── Editar propiedades conserva la posición visual ─────────────────────── */

{
  const result = executeCadEntityCommand(documentWithOrder(), {
    type: "properties",
    entityId: "zeta",
    patch: { layer: "0" },
  });
  assert.deepEqual(
    result.document.modelSpace.entityIds,
    DRAW_ORDER,
    "editar una propiedad NO reordena el plano",
  );
  assertConsistent(result.document, "properties");
}

/* ── Transform (mover) conserva la posición visual ──────────────────────── */

{
  const result = executeCadEntityCommand(documentWithOrder(), {
    type: "transform",
    entityId: "alfa",
    transform: { translation: { x: 500, y: 250 } },
  });
  assert.deepEqual(
    result.document.modelSpace.entityIds,
    DRAW_ORDER,
    "mover una entidad NO la reenvía al fondo ni sube a las demás",
  );
  const moved = result.document.entities.find((entity) => entity.id === "alfa");
  assert.ok(moved && moved.type === "line");
  if (!moved || moved.type !== "line") throw new Error("unreachable");
  assert.equal(moved.start.x, 200 + 500, "la geometría sí cambió");
}

/* ── Grip conserva la posición visual ───────────────────────────────────── */

{
  const base = documentWithOrder();
  const grips = executeCadEntityCommand(base, {
    type: "transform",
    entityId: "medio",
    transform: { translation: { x: 0, y: 0 } },
  });
  assert.deepEqual(
    grips.document.modelSpace.entityIds,
    DRAW_ORDER,
    "una transformación identidad tampoco reordena",
  );
}

/* ── Copiar añade AL FRENTE y no toca el orden previo ───────────────────── */

{
  const result = executeCadEntityCommand(documentWithOrder(), {
    type: "copy",
    entityId: "zeta",
    newEntityId: "beta",
    offset: { x: 10, y: 10 },
  });
  assert.deepEqual(
    result.document.modelSpace.entityIds,
    [...DRAW_ORDER, "beta"],
    "la copia se dibuja encima; el resto conserva su orden relativo",
  );
  assertConsistent(result.document, "copy");
  assert.deepEqual(result.createdEntityIds, ["beta"]);
}

/* ── Borrar quita SÓLO el id borrado ────────────────────────────────────── */

{
  const result = executeCadEntityCommand(documentWithOrder(), {
    type: "delete",
    entityId: "medio",
  });
  assert.deepEqual(
    result.document.modelSpace.entityIds,
    ["zeta", "alfa"],
    "borrar quita exactamente uno y no reordena los que quedan",
  );
  assertConsistent(result.document, "delete");
}

/* ── Una cadena de ediciones no acumula desorden ────────────────────────── */

{
  let document = documentWithOrder();
  document = executeCadEntityCommand(document, {
    type: "transform",
    entityId: "zeta",
    transform: { translation: { x: 1, y: 1 } },
  }).document;
  document = executeCadEntityCommand(document, {
    type: "copy",
    entityId: "alfa",
    newEntityId: "aaa",
    offset: { x: 5, y: 5 },
  }).document;
  document = executeCadEntityCommand(document, {
    type: "delete",
    entityId: "medio",
  }).document;
  document = executeCadEntityCommand(document, {
    type: "properties",
    entityId: "aaa",
    patch: { layer: "0" },
  }).document;
  assert.deepEqual(
    document.modelSpace.entityIds,
    ["zeta", "alfa", "aaa"],
    "cuatro comandos seguidos y el z-order sigue siendo el dibujado",
  );
  assertConsistent(document, "cadena");

  // Y sobrevive al guardado/recarga, que es donde se hace visible.
  const reloaded = migrateCadDocument(
    JSON.parse(serializeCadDocument(document)) as CadDocument,
  );
  assert.deepEqual(
    reloaded.modelSpace.entityIds,
    ["zeta", "alfa", "aaa"],
    "guardar y reabrir conserva el orden que dejó la edición",
  );
}

/* ── `entities` SÍ puede ir ordenado: es serialización, no dibujo ───────── */

{
  const result = executeCadEntityCommand(documentWithOrder(), {
    type: "copy",
    entityId: "zeta",
    newEntityId: "beta",
    offset: { x: 1, y: 1 },
  });
  assert.deepEqual(
    result.document.entities.map((entity) => entity.id),
    ["alfa", "beta", "medio", "zeta"],
    "el array de entidades queda ordenado por id (hashes reproducibles)",
  );
  assert.notDeepEqual(
    result.document.modelSpace.entityIds,
    result.document.entities.map((entity) => entity.id),
    "y precisamente por eso el orden de dibujo NO puede derivarse de él",
  );
}

/* ── Resolver un conflicto de colaboración tampoco alfabetiza ───────────── */

{
  const base = documentWithOrder();
  const mine = commitChange(documentWithOrder(), "mine");
  const theirs = commitChange(
    {
      ...documentWithOrder(),
      entities: [
        ...documentWithOrder().entities,
        {
          id: "beta",
          type: "line",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1, y: 1, z: 0 },
          layer: "0",
        } as CadEntity,
      ],
    },
    "theirs",
  );
  const merged = mergeCadDocuments(base, mine, theirs);
  assert.deepEqual(
    merged.document.modelSpace.entityIds.slice(0, 3),
    DRAW_ORDER,
    "el documento propio conserva su z-order tras la fusión",
  );
  assert.ok(
    merged.document.modelSpace.entityIds.includes("beta"),
    "y lo que llega del otro lado se incorpora",
  );
  assertConsistent(merged.document, "merge");
}

console.log("canonical-draw-order.spec.ts OK");
