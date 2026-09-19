import assert from "node:assert/strict";
import type { CadEntity } from "./cad-document";
import { cadWallToDxfPrimitives } from "./dxf-entity-primitives";

// --- T-11: el muro exportado no cruza la puerta ---

// Muro horizontal de 3000 × 200.
const wall: CadEntity = {
  id: "muro-1",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 3000, y: 0, z: 0 },
  thickness: 200,
  height: 2400,
  layer: "0",
} as CadEntity;

// Sin huecos: una polilínea cerrada.
const noOpenings = cadWallToDxfPrimitives(wall as Extract<CadEntity, { type: "wall" }>);
assert.equal(noOpenings.length, 1, "sin huecos: una sola primitiva");
assert.equal(noOpenings[0].kind, "polyline");
assert.equal((noOpenings[0] as { closed: boolean }).closed, true);

// Puerta de 900 mm centrada en x=1500.
const door: CadEntity = {
  id: "puerta-1",
  type: "opening",
  hostId: "muro-1",
  position: 1500,
  width: 900,
  sill: 0,
  height: 2400,
  layer: "0",
} as CadEntity;

const withDoor = cadWallToDxfPrimitives(
  wall as Extract<CadEntity, { type: "wall" }>,
  { entities: [wall, door] } as unknown as Pick<import("./cad-document").CadDocument, "entities">,
);

// Con un hueco, el muro se parte: los testeros (2) + segmentos de cara.
assert.ok(withDoor.length > 1, "con hueco: más de una primitiva");

// Ningún segmento de cara cruza la zona del hueco (x ∈ [1050, 1950]).
for (const prim of withDoor) {
  if (prim.kind === "polyline") {
    const pts = (prim as { points: { x: number; y: number }[] }).points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x;
      const bx = pts[i + 1].x;
      const minX = Math.min(ax, bx);
      const maxX = Math.max(ax, bx);
      // Un tramo horizontal que se solape significativamente con [1050, 1950]
      // cruza la puerta. Permitimos un margen de 1 mm.
      if (Math.abs(pts[i].y - pts[i + 1].y) < 1) {
        const overlap = Math.min(maxX, 1950) - Math.max(minX, 1050);
        assert.ok(
          overlap < 1,
          `segmento cruza la puerta: (${ax.toFixed(1)},${pts[i].y.toFixed(1)})-(${bx.toFixed(1)},${pts[i + 1].y.toFixed(1)}), solape=${overlap.toFixed(1)}`,
        );
      }
    }
  }
}

// Los testeros están en los extremos del muro.
const lines = withDoor.filter((p) => p.kind === "line");
assert.equal(lines.length, 2, "dos testeros (inicio y fin)");

console.log("dxf-wall-openings.spec.ts OK");
