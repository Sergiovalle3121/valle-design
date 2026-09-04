/**
 * Las tres áreas de un local, contra números calculados a mano.
 *
 * Lo que se fija aquí no es sólo que `builtArea` traiga una cifra: es la
 * PROPIEDAD que hace que esa cifra sirva para una licencia — que la suma de las
 * áreas construidas de todos los locales sea exactamente la huella construida
 * de la planta, o sea el contorno exterior desplazado medio grosor hacia fuera.
 * Sin esa identidad, el campo sería un número más que nadie podría defender
 * delante de una ventanilla.
 *
 * Se comprueba sobre dos plantas distintas a propósito: un rectángulo partido
 * por un tabique (el caso de manual) y una planta en L con una esquina entrante
 * (el caso que delata si el criterio sólo funcionaba en rectángulos). La huella
 * se calcula por un camino DISTINTO del que la produce —desde el anillo
 * exterior, no sumando locales— porque comprobar una suma con la misma suma no
 * comprueba nada.
 */
import { strict as assert } from "node:assert";
import type { CadPoint2 } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";
import { detectCadRooms } from "./bim-schedule";
import { cadOffsetRingArea } from "./bim-areas";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function near(
  actual: number | undefined | null,
  expected: number,
  what: string,
  epsilon = 1e-9,
): void {
  assert.ok(
    actual !== undefined &&
      actual !== null &&
      Math.abs(actual - expected) <= epsilon,
    `${what}: ${actual}, se esperaba ${expected}`,
  );
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

/**
 * La huella construida medida DESDE EL CONTORNO EXTERIOR: el anillo que expone
 * `detectCadRooms`, desplazado medio grosor hacia fuera. Es el camino
 * independiente contra el que se contrasta la suma de los locales.
 *
 * Antes hay que quitar los vértices COLINEALES: un tabique que topa contra el
 * perímetro parte ese lado en dos tramos alineados, y dos lados paralelos
 * consecutivos no tienen esquina que resolver. No es una licencia geométrica —
 * son literalmente el mismo lado partido en dos.
 */
function huellaDelContorno(
  ring: readonly CadPoint2[],
  thickness: number,
): number {
  const corners = ring.filter((point, index) => {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const cross =
      (point.x - previous.x) * (next.y - point.y) -
      (point.y - previous.y) * (next.x - point.x);
    return Math.abs(cross) > 1e-9;
  });
  // El anillo exterior se expone en sentido positivo, así que HACIA FUERA es
  // el desplazamiento negativo (a la derecha del recorrido).
  const result = cadOffsetRingArea(
    corners.map((from, index) => ({
      from,
      to: corners[(index + 1) % corners.length],
      offset: -thickness / 2,
    })),
  );
  assert.ok(
    result.area !== null,
    `el contorno exterior desplazado tiene que cerrar: ${result.failure}`,
  );
  return result.area as number;
}

// --- 1. la maquinaria: desplazamiento cero, paralelos, degenerado -----------
{
  const cuadrado: CadPoint2[] = [
    { x: 0, y: 0 },
    { x: 1_000, y: 0 },
    { x: 1_000, y: 1_000 },
    { x: 0, y: 1_000 },
  ];
  const sides = (offset: number) =>
    cuadrado.map((from, index) => ({
      from,
      to: cuadrado[(index + 1) % cuadrado.length],
      offset,
    }));
  near(
    cadOffsetRingArea(sides(0)).area,
    1_000_000,
    "sin desplazar, es el área del propio anillo",
  );
  near(
    cadOffsetRingArea(sides(100)).area,
    800 * 800,
    "metido 100 por lado: 800 × 800",
  );
  near(
    cadOffsetRingArea(sides(-100)).area,
    1_200 * 1_200,
    "sacado 100 por lado: 1.200 × 1.200",
  );
  const colapsado = cadOffsetRingArea(sides(600));
  ok(
    colapsado.area === null && colapsado.failure === "collapsed",
    `metido más que su propia mitad, el contorno se cierra sobre sí mismo: ${JSON.stringify(colapsado)}`,
  );
  const paralelo = cadOffsetRingArea([
    { from: { x: 0, y: 0 }, to: { x: 500, y: 0 }, offset: 0 },
    { from: { x: 500, y: 0 }, to: { x: 1_000, y: 0 }, offset: 0 },
    { from: { x: 1_000, y: 0 }, to: { x: 1_000, y: 1_000 }, offset: 0 },
    { from: { x: 1_000, y: 1_000 }, to: { x: 0, y: 0 }, offset: 0 },
  ]);
  ok(
    paralelo.area === null && paralelo.failure === "parallel",
    `dos lados consecutivos alineados no tienen esquina: ${JSON.stringify(paralelo)}`,
  );
  const degenerado = cadOffsetRingArea([
    { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, offset: 0 },
    { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, offset: 0 },
    { from: { x: 100, y: 0 }, to: { x: 0, y: 100 }, offset: 0 },
  ]);
  ok(
    degenerado.area === null && degenerado.failure === "degenerate",
    `un lado de longitud nula no define recta: ${JSON.stringify(degenerado)}`,
  );
}

// --- 2. dos locales separados por un tabique: las tres áreas, a mano --------
// Rectángulo de 5.000 × 4.000 a ejes con muros de 250, partido en x = 2.000
// por un tabique de 150.
{
  const planta = [
    wall("sur", [0, 0], [5_000, 0]),
    wall("este", [5_000, 0], [5_000, 4_000]),
    wall("norte", [5_000, 4_000], [0, 4_000]),
    wall("oeste", [0, 4_000], [0, 0]),
    wall("tabique", [2_000, 0], [2_000, 4_000], 150),
  ];
  const { rooms, exteriorRing, builtArea, problems } = detectCadRooms(planta);
  ok(rooms.length === 2, `el tabique parte la planta en dos: ${rooms.length}`);
  ok(problems.length === 0, "y no hay nada que declarar roto");

  const derecha = rooms.find((room) => room.axisArea === 12_000_000);
  const izquierda = rooms.find((room) => room.axisArea === 8_000_000);
  ok(derecha !== undefined && izquierda !== undefined, "los dos locales salen");

  // Derecha, a ejes: 3.000 × 4.000.
  near(derecha!.axisArea, 12_000_000, "derecha, a ejes");
  // Útil: los cuatro lados medio grosor hacia dentro — 75 el tabique, 125 los
  // perimetrales: (3.000 − 75 − 125) × (4.000 − 125 − 125) = 2.800 × 3.750.
  near(derecha!.clearArea, 10_500_000, "derecha, útil: 2.800 × 3.750");
  // Construida: los tres perimetrales salen 125 a paño exterior y el tabique se
  // queda en su eje — (3.000 + 125) × (4.000 + 125 + 125) = 3.125 × 4.250.
  near(derecha!.builtArea, 13_281_250, "derecha, construida: 3.125 × 4.250");
  near(
    derecha!.wallShareArea,
    13_281_250 - 10_500_000,
    "derecha, la fábrica que le toca es la diferencia entre las dos",
  );

  // Izquierda, a ejes: 2.000 × 4.000.
  near(izquierda!.axisArea, 8_000_000, "izquierda, a ejes");
  // Útil: (2.000 − 125 − 75) × 3.750 = 1.800 × 3.750.
  near(izquierda!.clearArea, 6_750_000, "izquierda, útil: 1.800 × 3.750");
  // Construida: (2.000 + 125) × 4.250 = 2.125 × 4.250.
  near(izquierda!.builtArea, 9_031_250, "izquierda, construida: 2.125 × 4.250");
  near(
    izquierda!.wallShareArea,
    9_031_250 - 6_750_000,
    "izquierda, su parte de fábrica",
  );

  ok(
    derecha!.builtArea! > derecha!.axisArea &&
      derecha!.axisArea > derecha!.clearArea!,
    "y las tres van en el orden que tienen que ir: construida > ejes > útil",
  );

  // LA IDENTIDAD. La huella se mide desde el contorno exterior, que no sabe
  // nada de cómo se repartieron los locales.
  ok(exteriorRing !== null, "la planta cierra y tiene contorno exterior");
  const huella = huellaDelContorno(exteriorRing!, 250);
  near(huella, 5_250 * 4_250, "la huella a paño exterior: 5.250 × 4.250");
  near(
    builtArea,
    huella,
    "la suma de las construidas ES la huella construida de la planta",
  );
  near(
    derecha!.builtArea! + izquierda!.builtArea!,
    huella,
    "…y sumada local a local da lo mismo: los locales tapizan la huella sin hueco ni solape",
  );

  // Partir un cuarto no construye ni un metro más: la huella del rectángulo sin
  // tabique es la MISMA. Es la comprobación de que el medianero se mide al eje
  // y no a paño por los dos lados, que sería contarlo dos veces.
  const sinTabique = detectCadRooms(planta.slice(0, 4));
  ok(sinTabique.rooms.length === 1, "sin tabique hay un solo local");
  near(
    sinTabique.builtArea,
    huella,
    "y la huella construida de la planta no cambia por partirla",
  );
}

// --- 3. planta en L: la identidad no era un artefacto del rectángulo --------
// Contorno (0,0) (6.000,0) (6.000,3.000) (3.000,3.000) (3.000,5.000) (0,5.000),
// con muros de 250 y un tabique de 150 en x = 2.000 de sur a norte.
{
  const { rooms, exteriorRing, builtArea, problems } = detectCadRooms([
    wall("sur", [0, 0], [6_000, 0]),
    wall("este", [6_000, 0], [6_000, 3_000]),
    wall("norte-bajo", [6_000, 3_000], [3_000, 3_000]),
    wall("este-alto", [3_000, 3_000], [3_000, 5_000]),
    wall("norte-alto", [3_000, 5_000], [0, 5_000]),
    wall("oeste", [0, 5_000], [0, 0]),
    wall("tabique", [2_000, 0], [2_000, 5_000], 150),
  ]);
  ok(rooms.length === 2, `la L da dos locales: ${rooms.length}`);
  ok(problems.length === 0, "sin nada roto que declarar");
  const ele = rooms.find((room) => room.ring.length === 6);
  const recto = rooms.find((room) => room.ring.length === 4);
  ok(ele !== undefined && recto !== undefined, "uno en L y otro rectangular");

  // El local en L: 4.000 × 3.000 + 1.000 × 2.000 a ejes.
  near(ele!.axisArea, 14_000_000, "el local en L, a ejes");
  // Construida: [2.000, 6.125] × [−125, 3.125] más [2.000, 3.125] × [3.125, 5.125].
  near(
    ele!.builtArea,
    4_125 * 3_250 + 1_125 * 2_000,
    "el local en L, construida — la esquina entrante también sale a paño",
  );
  // Útil: [2.075, 5.875] × [125, 2.875] más [2.075, 2.875] × [2.875, 4.875].
  near(ele!.clearArea, 3_800 * 2_750 + 800 * 2_000, "el local en L, útil");
  near(recto!.axisArea, 10_000_000, "el rectangular, a ejes: 2.000 × 5.000");
  near(
    recto!.builtArea,
    2_125 * 5_250,
    "el rectangular, construida: 2.125 × 5.250",
  );

  const huella = huellaDelContorno(exteriorRing!, 250);
  near(
    huella,
    6_250 * 3_250 + 3_250 * 2_000,
    "la huella de la L a paño exterior",
  );
  near(
    builtArea,
    huella,
    "y la suma de las construidas la iguala también con una esquina entrante",
  );
}

// --- 4. lados paralelos consecutivos: se dice, no se aproxima ---------------
// El muro sur dibujado en DOS tramos alineados deja el anillo del local con dos
// lados consecutivos paralelos. No hay esquina que resolver.
{
  const { rooms, builtArea, problems } = detectCadRooms([
    wall("sur-a", [0, 0], [2_000, 0]),
    wall("sur-b", [2_000, 0], [5_000, 0]),
    wall("este", [5_000, 0], [5_000, 4_000]),
    wall("norte", [5_000, 4_000], [0, 4_000]),
    wall("oeste", [0, 4_000], [0, 0]),
  ]);
  ok(rooms.length === 1, `sigue habiendo un local: ${rooms.length}`);
  near(rooms[0].axisArea, 20_000_000, "con su área a ejes, que sí está definida");
  ok(rooms[0].builtArea === undefined, "pero sin área construida");
  ok(rooms[0].clearArea === undefined, "ni área útil");
  ok(rooms[0].wallShareArea === undefined, "ni parte de fábrica que repartir");
  ok(
    problems.some(
      (problem) =>
        problem.includes("lados paralelos consecutivos") &&
        problem.includes("construida"),
    ),
    `y el motivo se nombra: ${JSON.stringify(problems)}`,
  );
  ok(
    builtArea === null,
    "sin la construida de un local no hay huella de planta: un total incompleto no se presenta como total",
  );
}

console.log(
  `bim-areas: ${checks} aserciones verdes. Las tres áreas de cada local salen del MISMO anillo de ejes ` +
    `desplazando cada lado —dentro medio grosor para la útil, fuera medio grosor sólo en los muros ` +
    `perimetrales para la construida— y la suma de las construidas iguala la huella medida desde el ` +
    `contorno exterior, tanto en un rectángulo partido por un tabique como en una planta en L; ` +
    `cuando dos lados consecutivos son paralelos las dos áreas se declaran ausentes con su motivo.`,
);
