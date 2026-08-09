/**
 * Los invariantes, probados por los DOS lados.
 *
 * Un validador sólo probado con cuerpos correctos es un validador que podría
 * estar devolviendo `ok: true` siempre — y eso pasaría los tests igual de verde.
 * Por eso cada familia de invariantes se prueba dos veces: sobre un sólido
 * legítimo (no debe quejarse) y sobre un sólido ROTO A PROPÓSITO (debe quejarse,
 * y con el tipo de violación correcto).
 *
 * Los números de Euler no se comparan contra lo que devuelva el kernel: se
 * comparan contra lo que sale de contar a mano. Un cubo tiene 8 vértices, 12
 * aristas y 6 caras. Un cubo con un agujero pasante rectangular tiene 16, 24,
 * 10, y dos lazos interiores. Eso lo puede verificar cualquiera con un lápiz.
 */
import { BodyBuilder, buildBody, reverseBody } from "./body-builder";
import { assertValidBody, describeValidation, validateBody } from "./invariants";
import { boxArea, boxVolume, makeBox, makeBoxWithThroughHole, makePrism, makeTetrahedron } from "./primitives";
import { check, checkClose, checkThrows, report } from "./spec-support";
import {
  NO_INDEX,
  bodyIsClosed,
  cloneBody,
  edgeDihedralAngle,
  edgeFaces,
  eulerCounts,
  faceGeometricNormal,
  halfEdgeDestination,
  loopHalfEdges,
  loopPoints,
  planarBodyArea,
  planarBodyVolume,
  planarFaceArea,
  vertexEdges,
  vertexOutgoingHalfEdges,
  type BrepBody,
} from "./topology";
import { v3Dot, vec3 } from "./vec3";

const BOX = { min: vec3(-1, -2, -3), max: vec3(4, 5, 6) };

// --- El cubo: los números que se cuentan a mano --------------------------
{
  const box = makeBox(BOX);
  const counts = eulerCounts(box);
  check("cubo: 8 vértices", counts.vertices === 8, `${counts.vertices}`);
  check("cubo: 12 aristas", counts.edges === 12, `${counts.edges}`);
  check("cubo: 6 caras", counts.faces === 6, `${counts.faces}`);
  check("cubo: 0 lazos interiores", counts.rings === 0, `${counts.rings}`);
  check("cubo: 1 cáscara", counts.shells === 1, `${counts.shells}`);
  check("cubo: característica 2", counts.characteristic === 2, `${counts.characteristic}`);
  check("cubo: género 0", counts.genus === 0, `${counts.genus}`);
  check("cubo: cerrado", bodyIsClosed(box));

  const validation = validateBody(box, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 0, expectedShells: 1 });
  check("cubo: sin violaciones", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  checkClose("cubo: volumen = dx·dy·dz", planarBodyVolume(box), boxVolume(BOX));
  checkClose("cubo: área = 2(dxdy+dydz+dzdx)", planarBodyArea(box), boxArea(BOX));
  console.log(`  cubo → ${describeValidation(validation)}`);
}

// --- Adyacencias en tiempo constante -------------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) });
  let worstTwin = 0;
  for (let i = 0; i < box.halfEdges.length; i += 1) {
    const twin = box.halfEdges[i].twin;
    if (twin === NO_INDEX || box.halfEdges[twin].twin !== i) worstTwin += 1;
  }
  check("toda media-arista tiene gemela recíproca", worstTwin === 0, `${worstTwin} sin recíproca`);
  check("cada arista del cubo tiene exactamente 2 caras", box.edges.every((_, index) => edgeFaces(box, index).length === 2));
  for (let vertex = 0; vertex < box.vertices.length; vertex += 1) {
    check(`el vértice ${vertex} del cubo toca 3 aristas`, vertexEdges(box, vertex).length === 3);
    check(`y 3 medias-aristas salen de él`, vertexOutgoingHalfEdges(box, vertex).length === 3);
  }
  let worstAngle = 0;
  for (let edge = 0; edge < box.edges.length; edge += 1) {
    const angle = edgeDihedralAngle(box, edge);
    worstAngle = Math.max(worstAngle, Math.abs((angle ?? 0) - Math.PI / 2));
  }
  check("todas las aristas del cubo son diedros de 90°", worstAngle < 1e-12, `peor ${worstAngle}`);
  // El destino de cada media-arista es el origen de la siguiente: el lazo cierra.
  let broken = 0;
  for (const loop of box.loops.keys()) {
    const halfEdges = loopHalfEdges(box, loop);
    for (let k = 0; k < halfEdges.length; k += 1) {
      const next = halfEdges[(k + 1) % halfEdges.length];
      if (halfEdgeDestination(box, halfEdges[k]) !== box.halfEdges[next].origin) broken += 1;
    }
  }
  check("todos los lazos del cubo cierran", broken === 0, `${broken} eslabones sueltos`);
}

