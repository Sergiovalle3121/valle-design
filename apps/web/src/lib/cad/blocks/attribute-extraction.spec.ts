/**
 * La extracción de atributos, EJECUTADA por el motor de comandos real: BLOCK
 * define el bloque desde un ATTDEF, INSERT lo coloca dos veces con valores
 * distintos, ATTEDIT cambia UNA de las dos, y sólo entonces se mide el CSV
 * contra esos valores exactos — no contra «se generó algo».
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { cadDefineBlockCommands, cadInsertBlockCommands, cadAttEditCommands, cadFindBlock } from "./block-workflow";
import {
  buildCadAttributeExtractionCsv,
  cadAttributeExtractionSection,
  cadAttributeExtractionSections,
  cadBlockHasAttributes,
} from "./attribute-extraction";

let checks = 0;
const ok = (condition: unknown, message: string): void => {
  assert.ok(condition, message);
  checks += 1;
};

function baseDocument(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" }, entities: structuredClone(entities) });
}

/** El símbolo de una luminaria: un círculo de 150 con su ATTDEF de potencia y circuito. */
const luminaireEntities: CadEntity[] = [
  { id: "circulo", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 150, layer: "0" },
  {
    id: "attdef-potencia",
    type: "attdef",
    tag: "POTENCIA",
    prompt: "Potencia (W)",
    defaultValue: "18",
    insertion: { x: 200, y: 0, z: 0 },
    layer: "0",
  },
  {
    id: "attdef-circuito",
    type: "attdef",
    tag: "CIRCUITO",
    prompt: "Circuito",
    defaultValue: "A1",
    insertion: { x: 200, y: -150, z: 0 },
    layer: "0",
  },
  {
    // MARCA es CONSTANTE: toda luminaria de este bloque es del mismo modelo,
    // y la extracción tiene que decirlo aunque ninguna inserción lo traiga.
    id: "attdef-marca",
    type: "attdef",
    tag: "MARCA",
    prompt: "Marca",
    defaultValue: "LEDVANCE LDV-18",
    insertion: { x: 200, y: -300, z: 0 },
    constant: true,
    layer: "0",
  },
];

// --- 1. BLOCK define y sustituye por UNA inserción: una fila, valores por defecto
{
  const document = baseDocument(luminaireEntities);
  const { commands, definition } = cadDefineBlockCommands({
    id: "block:lum-01",
    name: "LUM-01",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: document.entities,
    insertId: "insert-origen",
    // disposition por defecto ("insert"): borra la selección y la sustituye
    // por UNA inserción en el punto base — la única fila que debe salir aquí.
  });
  const afterBlock = executeCadEntityCommandBatch(document, commands, "BLOCK").document;
  const section = cadAttributeExtractionSection(afterBlock.entities, definition);
  ok(section.block === "LUM-01", "la sección lleva el nombre del bloque");
  assert.deepEqual(section.tags, ["CIRCUITO", "MARCA", "POTENCIA"], "las tres etiquetas, alfabéticas");
  checks += 1;
  assert.equal(section.rows.length, 1, "la inserción que BLOCK añadió al definir");
  checks += 1;
  assert.deepEqual(
    section.rows[0].values,
    { CIRCUITO: "A1", MARCA: "LEDVANCE LDV-18", POTENCIA: "18" },
    "todo por defecto: nadie ha insertado con valores propios todavía",
  );
  checks += 1;
}

