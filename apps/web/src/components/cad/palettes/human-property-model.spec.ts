import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import { buildCadHumanPropertyModel, cadHumanEntityLabels, cadRectangleSides } from "./human-property-model";

const point = (x: number, y: number) => ({ x, y, z: 0 });
const wall = (id: string, endX: number): Extract<CadNativeEntity, { type: "wall" }> => ({
  id, type: "wall", start: point(0, 0), end: point(endX, 0),
  thickness: 200, height: 2_400, layer: "0",
});
const rectangle: Extract<CadNativeEntity, { type: "polyline" }> = {
  id: "rect", type: "polyline", closed: true, layer: "0",
  vertices: [point(0, 0), point(3_000, 0), point(3_000, 2_000), point(0, 2_000)],
};
function doc(entities: CadEntity[], unit = "mm"): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit },
    layers: [{ id: "0", name: "Dibujo", color: "#ffffff", visible: true, locked: false }],
    entities, history: [], modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [], styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}
const fields = (entity: CadNativeEntity, document: CadDocument) =>
  Object.fromEntries(buildCadHumanPropertyModel([entity], document).fields.map((row) => [row.key, row.value]));

const first = wall("w1", 4_000);
assert.deepEqual(fields(first, doc([first])), {
  length: "4.00 m", thickness: "0.20 m", height: "2.40 m", layer: "Dibujo",
});
const orphanLayerWall = { ...first, layer: "layer-interna-8472" };
assert.equal(fields(orphanLayerWall, doc([orphanLayerWall])).layer, "Capa no disponible",
  "Esencial nunca muestra el identificador crudo de una capa ausente");
const door: Extract<CadNativeEntity, { type: "opening" }> = {
  id: "d1", type: "opening", kind: "door", hostId: "w1", position: 1_000,
  width: 900, height: 2_100, sill: 0, swing: "left", hinge: "start", layer: "0",
};
assert.equal(buildCadHumanPropertyModel([door], doc([first, door])).heading, "Puerta 1");
assert.deepEqual(fields(door, doc([first, door])), {
  width: "0.90 m", height: "2.10 m", host: "Muro 1",
});
assert.equal(fields(door, doc([door])).host, "Muro no disponible", "nunca mostrar un UUID de muro huérfano");

assert.deepEqual(cadRectangleSides(rectangle), { width: 3_000, height: 2_000 });
assert.equal(buildCadHumanPropertyModel([rectangle], doc([rectangle])).heading, "Rectángulo 1");
assert.deepEqual(fields(rectangle, doc([rectangle])), {
  width: "3.00 m", height: "2.00 m", area: "6.00 m²", perimeter: "10.00 m",
  layer: "Dibujo", color: "De la capa",
});
const bulged = { ...rectangle, id: "arc-poly", vertices: rectangle.vertices.map((vertex, index) => ({ ...vertex, bulge: index === 0 ? 0.5 : 0 })) };
assert.equal(cadRectangleSides(bulged), null, "un arco no se anuncia como rectángulo");
assert.equal(buildCadHumanPropertyModel([bulged], doc([bulged])).heading, "Polilínea 1");
assert.deepEqual([...cadHumanEntityLabels([rectangle, bulged, { ...rectangle, id: "rect2" }]).values()],
  ["Rectángulo 1", "Polilínea 1", "Rectángulo 2"]);
const open = { ...rectangle, id: "open-poly", closed: false };
assert.equal(fields(open, doc([open])).area, undefined, "no anunciar área cerrando una figura abierta");
const twisted = { ...rectangle, id: "twisted", vertices: rectangle.vertices.map((vertex, index) => ({ ...vertex, z: index === 2 ? 100 : 0 })) };
assert.equal(fields(twisted, doc([twisted])).area, undefined, "no anunciar área de la proyección XY de un contorno torcido en Z");

const second = wall("w2", 5_000);
const multiple = buildCadHumanPropertyModel([first, second], doc([first, second]));
assert.equal(multiple.heading, "2 muros seleccionados");
assert.deepEqual(multiple.fields.map((row) => row.key), ["thickness", "height", "layer"]);
assert.ok(!JSON.stringify(multiple).includes("*VARIES*"));
const almostSame = wall("w3", 4_000.4);
assert.ok(!buildCadHumanPropertyModel([first, almostSame], doc([first, almostSame])).fields.some((row) => row.key === "length"),
  "dos largos que redondean a 4.00 m no son un campo común");
assert.equal(fields(first, doc([first], "unidades-propias")).length, "4,000.00 u", "unidad desconocida no se convierte a metros");

const line: Extract<CadNativeEntity, { type: "line" }> = {
  id: "line", type: "line", start: point(0, 0), end: point(0, 2_000), layer: "0",
};
assert.deepEqual(fields(line, doc([line])), { length: "2.00 m", angle: "90.00°", layer: "Dibujo" });
const circle: Extract<CadNativeEntity, { type: "circle" }> = {
  id: "circle", type: "circle", center: point(0, 0), radius: 1_000, layer: "0",
};
assert.deepEqual(fields(circle, doc([circle])), {
  radius: "1.00 m", diameter: "2.00 m", area: "3.14 m²", layer: "Dibujo",
});
console.log("Propiedades humanas: muro, puerta, rectángulo, polilínea, selección múltiple y unidades PASS");
