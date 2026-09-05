/**
 * SHELL: el recipiente, medido; y cada rechazo, con su motivo.
 *
 * Vaciar no se prueba mirando que «salga algo hueco». Un vaciado sólo vale si
 * el material que queda es EXACTAMENTE el que se pidió, y eso son cuatro
 * medidas en cada caso: volumen contra la cifra de papel, cuerpo cerrado, DOS
 * cáscaras —la piel y el hueco— y el validador de invariantes en verde con sus
 * cuentas de Euler. Tres de las cuatro pueden salir bien con un cuerpo roto;
 * las cuatro juntas, no.
 *
 * Y con el mismo peso, los rechazos. Una operación que sólo se ofrece sobre
 * cuerpos convexos y no COMPRUEBA la convexidad es una operación que devuelve
 * basura en silencio el día que alguien vacía una L. Aquí cada límite dicho en
 * la cabecera de `shell.ts` tiene su caso: el cóncavo, el espesor que se come
 * la pieza, el vértice cuyos planos no concurren y el cuerpo fragmentado que
 * primero hay que limpiar.
 */
import { booleanUnion } from "./boolean";
import { buildBody } from "./body-builder";
import { mergeCoplanarFaces } from "./coplanar-merge";
import { extrudeProfile } from "./extrude";
import { validateBody } from "./invariants";
import { makeBox, makeTetrahedron } from "./primitives";
import { regularPolygon } from "./profile";
import {
  bodyConvexity,
  maxShellThickness,
  offsetInnerBody,
  shellBody,
  shellLimit,
  __shellTestables,
} from "./shell";
import { check, checkClose, report } from "./spec-support";
import { bodyIsClosed, connectedComponentCount, eulerCounts, planarBodyVolume, type BrepBody } from "./topology";
import { v3Length, v3Sub, vec3 } from "./vec3";

const { solve3, distinctPlanes, facePlanes, vertexFaces } = __shellTestables;

/** Pirámide recta de base rectangular `a × b` y altura `h`, ápice sobre el centro. */
function pyramid(a: number, b: number, h: number): BrepBody {
  return buildBody(
    [vec3(0, 0, 0), vec3(a, 0, 0), vec3(a, b, 0), vec3(0, b, 0), vec3(a / 2, b / 2, h)],
    [{ outer: [0, 3, 2, 1] }, { outer: [0, 1, 4] }, { outer: [1, 2, 4] }, { outer: [2, 3, 4] }, { outer: [3, 0, 4] }],
  );
}

/** Prisma regular de `n` lados y circunradio `r`: el «cilindro» del kernel facetado. */
function prism(n: number, r: number, height: number): BrepBody {
  return extrudeProfile({ profile: { outer: regularPolygon(n, r) }, height });
}