// --- 2. Dos inserciones con valores propios, una editada, y el CSV exacto ---
{
  const document = baseDocument(luminaireEntities);
  const { commands, definition } = cadDefineBlockCommands({
    id: "block:lum-01",
    name: "LUM-01",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: document.entities,
    insertId: "insert-origen",
    disposition: "delete", // el símbolo de origen no cuenta como inserción real
  });
  let current = executeCadEntityCommandBatch(document, commands, "BLOCK").document;

  current = executeCadEntityCommandBatch(
    current,
    cadInsertBlockCommands({
      id: "lum-cocina",
      block: definition,
      insertion: { x: 3_000, y: 1_000, z: 0 },
      layer: "ELEC",
      attributes: { POTENCIA: "24", CIRCUITO: "A1" },
    }),
    "INSERT",
  ).document;
  current = executeCadEntityCommandBatch(
    current,
    cadInsertBlockCommands({
      id: "lum-pasillo",
      block: definition,
      insertion: { x: 5_000, y: 1_000, z: 0 },
      layer: "ELEC",
      attributes: { POTENCIA: "9", CIRCUITO: "A2" },
    }),
    "INSERT",
  ).document;

  // ATTEDIT sobre la de cocina: sube de 24 a 26 W. Sólo esa fila cambia.
  const cocina = current.entities.find((entity): entity is Extract<CadEntity, { type: "insert" }> => entity.id === "lum-cocina")!;
  const block = cadFindBlock(current.blocks, "LUM-01")!;
  current = executeCadEntityCommandBatch(
    current,
    cadAttEditCommands(cocina, block, { POTENCIA: "26" }),
    "ATTEDIT",
  ).document;

  const sections = cadAttributeExtractionSections(current.entities, current.blocks);
  ok(sections.length === 1, "una sola sección: un único bloque con atributos en el dibujo");
  const [section] = sections;
  assert.equal(section.rows.length, 2, "las dos inserciones reales, sin la de origen que BLOCK consumió");
  checks += 1;

  const porId = new Map(section.rows.map((row) => [row.insertId, row.values]));
  assert.deepEqual(
    porId.get("lum-cocina"),
    { CIRCUITO: "A1", MARCA: "LEDVANCE LDV-18", POTENCIA: "26" },
    "la de cocina mide el valor DESPUÉS de ATTEDIT, no el que se tecleó al insertar",
  );
  checks += 1;
  assert.deepEqual(
    porId.get("lum-pasillo"),
    { CIRCUITO: "A2", MARCA: "LEDVANCE LDV-18", POTENCIA: "9" },
    "y la otra no se movió: ATTEDIT no toca lo que no se le pidió",
  );
  checks += 1;

  const csv = buildCadAttributeExtractionCsv(sections);
  const expected = [
    "LUM-01",
    "Identificador,CIRCUITO,MARCA,POTENCIA",
    "lum-cocina,A1,LEDVANCE LDV-18,26",
    "lum-pasillo,A2,LEDVANCE LDV-18,9",
  ].join("\r\n");
  assert.equal(csv, expected, `el CSV, carácter a carácter:\n${JSON.stringify(csv)}`);
  checks += 1;
}

// --- 3. Un bloque sin atributos no aparece en la extracción -----------------
{
  const plain: CadEntity[] = [
    { id: "linea", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer: "0" },
  ];
  const document = baseDocument(plain);
  const { commands, definition } = cadDefineBlockCommands({
    id: "block:tornillo",
    name: "TORNILLO",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: document.entities,
    insertId: "insert-origen",
  });
  const after = executeCadEntityCommandBatch(document, commands, "BLOCK").document;
  ok(!cadBlockHasAttributes(definition), "TORNILLO no tiene ningún ATTDEF");
  const sections = cadAttributeExtractionSections(after.entities, after.blocks);
  ok(sections.length === 0, "y por tanto no aporta ninguna sección: nada que extraer no es una tabla vacía");
}

// --- 4. Un valor de atributo con coma se cita, como en DATAEXTRACTION -------
{
  const document = baseDocument(luminaireEntities);
  const { commands, definition } = cadDefineBlockCommands({
    id: "block:lum-01",
    name: "LUM-01",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: document.entities,
    insertId: "insert-origen",
    disposition: "delete",
  });
  let current = executeCadEntityCommandBatch(document, commands, "BLOCK").document;
  current = executeCadEntityCommandBatch(
    current,
    cadInsertBlockCommands({
      id: "lum-1",
      block: definition,
      insertion: { x: 0, y: 0, z: 0 },
      layer: "ELEC",
      attributes: { CIRCUITO: "A1, reforzado" },
    }),
    "INSERT",
  ).document;
  const csv = buildCadAttributeExtractionCsv(cadAttributeExtractionSections(current.entities, current.blocks));
  ok(csv.includes('"A1, reforzado"'), `la coma obliga a citar el campo: ${JSON.stringify(csv)}`);
}

console.log(`blocks/attribute-extraction.spec: ${checks} comprobaciones OK`);
