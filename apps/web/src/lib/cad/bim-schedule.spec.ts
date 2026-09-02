/**
 * El cuadro de áreas y la tabla de cantidades, con números calculados a mano.
 *
 * Lo que se fija aquí es que las dos tablas salen DEL MODELO y no de lo que
 * alguien tecleó: se monta una planta con muros y huecos, y se afirma el área
 * de cada local, la superficie de paramento ya descontados los huecos, y la
 * marca de cada tipo de carpintería — todo contra valores absolutos.
 *
 * Y lo que más importa de una tabla de cantidades: que cuando mueves un muro,
 * cambia. Un cuadro de áreas que sigue diciendo lo de ayer es peor que ninguno.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import type { CadOpeningEntity } from "./cad-entities-v7";
import type { CadWallEntity } from "./cad-entities-v6";
import { buildCadBimSchedule, detectCadRooms } from "./bim-schedule";
import { executeCadEntityCommandBatch } from "./entity-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
const near = (
  actual: number | undefined,
  expected: number,
  what: string,
  epsilon = 1e-6,
) => {
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) <= epsilon,
    `${what}: ${actual}, se esperaba ${expected}`,
  );
  checks += 1;
};

/**
 * El anillo tiene EXACTAMENTE las esquinas esperadas, como conjunto — el
 * algoritmo no promete por dónde empieza a recorrer la cara, así que exigir
 * un orden concreto sería afirmar un detalle de implementación, no el
 * contorno real del local.
 */
function ringHasCorners(
  ring: { x: number; y: number }[],
  expected: readonly [number, number][],
  what: string,
): void {
  assert.equal(
    ring.length,
    expected.length,
    `${what}: ${ring.length} vértices, se esperaban ${expected.length}`,
  );
  for (const [ex, ey] of expected) {
    const found = ring.some(
      (point) => Math.abs(point.x - ex) < 1e-6 && Math.abs(point.y - ey) < 1e-6,
    );
    assert.ok(
      found,
      `${what}: falta la esquina (${ex}, ${ey}) en ${JSON.stringify(ring)}`,
    );
  }
  checks += 1;
}

/** Área con signo del anillo por la fórmula del cordón (shoelace), independiente del algoritmo. */
function shoelaceArea(ring: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/**
 * El anillo CONTIENE cada esquina esperada, sin exigir un total de vértices —
 * a diferencia de `ringHasCorners`. Hace falta para el contorno exterior: un
 * tabique interior que topa contra el perímetro parte ese lado en dos, y el
 * anillo exterior arrastra ese punto intermedio aunque no sea una esquina real
 * del rectángulo. Esa arista partida no distorsiona nada — son tres puntos
 * colineales — así que exigir un recuento exacto ahí afirmaría un detalle de
 * partición interna, no la forma real del contorno.
 */
function ringContainsCorners(
  ring: { x: number; y: number }[],
  expected: readonly [number, number][],
  what: string,
): void {
  for (const [ex, ey] of expected) {
    const found = ring.some(
      (point) => Math.abs(point.x - ex) < 1e-6 && Math.abs(point.y - ey) < 1e-6,
    );
    assert.ok(
      found,
      `${what}: falta la esquina (${ex}, ${ey}) en ${JSON.stringify(ring)}`,
    );
  }
  checks += 1;
}

const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
  thickness = 250,
): CadWallEntity => ({
  id,
  type: "wall",
  start: { x: start[0], y: start[1], z: 0 },
  end: { x: end[0], y: end[1], z: 0 },
  thickness,
  height: 2_400,
  layer: "MUROS",
});

