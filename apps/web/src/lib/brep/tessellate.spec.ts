/**
 * Teselado y masa: el volumen por DOS caminos que no comparten código.
 *
 * Camino A: integrar sobre las caras del B-rep (divergencia sobre la topología
 * cosida). Camino B: sumar productos mixtos sobre los triángulos de la malla.
 * Como en este kernel las caras son planas, los dos integran exactamente la
 * misma superficie y tienen que coincidir hasta el ruido de coma flotante — una
 * discrepancia de 1e-9 ya es un síntoma, no una tolerancia.
 *
 * Contra los valores CERRADOS (πr²h, 2π²Rr², 4πr²) la coincidencia es
 * aproximada por definición, porque el sólido facetado no es el exacto. Ahí lo
 * que se comprueba es la CONVERGENCIA al refinar, y que la aproximación se queda
 * del lado correcto.
 */
import { booleanDifference } from "./boolean";
import { extrudeProfile, revolveProfile } from "./extrude";
import { compareMassProperties, meshArea, meshCentroid, meshVolume } from "./mass-properties";
import { circleProfile, vec2 } from "./profile";
import { makeBox, makeBoxWithThroughHole, makeTetrahedron } from "./primitives";
import { makeFrame } from "./surfaces";
import {
  chordErrorOf,
  meshTriangleCount,
  meshVertexCount,
  segmentsForChordTolerance,
  tessellateBody,
  tessellateSurface,
} from "./tessellate";
import { check, checkClose, checkPointClose, checkThrows, report } from "./spec-support";
import { planarBodyArea, planarBodyVolume, translateBody, type BrepBody } from "./topology";
import { v3Length, vec3, V3_X, V3_Z } from "./vec3";

/** Comprueba que los dos caminos coinciden y devuelve el informe. */
function twoWay(label: string, body: BrepBody, tolerance = 1e-9) {
  const comparison = compareMassProperties(body);
  check(
    `${label}: volumen por caras = volumen por malla`,
    comparison.volumeDrift < tolerance,
    `caras ${comparison.byFaces.volume} vs malla ${comparison.byMesh.volume} (deriva ${comparison.volumeDrift.toExponential(3)})`,
  );
  check(
    `${label}: área por caras = área por malla`,
    comparison.areaDrift < tolerance,
    `caras ${comparison.byFaces.area} vs malla ${comparison.byMesh.area} (deriva ${comparison.areaDrift.toExponential(3)})`,
  );
  return comparison;
}

// --- Los dos caminos, sobre todo el catálogo -----------------------------
{
  const box = makeBox({ min: vec3(-1, -2, -3), max: vec3(4, 5, 6) });
  const comparison = twoWay("caja", box);
  checkClose("y el valor es dx·dy·dz", comparison.byMesh.volume, 5 * 7 * 9);
  checkClose("y el área es 2(dxdy+dydz+dzdx)", comparison.byMesh.area, 2 * (35 + 63 + 45));
  checkPointClose("el centroide de una caja es su centro", comparison.byMesh.centroid, vec3(1.5, 1.5, 1.5), 1e-12);
  check("una caja se tesela en 12 triángulos", comparison.triangles === 12, `${comparison.triangles}`);
}
{
  const tetra = makeTetrahedron(1);
  const comparison = twoWay("tetraedro", tetra);
  checkClose("volumen 8/3", comparison.byMesh.volume, 8 / 3, 1e-12);
  checkPointClose("centroide en el origen", comparison.byMesh.centroid, vec3(0, 0, 0), 1e-12);
  check("4 triángulos", comparison.triangles === 4, `${comparison.triangles}`);
}
{
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 3, y: 3 },
    holeMax: { x: 7, y: 6 },
  });
  const comparison = twoWay("caja con agujero pasante", holed);
  checkClose("volumen = 400 − 48", comparison.byMesh.volume, 400 - 48, 1e-9);
  // Teselar una cara CON agujeros es donde falla un teselador que ignore los
  // lazos interiores: el área saldría de más, y el volumen también.
  checkClose("área = exterior + interior", comparison.byMesh.area, planarBodyArea(holed), 1e-9);
}
{
  const cylinder = revolveProfile({ profile: { outer: [vec2(0, 0), vec2(3, 0), vec2(3, 7)] }, segments: 40 });
  twoWay("cono facetado", cylinder);
}
{
  const tube = revolveProfile({
    profile: { outer: [vec2(2, 0), vec2(5, 0), vec2(5, 3), vec2(2, 3)] },
    segments: 24,
  });
  twoWay("tubo facetado (género 1)", tube);
}
{
  const drilled = booleanDifference(
    makeBox({ min: vec3(-3, -3, 0), max: vec3(3, 3, 2) }),
    revolveProfile({ profile: { outer: [vec2(0, -1), vec2(2, -1), vec2(2, 3), vec2(0, 3)] }, segments: 24 }),
  );
  twoWay("resultado de una booleana", drilled);
}
{
  // El volumen por malla NO depende de dónde esté el origen: los tetraedros que
  // sobran se cancelan. Es la propiedad que hace fiable la fórmula.
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(2, 3, 4) });
  const here = meshVolume(tessellateBody(box));
  const there = meshVolume(tessellateBody(translateBody(box, vec3(1000, -500, 250))));
  checkClose("el volumen no depende del origen", there, here, 1e-6);
  checkPointClose(
    "y el centroide se traslada con el sólido",
    meshCentroid(tessellateBody(translateBody(box, vec3(1000, -500, 250)))),
    vec3(1001, -498.5, 252),
    1e-6,
  );
}