/* ── La caja de 100 vaciada 10: la cifra de papel ─────────────────────────── */
{
  const caja = makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 100) });
  const result = shellBody(caja, 10);
  check("la caja convexa se vacía", result.ok, result.ok ? "" : result.reason);
  if (result.ok) {
    const { report: shell } = result;
    checkClose("el material que queda es 10⁶ − 80³ = 488 000", shell.volume.shell, 1_000_000 - 512_000, 1e-6);
    checkClose("y el hueco es exactamente la caja de 80", shell.volume.inner, 512_000, 1e-6);
    check("el sólido vaciado está CERRADO", bodyIsClosed(shell.body));
    check("y tiene DOS cáscaras: la piel y el hueco", connectedComponentCount(shell.body) === 2, `fueron ${connectedComponentCount(shell.body)}`);
    check("el informe lo dice igual", shell.shells === 2);

    const counts = eulerCounts(shell.body);
    check("V = 36", counts.vertices === 36, `fue ${counts.vertices}`);
    check("E = 76", counts.edges === 76, `fue ${counts.edges}`);
    check("F = 44", counts.faces === 44, `fue ${counts.faces}`);
    check("χ = 4", counts.characteristic === 4, `fue ${counts.characteristic}`);
    check("S = 2", counts.shells === 2, `fue ${counts.shells}`);
    check("y ninguna cara con agujeros: R = 0", counts.rings === 0, `fue ${counts.rings}`);
    check("género 0 en cada cáscara: G = S − χ/2 = 0", counts.genus === 0, `fue ${counts.genus}`);

    const validation = validateBody(shell.body, { requireClosed: true, requirePlanarFaces: true, expectedShells: 2 });
    check("el validador de invariantes lo da por bueno", validation.ok, validation.violations.map((v) => v.message).join(" | "));

    // La topología del interior es la MISMA del exterior: no se inventó una
    // cara. Es lo que hace que el interior nazca válido sin repararlo.
    check("el interior conserva las 6 caras del exterior", shell.interior.faces.length === caja.faces.length);
    check("y sus 12 aristas y 8 vértices", shell.interior.edges.length === caja.edges.length && shell.interior.vertices.length === caja.vertices.length);
    check("los ocho vértices se resolvieron con tres planos exactos", shell.exact === 8 && shell.leastSquares === 0, `${shell.exact}/${shell.leastSquares}`);
    check("el informe conserva el recuento del exterior", shell.faces.outer === 6 && shell.edges.outer === 12 && shell.vertices.outer === 8);
    checkClose("y el del exterior sin tocar: 10⁶", shell.volume.outer, 1_000_000, 1e-6);
    checkClose("el espesor que llevaba", shell.thickness, 10, 0);
    checkClose("y el máximo que admitía: la mitad de su espesor mínimo", shell.maxThickness, 50, 1e-9);
  }
}

/* ── El límite del espesor: calculado, no adivinado ───────────────────────── */
{
  const caja = makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 100) });
  checkClose("una caja de 100 admite menos de 50 de espesor", maxShellThickness(caja) ?? -1, 50, 1e-9);

  const justo = shellBody(caja, 50);
  check("el espesor 50 se rechaza: el interior desaparecería", !justo.ok);
  check(
    "y el motivo dice el número, no «no cabe»",
    !justo.ok && /se come la pieza/.test(justo.reason) && /50/.test(justo.reason),
    justo.ok ? "" : justo.reason,
  );
  const pasado = shellBody(caja, 80);
  check("pasarse todavía más también se rechaza", !pasado.ok);
  // Un rechazo NO devuelve cuerpo: no hay nada que escribir por descuido.
  check("un rechazo no trae cuerpo ninguno", !("report" in justo));

  const casi = shellBody(caja, 49.999);
  check("y justo por debajo del límite sí se vacía", casi.ok, casi.ok ? "" : casi.reason);
  if (casi.ok) checkClose("con la pared casi tocándose", casi.report.volume.inner, 0.002 ** 3, 1e-9);

  check("un espesor cero se rechaza", !shellBody(caja, 0).ok);
  check("y uno negativo también: vaciar hacia fuera es otra orden", !shellBody(caja, -10).ok);
  const negativo = offsetInnerBody(caja, -10);
  check("el desfase lo dice con esas palabras", !negativo.ok && /positivo/.test(negativo.reason), negativo.ok ? "" : negativo.reason);
}

