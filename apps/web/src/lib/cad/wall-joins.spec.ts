/**
 * Las UNIONES derivadas entre muros: inglete en L, empalme en T, continuación
 * colineal — con geometría CONCRETA calculada a mano en cada caso.
 *
 * Lo que se fija aquí no es que "haya unión", sino que sea LA unión correcta:
 * las caras se cortan en el punto exacto del inglete, los testeros absorbidos
 * no se trazan, el área no se inventa ni se pierde, el ángulo agudo respeta el
 * tope de inglete — y, sobre todo, que NADA de esto se persiste: la unión es
 * función pura de las recetas y el documento sale de la derivación byte a byte
 * igual que entró.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";
import { pointInPolygon } from "./entity-hit-geometry";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import { ringSignedArea } from "./solid3d-adapter";
import { wallFootprint } from "./wall-geometry";
import {
  CAD_WALL_MITER_LIMIT_RATIO,
  wallJoinBoundaryPaths,
  wallJoinFillWindow,
  wallJoinedFootprint,
  wallJoins,
} from "./wall-joins";

const wall = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness = 250,
): CadWallEntity => ({
  id,
  type: "wall",
  start: { ...start, z: 0 },
  end: { ...end, z: 0 },
  thickness,
  height: 2400,
  layer: "0",
});

const near = (actual: number, expected: number, what: string, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

const nearPoint = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  what: string,
) => {
  near(actual.x, expected.x, `${what}.x`);
  near(actual.y, expected.y, `${what}.y`);
};

// --- L en ángulo recto, grosores iguales (250/250): el inglete exacto ---------
{
  // A va de (0,0) a (3000,0) y B de (0,0) a (0,3000), ambos con grosor 250
  // (media anchura 125). Las caras interiores (y=+125 de A, x=+125 de B) se
  // cortan en (125,125); las exteriores (y=−125, x=−125) en (−125,−125). La
  // esquina de cada cara se desliza por su eje: la interior RECORTA 125 y la
  // exterior EXTIENDE 125 — el inglete a 45° de toda la vida.
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 });
  const b = wall("b", { x: 0, y: 0 }, { x: 0, y: 3000 });

  const joinsA = wallJoins(a, [b]);
  assert.equal(joinsA.start.kind, "corner");
  assert.equal(joinsA.start.otherId, "b");
  near(joinsA.start.leftExtension, -125, "cara interior de A: recorta 125");
  near(joinsA.start.rightExtension, 125, "cara exterior de A: extiende 125");
  assert.equal(joinsA.start.cap, false, "el testero de A queda absorbido en la esquina");
  assert.equal(joinsA.end.kind, "free", "el otro extremo de A no une con nadie");
  assert.equal(joinsA.end.cap, true);

  const footA = wallJoinedFootprint(a, joinsA);
  assert.ok(footA);
  nearPoint(footA[0], { x: 125, y: 125 }, "esquina interior del inglete");
  nearPoint(footA[1], { x: -125, y: -125 }, "esquina exterior del inglete");
  nearPoint(footA[2], { x: 3000, y: -125 }, "el extremo libre no se toca");
  nearPoint(footA[3], { x: 3000, y: 125 }, "el extremo libre no se toca");
  assert.ok(ringSignedArea(footA) > 0, "ajustado, el anillo sigue antihorario");
  // El triángulo que la cara interior cede es el mismo que la exterior gana:
  // en la L recta simétrica el área del muro se conserva (3000×250).
  near(ringSignedArea(footA), 3000 * 250, "el inglete simétrico conserva el área");

  const joinsB = wallJoins(b, [a]);
  const footB = wallJoinedFootprint(b, joinsB);
  assert.ok(footB);
  nearPoint(footB[0], { x: -125, y: -125 }, "B comparte la esquina exterior");
  nearPoint(footB[1], { x: 125, y: 125 }, "B comparte la esquina interior");
  near(ringSignedArea(footB), 3000 * 250, "B también conserva su área");
  // Los dos anillos TESELAN la esquina: comparten la diagonal del inglete y no
  // se solapan — la suma de áreas es la del conjunto, sin doble conteo.
  near(
    ringSignedArea(footA) + ringSignedArea(footB),
    2 * 3000 * 250,
    "el área del contorno conjunto",
  );
  assert.ok(pointInPolygon({ x: 60, y: 0 }, footA), "bajo la diagonal es masa de A");
  assert.ok(!pointInPolygon({ x: 60, y: 0 }, footB), "…y no de B");
  assert.ok(pointInPolygon({ x: 0, y: 60 }, footB), "sobre la diagonal es masa de B");
  assert.ok(!pointInPolygon({ x: 0, y: 60 }, footA), "…y no de A");

  // El testero absorbido NO se traza: el contorno de A pasa a ser UNA
  // polilínea abierta que recorre cara derecha, testero libre y cara
  // izquierda — sin la diagonal del inglete.
  const paths = wallJoinBoundaryPaths(footA, joinsA.start.cap, joinsA.end.cap);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].closed, false);
  assert.equal(paths[0].points.length, 4);
  nearPoint(paths[0].points[0], { x: -125, y: -125 }, "arranca en la esquina exterior");
  nearPoint(paths[0].points[3], { x: 125, y: 125 }, "termina en la interior");
}

// --- L con grosores distintos (250/100): cada cara contra SU correspondiente --
{
  // B ahora es un tabique de 100 (media anchura 50). Las caras interiores se
  // cortan en (50,125): A recorta 50 (la media anchura de B) y B recorta 125
  // (la de A). Las exteriores, en (−50,−125), con las extensiones simétricas.
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 }, 250);
  const b = wall("b", { x: 0, y: 0 }, { x: 0, y: 2000 }, 100);

  const joinsA = wallJoins(a, [b]);
  near(joinsA.start.leftExtension, -50, "A recorta la media anchura de B");
  near(joinsA.start.rightExtension, 50, "A extiende la media anchura de B");
  const footA = wallJoinedFootprint(a, joinsA);
  assert.ok(footA);
  nearPoint(footA[0], { x: 50, y: 125 }, "esquina interior asimétrica");
  nearPoint(footA[1], { x: -50, y: -125 }, "esquina exterior asimétrica");

  const joinsB = wallJoins(b, [a]);
  near(joinsB.start.leftExtension, 125, "B extiende la media anchura de A");
  near(joinsB.start.rightExtension, -125, "B recorta la media anchura de A");
  const footB = wallJoinedFootprint(b, joinsB);
  assert.ok(footB);
  nearPoint(footB[0], { x: -50, y: -125 }, "misma esquina exterior que A");
  nearPoint(footB[1], { x: 50, y: 125 }, "misma esquina interior que A");
}

// --- T: el que llega pierde su testero y termina contra la cara del pasante ---
{
  // A pasa de (0,0) a (3000,0) con grosor 250 (caras en y=±125). B sube de
  // (1500,−1000) y su extremo toca el EJE de A en (1500,0). Sus dos caras
  // (x=1450 y x=1550) deben RECORTAR 125 para terminar contra la cara y=−125
  // de A — la cercana a B — y su testero desaparece dentro de A.
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 }, 250);
  const b = wall("b", { x: 1500, y: -1000 }, { x: 1500, y: 0 }, 100);

  const joinsB = wallJoins(b, [a]);
  assert.equal(joinsB.end.kind, "tee");
  assert.equal(joinsB.end.otherId, "a");
  near(joinsB.end.leftExtension, -125, "las dos caras recortan hasta la cara del pasante");
  near(joinsB.end.rightExtension, -125, "las dos caras recortan hasta la cara del pasante");
  assert.equal(joinsB.end.cap, false, "el testero del que llega desaparece");
  assert.equal(joinsB.start.kind, "free");

  const footB = wallJoinedFootprint(b, joinsB);
  assert.ok(footB);
  nearPoint(footB[2], { x: 1550, y: -125 }, "cara derecha contra y=−125");
  nearPoint(footB[3], { x: 1450, y: -125 }, "cara izquierda contra y=−125");

  // El pasante NO se toca en esta ola: sus dos extremos quedan libres.
  const joinsA = wallJoins(a, [b]);
  assert.equal(joinsA.start.kind, "free");
  assert.equal(joinsA.end.kind, "free");

  // El rayado del que llega no invade al pasante: su ventana termina donde
  // empieza la masa de A (a 125 del extremo del eje).
  const window = wallJoinFillWindow(joinsB, 1000);
  near(window.min, 0, "el arranque libre no recorta rayado");
  near(window.max, 875, "el rayado se detiene en la cara del pasante");

  // Un extremo a 1 unidad del eje NO es una T: la tolerancia absorbe deriva
  // de coma flotante, no distancias que el usuario dibujó.
  const apart = wall("c", { x: 1500, y: -1000 }, { x: 1500, y: -1 }, 100);
  assert.equal(wallJoins(apart, [a]).end.kind, "free");
}

// --- colineal: continuación con testeros interiores absorbidos ----------------
{
  const a = wall("a", { x: 0, y: 0 }, { x: 2000, y: 0 });
  const b = wall("b", { x: 2000, y: 0 }, { x: 5000, y: 0 });
  const joinsA = wallJoins(a, [b]);
  assert.equal(joinsA.end.kind, "collinear");
  near(joinsA.end.leftExtension, 0, "la continuación no mueve caras");
  near(joinsA.end.rightExtension, 0, "la continuación no mueve caras");
  assert.equal(joinsA.end.cap, false, "testero interior absorbido");
  assert.equal(wallJoins(b, [a]).start.cap, false, "el de B también");

  // Con grosores distintos, el testero del más GRUESO asoma alrededor del
  // delgado y se dibuja; el del delgado queda enterrado y se absorbe.
  const thin = wall("t", { x: 2000, y: 0 }, { x: 5000, y: 0 }, 150);
  assert.equal(wallJoins(a, [thin]).end.cap, true, "el grueso enseña su testero");
  assert.equal(wallJoins(thin, [a]).start.cap, false, "el delgado lo absorbe");

  // Un muro dibujado ENCIMA de otro (misma dirección desde el mismo punto) no
  // tiene unión limpia: se deja el testero en vez de fingir una esquina.
  const doubled = wall("d", { x: 0, y: 0 }, { x: 1000, y: 0 });
  assert.equal(wallJoins(a, [doubled]).start.kind, "free");
}

// --- ángulo agudo: el inglete respeta su tope y degrada a bisel ---------------
{
  // B sale del mismo punto que A con sólo 10° entre ejes. La púa exterior del
  // inglete mediría h·(1+cos10°)/sin10° ≈ 1430 — más que el tope de
  // 4×grosor = 1000 (el `miterlimit` de SVG aplicado al muro). La cara
  // exterior se topa en 1000 y el testero SE DIBUJA como bisel: una esquina
  // "limpia" que en realidad quedó abierta sería mentir.
  const theta = (10 * Math.PI) / 180;
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 });
  const b = wall("b", { x: 0, y: 0 }, { x: 3000 * Math.cos(theta), y: 3000 * Math.sin(theta) });
  const joins = wallJoins(a, [b]);
  assert.equal(joins.start.kind, "corner");
  const spike = (125 * (1 + Math.cos(theta))) / Math.sin(theta);
  assert.ok(spike > CAD_WALL_MITER_LIMIT_RATIO * 250, "el caso de prueba sí desborda el tope");
  near(joins.start.leftExtension, -spike, "el recorte interior es exacto (cabe en el muro)");
  near(
    joins.start.rightExtension,
    CAD_WALL_MITER_LIMIT_RATIO * 250,
    "la extensión exterior se topa en 4× el grosor",
  );
  assert.equal(joins.start.cap, true, "el inglete topado dibuja su testero (bisel)");
}

// --- tres muros en un punto: sin inglete por pares, se dejan los testeros -----
{
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 });
  const b = wall("b", { x: 0, y: 0 }, { x: 0, y: 3000 });
  const c = wall("c", { x: 0, y: 0 }, { x: -3000, y: 0 });
  const joins = wallJoins(a, [b, c]);
  assert.equal(joins.start.kind, "free", "el nudo de 3+ muros queda para la ola 2");
  assert.equal(joins.start.cap, true);
}

// --- el extremo libre no cambia NADA ------------------------------------------
{
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 });
  const far = wall("f", { x: 9000, y: 9000 }, { x: 9000, y: 12000 });
  const joins = wallJoins(a, [far]);
  assert.equal(joins.start.kind, "free");
  assert.equal(joins.end.kind, "free");
  assert.deepEqual(
    wallJoinedFootprint(a, joins),
    wallFootprint(a),
    "sin uniones, el contorno ajustado ES el contorno base",
  );
}

// --- el REGISTRO REAL deriva la unión desde el documento… y no la persiste ----
{
  const a = wall("a", { x: 0, y: 0 }, { x: 3000, y: 0 });
  const b = wall("b", { x: 0, y: 0 }, { x: 0, y: 3000 });
  const document: CadDocument = {
    meta: { version: 1, schema: 6, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [a, b],
    history: [],
    modelSpace: { entityIds: ["a", "b"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
  const before = structuredClone(document);
  const adapter = CAD_ENTITY_REGISTRY.adapter(a);

  // CON documento, el primer trazo es la polilínea abierta del inglete…
  const joined = adapter.renderer.paths(a, undefined, document);
  assert.equal(joined[0].closed, false, "el testero absorbido no se traza");
  nearPoint(joined[0].points[3], { x: 125, y: 125 }, "…que termina en la esquina del inglete");

  // …SIN documento, la geometría solitaria de siempre: anillo cerrado base.
  const alone = adapter.renderer.paths(a);
  assert.equal(alone[0].closed, true);
  assert.deepEqual(alone[0].points, wallFootprint(a), "sin contexto no hay unión");

  // Un documento cuyo único muro es él mismo tampoco cambia nada, trazo a trazo.
  const solitary = { ...document, entities: [a], modelSpace: { entityIds: ["a"] } };
  assert.deepEqual(
    adapter.renderer.paths(a, undefined, solitary),
    alone,
    "el muro solitario no paga las uniones",
  );

  // Round-trip: derivar NO tocó el documento y la unión no aparece en lo
  // serializado — las entidades siguen siendo la receta pelada, sin rastro de
  // la media anchura (125) que sólo existe en la derivación.
  assert.deepEqual(document, before, "derivar es leer: el documento no cambia");
  assert.ok(
    !JSON.stringify(document.entities).includes("125"),
    "el contorno derivado no viaja en el documento",
  );
}

console.log("wall-joins: inglete en L, empalme en T, colineal, tope de bisel y pureza verificados");
