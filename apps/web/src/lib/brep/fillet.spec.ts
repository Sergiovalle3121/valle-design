/**
 * Chaflán y redondeo: el volumen retirado contra la fórmula cerrada, y la
 * convergencia del facetado por el lado correcto.
 *
 * El ancla absoluta: achaflanar una arista de 90° con radio `r` retira, por
 * unidad de longitud, un triángulo de área `r²(3 − 2√2)`. Redondearla de verdad
 * retira `r²(1 − π/4)`, que es MÁS. Como los planos del redondeo facetado son
 * TANGENTES al cilindro, el poliedro resultante CONTIENE al redondeo exacto:
 * quita menos material, y con más facetas quita cada vez más, acercándose a
 * `r²(1 − π/4)` POR DEBAJO. Si la convergencia fuese por arriba, los planos
 * serían secantes y no tangentes — y eso sí sería un error.
 */
import { booleanUnion } from "./boolean";
import { chamferCrossSection, chamferEdges, chamferRemovedVolume, edgeGeometry, filletAxisPoint, filletEdges } from "./fillet";
import { validateBody } from "./invariants";
import { polygonSignedArea, vec2 } from "./profile";
import { makeBox, makePrism } from "./primitives";
import { check, checkClose, checkThrows, report } from "./spec-support";
import { bodyIsClosed, edgeDihedralAngle, eulerCounts, planarBodyVolume, translateBody, type BrepBody } from "./topology";
import { v3Distance, vec3 } from "./vec3";

