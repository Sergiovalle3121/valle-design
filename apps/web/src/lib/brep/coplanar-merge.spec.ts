/**
 * Fusión de caras coplanarias: las cifras exactas, antes y después.
 *
 * Una fusión sólo vale si NO cambia el sólido. Por eso cada caso se mide cuatro
 * veces —caras, aristas, volumen y validador— y no sólo por el recuento de
 * caras: quitar caras es fácil, quitarlas sin mover ni un milímetro de material
 * es lo difícil. El volumen se compara con igualdad EXACTA sobre la
 * integración de `planarBodyVolume`: la fusión no crea ni destruye vértices del
 * contorno, así que la suma de Newell recorre los mismos puntos y no puede
 * cambiar ni un ULP relevante.
 *
 * Y con el mismo peso, los DOS controles negativos: un cilindro de 48 lados no
 * puede perder ni una de sus caras laterales —son casi coplanarias y no lo
 * son—, y un sólido hueco tiene que seguir teniendo sus dos cáscaras. Una
 * fusión que se pasa de lista es peor que la fragmentación que venía a
 * arreglar.
 */
import { booleanDifference, booleanUnion } from "./boolean";
import { buildBody, type FaceSpec } from "./body-builder";
import { canonicalPlane, mergeCoplanarFaces, __coplanarTestables } from "./coplanar-merge";
import { extrudeProfile } from "./extrude";
import { validateBody } from "./invariants";
import { circleProfile } from "./profile";
import { makeBox, prismSideFaces } from "./primitives";
import { check, checkClose, report } from "./spec-support";
import { emptyBody, eulerCounts, planarBodyArea, planarBodyVolume, type BrepBody } from "./topology";
import { vec3, type Vec3 } from "./vec3";

const { singleRun, collinearBetween } = __coplanarTestables;

/** La unión que el índice del kernel señalaba como el caso fragmentado. */
function dosCajasContiguas(): BrepBody {
  return booleanUnion(
    makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 50) }),
    makeBox({ min: vec3(100, 0, 0), max: vec3(200, 100, 50) }),
  );
}

