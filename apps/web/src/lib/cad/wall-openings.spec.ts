/**
 * El HUECO ALOJADO: que la puerta sobreviva a mover el muro y desaparezca al
 * borrarlo, con geometría concreta calculada a mano.
 *
 * Lo que se fija aquí es la promesa entera del esquema 7, y ninguna de las
 * cuatro afirmaciones se comprueba «por dentro»: todas pasan por el ejecutor de
 * comandos y por el registro de entidades, que es por donde pasa el editor.
 *
 *  1. Un hueco parte la cara del muro EXACTAMENTE en su intervalo, y sus jambas
 *     llegan a las dos caras.
 *  2. MOVER el muro mueve la puerta la misma cantidad, sin que nadie la mueva.
 *  3. BORRAR el muro se lleva la puerta EN EL MISMO LOTE — un paso de deshacer,
 *     ninguna entidad huérfana.
 *  4. BORRAR la puerta devuelve la cara del muro CONTINUA, byte a byte igual a
 *     la de un muro que nunca tuvo hueco.
 *
 * Y las tres cosas que no pueden pasar en silencio: un hueco que no cabe no se
 * dibuja, una reflexión cambia la mano de la hoja, y un bloque del estudio
 * sustituye al símbolo de fábrica sin tocar el alojamiento.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import type { CadOpeningEntity } from "./cad-entities-v7";
import type { CadWallEntity } from "./cad-entities-v6";
import { executeCadEntityCommandBatch } from "./entity-commands";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "./entity-runtime";
import { buildCadBimSchedule } from "./bim-schedule";
import { wallOpeningFit, wallOpeningSpan } from "./wall-openings";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
const near = (actual: number, expected: number, what: string, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);
  checks += 1;
};
const nearPoint = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  what: string,
) => {
  near(actual.x, expected.x, `${what}.x`);
  near(actual.y, expected.y, `${what}.y`);
};

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
  height: 2_400,
  layer: "0",
});

const door = (id: string, hostId: string, position: number, width = 900): CadOpeningEntity => ({
  id,
  type: "opening",
  kind: "door",
  hostId,
  position,
  width,
  height: 2_100,
  sill: 0,
  swing: "left",
  hinge: "start",
  layer: "0",
});

function documentOf(entities: (CadWallEntity | CadOpeningEntity)[]): CadDocument {
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [...entities],
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** La entidad nativa por id. El documento de esta spec sólo tiene nativas. */
const nativeOf = (document: CadDocument, id: string): CadNativeEntity =>
  document.entities.find((candidate) => candidate.id === id) as CadNativeEntity;

const paths = (document: CadDocument, id: string) => {
  const entity = nativeOf(document, id);
  return CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, 96, document);
};

// --- 1. el hueco parte la cara donde toca, y sus jambas cruzan el muro --------
{
  // Muro de (0,0) a (4000,0), grosor 250 → caras en y=+125 y y=−125.
  // Puerta de 900 centrada en 1500 → ocupa de 1050 a 1950 sobre el eje.
  const host = wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 });
  const opening = door("p1", "m1", 1_500);
  const document = documentOf([host, opening]);

  const span = wallOpeningSpan(opening);
  near(span.from, 1_050, "el vano empieza en 1050");
  near(span.to, 1_950, "y acaba en 1950");

  const wallPaths = paths(document, "m1");
  // Con hueco, el contorno deja de ser un anillo: dos testeros + cuatro tramos
  // de cara (dos por cara) + el rayado que quepa fuera del vano.
  const open = wallPaths.filter((path) => !path.closed);
  ok(open.length === wallPaths.length, "con hueco el muro ya no traza un anillo cerrado");

  const leftPieces = wallPaths.filter(
    (path) => path.points.length === 2 && path.points.every((point) => Math.abs(point.y - 125) < 1e-9),
  );
  ok(leftPieces.length === 2, "la cara izquierda sale partida en DOS tramos");
  const sorted = leftPieces.sort((a, b) => a.points[0].x - b.points[0].x);
  nearPoint(sorted[0].points[0], { x: 0, y: 125 }, "el primer tramo arranca en el testero");
  nearPoint(sorted[0].points[1], { x: 1_050, y: 125 }, "y muere en el canto del vano");
  nearPoint(sorted[1].points[0], { x: 1_950, y: 125 }, "el segundo arranca en el otro canto");
  nearPoint(sorted[1].points[1], { x: 4_000, y: 125 }, "y llega al testero final");

  const openingPaths = paths(document, "p1");
  const jambs = openingPaths.slice(0, 2);
  nearPoint(jambs[0].points[0], { x: 1_050, y: 125 }, "la primera jamba nace en la cara izquierda");
  nearPoint(jambs[0].points[1], { x: 1_050, y: -125 }, "y muere en la derecha: cruza el muro");
  nearPoint(jambs[1].points[0], { x: 1_950, y: 125 }, "la segunda jamba, en el otro canto");
  nearPoint(jambs[1].points[1], { x: 1_950, y: -125 }, "también de cara a cara");

  // La hoja: cuelga de la jamba de arranque, en la cara por la que barre
  // (izquierda, y=+125), y mide lo que el hueco.
  const leaf = openingPaths[2];
  nearPoint(leaf.points[0], { x: 1_050, y: 125 }, "la hoja pivota en la jamba de bisagra");
  nearPoint(leaf.points[1], { x: 1_050, y: 1_025 }, "y se abre 900 perpendicular al muro");
  const arc = openingPaths[3];
  nearPoint(arc.points[0], { x: 1_050, y: 1_025 }, "el arco arranca en la punta de la hoja");
  nearPoint(
    arc.points[arc.points.length - 1],
    { x: 1_950, y: 125 },
    "y cierra en el canto opuesto: 90° exactos",
  );
}