/* ── El prisma de 48 lados: el cilindro del kernel facetado ───────────────── */
{
  const N = 48;
  const R = 50;
  const cilindro = prism(N, R, 100);
  check("el prisma llega con 96 vértices y 50 caras", cilindro.vertices.length === 96 && cilindro.faces.length === 50);

  const espesor = 5;
  const result = shellBody(cilindro, espesor);
  check("el prisma de 48 lados se vacía", result.ok, result.ok ? "" : result.reason);
  if (result.ok) {
    const shell = result.report;
    check("conserva DOS cáscaras", connectedComponentCount(shell.body) === 2, `fueron ${connectedComponentCount(shell.body)}`);
    check("y está cerrado", bodyIsClosed(shell.body));
    check(
      "el validador lo da por bueno",
      validateBody(shell.body, { requireClosed: true, requirePlanarFaces: true, expectedShells: 2 }).ok,
    );

    // La cifra contra la que se compara NO es la del cilindro exacto: es la
    // resta de los dos PRISMAS. Un prisma regular desfasado `t` por el plano de
    // cada cara es otro prisma regular cuyo circunradio baja `t / cos(π/n)`,
    // porque lo que se desfasa es la APOTEMA. Compararlo con π·r²·h metería el
    // error de facetado (que está calculado en `tessellate.ts`) en un spec que
    // no habla de eso.
    const interior = prism(N, R - espesor / Math.cos(Math.PI / N), 100 - 2 * espesor);
    const esperado = planarBodyVolume(cilindro) - planarBodyVolume(interior);
    const relativo = Math.abs(shell.volume.shell - esperado) / Math.abs(esperado);
    check(
      `el volumen coincide con la resta de los dos prismas hasta 1e-9 relativo (Δ=${relativo.toExponential(2)})`,
      relativo < 1e-9,
    );
    checkClose("y el hueco es el prisma interior", shell.volume.inner, planarBodyVolume(interior), Math.abs(planarBodyVolume(interior)) * 1e-9);
    check("los 96 vértices son esquinas de tres planos: todos exactos", shell.exact === 96 && shell.leastSquares === 0);
    check("el interior conserva la topología del exterior", shell.interior.faces.length === 50 && shell.interior.vertices.length === 96);
  }

  // El límite del prisma NO es su radio: es su apotema (48.9…), porque lo que
  // se desfasa son los planos de las caras laterales, no la piel cilíndrica.
  const limite = shellLimit(cilindro);
  check("el prisma acota su espesor por la APOTEMA, no por el radio", limite.ok && limite.limit.maxThickness < R);
  if (limite.ok) checkClose("que es R·cos(π/48)", limite.limit.maxThickness, R * Math.cos(Math.PI / N), 1e-9);
}

/* ── El cóncavo se rechaza NOMBRÁNDOLO ────────────────────────────────────── */
{
  // Una L: dos cajas unidas por una cara, con dos aristas de rincón entrante.
  const ele = booleanUnion(
    makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 50) }),
    makeBox({ min: vec3(0, 0, 50), max: vec3(50, 100, 100) }),
  );
  const convexidad = bodyConvexity(ele);
  check("la L NO es convexa", !convexidad.convex);
  check("y se cuentan sus dos aristas entrantes", convexidad.concaveEdges === 2, `fueron ${convexidad.concaveEdges}`);
  checkClose("cuyo diedro interior es 270°", convexidad.worstDegrees, 270, 1e-6);

  const result = shellBody(ele, 5);
  check("vaciar una L se rechaza", !result.ok);
  check(
    "con el motivo escrito: desfasar un cóncavo no da un cuerpo interior",
    !result.ok && /CÓNCAVO/.test(result.reason) && /todavía no está disponible/.test(result.reason),
    result.ok ? "" : result.reason,
  );
  check("y el motivo dice cuántas aristas y cuánto miden", !result.ok && /2 arista\(s\)/.test(result.reason) && /270\.0°/.test(result.reason));

  // Los convexos que sí lo son, lo dicen: el control positivo del mismo test.
  const caja = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const recta = bodyConvexity(caja);
  check("una caja es convexa", recta.convex && recta.concaveEdges === 0);
  checkClose("con todas sus aristas a 90°", recta.worstDegrees, 90, 1e-9);
  check("y sin peor arista que señalar", recta.worstEdge === -1);
  check("el prisma de 48 lados también es convexo", bodyConvexity(prism(48, 50, 100)).convex);
}

