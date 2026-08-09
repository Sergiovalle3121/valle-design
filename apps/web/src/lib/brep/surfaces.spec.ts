/**
 * Superficies analíticas: derivadas contra diferencias finitas, y anclas.
 *
 * Aquí se cierra el hueco del aviso 5 del encargo. Comprobar sólo que la normal
 * es perpendicular a las derivadas parciales es una propiedad que se cumple sola
 * (la normal SE CALCULA como su producto vectorial, así que es perpendicular por
 * construcción aunque las derivadas estén mal). Lo que de verdad prueba las
 * fórmulas es:
 *
 *   1. Contrastar las seis derivadas contra DIFERENCIAS FINITAS del punto. Si
 *      `dvv` del toro tiene un signo cambiado, la diferencia finita no miente.
 *   2. Anclar valores concretos: la normal del cilindro en `u = 0` es `(1,0,0)`
 *      y no otra cosa; la recta que cruza un toro R=3 r=1 por su ecuador corta
 *      en x = ±2 y ±4, cuatro puntos, ni tres ni cinco.
 */
import {
  coneApex,
  coneRadiusAt,
  makeFrame,
  planeFromPointNormal,
  planeSignedDistance,
  surfaceDerivatives,
  surfaceLineIntersect,
  surfaceNormal,
  surfacePoint,
  surfaceProject,
  worldToFrame,
  type BrepSurface,
  type ConeSurface,
} from "./surfaces";
import { check, checkClose, checkPointClose, makeRandom, randomIn, report } from "./spec-support";
import { v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub, vec3, V3_X, V3_Z } from "./vec3";

const ORIGIN = vec3(0, 0, 0);
const FRAME = makeFrame(ORIGIN, V3_Z, V3_X);

const PLANE: BrepSurface = { kind: "plane", frame: FRAME };
const CYLINDER: BrepSurface = { kind: "cylinder", frame: FRAME, radius: 3 };
const CONE: ConeSurface = { kind: "cone", frame: FRAME, radius: 1, halfAngleRad: Math.PI / 4 };
const SPHERE: BrepSurface = { kind: "sphere", frame: FRAME, radius: 2 };
const TORUS: BrepSurface = { kind: "torus", frame: FRAME, majorRadius: 3, minorRadius: 1 };

// --- Anclas de evaluación: valores que sólo salen de la parametrización correcta ---
checkPointClose("plano P(2,5) = (2,5,0)", surfacePoint(PLANE, 2, 5), vec3(2, 5, 0));
checkPointClose("cilindro P(0,4) = (3,0,4)", surfacePoint(CYLINDER, 0, 4), vec3(3, 0, 4));
checkPointClose("cilindro P(π/2,0) = (0,3,0)", surfacePoint(CYLINDER, Math.PI / 2, 0), vec3(0, 3, 0), 1e-15);
checkPointClose("cono P(0,1) = (2,0,1) con α=45°", surfacePoint(CONE, 0, 1), vec3(2, 0, 1));
checkPointClose("esfera P(0,π/2) = polo norte (0,0,2)", surfacePoint(SPHERE, 0, Math.PI / 2), vec3(0, 0, 2), 1e-15);
checkPointClose("esfera P(0,0) = (2,0,0)", surfacePoint(SPHERE, 0, 0), vec3(2, 0, 0));
checkPointClose("toro P(0,0) = (4,0,0) — borde exterior", surfacePoint(TORUS, 0, 0), vec3(4, 0, 0));
checkPointClose("toro P(0,π) = (2,0,0) — borde interior", surfacePoint(TORUS, 0, Math.PI), vec3(2, 0, 0), 1e-15);
checkPointClose("toro P(0,π/2) = (3,0,1) — cresta", surfacePoint(TORUS, 0, Math.PI / 2), vec3(3, 0, 1), 1e-15);

checkClose("radio del cono en v=−1 es 0 (ápice)", coneRadiusAt(CONE, -1), 0);
checkPointClose("ápice del cono en (0,0,−1)", coneApex(CONE)!, vec3(0, 0, -1));
check("un cono de semiángulo 0 no tiene ápice", coneApex({ ...CONE, halfAngleRad: 0 }) === null);

