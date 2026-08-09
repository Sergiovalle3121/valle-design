/**
 * Extrusión y revolución: invariantes tras CADA operación, y volumen por dos
 * caminos independientes.
 *
 * El volumen se calcula aquí de dos maneras que no comparten ni una línea de
 * código: integrando sobre las caras del sólido construido (teorema de la
 * divergencia sobre la topología cosida) y con una fórmula cerrada sobre el
 * perfil 2D (Simpson para el desmoldeo, `(N/2)·sinΔ·∮x²dy` para la revolución).
 * Que coincidan no prueba que ninguna de las dos sea correcta por separado — pero
 * los valores de ancla sí: una caja 4×6×5 mide 120, y eso no admite discusión.
 *
 * Y detrás de cada sólido, `validateBody`. Es el uso para el que existe: una
 * operación que produce un sólido inválido tiene que delatarse en su propio
 * commit, no tres operaciones después.
 */
import { extrudeProfile, extrudeVolume, revolveProfile, revolveVolume } from "./extrude";
import { validateBody } from "./invariants";
import { circleProfile, normalizeProfile, profileArea, rectangle, regularPolygon, vec2 } from "./profile";
import { makeFrame } from "./surfaces";
import { check, checkClose, checkThrows, report } from "./spec-support";
import { bodyIsClosed, eulerCounts, planarBodyArea, planarBodyVolume } from "./topology";
import { vec3, V3_X, V3_Z } from "./vec3";

