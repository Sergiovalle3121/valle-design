import assert from "node:assert/strict";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";
import {
  cadDocumentNativeDxfPrimitives,
  cadDxfPrimitivesToCanonicalEntities,
} from "./dxf-cad-document";
import { importDocumentText } from "./document-import";
import type { CadDocument, CadEntity } from "./cad-document";

/**
 * Ida y vuelta de los ocho tipos del esquema 4, con ANCLAS ABSOLUTAS.
 *
 * Una prueba de ida y vuelta se cumple DE FORMA VACÍA si el código nunca toca
 * el campo: aplicar la identidad dos veces también devuelve el original. Por eso
 * aquí no se compara "lo que salió" con "lo que entró" y ya está — se afirman
 * COORDENADAS CONCRETAS: que el punto base del XLINE es (10, 20), que el tercer
 * vértice del SOLID es (100, 80), que el brillo de la imagen es 60. Un
 * exportador que no escribiera nada y un importador que devolviera el objeto de
 * entrada fallarían aquí, y con la comparación simétrica no fallarían.
 *
 * Los ángulos se comparan MÓDULO 360: el importador devuelve (−180, 180] vía
 * `projectedAngle` y el runtime normaliza a [0, 360), así que un 270 vuelve
 * como −90 sin que nada esté mal.
 */

const p = (x: number, y: number, z = 0) => ({ x, y, z });

function sameAngle(actual: number, expected: number, message: string) {
  const delta = (((actual - expected) % 360) + 540) % 360 - 180;
  assert.ok(
    Math.abs(delta) < 1e-6,
    `${message} (esperado ${expected}°, recibido ${actual}°, diferencia ${delta}°)`,
  );
}

const IMAGE_DEFINITION = {
  id: "img-plano",
  name: "base",
  uri: "asset://tenant/planos/base.png",
  pixelWidth: 1_024,
  pixelHeight: 768,
};

const entities: CadEntity[] = [
  { id: "e-point", type: "point", position: p(120, 240), style: 34, size: 15, layer: "REF" },
  { id: "e-xline", type: "xline", basePoint: p(10, 20), direction: p(3, 4), layer: "REF" },
  { id: "e-ray", type: "ray", basePoint: p(-50, 75), direction: p(0, -2), layer: "REF" },
  {
    id: "e-solid",
    type: "solid",
    points: [p(0, 0), p(100, 0), p(100, 80), p(0, 80)],
    layer: "RELLENO",
  },
  {
    id: "e-solid-tri",
    type: "solid",
    points: [p(500, 500), p(700, 500), p(600, 640)],
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
    rotation: 270,
    alignment: "middle-center",
    invisible: true,
    verify: true,
    preset: true,
    layer: "ATRIB",
  },
] as unknown as CadEntity[];

const document = {
  entities,
  layers: [],
  modelSpace: { entityIds: entities.map((entity) => entity.id) },
  unsupportedEntities: [],
  imageDefinitions: [IMAGE_DEFINITION],
} as unknown as CadDocument;

const dxf = exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(document) }).content;
const imported = importDxfPrimitives(dxf);
const back = cadDxfPrimitivesToCanonicalEntities(imported.primitives, {
  idPrefix: "rt",
  provider: "native-dxf",
});

function only<T extends CadEntity["type"]>(
  type: T,
  index = 0,
): Extract<CadEntity, { type: T }> {
  const found = back.filter((entity) => entity.type === type);
  assert.ok(found[index], `no volvió ninguna entidad ${type} en la posición ${index}`);
  return found[index] as Extract<CadEntity, { type: T }>;
}

// --- Los ocho tipos vuelven como tipos, no como geometría suelta ----------

assert.deepEqual(
  [...new Set(back.map((entity) => entity.type))].sort(),
  ["attdef", "image", "point", "ray", "solid", "wipeout", "xline"],
  "cada tipo exportado tiene que volver a entrar COMO ESE TIPO",
);

// --- POINT: posición y estilo global -------------------------------------

const point = only("point");
assert.equal(point.position.x, 120);
assert.equal(point.position.y, 240);
assert.equal(point.style, 34, "el estilo vuelve desde $PDMODE");
assert.equal(point.size, 15, "y el tamaño desde $PDSIZE");
assert.equal(point.layer, "REF");

// --- XLINE y RAY: punto base y DIRECCIÓN ---------------------------------

const xline = only("xline");
assert.equal(xline.basePoint.x, 10);
assert.equal(xline.basePoint.y, 20);
assert.equal(xline.direction.x, 3, "la dirección es un VECTOR: no se le suma la traslación");
assert.equal(xline.direction.y, 4);

const ray = only("ray");
assert.equal(ray.basePoint.x, -50);
assert.equal(ray.basePoint.y, 75);
assert.equal(ray.direction.x, 0);
assert.equal(ray.direction.y, -2);

// --- SOLID: el corbatín deshecho, en orden de CONTORNO --------------------

