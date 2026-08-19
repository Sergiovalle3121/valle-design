/**
 * El índice espacial de nube de puntos: primero CORRECTO, después rápido.
 *
 * Un índice que devuelve deprisa la respuesta equivocada es peor que no tener
 * índice, porque nadie lo revisa: la consulta responde, la pantalla dibuja algo
 * y el error sólo aparece cuando alguien mide. Por eso esta spec no cronometra
 * nada. Compara TODA consulta contra la fuerza bruta sobre los mismos puntos:
 *
 *   · La ventana rectangular, contra recorrer los puntos uno a uno.
 *   · El radio, igual.
 *   · El vecino más próximo, contra el mínimo real — y no basta con que
 *     devuelva «uno cerca»: tiene que devolver EL más cercano, incluido el caso
 *     en que el punto de consulta cae pegado al borde de su celda, que es donde
 *     una búsqueda que corta demasiado pronto se equivoca.
 *
 * Las cifras de rendimiento están en `docs/cad/evidence/point-cloud-scale.json`,
 * que las genera un script con la máquina declarada. Un tiempo dentro de una
 * spec sería un umbral que falla por contención de máquina y no por regresión.
 */
import { strict as assert } from "node:assert";
import { GeoError } from "./errors";
import { GeoPointIndex } from "./point-index";

/** Nube repetible: misma semilla, mismos puntos, en cualquier máquina. */
function scatter(count: number, seed = 7): { xs: Float64Array; ys: Float64Array; zs: Float64Array } {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    xs[index] = 660_000 + next() * 1_000;
    ys[index] = 2_140_000 + next() * 1_000;
    zs[index] = 1_500 + next() * 60;
  }
  return { xs, ys, zs };
}

const { xs, ys, zs } = scatter(20_000);
const index = GeoPointIndex.build(xs, ys);
const stats = index.stats();
assert.equal(stats.pointCount, 20_000, "todos los puntos están en el índice");
assert.ok(stats.occupiedCells > 1_000, `la rejilla se reparte: ${stats.occupiedCells} celdas`);
assert.ok(
  stats.indexBytes < xs.byteLength,
  `el índice (${stats.indexBytes} B) tiene que costar menos que las coordenadas (${xs.byteLength} B)`,
);

// Ningún punto se pierde: la ventana que cubre todo tiene que devolverlos todos.
assert.equal(
  index.countInBox(-Infinity, -Infinity, Infinity, Infinity),
  20_000,
  "la ventana infinita devuelve la nube entera",
);

// ---------------------------------------------------------------------------
// Ventana rectangular contra fuerza bruta
// ---------------------------------------------------------------------------

const bruteBox = (minX: number, minY: number, maxX: number, maxY: number) => {
  const found: number[] = [];
  for (let i = 0; i < xs.length; i += 1)
    if (xs[i] >= minX && xs[i] <= maxX && ys[i] >= minY && ys[i] <= maxY) found.push(i);
  return found;
};

const windows: Array<[number, number, number, number]> = [
  // Ventana diminuta, la del zoom cerrado sobre un detalle del levantamiento.
  [660_100, 2_140_100, 660_101, 2_140_101],
  // Ventana normal de designación.
  [660_200, 2_140_300, 660_260, 2_140_340],
  // Ventana que cruza muchas celdas.
  [660_000, 2_140_000, 660_500, 2_140_500],
  // Ventana que se sale del rectángulo de la nube por dos lados.
  [659_500, 2_139_500, 660_050, 2_140_050],
  // Ventana entera.
  [659_000, 2_139_000, 661_500, 2_141_500],
  // Ventana degenerada: una sola línea. No puede reventar ni devolver de más.
  [660_300, 2_140_000, 660_300, 2_141_000],
  // Ventana fuera de la nube: cero resultados, sin error.
  [700_000, 2_200_000, 700_100, 2_200_100],
];
for (const [minX, minY, maxX, maxY] of windows) {
  const expected = bruteBox(minX, minY, maxX, maxY);
  const actual = index.queryBox(minX, minY, maxX, maxY).sort((a, b) => a - b);
  assert.deepEqual(
    actual,
    expected.sort((a, b) => a - b),
    `ventana [${minX}, ${minY}] – [${maxX}, ${maxY}]: ${actual.length} contra ${expected.length}`,
  );
  assert.equal(index.countInBox(minX, minY, maxX, maxY), expected.length, "el conteo coincide");
}

