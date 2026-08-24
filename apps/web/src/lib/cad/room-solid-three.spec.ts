/**
 * El cuerpo local de una losa, llevado a escena: sin rotación de por medio,
 * lo único que puede salir mal es la permutación de ejes y el escalado — y
 * eso es justo lo que se prueba aquí, con la geometría YA TRANSFORMADA.
 */
import * as THREE from "three";
import { check, checkClose, report } from "../brep/spec-support";
import {
  buildCadArchitecturalSlabGeometry,
  buildCadArchitecturalMassObject,
  disposeCadArchitecturalMassObject,
} from "./room-solid-three";
import type { CadThreeViewport } from "./entity-three";

const viewport: CadThreeViewport = {
  scale: 0.01,
  width: 10_000,
  height: 10_000,
};

const ring = [
  { x: 1_000, y: 2_000 },
  { x: 6_000, y: 2_000 },
  { x: 6_000, y: 5_000 },
  { x: 1_000, y: 5_000 },
];

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
  geometry: THREE.BufferGeometry,
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

// --- 1. bounds en escena: permutación de ejes correcta ----------------------
{
  const geometry = buildCadArchitecturalSlabGeometry(
    ring,
    2_400,
    2_700,
    viewport,
  );
  check("geometría construida para un anillo válido", geometry !== null);
  if (geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // X de escena viene de X de planta, centrado en la mitad del viewport.
    checkClose(
      "X mín. de escena",
      box.min.x,
      (1_000 - viewport.width / 2) * viewport.scale,
      1e-6,
    );
    checkClose(
      "X máx. de escena",
      box.max.x,
      (6_000 - viewport.width / 2) * viewport.scale,
      1e-6,
    );
    // Y de escena viene de Z de planta (la cota que se extruye), SIN centrar.
    checkClose(
      "Y mín. de escena = z0 escalado",
      box.min.y,
      2_400 * viewport.scale,
      1e-6,
    );
    checkClose(
      "Y máx. de escena = z1 escalado",
      box.max.y,
      2_700 * viewport.scale,
      1e-6,
    );
    // Z de escena viene de Y de planta, centrado en la mitad del viewport.
    checkClose(
      "Z mín. de escena",
      box.min.z,
      (2_000 - viewport.height / 2) * viewport.scale,
      1e-6,
    );
    checkClose(
      "Z máx. de escena",
      box.max.z,
      (5_000 - viewport.height / 2) * viewport.scale,
      1e-6,
    );
  }
}

// --- 2. en escena, un rayo vertical por el centro de la losa choca; uno
//        lejos de la huella no choca --------------------------------------
{
  const geometry = buildCadArchitecturalSlabGeometry(
    ring,
    2_400,
    2_700,
    viewport,
  )!;
  const centerX = ((1_000 + 6_000) / 2 - viewport.width / 2) * viewport.scale;
  const centerZ = ((2_000 + 5_000) / 2 - viewport.height / 2) * viewport.scale;
  const throughSlab = rayHits(geometry, [centerX, 0, centerZ], [0, 1, 0]);
  check(
    "un rayo vertical por el centro de la losa choca con la malla",
    throughSlab > 0,
    `se esperaban impactos y hubo ${throughSlab}`,
  );
  const farX = (20_000 - viewport.width / 2) * viewport.scale;
  const throughOutside = rayHits(geometry, [farX, 0, centerZ], [0, 1, 0]);
  check(
    "un rayo vertical lejos de la huella no choca con nada",
    throughOutside === 0,
    `se esperaban 0 impactos y hubo ${throughOutside}`,
  );
}

// --- 3. anillo degenerado → geometría null -----------------------------------
{
  check(
    "anillo de menos de 3 vértices → null",
    buildCadArchitecturalSlabGeometry([ring[0], ring[1]], 0, 100, viewport) ===
      null,
  );
}

// --- 4. el objeto de escena: identidad, fail-closed, sin nativeEntityId -----
{
  const group = buildCadArchitecturalMassObject(
    "roof",
    ring,
    2_400,
    2_700,
    viewport,
  );
  check(
    "el grupo lleva la marca de qué masa es",
    group.userData.architecturalMassKind === "roof",
  );
  check(
    "y NO lleva nativeEntityId: no es una entidad editable del documento",
    group.userData.nativeEntityId === undefined,
  );
  let meshCount = 0;
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshCount += 1;
  });
  check("un anillo válido produce exactamente una malla", meshCount === 1);

  const parent = new THREE.Group();
  parent.add(group);
  disposeCadArchitecturalMassObject(group);
  check("dispose() saca el objeto de su padre", group.parent === null);

  const empty = buildCadArchitecturalMassObject(
    "floor",
    [ring[0], ring[1]],
    0,
    100,
    viewport,
  );
  check(
    "anillo degenerado → grupo marcado inválido",
    empty.userData.invalid === true,
  );
  let emptyMeshCount = 0;
  empty.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) emptyMeshCount += 1;
  });
  check(
    "…y sin ninguna malla dentro: no hay visor roto que mostrar",
    emptyMeshCount === 0,
  );
}

report("room-solid-three", 16);
