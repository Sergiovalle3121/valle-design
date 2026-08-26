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
import { wallJoins, type CadWallJoinWall } from "./wall-joins";
import {
  wallSolidBodyLocal,
  wallSolidBodyLocalWithDiagnostics,
  wallSolidVolume,
  type CadWallSolidRecipe,
  type CadWallSolidOpening,
} from "./wall-solid";
import { cadWallOpeningCutBlocksSolid } from "./wall-solid-diagnostics";

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

// --- 6. diagnóstico tipado: ningún vano se salta EN SILENCIO ------------------
// El criterio COMMERCIAL-RC1: cada operación devuelve resultado geométrico +
// diagnóstico tipado con la causa conservada. Un vano válido se recorta (y el
// volumen lo demuestra); uno inválido deja SU motivo, no un hueco fantasma.
{
  const door: CadWallSolidOpening = {
    position: 1_000,
    width: 900,
    sill: 0,
    height: 2_100,
  };
  const window: CadWallSolidOpening = {
    position: 2_800,
    width: 1_200,
    sill: 900,
    height: 1_200,
  };
  const tooWide: CadWallSolidOpening = {
    position: 2_000,
    width: 4_200,
    sill: 0,
    height: 2_100,
  };
  const clean = wallSolidBodyLocalWithDiagnostics(wall, [door, window]);
  check("dos vanos válidos → cero diagnósticos", clean.diagnostics.length === 0);
  const gross = wallSolidVolume(wall)!;
  const holes =
    door.width * wall.thickness * door.height +
    window.width * wall.thickness * window.height;
  checkClose(
    "volumen = bruto − suma de huecos (dos vanos válidos)",
    bodyMassProperties(clean.body!).volume,
    gross - holes,
    gross * 1e-9,
  );

  const mixed = wallSolidBodyLocalWithDiagnostics(wall, [door, tooWide, window]);
  check(
    "el vano imposible deja UN diagnóstico con su índice",
    mixed.diagnostics.length === 1 &&
      mixed.diagnostics[0].openingIndex === 1 &&
      mixed.diagnostics[0].kind === "horizontal-misfit",
  );
  check(
    "la causa del encaje viaja en el diagnóstico",
    (mixed.diagnostics[0].cause ?? "").includes("jamba"),
  );
  checkClose(
    "los vanos válidos del lote SÍ cortan aunque otro no encaje",
    bodyMassProperties(mixed.body!).volume,
    gross - holes,
    gross * 1e-9,
  );

  const degenerate = wallSolidBodyLocalWithDiagnostics(wall, [
    { position: 1_000, width: 0, sill: 0, height: 2_100 },
  ]);
  check(
    "tamaño degenerado → diagnóstico degenerate-size",
    degenerate.diagnostics.length === 1 &&
      degenerate.diagnostics[0].kind === "degenerate-size",
  );
  const tooTall = wallSolidBodyLocalWithDiagnostics(wall, [
    { position: 1_500, width: 900, sill: 2_000, height: 1_000 },
  ]);
  check(
    "remate por encima del muro → diagnóstico vertical-misfit con causa",
    tooTall.diagnostics.length === 1 &&
      tooTall.diagnostics[0].kind === "vertical-misfit" &&
      (tooTall.diagnostics[0].cause ?? "").length > 0,
  );

  check(
    "los desajustes de encaje NO bloquean la representación",
    cadWallOpeningCutBlocksSolid(mixed.diagnostics) === false,
  );
  check(
    "una booleana fallida sobre un vano válido SÍ la bloquea",
    cadWallOpeningCutBlocksSolid([
      { openingIndex: 0, kind: "boolean-failed", cause: "kernel" },
    ]) === true,
  );
  checkClose(
    "wallSolidBodyLocal (sin diagnósticos) produce el MISMO cuerpo",
    bodyMassProperties(wallSolidBodyLocal(wall, [door, window])!).volume,
    bodyMassProperties(clean.body!).volume,
    1e-6,
  );
}

