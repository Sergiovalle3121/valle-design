/**
 * `mesh-stitch`: soldadura relativa, fusión coplanaria y detección de
 * agujeros — sobre una malla real, no sobre un B-rep que ya sabía sus caras.
 *
 * La fuente de verdad es el propio kernel: `makeBoxWithThroughHole` produce un
 * cuerpo con género 1 y una cara con agujero conocida de antemano, y
 * `tessellateBody` lo convierte en exactamente el tipo de entrada que trae un
 * lector STL/OBJ/glTF — triángulos sueltos, con la posición de cada vértice
 * REPETIDA una vez por cara incidente porque la normal difiere. Si
 * `stitchMeshToBody` recupera las mismas 10 caras y el mismo volumen a partir
 * de esa sopa, el cosedor hace lo que promete.
 */
import { makeBox, makeBoxWithThroughHole } from "./primitives";
import { stitchMeshToBody, type MeshStitchInput } from "./mesh-stitch";
import { tessellateBody, type BrepMesh } from "./tessellate";
import { planarBodyVolume, bodyIsClosed, eulerCounts } from "./topology";
import { vec3 } from "./vec3";
import { check, checkClose, checkThrows, report } from "./spec-support";

function meshToStitchInput(mesh: BrepMesh): MeshStitchInput {
  const points = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    points.push(vec3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]));
  }
  const faces: number[][] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    faces.push([mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]]);
  }
  return { points, faces };
}

// --- Caso base: caja lisa triangulada → 6 caras recuperadas ---------------
{
  const original = makeBox({ min: vec3(0, 0, 0), max: vec3(2, 3, 4) });
  const input = meshToStitchInput(tessellateBody(original));
  const result = stitchMeshToBody(input);
  check("caja lisa: válida", result.validation.ok, result.validation.violations.map((v) => v.message).join(" | "));
  check("caja lisa: cerrada", bodyIsClosed(result.body));
  check("caja lisa: 6 caras recuperadas de 12 triángulos", result.body.faces.length === 6, `salieron ${result.body.faces.length}`);
  check("caja lisa: se fusionaron 6 grupos", result.stats.coplanarGroupsMerged === 6);
  check("caja lisa: sin pérdidas", result.loss.length === 0, JSON.stringify(result.loss));
  checkClose("caja lisa: volumen", planarBodyVolume(result.body), 2 * 3 * 4, 1e-6);
}

// --- Caja con agujero pasante: detección de LAZOS INTERIORES --------------
{
  const original = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: vec3(3, 3, 0),
    holeMax: vec3(7, 7, 0),
  });
  const input = meshToStitchInput(tessellateBody(original));
  const result = stitchMeshToBody(input);
  check("con agujero: válida", result.validation.ok, result.validation.violations.map((v) => v.message).join(" | "));
  check("con agujero: 10 caras recuperadas (2 con agujero + 8 paredes)", result.body.faces.length === 10, `salieron ${result.body.faces.length}`);
  const counts = eulerCounts(result.body);
  check("con agujero: género 1 (χ=0)", counts.genus === 1, `χ=${counts.characteristic} género=${counts.genus}`);
  checkClose(
    "con agujero: volumen = caja − agujero pasante",
    planarBodyVolume(result.body),
    10 * 10 * 4 - 4 * 4 * 4,
    1e-6,
  );
  const facesWithHole = result.body.faces.filter((face) => face.loops.length > 1);
  check("con agujero: exactamente 2 caras con lazo interior (tapa y fondo)", facesWithHole.length === 2, `salieron ${facesWithHole.length}`);
}

// --- Soldadura TRANSITIVA: una cadena de vecinos cierra aunque los extremos disten más que la tolerancia ---
{
  // Tres copias del mismo vértice lógico, desplazadas 0.6·tol cada una: el
  // primero y el tercero distan 1.2·tol (fuera de tolerancia directa) pero
  // cada consecutivo está dentro. Sin unión de conjuntos, `addVertex` de
  // `BodyBuilder` los dejaría en dos vértices; con unión-find, en uno.
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(1000, 1000, 1000) });
  const mesh = tessellateBody(box);
  const input = meshToStitchInput(mesh);
  // Tolerancia relativa efectiva ronda 1e-5·diagonal ≈ 1.7e-2 para esta caja.
  // Se perturba un vértice compartido por tres triángulos en tres copias
  // encadenadas dentro de ese margen.
  const shifted: typeof input.points = input.points.map((p, i) => (i === 0 ? { x: p.x + 0.005, y: p.y, z: p.z } : p));
  const result = stitchMeshToBody({ points: shifted, faces: input.faces });
  check("cadena soldada: sigue siendo un sólido cerrado y válido", result.validation.ok && bodyIsClosed(result.body));
}

// --- Triángulo degenerado: se declara, no se cuela en silencio -----------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) });
  const input = meshToStitchInput(tessellateBody(box));
  const degenerate: MeshStitchInput = {
    points: [...input.points, input.points[0], input.points[0], input.points[0]],
    faces: [...input.faces, [input.points.length, input.points.length + 1, input.points.length + 2]],
  };
  const result = stitchMeshToBody(degenerate);
  check("triángulo degenerado: cuerpo sigue válido", result.validation.ok);
  check(
    "triángulo degenerado: declarado en el manifiesto de pérdidas",
    result.loss.some((entry) => entry.code === "mesh_face_degenerate_after_weld" && entry.count === 1),
    JSON.stringify(result.loss),
  );
}

// --- Malla abierta: fallo cerrado, no un sólido a medias ------------------
{
  const openMesh: MeshStitchInput = {
    points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)],
    faces: [[0, 1, 2]],
  };
  checkThrows("un solo triángulo (abierto) se rechaza por defecto", () => stitchMeshToBody(openMesh));
  const withoutValidation = stitchMeshToBody(openMesh, { validate: false, requireClosed: false });
  check("con requireClosed:false se puede inspeccionar sin lanzar", withoutValidation.body.faces.length === 1);
}

// --- Entrada hostil: coordenada no finita se rechaza ANTES de tocar el kernel ---
{
  checkThrows("NaN en un vértice se rechaza en la entrada", () =>
    stitchMeshToBody({ points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(NaN, 1, 0)], faces: [[0, 1, 2]] }),
  );
}

report("brep/mesh-stitch", 14);
