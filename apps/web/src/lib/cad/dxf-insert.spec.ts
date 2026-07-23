/** Expansión de bloques INSERT en el import DXF (CAD-NEXT-063/064). */
import { strict as assert } from "node:assert";
import { importDxfPrimitives } from "./dxf-import";
import { exportCadDxf } from "./dxf-export";

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const pointNear = (p: { x: number; y: number }, x: number, y: number, tol = 1e-6) =>
  near(p.x, x, tol) && near(p.y, y, tol);

// DXF a mano: bloque DOOR (línea (0,0)-(10,0) + círculo c=(5,0) r=2), un INSERT
// en (100,50) rotado 90° con escala 2, y un INSERT de un bloque inexistente.
const lines = [
  "0", "SECTION", "2", "BLOCKS",
  "0", "BLOCK", "8", "0", "2", "DOOR", "70", "0", "10", "0", "20", "0", "30", "0",
  "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "10", "21", "0", "31", "0",
  "0", "CIRCLE", "8", "0", "10", "5", "20", "0", "30", "0", "40", "2",
  "0", "ENDBLK",
  "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "INSERT", "8", "0", "2", "DOOR", "10", "100", "20", "50", "30", "0", "50", "90", "41", "2", "42", "2",
  "0", "INSERT", "8", "0", "2", "GHOST", "10", "0", "20", "0", "30", "0",
  "0", "ENDSEC",
  "0", "EOF",
];
const result = importDxfPrimitives(`${lines.join("\n")}\n`);

// --- el INSERT se expande a la geometría del bloque, transformada ------------
const line = result.primitives.find((p) => p.kind === "line");
assert.ok(line, "la línea del bloque aparece expandida");
// (0,0)→(100,50); (10,0) escalada a (20,0), rotada 90° → (0,20), trasladada → (100,70).
assert.ok(pointNear(line!.points[0], 100, 50), `inicio transformado (got ${line!.points[0].x},${line!.points[0].y})`);
assert.ok(pointNear(line!.points[1], 100, 70), `fin transformado (got ${line!.points[1].x},${line!.points[1].y})`);

const circle = result.primitives.find((p) => p.kind === "circle");
assert.ok(circle, "el círculo del bloque aparece expandido");
// centro (5,0) escalado (10,0), rotado 90° → (0,10), trasladado → (100,60); r 2×2=4.
assert.ok(pointNear(circle!.points[0], 100, 60), `centro transformado (got ${circle!.points[0].x},${circle!.points[0].y})`);
assert.ok(near(circle!.radius ?? 0, 4), "el radio escala con el bloque");

// --- honestidad --------------------------------------------------------------
assert.ok(
  result.warnings.some((w) => w.code === "unknown_block"),
  "un INSERT de bloque inexistente avisa unknown_block",
);
assert.ok(
  !result.warnings.some((w) => w.code === "unsupported_entity"),
  "INSERT ya no cae como entidad no soportada",
);

// --- round-trip completo de bloques (CAD-NEXT-064): nuestro export escribe la
// sección BLOCKS + INSERT y nuestro import los expande. Un bloque 'COL' con un
// círculo r=3 insertado dos veces: identidad y rotado 90° con escala 2.
{
  const exported = exportCadDxf({
    blocks: [
      {
        name: "COL",
        primitives: [
          { kind: "circle", layer: "STRUCT", points: [{ x: 5, y: 0 }], radius: 3 },
        ],
      },
    ],
    inserts: [
      { block: "COL", x: 10, y: 10 },
      { block: "COL", x: 50, y: 50, rotation: 90, scaleX: 2, scaleY: 2 },
    ],
  });
  assert.ok(exported.content.includes("0\nBLOCK"), "el DXF contiene la sección BLOCKS");
  assert.ok(exported.content.includes("0\nINSERT"), "y las referencias INSERT");
  assert.equal(exported.entityCount, 2, "cada INSERT cuenta como una entidad");
  assert.ok(exported.layers.includes("STRUCT"), "la capa del bloque entra en la tabla LAYER");

  const back = importDxfPrimitives(exported.content);
  const circles = back.primitives.filter((p) => p.kind === "circle");
  assert.equal(circles.length, 2, "los dos INSERT expanden el círculo del bloque");
  // Identidad: centro (5,0) + (10,10) = (15,10), r=3.
  assert.ok(circles.some((c) => pointNear(c.points[0], 15, 10) && near(c.radius ?? 0, 3)), "insert identidad en su lugar");
  // Rotado 90° escala 2: (5,0)→(10,0)→rot 90→(0,10)→+(50,50)=(50,60), r=6.
  assert.ok(circles.some((c) => pointNear(c.points[0], 50, 60) && near(c.radius ?? 0, 6)), "insert transformado en su lugar");
  assert.ok(
    !back.warnings.some((w) => w.code === "unknown_block"),
    "el bloque exportado se resuelve al reimportar",
  );
}

console.log("cad dxf-insert specs passed");