const solid = only("solid");
assert.deepEqual(
  solid.points.map((point) => [point.x, point.y]),
  [
    [0, 0],
    [100, 0],
    [100, 80],
    [0, 80],
  ],
  "el SOLID vuelve en orden de contorno; si el corbatín no se deshiciera, el " +
    "tercer vértice sería (0, 80) y el cuarto (100, 80)",
);

const triangle = only("solid", 1);
assert.equal(triangle.points.length, 3, "un SOLID triangular vuelve con TRES vértices");
assert.deepEqual(
  triangle.points.map((point) => [point.x, point.y]),
  [
    [500, 500],
    [700, 500],
    [600, 640],
  ],
);

// --- WIPEOUT: contorno denormalizado a coordenadas de dibujo -------------

const wipeout = only("wipeout");
assert.equal(wipeout.boundary.length, 4, "el vértice de cierre repetido se funde");
assert.deepEqual(
  wipeout.boundary.map((point) => [point.x, point.y]),
  [
    [200, 200],
    [400, 200],
    [400, 300],
    [200, 300],
  ],
  "el contorno vuelve desde coordenadas normalizadas (−0,5..+0,5) a las del dibujo",
);
assert.equal(wipeout.frame, true, "el marco vuelve desde ACAD_WIPEOUT_VARS");

// --- IMAGE: enlace con su definición y encuadre --------------------------

const image = only("image");
assert.equal(image.insertion.x, 1_000);
assert.equal(image.insertion.y, 500);
assert.equal(image.uVector.x, 2, "el vector U mide UN píxel en unidades de dibujo");
assert.equal(image.vVector.y, 2);
assert.equal(image.size.width, 1_024);
assert.equal(image.size.height, 768);
assert.equal(image.brightness, 60);
assert.equal(image.contrast, 40);
assert.equal(image.fade, 10);
assert.equal(
  image.definition,
  "img-plano",
  "el enlace IMAGE → IMAGEDEF → clave del diccionario devuelve la MISMA definición",
);
assert.deepEqual(
  imported.imageDefinitions,
  [
    {
      id: "img-plano",
      name: "base.png",
      uri: "asset://tenant/planos/base.png",
      pixelWidth: 1_024,
      pixelHeight: 768,
    },
  ],
  "la definición vuelve con su ruta y su tamaño en píxeles; el nombre se reconstruye del archivo",
);

// --- ATTDEF: etiqueta, banderas, alineación y ángulo ---------------------

const attdef = only("attdef");
assert.equal(attdef.tag, "MARCA");
assert.equal(attdef.prompt, "Marca del equipo");
assert.equal(attdef.defaultValue, "P-101");
assert.equal(attdef.insertion.x, 15, "con alineación centrada la posición real es el grupo 11");
assert.equal(attdef.insertion.y, 25);
assert.equal(attdef.height, 120);
assert.equal(attdef.alignment, "middle-center");
assert.equal(attdef.invisible, true);
assert.equal(attdef.verify, true);
assert.equal(attdef.preset, true);
assert.equal(attdef.constant, false);
sameAngle(attdef.rotation ?? 0, 270, "la rotación del ATTDEF vuelve módulo 360");

// --- El fichero completo entra por la vía de importación del producto ----
//
// `importDocumentText` es lo que usa la aplicación: si el catálogo de imágenes
// no llegara al documento, cada IMAGE apuntaría a una definición inexistente y
// el dibujo nacería roto en el mismo acto de importarlo.

const report = importDocumentText("prueba.dxf", dxf);
assert.equal(
  report.document.imageDefinitions?.length,
  1,
  "el documento importado tiene que traer su catálogo de imágenes",
);
assert.equal(report.document.imageDefinitions?.[0].id, "img-plano");
assert.ok(
  report.document.entities.some(
    (entity) => entity.type === "image" && entity.definition === "img-plano",
  ),
  "y la entidad IMAGE tiene que apuntar a una definición que EXISTE",
);
assert.equal(
  report.warnings.filter((warning) => warning.code === "unsupported_entity").length,
  0,
  "ningún tipo del esquema 4 puede llegar como 'no soportado': los lee el parser crudo",
);

// --- Segunda vuelta: la ida y vuelta es ESTABLE, no sólo posible ---------

const secondPass = cadDxfPrimitivesToCanonicalEntities(
  importDxfPrimitives(
    exportCadDxf({
      primitives: cadDocumentNativeDxfPrimitives({
        ...document,
        entities: back,
        imageDefinitions: imported.imageDefinitions,
      } as unknown as CadDocument),
    }).content,
  ).primitives,
  { idPrefix: "rt2", provider: "native-dxf" },
);
assert.deepEqual(
  secondPass.map((entity) => ({ ...entity, id: "", context: undefined })),
  back.map((entity) => ({ ...entity, id: "", context: undefined })),
  "la segunda ida y vuelta tiene que ser un punto fijo: si no lo es, cada exportación degrada un poco más",
);

console.log(
  `dxf-schema4-roundtrip.spec.ts OK — ${back.length} entidades de vuelta, ${imported.imageDefinitions.length} definición(es) de imagen`,
);
