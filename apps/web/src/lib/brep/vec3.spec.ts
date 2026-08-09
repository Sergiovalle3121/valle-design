/**
 * Álgebra 3D: anclas absolutas, no sólo propiedades.
 *
 * Una spec de vectores escrita sólo con propiedades ("la norma del normalizado
 * es 1", "el producto vectorial es perpendicular") pasa igual de verde con una
 * implementación que devuelva siempre el eje Z. Por eso aquí cada propiedad va
 * acompañada de al menos un valor CONCRETO que sólo puede salir de la fórmula
 * correcta.
 */
import {
  aabbCenter,
  aabbDiagonal,
  aabbFromPoints,
  aabbIsEmpty,
  aabbOverlaps,
  aabbEmpty,
  v3Angle,
  v3Basis,
  v3Cross,
  v3Distance,
  v3Dot,
  v3Length,
  v3Normalize,
  v3RotateAroundAxis,
  v3SignedAngle,
  v3Triple,
  vec3,
  V3_X,
  V3_Y,
  V3_Z,
} from "./vec3";
import { check, checkClose, checkPointClose, makeRandom, randomIn, report } from "./spec-support";

// --- Anclas absolutas del producto vectorial: la regla de la mano derecha ---
checkPointClose("X × Y = Z", v3Cross(V3_X, V3_Y), V3_Z);
checkPointClose("Y × Z = X", v3Cross(V3_Y, V3_Z), V3_X);
checkPointClose("Z × X = Y", v3Cross(V3_Z, V3_X), V3_Y);
checkPointClose("Y × X = −Z", v3Cross(V3_Y, V3_X), vec3(0, 0, -1));
checkPointClose("(1,2,3) × (4,5,6) = (−3,6,−3)", v3Cross(vec3(1, 2, 3), vec3(4, 5, 6)), vec3(-3, 6, -3));

checkClose("(1,2,3) · (4,5,6) = 32", v3Dot(vec3(1, 2, 3), vec3(4, 5, 6)), 32);
checkClose("|(3,4,12)| = 13", v3Length(vec3(3, 4, 12)), 13);
checkClose("distancia (1,1,1)→(1,1,4) = 3", v3Distance(vec3(1, 1, 1), vec3(1, 1, 4)), 3);
checkClose("triple(X,Y,Z) = 1", v3Triple(V3_X, V3_Y, V3_Z), 1);
checkClose("triple con vector repetido = 0", v3Triple(V3_X, V3_X, V3_Z), 0);

// El vector nulo NO se normaliza a un eje inventado: se queda en cero.
checkPointClose("normalizar (0,0,0) devuelve (0,0,0)", v3Normalize(vec3(0, 0, 0)), vec3(0, 0, 0));

// --- Base ortonormal: diestra y estable para cualquier normal ---
{
  const random = makeRandom(0x5eed_1234);
  let worstOrtho = 0;
  let worstHandedness = 0;
  for (let i = 0; i < 400; i += 1) {
    const normal = vec3(randomIn(random, -5, 5), randomIn(random, -5, 5), randomIn(random, -5, 5));
    if (v3Length(normal) < 1e-6) continue;
    const { u, v, w } = v3Basis(normal);
    worstOrtho = Math.max(worstOrtho, Math.abs(v3Dot(u, v)), Math.abs(v3Dot(u, w)), Math.abs(v3Dot(v, w)));
    worstOrtho = Math.max(worstOrtho, Math.abs(v3Length(u) - 1), Math.abs(v3Length(v) - 1));
    worstHandedness = Math.max(worstHandedness, Math.abs(v3Triple(u, v, w) - 1));
  }
  check("v3Basis: ortonormal en 400 normales aleatorias", worstOrtho < 1e-12, `peor desvío ${worstOrtho}`);
  check("v3Basis: siempre diestra (u×v·w = +1)", worstHandedness < 1e-12, `peor desvío ${worstHandedness}`);
}
// El caso que rompe la elección ingenua de eje auxiliar: normal casi paralela a Z.
{
  const { u, v, w } = v3Basis(vec3(1e-14, 0, 1));
  check(
    "v3Basis: normal casi paralela a Z no degenera",
    v3Length(u) > 0.999 && v3Length(v) > 0.999 && Math.abs(v3Dot(u, w)) < 1e-12,
  );
}