function audit(label: string, body: ReturnType<typeof extrudeProfile>, expectedGenus: number) {
  const validation = validateBody(body, { requireClosed: true, requirePlanarFaces: true, expectedGenus });
  check(`${label}: invariantes verdes`, validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check(`${label}: cerrado`, bodyIsClosed(body));
  return validation;
}

// --- Extrusión recta ------------------------------------------------------
{
  const options = { profile: { outer: rectangle(4, 6) }, height: 5 };
  const body = extrudeProfile(options);
  audit("caja extruida", body, 0);
  const counts = eulerCounts(body);
  check("extruir un rectángulo da 8 vértices", counts.vertices === 8, `${counts.vertices}`);
  check("12 aristas", counts.edges === 12, `${counts.edges}`);
  check("6 caras", counts.faces === 6, `${counts.faces}`);
  checkClose("volumen = 4·6·5", planarBodyVolume(body), 120);
  checkClose("y la fórmula cerrada dice lo mismo", extrudeVolume(options), 120);
  checkClose("área = 2(24 + 30 + 20)", planarBodyArea(body), 2 * (24 + 30 + 20));
}
{
  // Altura negativa: el sólido va hacia −Z y su volumen sigue siendo POSITIVO.
  const body = extrudeProfile({ profile: { outer: rectangle(2, 2) }, height: -7 });
  audit("extrusión hacia abajo", body, 0);
  checkClose("volumen = 4·7 con signo positivo", planarBodyVolume(body), 28);
}
{
  // Con agujero: género 1 recién salido de la operación.
  const options = { profile: { outer: rectangle(10, 10), inners: [rectangle(4, 4)] }, height: 3 };
  const body = extrudeProfile(options);
  const validation = audit("extrusión con agujero", body, 1);
  check("género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  check("2 lazos interiores (las dos tapas)", validation.counts.rings === 2, `${validation.counts.rings}`);
  checkClose("volumen = (100 − 16)·3", planarBodyVolume(body), 252);
  checkClose("y la fórmula cerrada coincide", extrudeVolume(options), 252);
}
{
  // Un perfil hexagonal en un marco inclinado: la extrusión no depende de que el
  // perfil esté en XY.
  const frame = makeFrame(vec3(1, 2, 3), vec3(1, 1, 1), V3_X);
  const options = { profile: { outer: regularPolygon(6, 4) }, height: 2, frame };
  const body = extrudeProfile(options);
  audit("extrusión en marco inclinado", body, 0);
  const hexArea = (3 * Math.sqrt(3) * 16) / 2;
  checkClose("volumen = área hexágono × 2", planarBodyVolume(body), hexArea * 2, 1e-9);
}

// --- Desmoldeo ------------------------------------------------------------
{
  const options = { profile: { outer: rectangle(4, 4) }, height: 10, draftAngleRad: Math.PI / 12 };
  const body = extrudeProfile(options);
  audit("extrusión con desmoldeo de 15°", body, 0);
  // Las caras laterales de una extrusión con inglete siguen siendo PLANAS: si no
  // lo fueran, `requirePlanarFaces` habría fallado en `audit`.
  const top = 4 + 2 * 10 * Math.tan(Math.PI / 12);
  const expected = (10 / 6) * (16 + 4 * (4 + 10 * Math.tan(Math.PI / 12)) ** 2 + top * top);
  checkClose("volumen del tronco de pirámide", planarBodyVolume(body), expected, 1e-9);
  checkClose("y la regla de Simpson lo clava (el área es cuadrática)", extrudeVolume(options), expected, 1e-9);
  check("la sección de arriba es mayor que la de abajo", top > 4);
}
{
  // Desmoldeo negativo: la pieza se estrecha al subir.
  const options = { profile: { outer: rectangle(10, 10) }, height: 4, draftAngleRad: -Math.PI / 18 };
  const body = extrudeProfile(options);
  audit("desmoldeo negativo", body, 0);
  checkClose("volumen contra la fórmula cerrada", planarBodyVolume(body), extrudeVolume(options), 1e-9);
  check("y es menor que el prisma recto", planarBodyVolume(body) < 400);
}
{
  // Con agujero y desmoldeo a la vez: el agujero se estrecha cuando la pieza
  // engorda, que es lo que hace un molde de verdad.
  const options = {
    profile: { outer: rectangle(20, 20), inners: [rectangle(8, 8)] },
    height: 5,
    draftAngleRad: Math.PI / 36,
  };
  const body = extrudeProfile(options);
  audit("desmoldeo con agujero", body, 1);
  checkClose("volumen contra la fórmula cerrada", planarBodyVolume(body), extrudeVolume(options), 1e-9);
}
checkThrows("un desmoldeo que colapsa el perfil se rechaza", () =>
  extrudeProfile({ profile: { outer: rectangle(2, 2) }, height: 20, draftAngleRad: -Math.PI / 4 }),
);
checkThrows("altura cero se rechaza", () => extrudeProfile({ profile: { outer: rectangle(1, 1) }, height: 0 }));
checkThrows("un desmoldeo de 90° se rechaza", () =>
  extrudeProfile({ profile: { outer: rectangle(1, 1) }, height: 1, draftAngleRad: Math.PI / 2 }),
);

// --- Revolución -----------------------------------------------------------
{
  // Rectángulo apartado del eje, vuelta completa: un tubo. GÉNERO 1.
  const segments = 12;
  const options = {
    profile: { outer: [vec2(2, 0), vec2(5, 0), vec2(5, 3), vec2(2, 3)] },
    segments,
    angleRad: 2 * Math.PI,
  };
  const body = revolveProfile(options);
  const validation = audit("tubo por revolución completa", body, 1);
  check("un tubo tiene género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  // Es EXACTAMENTE un prisma de base dodecagonal con un agujero dodecagonal.
  const ngonArea = (radius: number) => (segments / 2) * Math.sin((2 * Math.PI) / segments) * radius * radius;
  checkClose("volumen = altura · (N-gono exterior − N-gono interior)", planarBodyVolume(body), 3 * (ngonArea(5) - ngonArea(2)), 1e-9);
  checkClose("y la fórmula cerrada de la revolución coincide", revolveVolume(options), 3 * (ngonArea(5) - ngonArea(2)), 1e-9);
}
{
  // Perfil que TOCA el eje: cono. Los puntos de radio cero se sueldan en un
  // vértice único y los cuadriláteros laterales se vuelven triángulos solos.
  const segments = 24;
  const options = { profile: { outer: [vec2(0, 0), vec2(3, 0), vec2(0, 7)] }, segments };
  const body = revolveProfile(options);
  audit("cono por revolución", body, 0);
  const expected = (segments / 2) * Math.sin((2 * Math.PI) / segments) * ((7 * 9) / 3);
  checkClose("volumen del cono facetado", planarBodyVolume(body), expected, 1e-9);
  checkClose("y la fórmula cerrada coincide", revolveVolume(options), expected, 1e-9);
  check("el cono facetado mide menos que πR²h/3", planarBodyVolume(body) < (Math.PI * 9 * 7) / 3);
}
{
  // Revolución PARCIAL: se cierra con dos tapas planas.
  const segments = 9;
  const angle = Math.PI / 2;
  const options = { profile: { outer: [vec2(1, 0), vec2(4, 0), vec2(4, 2), vec2(1, 2)] }, segments, angleRad: angle };
  const body = revolveProfile(options);
  audit("cuarto de tubo", body, 0);
  const expected = (segments / 2) * Math.sin(angle / segments) * 2 * (16 - 1);
  checkClose("volumen del sector facetado", planarBodyVolume(body), expected, 1e-9);
  checkClose("y la fórmula cerrada coincide", revolveVolume(options), expected, 1e-9);
  check("un cuarto de tubo NO tiene agujero pasante: género 0", eulerCounts(body).genus === 0);
}
{
  // Convergencia a Pappus. Es la comprobación de que el factor sinΔ/Δ es lo
  // ÚNICO que separa el facetado del sólido exacto.
  const profile = normalizeProfile({ outer: [vec2(3, -1), vec2(5, -1), vec2(5, 1), vec2(3, 1)] });
  const centroidRadius = 4;
  const pappus = 2 * Math.PI * centroidRadius * profileArea(profile);
  let previousError = Infinity;
  for (const segments of [8, 32, 128]) {
    const body = revolveProfile({ profile: { outer: profile.outer }, segments });
    const error = Math.abs(planarBodyVolume(body) - pappus) / pappus;
    check(`revolución con ${segments} facetas: el error baja`, error < previousError, `${error} ≥ ${previousError}`);
    previousError = error;
  }
  check("con 128 facetas el error de Pappus baja del 0,1 %", previousError < 1e-3, `${previousError}`);
}
{
  // Sólido de revolución de un perfil circular: un toro facetado. Género 1, y
  // volumen contra Pappus 2π²Rr².
  const options = {
    profile: { outer: circleProfile(1, 24).map((point) => vec2(point.x + 4, point.y)) },
    segments: 48,
  };
  const body = revolveProfile(options);
  const validation = audit("toro facetado", body, 1);
  check("un toro tiene género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  const pappus = 2 * Math.PI * Math.PI * 4 * 1;
  const error = Math.abs(planarBodyVolume(body) - pappus) / pappus;
  check("el volumen se acerca a 2π²Rr² por debajo del 0,5 %", error < 5e-3, `error ${error}`);
}
checkThrows("un perfil con radio negativo se rechaza", () =>
  revolveProfile({ profile: { outer: [vec2(-1, 0), vec2(2, 0), vec2(2, 2)] } }),
);
checkThrows("revolución de ángulo cero se rechaza", () =>
  revolveProfile({ profile: { outer: [vec2(1, 0), vec2(2, 0), vec2(2, 2)] }, angleRad: 0 }),
);
checkThrows("más de una vuelta se rechaza", () =>
  revolveProfile({ profile: { outer: [vec2(1, 0), vec2(2, 0), vec2(2, 2)] }, angleRad: 7 }),
);
{
  // El marco elige el eje: revolucionar alrededor de X en vez de Z.
  const frame = makeFrame(vec3(0, 0, 0), V3_X, V3_Z);
  const options = { profile: { outer: [vec2(1, 0), vec2(3, 0), vec2(3, 2), vec2(1, 2)] }, segments: 16, frame };
  const body = revolveProfile(options);
  audit("revolución alrededor de X", body, 1);
  checkClose("volumen contra la fórmula cerrada", planarBodyVolume(body), revolveVolume(options), 1e-9);
}

report("brep/extrude", 50);
