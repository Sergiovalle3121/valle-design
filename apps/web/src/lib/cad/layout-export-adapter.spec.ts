import { strict as assert } from "node:assert";
import {
  cadLayoutToDxfExportModel,
  exportCadLayoutDxf,
} from "./layout-export-adapter";
import { importDxfPrimitives } from "./dxf-import";

const input = {
  boxes: [{ id: "aoi", label: "AOI", x: 10, y: 10, width: 4, height: 2 }],
  connectors: [{ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
  labels: [{ text: "Line 1", x: 1, y: 2 }],
  measurements: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 5 }, label: "5 mm" }],
};
const model = cadLayoutToDxfExportModel(input);
assert.equal(
  model.primitives?.length,
  2,
  "maps boxes and connectors to primitives",
);
assert.equal(model.texts?.[0].text, "Line 1", "maps labels");
assert.equal(
  model.layers?.find((layer) => layer.name === "Equipment")?.color,
  5,
  "maps equipment layer color",
);
// Rotación real en el DXF (VD-CAD-DXF-ROT-001): 4×2 en (10,10) girada 90°
// → esquinas (11,8),(11,12),(9,12),(9,8); sin rotación las esquinas quedan
// axis-aligned como siempre.
{
  const rotated = cadLayoutToDxfExportModel({
    boxes: [
      { id: "door", label: "Puerta", x: 10, y: 10, width: 4, height: 2, rotation: 90 },
    ],
  });
  const pts = rotated.primitives?.[0]?.points ?? [];
  const near = (p: { x: number; y: number }, x: number, y: number) =>
    Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;
  assert.ok(near(pts[0], 11, 8), "esquina 1 rotada");
  assert.ok(near(pts[1], 11, 12), "esquina 2 rotada");
  assert.ok(near(pts[2], 9, 12), "esquina 3 rotada");
  assert.ok(near(pts[3], 9, 8), "esquina 4 rotada");
  assert.ok(near(pts[4], 11, 8), "polilínea cerrada");
  const flat = cadLayoutToDxfExportModel(input);
  assert.ok(near((flat.primitives?.[0]?.points ?? [])[0], 8, 9), "sin rotación queda igual");
}

// Objeto redondo (VD-CAD-WIRE-001): un box con shape:"circle" sale como un
// CIRCLE real en el DXF (centro en x,y, radio = width/2), no como cuadrado, así
// que abre como círculo en AutoCAD.
{
  const round = cadLayoutToDxfExportModel({
    boxes: [
      { id: "col", label: "Columna", x: 20, y: 30, width: 12, height: 12, shape: "circle" },
    ],
  });
  const prim = round.primitives?.[0];
  assert.equal(prim?.kind, "circle", "shape:circle → primitiva circle");
  assert.equal(prim?.radius, 6, "radio = width/2");
  assert.ok(
    prim?.points?.[0]?.x === 20 && prim?.points?.[0]?.y === 30,
    "centro del círculo en (x,y)",
  );
  const dxf = exportCadLayoutDxf({
    boxes: [{ id: "col", label: "Columna", x: 20, y: 30, width: 12, height: 12, shape: "circle" }],
  });
  assert.ok(dxf.content.includes("0\nCIRCLE"), "el DXF contiene una entidad CIRCLE");
  assert.ok(dxf.content.includes("40\n6"), "el CIRCLE lleva su radio (código 40)");
}

// Round-trip del cable de círculo (CAD-NEXT-020): el asset redondo del editor
// se exporta por exportCadLayoutDxf (la MISMA función que llama el editor) y se
// reimporta como un círculo, con su centro y radio intactos. Antes salía cuadrado.
{
  const dxf = exportCadLayoutDxf({
    boxes: [{ id: "col", label: "Columna", x: 20, y: 30, width: 12, height: 12, shape: "circle" }],
  });
  const back = importDxfPrimitives(dxf.content);
  const circle = back.primitives.find((p) => p.kind === "circle");
  assert.ok(circle, "el círculo sobrevive el round-trip del editor como círculo");
  assert.equal(circle?.radius, 6, "el radio (width/2) se conserva");
  assert.ok(
    circle?.points?.[0]?.x === 20 && circle?.points?.[0]?.y === 30,
    "el centro del círculo se conserva",
  );
  assert.ok(
    !back.warnings.some((w) => w.code === "unsupported_entity"),
    "ninguna entidad queda como no soportada",
  );
}

const exported = exportCadLayoutDxf(input);
assert.ok(
  exported.content.includes("0\nPOLYLINE"),
  "exports boxes as polylines",
);
assert.ok(exported.content.includes("1\nAOI"), "exports box labels");
assert.ok(exported.content.includes("1\n5 mm"), "exports measurement label");
// La medición viaja como UNA entidad DIMENSION nativa con bloque *D (CAD-NEXT-066).
assert.ok(exported.content.includes("0\nDIMENSION"), "measurement is a native DIMENSION");
assert.equal(exported.entityCount, 5, "counts box labels as DXF entities");
console.log("cad layout export adapter specs passed");