// --- 2. mover el muro mueve la puerta, sin tocarla ----------------------------
{
  const document = documentOf([wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 }), door("p1", "m1", 1_500)]);
  const before = paths(document, "p1").map((path) => path.points.map((point) => ({ ...point })));

  // MOVE se aplica al MURO y NADA MÁS. La puerta no entra en el lote.
  const moved = executeCadEntityCommandBatch(
    document,
    [{ type: "transform", entityId: "m1", transform: { translation: { x: 700, y: -300 } } }],
    "MOVE",
  );
  const after = paths(moved.document, "p1");
  ok(after.length === before.length, "la puerta sigue teniendo los mismos trazos tras mover el muro");
  before.forEach((path, index) =>
    path.forEach((point, vertex) => {
      nearPoint(
        after[index].points[vertex],
        { x: point.x + 700, y: point.y - 300 },
        `la puerta viajó con el muro (trazo ${index}, vértice ${vertex})`,
      );
    }),
  );

  const opening = moved.document.entities.find((entity) => entity.id === "p1")!;
  assert.deepEqual(
    opening,
    document.entities.find((entity) => entity.id === "p1"),
    "y la entidad del hueco no cambió NI UN CAMPO: se movió su marco, no ella",
  );
  checks += 1;

  // La invalidación del pipeline tiene que nombrar la puerta: sin eso quedaría
  // pintada en su sitio de antes, sin error y sin aviso.
  const host = nativeOf(moved.document, "m1");
  const dependents = CAD_ENTITY_REGISTRY.adapter(host).renderer.dependents;
  const declared = dependents?.(
    host,
    () => moved.document.entities.filter((entity) => entity.type === "opening") as CadNativeEntity[],
  );
  ok(declared?.includes("p1"), "el muro DECLARA que la puerta depende de él");
}

// --- 3. borrar el muro se lleva la puerta, en el mismo lote -------------------
{
  const document = documentOf([
    wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 }),
    door("p1", "m1", 1_500),
    door("p2", "m1", 3_000),
    wall("m2", { x: 0, y: 5_000 }, { x: 4_000, y: 5_000 }),
    door("p3", "m2", 2_000),
  ]);
  const result = executeCadEntityCommandBatch(document, [{ type: "delete", entityId: "m1" }], "ERASE");

  ok(
    result.deletedEntityIds.sort().join(",") === "m1,p1,p2",
    `el lote borra el muro y sus DOS huecos: ${result.deletedEntityIds.join(",")}`,
  );
  ok(
    !result.document.entities.some((entity) => entity.id === "p1" || entity.id === "p2"),
    "no queda ninguna puerta huérfana en el documento",
  );
  ok(
    !result.document.modelSpace.entityIds.includes("p1"),
    "ni un id fantasma en el orden de dibujo",
  );
  ok(
    result.document.entities.some((entity) => entity.id === "p3"),
    "la puerta del OTRO muro no se toca",
  );
  ok(
    result.document.meta.version === document.meta.version + 1,
    "y todo cabe en UN commit: un solo paso de deshacer",
  );
}

// --- 4. borrar la puerta cierra el hueco -------------------------------------
{
  const withDoor = documentOf([
    wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 }),
    door("p1", "m1", 1_500),
  ]);
  const solid = documentOf([wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 })]);
  const closed = executeCadEntityCommandBatch(withDoor, [{ type: "delete", entityId: "p1" }], "ERASE");

  assert.deepEqual(
    paths(closed.document, "m1"),
    paths(solid, "m1"),
    "borrada la puerta, el muro se dibuja EXACTAMENTE como uno que nunca la tuvo",
  );
  checks += 1;
  ok(
    paths(closed.document, "m1").some((path) => path.closed),
    "y su contorno vuelve a ser un anillo cerrado",
  );
}