// --- Anclas de normal: sentido SALIENTE con radios positivos ---
checkPointClose("normal del plano = Z", surfaceNormal(PLANE, 3, -7), vec3(0, 0, 1));
checkPointClose("normal del cilindro en u=0 apunta a +X", surfaceNormal(CYLINDER, 0, 9), vec3(1, 0, 0));
checkPointClose("normal de la esfera en (2,0,0) apunta a +X", surfaceNormal(SPHERE, 0, 0), vec3(1, 0, 0));
checkPointClose("normal del toro en el borde exterior apunta a +X", surfaceNormal(TORUS, 0, 0), vec3(1, 0, 0));
checkPointClose(
  "normal del toro en el borde interior apunta a −X",
  surfaceNormal(TORUS, 0, Math.PI),
  vec3(-1, 0, 0),
  1e-15,
);
checkPointClose(
  "normal del cono en u=0 se inclina hacia abajo (cosα, 0, −sinα)",
  surfaceNormal(CONE, 0, 1),
  vec3(Math.SQRT1_2, 0, -Math.SQRT1_2),
  1e-14,
);

// --- Derivadas contra diferencias finitas ---
const SURFACES: Array<[string, BrepSurface, [number, number], [number, number]]> = [
  ["plano", PLANE, [-4, 4], [-4, 4]],
  ["cilindro", CYLINDER, [0.1, 6.1], [-3, 3]],
  ["cono", CONE, [0.1, 6.1], [0.5, 4]],
  ["esfera", SPHERE, [0.1, 6.1], [-1.2, 1.2]],
  ["toro", TORUS, [0.1, 6.1], [0.1, 6.1]],
];

for (const [name, surface, uRange, vRange] of SURFACES) {
  const random = makeRandom(0xa11ce ^ name.length);
  const h = 1e-4;
  let worstFirst = 0;
  let worstSecond = 0;
  let worstNormal = 0;
  for (let i = 0; i < 120; i += 1) {
    const u = randomIn(random, uRange[0], uRange[1]);
    const v = randomIn(random, vRange[0], vRange[1]);
    const d = surfaceDerivatives(surface, u, v);
    const p = (du: number, dv: number) => surfacePoint(surface, u + du, v + dv);
    const fdU = v3Scale(v3Sub(p(h, 0), p(-h, 0)), 1 / (2 * h));
    const fdV = v3Scale(v3Sub(p(0, h), p(0, -h)), 1 / (2 * h));
    const fdUU = v3Scale(v3Sub(v3Sub(p(h, 0), v3Scale(d.point, 2)), v3Scale(p(-h, 0), -1)), 1 / (h * h));
    const fdVV = v3Scale(v3Sub(v3Sub(p(0, h), v3Scale(d.point, 2)), v3Scale(p(0, -h), -1)), 1 / (h * h));
    const fdUV = v3Scale(
      v3Sub(v3Sub(p(h, h), p(h, -h)), v3Sub(p(-h, h), p(-h, -h))),
      1 / (4 * h * h),
    );
    worstFirst = Math.max(worstFirst, v3Length(v3Sub(d.du, fdU)), v3Length(v3Sub(d.dv, fdV)));
    worstSecond = Math.max(
      worstSecond,
      v3Length(v3Sub(d.duu, fdUU)),
      v3Length(v3Sub(d.dvv, fdVV)),
      v3Length(v3Sub(d.duv, fdUV)),
    );
    const normal = surfaceNormal(surface, u, v);
    worstNormal = Math.max(worstNormal, Math.abs(v3Length(normal) - 1));
    // El sentido de la normal se contrasta con el producto vectorial de las
    // diferencias finitas: no basta con que sea perpendicular, tiene que
    // apuntar al MISMO lado que du × dv medido numéricamente.
    const fdNormal = v3Normalize(v3Cross(fdU, fdV));
    worstNormal = Math.max(worstNormal, 1 - v3Dot(normal, fdNormal));
  }
  check(`${name}: derivadas primeras = diferencias finitas`, worstFirst < 1e-6, `peor ${worstFirst.toExponential(3)}`);
  check(`${name}: derivadas segundas = diferencias finitas`, worstSecond < 1e-4, `peor ${worstSecond.toExponential(3)}`);
  check(`${name}: normal unitaria y del lado correcto`, worstNormal < 1e-7, `peor ${worstNormal.toExponential(3)}`);
}