// --- Género 1: el caso que desmonta V − E + F -----------------------------
{
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 3, y: 3 },
    holeMax: { x: 7, y: 6 },
  });
  const counts = eulerCounts(holed);
  check("caja agujereada: 16 vértices", counts.vertices === 16, `${counts.vertices}`);
  check("caja agujereada: 24 aristas", counts.edges === 24, `${counts.edges}`);
  check("caja agujereada: 10 caras", counts.faces === 10, `${counts.faces}`);
  check("caja agujereada: 2 lazos interiores", counts.rings === 2, `${counts.rings}`);
  check(
    "V − E + F daría 2, el mismo número que un cubo macizo",
    counts.vertices - counts.edges + counts.faces === 2,
  );
  check("pero restando los anillos la característica es 0", counts.characteristic === 0, `${counts.characteristic}`);
  check("y el género es 1", counts.genus === 1, `${counts.genus}`);

  const validation = validateBody(holed, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 1, expectedShells: 1 });
  check("caja agujereada: sin violaciones", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  checkClose("volumen = caja − agujero", planarBodyVolume(holed), 10 * 10 * 4 - 4 * 3 * 4);
  // Área de la tapa: contorno menos agujero, restado por el SIGNO del lazo interior.
  checkClose("la tapa mide 100 − 12", planarFaceArea(holed, 0), 100 - 12);
  console.log(`  caja con agujero pasante → ${describeValidation(validation)}`);

  const wrongGenus = validateBody(holed, { expectedGenus: 0 });
  check("pedir género 0 sobre un sólido de género 1 es un fallo", !wrongGenus.ok);
  check(
    "y el fallo se clasifica como euler-poincare",
    wrongGenus.violations.some((violation) => violation.kind === "euler-poincare"),
  );
}

