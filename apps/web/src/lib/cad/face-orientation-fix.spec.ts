/**
 * Orientación de caras de los tres constructores de geometría nativa (T12).
 *
 * La permutación (x,y,z)→(x,z,y) es una reflexión (determinante −1) que
 * invierte el giro de cada triángulo. La corrección: invertir el orden de
 * cada triángulo al copiar los índices.
 *
 * Este spec comprueba que la corrección restaura la concordancia entre el
 * producto cruz y la normal declarada.
 */
import { clearSolidCache, solid3dMesh } from "./solid3d-build";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import { check, report } from "../brep/spec-support";

function extrudedBox(id: string, w: number, d: number, h: number): CadSolid3dEntity {
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
    layer: "0",
  };
}

function crossDotNormal(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  indices: ArrayLike<number>,
): { concordant: number; discordant: number } {
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];
    // cross(b-a, c-a)
    const crx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const cry = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const crz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nx = normals[ia * 3], ny = normals[ia * 3 + 1], nz = normals[ia * 3 + 2];
    const dot = crx * nx + cry * ny + crz * nz;
    if (dot > 0) concordant += 1;
    else discordant += 1;
  }
  return { concordant, discordant };
}

{
  clearSolidCache();
  const entity = extrudedBox("test", 1000, 600, 500);
  const mesh = solid3dMesh(entity);
  const total = mesh.indices.length / 3;

  // 1. B-rep original: debe ser todo concordante
  const original = crossDotNormal(mesh.positions, mesh.normals, mesh.indices);
  check("B-rep original: cero discordantes", original.discordant === 0,
    `concordantes=${original.concordant}, discordantes=${original.discordant} de ${total}`);

  // 2. Permutación (x,y,z)→(x,z,y) SIN corrección: todo discordante
  const permPos = new Float32Array(mesh.positions.length);
  const permNorm = new Float32Array(mesh.normals.length);
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    permPos[i * 3] = mesh.positions[i * 3];
    permPos[i * 3 + 1] = mesh.positions[i * 3 + 2];
    permPos[i * 3 + 2] = mesh.positions[i * 3 + 1];
    permNorm[i * 3] = mesh.normals[i * 3];
    permNorm[i * 3 + 1] = mesh.normals[i * 3 + 2];
    permNorm[i * 3 + 2] = mesh.normals[i * 3 + 1];
  }
  const permuted = crossDotNormal(permPos, permNorm, mesh.indices);
  check("Permutada sin corrección: todo discordante", permuted.discordant === total,
    `concordantes=${permuted.concordant}, discordantes=${permuted.discordant} de ${total}`);

  // 3. Permutación CON corrección de índices: todo concordante
  const corrected = [...mesh.indices];
  for (let i = 0; i < corrected.length; i += 3) {
    const tmp = corrected[i];
    corrected[i] = corrected[i + 2];
    corrected[i + 2] = tmp;
  }
  const fixed = crossDotNormal(permPos, permNorm, corrected);
  check("Permutada con corrección: cero discordantes", fixed.discordant === 0,
    `concordantes=${fixed.concordant}, discordantes=${fixed.discordant} de ${total}`);
}

report("face-orientation-fix");