// --- 7. unión en L: el inglete de la planta, ahora con volumen ---------------
// Dos muros perpendiculares que comparten (0,0). El eje de A es el eje X del
// marco local Y del mundo a la vez (u=(1,0), n=(0,1)), así que las
// coordenadas locales del cuerpo de A SON coordenadas del mundo y los rayos
// se pueden apuntar con números de planta.
{
  const jointWallA: CadWallJoinWall = {
    id: "A",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4_000, y: 0, z: 0 },
    thickness: 250,
  };
  const jointWallB: CadWallJoinWall = {
    id: "B",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 3_000, z: 0 },
    thickness: 250,
  };
  const joinsA = wallJoins(jointWallA, [jointWallB]);
  const joinsB = wallJoins(jointWallB, [jointWallA]);
  check(
    "la esquina compartida deriva corner en el arranque y free en el remate",
    joinsA.start.kind === "corner" && joinsA.end.kind === "free",
  );
  const bodyA = wallSolidBodyLocal(
    { ...wall, thickness: 250 },
    [],
    joinsA,
  )!;
  const bodyB = wallSolidBodyLocal(
    {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: 3_000, z: 0 },
      thickness: 250,
      height: 2_400,
    },
    [],
    joinsB,
  )!;
  const volA = bodyMassProperties(bodyA).volume;
  const volB = bodyMassProperties(bodyB).volume;
  const naiveA = 4_000 * 250 * 2_400;
  const naiveB = 3_000 * 250 * 2_400;
  checkClose(
    "el inglete simétrico conserva el volumen del muro (cede un triángulo, gana el otro)",
    volA,
    naiveA,
    naiveA * 1e-9,
  );
  const boundsA = bodyBounds(bodyA);
  checkClose(
    "la cara exterior de A se EXTIENDE hasta la cara exterior de B",
    boundsA.min.x,
    -125,
  );
  // El triángulo interior de la esquina (por encima de la diagonal y=x) es
  // de B: un rayo vertical ahí no debe tocar A — sin inglete, la caja de A
  // lo llenaría y habría VOLUMEN DOBLE con B.
  const insideCeded = rayHitsCount(bodyA, [30, 100, -10], [0, 0, 1]);
  check(
    "A ya no ocupa el triángulo interior cedido a B (volumen doble eliminado)",
    insideCeded === 0,
    `se esperaban 0 impactos y hubo ${insideCeded}`,
  );
  // La escuadra exterior (x<0, y<0, del lado x≥y de la diagonal) era una
  // MUESCA en las cajas ingenuas: el inglete la rellena.
  const outerFilled = rayHitsCount(bodyA, [-60, -100, -10], [0, 0, 1]);
  check(
    "A rellena la escuadra exterior que las cajas ingenuas dejaban abierta",
    outerFilled > 0,
    `se esperaban impactos y hubo ${outerFilled}`,
  );
  checkClose(
    "el par en L suma EXACTAMENTE sus dos volúmenes nominales: ni doble ni hueco",
    volA + volB,
    naiveA + naiveB,
    (naiveA + naiveB) * 1e-9,
  );
}

// --- 8. empalme en T: el que llega termina contra la cara del pasante --------
{
  const through: CadWallJoinWall = {
    id: "A",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4_000, y: 0, z: 0 },
    thickness: 250,
  };
  const incoming: CadWallJoinWall = {
    id: "C",
    start: { x: 2_000, y: 0, z: 0 },
    end: { x: 2_000, y: 1_500, z: 0 },
    thickness: 200,
  };
  const joinsC = wallJoins(incoming, [through]);
  const joinsA = wallJoins(through, [incoming]);
  check(
    "el que llega deriva tee con el testero absorbido",
    joinsC.start.kind === "tee" && joinsC.start.cap === false,
  );
  check(
    "el pasante no se toca: sus dos extremos siguen libres",
    joinsA.start.kind === "free" && joinsA.end.kind === "free",
  );
  const bodyC = wallSolidBodyLocal(
    {
      start: { x: 2_000, y: 0, z: 0 },
      end: { x: 2_000, y: 1_500, z: 0 },
      thickness: 200,
      height: 2_400,
    },
    [],
    joinsC,
  )!;
  const expected = (1_500 - 125) * 200 * 2_400;
  checkClose(
    "el volumen del que llega se recorta hasta la cara del pasante: cero masa dentro de él",
    bodyMassProperties(bodyC).volume,
    expected,
    expected * 1e-9,
  );
}

// --- 9. uniones que degeneran caen a la caja base; los vanos siguen cortando --
{
  const consumed = {
    start: {
      kind: "corner" as const,
      otherId: "x",
      leftExtension: -5_000,
      rightExtension: -5_000,
      cap: false,
    },
    end: {
      kind: "free" as const,
      otherId: null,
      leftExtension: 0,
      rightExtension: 0,
      cap: true,
    },
  };
  const naive = wallSolidVolume(wall)!;
  const fallback = wallSolidBodyLocal(wall, [], consumed)!;
  checkClose(
    "un recorte que consume la cara entera degrada a la caja base, nunca a un sólido del revés",
    bodyMassProperties(fallback).volume,
    naive,
    naive * 1e-9,
  );

  const jointWallA: CadWallJoinWall = {
    id: "A",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4_000, y: 0, z: 0 },
    thickness: 250,
  };
  const jointWallB: CadWallJoinWall = {
    id: "B",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 3_000, z: 0 },
    thickness: 250,
  };
  const joinsA = wallJoins(jointWallA, [jointWallB]);
  const joined = wallSolidBodyLocal({ ...wall, thickness: 250 }, [], joinsA)!;
  const joinedWithDoor = wallSolidBodyLocal(
    { ...wall, thickness: 250 },
    [door],
    joinsA,
  )!;
  const doorVolume = door.width * door.height * 250;
  checkClose(
    "en un muro con inglete, el vano sigue restando EXACTAMENTE su volumen",
    bodyMassProperties(joined).volume - bodyMassProperties(joinedWithDoor).volume,
    doorVolume,
    doorVolume * 1e-4,
  );
}

report("wall-solid", 35);
