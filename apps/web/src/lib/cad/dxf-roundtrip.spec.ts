/**
 * Round-trip DXF de geometría curva real (AXOS-CAD-DEPTH-A1).
 *
 * Antes, un círculo se exportaba como cuadrado y un arco no existía: exportar e
 * importar destruía la geometría. Este spec exporta un modelo con círculo y
 * arco, lo vuelve a parsear con el pipeline real (dxf-parser incluido) y exige
 * que la primitiva regrese idéntica dentro de tolerancia de punto flotante.
 */
import { strict as assert } from "node:assert";
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

// Ninguna advertencia de entidad no soportada: círculo y arco ya no se pierden.
assert.ok(
  !imported.warnings.some((w) => w.code === "unsupported_entity"),
  "círculo y arco ya no generan advertencia de entidad no soportada",
);

console.log("cad dxf round-trip specs passed");
