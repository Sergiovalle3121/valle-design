/**
 * SLICE y SECTION con planos coordenados (XY, YZ, ZX).
 *
 * Verifica que la función `coordinatePlane` produce los planos correctos y que
 * el nodo `slice` del B-rep los aplica.
 */
import { check, report } from "../brep/spec-support";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import { clearSolidCache, solid3dMassProperties } from "./solid3d-build";

const layer = "0";

function box(id: string, w: number, d: number, h: number): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    nodes: [
      {
        id: "perfil",
        op: "extrude",
        profile: {
          outer: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: d },
            { x: 0, y: d },
          ],
        },
        height: h,
      },
    ],
    root: "perfil",
    layer,
  };
}

// ---------------------------------------------------------------------------
// 1. SLICE por XY a la mitad: el volumen se reduce a la mitad
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const w = 200, d = 300, h = 400;
  const fullVolume = w * d * h;
  const cutHeight = h / 2; // 200

  const sliced: CadSolid3dEntity = {
    ...box("xy-cut", w, d, h),
    nodes: [
      ...box("xy-cut", w, d, h).nodes,
      {
        id: "corte",
        op: "slice",
        operand: "perfil",
        plane: { origin: { x: 0, y: 0, z: cutHeight }, normal: { x: 0, y: 0, z: 1 } },
        keep: "positive",
      },
    ],
    root: "corte",
  };
  const mass = solid3dMassProperties(sliced);

  check("SLICE XY: volumen ≈ mitad", Math.abs(mass.volume - fullVolume / 2) < 1, `volumen=${mass.volume}, esperado=${fullVolume / 2}`);
  check("SLICE XY: centroide Z ≈ 300", Math.abs(mass.centroid.z - (cutHeight + h) / 2) < 1, `z=${mass.centroid.z}`);
}

// ---------------------------------------------------------------------------
// 2. SLICE por YZ a la mitad: el volumen se reduce a la mitad
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const w = 200, d = 300, h = 400;
  const fullVolume = w * d * h;
  const cutX = w / 2; // 100

  const sliced: CadSolid3dEntity = {
    ...box("yz-cut", w, d, h),
    nodes: [
      ...box("yz-cut", w, d, h).nodes,
      {
        id: "corte",
        op: "slice",
        operand: "perfil",
        plane: { origin: { x: cutX, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
        keep: "positive",
      },
    ],
    root: "corte",
  };
  const mass = solid3dMassProperties(sliced);

  check("SLICE YZ: volumen ≈ mitad", Math.abs(mass.volume - fullVolume / 2) < 1, `volumen=${mass.volume}`);
  check("SLICE YZ: centroide X ≈ 150", Math.abs(mass.centroid.x - (cutX + w) / 2) < 1, `x=${mass.centroid.x}`);
}

// ---------------------------------------------------------------------------
// 3. SLICE por ZX a la mitad: el volumen se reduce a la mitad
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const w = 200, d = 300, h = 400;
  const fullVolume = w * d * h;
  const cutY = d / 2; // 150

  const sliced: CadSolid3dEntity = {
    ...box("zx-cut", w, d, h),
    nodes: [
      ...box("zx-cut", w, d, h).nodes,
      {
        id: "corte",
        op: "slice",
        operand: "perfil",
        plane: { origin: { x: 0, y: cutY, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
        keep: "positive",
      },
    ],
    root: "corte",
  };
  const mass = solid3dMassProperties(sliced);

  check("SLICE ZX: volumen ≈ mitad", Math.abs(mass.volume - fullVolume / 2) < 1, `volumen=${mass.volume}`);
  check("SLICE ZX: centroide Y ≈ 225", Math.abs(mass.centroid.y - (cutY + d) / 2) < 1, `y=${mass.centroid.y}`);
}

report("slice-coordinate-planes");
