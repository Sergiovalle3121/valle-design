/**
 * Orientación de caras de los tres constructores de geometría nativa (T12).
 *
 * La permutación (x,y,z)→(x,z,y) es una reflexión (determinante −1) que
 * invierte el giro de cada triángulo. La corrección: invertir el orden de
 * cada triángulo al copiar los índices.
 *
 * Este spec comprueba que los tres constructores reales — `buildCadSolidGeometry`,
 * `buildCadWallSolidGeometry` y `buildCadArchitecturalSlabGeometry` — producen
 * geometría THREE con orientación de caras correcta: cross(b−a, c−a)·n(a) > 0
 * en TODOS los triángulos.
 */
import * as THREE from "three";
import { check, report } from "../brep/spec-support";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import type { CadThreeViewport } from "./entity-three";
import { buildCadSolidGeometry } from "./solid3d-three";
import { buildCadWallSolidGeometry } from "./wall-solid-three";
import { buildCadArchitecturalSlabGeometry } from "./room-solid-three";

const viewport: CadThreeViewport = {
  scale: 0.01,
  width: 10_000,
  height: 10_000,
};

/**
 * Cuenta triángulos concordantes y discordantes en una BufferGeometry de THREE.
 *
 * Concordante = cross(b−a, c−a)·normal(a) > 0.
 */
function crossDotNormal(
  geometry: THREE.BufferGeometry,
): { concordant: number; discordant: number; total: number } {
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normAttr = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const idx = geometry.getIndex();
  if (!idx) return { concordant: 0, discordant: 0, total: 0 };
  const indices = idx.array;
  const positions = posAttr.array;
  const normals = normAttr.array;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] as number;
    const ib = indices[i + 1] as number;
    const ic = indices[i + 2] as number;
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];
    // cross(b−a, c−a)
    const crx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const cry = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const crz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nx = normals[ia * 3], ny = normals[ia * 3 + 1], nz = normals[ia * 3 + 2];
    const dot = crx * nx + cry * ny + crz * nz;
    if (dot > 0) concordant += 1;
    else discordant += 1;
  }
  return { concordant, discordant, total: indices.length / 3 };
}

// ---------------------------------------------------------------------------
// 1. buildCadSolidGeometry: prisma extruido
// ---------------------------------------------------------------------------
{
  const entity: CadSolid3dEntity = {
    id: "caja",
    type: "solid3d",
    nodes: [
      {
        id: "perfil",
        op: "extrude",
        profile: {
          outer: [
            { x: 0, y: 0 },
            { x: 1_000, y: 0 },
            { x: 1_000, y: 600 },
            { x: 0, y: 600 },
          ],
        },
        height: 500,
      },
    ],
    root: "perfil",
    layer: "0",
  };
  const geometry = buildCadSolidGeometry(entity, viewport);
  const result = crossDotNormal(geometry);
  check(
    "buildCadSolidGeometry: cero discordantes",
    result.discordant === 0,
    `concordantes=${result.concordant}, discordantes=${result.discordant} de ${result.total}`,
  );
  check("buildCadSolidGeometry: al menos un triángulo", result.total > 0);
  geometry.dispose();
}

// ---------------------------------------------------------------------------
// 2. buildCadWallSolidGeometry: muro en diagonal con vano
// ---------------------------------------------------------------------------
{
  const wall = {
    start: { x: 1_000, y: 1_000, z: 0 },
    end: { x: 4_000, y: 5_000, z: 0 },
    thickness: 200,
    height: 2_700,
  };
  const door = { position: 2_000, width: 900, sill: 0, height: 2_100 };
  const geometry = buildCadWallSolidGeometry(wall, [door], viewport);
  check("buildCadWallSolidGeometry: geometría no nula", geometry !== null);
  if (geometry) {
    const result = crossDotNormal(geometry);
    check(
      "buildCadWallSolidGeometry: cero discordantes",
      result.discordant === 0,
      `concordantes=${result.concordant}, discordantes=${result.discordant} de ${result.total}`,
    );
    check("buildCadWallSolidGeometry: al menos un triángulo", result.total > 0);
    geometry.dispose();
  }
}

// ---------------------------------------------------------------------------
// 3. buildCadArchitecturalSlabGeometry: losa rectangular
// ---------------------------------------------------------------------------
{
  const ring = [
    { x: 1_000, y: 2_000 },
    { x: 6_000, y: 2_000 },
    { x: 6_000, y: 5_000 },
    { x: 1_000, y: 5_000 },
  ];
  const geometry = buildCadArchitecturalSlabGeometry(ring, 2_400, 2_700, viewport);
  check("buildCadArchitecturalSlabGeometry: geometría no nula", geometry !== null);
  if (geometry) {
    const result = crossDotNormal(geometry);
    check(
      "buildCadArchitecturalSlabGeometry: cero discordantes",
      result.discordant === 0,
      `concordantes=${result.concordant}, discordantes=${result.discordant} de ${result.total}`,
    );
    check("buildCadArchitecturalSlabGeometry: al menos un triángulo", result.total > 0);
    geometry.dispose();
  }
}

report("face-orientation-fix");
