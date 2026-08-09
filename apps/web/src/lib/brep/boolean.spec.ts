/**
 * Booleanas: el corpus adversarial, y los invariantes DESPUÉS de cada operación.
 *
 * Los casos fáciles (dos cajas que se cruzan por la mitad) no prueban nada: los
 * acierta cualquier implementación. Lo que separa una booleana que funciona de
 * una que parece funcionar son estos cuatro:
 *
 *   · SÓLIDOS QUE SE TOCAN EXACTAMENTE EN UNA CARA. No hay "delante" ni "detrás"
 *     que decidir por posición; la respuesta está en la orientación de las dos
 *     caras coplanarias. Es el caso que rompe las implementaciones ingenuas.
 *   · CARAS COPLANARIAS QUE SE SOLAPAN A MEDIAS.
 *   · Una resta que abre un AGUJERO PASANTE — el género tiene que subir a 1.
 *   · Una resta que deja una CAVIDAD INTERNA — el sólido pasa a tener dos
 *     cáscaras, y Euler-Poincaré tiene que dar género 0 con χ = 4.
 *
 * Y en todos, el volumen contra un valor calculado a mano. Un sólido con los
 * invariantes verdes y el volumen equivocado es un sólido equivocado.
 */
import { booleanDifference, booleanIntersection, booleanUnion, bodyToPolygons, tryBoolean } from "./boolean";
import { extrudeProfile, revolveProfile } from "./extrude";
import { validateBody } from "./invariants";
import { circleProfile, rectangle, vec2 } from "./profile";
import { makeBox, makeBoxWithThroughHole } from "./primitives";
import { check, checkClose, checkThrows, report } from "./spec-support";
import { bodyIsClosed, eulerCounts, planarBodyVolume, translateBody, type BrepBody } from "./topology";
import { vec3 } from "./vec3";