/* ── El caso medido: dos cajas contiguas ──────────────────────────────────── */
{
  const fragmentado = dosCajasContiguas();
  check("la unión llega fragmentada: 20 caras", fragmentado.faces.length === 20, `fueron ${fragmentado.faces.length}`);
  check("y 30 aristas", fragmentado.edges.length === 30, `fueron ${fragmentado.edges.length}`);
  checkClose("con el volumen de la caja 200×100×50", planarBodyVolume(fragmentado), 1_000_000, 1e-6);

  const merge = mergeCoplanarFaces(fragmentado);
  check("la fusión declara haber cambiado el cuerpo", merge.changed);
  check("y encuentra los SEIS planos canónicos", merge.planes === 6, `fueron ${merge.planes}`);
  check("de 20 caras quedan 6", merge.faces.after === 6, `fueron ${merge.faces.after}`);
  check("de 30 aristas quedan 12", merge.edges.after === 12, `fueron ${merge.edges.after}`);
  check("y de 12 vértices quedan 8", merge.vertices.after === 8, `fueron ${merge.vertices.after}`);
  check("los cuatro vértices de x = 100 se disuelven", merge.dissolved === 4, `fueron ${merge.dissolved}`);
  check("sin descartar ninguna fusión", merge.rejected === 0, `hubo ${merge.rejected}`);
  check("el informe cuenta las dos caras antes", merge.faces.before === 20 && merge.edges.before === 30);

  checkClose("el volumen sigue siendo 1 000 000", planarBodyVolume(merge.body), 1_000_000, 1e-6);
  check(
    "y es EXACTAMENTE el de antes: la fusión no mueve material",
    planarBodyVolume(merge.body) === planarBodyVolume(fragmentado),
    `${planarBodyVolume(fragmentado)} → ${planarBodyVolume(merge.body)}`,
  );
  checkClose("el área también, 2·(200·100) + 2·(200·50) + 2·(100·50)", planarBodyArea(merge.body), 40_000 + 20_000 + 10_000, 1e-6);

  const validation = validateBody(merge.body, {
    requireClosed: true,
    requirePlanarFaces: true,
    expectedGenus: 0,
    expectedShells: 1,
  });
  check("el cuerpo fundido sigue siendo válido", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  const counts = eulerCounts(merge.body);
  check("χ = 2", counts.characteristic === 2, `fue ${counts.characteristic}`);
  check("G = 0", counts.genus === 0, `fue ${counts.genus}`);
  check("una sola cáscara", counts.shells === 1);
  check("y ninguna cara con agujeros: R = 0", counts.rings === 0);

  const otraVez = mergeCoplanarFaces(merge.body);
  check("volver a fundir no encuentra nada: la operación es idempotente", !otraVez.changed);
  check("y devuelve el MISMO cuerpo, sin copiarlo", otraVez.body === merge.body);
}

/* ── Control negativo 1: el cilindro de 48 lados ──────────────────────────── */
{
  const cilindro = extrudeProfile({ profile: { outer: circleProfile(50, 48) }, height: 100 });
  check("el cilindro llega con 48 caras laterales y dos tapas", cilindro.faces.length === 50, `fueron ${cilindro.faces.length}`);
  const merge = mergeCoplanarFaces(cilindro);
  check("y la fusión NO lo toca: 48 planos laterales distintos no son uno solo", !merge.changed);
  check("cada cara conserva su plano: 50 planos canónicos", merge.planes === 50, `fueron ${merge.planes}`);
  check("las 50 caras siguen ahí", merge.body.faces.length === 50, `fueron ${merge.body.faces.length}`);
  check("ninguna fusión aplicada", merge.merges === 0);
  check("y ningún vértice disuelto", merge.dissolved === 0);
  check("el cuerpo devuelto es el de entrada, sin copiar", merge.body === cilindro);
  checkClose("el volumen no se ha rozado", planarBodyVolume(merge.body), planarBodyVolume(cilindro), 0);

  // El ángulo entre dos laterales contiguas: 7.5°, ocho órdenes de magnitud por
  // encima de la tolerancia angular. La cifra se comprueba para que nadie
  // afloje la tolerancia sin darse cuenta de lo que está tocando.
  const a = canonicalPlane(cilindro, 2);
  const b = canonicalPlane(cilindro, 3);
  const angulo = Math.acos(Math.max(-1, Math.min(1, a.normal.x * b.normal.x + a.normal.y * b.normal.y + a.normal.z * b.normal.z)));
  checkClose("dos laterales contiguas separan 2π/48 rad", angulo, (2 * Math.PI) / 48, 1e-9);
}

/* ── Control negativo 2: el sólido hueco conserva sus dos cáscaras ────────── */
{
  const hueco = booleanDifference(
    makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 100) }),
    makeBox({ min: vec3(25, 25, 25), max: vec3(75, 75, 75) }),
  );
  check("la resta interior deja dos cáscaras", hueco.shells.length === 2, `fueron ${hueco.shells.length}`);
  check("y llega fragmentada en 44 caras", hueco.faces.length === 44, `fueron ${hueco.faces.length}`);

  const merge = mergeCoplanarFaces(hueco);
  check("quedan 12 caras: seis por cáscara", merge.faces.after === 12, `fueron ${merge.faces.after}`);
  check("y 24 aristas", merge.edges.after === 24, `fueron ${merge.edges.after}`);
  check("S = 2 se conserva: la cavidad no se ha soldado con la piel", merge.body.shells.length === 2, `fueron ${merge.body.shells.length}`);
  checkClose("el volumen sigue siendo 100³ − 50³", planarBodyVolume(merge.body), 1_000_000 - 125_000, 1e-6);
  check("exactamente el mismo de antes", planarBodyVolume(merge.body) === planarBodyVolume(hueco));
  const counts = eulerCounts(merge.body);
  check("χ = 4 y G = 0, como manda Euler-Poincaré con dos cáscaras", counts.characteristic === 4 && counts.genus === 0, JSON.stringify(counts));
  const validation = validateBody(merge.body, { requireClosed: true, requirePlanarFaces: true, expectedShells: 2, expectedGenus: 0 });
  check("y el cuerpo hueco fundido es válido", validation.ok, validation.violations.map((v) => v.message).join(" | "));
}