/* ── El ápice: cuatro planos, mínimos cuadrados, y cuándo NO concurren ────── */
{
  // Base CUADRADA: por simetría hay un punto a la misma distancia de las cuatro
  // caras laterales, así que el ápice se resuelve y el interior es la pirámide
  // semejante de razón (r − t)/r con r el radio de su esfera inscrita.
  const cuadrada = pyramid(100, 100, 120);
  const limite = shellLimit(cuadrada);
  check("la pirámide cuadrada acota su espesor", limite.ok);
  if (limite.ok) {
    checkClose("por el radio de su esfera inscrita: 100/3", limite.limit.maxThickness, 100 / 3, 1e-9);
    check("cuatro vértices exactos y UNO por mínimos cuadrados: el ápice", limite.limit.exact === 4 && limite.limit.leastSquares === 1);
  }

  const espesor = 8;
  const result = shellBody(cuadrada, espesor);
  check("la pirámide cuadrada se vacía", result.ok, result.ok ? "" : result.reason);
  if (result.ok) {
    const r = 100 / 3;
    const total = (100 * 100 * 120) / 3;
    const razon = (r - espesor) / r;
    checkClose("y el hueco es la pirámide semejante de razón (r − t)/r", result.report.volume.inner, total * razon ** 3, 1e-6);
    checkClose("así que la pared vale V·(1 − ((r−t)/r)³)", result.report.volume.shell, total * (1 - razon ** 3), 1e-6);
    check("con dos cáscaras", connectedComponentCount(result.report.body) === 2);
    check("y el validador en verde", validateBody(result.report.body, { requireClosed: true, requirePlanarFaces: true }).ok);
  }

  // Base RECTANGULAR: las dos parejas de caras laterales tienen inclinaciones
  // distintas, así que NO hay punto equidistante de las cuatro. El ápice
  // tendría que partirse en dos, y eso es otra topología: se rechaza.
  const rectangular = shellBody(pyramid(100, 60, 120), 5);
  check("la pirámide de base rectangular se rechaza", !rectangular.ok);
  check(
    "porque sus cuatro planos no concurren al desfasarlos, y lo dice",
    !rectangular.ok && /no concurren/.test(rectangular.reason) && /cambiar la topología/.test(rectangular.reason),
    rectangular.ok ? "" : rectangular.reason,
  );
}

/* ── El cuerpo fragmentado: primero Limpiar, y entonces sí ────────────────── */
{
  // La unión de dos cajas contiguas es CONVEXA (es una caja de 200×100×50) pero
  // llega fragmentada de la booleana: 20 caras, 30 aristas y cuatro vértices en
  // T, que tocan sólo DOS planos distintos. Un vértice así no es una esquina y
  // desfasar no dice adónde debe ir.
  const fragmentado = booleanUnion(
    makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 50) }),
    makeBox({ min: vec3(100, 0, 0), max: vec3(200, 100, 50) }),
  );
  check("el fragmentado es convexo", bodyConvexity(fragmentado).convex);
  check("y aun así llega con 20 caras y 12 vértices", fragmentado.faces.length === 20 && fragmentado.vertices.length === 12);

  const crudo = shellBody(fragmentado, 10);
  check("vaciarlo tal cual se rechaza", !crudo.ok);
  check(
    "y el motivo nombra el remedio que existe en este árbol: cUerpo Limpiar",
    !crudo.ok && /plano\(s\) distinto\(s\)/.test(crudo.reason) && /Limpiar/.test(crudo.reason),
    crudo.ok ? "" : crudo.reason,
  );

  const limpio = mergeCoplanarFaces(fragmentado);
  check("la fusión coplanaria lo deja en 6 caras y 8 vértices", limpio.body.faces.length === 6 && limpio.body.vertices.length === 8);
  const despues = shellBody(limpio.body, 10);
  check("y entonces SÍ se vacía", despues.ok, despues.ok ? "" : despues.reason);
  if (despues.ok) {
    checkClose("con el material de 200×100×50 menos 180×80×30", despues.report.volume.shell, 200 * 100 * 50 - 180 * 80 * 30, 1e-6);
    check("y sus dos cáscaras", connectedComponentCount(despues.report.body) === 2);
  }
}

