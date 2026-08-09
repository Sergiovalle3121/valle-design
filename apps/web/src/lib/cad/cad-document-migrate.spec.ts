/**
 * Migración del esquema 3 al 4.
 *
 * ## Por qué esta spec no usa una propiedad de ida y vuelta
 *
 * «Migrar dos veces devuelve lo mismo» se cumple DE FORMA VACÍA si el código no
 * toca un solo campo: aplicar la identidad dos veces también devuelve el
 * original. Una spec de este repositorio estuvo verde con cero reglas
 * implementadas justo por eso.
 *
 * Aquí, por tanto, se comparan ANCLAS ABSOLUTAS: qué número tiene `meta.schema`
 * después, qué campos exactos sobreviven con qué valores exactos, y qué
 * secciones opcionales siguen SIN EXISTIR. La idempotencia se comprueba
 * también, pero como complemento, no como prueba principal.
 */
import { strict as assert } from "node:assert";
import {
  CAD_DOCUMENT_SCHEMA,
  commitChange,
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "./cad-document";

// --- ancla absoluta: el número del esquema vigente ---------------------------
{
  assert.equal(CAD_DOCUMENT_SCHEMA, 4, "esta ola sube el esquema canónico a 4");
}

/** Documento v3 con una entidad de cada familia que ya existía. */
function schema3Document(): Record<string, unknown> {
  return {
    meta: { version: 7, schema: 3, unit: "mm", footprintW: 12_000, footprintH: 8_000, gridSize: 250 },
    layers: [{ id: "MUROS", name: "Muros", color: "#ffffff", visible: true, locked: false }],
    entities: [
      { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "MUROS" },
      {
        id: "p1",
        type: "polyline",
        vertices: [
          { x: 0, y: 0, z: 0, bulge: 0.5 },
          { x: 200, y: 0, z: 0 },
          { x: 200, y: 200, z: 0 },
        ],
        closed: true,
        layer: "MUROS",
      },
      {
        id: "i1",
        type: "insert",
        block: "puerta",
        insertion: { x: 50, y: 50, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 30,
        attributes: { CODIGO: "P-01" },
        layer: "MUROS",
      },
    ],
    history: [{ version: 7, label: "insert:line" }],
    modelSpace: { entityIds: ["i1", "p1", "l1"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [{ id: "puerta", name: "puerta", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

// --- el esquema sube y NADA más cambia ---------------------------------------
{
  const source = schema3Document();
  const migrated = migrateCadDocument(source);

  assert.equal(migrated.meta.schema, 4, "el documento pasa a declararse v4");
  // Anclas absolutas, campo a campo: no «igual que antes», sino ESTE valor.
  assert.equal(migrated.meta.version, 7, "la versión de contenido NO se toca");
  assert.equal(migrated.meta.unit, "mm");
  assert.equal(migrated.meta.footprintW, 12_000, "la huella sobrevive");
  assert.equal(migrated.meta.footprintH, 8_000);
  assert.equal(migrated.meta.gridSize, 250, "el paso de rejilla sobrevive");
  assert.equal(migrated.entities.length, 3);

  const line = migrated.entities.find((entity) => entity.id === "l1");
  assert.ok(line && line.type === "line");
  if (line.type !== "line") throw new Error("tipo");
  assert.equal(line.end.x, 100, "la geometría llega intacta");

  const polyline = migrated.entities.find((entity) => entity.id === "p1");
  if (polyline?.type !== "polyline") throw new Error("tipo");
  assert.equal(polyline.vertices[0].bulge, 0.5, "el bulge del v3 no se reinterpreta");
  assert.equal(
    polyline.vertices[0].startWidth,
    undefined,
    "el grosor por tramo del v4 NO se inventa: ausente sigue ausente",
  );

  const insert = migrated.entities.find((entity) => entity.id === "i1");
  if (insert?.type !== "insert") throw new Error("tipo");
  assert.deepEqual(insert.attributes, { CODIGO: "P-01" }, "el mapa plano de atributos se conserva");
  assert.equal(
    insert.positionedAttributes,
    undefined,
    "los atributos POSICIONADOS no se fabrican a partir del mapa: no hay dónde ponerlos",
  );

  // El orden de dibujo NO se alfabetiza: es contenido, no un índice.
  assert.deepEqual(migrated.modelSpace.entityIds, ["i1", "p1", "l1"]);

  // Secciones opcionales del v4: ausentes antes, ausentes después. Si se
  // materializaran como `[]`, el texto serializado de TODOS los documentos
  // existentes cambiaría y con él su hash de versión.
  assert.equal(migrated.imageDefinitions, undefined, "`imageDefinitions` no se materializa");
  assert.equal(migrated.cells, undefined, "`cells` sigue sin existir");
  assert.ok(!serializeCadDocument(migrated).includes("imageDefinitions"));
  assert.ok(!serializeCadDocument(migrated).includes('"cells"'));
}

// --- idempotencia: complemento, no la prueba principal ------------------------
{
  const once = migrateCadDocument(schema3Document());
  const twice = migrateCadDocument(JSON.parse(serializeCadDocument(once)));
  assert.equal(
    serializeCadDocument(twice),
    serializeCadDocument(once),
    "volver a migrar un v4 no cambia un byte",
  );
}

// --- un documento v4 con lo nuevo sobrevive a guardar y reabrir ---------------
{
  const base = migrateCadDocument(schema3Document());
  const withV4: CadDocument = {
    ...base,
    imageDefinitions: [
      { id: "img:planta", name: "planta.png", uri: "asset://tenant/planta.png", pixelWidth: 1024, pixelHeight: 768 },
    ],
    entities: [
      ...base.entities,
      { id: "pt1", type: "point", position: { x: 10, y: 20, z: 0 }, style: 34, layer: "MUROS" },
      {
        id: "xl1",
        type: "xline",
        basePoint: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
        layer: "MUROS",
      },
      {
        id: "im1",
        type: "image",
        definition: "img:planta",
        insertion: { x: 0, y: 0, z: 0 },
        uVector: { x: 2, y: 0, z: 0 },
        vVector: { x: 0, y: 2, z: 0 },
        size: { width: 1024, height: 768 },
        layer: "MUROS",
      },
    ],
    modelSpace: { entityIds: [...base.modelSpace.entityIds, "pt1", "xl1", "im1"] },
  };

  const reopened = parseCadDocument(serializeCadDocument(withV4));
  assert.equal(reopened.entities.length, 6, "las tres entidades nuevas sobreviven al viaje");
  assert.equal(reopened.imageDefinitions?.length, 1);
  assert.equal(reopened.imageDefinitions?.[0].pixelWidth, 1024);

  const point = reopened.entities.find((entity) => entity.id === "pt1");
  if (point?.type !== "point") throw new Error("tipo");
  assert.equal(point.position.x, 10);
  assert.equal(point.style, 34, "el estilo de punto (PDMODE 2 + círculo) llega tal cual");

  const xline = reopened.entities.find((entity) => entity.id === "xl1");
  if (xline?.type !== "xline") throw new Error("tipo");
  assert.equal(xline.direction.y, 1);

  const image = reopened.entities.find((entity) => entity.id === "im1");
  if (image?.type !== "image") throw new Error("tipo");
  assert.equal(image.definition, "img:planta");
  assert.equal(image.size.width, 1024);

  // `commitChange` tiene que clonar la sección nueva: si la compartiera por
  // referencia, editar una definición de imagen cambiaría también la del
  // documento anterior y el deshacer dejaría de devolver lo que había.
  const committed = commitChange(withV4, "prueba");
  committed.imageDefinitions![0].name = "otra.png";
  assert.equal(withV4.imageDefinitions![0].name, "planta.png", "el clon es profundo");
}

// --- un esquema del futuro se rechaza, no se adivina --------------------------
{
  assert.throws(
    () => migrateCadDocument({ ...schema3Document(), meta: { schema: 99, version: 1, unit: "mm" } }),
    /Unsupported CadDocument schema 99/,
  );
}

console.log(
  "migración v3→v4: esquema, huella, bulge, orden de dibujo y atributos verificados con anclas absolutas; " +
    "secciones opcionales siguen ausentes; ida y vuelta de POINT/XLINE/IMAGE confirmada",
);