// --- Tetraedro y prisma general ------------------------------------------
{
  const tetra = makeTetrahedron(1);
  const counts = eulerCounts(tetra);
  check("tetraedro: V=4 E=6 F=4", counts.vertices === 4 && counts.edges === 6 && counts.faces === 4);
  check("tetraedro: característica 2", counts.characteristic === 2);
  const validation = validateBody(tetra, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 0 });
  check("tetraedro: sin violaciones", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  // Volumen del tetraedro inscrito en el cubo de lado 2: 8/3 del cubo unidad… se
  // ancla con el valor exacto 8/3, que sale de 1/3 del cubo de lado 2 = 8/3.
  checkClose("tetraedro inscrito: volumen 8/3", planarBodyVolume(tetra), 8 / 3, 1e-12);
}
{
  // Prisma hexagonal con un agujero triangular: género 1 sin ser una caja.
  const hexagon = Array.from({ length: 6 }, (_, i) => ({
    x: 5 * Math.cos((i * Math.PI) / 3),
    y: 5 * Math.sin((i * Math.PI) / 3),
  }));
  const triangle = [
    { x: 1, y: -1 },
    { x: 2, y: 1 },
    { x: 0, y: 1.5 },
  ];
  const prism = makePrism(hexagon, 0, 3, [triangle]);
  const validation = validateBody(prism, { requireClosed: true, requirePlanarFaces: true, expectedGenus: 1 });
  check("prisma hexagonal agujereado: sin violaciones", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check("y su género es 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  const hexArea = (3 * Math.sqrt(3) * 25) / 2;
  const triArea = Math.abs((2 - 1) * (1.5 + 1) - (0 - 1) * (1 + 1)) / 2;
  checkClose("volumen = (área hexágono − área triángulo)·altura", planarBodyVolume(prism), (hexArea - triArea) * 3, 1e-9);
}

// --- Dos sólidos sueltos: dos cáscaras ------------------------------------
{
  const builder = new BodyBuilder();
  for (const offset of [0, 100]) {
    const corners = [
      vec3(offset, 0, 0),
      vec3(offset + 1, 0, 0),
      vec3(offset + 1, 1, 0),
      vec3(offset, 1, 0),
      vec3(offset, 0, 1),
      vec3(offset + 1, 0, 1),
      vec3(offset + 1, 1, 1),
      vec3(offset, 1, 1),
    ];
    builder.addPolygon([corners[0], corners[3], corners[2], corners[1]]);
    builder.addPolygon([corners[4], corners[5], corners[6], corners[7]]);
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      builder.addPolygon([corners[i], corners[j], corners[j + 4], corners[i + 4]]);
    }
  }
  const twoBoxes = builder.build();
  const validation = validateBody(twoBoxes, { requireClosed: true, expectedShells: 2 });
  check("dos cajas sueltas: sin violaciones", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check("dos cáscaras", validation.counts.shells === 2, `${validation.counts.shells}`);
  check("característica 4 = 2 + 2", validation.counts.characteristic === 4, `${validation.counts.characteristic}`);
  check("género total 0", validation.counts.genus === 0, `${validation.counts.genus}`);
  checkClose("volumen = 1 + 1", planarBodyVolume(twoBoxes), 2);
  check("pedir una sola cáscara falla", !validateBody(twoBoxes, { expectedShells: 1 }).ok);
}

// --- Soldadura de vértices -----------------------------------------------
{
  const builder = new BodyBuilder(1e-6);
  const a = builder.addVertex(vec3(1, 2, 3));
  const b = builder.addVertex(vec3(1 + 1e-9, 2, 3));
  const c = builder.addVertex(vec3(1 + 1e-3, 2, 3));
  check("dos puntos dentro de tolerancia son EL MISMO vértice", a === b);
  check("y uno fuera de tolerancia es distinto", a !== c);
  check("el contador de vértices lo refleja", builder.vertexCount === 2, `${builder.vertexCount}`);
}
{
  // Puntos a ambos lados de un borde de celda de la rejilla: el fallo que
  // produce redondear la coordenada a una clave en vez de mirar las 27 vecinas.
  const builder = new BodyBuilder(1e-3);
  const left = builder.addVertex(vec3(0.0009999, 0, 0));
  const right = builder.addVertex(vec3(0.0010001, 0, 0));
  check("la soldadura cruza los bordes de celda de la rejilla", left === right);
}

// --- Sólido del revés: volumen negativo -----------------------------------
{
  const flipped = reverseBody(makeBox({ min: vec3(0, 0, 0), max: vec3(2, 3, 4) }));
  check("un cuerpo invertido sigue siendo cerrado", bodyIsClosed(flipped));
  checkClose("pero su volumen con signo es −24", planarBodyVolume(flipped), -24);
  const validation = validateBody(flipped, { requireClosed: true });
  check("y el validador lo rechaza", !validation.ok);
  check(
    "clasificándolo como normales hacia dentro",
    validation.violations.some((violation) => violation.kind === "normal-orientation"),
    validation.violations.map((v) => v.kind).join(","),
  );
  // Invertir dos veces devuelve el original — pero eso NO basta como prueba
  // (la identidad también lo cumple), así que se ancla el volumen positivo.
  checkClose("invertir dos veces recupera el volumen +24", planarBodyVolume(reverseBody(flipped)), 24);
}

// --- Rechazos del constructor: fallar pronto y con nombre -----------------
checkThrows("una cara recorrida al revés se rechaza al coser", () =>
  buildBody(
    [vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(0, 1, 0), vec3(0, 0, 1), vec3(1, 0, 1), vec3(1, 1, 1), vec3(0, 1, 1)],
    [
      { outer: [0, 3, 2, 1] },
      { outer: [4, 5, 6, 7] },
      { outer: [0, 1, 5, 4] },
      { outer: [1, 2, 6, 5] },
      { outer: [2, 3, 7, 6] },
      { outer: [7, 4, 0, 3] }, // ← la última cara, del revés
    ],
  ),
);
checkThrows("tres caras en una arista se rechazan (no es variedad)", () =>
  buildBody([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1), vec3(1, 1, 1)], [
    { outer: [0, 1, 2] },
    { outer: [1, 0, 3] },
    { outer: [1, 0, 4] },
  ]),
);
checkThrows("un lazo de dos vértices se rechaza", () => buildBody([vec3(0, 0, 0), vec3(1, 0, 0)], [{ outer: [0, 1] }]));
checkThrows("un índice de vértice fuera de rango se rechaza", () =>
  buildBody([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)], [{ outer: [0, 1, 9] }]),
);
checkThrows("un vértice repetido consecutivamente se rechaza", () =>
  buildBody([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)], [{ outer: [0, 0, 1, 2] }]),
);
checkThrows("un agujero que no cabe en la caja se rechaza", () =>
  makeBoxWithThroughHole({ min: vec3(0, 0, 0), max: vec3(4, 4, 4), holeMin: { x: -1, y: 1 }, holeMax: { x: 3, y: 3 } }),
);