/* ── Los lazos interiores viajan como agujeros ────────────────────────────── */
{
  /**
   * Una placa con agujero pasante cuyas dos tapas llegan PARTIDAS en x = 10, y
   * la mitad que lleva el agujero se lo lleva como lazo interior. Fundir las
   * dos mitades tiene que devolver la caja-con-agujero canónica: 10 caras, dos
   * anillos, género 1. Es la prueba de que el agujero no se pierde ni se
   * convierte en contorno.
   */
  const points: Vec3[] = [
    vec3(0, 0, 0), vec3(20, 0, 0), vec3(20, 10, 0), vec3(0, 10, 0),
    vec3(0, 0, 5), vec3(20, 0, 5), vec3(20, 10, 5), vec3(0, 10, 5),
    vec3(3, 3, 0), vec3(7, 3, 0), vec3(7, 7, 0), vec3(3, 7, 0),
    vec3(3, 3, 5), vec3(7, 3, 5), vec3(7, 7, 5), vec3(3, 7, 5),
    vec3(10, 0, 0), vec3(10, 10, 0), vec3(10, 0, 5), vec3(10, 10, 5),
  ];
  const faces: FaceSpec[] = [
    { outer: [0, 3, 17, 16], inners: [[8, 9, 10, 11]] }, // tapa inferior, mitad con agujero
    { outer: [16, 17, 2, 1] }, //                            tapa inferior, mitad maciza
    { outer: [4, 18, 19, 7], inners: [[15, 14, 13, 12]] }, // tapa superior, mitad con agujero
    { outer: [18, 5, 6, 19] }, //                            tapa superior, mitad maciza
    ...prismSideFaces([0, 16, 1, 2, 17, 3], [4, 18, 5, 6, 19, 7]),
    ...prismSideFaces([8, 9, 10, 11], [12, 13, 14, 15], true),
  ];
  const partida = buildBody(points, faces);
  check("la placa partida llega con 14 caras", partida.faces.length === 14, `fueron ${partida.faces.length}`);
  check("y con sus dos anillos ya declarados", eulerCounts(partida).rings === 2);

  const merge = mergeCoplanarFaces(partida);
  check("fundida queda en 10 caras: la caja-con-agujero canónica", merge.faces.after === 10, `fueron ${merge.faces.after}`);
  check("con 24 aristas y 16 vértices", merge.edges.after === 24 && merge.vertices.after === 16, `${merge.edges.after}/${merge.vertices.after}`);
  const counts = eulerCounts(merge.body);
  check("los DOS anillos siguen ahí: R = 2", counts.rings === 2, `fue ${counts.rings}`);
  check("χ = 0 y G = 1: el agujero pasante sobrevive a la fusión", counts.characteristic === 0 && counts.genus === 1, JSON.stringify(counts));
  checkClose("y el volumen es 20·10·5 − 4·4·5", planarBodyVolume(merge.body), 1000 - 80, 1e-9);
  const validation = validateBody(merge.body, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 1, expectedShells: 1 });
  check("la placa fundida es válida", validation.ok, validation.violations.map((v) => v.message).join(" | "));
}

/* ── Lo que se DESCARTA en vez de forzarse ────────────────────────────────── */
{
  // Una placa con agujero salida de una resta: las dos mitades de cada tapa se
  // tocan por DOS cadenas separadas (a un lado y a otro del agujero), y cerrar
  // ese anillo produciría una cara con un lazo interior nuevo. La fusión lo
  // rechaza, lo CUENTA, y el resultado sigue siendo un sólido válido de género 1.
  const placa = booleanDifference(
    makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 20) }),
    makeBox({ min: vec3(30, 30, -10), max: vec3(70, 70, 30) }),
  );
  const merge = mergeCoplanarFaces(placa);
  check("hubo fusiones descartadas y se cuentan", merge.rejected > 0, `fueron ${merge.rejected}`);
  check("aun así la placa baja de 36 caras a 12", merge.faces.before === 36 && merge.faces.after === 12, `${merge.faces.before} → ${merge.faces.after}`);
  checkClose("con el volumen intacto: 100·100·20 − 40·40·20", planarBodyVolume(merge.body), 200_000 - 32_000, 1e-6);
  const counts = eulerCounts(merge.body);
  check("y sigue siendo de género 1", counts.genus === 1, JSON.stringify(counts));
  const validation = validateBody(merge.body, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 1 });
  check("un descarte deja el cuerpo válido: no se fuerza nada", validation.ok, validation.violations.map((v) => v.message).join(" | "));
}

