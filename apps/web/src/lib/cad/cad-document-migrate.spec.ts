/**
 * Migración del esquema 3 al 5.
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
  cadDocumentStats,
  commitChange,
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "./cad-document";

// --- ancla absoluta: el número del esquema vigente ---------------------------
{
  assert.equal(CAD_DOCUMENT_SCHEMA, 5, "esta ola sube el esquema canónico a 5");
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

  assert.equal(migrated.meta.schema, 5, "el documento pasa a declararse v5");
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
    "volver a migrar un v5 no cambia un byte",
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

// --- v4 → v5: aditivo, y NO se fabrican regiones ------------------------------
//
// Ésta es la tentación concreta del esquema 5: un v4 tiene polilíneas CERRADAS y
// círculos, que es justo lo que consume EXTRUDE, y convertirlos en REGION al
// abrir «para que ya estén listos» parecería un favor. Sería un cambio de
// contenido no pedido: cambiaría lo que el usuario ve, lo que exporta a DXF y el
// hash de todos los documentos existentes. El ancla que lo fija no es «migrar
// dos veces da lo mismo» —eso se cumple vacío— sino el RECUENTO exacto por tipo.
{
  const v4: Record<string, unknown> = {
    ...schema3Document(),
    meta: { version: 3, schema: 4, unit: "mm" },
    entities: [
      {
        id: "cerrada",
        type: "polyline",
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 100, y: 0, z: 0 },
          { x: 100, y: 100, z: 0 },
        ],
        closed: true,
        layer: "MUROS",
      },
      { id: "circ", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 50, layer: "MUROS" },
    ],
    modelSpace: { entityIds: ["cerrada", "circ"] },
  };
  const migrated = migrateCadDocument(v4);

  assert.equal(migrated.meta.schema, 5, "el v4 pasa a declararse v5");
  assert.equal(migrated.meta.version, 3, "la versión de contenido NO se toca al subir de esquema");
  const stats = cadDocumentStats(migrated);
  assert.equal(stats.polyline, 1, "la polilínea cerrada SIGUE siendo una polilínea");
  assert.equal(stats.circle, 1, "el círculo SIGUE siendo un círculo");
  assert.equal(stats.region, 0, "no se fabrica ninguna REGION al abrir");
  assert.equal(stats.solid3d, 0, "no se fabrica ningún SOLID3D al abrir");
  assert.deepEqual(migrated.modelSpace.entityIds, ["cerrada", "circ"], "el z-order no se toca");
}

// --- un v5 con sólidos y regiones sobrevive a guardar y reabrir ---------------
{
  const base = migrateCadDocument(schema3Document());
  const withV5: CadDocument = {
    ...base,
    entities: [
      ...base.entities,
      {
        id: "sol1",
        type: "solid3d",
        name: "Base",
        root: "n2",
        nodes: [
          {
            id: "n1",
            op: "extrude",
            profile: {
              outer: [
                { x: 0, y: 0 },
                { x: 400, y: 0 },
                { x: 400, y: 300 },
                { x: 0, y: 300 },
              ],
            },
            height: 200,
          },
          { id: "n2", op: "subtract", operands: ["n1", "n1b"] },
          { id: "n1b", op: "box", min: { x: 100, y: 100, z: -50 }, max: { x: 200, y: 200, z: 250 } },
        ],
        placement: { a: 1, b: 0, c: 0, d: 1, e: 1_000, f: 500, dz: 0 },
        layer: "MUROS",
      },
      {
        id: "reg1",
        type: "region",
        outer: [
          { x: 0, y: 0, z: 0 },
          { x: 100, y: 0, z: 0 },
          { x: 100, y: 100, z: 0 },
          { x: 0, y: 100, z: 0 },
        ],
        layer: "MUROS",
      },
    ],
    modelSpace: { entityIds: [...base.modelSpace.entityIds, "sol1", "reg1"] },
  };

  const reopened = parseCadDocument(serializeCadDocument(withV5));
  const solid = reopened.entities.find((entity) => entity.id === "sol1");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  // El ÁRBOL sobrevive entero, nodo a nodo. Es lo que hace que un sólido se
  // pueda reeditar después de cerrar el dibujo; si sólo viajase la malla,
  // «cambia la altura de la extrusión» sería imposible.
  assert.equal(solid.nodes.length, 3, "los tres nodos del árbol sobreviven");
  assert.equal(solid.root, "n2");
  const extrude = solid.nodes.find((node) => node.id === "n1");
  if (extrude?.op !== "extrude") throw new Error("op");
  assert.equal(extrude.height, 200, "la altura de la extrusión llega con su valor exacto");
  assert.equal(extrude.profile.outer.length, 4);
  assert.equal(solid.placement?.e, 1_000, "la colocación sobrevive");
  assert.equal(solid.name, "Base");

  const region = reopened.entities.find((entity) => entity.id === "reg1");
  if (region?.type !== "region") throw new Error("tipo");
  assert.equal(region.outer.length, 4);
  assert.equal(region.inners, undefined, "los agujeros ausentes siguen ausentes");

  // Y la malla NO se persiste: el serializado no contiene ni un triángulo. Es la
  // razón de ser del esquema 5 y merece un ancla en vez de confianza.
  const text = serializeCadDocument(withV5);
  assert.ok(!text.includes("positions"), "la malla no viaja en el documento");
  assert.ok(!text.includes("indices"), "los índices de triángulo tampoco");
}

// --- un esquema del futuro se rechaza, no se adivina --------------------------
{
  assert.throws(
    () => migrateCadDocument({ ...schema3Document(), meta: { schema: 99, version: 1, unit: "mm" } }),
    /Unsupported CadDocument schema 99/,
  );
}

console.log(
  "migración v3→v5: esquema, huella, bulge, orden de dibujo y atributos verificados con anclas absolutas; " +
    "secciones opcionales siguen ausentes; ida y vuelta de POINT/XLINE/IMAGE confirmada; " +
    "v4→v5 aditivo (ninguna REGION ni SOLID3D fabricados) y el árbol de construcción sobrevive sin malla",
);