function documentOf(
  entities: (CadWallEntity | CadOpeningEntity)[],
): CadDocument {
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [
      {
        id: "MUROS",
        name: "MUROS",
        color: "#ffffff",
        visible: true,
        locked: false,
      },
    ],
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

/** Rectángulo de 5.000 × 4.000 a ejes, con muros de 250. */
const shell = (): CadWallEntity[] => [
  wall("sur", [0, 0], [5_000, 0]),
  wall("este", [5_000, 0], [5_000, 4_000]),
  wall("norte", [5_000, 4_000], [0, 4_000]),
  wall("oeste", [0, 4_000], [0, 0]),
];

// --- 1. un local: área a ejes y área útil, las dos, y distintas --------------
{
  const schedule = buildCadBimSchedule(documentOf(shell()));
  ok(
    schedule.rooms.length === 1,
    `los cuatro muros cierran UN local: ${schedule.rooms.length}`,
  );
  const room = schedule.rooms[0];
  ok(room.id === "L-01", "que se numera L-01");
  near(room.axisArea, 20_000_000, "área a ejes: 5.000 × 4.000");
  // El área útil mete cada lado medio grosor: (5000−250) × (4000−250).
  near(room.clearArea, 17_812_500, "área útil: 4.750 × 3.750");
  near(room.perimeter, 18_000, "perímetro a ejes");
  ok(
    room.wallIds.join(",") === "este,norte,oeste,sur",
    "y nombra los cuatro muros que lo cierran",
  );
  ok(schedule.problems.length === 0, "sin problemas que declarar");
  ringHasCorners(
    room.ring,
    [
      [0, 0],
      [5_000, 0],
      [5_000, 4_000],
      [0, 4_000],
    ],
    "anillo del único local",
  );
  near(
    shoelaceArea(room.ring),
    room.axisArea,
    "el área del cordón sobre el anillo coincide con axisArea",
  );
  // Con un solo local, el contorno exterior es EL MISMO rectángulo que el
  // local, en sentido positivo: nada lo parte, así que las cuatro esquinas y
  // ninguna más.
  ok(
    schedule.exteriorRing !== null,
    "con muros cerrados hay contorno exterior",
  );
  ringHasCorners(
    schedule.exteriorRing!,
    [
      [0, 0],
      [5_000, 0],
      [5_000, 4_000],
      [0, 4_000],
    ],
    "anillo exterior con un solo local",
  );
  near(
    shoelaceArea(schedule.exteriorRing!),
    room.axisArea,
    "el exterior encierra la misma área que el local único",
  );
}

// --- 2. una T parte la planta en dos locales, sin que nadie los dibuje --------
{
  const schedule = buildCadBimSchedule(
    documentOf([...shell(), wall("tabique", [2_000, 0], [2_000, 4_000], 150)]),
  );
  ok(
    schedule.rooms.length === 2,
    `el tabique crea DOS locales: ${schedule.rooms.length}`,
  );
  const [first, second] = schedule.rooms;
  near(
    first.axisArea,
    12_000_000,
    "el mayor, a la derecha del tabique: 3.000 × 4.000",
  );
  near(second.axisArea, 8_000_000, "el menor, a la izquierda: 2.000 × 4.000");
  // Útil de la derecha: (3000 − 75 − 125) × (4000 − 125 − 125).
  near(
    first.clearArea,
    10_500_000,
    "área útil del mayor, con el medio tabique descontado",
  );
  near(second.clearArea, 6_750_000, "y la del menor");
  near(
    first.axisArea + second.axisArea,
    20_000_000,
    "las dos suman la planta entera: no se pierde ni se inventa superficie",
  );
  ok(
    !schedule.rooms.some((room) => room.axisArea > 19_000_000),
    "y el contorno exterior NO se cuenta como local",
  );
  // El anillo de cada local ya NO cruza el tabique — es la comprobación
  // geométrica de que "una T parte la planta" no es sólo una cifra de área:
  // el piso/cielorraso 3D que se extruya de este anillo tampoco lo cruzará.
  ringHasCorners(
    first.ring,
    [
      [2_000, 0],
      [5_000, 0],
      [5_000, 4_000],
      [2_000, 4_000],
    ],
    "anillo del local mayor (a la derecha del tabique)",
  );
  ringHasCorners(
    second.ring,
    [
      [0, 0],
      [2_000, 0],
      [2_000, 4_000],
      [0, 4_000],
    ],
    "anillo del local menor (a la izquierda del tabique)",
  );
  near(
    shoelaceArea(first.ring),
    first.axisArea,
    "cordón del mayor coincide con axisArea",
  );
  near(
    shoelaceArea(second.ring),
    second.axisArea,
    "cordón del menor coincide con axisArea",
  );
  // El contorno exterior tiene que ser la HUELLA ENTERA del edificio (5.000 ×
  // 4.000), no el interior de ninguno de los dos locales — es el anillo que
  // extruye la cubierta, y una cubierta que sólo cubriera el local mayor
  // dejaría el menor a la intemperie. El tabique toca el muro sur y el norte
  // exactamente en (2.000, 0) y (2.000, 4.000): esos dos puntos parten esos
  // lados del perímetro en dos tramos colineales, así que el anillo trae seis
  // vértices y no cuatro — de ahí `ringContainsCorners` en vez de
  // `ringHasCorners` para las cuatro esquinas reales del rectángulo.
  ok(
    schedule.exteriorRing !== null,
    "con el tabique, sigue habiendo contorno exterior",
  );
  ringContainsCorners(
    schedule.exteriorRing!,
    [
      [0, 0],
      [5_000, 0],
      [5_000, 4_000],
      [0, 4_000],
    ],
    "anillo exterior con tabique en T",
  );
  near(
    shoelaceArea(schedule.exteriorRing!),
    first.axisArea + second.axisArea,
    "el exterior cubre la huella entera del edificio, no el interior de un solo local",
  );
}

// --- 3. cantidades de muro con los huecos descontados ------------------------
{
  const puerta: CadOpeningEntity = {
    id: "p1",
    type: "opening",
    kind: "door",
    hostId: "sur",
    position: 2_500,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
    layer: "MUROS",
  };
  const ventana: CadOpeningEntity = {
    ...puerta,
    id: "v1",
    kind: "window",
    hostId: "norte",
    position: 2_000,
    width: 1_200,
    height: 1_200,
    sill: 900,
  };
  const schedule = buildCadBimSchedule(
    documentOf([...shell(), puerta, ventana]),
  );

  ok(
    schedule.walls.length === 1,
    "los cuatro muros comparten capa y grosor: UNA fila",
  );
  const row = schedule.walls[0];
  ok(row.count === 4, "con cuatro unidades");
  near(row.length, 18_000, "18 m de eje");
  near(
    row.openingArea,
    900 * 2_100 + 1_200 * 1_200,
    "hueco descontado: puerta + ventana",
  );
  near(
    row.faceArea,
    18_000 * 2_400 - (900 * 2_100 + 1_200 * 1_200),
    "paramento neto",
  );
  // Las CUATRO esquinas en L del cascarón: cada una comparte un prisma de
  // 125×125 mm en planta (la mitad del grosor de cada muro se mete en la
  // huella del vecino) por 2400 de alto. Antes ese volumen se cobraba DOS
  // veces — una por muro — y la tabla presupuestaba 0,15 m³ de fábrica de más
  // en una vivienda mínima.
  const cornerOverlap = 125 * 125 * 2_400 * 4;
  near(
    row.junctionVolume,
    cornerOverlap,
    "el solape de las cuatro esquinas se declara para poder auditarlo",
  );
  near(
    row.volume,
    row.faceArea * 250 - cornerOverlap,
    "volumen de fábrica sobre el paramento neto, sin doble conteo de esquinas",
  );

  ok(schedule.openings.length === 2, "dos tipos de carpintería");
  ok(
    schedule.openings.map((opening) => opening.mark).join(" ") ===
      "P-090x210 V-120x120",
    `con la marca de despacho: ${schedule.openings.map((opening) => opening.mark).join(" ")}`,
  );
  ok(
    schedule.openings.every((opening) => opening.count === 1),
    "una unidad de cada",
  );
}

// --- 4. dos puertas iguales son UNA fila con dos unidades --------------------
{
  const base: CadOpeningEntity = {
    id: "p1",
    type: "opening",
    kind: "door",
    hostId: "sur",
    position: 1_000,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
    layer: "MUROS",
  };
  const schedule = buildCadBimSchedule(
    documentOf([
      ...shell(),
      base,
      { ...base, id: "p2", position: 3_500, swing: "right" },
    ]),
  );
  ok(
    schedule.openings.length === 1,
    "la mano no crea un tipo nuevo de carpintería",
  );
  ok(schedule.openings[0].count === 2, "y la fila cuenta DOS unidades");
}

// --- 5. la tabla cambia cuando cambia el modelo ------------------------------
{
  const document = documentOf(shell());
  const before = buildCadBimSchedule(document);
  // Se alarga el muro sur y con él los dos que lo tocan: la planta pasa a
  // 6.000 × 4.000. Nadie teclea el área nueva en ninguna parte.
  const stretched = executeCadEntityCommandBatch(
    document,
    [
      { type: "properties", entityId: "sur", patch: { endX: 6_000 } },
      {
        type: "properties",
        entityId: "este",
        patch: { startX: 6_000, endX: 6_000 },
      },
      { type: "properties", entityId: "norte", patch: { startX: 6_000 } },
    ],
    "PROPERTIES",
  );
  const after = buildCadBimSchedule(stretched.document);
  near(before.rooms[0].axisArea, 20_000_000, "antes, 20 m²");
  near(
    after.rooms[0].axisArea,
    24_000_000,
    "después, 24 m²: la tabla siguió al modelo",
  );
  near(after.walls[0].length, 20_000, "y la medición de muro también");
}

// --- 6. un hueco huérfano no se cuenta, y se DICE ----------------------------
{
  const orphan: CadOpeningEntity = {
    id: "fantasma",
    type: "opening",
    kind: "door",
    hostId: "muro-que-no-existe",
    position: 1_000,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
    layer: "MUROS",
  };
  const schedule = buildCadBimSchedule(documentOf([...shell(), orphan]));
  ok(schedule.openings.length === 0, "no entra en la tabla de carpintería…");
  near(
    schedule.walls[0].openingArea,
    0,
    "…ni descuenta paramento de ningún muro…",
  );
  ok(
    schedule.problems.some((problem) => problem.includes("fantasma")),
    "…y aparece nombrado en los problemas",
  );
}

// --- 7. una planta que NO cierra no tiene contorno exterior -----------------
// Regresión: el recorrido de cara sobre un camino ABIERTO —aquí, tres de los
// cuatro lados del rectángulo, sin el muro oeste— traza el mismo tramo de ida
// y de vuelta y cancela a área EXACTAMENTE cero. Ese cero no es "el
// exterior": tratarlo como tal colaría un anillo degenerado (puntos
// repetidos, no encierra nada) al piso y la cubierta de `room-solid.ts`.
{
  const { rooms, exteriorRing } = detectCadRooms(shell().slice(0, 3));
  ok(rooms.length === 0, "tres lados de un rectángulo no cierran ningún local");
  ok(
    exteriorRing === null,
    "…ni tienen contorno exterior: la única cara que sale es degenerada, de área cero",
  );
}


// --- Ola E (2026-09-02): el local toma el nombre del rótulo que tiene dentro --
{
  // Dos locales: un tabique en x = 3.000 parte el rectángulo de 5.000 × 4.000.
  const walls = [...shell(), wall("tabique", [3_000, 0], [3_000, 4_000])];
  const label = (id: string, x: number, y: number, text: string, height = 200) =>
    ({ id, type: "text", x, y, text, height, layer: "MUROS" }) as never;
  const doc = documentOf([
    ...walls,
    label("r1", 1_500, 2_000, "RECÁMARA PRINCIPAL"),
    // Una nota pequeña en la esquina del mismo local no lo rebautiza.
    label("nota", 200, 200, "ver detalle 3", 60),
    label("b1", 4_000, 2_000, "baño"),
  ]);
  const schedule = buildCadBimSchedule(doc);
  ok(schedule.rooms.length === 2, `dos locales: ${schedule.rooms.length}`);
  const grande = schedule.rooms.find((room) => room.axisArea === 12_000_000);
  const chico = schedule.rooms.find((room) => room.axisArea === 8_000_000);
  ok(grande?.name === "RECÁMARA PRINCIPAL", `el local grande se llama como su rótulo grande: ${grande?.name}`);
  ok(grande?.labelId === "r1", "y sabe de qué entidad salió el nombre");
  ok(grande?.use === "Recámara", `el clasificador en español reconoce el uso: ${grande?.use}`);
  ok(chico?.name === "baño" && chico.use === "Baño", `el chico: ${chico?.name} / ${chico?.use}`);
  ok(grande?.id === "L-01" && chico?.id === "L-02", "la clave geométrica sigue existiendo debajo del nombre");

  // Sin rótulo no hay nombre: la fila enseña la clave, no un invento.
  const sinRotulo = buildCadBimSchedule(documentOf(shell()));
  ok(sinRotulo.rooms[0].name === undefined && sinRotulo.rooms[0].use === undefined, "sin rótulo, sin nombre ni uso");
  // Un rótulo que no es un uso conocido da nombre pero no uso.
  const raro = buildCadBimSchedule(documentOf([...shell(), label("x", 2_500, 2_000, "ZONA 7")]));
  ok(raro.rooms[0].name === "ZONA 7" && raro.rooms[0].use === undefined, "«ZONA 7» es el nombre y no tiene uso canónico");
}

// --- Ola E: dos antepechos distintos son dos filas de carpintería -------------
{
  const opening = (id: string, position: number, sill: number): CadOpeningEntity => ({
    id, type: "opening", kind: "window", hostId: "sur", position, width: 1_200, height: 1_200, sill,
    swing: "left", hinge: "start", layer: "MUROS",
  });
  const schedule = buildCadBimSchedule(documentOf([...shell(), opening("v1", 1_000, 900), opening("v2", 2_500, 900), opening("v3", 4_000, 1_500)]));
  ok(schedule.openings.length === 2, `misma marca, dos antepechos: dos filas (${schedule.openings.length})`);
  ok(schedule.openings[0].mark === "V-120x120" && schedule.openings[0].sill === 900 && schedule.openings[0].count === 2, "la de antepecho 900 cuenta dos");
  ok(schedule.openings[1].sill === 1_500 && schedule.openings[1].count === 1, "la de 1.500 cuenta una");
}

console.log(
  `bim-schedule: ${checks} aserciones verdes. El cuadro de áreas sale de los ejes de los muros ` +
    `—un local, dos con un tabique en T, el exterior nunca—, con área a ejes y área útil calculadas ` +
    `contra valores absolutos; la medición descuenta la superficie de cada hueco de su muro ` +
    `anfitrión, agrupa la carpintería por marca de despacho, y cambia cuando cambia el modelo.`,
);