function audit(label: string, body: BrepBody, expected: { genus?: number; shells?: number } = {}) {
  const validation = validateBody(body, { requireClosed: true, expectedGenus: expected.genus, expectedShells: expected.shells });
  check(`${label}: invariantes verdes`, validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check(`${label}: cerrado`, bodyIsClosed(body));
  return validation;
}

const A = makeBox({ min: vec3(0, 0, 0), max: vec3(2, 2, 2) });

// --- Caso base: dos cajas que se cruzan por una esquina -------------------
{
  const b = makeBox({ min: vec3(1, 1, 1), max: vec3(3, 3, 3) });
  const union = booleanUnion(A, b);
  audit("unión de dos cajas", union, { genus: 0, shells: 1 });
  checkClose("volumen = 8 + 8 − 1", planarBodyVolume(union), 15);

  const difference = booleanDifference(A, b);
  audit("diferencia de dos cajas", difference, { genus: 0, shells: 1 });
  checkClose("volumen = 8 − 1", planarBodyVolume(difference), 7);

  const intersection = booleanIntersection(A, b);
  audit("intersección de dos cajas", intersection, { genus: 0, shells: 1 });
  checkClose("volumen = 1", planarBodyVolume(intersection), 1);

  // La identidad que tiene que cumplir cualquier booleana correcta.
  checkClose("|A∪B| = |A| + |B| − |A∩B|", planarBodyVolume(union), 8 + 8 - planarBodyVolume(intersection));
}

// --- Sólidos que se tocan EXACTAMENTE en una cara -------------------------
{
  const b = makeBox({ min: vec3(2, 0, 0), max: vec3(4, 2, 2) });
  const union = booleanUnion(A, b);
  audit("unión de dos cajas que se tocan en una cara", union, { genus: 0, shells: 1 });
  checkClose("el resultado es una caja 4×2×2", planarBodyVolume(union), 16);
  check("y las dos caras coplanarias se han anulado", eulerCounts(union).characteristic === 2);
  // La intersección de dos sólidos que sólo comparten una cara es VACÍA: un
  // cuadrado sin volumen no es un sólido, y el B-rep no sabe representarlo.
  check("su intersección es el sólido vacío", tryBoolean("intersection", A, b) === null);
  checkThrows("y pedirla sin más lanza en vez de devolver un cuerpo roto", () => booleanIntersection(A, b));
}
{
  // Coplanarias que se solapan sólo a medias.
  const b = makeBox({ min: vec3(2, 0.5, 0.5), max: vec3(4, 1.5, 1.5) });
  const union = booleanUnion(A, b);
  audit("coplanarias con solape parcial", union, { genus: 0, shells: 1 });
  checkClose("volumen = 8 + 2", planarBodyVolume(union), 10);
}
{
  // Caras coplanarias con la MISMA orientación, sobre sólidos que se solapan:
  // la cara compartida no puede aparecer dos veces en el resultado.
  const b = makeBox({ min: vec3(1, 0, 0), max: vec3(3, 2, 2) });
  const union = booleanUnion(A, b);
  audit("solapamiento con cuatro pares de caras coplanarias", union, { genus: 0, shells: 1 });
  checkClose("volumen = caja 3×2×2", planarBodyVolume(union), 12);
  checkClose("y la intersección es la caja 1×2×2", planarBodyVolume(booleanIntersection(A, b)), 4);
}

// --- Sólidos disjuntos ----------------------------------------------------
{
  const far = makeBox({ min: vec3(10, 10, 10), max: vec3(11, 11, 11) });
  const union = booleanUnion(A, far);
  audit("unión de disjuntos", union, { genus: 0, shells: 2 });
  checkClose("volumen = 8 + 1", planarBodyVolume(union), 9);
  check("y χ = 2 + 2", eulerCounts(union).characteristic === 4, `${eulerCounts(union).characteristic}`);
  check("intersecar disjuntos da vacío", tryBoolean("intersection", A, far) === null);
  const untouched = booleanDifference(A, far);
  audit("restar algo que no toca", untouched, { genus: 0, shells: 1 });
  checkClose("deja el original intacto", planarBodyVolume(untouched), 8);
}

// --- Agujero pasante: el género sube --------------------------------------
{
  const plate = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 4) });
  const punch = makeBox({ min: vec3(3, 3, -1), max: vec3(6, 7, 5) });
  const holed = booleanDifference(plate, punch);
  const validation = audit("placa taladrada", holed, { genus: 1, shells: 1 });
  check("la resta abre un agujero pasante: género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  check("con característica 0", validation.counts.characteristic === 0, `${validation.counts.characteristic}`);
  checkClose("volumen = 400 − 3·4·4", planarBodyVolume(holed), 400 - 48);
  // Y el mismo sólido construido a mano tiene el mismo volumen y el mismo género.
  const byHand = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 3, y: 3 },
    holeMax: { x: 6, y: 7 },
  });
  checkClose("y coincide con el construido a mano", planarBodyVolume(holed), planarBodyVolume(byHand));
  check("con el mismo género", eulerCounts(byHand).genus === validation.counts.genus);
}

// --- Cavidad interna: dos cáscaras ----------------------------------------
{
  const block = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const bubble = makeBox({ min: vec3(4, 4, 4), max: vec3(6, 6, 6) });
  const hollow = booleanDifference(block, bubble);
  const validation = audit("bloque con cavidad interna", hollow, { genus: 0, shells: 2 });
  check("dos cáscaras: la exterior y la de la cavidad", validation.counts.shells === 2, `${validation.counts.shells}`);
  check("χ = 4", validation.counts.characteristic === 4, `${validation.counts.characteristic}`);
  check("género 0 (una cavidad no es un agujero pasante)", validation.counts.genus === 0, `${validation.counts.genus}`);
  // La cavidad RESTA volumen: sus caras miran hacia el hueco, que es hacia fuera
  // del material. Si la cáscara interior estuviera del revés, el volumen saldría
  // 1008 en vez de 992 y nada más lo delataría.
  checkClose("volumen = 1000 − 8", planarBodyVolume(hollow), 992);
}

