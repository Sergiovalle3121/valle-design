/**
 * Ejecutor por lotes de comandos de entidad (Ola 0 del plan de paridad).
 *
 * Dos cosas que probar, y la primera importa más que la segunda:
 *
 * 1. **Paridad.** `executeCadEntityCommand` ahora se implementa encima del
 *    lote. Un comando suelto tiene que producir el MISMO documento, la MISMA
 *    etiqueta de historia y los MISMOS errores que antes, o media docena de
 *    goldens se caen.
 * 2. **Atomicidad.** N comandos = una regeneración de asociativos, un
 *    `commitChange` y un solo paso de historia. Sin esto, un ARRAY de 50
 *    elementos deja 50 entradas de historia para una sola orden del usuario.
 */
import assert from "node:assert/strict";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "./entity-runtime";
import { executeCadEntityCommand, executeCadEntityCommandBatch } from "./entity-commands";
import { migrateCadDocument, type CadDocument } from "./cad-document";

const line = (id: string, x: number): Extract<CadNativeEntity, { type: "line" }> => ({
  id,
  type: "line",
  start: { x, y: 0, z: 0 },
  end: { x, y: 100, z: 0 },
  layer: "0",
});

const circle: Extract<CadNativeEntity, { type: "circle" }> = {
  id: "circle-1",
  type: "circle",
  center: { x: 500, y: 500, z: 0 },
  radius: 40,
  layer: "0",
};

function baseDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 3, unit: "mm" },
    entities: [line("line-a", 0), line("line-b", 200), circle],
  });
}

// --- 1. Paridad con el ejecutor de un comando --------------------------------
{
  const document = baseDocument();
  const single = executeCadEntityCommand(document, {
    type: "transform",
    entityId: "line-a",
    transform: { translation: { x: 10, y: 5 } },
  });
  const batched = executeCadEntityCommandBatch(
    document,
    [{ type: "transform", entityId: "line-a", transform: { translation: { x: 10, y: 5 } } }],
    "transform:line",
  );
  assert.deepEqual(batched.document, single.document, "un comando suelto produce el mismo documento por ambas vías");
  assert.deepEqual(batched.affectedEntityIds, single.affectedEntityIds, "mismos afectados");
  assert.deepEqual(batched.createdEntityIds, single.createdEntityIds, "mismos creados");
  assert.deepEqual(batched.deletedEntityIds, single.deletedEntityIds, "mismos borrados");
  assert.equal(
    single.document.history[single.document.history.length - 1]?.label,
    "transform:line",
    "la etiqueta de historia sigue siendo `${comando}:${tipo}`",
  );
  assert.equal(single.document.meta.version, document.meta.version + 1, "un comando = una versión");
}

// El mensaje de error de un id inexistente no cambió, y sigue lanzándose antes
// de tocar el documento.
assert.throws(
  () => executeCadEntityCommand(baseDocument(), { type: "delete", entityId: "no-existe" }),
  /Native CAD entity no-existe was not found\./,
  "id desconocido: mismo mensaje que antes",
);

// --- 2. Atomicidad: N comandos, una sola entrada de historia ------------------
{
  const document = baseDocument();
  const result = executeCadEntityCommandBatch(
    document,
    [
      { type: "transform", entityId: "line-a", transform: { translation: { x: 5, y: 0 } } },
      { type: "transform", entityId: "line-b", transform: { translation: { x: 5, y: 0 } } },
      { type: "properties", entityId: "circle-1", patch: { radius: 60 } },
    ],
    "MOVE",
  );
  assert.equal(result.document.meta.version, document.meta.version + 1, "tres comandos suben la versión UNA vez");
  assert.equal(
    result.document.history.length,
    document.history.length + 1,
    "tres comandos dejan UNA entrada de historia",
  );
  assert.equal(result.document.history[result.document.history.length - 1]?.label, "MOVE", "la etiqueta la pone quien llama");
  assert.deepEqual(
    [...result.affectedEntityIds].sort(),
    ["circle-1", "line-a", "line-b"],
    "las tres entidades se reportan como afectadas",
  );

  const movedA = result.document.entities.find((entity) => entity.id === "line-a");
  assert.equal(movedA?.type === "line" && movedA.start.x, 5, "el primer comando se aplicó");
  const resized = result.document.entities.find((entity) => entity.id === "circle-1");
  assert.equal(resized?.type === "circle" && resized.radius, 60, "el tercero también");

  // La alternativa que había antes: encadenar llamadas sueltas.
  let chained = document;
  chained = executeCadEntityCommand(chained, { type: "transform", entityId: "line-a", transform: { translation: { x: 5, y: 0 } } }).document;
  chained = executeCadEntityCommand(chained, { type: "transform", entityId: "line-b", transform: { translation: { x: 5, y: 0 } } }).document;
  chained = executeCadEntityCommand(chained, { type: "properties", entityId: "circle-1", patch: { radius: 60 } }).document;
  assert.equal(chained.meta.version, document.meta.version + 3, "encadenar sueltos sube la versión tres veces");
  assert.deepEqual(
    chained.entities,
    result.document.entities,
    "la geometría resultante es idéntica: lo único que cambia es la granularidad de la historia",
  );
}

