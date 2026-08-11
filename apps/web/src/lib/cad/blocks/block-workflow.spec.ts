/**
 * El flujo de bloques, con ANCLAS ABSOLUTAS.
 *
 * Una propiedad de ida y vuelta se cumple de forma VACÍA si el código nunca
 * toca el campo: «la escala sobrevive al guardado» es cierta también cuando la
 * escala vale siempre 1. Por eso aquí, además de las idas y vueltas, se afirma
 * QUÉ COORDENADA CONCRETA sale de cada inserción.
 *
 * El caso que más importa es la escala NEGATIVA. La ola anterior arregló que el
 * espejo alcanzara el contenido de los bloques y que el signo sobreviviera a
 * DXF; un `Math.abs` de conveniencia en el diálogo de INSERT lo perdería otra
 * vez, y el dibujo resultante sería plausible: la puerta se ve, sólo que abre
 * hacia el lado contrario.
 */
import assert from "node:assert/strict";
import {
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { resolveCadInsert } from "../professional-blocks";
import {
  CAD_BASE_POINT_BLOCK,
  cadAttEditCommands,
  cadBlockAttributePrompts,
  cadDefineBlockCommands,
  cadDrawingBasePoint,
  cadFindBlock,
  cadInsertBlockCommands,
  cadInsertableBlocks,
  cadSetDrawingBasePointCommands,
} from "./block-workflow";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} ≠ ${expected}`,
  );
  checks += 1;
};

/**
 * La «puerta»: un tramo horizontal de 1000 y una marca vertical de 200 en su
 * extremo derecho. Asimétrica a propósito — una figura simétrica no distingue
 * un espejo de un no-espejo, que es justo lo que hay que comprobar.
 */
const doorEntities: CadEntity[] = [
  {
    id: "door-leaf",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1_000, y: 0, z: 0 },
    layer: "0",
  },
  {
    id: "door-swing",
    type: "line",
    start: { x: 1_000, y: 0, z: 0 },
    end: { x: 1_000, y: 200, z: 0 },
    layer: "0",
  },
];

function baseDocument(entities: CadEntity[] = doorEntities): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: structuredClone(entities),
  });
}

/** Todos los extremos de línea que resuelve una inserción, ordenados. */
function resolvedSegments(document: CadDocument, insertId: string) {
  const resolved = resolveCadInsert(document, insertId);
  assert.deepEqual(
    resolved.diagnostics.filter((item) => item.severity === "error"),
    [],
    "la inserción resuelve sin errores",
  );
  return resolved.entities
    .filter((entity): entity is Extract<CadEntity, { type: "line" }> => entity.type === "line")
    .map((entity) => ({
      x1: entity.start.x,
      y1: entity.start.y,
      x2: entity.end.x,
      y2: entity.end.y,
    }))
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
}

// --- 1. BLOCK: definición, sustitución e inserción en UN lote ----------------
const defined = (() => {
  const document = baseDocument();
  const { commands, definition } = cadDefineBlockCommands({
    id: "block:puerta",
    name: "PUERTA",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: document.entities,
    insertId: "insert-origen",
  });
  const result = executeCadEntityCommandBatch(document, commands, "BLOCK");
  const next = result.document;
  assert.equal(next.blocks.length, 1, "una definición");
  assert.equal(next.blocks[0].name, "PUERTA", "con su nombre");
  assert.equal(next.blocks[0].entities.length, 2, "y las dos líneas dentro");
  ok(
    next.entities.length === 1 && next.entities[0].id === "insert-origen",
    "la geometría se sustituyó por UNA inserción",
  );
  assert.equal(next.meta.version, document.meta.version + 1, "un solo paso de deshacer");
  checks += 3;
  // Y la inserción en el punto base resuelve a la geometría ORIGINAL, clavada.
  const segments = resolvedSegments(next, "insert-origen");
  assert.deepEqual(
    segments,
    [
      { x1: 0, y1: 0, x2: 1_000, y2: 0 },
      { x1: 1_000, y1: 0, x2: 1_000, y2: 200 },
    ],
    "definir un bloque en su sitio no mueve nada",
  );
  checks += 1;
  return { document: next, definition };
})();

// --- 2. INSERT con escala NEGATIVA: el signo llega intacto -------------------
{
  const commands = cadInsertBlockCommands({
    id: "insert-espejo",
    block: defined.definition,
    insertion: { x: 5_000, y: 0, z: 0 },
    scale: { x: -1, y: 1, z: 1 },
    layer: "0",
  });
  const [insertCommand] = commands;
  assert.equal(insertCommand.type, "insert");
  assert.ok(insertCommand.type === "insert" && insertCommand.entity.type === "insert");
  // ANCLA ABSOLUTA: el objeto de escala, tal cual, con su signo.
  assert.deepEqual(
    insertCommand.entity.scale,
    { x: -1, y: 1, z: 1 },
    "la escala negativa NO pasa por Math.abs en ningún punto del camino",
  );
  checks += 3;

  const mirrored = executeCadEntityCommandBatch(defined.document, commands, "INSERT").document;
  // Y el signo significa algo: la hoja va hacia −x y la marca queda a la
  // IZQUIERDA del punto de inserción, no a la derecha.
  assert.deepEqual(
    resolvedSegments(mirrored, "insert-espejo"),
    [
      { x1: 4_000, y1: 0, x2: 4_000, y2: 200 },
      { x1: 5_000, y1: 0, x2: 4_000, y2: 0 },
    ],
    "la inserción espejada resuelve a la geometría reflejada, con coordenadas exactas",
  );
  checks += 1;
}

// --- 3. Tres inserciones, guardar, reabrir, y las tres siguen bien -----------
{
  let document = defined.document;
  const inserts: Array<[string, Parameters<typeof cadInsertBlockCommands>[0]]> = [
    [
      "insert-doble",
      {
        id: "insert-doble",
        block: defined.definition,
        insertion: { x: 0, y: 2_000, z: 0 },
        scale: { x: 2, y: 2, z: 1 },
        layer: "0",
      },
    ],
    [
      "insert-girado",
      {
        id: "insert-girado",
        block: defined.definition,
        insertion: { x: 0, y: 4_000, z: 0 },
        rotation: 90,
        layer: "0",
      },
    ],
    [
      "insert-espejo",
      {
        id: "insert-espejo",
        block: defined.definition,
        insertion: { x: 5_000, y: 0, z: 0 },
        scale: { x: -1, y: 1, z: 1 },
        layer: "0",
      },
    ],
  ];
  for (const [, input] of inserts)
    document = executeCadEntityCommandBatch(document, cadInsertBlockCommands(input), "INSERT").document;

  const reopened = parseCadDocument(serializeCadDocument(document));
  assert.equal(
    reopened.entities.filter((entity) => entity.type === "insert").length,
    4,
    "las cuatro inserciones sobreviven al guardado",
  );
  checks += 1;

  // ANCLAS ABSOLUTAS, una por inserción. «Hay tres inserts» no prueba nada.
  assert.deepEqual(
    resolvedSegments(reopened, "insert-doble"),
    [
      { x1: 0, y1: 2_000, x2: 2_000, y2: 2_000 },
      { x1: 2_000, y1: 2_000, x2: 2_000, y2: 2_400 },
    ],
    "escala 2: la hoja mide 2000 y la marca 400",
  );
  const girado = resolvedSegments(reopened, "insert-girado");
  near(girado[0].x1, 0, "girada 90°: la hoja arranca en el punto de inserción");
  near(girado[0].y1, 4_000, "girada 90°: y en el punto de inserción");
  near(girado[0].x2, 0, "girada 90°: la hoja sube por x = 0");
  near(girado[0].y2, 5_000, "girada 90°: y termina 1000 más arriba");
  near(girado[1].x2, -200, "girada 90°: la marca apunta a −x");
  near(girado[1].y2, 5_000, "girada 90°: y se queda a la altura del extremo");
  assert.deepEqual(
    resolvedSegments(reopened, "insert-espejo"),
    [
      { x1: 4_000, y1: 0, x2: 4_000, y2: 200 },
      { x1: 5_000, y1: 0, x2: 4_000, y2: 0 },
    ],
    "el espejo sigue siendo espejo después de guardar y reabrir",
  );
  checks += 2;
  const saved = reopened.entities.find(
    (entity): entity is Extract<CadEntity, { type: "insert" }> =>
      entity.type === "insert" && entity.id === "insert-espejo",
  );
  assert.deepEqual(saved?.scale, { x: -1, y: 1, z: 1 }, "y el −1 está en el JSON, no sólo en memoria");
  checks += 1;
}

// --- 4. ATTDEF de la selección → atributos del bloque ------------------------
const withAttributes = (() => {
  const document = baseDocument([
    ...doorEntities,
    {
      id: "attdef-ancho",
      type: "attdef",
      tag: "ANCHO",
      prompt: "Ancho de paso",
      defaultValue: "800",
      insertion: { x: 500, y: 300, z: 0 },
      height: 100,
      verify: true,
      layer: "0",
    },
  ]);
  const { commands, definition, attributeTags } = cadDefineBlockCommands({
    id: "block:puerta",
    name: "PUERTA",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: document.entities,
    insertId: "insert-origen",
  });
  assert.deepEqual(attributeTags, ["ANCHO"], "el ATTDEF se recogió como atributo");
  assert.equal(definition.entities.length, 2, "y NO se quedó también como geometría");
  checks += 2;
  assert.deepEqual(
    cadBlockAttributePrompts(definition).map((prompt) => [prompt.tag, prompt.prompt, prompt.required]),
    [["ANCHO", "Ancho de paso", true]],
    "y su prompt es lo que se pregunta al insertar",
  );
  checks += 1;
  return { document: executeCadEntityCommandBatch(document, commands, "BLOCK").document, definition };
})();

// --- 5. Los atributos POSICIONADOS nacen colocados y se mueven con el bloque -
{
  const inserted = executeCadEntityCommandBatch(
    withAttributes.document,
    cadInsertBlockCommands({
      id: "insert-attr",
      block: withAttributes.definition,
      insertion: { x: 10_000, y: 0, z: 0 },
      scale: { x: 2, y: 2, z: 1 },
      layer: "0",
      attributes: { ANCHO: "900" },
    }),
    "INSERT",
  ).document;
  const insert = inserted.entities.find(
    (entity): entity is Extract<CadEntity, { type: "insert" }> => entity.id === "insert-attr",
  );
  const attribute = insert?.positionedAttributes?.[0];
  assert.equal(attribute?.tag, "ANCHO", "el atributo posicionado existe");
  assert.equal(attribute?.value, "900", "con el valor que se le dio");
  // ANCLA ABSOLUTA: posición del ATTDEF (500,300) escalada ×2 y trasladada.
  near(attribute!.insertion.x, 11_000, "posición x = 10000 + 500·2");
  near(attribute!.insertion.y, 600, "posición y = 300·2");
  near(attribute!.height!, 200, "y la altura del texto también escala");
  checks += 2;

  // Y ahora se MUEVE el bloque: el texto tiene que ir con él.
  const moved = executeCadEntityCommandBatch(
    inserted,
    [{ type: "transform", entityId: "insert-attr", transform: { translation: { x: 0, y: 1_000 } } }],
    "MOVE",
  ).document;
  const movedAttribute = moved.entities
    .filter((entity): entity is Extract<CadEntity, { type: "insert" }> => entity.id === "insert-attr")
    .flatMap((entity) => entity.positionedAttributes ?? [])[0];
  near(movedAttribute.insertion.x, 11_000, "mover en y no cambia x");
  near(movedAttribute.insertion.y, 1_600, "y el texto del atributo se movió CON el bloque");
}

// --- 6. ATTEDIT cambia el valor y deja la posición coherente -----------------
{
  const inserted = executeCadEntityCommandBatch(
    withAttributes.document,
    cadInsertBlockCommands({
      id: "insert-attr",
      block: withAttributes.definition,
      insertion: { x: 0, y: 0, z: 0 },
      layer: "0",
      attributes: { ANCHO: "800" },
    }),
    "INSERT",
  ).document;
  const insert = inserted.entities.find(
    (entity): entity is Extract<CadEntity, { type: "insert" }> => entity.id === "insert-attr",
  )!;
  const edited = executeCadEntityCommandBatch(
    inserted,
    cadAttEditCommands(insert, withAttributes.definition, { ANCHO: "1200" }),
    "ATTEDIT",
  ).document;
  const after = edited.entities.find(
    (entity): entity is Extract<CadEntity, { type: "insert" }> => entity.id === "insert-attr",
  )!;
  assert.equal(after.attributes?.ANCHO, "1200", "el valor cambió en el mapa por etiqueta");
  assert.equal(after.positionedAttributes?.[0].value, "1200", "y también en el atributo DIBUJADO");
  ok(after.type === "insert" && edited.entities.length === inserted.entities.length, "sin crear ni borrar nada");
  checks += 2;

  // Un atributo obligatorio no se puede vaciar.
  assert.throws(
    () => cadAttEditCommands(insert, withAttributes.definition, { ANCHO: "  " }),
    /obligatorios/,
    "ANCHO estaba marcado con verify: no admite quedarse en blanco",
  );
  checks += 1;
}

// --- 7. BASE persiste y no se ofrece como bloque insertable ------------------
{
  const document = defined.document;
  assert.deepEqual(cadDrawingBasePoint(document.blocks), { x: 0, y: 0, z: 0 }, "sin BASE, el origen");
  const withBase = executeCadEntityCommandBatch(
    document,
    cadSetDrawingBasePointCommands(document.blocks, { x: 1_500, y: -250, z: 0 }),
    "BASE",
  ).document;
  assert.deepEqual(
    cadDrawingBasePoint(withBase.blocks),
    { x: 1_500, y: -250, z: 0 },
    "BASE queda escrito",
  );
  const reopened = parseCadDocument(serializeCadDocument(withBase));
  assert.deepEqual(
    cadDrawingBasePoint(reopened.blocks),
    { x: 1_500, y: -250, z: 0 },
    "y sobrevive a guardar y reabrir",
  );
  checks += 3;
  ok(
    !cadInsertableBlocks(withBase.blocks).some((block) => block.name === CAD_BASE_POINT_BLOCK),
    "el bloque de sistema no aparece en la lista de bloques insertables",
  );
  // Y volver a fijarlo lo REDEFINE en vez de chocar con el que ya está.
  const again = executeCadEntityCommandBatch(
    withBase,
    cadSetDrawingBasePointCommands(withBase.blocks, { x: 0, y: 0, z: 0 }),
    "BASE",
  ).document;
  assert.deepEqual(cadDrawingBasePoint(again.blocks), { x: 0, y: 0, z: 0 }, "BASE se puede volver a fijar");
  checks += 1;
}

// --- 8. Búsqueda por nombre, sin distinguir mayúsculas -----------------------
{
  ok(!!cadFindBlock(defined.document.blocks, "puerta"), "el nombre resuelve en minúsculas");
  ok(!!cadFindBlock(defined.document.blocks, "block:puerta"), "y el id también");
  ok(!cadFindBlock(defined.document.blocks, "ventana"), "y lo que no está, no está");
}

console.log(`block-workflow.spec: ${checks} comprobaciones OK`);
