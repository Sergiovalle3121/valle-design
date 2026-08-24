/**
 * El volumen 3D del muro: geometría analítica, no "se ve bien".
 *
 * Cuatro promesas verificadas con números, no con una captura:
 *
 *  1. Un muro sin vanos tiene el volumen EXACTO de una caja (contraste
 *     independiente contra `bodyMassProperties`, que tesela e integra).
 *  2. Un vano válido resta EXACTAMENTE su propio volumen — ni más (el
 *     sobre-corte del recortador no debe filtrar fuera del muro) ni menos.
 *  3. Un rayo lanzado a través del centro del vano NO choca con ningún
 *     triángulo del muro; un rayo por una zona de muro macizo SÍ choca. Es la
 *     comprobación exacta que pide el criterio de aceptación: ausencia de
 *     pared en un rayo que atraviesa el hueco.
 *  4. Un vano que no encaja (horizontal o verticalmente) no corta nada — el
 *     volumen no cambia — y no tumba el cuerpo del muro.
 */
import { check, checkClose, report } from "../brep/spec-support";
import { bodyBounds, bodyMassProperties, tessellateBody } from "../brep";
import {
  wallSolidBodyLocal,
  wallSolidVolume,
  type CadWallSolidRecipe,
  type CadWallSolidOpening,
} from "./wall-solid";

const wall: CadWallSolidRecipe = {
  start: { x: 0, y: 0, z: 0 },
  end: { x: 4_000, y: 0, z: 0 },
  thickness: 250,
  height: 2_400,
};

/** Möller–Trumbore, verificación INDEPENDIENTE del propio kernel de teselado. */
function rayHitsTriangle(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): boolean {
  const eps = 1e-9;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [
    dir[1] * e2[2] - dir[2] * e2[1],
    dir[2] * e2[0] - dir[0] * e2[2],
    dir[0] * e2[1] - dir[1] * e2[0],
  ];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < eps) return false;
  const inv = 1 / det;
  const t0 = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
  if (u < -eps || u > 1 + eps) return false;
  const q = [
    t0[1] * e1[2] - t0[2] * e1[1],
    t0[2] * e1[0] - t0[0] * e1[2],
    t0[0] * e1[1] - t0[1] * e1[0],
  ];
  const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
  if (v < -eps || u + v > 1 + eps) return false;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > eps;
}

function rayHitsCount(
  body: NonNullable<ReturnType<typeof wallSolidBodyLocal>>,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
): number {
  const mesh = tessellateBody(body);
  let hits = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i] * 3;
    const ib = mesh.indices[i + 1] * 3;
    const ic = mesh.indices[i + 2] * 3;
    const a: [number, number, number] = [
      mesh.positions[ia],
      mesh.positions[ia + 1],
      mesh.positions[ia + 2],
    ];
    const b: [number, number, number] = [
      mesh.positions[ib],
      mesh.positions[ib + 1],
      mesh.positions[ib + 2],
    ];
    const c: [number, number, number] = [
      mesh.positions[ic],
      mesh.positions[ic + 1],
      mesh.positions[ic + 2],
    ];
    if (rayHitsTriangle(origin, dir, a, b, c)) hits += 1;
  }
  return hits;
}

// --- 1. muro macizo: volumen exacto de una caja -----------------------------
{
  const body = wallSolidBodyLocal(wall, []);
  check("un muro con receta válida produce cuerpo", body !== null);
  const analytic = wallSolidVolume(wall)!;
  checkClose(
    "volumen analítico = longitud×grosor×altura",
    analytic,
    4_000 * 250 * 2_400,
  );
  if (body) {
    const mass = bodyMassProperties(body);
    checkClose(
      "volumen teselado coincide con el analítico",
      mass.volume,
      analytic,
      analytic * 1e-6,
    );
    const bounds = bodyBounds(body);
    checkClose("X: 0 a longitud", bounds.max.x - bounds.min.x, 4_000);
    checkClose("Y: grosor completo", bounds.max.y - bounds.min.y, 250);
    checkClose("Z: 0 a altura", bounds.max.z - bounds.min.z, 2_400);
  }
}

// --- 2. un vano válido resta EXACTAMENTE su propio volumen ------------------
const door: CadWallSolidOpening = {
  position: 1_500,
  width: 900,
  sill: 0,
  height: 2_100,
};
{
  const solid = wallSolidBodyLocal(wall, [])!;
  const withDoor = wallSolidBodyLocal(wall, [door]);
  check("un vano válido produce cuerpo (no null)", withDoor !== null);
  if (withDoor) {
    const solidVolume = bodyMassProperties(solid).volume;
    const cutVolume = bodyMassProperties(withDoor).volume;
    const doorVolume = door.width * door.height * wall.thickness;
    checkClose(
      "el volumen restado es EXACTAMENTE anchura×altura×grosor del vano",
      solidVolume - cutVolume,
      doorVolume,
      doorVolume * 1e-4,
    );
  }
}

// --- 3. un rayo por el vano no choca; un rayo por muro macizo sí ------------
{
  const withDoor = wallSolidBodyLocal(wall, [door]);
  check("cuerpo con vano construido", withDoor !== null);
  if (withDoor) {
    const half = wall.thickness / 2;
    const midHeight = door.sill + door.height / 2;
    const throughDoor = rayHitsCount(
      withDoor,
      [door.position, -half - 10, midHeight],
      [0, 1, 0],
    );
    check(
      "un rayo por el CENTRO del vano no choca con ningún triángulo del muro",
      throughDoor === 0,
      `se esperaban 0 impactos y hubo ${throughDoor}`,
    );
    const solidSpotX = 3_200; // lejos del vano (1_050 a 1_950)
    const throughWall = rayHitsCount(
      withDoor,
      [solidSpotX, -half - 10, midHeight],
      [0, 1, 0],
    );
    check(
      "un rayo por una zona de muro MACIZO sí choca",
      throughWall > 0,
      `se esperaban impactos y hubo ${throughWall}`,
    );
  }
}

// --- 4. un vano que no encaja no corta nada ---------------------------------
{
  const tooWide: CadWallSolidOpening = {
    position: 500,
    width: 1_400,
    sill: 0,
    height: 2_100,
  };
  const tooTall: CadWallSolidOpening = {
    position: 1_500,
    width: 900,
    sill: 2_000,
    height: 1_000,
  };
  const solidVolume = bodyMassProperties(wallSolidBodyLocal(wall, [])!).volume;
  const withImpossible = wallSolidBodyLocal(wall, [tooWide, tooTall]);
  check(
    "los vanos imposibles no tumban el cuerpo del muro",
    withImpossible !== null,
  );
  if (withImpossible) {
    checkClose(
      "el volumen no cambia: ningún vano imposible corta nada",
      bodyMassProperties(withImpossible).volume,
      solidVolume,
      solidVolume * 1e-9,
    );
  }
}

// --- 5. recetas degeneradas ---------------------------------------------------
{
  check(
    "eje de longitud nula → null",
    wallSolidBodyLocal({ ...wall, end: { ...wall.start } }, []) === null,
  );
  check(
    "grosor no positivo → null",
    wallSolidBodyLocal({ ...wall, thickness: 0 }, []) === null,
  );
  check(
    "altura no positiva → null",
    wallSolidBodyLocal({ ...wall, height: -1 }, []) === null,
  );
}

report("wall-solid", 14);