function audit(label: string, body: BrepBody) {
  const validation = validateBody(body, { requireClosed: true });
  check(`${label}: invariantes verdes`, validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check(`${label}: cerrado`, bodyIsClosed(body));
  return validation;
}

const BOX = makeBox({ min: vec3(0, 0, 0), max: vec3(4, 4, 4) });
const RADIUS = 0.5;
const EDGE_LENGTH = 4;

// --- La sección transversal, contra la fórmula cerrada --------------------
{
  const geometry = edgeGeometry(BOX, 0);
  checkClose("la arista de un cubo tiene diedro de 90°", geometry.dihedralRad, Math.PI / 2, 1e-12);
  const section = chamferCrossSection(geometry, RADIUS, 1);
  check("el chaflán de una faceta es un triángulo", section.length === 3, `${section.length} vértices`);
  checkClose(
    "y su área es r²(3 − 2√2)",
    Math.abs(polygonSignedArea(section)),
    RADIUS * RADIUS * (3 - 2 * Math.SQRT2),
    1e-15,
  );
  checkClose(
    "el volumen retirado es esa área por la longitud de la arista",
    chamferRemovedVolume(geometry, RADIUS, 1),
    RADIUS * RADIUS * (3 - 2 * Math.SQRT2) * EDGE_LENGTH,
    1e-15,
  );
  // El eje del cilindro de redondeo está a r de las dos caras: a r√2 del rincón.
  checkClose(
    "el eje del redondeo está a r√2 del rincón",
    v3Distance(filletAxisPoint(geometry, RADIUS), geometry.from),
    RADIUS * Math.SQRT2,
    1e-12,
  );
  const fan = chamferCrossSection(geometry, RADIUS, 6);
  check("con 6 facetas la sección tiene 8 vértices", fan.length === 8, `${fan.length}`);
  check(
    "y retira MÁS material que el chaflán de una faceta",
    Math.abs(polygonSignedArea(fan)) > Math.abs(polygonSignedArea(section)),
  );
}

// --- Chaflán sobre una arista: el volumen cuadra exactamente --------------
{
  const geometry = edgeGeometry(BOX, 0);
  const chamfered = chamferEdges(BOX, [0], RADIUS);
  audit("cubo con una arista achaflanada", chamfered);
  checkClose(
    "volumen = 64 − área de la sección · longitud",
    planarBodyVolume(chamfered),
    64 - chamferRemovedVolume(geometry, RADIUS, 1),
    1e-9,
  );
  checkClose("que en números es 63,8284…", planarBodyVolume(chamfered), 64 - 0.25 * (3 - 2 * Math.SQRT2) * 4, 1e-9);
  check("y la topología sigue siendo la de una esfera", eulerCounts(chamfered).characteristic === 2);
}

// --- Redondeo: convergencia POR DEBAJO al valor exacto --------------------
{
  const geometry = edgeGeometry(BOX, 0);
  // Un redondeo verdadero de 90° retira el cuadrado del rincón menos el cuarto
  // de disco: r²(1 − π/4) por unidad de longitud.
  const exactRemoved = RADIUS * RADIUS * (1 - Math.PI / 4) * EDGE_LENGTH;
  let previousRemoved = 0;
  for (const segments of [1, 2, 4, 8, 16, 32]) {
    const body = filletEdges(BOX, [0], RADIUS, segments);
    audit(`redondeo de ${segments} facetas`, body);
    const removed = 64 - planarBodyVolume(body);
    checkClose(
      `${segments} facetas: el volumen retirado coincide con la sección`,
      removed,
      chamferRemovedVolume(geometry, RADIUS, segments),
      1e-9,
    );
    check(`${segments} facetas: retira más que ${previousRemoved.toFixed(6)}`, removed > previousRemoved, `${removed}`);
    check(
      `${segments} facetas: y sigue retirando MENOS que el redondeo exacto (es circunscrito)`,
      removed < exactRemoved,
      `${removed} ≥ ${exactRemoved}`,
    );
    previousRemoved = removed;
  }
  check(
    "con 32 facetas se queda a menos del 0,5 % del redondeo exacto",
    (exactRemoved - previousRemoved) / exactRemoved < 5e-3,
    `error relativo ${(exactRemoved - previousRemoved) / exactRemoved}`,
  );
}

// --- Varias aristas que no se tocan --------------------------------------
{
  const vertical = BOX.edges
    .map((_, index) => index)
    .filter((index) => Math.abs(edgeGeometry(BOX, index).direction.z) > 0.9);
  check("un cubo tiene 4 aristas verticales", vertical.length === 4, `${vertical.length}`);
  const body = filletEdges(BOX, vertical, 0.5, 4);
  audit("cubo con las cuatro aristas verticales redondeadas", body);
  const perEdge = chamferRemovedVolume(edgeGeometry(BOX, vertical[0]), 0.5, 4);
  checkClose("volumen = 64 − 4 × el retiro de una arista", planarBodyVolume(body), 64 - 4 * perEdge, 1e-8);
  check("la topología sigue siendo esférica", eulerCounts(body).characteristic === 2);
}

// --- Rechazos explícitos --------------------------------------------------
checkThrows("achaflanar dos aristas que comparten vértice se rechaza", () => chamferEdges(BOX, [0, 1], 0.3));
checkThrows("sin aristas se rechaza", () => chamferEdges(BOX, [], 0.3));
checkThrows("un índice fuera de rango se rechaza", () => chamferEdges(BOX, [999], 0.3));
checkThrows("un radio nulo se rechaza", () => chamferEdges(BOX, [0], 0));
checkThrows("un radio negativo se rechaza", () => chamferEdges(BOX, [0], -1));
{
  // Arista CÓNCAVA: el rincón entrante de un prisma en L. Redondearla exige
  // AÑADIR material, y esta implementación sólo resta.
  const ell = makePrism(
    [vec2(0, 0), vec2(6, 0), vec2(6, 2), vec2(2, 2), vec2(2, 6), vec2(0, 6)],
    0,
    3,
  );
  const concave = ell.edges
    .map((_, index) => index)
    .filter((index) => (edgeDihedralAngle(ell, index) ?? 0) > Math.PI + 1e-6);
  check("el prisma en L tiene exactamente una arista cóncava", concave.length === 1, `${concave.length}`);
  checkThrows("y redondearla se rechaza con un mensaje que lo explica", () => chamferEdges(ell, concave, 0.3));
  // Las convexas del mismo prisma sí se pueden.
  const convexVertical = ell.edges
    .map((_, index) => index)
    .filter((index) => {
      const geometry = edgeGeometry(ell, index);
      return Math.abs(geometry.direction.z) > 0.9 && geometry.dihedralRad < Math.PI - 1e-6;
    });
  check("y tiene 5 aristas verticales convexas", convexVertical.length === 5, `${convexVertical.length}`);
  const rounded = filletEdges(ell, [convexVertical[0]], 0.3, 4);
  audit("prisma en L con una arista convexa redondeada", rounded);
  check("con volumen menor que el original", planarBodyVolume(rounded) < planarBodyVolume(ell));
}
{
  // Una arista PLANA (dos caras coplanarias) no tiene rincón. Se fabrica uniendo
  // dos cajas que se tocan: la unión deja aristas de 180° entre coplanarias.
  const joined = booleanUnion(
    makeBox({ min: vec3(0, 0, 0), max: vec3(2, 2, 2) }),
    makeBox({ min: vec3(2, 0, 0), max: vec3(4, 2, 2) }),
  );
  const flat = joined.edges
    .map((_, index) => index)
    .find((index) => Math.abs((edgeDihedralAngle(joined, index) ?? 0) - Math.PI) < 1e-9);
  check("la unión deja aristas planas entre triángulos coplanarios", flat !== undefined);
  if (flat !== undefined) {
    checkThrows("y achaflanar una arista plana se rechaza", () => chamferEdges(joined, [flat], 0.2));
  }
}

// --- El chaflán no depende de dónde esté la pieza -------------------------
{
  const moved = translateBody(BOX, vec3(100, -50, 33));
  const here = planarBodyVolume(chamferEdges(BOX, [0], RADIUS));
  const there = planarBodyVolume(chamferEdges(moved, [0], RADIUS));
  checkClose("achaflanar una pieza trasladada da el mismo volumen", there, here, 1e-6);
}

report("brep/fillet", 45);