// --- Proyección de punto a superficie: anclas absolutas ---
{
  const projection = surfaceProject(CYLINDER, vec3(5, 0, 4));
  checkPointClose("proyectar (5,0,4) sobre el cilindro r=3 da (3,0,4)", projection.point, vec3(3, 0, 4));
  checkClose("y la distancia es 2", projection.distance, 2);
  checkClose("con v = 4", projection.v, 4);
}
{
  const projection = surfaceProject(SPHERE, vec3(0, 0, 10));
  checkPointClose("proyectar sobre la esfera desde el eje da el polo", projection.point, vec3(0, 0, 2), 1e-15);
  checkClose("distancia al polo = 8", projection.distance, 8);
}
{
  const projection = surfaceProject(TORUS, vec3(5, 0, 0));
  checkPointClose("proyectar (5,0,0) sobre el toro da (4,0,0)", projection.point, vec3(4, 0, 0));
  checkClose("distancia = 1", projection.distance, 1);
}
{
  const projection = surfaceProject(CONE, vec3(3, 0, 0));
  checkClose("proyección sobre el cono: v = 1", projection.v, 1);
  checkPointClose("y el punto es (2,0,1)", projection.point, vec3(2, 0, 1));
  checkClose("distancia = √2", projection.distance, Math.SQRT2);
}
{
  const plane = planeFromPointNormal(vec3(0, 0, 5), V3_Z);
  checkClose("distancia con signo por encima del plano", planeSignedDistance(plane, vec3(1, 2, 8)), 3);
  checkClose("y por debajo es negativa", planeSignedDistance(plane, vec3(1, 2, 1)), -4);
}
// La proyección devuelve un punto de la superficie: propiedad, sobre corpus aleatorio.
{
  const random = makeRandom(0xd00d_1111);
  let worst = 0;
  for (const [, surface] of SURFACES) {
    for (let i = 0; i < 200; i += 1) {
      const point = vec3(randomIn(random, -8, 8), randomIn(random, -8, 8), randomIn(random, -8, 8));
      const projection = surfaceProject(surface, point);
      const roundTrip = surfacePoint(surface, projection.u, projection.v);
      worst = Math.max(worst, v3Length(v3Sub(roundTrip, projection.point)));
    }
  }
  check("la proyección siempre cae SOBRE la superficie", worst < 1e-9, `peor ${worst.toExponential(3)}`);
}