assert.throws(
  () => executeCadEntityCommandBatch(baseDocument(), [], "vacío"),
  /needs at least one command/,
  "un lote vacío es un error de programación, no un no-op silencioso",
);

// --- 3. insert ----------------------------------------------------------------
{
  const document = baseDocument();
  const fresh = line("line-c", 400);
  const result = executeCadEntityCommandBatch(document, [{ type: "insert", entity: fresh }], "LINE");
  assert.ok(
    result.document.entities.some((entity) => entity.id === "line-c"),
    "la entidad nueva está en el documento",
  );
  assert.deepEqual(result.createdEntityIds, ["line-c"], "se reporta como creada");
  assert.equal(
    result.document.modelSpace.entityIds[result.document.modelSpace.entityIds.length - 1],
    "line-c",
    "por defecto entra al frente: última en el orden de dibujo",
  );
  assert.deepEqual(
    result.document.modelSpace.entityIds.slice(0, -1),
    document.modelSpace.entityIds,
    "los que ya estaban conservan su orden relativo exacto",
  );

  const behind = executeCadEntityCommandBatch(
    document,
    [{ type: "insert", entity: fresh, drawOrder: "back" }],
    "HATCH",
  );
  assert.equal(
    behind.document.modelSpace.entityIds[0],
    "line-c",
    "drawOrder 'back' la manda al fondo — es lo que necesitan hatches y wipeouts",
  );
  assert.equal(
    behind.document.modelSpace.entityIds.length,
    document.modelSpace.entityIds.length + 1,
    "sin duplicados al ir al fondo",
  );
}

assert.throws(
  () => executeCadEntityCommandBatch(baseDocument(), [{ type: "insert", entity: line("line-a", 9) }], "LINE"),
  /already exists/,
  "insertar un id que ya existe es un error",
);
assert.throws(
  () =>
    executeCadEntityCommandBatch(
      baseDocument(),
      // Una caja legacy no es una entidad nativa: el registro no la soporta.
      [{ type: "insert", entity: { id: "box-1", type: "box", kind: "asset", x: 0, y: 0, w: 1, h: 1, rotation: 0, layer: "0", shape: "rect" } as unknown as CadNativeEntity }],
      "INSERT",
    ),
  /is not a native entity/,
  "insertar algo que el registro no soporta es un error",
);