// --- 5. lo que no cabe no se dibuja, y se dice por qué ------------------------
{
  const host = wall("m1", { x: 0, y: 0 }, { x: 1_000, y: 0 });
  const tooWide = door("p1", "m1", 500, 1_400);
  const fit = wallOpeningFit(host, tooWide);
  ok(!fit.ok, "un hueco más ancho que su muro no cabe");
  ok(
    !fit.ok && /no queda jamba/.test(fit.problem),
    `y el motivo nombra la jamba que falta: ${fit.ok ? "" : fit.problem}`,
  );

  const document = documentOf([host, tooWide]);
  ok(paths(document, "p1").length === 0, "el hueco imposible no dibuja NADA…");
  ok(
    paths(document, "m1").some((path) => path.closed),
    "…y el muro conserva su contorno entero: no se parte por un hueco que no existe",
  );

  const schedule = buildCadBimSchedule(document);
  ok(schedule.openings.length === 0, "la tabla de cantidades no lo cuenta…");
  ok(
    schedule.problems.some((problem) => problem.includes("p1")),
    "…y lo NOMBRA en los problemas en vez de descartarlo en silencio",
  );
}

// --- 6. escalar escala el hueco; reflejar cambia la mano ----------------------
{
  const document = documentOf([wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 }), door("p1", "m1", 1_500)]);
  const scaled = executeCadEntityCommandBatch(
    document,
    [
      { type: "transform", entityId: "m1", transform: { scale: 2, origin: { x: 0, y: 0 } } },
      { type: "transform", entityId: "p1", transform: { scale: 2, origin: { x: 0, y: 0 } } },
    ],
    "SCALE",
  );
  const opening = scaled.document.entities.find((entity) => entity.id === "p1") as CadOpeningEntity;
  near(opening.width, 1_800, "una planta al doble tiene puertas del doble");
  near(opening.position, 3_000, "y el hueco sigue en la misma proporción del muro");

  const mirrored = executeCadEntityCommandBatch(
    document,
    [
      {
        type: "transform",
        entityId: "p1",
        transform: { mirror: { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } } },
      },
    ],
    "MIRROR",
  );
  const flipped = mirrored.document.entities.find((entity) => entity.id === "p1") as CadOpeningEntity;
  ok(flipped.swing === "right", "reflejar cambia la mano de la hoja");
  near(flipped.width, 900, "sin tocar la anchura: una reflexión no escala");
  ok(flipped.hinge === "start", "y la bisagra sigue en el mismo extremo del eje");
}

// --- 7. el bloque del estudio sustituye al símbolo, no al alojamiento ---------
{
  const host = wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 });
  const opening: CadOpeningEntity = { ...door("p1", "m1", 1_500), symbolBlock: "PUERTA-ESTUDIO" };
  const document = documentOf([host, opening]);
  // Un bloque de prueba PROPIO: una hoja recta de 1.000 de ancho. No depende de
  // ninguna biblioteca concreta — el alojamiento tiene que funcionar con el
  // bloque de puerta de cualquiera.
  document.blocks = [
    {
      id: "PUERTA-ESTUDIO",
      name: "PUERTA-ESTUDIO",
      basePoint: { x: 0, y: 0, z: 0 },
      entities: [
        {
          id: "hoja",
          type: "line",
          start: { x: -500, y: 0, z: 0 },
          end: { x: 500, y: 0, z: 0 },
          layer: "0",
        },
      ],
    },
  ];

  const drawn = paths(document, "p1");
  ok(drawn.length === 3, "jambas + el trazo del bloque, y nada del símbolo de fábrica");
  const leaf = drawn[2];
  near(
    Math.abs(leaf.points[1].x - leaf.points[0].x),
    900,
    "el bloque se ESCALA a la anchura del hueco, no a la suya",
  );
  nearPoint(jambMid(drawn[0], drawn[1]), { x: 1_500, y: 0 }, "y queda centrado en el vano");

  // El alojamiento no cambia: el muro se parte igual que con el símbolo propio.
  const leftPieces = paths(document, "m1").filter(
    (path) => path.points.length === 2 && path.points.every((point) => Math.abs(point.y - 125) < 1e-9),
  );
  ok(leftPieces.length === 2, "el bloque no cambia dónde se parte el muro");
}