// El corte anticipado devuelve MENOS, nunca otra cosa: lo que entrega tiene que
// seguir estando dentro de la ventana.
const limited = index.queryBox(660_000, 2_140_000, 660_500, 2_140_500, 25);
assert.equal(limited.length, 25, "el tope se respeta");
assert.ok(
  limited.every((i) => xs[i] >= 660_000 && xs[i] <= 660_500),
  "y lo devuelto sigue cayendo dentro de la ventana",
);

// ---------------------------------------------------------------------------
// Radio contra fuerza bruta, en planta y en el espacio
// ---------------------------------------------------------------------------

for (const [x, y, radius] of [
  [660_500, 2_140_500, 5],
  [660_500, 2_140_500, 50],
  [660_000, 2_140_000, 30], // en la esquina de la nube
  [660_250, 2_140_750, 0], // radio cero: sólo un punto exacto, o ninguno
] as const) {
  const expected: number[] = [];
  for (let i = 0; i < xs.length; i += 1)
    if (Math.hypot(xs[i] - x, ys[i] - y) <= radius) expected.push(i);
  assert.deepEqual(
    index.queryRadius(x, y, radius).sort((a, b) => a - b),
    expected.sort((a, b) => a - b),
    `radio ${radius} en (${x}, ${y}): ${expected.length} esperados`,
  );
}

// En tres dimensiones la rejilla sigue siendo plana y la cota se filtra punto a
// punto. La esfera tiene que devolver un subconjunto ESTRICTO del círculo.
const inCircle = index.queryRadius(660_500, 2_140_500, 40);
const inSphere = index.queryRadius3D(660_500, 2_140_500, 1_530, zs, 40);
assert.ok(inSphere.length < inCircle.length, "la esfera recorta respecto del círculo");
assert.ok(
  inSphere.every((i) => Math.hypot(xs[i] - 660_500, ys[i] - 2_140_500, zs[i] - 1_530) <= 40),
  "y todo lo que devuelve está de verdad dentro de la esfera",
);

// ---------------------------------------------------------------------------
// El vecino más próximo: EL más próximo, no uno cerca
// ---------------------------------------------------------------------------

const bruteNearest = (x: number, y: number) => {
  let best = -1;
  let bestSquared = Number.POSITIVE_INFINITY;
  for (let i = 0; i < xs.length; i += 1) {
    const squared = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
    if (squared < bestSquared) {
      bestSquared = squared;
      best = i;
    }
  }
  return { best, distance: Math.sqrt(bestSquared) };
};

let worstNearestGapM = 0;
let probes = 0;
let state = 99 >>> 0;
const nextRandom = () => {
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  return state / 4_294_967_296;
};
for (let probe = 0; probe < 400; probe += 1) {
  // La mitad de las sondas caen dentro de la nube y la otra mitad fuera, porque
  // el cursor de un usuario hace las dos cosas y las condiciones de parada de
  // los dos casos son distintas.
  const inside = probe % 2 === 0;
  const x = inside ? 660_000 + nextRandom() * 1_000 : 659_000 + nextRandom() * 3_000;
  const y = inside ? 2_140_000 + nextRandom() * 1_000 : 2_139_000 + nextRandom() * 3_000;
  const expected = bruteNearest(x, y);
  const actual = index.nearest(x, y);
  const distance = Math.sqrt((xs[actual] - x) ** 2 + (ys[actual] - y) ** 2);
  // La fuerza bruta ES el mínimo, así que el índice no puede quedar por debajo:
  // lo único que se puede medir es cuánto se pasa. Un empate a distancia exacta
  // entre dos puntos distintos es legítimo, y por eso se comparan DISTANCIAS y
  // no identificadores. El margen absorbe la última cifra de la coma flotante,
  // no un vecino equivocado: el más próximo siguiente está a centímetros.
  worstNearestGapM = Math.max(worstNearestGapM, distance - expected.distance);
  assert.ok(
    distance - expected.distance < 1e-9,
    `vecino más próximo en (${x}, ${y}): ${distance} contra el óptimo ${expected.distance}`,
  );
  probes += 1;
}
assert.ok(
  worstNearestGapM < 1e-9,
  `la peor sonda se desvió ${worstNearestGapM} m del vecino óptimo`,
);