// --- Cuerpos rotos a mano: cada familia de invariante, por su lado --------
{
  // Referencias: gemela no recíproca.
  const broken = cloneBody(makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) }));
  broken.halfEdges[0].twin = 5;
  const validation = validateBody(broken);
  check("gemela no recíproca: rechazado", !validation.ok);
  check(
    "clasificado como referencia",
    validation.violations.every((violation) => violation.kind === "reference"),
    validation.violations.map((v) => v.kind).join(","),
  );
}
{
  // Lazos: se cruzan dos lazos manteniendo next/prev coherentes.
  const broken = cloneBody(makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) }));
  const a = broken.loops[0].first;
  const b = broken.loops[1].first;
  const aNext = broken.halfEdges[a].next;
  const bNext = broken.halfEdges[b].next;
  broken.halfEdges[a].next = bNext;
  broken.halfEdges[bNext].prev = a;
  broken.halfEdges[b].next = aNext;
  broken.halfEdges[aNext].prev = b;
  const validation = validateBody(broken);
  check("lazos cruzados: rechazado", !validation.ok);
  check(
    "clasificado como lazo que no cierra",
    validation.violations.some((violation) => violation.kind === "loop-not-closed"),
    validation.violations.map((v) => v.kind).join(","),
  );
}
{
  // Aristas: se quita una cara y quedan aristas de borde.
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) });
  const specs = box.faces.slice(0, 5).map((face) => ({ outer: loopPoints(box, face.loops[0]) }));
  const builder = new BodyBuilder();
  for (const spec of specs) builder.addPolygon(spec.outer);
  const open = builder.build();
  check("una caja sin tapa NO es cerrada", !bodyIsClosed(open));
  const lenient = validateBody(open);
  check("y sin exigir cierre pasa el resto de invariantes", lenient.ok, lenient.violations.map((v) => v.message).join(" | "));
  const strict = validateBody(open, { requireClosed: true });
  check("exigiendo cierre, falla", !strict.ok);
  check(
    "clasificado como recuento de caras por arista",
    strict.violations.some((violation) => violation.kind === "edge-face-count"),
  );
}
{
  // Cáscaras: se manipula el reparto declarado.
  const broken = cloneBody(makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) }));
  broken.shells.push({ faces: [], closed: true });
  const validation = validateBody(broken);
  check("cáscaras declaradas de más: rechazado", !validation.ok);
  check(
    "clasificado como shell-mismatch",
    validation.violations.some((violation) => violation.kind === "shell-mismatch"),
  );
}
{
  // Guardián de ciclo: un cuerpo cuyo `next` no vuelve nunca al principio no
  // debe COLGAR el validador. Un gate que se cuelga no informa de nada.
  const rogue: BrepBody = {
    vertices: [
      { point: vec3(0, 0, 0), halfEdge: 0 },
      { point: vec3(1, 0, 0), halfEdge: 1 },
    ],
    halfEdges: [
      { origin: 0, edge: 0, loop: 0, next: 1, prev: 1, twin: NO_INDEX },
      { origin: 1, edge: 0, loop: 0, next: 1, prev: 0, twin: NO_INDEX },
    ],
    edges: [{ a: 0, b: NO_INDEX }],
    loops: [{ face: 0, first: 0, kind: "outer" }],
    faces: [{ loops: [0], surface: null, reversed: false, shell: 0 }],
    shells: [{ faces: [0], closed: false }],
  };
  checkThrows("un next que nunca vuelve al principio lanza en vez de colgarse", () => loopHalfEdges(rogue, 0));
}

// --- assertValidBody: lanza con el parte completo -------------------------
checkThrows("assertValidBody lanza sobre un sólido invertido", () =>
  assertValidBody(reverseBody(makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) })), { requireClosed: true }, "prueba"),
);
{
  const validation = assertValidBody(makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) }), { requireClosed: true });
  check("y devuelve el parte cuando todo está bien", validation.ok);
  checkClose("con el volumen ya calculado", validation.signedVolume ?? 0, 1);
}

// --- Normales salientes, cara a cara --------------------------------------
{
  const box = makeBox({ min: vec3(-1, -1, -1), max: vec3(1, 1, 1) });
  let outward = 0;
  for (let face = 0; face < box.faces.length; face += 1) {
    const normal = faceGeometricNormal(box, face);
    const centroid = loopPoints(box, box.faces[face].loops[0]).reduce(
      (acc, point) => vec3(acc.x + point.x / 4, acc.y + point.y / 4, acc.z + point.z / 4),
      vec3(0, 0, 0),
    );
    // Con el cubo centrado en el origen, "saliente" es exactamente "la normal
    // apunta en el mismo sentido que el vector desde el centro".
    if (v3Dot(normal, centroid) > 0) outward += 1;
  }
  check("las 6 caras del cubo miran hacia fuera", outward === 6, `${outward}/6`);
}

report("brep/invariants", 60);