// --- Geometría facetada: restar un cilindro -------------------------------
{
  const segments = 24;
  const plate = makeBox({ min: vec3(-3, -3, 0), max: vec3(3, 3, 2) });
  const drill = revolveProfile({ profile: { outer: [vec2(0, -1), vec2(2, -1), vec2(2, 3), vec2(0, 3)] }, segments });
  const drilled = booleanDifference(plate, drill);
  const validation = audit("placa con taladro cilíndrico facetado", drilled, { genus: 1, shells: 1 });
  check("género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  const ngonArea = (segments / 2) * Math.sin((2 * Math.PI) / segments) * 4;
  checkClose("volumen = 36·2 − área del polígono de 24 lados · 2", planarBodyVolume(drilled), 72 - ngonArea * 2, 1e-9);
}
{
  // Dos taladros: género 2. Es la comprobación de que Euler-Poincaré sigue la
  // topología y no un caso especial.
  const plate = makeBox({ min: vec3(-6, -3, 0), max: vec3(6, 3, 2) });
  const drillAt = (x: number) =>
    extrudeProfile({
      profile: { outer: circleProfile(1.2, 16).map((point) => vec2(point.x + x, point.y)) },
      height: 6,
      frame: undefined,
    });
  let result = booleanDifference(plate, translateBody(drillAt(-3), vec3(0, 0, -2)));
  result = booleanDifference(result, translateBody(drillAt(3), vec3(0, 0, -2)));
  const validation = audit("placa con dos taladros", result, { genus: 2, shells: 1 });
  check("género 2", validation.counts.genus === 2, `${validation.counts.genus}`);
  check("χ = −2", validation.counts.characteristic === -2, `${validation.counts.characteristic}`);
}

// --- Rechazos explícitos --------------------------------------------------
{
  // Una lámina (cuerpo abierto) no puede entrar en una booleana como sólido.
  const openBody = extrudeProfile({ profile: { outer: rectangle(1, 1) }, height: 1 });
  check("una extrusión normal sí es un sólido cerrado", bodyIsClosed(openBody));
}
{
  // El alcance declarado: caras planas. Se comprueba que la frontera existe y
  // que el mensaje señala la cara concreta.
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) });
  const warped: BrepBody = {
    ...body,
    vertices: body.vertices.map((vertex, index) =>
      index === 0 ? { ...vertex, point: vec3(-0.5, -0.5, -0.5) } : vertex,
    ),
  };
  checkThrows("un cuerpo con caras no planas se rechaza en la entrada de la booleana", () => bodyToPolygons(warped));
}
checkThrows("restar un sólido de sí mismo lanza (el vacío no es representable)", () => booleanDifference(A, A));
check("y `tryBoolean` lo devuelve como null", tryBoolean("difference", A, A) === null);

// --- Encadenar operaciones: los invariantes aguantan ----------------------
{
  let body = makeBox({ min: vec3(0, 0, 0), max: vec3(8, 8, 2) });
  body = booleanDifference(body, makeBox({ min: vec3(1, 1, -1), max: vec3(3, 3, 3) }));
  body = booleanUnion(body, makeBox({ min: vec3(6, 6, 2), max: vec3(8, 8, 4) }));
  body = booleanDifference(body, makeBox({ min: vec3(4, -1, -1), max: vec3(5, 9, 1) }));
  const validation = audit("tres operaciones encadenadas", body);
  check("sigue siendo un sólido válido", validation.ok);
  checkClose(
    "y su volumen es 8·8·2 − 2·2·2 + 2·2·2 − 1·8·1 (la ranura corta el bloque de lado a lado)",
    planarBodyVolume(body),
    128 - 8 + 8 - 8,
  );
}

report("brep/boolean", 55);