// EL CASO QUE ROMPE UNA BÚSQUEDA QUE CORTA PRONTO. El punto de consulta se pone
// justo en la esquina de una celda con un punto solitario, y el vecino de
// verdad está en la celda de al lado. Una búsqueda que se detenga al encontrar
// «algo» en el primer anillo devolverá el equivocado.
const cornerXs = new Float64Array([0, 100, 199]);
const cornerYs = new Float64Array([0, 0, 0]);
const corner = GeoPointIndex.build(cornerXs, cornerYs, { cellSize: 100 });
assert.equal(corner.nearest(198, 0), 2, "el vecino de la celda de al lado gana si está más cerca");
assert.equal(corner.nearest(101, 0), 1, "y el de la propia celda cuando le toca");

// Nube degenerada: todos los puntos en la misma coordenada. El lado de celda
// sale de dividir un área nula y no puede acabar en cero ni en NaN.
const stacked = GeoPointIndex.build(new Float64Array([5, 5, 5]), new Float64Array([7, 7, 7]));
assert.equal(stacked.countInBox(4, 6, 6, 8), 3, "una nube apilada se indexa igual");
assert.equal(stacked.nearest(0, 0), 0, "y responde al vecino más próximo");

// Un solo punto también es una nube.
const single = GeoPointIndex.build(new Float64Array([1]), new Float64Array([2]));
assert.equal(single.nearest(1_000, 1_000), 0, "con un punto, ése es el más próximo");

// ---------------------------------------------------------------------------
// Fallo cerrado
// ---------------------------------------------------------------------------

const rejects = (fn: () => unknown, code: string, what: string) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GeoError, `${what}: el error no es un GeoError sino ${error}`);
    assert.equal((error as GeoError).code, code, `${what}: código inesperado`);
    return;
  }
  assert.fail(`${what}: no falló, y debía fallar cerrado`);
};

// UN NaN NO SE INDEXA. Su celda sería NaN, que no es igual a sí misma: el punto
// desaparecería de toda consulta y la nube quedaría con un agujero invisible —
// justo el resultado plausible y falso que este subárbol no admite.
rejects(
  () => GeoPointIndex.build(new Float64Array([1, Number.NaN, 3]), new Float64Array([1, 2, 3])),
  "coordenada-invalida",
  "abscisa NaN",
);
rejects(
  () => GeoPointIndex.build(new Float64Array([1, 2]), new Float64Array([1, Number.POSITIVE_INFINITY])),
  "coordenada-invalida",
  "ordenada infinita",
);
rejects(
  () => GeoPointIndex.build(new Float64Array([1, 2]), new Float64Array([1])),
  "indice-incoherente",
  "arreglos de distinta longitud",
);
rejects(
  () => GeoPointIndex.build(new Float64Array(0), new Float64Array(0)),
  "geometria-invalida",
  "nube vacía",
);
rejects(
  () => index.queryRadius(660_000, 2_140_000, -1),
  "coordenada-invalida",
  "radio negativo",
);
rejects(
  () => index.queryRadius3D(660_000, 2_140_000, 0, new Float64Array(3), 10),
  "indice-incoherente",
  "cotas de otra nube",
);

console.log(
  `point-index: ${stats.pointCount} puntos en ${stats.occupiedCells} celdas ocupadas ` +
    `(${stats.indexBytes} B de índice), ${windows.length} ventanas y ${probes} vecinos más ` +
    "próximos idénticos a la fuerza bruta, y seis averías rechazadas con su código",
);
