/**
 * Modelo de la paleta de propiedades.
 *
 * Se comprueba lo que la paleta NO puede comprobar por sí sola: qué filas
 * salen con N objetos de tipos distintos, cuáles se marcan `*VARIES*`, qué se
 * clasifica dónde y qué se niega a escribir.
 *
 * Las aserciones son ANCLAS ABSOLUTAS —claves concretas, categorías concretas,
 * valores concretos—, no propiedades de ida y vuelta. Una propiedad del tipo
 * «lo que entra sale» se cumpliría igual con un modelo que no clasificara
 * nada, y ese es exactamente el fallo silencioso que ya se coló una vez en
 * este repositorio.
 *
 * Correr:  npx tsx src/components/cad/palettes/property-model.spec.ts
 */
import { strict as assert } from "node:assert";
import {
  CAD_PROPERTY_VARIES,
  buildCadPropertyModel,
  cadPropertyFieldValue,
  coerceCadPropertyInput,
  type CadPropertyModel,
  type CadPropertyRow,
} from "./property-model";

function row(model: CadPropertyModel, key: string): CadPropertyRow {
  for (const group of model.groups)
    for (const candidate of group.rows) if (candidate.key === key) return candidate;
  throw new Error(`La fila ${key} no está en el modelo.`);
}

function keys(model: CadPropertyModel): string[] {
  return model.groups.flatMap((group) => group.rows.map((entry) => entry.key));
}

const lineA = {
  id: "line-a",
  type: "line",
  properties: { startX: 0, startY: 0, endX: 100, endY: 0, length: 100, layer: "0" },
};
const lineB = {
  id: "line-b",
  type: "line",
  properties: { startX: 0, startY: 50, endX: 100, endY: 50, length: 100, layer: "0" },
};
const circle = {
  id: "circle-a",
  type: "circle",
  properties: { centerX: 10, centerY: 20, radius: 5, diameter: 10, layer: "Muros" },
};

// --- designación vacía: modelo vacío, no una excepción ------------------------
{
  const model = buildCadPropertyModel([]);
  assert.equal(model.count, 0);
  assert.deepEqual(model.groups, []);
  assert.equal(model.headline, "Sin selección");
}

// --- un solo objeto: TODAS sus propiedades, y ninguna varía -------------------
{
  const model = buildCadPropertyModel([lineA]);
  assert.equal(model.count, 1);
  assert.equal(model.headline, "LINE line-a");
  assert.deepEqual(
    keys(model).sort(),
    ["endX", "endY", "layer", "length", "startX", "startY"],
    "con un objeto la intersección es todo lo que expone su adaptador",
  );
  assert.equal(row(model, "startX").varies, false);
  assert.equal(row(model, "startX").value, 0);
  assert.equal(row(model, "endX").value, 100);
}

// --- categorías: no todo cae en el mismo cajón --------------------------------
{
  const model = buildCadPropertyModel([lineA]);
  assert.equal(row(model, "layer").category, "General");
  assert.equal(row(model, "startX").category, "Geometría");
  assert.deepEqual(
    model.groups.map((group) => group.category),
    ["General", "Geometría"],
    "y las categorías salen en el orden de AutoCAD, General primero",
  );
}

// --- dos objetos del mismo tipo: lo que difiere se marca ----------------------
{
  const model = buildCadPropertyModel([lineA, lineB]);
  assert.equal(model.count, 2);
  assert.equal(model.headline, "2 objetos · line");
  assert.equal(row(model, "startX").varies, false, "ambas empiezan en x=0");
  assert.equal(row(model, "startX").value, 0);
  assert.equal(row(model, "startY").varies, true, "una en y=0 y la otra en y=50");
  assert.equal(row(model, "startY").value, null);
  assert.equal(
    cadPropertyFieldValue(row(model, "startY")),
    "",
    "el campo va VACÍO y el marcador va de placeholder: teclear no obliga a borrar antes",
  );
  assert.deepEqual(
    row(model, "startY").entityIds,
    ["line-a", "line-b"],
    "una escritura va a las dos",
  );
}