// --- Normales por vértice y aristas vivas --------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) });
  const mesh = tessellateBody(box, { creaseAngleRad: Math.PI / 6 });
  // Un cubo tiene 8 vértices geométricos, pero cada uno pertenece a 3 caras con
  // normales a 90°: con arista viva, cada vértice emite 3 normales distintas.
  check("un cubo con aristas vivas emite 24 vértices", meshVertexCount(mesh) === 24, `${meshVertexCount(mesh)}`);
  let worst = 0;
  for (let i = 0; i < meshVertexCount(mesh); i += 1) {
    worst = Math.max(worst, Math.abs(v3Length(vec3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2])) - 1));
  }
  check("todas las normales son unitarias", worst < 1e-12, `peor ${worst}`);
  // Con un ángulo de arista viva de 180° todo se suaviza y los 8 vértices se
  // comparten: es la comprobación de que el parámetro hace algo.
  const smooth = tessellateBody(box, { creaseAngleRad: Math.PI });
  check("suavizándolo todo, el cubo baja a 8 vértices", meshVertexCount(smooth) === 8, `${meshVertexCount(smooth)}`);
  check("y el número de triángulos no cambia", meshTriangleCount(smooth) === meshTriangleCount(mesh));
  checkClose("ni el volumen", meshVolume(smooth), meshVolume(mesh), 1e-12);
}
{
  // Un prisma de 64 lados: casi todas sus aristas laterales están por debajo del
  // ángulo de arista viva, así que el lateral se suaviza y sólo las tapas cortan.
  const prism = extrudeProfile({ profile: { outer: circleProfile(2, 64) }, height: 3 });
  const sharp = tessellateBody(prism, { creaseAngleRad: 0 });
  const smooth = tessellateBody(prism, { creaseAngleRad: Math.PI / 6 });
  check("suavizar reduce el número de vértices emitidos", meshVertexCount(smooth) < meshVertexCount(sharp));
  checkClose("sin tocar el volumen", meshVolume(smooth), meshVolume(sharp), 1e-9);
}

