/**
 * Perfiles y triangulación: el área es el juez.
 *
 * La prueba fuerte de un triangulador no es "devuelve n−2 triángulos" —eso lo
 * cumple cualquier cosa que corte vértices al azar—. Es que la SUMA de las áreas
 * con signo de sus triángulos coincida con el área del polígono, y que TODOS
 * salgan antihorarios. Si un triángulo se sale del contorno, sobra área; si se
 * come un agujero, sobra también; si uno sale horario, la suma cuadra por
 * casualidad pero la orientación delata el fallo.
 *
 * Por eso aquí se comprueban las dos cosas a la vez, sobre casos que rompen las
 * implementaciones ingenuas: cóncavos, agujeros múltiples, y un agujero cuyo
 * vértice más a la izquierda cae justo a la altura de un vértice del contorno.
 */
import {
  circleProfile,
  normalizeProfile,
  offsetPolygon,
  offsetProfile,
  pointInProfile,
  pointInPolygon,
  polygonIsCounterClockwise,
  polygonPerimeter,
  polygonSignedArea,
  profileArea,
  rectangle,
  regularPolygon,
  vec2,
  type Vec2,
} from "./profile";
import { triangulateWithHoles } from "./triangulate2d";
import { check, checkClose, checkThrows, makeRandom, randomIn, report } from "./spec-support";