/** Centro del vano: la media de los cuatro extremos de las dos jambas. */
function jambMid(
  first: { points: { x: number; y: number }[] },
  second: { points: { x: number; y: number }[] },
): { x: number; y: number } {
  const corners = [...first.points, ...second.points];
  return {
    x: corners.reduce((total, point) => total + point.x, 0) / corners.length,
    y: corners.reduce((total, point) => total + point.y, 0) / corners.length,
  };
}

// --- 8. con la esquina en inglete, el vano cae donde toca en LAS DOS caras ----
{
  // L en ángulo recto: m1 de (0,0) a (4000,0) y m2 de (0,0) a (0,3000), ambos de
  // grosor 250. El inglete RECORTA la cara interior de m1 (y=+125) hasta x=+125
  // y EXTIENDE la exterior (y=−125) hasta x=−125, así que las dos caras dejan de
  // medir lo mismo. Es el caso que obliga a partir por parámetro de EJE y no por
  // fracción de cara.
  const document = documentOf([
    wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 }),
    wall("m2", { x: 0, y: 0 }, { x: 0, y: 3_000 }),
    door("p1", "m1", 1_500),
  ]);

  const jambs = paths(document, "p1").slice(0, 2);
  nearPoint(jambs[0].points[0], { x: 1_050, y: 125 }, "la jamba llega a la cara recortada…");
  nearPoint(jambs[0].points[1], { x: 1_050, y: -125 }, "…y a la extendida, en el MISMO x");
  nearPoint(jambs[1].points[0], { x: 1_950, y: 125 }, "y la segunda jamba, igual");
  nearPoint(jambs[1].points[1], { x: 1_950, y: -125 }, "en el otro canto del vano");

  // Las dos caras del muro arrancan en sitios DISTINTOS por el inglete: la
  // interior queda recortada hasta x=+125 y la exterior extendida hasta x=−125.
  // Aun así las dos se parten en 1.050 y 1.950, que es el vano medido sobre el
  // EJE. Partir por fracción de cara habría dado 1.018,75 en una y 1.077,7 en la
  // otra: el hueco se abriría torcido y no coincidiría con sus propias jambas.
  const faceAt = (y: number) =>
    paths(document, "m1")
      .filter(
        (path) =>
          path.points.length === 2 && path.points.every((point) => Math.abs(point.y - y) < 1e-9),
      )
      .sort((a, b) => a.points[0].x - b.points[0].x);

  const inner = faceAt(125);
  ok(inner.length === 2, "la cara recortada sale partida en dos tramos");
  near(inner[0].points[0].x, 125, "que arranca en el recorte del inglete…");
  near(inner[0].points[1].x, 1_050, "…y muere en el canto del vano");
  near(inner[1].points[0].x, 1_950, "el segundo tramo arranca en el otro canto");
  near(inner[1].points[1].x, 4_000, "y llega al testero final");

  const outer = faceAt(-125);
  ok(outer.length === 2, "y la cara extendida, también en dos");
  near(outer[0].points[0].x, -125, "arrancando en la punta del inglete, 250 más lejos…");
  near(outer[0].points[1].x, 1_050, "…y cortando en EL MISMO 1.050 que la otra cara");
  near(outer[1].points[0].x, 1_950, "y reanudando en el mismo 1.950");
}

// --- 9. derivar es LEER: el documento no cambia ------------------------------
{
  const document = documentOf([wall("m1", { x: 0, y: 0 }, { x: 4_000, y: 0 }), door("p1", "m1", 1_500)]);
  const before = JSON.stringify(document);
  paths(document, "m1");
  paths(document, "p1");
  buildCadBimSchedule(document);
  ok(JSON.stringify(document) === before, "dibujar y medir no tocan el documento");
  ok(
    !before.includes("1050"),
    "y el canto del vano (1050) no viaja en el documento: se deriva cada vez",
  );
}

console.log(
  `wall-openings: ${checks} aserciones verdes. Un hueco parte la cara del muro en su intervalo ` +
    `exacto y cruza con sus jambas de cara a cara; mover el muro arrastra la puerta sin cambiarle ` +
    `un campo; borrar el muro se lleva sus dos huecos en el mismo commit y sin dejar id fantasma; ` +
    `borrar la puerta devuelve el contorno cerrado byte a byte; lo que no cabe no se dibuja y se ` +
    `nombra; escalar escala y reflejar cambia la mano; y un bloque del estudio sustituye al ` +
    `símbolo sin tocar el alojamiento; y con la esquina en inglete el vano se abre en el mismo ` +
    `parámetro de eje en las dos caras, que tienen longitudes distintas.`,
);
