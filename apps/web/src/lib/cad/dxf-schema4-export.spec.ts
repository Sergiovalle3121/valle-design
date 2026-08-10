import assert from "node:assert/strict";
import { exportCadDxf } from "./dxf-export";
import { cadDocumentNativeDxfPrimitives } from "./dxf-cad-document";
import { CAD_SCHEMA_4_ENTITY_TYPES, type CadDocument, type CadEntity } from "./cad-document";

/**
 * Los ocho tipos del esquema 4 escritos con su CÓDIGO DXF REAL.
 *
 * No vale "algo que se ve parecido": un XLINE exportado como una línea muy
 * larga deja de ser una recta de construcción en cuanto el destinatario la
 * mueve, y un SOLID escrito en orden de polígono sale como un reloj de arena
 * relleno en cualquier programa que no sea el nuestro.
 *
 * Este spec lee el FICHERO, no el modelo: busca los pares código/valor que
 * tienen que estar. Comprobar el objeto intermedio dejaría pasar exactamente el
 * fallo que importa —que el escritor no los emita— porque la aserción se
 * cumpliría igual con un exportador que no escribe nada.
 */

const p = (x: number, y: number, z = 0) => ({ x, y, z });

const IMAGE_DEFINITION = {
  id: "img-plano",
  name: "plano-base",
  uri: "asset://tenant/planos/base.png",
  pixelWidth: 1_024,
  pixelHeight: 768,
};

const entities: CadEntity[] = [
  { id: "e-point", type: "point", position: p(120, 240), style: 34, size: 15, layer: "REF" },
  { id: "e-xline", type: "xline", basePoint: p(10, 20), direction: p(1, 0), layer: "REF" },
  { id: "e-ray", type: "ray", basePoint: p(30, 40), direction: p(0, 1), layer: "REF" },
  {
    id: "e-solid",
    type: "solid",
    points: [p(0, 0), p(100, 0), p(100, 80), p(0, 80)],
    layer: "RELLENO",
  },
  {
    id: "e-wipeout",
    type: "wipeout",
    boundary: [p(200, 200), p(400, 200), p(400, 300), p(200, 300)],
    frame: true,
    layer: "MASCARA",
  },
  {
    id: "e-image",
    type: "image",
    definition: "img-plano",
    insertion: p(1_000, 500),
    uVector: p(2, 0),
    vVector: p(0, 2),
    size: { width: 1_024, height: 768 },
    brightness: 60,
    contrast: 40,
    fade: 10,
    layer: "FONDO",
  },
  {
    id: "e-attdef",
    type: "attdef",
    tag: "MARCA",
    prompt: "Marca del equipo",
    defaultValue: "P-101",
    insertion: p(15, 25),
    height: 120,
    invisible: true,
    verify: true,
    layer: "ATRIB",
  },
  {
    id: "e-table",
    type: "table",
    insertion: p(0, 2_000),
    rows: 2,
    columns: 2,
    rowHeights: [200, 200],
    columnWidths: [500, 500],
    cells: [
      { row: 0, column: 0, text: "Ref" },
      { row: 0, column: 1, text: "Cantidad" },
      { row: 1, column: 0, text: "P-101" },
    ],
    layer: "CUADRO",
  },
] as unknown as CadEntity[];

const document = {
  entities,
  layers: [],
  modelSpace: { entityIds: entities.map((entity) => entity.id) },
  unsupportedEntities: [],
  imageDefinitions: [IMAGE_DEFINITION],
} as unknown as CadDocument;

const primitives = cadDocumentNativeDxfPrimitives(document);
assert.equal(
  primitives.length,
  CAD_SCHEMA_4_ENTITY_TYPES.length,
  "los ocho tipos tienen que llegar al modelo de exportación por el canal de primitivas",
);

const content = exportCadDxf({ primitives }).content;
const pairs = content.split("\n");

/** Índices donde arranca una entidad del tipo pedido. */
function entityStarts(type: string): number[] {
  const found: number[] = [];
  for (let index = 0; index + 1 < pairs.length; index += 2)
    if (pairs[index].trim() === "0" && pairs[index + 1].trim() === type)
      found.push(index);
  return found;
}

