/**
 * Round-trip DXF de geometría curva real (VD-CAD-DEPTH-A1).
 *
 * Antes, un círculo se exportaba como cuadrado y un arco no existía: exportar e
 * importar destruía la geometría. Este spec exporta un modelo con círculo y
 * arco, lo vuelve a parsear con el pipeline real (dxf-parser incluido) y exige
 * que la primitiva regrese idéntica dentro de tolerancia de punto flotante.
 */
import { strict as assert } from "node:assert";
import { importDocumentText } from "./document-import";
import { exportCadDocumentDxf } from "./dxf-document-export";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";

function near(actual: number, expected: number, tol = 1e-4): boolean {
  return Math.abs(actual - expected) <= tol;
}

const source = exportCadDxf({
  primitives: [
    {
      kind: "circle",
      layer: "HOLES",
      points: [{ x: 100, y: 50 }],
      radius: 12.5,
    },
    {
      kind: "arc",
      layer: "FILLETS",
      points: [{ x: 0, y: 0 }],
      radius: 20,
      startAngle: 30,
      endAngle: 120,
    },
    {
      kind: "line",
      layer: "WALLS",
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
    },
    {
      kind: "ellipse",
      layer: "TANKS",
      points: [{ x: 40, y: 30 }],
      majorAxis: { x: 25, y: 0 },
      axisRatio: 0.5,
      startAngle: 0,
      endAngle: 360,
    },
    {
      kind: "spline",
      layer: "CURVES",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 40, y: 0 },
      ],
      degree: 3,
      knots: [0, 0, 0, 0, 1, 1, 1, 1],
    },
  ],
});

const imported = importDxfPrimitives(source.content);

const circle = imported.primitives.find((p) => p.kind === "circle");
assert.ok(circle, "el círculo sobrevive el round-trip como círculo");
assert.ok(
  circle && near(circle.points[0].x, 100) && near(circle.points[0].y, 50),
  "el centro del círculo se conserva",
);
assert.ok(circle && near(circle.radius ?? 0, 12.5), "el radio del círculo se conserva");

const arc = imported.primitives.find((p) => p.kind === "arc");
assert.ok(arc, "el arco sobrevive el round-trip como arco");
assert.ok(
  arc && near(arc.points[0].x, 0) && near(arc.points[0].y, 0),
  "el centro del arco se conserva",
);
assert.ok(arc && near(arc.radius ?? 0, 20), "el radio del arco se conserva");
assert.ok(
  arc && near(arc.startAngle ?? -1, 30) && near(arc.endAngle ?? -1, 120),
  "los ángulos del arco se conservan en grados",
);

const line = imported.primitives.find((p) => p.kind === "line");
assert.ok(line, "la línea sigue presente tras el round-trip");

// ELLIPSE nativa (CAD-NEXT-061): centro, eje mayor y razón sobreviven.
const ellipse = imported.primitives.find((p) => p.kind === "ellipse");
assert.ok(ellipse, "la elipse sobrevive el round-trip como elipse");
assert.ok(
  ellipse && near(ellipse.points[0].x, 40) && near(ellipse.points[0].y, 30),
  "el centro de la elipse se conserva",
);
assert.ok(
  ellipse && near(ellipse.majorAxis?.x ?? -1, 25) && near(ellipse.majorAxis?.y ?? -1, 0),
  "el eje mayor (relativo al centro) se conserva",
);
assert.ok(ellipse && near(ellipse.axisRatio ?? -1, 0.5), "la razón de ejes se conserva");
assert.ok(
  ellipse && near(ellipse.startAngle ?? -1, 0) && near(ellipse.endAngle ?? -1, 360),
  "los parámetros vuelven en grados (elipse completa 0..360)",
);

// SPLINE nativa (CAD-NEXT-061): puntos de control, grado y nudos sobreviven.
const spline = imported.primitives.find((p) => p.kind === "spline");
assert.ok(spline, "la spline sobrevive el round-trip como spline");
assert.equal(spline?.points.length, 4, "los 4 puntos de control se conservan");
assert.ok(
  spline && near(spline.points[1].x, 10) && near(spline.points[1].y, 20),
  "las coordenadas de control se conservan",
);
assert.equal(spline?.degree, 3, "el grado se conserva");
assert.equal(spline?.knots?.length, 8, "el vector de nudos se conserva (n+grado+1)");

// Ninguna advertencia de entidad no soportada: las curvas ya no se pierden.
assert.ok(
  !imported.warnings.some((w) => w.code === "unsupported_entity"),
  "círculo, arco, elipse y spline ya no generan advertencia de entidad no soportada",
);

// --- código 70, bit 1: la capa CONGELADA sobrevive la ida y la vuelta ---------
//
// El importador leía el bit desde siempre y lo descartaba al construir la capa;
// el exportador escribía `70 0` fijo. Las dos mitades se prueban juntas por el
// camino REAL del producto: documento canónico → DXFOUT → DXFIN → documento.
{
  const exported = exportCadDocumentDxf({
    entities: [
      { id: "muro", type: "line", layer: "MUROS", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
      { id: "tubo", type: "line", layer: "MEP", start: { x: 0, y: 50, z: 0 }, end: { x: 100, y: 50, z: 0 } },
    ],
    blocks: [],
    layers: [
      { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
      { id: "MEP", name: "MEP", color: "#00ff00", visible: true, locked: false, frozen: true },
    ],
  });

  // El fichero declara el bit: el registro LAYER de MEP lleva `70` = 1.
  const lines = exported.content.split(/\r?\n/);
  const mepAt = lines.findIndex((line, index) => line.trim() === "MEP" && lines[index - 1]?.trim() === "2");
  assert.ok(mepAt > 0, "la tabla LAYER declara la capa MEP");
  assert.equal(lines[mepAt + 1]?.trim(), "70", "tras el nombre viene el código 70");
  assert.equal(lines[mepAt + 2]?.trim(), "1", "y vale 1: bit de congelada");

  const report = importDocumentText("plano.dxf", exported.content);
  const mep = report.document.layers.find((layer) => layer.name === "MEP");
  const muros = report.document.layers.find((layer) => layer.name === "MUROS");
  assert.equal(mep?.frozen, true, "la capa congelada VUELVE congelada");
  assert.ok(muros && !("frozen" in muros), "la no congelada vuelve sin la clave: opcional-ausente");
}

console.log("cad dxf round-trip specs passed");