/* ── El tetraedro: planos que no son ortogonales a ningún eje ─────────────── */
{
  // Los casos anteriores tienen caras alineadas con los ejes o con un eje de
  // simetría. Un tetraedro no: sus cuatro planos son oblicuos y el sistema de
  // cada vértice mezcla las tres componentes. Si la resolución por Cramer
  // estuviera transpuesta o cambiada de signo, aquí se vería y en la caja no.
  const tetra = makeTetrahedron();
  check("el tetraedro es convexo", bodyConvexity(tetra).convex);
  const limite = shellLimit(tetra);
  check("y acota su espesor por su esfera inscrita", limite.ok);
  if (limite.ok) {
    checkClose("r = 1/√3 para este tetraedro", limite.limit.maxThickness, 1 / Math.sqrt(3), 1e-12);
    check("sus cuatro vértices son esquinas de tres planos", limite.limit.exact === 4 && limite.limit.leastSquares === 0);

    const r = limite.limit.maxThickness;
    const espesor = r / 4;
    const vaciado = shellBody(tetra, espesor);
    check("el tetraedro se vacía", vaciado.ok, vaciado.ok ? "" : vaciado.reason);
    if (vaciado.ok) {
      // Todo cuerpo con esfera inscrita se desfasa a sí mismo SEMEJANTE, de
      // razón (r − t)/r. Es la comprobación más exigente del módulo: falla con
      // cualquier error de escala, de signo o de eje.
      const razon = (r - espesor) / r;
      checkClose("y su hueco es el tetraedro semejante de razón (r − t)/r", vaciado.report.volume.inner, planarBodyVolume(tetra) * razon ** 3, 1e-12);
      check("con dos cáscaras", connectedComponentCount(vaciado.report.body) === 2);
      check("y el validador en verde", validateBody(vaciado.report.body, { requireClosed: true, requirePlanarFaces: true }).ok);
    }
  }
}

/* ── La lámina no se vacía: no hay dentro que desfasar ────────────────────── */
{
  const lamina = buildBody([vec3(0, 0, 0), vec3(10, 0, 0), vec3(0, 10, 0)], [{ outer: [0, 1, 2] }]);
  check("una cara suelta no está cerrada", !bodyIsClosed(lamina));
  const result = shellBody(lamina, 1);
  check("vaciarla se rechaza", !result.ok);
  check("diciendo que es una lámina", !result.ok && /lámina/.test(result.reason), result.ok ? "" : result.reason);
  check("un cuerpo vacío tampoco se vacía", !shellBody(buildBody([], []), 1).ok);
}

/* ── Las piezas sueltas ───────────────────────────────────────────────────── */
{
  // Tres planos ortogonales por el origen desplazados a 1: el punto (1,1,1).
  const p = solve3(vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1), [1, 1, 1], 1e-6);
  check("tres planos ortogonales dan su esquina", p !== null && v3Length(v3Sub(p, vec3(1, 1, 1))) < 1e-12);
  check("tres planos PARALELOS no dan ningún punto", solve3(vec3(1, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), [1, 2, 3], 1e-6) === null);
  check(
    "y tres cuyas normales son coplanarias tampoco: su corte es una recta",
    solve3(vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), [1, 1, 2], 1e-6) === null,
  );

  const caja = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const planos = facePlanes(caja);
  check("la caja tiene seis planos de cara", planos.length === 6);
  check("cada vértice de la caja toca tres caras", vertexFaces(caja, 0).length === 3);
  check("y sus tres planos son distintos", distinctPlanes(planos, vertexFaces(caja, 0), 1e-9, 1e-7).length === 3);
  // El mismo plano repetido cinco veces sigue siendo UN plano: es lo que hace
  // que una cara partida por una booleana no falsee el sistema del vértice.
  check("un plano repetido cuenta una vez", distinctPlanes(planos, [0, 0, 0, 0, 0], 1e-9, 1e-7).length === 1);
}

report("brep/shell", 80);