// --- Intersección recta-superficie ---
{
  const hits = surfaceLineIntersect(PLANE, vec3(0, 0, 5), vec3(0, 0, -1));
  check("una recta corta el plano una vez", hits.length === 1);
  checkClose("en t = 5", hits[0].t, 5);
}
check("una recta paralela al plano no lo corta", surfaceLineIntersect(PLANE, vec3(0, 0, 5), V3_X).length === 0);
{
  const hits = surfaceLineIntersect(CYLINDER, vec3(-10, 0, 2), V3_X);
  check("la recta corta el cilindro dos veces", hits.length === 2);
  checkClose("entrada en t = 7", hits[0].t, 7);
  checkClose("salida en t = 13", hits[1].t, 13);
  checkPointClose("y el punto de entrada es (−3,0,2)", hits[0].point, vec3(-3, 0, 2));
}
{
  const hits = surfaceLineIntersect(CYLINDER, vec3(-10, 3, 0), V3_X);
  check("una recta TANGENTE al cilindro da un solo corte", hits.length === 1, `obtenidos ${hits.length}`);
  checkClose("en t = 10", hits[0].t, 10, 1e-9);
}
check("una recta que pasa de largo no corta el cilindro", surfaceLineIntersect(CYLINDER, vec3(-10, 4, 0), V3_X).length === 0);
{
  const hits = surfaceLineIntersect(SPHERE, vec3(-10, 0, 0), V3_X);
  check("la recta corta la esfera dos veces", hits.length === 2);
  checkClose("entrada en t = 8", hits[0].t, 8);
  checkClose("salida en t = 12", hits[1].t, 12);
}
{
  // A la altura v = 1 el cono tiene radio 2.
  const hits = surfaceLineIntersect(CONE, vec3(-10, 0, 1), V3_X);
  check("la recta corta el cono dos veces a la altura v=1", hits.length === 2, `obtenidos ${hits.length}`);
  checkClose("entrada en t = 8", hits[0].t, 8, 1e-9);
  checkClose("salida en t = 12", hits[1].t, 12, 1e-9);
}
{
  // Manto reflejado: a z = −3 el radio algebraico es |−2| pero está PASADO el
  // ápice. Un kernel ingenuo devuelve dos cortes fantasma; este debe dar cero.
  const hits = surfaceLineIntersect(CONE, vec3(-10, 0, -3), V3_X);
  check("el manto reflejado del cono NO produce cortes", hits.length === 0, `obtenidos ${hits.length}: ${hits.map((h) => h.t)}`);
}
{
  // Toro R=3 r=1 cortado por su ecuador: x = ±2 y ±4. Cuatro cortes.
  const hits = surfaceLineIntersect(TORUS, vec3(-10, 0, 0), V3_X);
  check("la recta ecuatorial corta el toro CUATRO veces", hits.length === 4, `obtenidos ${hits.length}`);
  checkClose("t = 6 (x = −4)", hits[0].t, 6, 1e-7);
  checkClose("t = 8 (x = −2)", hits[1].t, 8, 1e-7);
  checkClose("t = 12 (x = +2)", hits[2].t, 12, 1e-7);
  checkClose("t = 14 (x = +4)", hits[3].t, 14, 1e-7);
}
{
  // Recta por el eje del toro: no lo toca (el agujero mide 2 de radio).
  const hits = surfaceLineIntersect(TORUS, vec3(0, 0, -10), V3_Z);
  check("el eje del toro no lo corta", hits.length === 0, `obtenidos ${hits.length}`);
}
{
  // Recta vertical por el centro del tubo: corta arriba y abajo (z = ±1).
  const hits = surfaceLineIntersect(TORUS, vec3(3, 0, -10), V3_Z);
  check("recta vertical por el tubo corta dos veces", hits.length === 2, `obtenidos ${hits.length}`);
  checkClose("z = −1", hits[0].t, 9, 1e-7);
  checkClose("z = +1", hits[1].t, 11, 1e-7);
}
// Todo corte devuelto está SOBRE la superficie y SOBRE la recta.
{
  const random = makeRandom(0xfeed_9999);
  let worstSurface = 0;
  let worstLine = 0;
  for (const [, surface] of SURFACES) {
    for (let i = 0; i < 150; i += 1) {
      const origin = vec3(randomIn(random, -9, 9), randomIn(random, -9, 9), randomIn(random, -9, 9));
      const direction = vec3(randomIn(random, -1, 1), randomIn(random, -1, 1), randomIn(random, -1, 1));
      if (v3Length(direction) < 1e-3) continue;
      for (const hit of surfaceLineIntersect(surface, origin, direction)) {
        worstSurface = Math.max(worstSurface, surfaceProject(surface, hit.point).distance);
        const onLine = v3Length(
          v3Sub(hit.point, vec3(origin.x + direction.x * hit.t, origin.y + direction.y * hit.t, origin.z + direction.z * hit.t)),
        );
        worstLine = Math.max(worstLine, onLine);
      }
    }
  }
  check("todo corte está sobre la superficie", worstSurface < 1e-6, `peor ${worstSurface.toExponential(3)}`);
  check("y sobre la recta", worstLine < 1e-12, `peor ${worstLine.toExponential(3)}`);
}

// --- Marcos: el mundo y el marco son inversos ---
{
  const frame = makeFrame(vec3(1, 2, 3), vec3(1, 1, 0), vec3(0, 0, 1));
  const local = worldToFrame(frame, vec3(4, 5, 6));
  checkClose("worldToFrame conserva la distancia al origen del marco", v3Length(local), v3Length(vec3(3, 3, 3)));
  check("los ejes del marco son ortonormales", Math.abs(v3Dot(frame.xAxis, frame.yAxis)) < 1e-15);
  checkClose("y diestros", v3Dot(v3Cross(frame.xAxis, frame.yAxis), frame.zAxis), 1, 1e-15);
}

report("brep/surfaces", 60);