/* ── Más geometría, mismo contrato ────────────────────────────────────────── */
{
  let ele = booleanUnion(makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 50) }), makeBox({ min: vec3(100, 0, 0), max: vec3(200, 100, 50) }));
  ele = booleanUnion(ele, makeBox({ min: vec3(0, 100, 0), max: vec3(100, 200, 50) }));
  const merge = mergeCoplanarFaces(ele);
  check("una L de tres cajas queda en 8 caras: seis del contorno en planta, más tapa y suelo", merge.faces.after === 8, `fueron ${merge.faces.after}`);
  check("y 18 aristas", merge.edges.after === 18, `fueron ${merge.edges.after}`);
  checkClose("volumen 3 × 500 000", planarBodyVolume(merge.body), 1_500_000, 1e-6);
  check("el mismo, exacto", planarBodyVolume(merge.body) === planarBodyVolume(ele));
  const validation = validateBody(merge.body, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 0, expectedShells: 1 });
  check("la L fundida es válida", validation.ok, validation.violations.map((v) => v.message).join(" | "));
}
{
  let fila = booleanUnion(makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) }), makeBox({ min: vec3(10, 0, 0), max: vec3(20, 10, 10) }));
  fila = booleanUnion(fila, makeBox({ min: vec3(20, 0, 0), max: vec3(30, 10, 10) }));
  const merge = mergeCoplanarFaces(fila);
  check("tres cajas en fila vuelven a ser UNA caja: 6 caras y 12 aristas", merge.faces.after === 6 && merge.edges.after === 12, `${merge.faces.after}/${merge.edges.after}`);
  check("con ocho vértices, no dieciséis", merge.vertices.after === 8, `fueron ${merge.vertices.after}`);
  checkClose("volumen 30 × 10 × 10", planarBodyVolume(merge.body), 3000, 1e-9);
}

/* ── Una caja sola no tiene nada que fundir ───────────────────────────────── */
{
  const caja = makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 50) });
  const merge = mergeCoplanarFaces(caja);
  check("una caja limpia no cambia", !merge.changed);
  check("y el informe lo dice con sus cifras: 6 caras antes y 6 después", merge.faces.before === 6 && merge.faces.after === 6);
  check("seis planos canónicos, ninguna pareja", merge.planes === 6 && merge.merges === 0);
  check("el cuerpo vacío tampoco", !mergeCoplanarFaces(emptyBody()).changed);
}

/* ── El plano canónico distingue los dos lados de una pared ───────────────── */
{
  const caja = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const planos = Array.from({ length: caja.faces.length }, (_, face) => canonicalPlane(caja, face));
  const arriba = planos.find((plano) => plano.normal.z > 0.5);
  const abajo = planos.find((plano) => plano.normal.z < -0.5);
  check("la tapa mira a +Z a distancia 10", arriba !== undefined && Math.abs(arriba.distance - 10) < 1e-9, JSON.stringify(arriba));
  check("el suelo mira a −Z a distancia 0", abajo !== undefined && Math.abs(abajo.distance) < 1e-9, JSON.stringify(abajo));
  // Dos caras sobre el MISMO plano geométrico con normales opuestas —los dos
  // lados de una pared delgada— tienen firmas distintas, así que nunca caen en
  // el mismo grupo. Fundirlas sería inventar material.
  const anverso = canonicalPlane(caja, 0);
  const reverso = { normal: { x: -anverso.normal.x, y: -anverso.normal.y, z: -anverso.normal.z }, distance: -anverso.distance };
  check(
    "la misma superficie vista del otro lado tiene otra firma",
    reverso.normal.x !== anverso.normal.x || reverso.normal.y !== anverso.normal.y || reverso.normal.z !== anverso.normal.z,
  );
}

/* ── Las piezas sueltas ───────────────────────────────────────────────────── */
{
  check("un tramo simple se reconoce", JSON.stringify(singleRun([false, true, true, false])) === JSON.stringify({ start: 1, length: 2 }));
  check("y también el que da la vuelta por el final del lazo", JSON.stringify(singleRun([true, false, false, true])) === JSON.stringify({ start: 3, length: 2 }));
  check("sin nada marcado no hay tramo", singleRun([false, false, false]) === null);
  check("todo marcado tampoco: la cara desaparecería", singleRun([true, true, true]) === null);
  check("dos tramos separados se rechazan: la cadena está partida", singleRun([true, false, true, false]) === null);

  check("un punto a mitad del segmento se disuelve", collinearBetween(vec3(0, 0, 0), vec3(5, 0, 0), vec3(10, 0, 0), 1e-7));
  check("uno fuera del segmento NO: quitarlo cambiaría la forma", !collinearBetween(vec3(0, 0, 0), vec3(15, 0, 0), vec3(10, 0, 0), 1e-7));
  check("y uno que se sale del eje tampoco", !collinearBetween(vec3(0, 0, 0), vec3(5, 1, 0), vec3(10, 0, 0), 1e-7));
  check("un desvío menor que la tolerancia sí", collinearBetween(vec3(0, 0, 0), vec3(5, 1e-9, 0), vec3(10, 0, 0), 1e-7));
}

report("brep/coplanar-merge", 60);