/** Primer valor del código pedido DENTRO de la entidad que empieza en `start`. */
function valueAt(start: number, code: number): string | null {
  for (let index = start + 2; index + 1 < pairs.length; index += 2) {
    if (pairs[index].trim() === "0") return null;
    if (Number(pairs[index].trim()) === code) return pairs[index + 1].trim();
  }
  return null;
}

function allValuesAt(start: number, code: number): string[] {
  const values: string[] = [];
  for (let index = start + 2; index + 1 < pairs.length; index += 2) {
    if (pairs[index].trim() === "0") break;
    if (Number(pairs[index].trim()) === code) values.push(pairs[index + 1].trim());
  }
  return values;
}

// --- POINT: geometría + estilo en la CABECERA -----------------------------

const [point] = entityStarts("POINT");
assert.ok(point !== undefined, "falta la entidad POINT");
assert.equal(valueAt(point, 8), "REF");
assert.equal(valueAt(point, 10), "120");
assert.equal(valueAt(point, 20), "240");
assert.match(content, /\$PDMODE\n70\n34\n/, "el estilo del punto viaja como variable de cabecera");
assert.match(content, /\$PDSIZE\n40\n15\n/, "y el tamaño también");

// --- XLINE y RAY: punto base (10) y vector director (11) ------------------

const [xline] = entityStarts("XLINE");
assert.ok(xline !== undefined, "falta la entidad XLINE");
assert.equal(valueAt(xline, 10), "10");
assert.equal(valueAt(xline, 20), "20");
assert.equal(valueAt(xline, 11), "1", "el grupo 11 de un XLINE es el VECTOR director");
assert.equal(valueAt(xline, 21), "0");

const [ray] = entityStarts("RAY");
assert.ok(ray !== undefined, "falta la entidad RAY");
assert.equal(valueAt(ray, 10), "30");
assert.equal(valueAt(ray, 11), "0");
assert.equal(valueAt(ray, 21), "1");

// --- SOLID: el CORBATÍN ---------------------------------------------------
//
// El contorno a-b-c-d se escribe 10=a, 11=b, 12=d, 13=c. Es la trampa clásica
// de la entidad: escribirlo en orden de polígono produce dos triángulos
// cruzados, y el error sólo se ve al abrir el fichero en otro programa.

const [solid] = entityStarts("SOLID");
assert.ok(solid !== undefined, "falta la entidad SOLID");
assert.deepEqual(
  [10, 11, 12, 13].map((code) => [valueAt(solid, code), valueAt(solid, code + 10)]),
  [
    ["0", "0"],
    ["100", "0"],
    ["0", "80"],
    ["100", "80"],
  ],
  "el cuarto vértice del SOLID va en orden de reloj de arena, no de polígono",
);

// --- WIPEOUT: contorno NORMALIZADO + su entrada en OBJECTS ----------------

const [wipeout] = entityStarts("WIPEOUT");
assert.ok(wipeout !== undefined, "falta la entidad WIPEOUT");
assert.equal(valueAt(wipeout, 10), "200", "el punto de inserción es la esquina inferior izquierda");
assert.equal(valueAt(wipeout, 20), "200");
assert.equal(valueAt(wipeout, 11), "200", "el vector U mide el ancho del enmascaramiento");
assert.equal(valueAt(wipeout, 22), "100", "y el vector V su alto");
assert.equal(valueAt(wipeout, 71), "2", "contorno POLIGONAL");
assert.equal(valueAt(wipeout, 91), "5", "cuatro vértices más el cierre");
assert.deepEqual(
  allValuesAt(wipeout, 14),
  ["-0.5", "0.5", "0.5", "-0.5", "-0.5"],
  "los vértices van en coordenadas normalizadas de la imagen, con el origen en el CENTRO",
);
assert.match(content, /ACAD_WIPEOUT_VARS/, "el enmascaramiento necesita su entrada en la tabla de objetos");
assert.match(content, /WIPEOUTVARIABLES\n5\n[0-9A-F]+\n330\n[0-9A-F]+\n100\nAcDbWipeoutVariables\n70\n1\n/,
  "el marco del enmascaramiento viaja en ACAD_WIPEOUT_VARS");