// --- tipos distintos: INTERSECCIÓN, no unión ---------------------------------
{
  const model = buildCadPropertyModel([lineA, circle]);
  assert.equal(model.headline, "2 objetos · line, circle");
  assert.deepEqual(
    keys(model),
    ["layer"],
    "una línea y un círculo sólo comparten la capa; `radius` NO se ofrece",
  );
  assert.equal(row(model, "layer").varies, true, "0 contra Muros");
  assert.equal(
    keys(model).includes("radius"),
    false,
    "ofrecer radius aquí cambiaría la mitad de lo designado sin decirlo",
  );
}

// --- lo derivado no se puede escribir ----------------------------------------
{
  const model = buildCadPropertyModel([lineA]);
  assert.equal(
    row(model, "length").kind,
    "readonly",
    "el adaptador de LINE calcula length y su write la ignora",
  );
  assert.equal(row(model, "startX").kind, "number");
  assert.equal(row(model, "layer").kind, "text");
  assert.equal(
    coerceCadPropertyInput(row(model, "length"), "999"),
    null,
    "y por tanto un valor tecleado en ella no se aplica",
  );
}

// --- texto multilínea y booleanos --------------------------------------------
{
  const model = buildCadPropertyModel([
    {
      id: "mtext-a",
      type: "mtext",
      properties: { text: "Hola\nMundo", height: 120, bold: false, layer: "0" },
    },
  ]);
  assert.equal(row(model, "text").kind, "multiline");
  assert.equal(row(model, "text").category, "Texto");
  assert.equal(row(model, "bold").kind, "boolean");
  assert.equal(row(model, "height").category, "Texto");
  assert.equal(cadPropertyFieldValue(row(model, "text")), "Hola\nMundo");
}

// --- atributos de un INSERT tienen categoría propia ---------------------------
{
  const model = buildCadPropertyModel([
    {
      id: "insert-a",
      type: "insert",
      properties: {
        block: "door",
        rotation: 30,
        attributeCount: 1,
        "attribute:MARK": "D-02",
        layer: "0",
      },
    },
  ]);
  assert.equal(row(model, "attribute:MARK").category, "Atributos");
  assert.equal(row(model, "attribute:MARK").kind, "text");
  assert.equal(row(model, "block").kind, "readonly", "el bloque se cambia con otra orden");
  assert.equal(
    row(model, "attributeCount").kind,
    "readonly",
    "cualquier contador es derivado",
  );
  assert.equal(row(model, "rotation").category, "Geometría");
}

// --- coerción de lo tecleado --------------------------------------------------
{
  const model = buildCadPropertyModel([lineA]);
  assert.equal(coerceCadPropertyInput(row(model, "startX"), "42.5"), 42.5);
  assert.equal(
    coerceCadPropertyInput(row(model, "startX"), "no-es-un-numero"),
    null,
    "un número que no lo es se rechaza en vez de escribir NaN",
  );
  assert.equal(
    coerceCadPropertyInput(row(model, "layer"), CAD_PROPERTY_VARIES),
    null,
    "el propio marcador nunca es un valor",
  );
  assert.equal(coerceCadPropertyInput(row(model, "layer"), "Muros"), "Muros");
}

// --- booleanos mezclados ------------------------------------------------------
{
  const model = buildCadPropertyModel([
    { id: "a", type: "mtext", properties: { bold: true, layer: "0" } },
    { id: "b", type: "mtext", properties: { bold: false, layer: "0" } },
  ]);
  assert.equal(row(model, "bold").varies, true);
  assert.equal(row(model, "bold").value, null);
  assert.equal(row(model, "layer").varies, false);
  assert.equal(row(model, "layer").value, "0");
}

console.log(
  "cad properties palette model specs passed: intersección entre tipos, *VARIES* por valor divergente, categorías General/Geometría/Texto/Atributos, derivadas en sólo lectura y coerción que rechaza NaN",
);