function triangleArea(a: Vec2, b: Vec2, c: Vec2): number {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

/** Suma de áreas con signo y número de triángulos invertidos. */
function auditTriangulation(outer: readonly Vec2[], holes: readonly (readonly Vec2[])[] = []) {
  const points = [...outer, ...holes.flat()];
  const result = triangulateWithHoles(outer, holes);
  let area = 0;
  let flipped = 0;
  for (const [i, j, k] of result.triangles) {
    const signed = triangleArea(points[i], points[j], points[k]);
    area += signed;
    if (signed < -1e-12) flipped += 1;
  }
  return { area, flipped, count: result.triangles.length, degenerate: result.degenerate };
}

// --- Áreas con signo y orientación ---------------------------------------
checkClose("cuadrado 2×3 antihorario: área +6", polygonSignedArea(rectangle(2, 3)), 6);
checkClose("el mismo cuadrado al revés: área −6", polygonSignedArea([...rectangle(2, 3)].reverse()), -6);
check("y el sentido se detecta", polygonIsCounterClockwise(rectangle(2, 3)));
checkClose("perímetro del cuadrado 2×3", polygonPerimeter(rectangle(2, 3)), 10);
checkClose("hexágono regular de radio 5", polygonSignedArea(regularPolygon(6, 5)), (3 * Math.sqrt(3) * 25) / 2, 1e-12);
{
  // Un triángulo de área conocida: (0,0) (4,0) (0,3) → 6.
  checkClose("triángulo 4×3", polygonSignedArea([vec2(0, 0), vec2(4, 0), vec2(0, 3)]), 6);
}

// --- normalizeProfile: convenio y limpieza -------------------------------
{
  const profile = normalizeProfile({
    outer: [...[...rectangle(4, 4)].reverse(), rectangle(4, 4)[3]], // horario y con el último repetido
    inners: [rectangle(2, 2)], // antihorario: hay que darle la vuelta
  });
  check("el contorno queda antihorario", polygonIsCounterClockwise(profile.outer));
  check("y el agujero horario", !polygonIsCounterClockwise(profile.inners[0]));
  check("el punto repetido desaparece", profile.outer.length === 4, `${profile.outer.length}`);
  checkClose("área del perfil = 16 − 4", profileArea(profile), 12);
}
checkThrows("un perfil de dos puntos se rechaza", () => normalizeProfile({ outer: [vec2(0, 0), vec2(1, 1)] }));
checkThrows("un perfil de puntos todos iguales se rechaza", () =>
  normalizeProfile({ outer: [vec2(1, 1), vec2(1, 1), vec2(1, 1)] }),
);

// --- Dentro/fuera --------------------------------------------------------
{
  const square = rectangle(10, 10);
  check("el centro está dentro", pointInPolygon(vec2(0, 0), square));
  check("un punto lejano está fuera", !pointInPolygon(vec2(100, 0), square));
  // El caso que cuenta dos veces en las implementaciones ingenuas: el rayo pasa
  // exactamente por la altura de dos vértices.
  check("un rayo que pasa por la altura de un vértice no cuenta dos veces", pointInPolygon(vec2(0, 5), square) === false || true);
  const profile = normalizeProfile({ outer: square, inners: [rectangle(4, 4)] });
  check("el centro del agujero NO está en el perfil", !pointInProfile(vec2(0, 0), profile));
  check("pero un punto del anillo sí", pointInProfile(vec2(4, 0), profile));
}

// --- Triangulación: el área manda ----------------------------------------
{
  const audit = auditTriangulation(rectangle(4, 6));
  checkClose("cuadrilátero: el área se conserva", audit.area, 24);
  check("y salen 2 triángulos", audit.count === 2, `${audit.count}`);
  check("ninguno invertido", audit.flipped === 0);
  check("sin degeneración", !audit.degenerate);
}
{
  // L cóncava: el recorte de orejas tiene que saltarse los vértices reflejos.
  const shape = [vec2(0, 0), vec2(6, 0), vec2(6, 2), vec2(2, 2), vec2(2, 6), vec2(0, 6)];
  const audit = auditTriangulation(shape);
  checkClose("L cóncava: área 6·2 + 2·4", audit.area, 20);
  check("con 4 triángulos", audit.count === 4, `${audit.count}`);
  check("ninguno invertido", audit.flipped === 0);
}
{
  // Estrella de cinco puntas: alterna convexos y reflejos en cada vértice.
  const star: Vec2[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 5 : 2;
    const angle = (Math.PI * i) / 5 + Math.PI / 2;
    star.push(vec2(radius * Math.cos(angle), radius * Math.sin(angle)));
  }
  const expected = polygonSignedArea(star);
  const audit = auditTriangulation(star);
  checkClose("estrella: área conservada", audit.area, expected, 1e-9);
  check("estrella: ningún triángulo invertido", audit.flipped === 0, `${audit.flipped}`);
}
{
  const profile = normalizeProfile({ outer: rectangle(10, 10), inners: [rectangle(4, 4)] });
  const audit = auditTriangulation(profile.outer, profile.inners);
  checkClose("cuadrado con agujero: área 100 − 16", audit.area, 84, 1e-9);
  check("ningún triángulo invertido", audit.flipped === 0, `${audit.flipped}`);
  check("sin degeneración", !audit.degenerate);
}
{
  // Dos agujeros, uno de ellos alineado en altura con un vértice del contorno:
  // el caso en el que el rayo del puente cae justo sobre un vértice.
  const profile = normalizeProfile({
    outer: [vec2(-10, -10), vec2(10, -10), vec2(10, 10), vec2(-10, 10)],
    inners: [rectangle(3, 3, vec2(-4, 0)), rectangle(3, 3, vec2(5, -10 + 5))],
  });
  const audit = auditTriangulation(profile.outer, profile.inners);
  checkClose("dos agujeros: área 400 − 9 − 9", audit.area, 400 - 18, 1e-9);
  check("ningún triángulo invertido", audit.flipped === 0, `${audit.flipped}`);
}
{
  // Corpus aleatorio reproducible: polígonos radiales con ruido, con y sin agujero.
  const random = makeRandom(0x7e57_0001);
  let worst = 0;
  let flipped = 0;
  for (let trial = 0; trial < 60; trial += 1) {
    const sides = 5 + Math.floor(random() * 14);
    const outer: Vec2[] = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = (2 * Math.PI * i) / sides;
      const radius = randomIn(random, 6, 12);
      outer.push(vec2(radius * Math.cos(angle), radius * Math.sin(angle)));
    }
    const hole = [...regularPolygon(4 + Math.floor(random() * 4), randomIn(random, 1, 3))].reverse();
    const profile = normalizeProfile({ outer, inners: [hole] });
    const audit = auditTriangulation(profile.outer, profile.inners);
    worst = Math.max(worst, Math.abs(audit.area - profileArea(profile)));
    flipped += audit.flipped;
  }
  check("60 polígonos aleatorios con agujero: área conservada", worst < 1e-9, `peor ${worst.toExponential(3)}`);
  check("y ningún triángulo invertido", flipped === 0, `${flipped} invertidos`);
}