// --- IMAGE: la más laboriosa — vive en un diccionario, no suelta ----------

const [image] = entityStarts("IMAGE");
assert.ok(image !== undefined, "falta la entidad IMAGE");
assert.equal(valueAt(image, 10), "1000");
assert.equal(valueAt(image, 11), "2", "el vector U mide UN píxel en unidades de dibujo");
assert.equal(valueAt(image, 13), "1024", "el grupo 13 es el encuadre EN PÍXELES");
assert.equal(valueAt(image, 23), "768");
assert.equal(valueAt(image, 281), "60", "brillo");
assert.equal(valueAt(image, 282), "40", "contraste");
assert.equal(valueAt(image, 283), "10", "desvanecido");

const imageDefHandle = valueAt(image, 340);
const reactorHandle = valueAt(image, 360);
assert.ok(imageDefHandle, "una IMAGE sin grupo 340 no apunta a ninguna definición");
assert.ok(reactorHandle, "una IMAGE sin grupo 360 no tiene reactor");

const [imagedef] = entityStarts("IMAGEDEF");
assert.ok(imagedef !== undefined, "falta el objeto IMAGEDEF");
assert.equal(valueAt(imagedef, 5), imageDefHandle, "el 340 de la IMAGE apunta al IMAGEDEF real");
assert.equal(valueAt(imagedef, 1), IMAGE_DEFINITION.uri, "el IMAGEDEF guarda la RUTA");
assert.equal(valueAt(imagedef, 10), "1024", "y el tamaño en píxeles del archivo");

const [reactor] = entityStarts("IMAGEDEF_REACTOR");
assert.ok(reactor !== undefined, "falta el IMAGEDEF_REACTOR");
assert.equal(valueAt(reactor, 5), reactorHandle);
assert.match(content, /ACAD_IMAGE_DICT/, "la imagen vive en un diccionario, no suelta");
assert.ok(
  content.indexOf("SECTION\n2\nOBJECTS") > content.indexOf("SECTION\n2\nENTITIES"),
  "la sección OBJECTS va detrás de ENTITIES",
);

// --- ATTDEF: etiqueta, prompt y BANDERAS del grupo 70 --------------------

const [attdef] = entityStarts("ATTDEF");
assert.ok(attdef !== undefined, "falta la entidad ATTDEF");
assert.equal(valueAt(attdef, 1), "P-101", "valor por defecto");
assert.equal(valueAt(attdef, 3), "Marca del equipo", "prompt");
assert.equal(valueAt(attdef, 2), "MARCA", "etiqueta");
assert.equal(valueAt(attdef, 70), "5", "invisible (1) + verificable (4) = 5");
assert.equal(valueAt(attdef, 40), "120");

// --- TABLE: geometría declarada, no una entidad muda ---------------------

const cellRects = entityStarts("POLYLINE").length;
assert.equal(cellRects, 4, "la tabla 2×2 escribe una rejilla de cuatro celdas");
assert.ok(
  content.includes("\nRef\n") && content.includes("\nCantidad\n") && content.includes("\nP-101\n"),
  "el texto de cada celda tiene que estar en el fichero",
);

// --- Un dibujo SIN esquema 4 no cambia de forma --------------------------
//
// La sección OBJECTS y las variables de punto sólo aparecen cuando hacen falta:
// un dibujo que no los usa produce el mismo fichero que antes de este trabajo.

const plain = exportCadDxf({
  primitives: [{ kind: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
}).content;
assert.ok(!plain.includes("OBJECTS"), "sin imágenes ni enmascaramientos no se escribe OBJECTS");
assert.ok(!plain.includes("$PDMODE"), "sin puntos no se escriben las variables de punto");

console.log(
  `dxf-schema4-export.spec.ts OK — ${CAD_SCHEMA_4_ENTITY_TYPES.length} tipos escritos, ${content.split("\n").length} pares`,
);
