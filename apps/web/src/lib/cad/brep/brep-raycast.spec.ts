/**
 * Ray casting contra B-rep: impacto estable por índice de cara.
 *
 * Prueba que `raycastFace` devuelve el impacto más cercano con el identificador
 * correcto (índice de cara), que no impacta detrás del origen, que un rayo que
 * no toca el cuerpo devuelve `null`, y que los agujeros pasantes se atraviesan.
 */
import {
  check,
  checkClose,
  checkPointClose,
  report,
} from "../../brep/spec-support";
import {
  makeBox,
  makeBoxWithThroughHole,
  makeTetrahedron,
  vec3,
} from "../../brep";
import { raycastFace } from "./brep-raycast";

// --- 1 · Caja: rayo vertical hacia abajo impacta la tapa --------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const hit = raycastFace(box, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, -1),
  });
  check("rayo vertical impacta la caja", hit !== null);
  if (hit) {
    check("faceIndex es válido", hit.faceIndex >= 0 && hit.faceIndex < box.faces.length);
    checkPointClose("impacta en z=10", hit.point, vec3(5, 5, 10));
    checkClose("distancia = 40", hit.distance, 40);
  }
}

// --- 2 · Rayo que no toca el cuerpo ----------------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const miss = raycastFace(box, {
    origin: vec3(50, 50, 50),
    direction: vec3(0, 0, -1),
  });
  check("rayo lejos de la caja no impacta", miss === null);
}

// --- 3 · Impacto detrás del origen: no cuenta ------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const behind = raycastFace(box, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, 1),
  });
  check("impacto detrás del origen devuelve null", behind === null);
}

// --- 4 · Rayo desde abajo: impacta la base ----------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const hit = raycastFace(box, {
    origin: vec3(5, 5, -50),
    direction: vec3(0, 0, 1),
  });
  check("desde abajo impacta", hit !== null);
  if (hit) {
    checkPointClose("impacta en z=0", hit.point, vec3(5, 5, 0));
    checkClose("distancia = 50", hit.distance, 50);
  }
}

// --- 5 · Rayo oblicuo: impacta una cara lateral -----------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const eye = vec3(60, -40, 5);
  const target = vec3(5, 5, 5);
  const hit = raycastFace(box, {
    origin: eye,
    direction: v3Sub(target, eye),
  });
  check("rayo oblicuo impacta la caja", hit !== null);
  if (hit) {
    check(
      "el impacto está sobre la superficie de la caja",
      hit.point.x <= 10 + 1e-6 &&
        hit.point.x >= -1e-6 &&
        hit.point.y <= 10 + 1e-6 &&
        hit.point.y >= -1e-6 &&
        hit.point.z <= 10 + 1e-6 &&
        hit.point.z >= -1e-6,
      `punto (${hit.point.x}, ${hit.point.y}, ${hit.point.z})`,
    );
  }
}

// --- 6 · Dirección nula: no impacta ----------------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const nullDir = raycastFace(box, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, 0),
  });
  check("dirección nula no impacta", nullDir === null);
}

// --- 7 · Tetraedro: cuerpo no alineado a ejes ------------------------------
{
  const tet = makeTetrahedron(5);
  const hit = raycastFace(tet, {
    origin: vec3(0, 0, 50),
    direction: vec3(0, 0, -1),
  });
  check("tetraedro: rayo vertical impacta", hit !== null);
  if (hit) {
    check("faceIndex válido para tetraedro", hit.faceIndex >= 0 && hit.faceIndex < tet.faces.length);
    check("distancia positiva", hit.distance > 0);
  }
}

// --- 8 · Caja con agujero pasante: por el hueco no impacta -----------------
{
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 4, y: 4 },
    holeMax: { x: 6, y: 6 },
  });

  // Por el centro del agujero: el rayo atraviesa.
  const throughHole = raycastFace(holed, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, -1),
  });
  check("por el agujero pasante no impacta", throughHole === null);

  // Fuera del agujero: impacta la tapa.
  const onMaterial = raycastFace(holed, {
    origin: vec3(1, 1, 50),
    direction: vec3(0, 0, -1),
  });
  check("fuera del agujero sí impacta", onMaterial !== null);
  if (onMaterial) {
    checkPointClose("impacta en z=4", onMaterial.point, vec3(1, 1, 4));
  }
}

// --- 9 · Estabilidad del identificador: misma cara, mismo índice -----------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const hitA = raycastFace(box, {
    origin: vec3(3, 3, 50),
    direction: vec3(0, 0, -1),
  });
  const hitB = raycastFace(box, {
    origin: vec3(7, 7, 50),
    direction: vec3(0, 0, -1),
  });
  check("dos rayos verticales impactan algo", hitA !== null && hitB !== null);
  if (hitA && hitB) {
    check(
      "ambos impactan la MISMA cara (la tapa)",
      hitA.faceIndex === hitB.faceIndex,
      `A=${hitA.faceIndex}, B=${hitB.faceIndex}`,
    );
  }
}

// --- 10 · El punto de impacto está sobre la superficie del cuerpo ----------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const hit = raycastFace(box, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, -1),
  });
  if (hit) {
    // Verificar que el punto de impacto es coherente con origen + dirección * distancia.
    const reconstructed = {
      x: 5 + 0 * hit.distance,
      y: 5 + 0 * hit.distance,
      z: 50 + (-1) * hit.distance,
    };
    checkPointClose(
      "punto = origen + dir·distancia",
      hit.point,
      reconstructed,
    );
  }
}

// Helper local: v3Sub para la prueba 5.
function v3Sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

report("cad/brep/brep-raycast", 21);