// --- Ángulos: sin signo y con signo ---
checkClose("ángulo(X, Y) = π/2", v3Angle(V3_X, V3_Y), Math.PI / 2);
checkClose("ángulo(X, −X) = π", v3Angle(V3_X, vec3(-1, 0, 0)), Math.PI, 1e-12);
checkClose("ángulo(X, X) = 0", v3Angle(V3_X, V3_X), 0, 1e-12);
checkClose("ángulo con signo X→Y sobre Z = +π/2", v3SignedAngle(V3_X, V3_Y, V3_Z), Math.PI / 2);
checkClose("ángulo con signo Y→X sobre Z = −π/2", v3SignedAngle(V3_Y, V3_X, V3_Z), -Math.PI / 2);
checkClose("ángulo con signo X→Y sobre −Z = −π/2", v3SignedAngle(V3_X, V3_Y, vec3(0, 0, -1)), -Math.PI / 2);

// --- Rotación de Rodrigues ---
checkPointClose("rotar X 90° sobre Z da Y", v3RotateAroundAxis(V3_X, V3_Z, Math.PI / 2), V3_Y, 1e-15);
checkPointClose("rotar X 180° sobre Z da −X", v3RotateAroundAxis(V3_X, V3_Z, Math.PI), vec3(-1, 0, 0), 1e-15);
checkPointClose("rotar sobre el propio eje no mueve nada", v3RotateAroundAxis(V3_Z, V3_Z, 1.234), V3_Z, 1e-15);
{
  // (1,1,1)/√3 girado 120° sobre sí mismo se queda; girar X 120° sobre él da Y.
  const diagonal = v3Normalize(vec3(1, 1, 1));
  checkPointClose(
    "rotar X 120° sobre la diagonal (1,1,1) da Y",
    v3RotateAroundAxis(V3_X, diagonal, (2 * Math.PI) / 3),
    V3_Y,
    1e-14,
  );
}
{
  // La rotación conserva longitudes: propiedad, con ancla ya cubierta arriba.
  const random = makeRandom(0xbeef_0001);
  let worst = 0;
  for (let i = 0; i < 300; i += 1) {
    const point = vec3(randomIn(random, -3, 3), randomIn(random, -3, 3), randomIn(random, -3, 3));
    const axis = vec3(randomIn(random, -1, 1), randomIn(random, -1, 1), randomIn(random, -1, 1));
    if (v3Length(axis) < 1e-6) continue;
    const rotated = v3RotateAroundAxis(point, axis, randomIn(random, -Math.PI, Math.PI));
    worst = Math.max(worst, Math.abs(v3Length(rotated) - v3Length(point)));
  }
  check("Rodrigues conserva la longitud", worst < 1e-13, `peor desvío ${worst}`);
}

// --- Cajas ---
check("caja vacía se reconoce vacía", aabbIsEmpty(aabbEmpty()));
{
  const box = aabbFromPoints([vec3(-1, 0, 2), vec3(3, 4, -2)]);
  checkPointClose("caja min", box.min, vec3(-1, 0, -2));
  checkPointClose("caja max", box.max, vec3(3, 4, 2));
  checkPointClose("centro de la caja", aabbCenter(box), vec3(1, 2, 0));
  checkClose("diagonal de la caja", aabbDiagonal(box), Math.hypot(4, 4, 4));
  const separated = aabbFromPoints([vec3(10, 10, 10), vec3(11, 11, 11)]);
  check("cajas separadas no se solapan", !aabbOverlaps(box, separated));
  check("caja consigo misma se solapa", aabbOverlaps(box, box));
  // Contacto EXACTO: se cuenta como solape, y es el caso que la booleana necesita.
  const touching = aabbFromPoints([vec3(3, 0, 0), vec3(5, 1, 1)]);
  check("cajas que se tocan exactamente se consideran solapadas", aabbOverlaps(box, touching));
}
check("diagonal de caja vacía = 0", aabbDiagonal(aabbEmpty()) === 0);

report("brep/vec3", 30);
