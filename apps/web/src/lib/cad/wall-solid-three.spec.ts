/**
 * El cuerpo local del muro, llevado a escena: la rotación en planta no puede
 * torcer la altura ni perder el vano.
 *
 * Un muro EN DIAGONAL (no alineado a los ejes) es el caso que de verdad prueba
 * `wallAxisFrame`/`wallAxisPoint`: si la rotación estuviera mal, un muro recto
 * saldría torcido y nadie lo notaría con un muro alineado a X. Se repite aquí
 * la comprobación de rayo del kernel puro (`wall-solid.spec.ts`) pero sobre la
 * geometría YA TRANSFORMADA a escena, para que un bug de transformación (no
 * de kernel) también quede atrapado.
 */
import { check, checkClose, report } from "../brep/spec-support";
import { buildCadWallSolidGeometry } from "./wall-solid-three";
import type { CadThreeViewport } from "./entity-three";

const viewport: CadThreeViewport = {
  scale: 0.01,
  width: 10_000,
  height: 10_000,
};

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

function rayHits(
  geometry: {
    getAttribute: (name: string) => { array: ArrayLike<number> } | undefined;
    index: { array: ArrayLike<number> } | null;
  },
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
): number {
  const position = geometry.getAttribute("position")!.array;
  const index = geometry.index!.array;
  let hits = 0;
  for (let i = 0; i < index.length; i += 3) {
    const ia = index[i] * 3;
    const ib = index[i + 1] * 3;
    const ic = index[i + 2] * 3;
    const a: [number, number, number] = [
      position[ia],
      position[ia + 1],
      position[ia + 2],
    ];
    const b: [number, number, number] = [
      position[ib],
      position[ib + 1],
      position[ib + 2],
    ];
    const c: [number, number, number] = [
      position[ic],
      position[ic + 1],
      position[ic + 2],
    ];
    if (rayHitsTriangle(origin, dir, a, b, c)) hits += 1;
  }
  return hits;
}

// Muro en diagonal: de (1_000, 1_000, 500) a (4_000, 5_000, 500) — longitud
// 5_000 (3-4-5), elevado 500 mm (un nivel de entrepiso, no el suelo) para
// probar también que `start.z` viaja a la altura de escena.
const wall = {
  start: { x: 1_000, y: 1_000, z: 500 },
  end: { x: 4_000, y: 5_000, z: 500 },
  thickness: 200,
  height: 2_700,
};
const door = { position: 2_000, width: 900, sill: 0, height: 2_100 };

{
  const geometry = buildCadWallSolidGeometry(wall, [door], viewport);
  check("geometría construida para un muro en diagonal", geometry !== null);
  if (geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // La altura en escena (Y de Three) es start.z + [0, height] en dibujo,
    // escalada — invariante frente a la rotación en planta.
    const expectedMinY = wall.start.z * viewport.scale;
    const expectedMaxY = (wall.start.z + wall.height) * viewport.scale;
    checkClose(
      "altura mínima de escena = start.z escalado",
      box.min.y,
      expectedMinY,
      1e-6,
    );
    checkClose(
      "altura máxima de escena = (start.z + height) escalado, PESE a la rotación en planta",
      box.max.y,
      expectedMaxY,
      1e-6,
    );

    // Punto en el eje, a mitad del vano y a media altura del hueco, en DIBUJO:
    const length = Math.hypot(
      wall.end.x - wall.start.x,
      wall.end.y - wall.start.y,
    );
    const ux = (wall.end.x - wall.start.x) / length;
    const uy = (wall.end.y - wall.start.y) / length;
    const worldAtDoor = {
      x: wall.start.x + ux * door.position,
      y: wall.start.y + uy * door.position,
      z: wall.start.z + door.sill + door.height / 2,
    };
    const sceneAtDoor: [number, number, number] = [
      (worldAtDoor.x - viewport.width / 2) * viewport.scale,
      worldAtDoor.z * viewport.scale,
      (worldAtDoor.y - viewport.height / 2) * viewport.scale,
    ];
    // Normal del muro en planta (perpendicular al eje), para lanzar el rayo
    // ATRAVESANDO el grosor — nunca a lo largo del eje.
    const nx = -uy;
    const ny = ux;
    const rayDir: [number, number, number] = [nx, 0, ny];
    const farBack: [number, number, number] = [
      sceneAtDoor[0] - rayDir[0] * 1000,
      sceneAtDoor[1],
      sceneAtDoor[2] - rayDir[2] * 1000,
    ];
    const throughDoor = rayHits(geometry as never, farBack, rayDir);
    check(
      "en escena, un rayo por el CENTRO del vano (perpendicular al muro) no choca",
      throughDoor === 0,
      `se esperaban 0 impactos y hubo ${throughDoor}`,
    );

    const worldSolidSpot = {
      x: wall.start.x + ux * (length - 500),
      y: wall.start.y + uy * (length - 500),
      z: wall.start.z + door.sill + door.height / 2,
    };
    const sceneSolidSpot: [number, number, number] = [
      (worldSolidSpot.x - viewport.width / 2) * viewport.scale,
      worldSolidSpot.z * viewport.scale,
      (worldSolidSpot.y - viewport.height / 2) * viewport.scale,
    ];
    const farBackSolid: [number, number, number] = [
      sceneSolidSpot[0] - rayDir[0] * 1000,
      sceneSolidSpot[1],
      sceneSolidSpot[2] - rayDir[2] * 1000,
    ];
    const throughWall = rayHits(geometry as never, farBackSolid, rayDir);
    check(
      "en escena, un rayo por una zona de muro MACIZO sí choca",
      throughWall > 0,
      `se esperaban impactos y hubo ${throughWall}`,
    );
  }
}

{
  const flat = {
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 0, z: 0 },
    thickness: 200,
    height: 2_400,
  };
  check(
    "eje degenerado (start=end) → null",
    buildCadWallSolidGeometry(flat, [], viewport) === null,
  );
}

report("wall-solid-three", 6);