// --- 4. replace: cambiar de tipo sin perder id ni posición --------------------
{
  const document = baseDocument();
  const asEllipse: Extract<CadNativeEntity, { type: "ellipse" }> = {
    id: "circle-1",
    type: "ellipse",
    center: { x: 500, y: 500, z: 0 },
    majorAxis: { x: 80, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
    layer: "0",
  };
  const result = executeCadEntityCommandBatch(
    document,
    [{ type: "replace", entityId: "circle-1", entity: asEllipse }],
    "SCALE",
  );
  const replaced = result.document.entities.find((entity) => entity.id === "circle-1");
  assert.equal(replaced?.type, "ellipse", "un círculo con escala anisótropa pasa a ser elipse");
  assert.deepEqual(
    result.document.modelSpace.entityIds,
    document.modelSpace.entityIds,
    "sustituir conserva la posición exacta en el orden de dibujo",
  );
  assert.deepEqual(result.createdEntityIds, [], "sustituir no crea");
  assert.deepEqual(result.deletedEntityIds, [], "sustituir no borra");
  assert.equal(result.document.entities.length, document.entities.length, "el recuento no cambia");
}

assert.throws(
  () =>
    executeCadEntityCommandBatch(
      baseDocument(),
      [{ type: "replace", entityId: "circle-1", entity: line("otro-id", 0) }],
      "SCALE",
    ),
  /must keep the entity id/,
  "sustituir con otro id rompería las cotas que apuntan a la entidad: se rechaza",
);

// --- 5. crear y borrar dentro del mismo lote ---------------------------------
{
  const document = baseDocument();
  const result = executeCadEntityCommandBatch(
    document,
    [
      { type: "insert", entity: line("temporal", 700) },
      { type: "delete", entityId: "temporal" },
    ],
    "construcción auxiliar",
  );
  assert.deepEqual(result.createdEntityIds, [], "lo creado y borrado en el mismo lote no se reporta como creado");
  assert.deepEqual(result.deletedEntityIds, [], "ni como borrado: nunca existió para quien mira desde fuera");
  assert.deepEqual(
    result.document.modelSpace.entityIds,
    document.modelSpace.entityIds,
    "no queda ningún id fantasma en el orden de dibujo",
  );
  assert.ok(
    !result.document.entities.some((entity) => entity.id === "temporal"),
    "la entidad temporal no sobrevive",
  );
}

// --- 6. borrar de verdad ------------------------------------------------------
{
  const document = baseDocument();
  const result = executeCadEntityCommandBatch(
    document,
    [{ type: "delete", entityId: "line-a" }, { type: "delete", entityId: "line-b" }],
    "ERASE",
  );
  assert.deepEqual([...result.deletedEntityIds].sort(), ["line-a", "line-b"], "ambas se reportan borradas");
  assert.deepEqual(result.document.modelSpace.entityIds, ["circle-1"], "el orden de dibujo pierde las dos");
  assert.equal(result.document.meta.version, document.meta.version + 1, "dos borrados, una versión");
}

// --- 7. el orden determinista de `entities` se mantiene ----------------------
{
  const result = executeCadEntityCommandBatch(
    baseDocument(),
    [{ type: "insert", entity: line("aaa-primera", 900) }],
    "LINE",
  );
  const ids = result.document.entities.map((entity) => entity.id);
  assert.deepEqual([...ids].sort((a, b) => a.localeCompare(b)), ids, "`entities` sigue ordenado por id para que el serializado sea determinista");
  assert.notDeepEqual(
    result.document.modelSpace.entityIds,
    ids,
    "…y el orden de dibujo sigue siendo independiente de ese orden alfabético",
  );
}

// --- 8. el registro sigue mandando ------------------------------------------
assert.ok(CAD_ENTITY_REGISTRY.supports(circle), "el círculo de prueba es una entidad nativa");

// --- 9. `metadata` y `presentation`: el contexto también se muta por comando ---
//
// Existen para las asociatividades y los aspectos que NO tienen campo propio:
// `properties.write` es por adaptador y ninguno expone el contexto. Sin ellos,
// ARRAY no podría dejar escrito de qué matriz forma parte cada copia y
// MATCHPROP no podría copiar un color explícito.
{
  const marked = executeCadEntityCommandBatch(
    baseDocument(),
    [
      { type: "metadata", entityId: "line-a", patch: { arrayId: "A1", arrayIndex: 3 } },
      { type: "metadata", entityId: "line-a", patch: { arrayIndex: 4, extra: "x" } },
    ],
    "META",
  );
  const entity = marked.document.entities.find((candidate) => candidate.id === "line-a");
  assert.equal(entity?.context?.metadata?.arrayId, "A1", "la primera clave sobrevive…");
  assert.equal(entity?.context?.metadata?.arrayIndex, 4, "…y la segunda escritura la actualiza");
  assert.equal(entity?.context?.metadata?.extra, "x");
  assert.equal(marked.document.history.length, 1, "los dos comandos son UN paso de historia");

  // `null` BORRA la clave. Es como una matriz se desasocia, y sin ello el
  // metadato sería para siempre.
  const cleared = executeCadEntityCommandBatch(
    marked.document,
    [{ type: "metadata", entityId: "line-a", patch: { arrayId: null, arrayIndex: null, extra: null } }],
    "META",
  );
  const bare = cleared.document.entities.find((candidate) => candidate.id === "line-a");
  assert.equal(
    bare?.context,
    undefined,
    "sin metadatos ni nada más, el contexto se quita entero: dejar `{}` cambiaría el serializado",
  );

  const painted = executeCadEntityCommandBatch(
    baseDocument(),
    [
      {
        type: "presentation",
        entityId: "circle-1",
        presentation: { color: { source: "explicit", value: "#ff0000" } },
      },
    ],
    "MATCHPROP",
  );
  const circleAfter = painted.document.entities.find((candidate) => candidate.id === "circle-1");
  assert.equal(circleAfter?.context?.presentation?.color?.value, "#ff0000");

  const byLayer = executeCadEntityCommandBatch(
    painted.document,
    [{ type: "presentation", entityId: "circle-1", presentation: null }],
    "MATCHPROP",
  );
  assert.equal(
    byLayer.document.entities.find((candidate) => candidate.id === "circle-1")?.context,
    undefined,
    "`null` devuelve la entidad a PorCapa, que es distinto de no tocarla",
  );
}

console.log("cad entity command batch specs passed");