// --- Tolerancia de cuerda -------------------------------------------------
{
  // Un arco de radio 10 con flecha máxima 0,01: Δ = 2·acos(1 − 0,001) = 0,0894 rad.
  const segments = segmentsForChordTolerance(10, 2 * Math.PI, 0.01);
  check("un círculo de radio 10 con flecha 0,01 pide ~71 facetas", segments === 71, `${segments}`);
  check("y el error real queda por debajo de la tolerancia", chordErrorOf(10, 2 * Math.PI, segments) <= 0.01);
  check("con una faceta menos, se pasa", chordErrorOf(10, 2 * Math.PI, segments - 1) > 0.01);
}
{
  // Afinar la tolerancia sube las facetas y baja el error, monotónicamente.
  let previous = 0;
  for (const tolerance of [1, 0.1, 0.01, 0.001]) {
    const segments = segmentsForChordTolerance(5, 2 * Math.PI, tolerance);
    check(`tolerancia ${tolerance}: más facetas que antes`, segments > previous, `${segments} ≤ ${previous}`);
    check(`tolerancia ${tolerance}: el error real la cumple`, chordErrorOf(5, 2 * Math.PI, segments) <= tolerance);
    previous = segments;
  }
}
{
  // Y el círculo así construido converge al área exacta.
  const radius = 4;
  for (const tolerance of [0.1, 0.01]) {
    const segments = segmentsForChordTolerance(radius, 2 * Math.PI, tolerance);
    // Perfil del cono: base en y=0 y ÁPICE en (0,1). Con el ápice en (radius,1)
    // el sólido sería el complemento del cono dentro del cilindro, que tiene
    // otro volumen — y es el error fácil de cometer al escribir el perfil.
    const body = revolveProfile({ profile: { outer: [vec2(0, 0), vec2(radius, 0), vec2(0, 1)] }, segments });
    const exact = (Math.PI * radius * radius) / 3;
    const error = Math.abs(planarBodyVolume(body) - exact) / exact;
    check(`cono con flecha ${tolerance}: el volumen se acerca a πr²h/3`, error < tolerance, `error relativo ${error}`);
  }
}
checkThrows("una tolerancia de cuerda nula se rechaza", () => segmentsForChordTolerance(1, Math.PI, 0));
checkThrows("un radio nulo se rechaza", () => segmentsForChordTolerance(0, Math.PI, 0.1));

// --- Teselado de superficies analíticas -----------------------------------
{
  // Un plano no tiene curvatura: un solo paso en cada dirección, 2 triángulos.
  const plane = { kind: "plane" as const, frame: makeFrame(vec3(0, 0, 0), V3_Z, V3_X) };
  const mesh = tessellateSurface(plane, { uRange: [0, 4], vRange: [0, 3], chordTolerance: 0.001 });
  check("un plano se tesela en 2 triángulos", meshTriangleCount(mesh) === 2, `${meshTriangleCount(mesh)}`);
  checkClose("con el área exacta", meshArea(mesh), 12, 1e-12);
}
{
  // Esfera completa: el área de la malla converge a 4πr² desde abajo.
  const sphere = { kind: "sphere" as const, frame: makeFrame(vec3(0, 0, 0), V3_Z, V3_X), radius: 3 };
  const exact = 4 * Math.PI * 9;
  let previousError = Infinity;
  for (const tolerance of [0.2, 0.05, 0.01]) {
    const mesh = tessellateSurface(sphere, {
      uRange: [0, 2 * Math.PI],
      vRange: [-Math.PI / 2, Math.PI / 2],
      chordTolerance: tolerance,
    });
    const area = meshArea(mesh);
    check(`esfera con flecha ${tolerance}: la malla inscrita mide MENOS que la esfera`, area < exact, `${area} ≥ ${exact}`);
    const error = (exact - area) / exact;
    check(`esfera con flecha ${tolerance}: el error baja`, error < previousError, `${error} ≥ ${previousError}`);
    previousError = error;
  }
  check("con flecha 0,01 el área se queda a menos del 1 %", previousError < 0.01, `${previousError}`);
}
{
  // Cilindro: recto en v, curvo en u. El teselador debe notar la diferencia.
  const cylinder = { kind: "cylinder" as const, frame: makeFrame(vec3(0, 0, 0), V3_Z, V3_X), radius: 2 };
  const mesh = tessellateSurface(cylinder, { uRange: [0, 2 * Math.PI], vRange: [0, 5], chordTolerance: 0.01 });
  const exact = 2 * Math.PI * 2 * 5;
  check("el área del cilindro teselado se acerca a 2πrh", Math.abs(meshArea(mesh) - exact) / exact < 0.01);
  // Sólo 1 paso en v: la generatriz es recta y no hace falta subdividirla.
  const perRow = meshVertexCount(mesh) / (meshTriangleCount(mesh) / 2 + 1);
  check("y la dirección recta no se subdivide de más", perRow <= 2.001, `${perRow}`);
}

report("brep/tessellate", 50);