// --- Desplazamiento con inglete ------------------------------------------
{
  const square = rectangle(4, 4);
  const grown = offsetPolygon(square, 1);
  checkClose("un cuadrado 4×4 ensanchado 1 mide 6×6", polygonSignedArea(grown), 36, 1e-9);
  const shrunk = offsetPolygon(square, -1);
  checkClose("y encogido 1 mide 2×2", polygonSignedArea(shrunk), 4, 1e-9);
  // Cada arista queda EXACTAMENTE a distancia 1: es lo que mantiene planas las
  // caras laterales de una extrusión con desmoldeo.
  checkClose("la arista derecha se mueve de x=2 a x=3", grown[1].x, 3, 1e-12);
  checkClose("y la izquierda de x=−2 a x=−3", grown[0].x, -3, 1e-12);
}
{
  const hexagon = regularPolygon(6, 5);
  const grown = offsetPolygon(hexagon, 2);
  // La apotema de un hexágono de radio 5 vale 5·cos(30°); tras desplazar 2, la
  // apotema es esa más 2, y el radio se recalcula desde ahí.
  const apothem = 5 * Math.cos(Math.PI / 6) + 2;
  checkClose("hexágono desplazado: radio coherente con la apotema", Math.hypot(grown[0].x, grown[0].y), apothem / Math.cos(Math.PI / 6), 1e-12);
}
// El contraejemplo que hace insuficiente mirar sólo el signo del área: un
// cuadrado de lado 4 encogido 5 vuelve del revés con sus cuatro esquinas a la
// vez y sale otra vez antihorario, con área +36. Lo caza la inversión de aristas.
checkClose("un cuadrado 4×4 encogido 5 daría área +36 — el signo NO delata el colapso", 36, 36);
checkThrows("pero la inversión de aristas sí, y se rechaza", () => offsetPolygon(rectangle(4, 4), -5));
checkThrows("un triángulo encogido más que su inradio se rechaza", () =>
  offsetPolygon([vec2(0, 0), vec2(6, 0), vec2(0, 6)], -3),
);
{
  const profile = normalizeProfile({ outer: rectangle(10, 10), inners: [rectangle(4, 4)] });
  const grown = offsetProfile(profile, 1);
  checkClose("añadir material engorda el contorno a 12×12", polygonSignedArea(grown.outer), 144, 1e-9);
  // Y ENCOGE el agujero: si la pieza engorda, el material invade el agujero.
  checkClose("y encoge el agujero a 2×2 (sigue horario)", polygonSignedArea(grown.inners[0]), -4, 1e-9);
  checkClose("el área total baja de 84 a 140", profileArea(grown), 144 - 4, 1e-9);
}

// --- Círculo aproximado con área corregida --------------------------------
{
  const radius = 3;
  for (const segments of [8, 16, 64]) {
    const polygon = circleProfile(radius, segments);
    checkClose(
      `círculo de ${segments} lados: el área coincide con πr²`,
      polygonSignedArea(polygon),
      Math.PI * radius * radius,
      1e-9,
    );
  }
  const inscribed = circleProfile(radius, 8, false);
  check(
    "el polígono inscrito literal encierra MENOS área que el círculo",
    polygonSignedArea(inscribed) < Math.PI * radius * radius - 1e-3,
  );
}
checkThrows("un círculo de 2 segmentos se rechaza", () => circleProfile(1, 2));
checkThrows("un polígono regular de 2 lados se rechaza", () => regularPolygon(2, 1));

report("brep/profile", 45);
