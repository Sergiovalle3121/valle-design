import assert from "node:assert/strict";
import {
  CAD_DRAW_ORDER_DEPTH_RANGE,
  CAD_LINETYPE_SLOTS,
  CadLineBatchBuilder,
  buildCadLineBatches,
  cadDrawOrderDepth,
  cadLineBatchStats,
  cadLineStyleKey,
  cadLineVertexWorldPosition,
  packCadColor,
  unpackCadColor,
  type CadLineStyle,
} from "./line-batch";
import {
  CAD_LINE_BATCH_FRAGMENT_SHADER,
  CAD_LINE_BATCH_VERTEX_SHADER,
} from "./line-batch-three";
import type { CadTessellation } from "./tessellation-cache";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const style = (over: Partial<CadLineStyle> = {}): CadLineStyle => ({
  color: 0x60a5fa,
  halfWidthPx: 1,
  linetypeIndex: 0,
  layer: "0",
  ...over,
});

function tess(points: number[], closed = false): CadTessellation {
  const count = points.length / 2;
  return {
    paths: [{ xy: new Float32Array(points), closed }],
    pointCount: count,
    segmentCount: count - 1 + (closed ? 1 : 0),
  };
}

// ---------------------------------------------------------------------------
// ORDEN DE DIBUJO. Es semántico: si se pierde, un sombreado tapa la geometría
// que rellena. Se comprueba con anclas absolutas y con la monotonía estricta.
// ---------------------------------------------------------------------------
assert.equal(cadDrawOrderDepth(0, 1), 0, "una sola entidad va al plano medio");
assert.equal(cadDrawOrderDepth(0, 2), CAD_DRAW_ORDER_DEPTH_RANGE / 2);
assert.equal(cadDrawOrderDepth(1, 2), -CAD_DRAW_ORDER_DEPTH_RANGE / 2);
assert.ok(
  cadDrawOrderDepth(1, 2) < cadDrawOrderDepth(0, 2),
  "lo que se dibuja después queda ENCIMA, es decir con z menor",
);
assert.equal(cadDrawOrderDepth(-5, 10), cadDrawOrderDepth(0, 10), "índice negativo se recorta");
assert.equal(cadDrawOrderDepth(99, 10), cadDrawOrderDepth(9, 10), "índice pasado se recorta");
assert.equal(cadDrawOrderDepth(0, 0), 0, "sin orden no hay profundidad que asignar");
ok(true, "cadDrawOrderDepth: 1 entidad → 0; 2 entidades → ±0,45; decreciente");

// Monotonía estricta y separación resoluble a 100.000 posiciones. Con 24 bits
// de profundidad el paso mínimo distinguible en NDC es ~1,2e-7.
const orderCount = 100_000;
let previousDepth = Number.POSITIVE_INFINITY;
let minimumStep = Number.POSITIVE_INFINITY;
for (const index of [0, 1, 2, 49_999, 50_000, 99_998, 99_999]) {
  const depth = cadDrawOrderDepth(index, orderCount);
  assert.ok(depth > -1 && depth < 1, `la profundidad ${depth} debe caber en NDC`);
  if (index > 0) minimumStep = Math.min(minimumStep, previousDepth - depth);
  previousDepth = depth;
}
assert.ok(minimumStep > 0, "la profundidad debe ser estrictamente decreciente");
const consecutiveStep = cadDrawOrderDepth(0, orderCount) - cadDrawOrderDepth(1, orderCount);
assert.ok(
  consecutiveStep > 1.2e-7,
  `dos posiciones consecutivas a 100k deben separarse más que un escalón de 24 bits: ${consecutiveStep}`,
);
ok(true, `a 100.000 entidades el paso de profundidad es ${consecutiveStep.toExponential(2)}, resoluble a 24 bits`);

// ---------------------------------------------------------------------------
// Empaquetado de color: exacto porque 0xFFFFFF < 2^24.
// ---------------------------------------------------------------------------
for (const color of [0x000000, 0x60a5fa, 0xffffff, 0x010203]) {
  const packed = packCadColor(color);
  const { r, g, b } = unpackCadColor(packed);
  assert.equal((r << 16) | (g << 8) | b, color, `el color ${color.toString(16)} debe sobrevivir`);
  assert.equal(new Float32Array([packed])[0], packed, "y ser exacto en float32");
}
assert.deepEqual(unpackCadColor(0x60a5fa), { r: 0x60, g: 0xa5, b: 0xfa });
assert.equal(packCadColor(-5), 0, "un color fuera de rango se recorta, no envuelve");
assert.equal(packCadColor(0x1ffffff), 0xffffff);
ok(true, "el color viaja empaquetado en un float32 sin pérdida");

// ---------------------------------------------------------------------------
// LWT: el grosor sale EN PÍXELES y no depende del zoom. Es la propiedad que el
// pipeline anterior no podía cumplir porque `linewidth` se ignora en WebGL.
// ---------------------------------------------------------------------------
for (const pixelsPerUnit of [0.01, 1, 37.5, 1_000]) {
  const halfWidthPx = 3;
  const top = cadLineVertexWorldPosition({
    startX: 0, startY: 0, endX: 100, endY: 0,
    halfWidthPx, along: 0, side: 1, pixelsPerUnit,
  });
  const bottom = cadLineVertexWorldPosition({
    startX: 0, startY: 0, endX: 100, endY: 0,
    halfWidthPx, along: 0, side: -1, pixelsPerUnit,
  });
  const widthWorld = Math.hypot(top.x - bottom.x, top.y - bottom.y);
  const widthPx = widthWorld * pixelsPerUnit;
  assert.ok(
    Math.abs(widthPx - halfWidthPx * 2) < 1e-9,
    `a ${pixelsPerUnit} px/unidad el trazo mide ${widthPx} px y debería medir 6`,
  );
}
ok(true, "el grosor mide 6 px exactos con el zoom variando cinco órdenes de magnitud");

// La expansión es perpendicular al segmento y respeta el recorrido.
const diagonal = cadLineVertexWorldPosition({
  startX: 0, startY: 0, endX: 10, endY: 10,
  halfWidthPx: 0.5, along: 0.5, side: 0, pixelsPerUnit: 1,
});
assert.deepEqual(diagonal, { x: 5, y: 5 }, "con side 0 el vértice cae sobre el segmento");
const offset = cadLineVertexWorldPosition({
  startX: 0, startY: 0, endX: 10, endY: 0,
  halfWidthPx: 2, along: 1, side: 1, pixelsPerUnit: 1,
});
assert.deepEqual(offset, { x: 10, y: 2 }, "un segmento horizontal se ensancha en Y");
// Un segmento degenerado no produce NaN: sería un triángulo invisible que
// además contamina el búfer de profundidad.
const degenerate = cadLineVertexWorldPosition({
  startX: 4, startY: 4, endX: 4, endY: 4,
  halfWidthPx: 1, along: 0.5, side: 1, pixelsPerUnit: 2,
});
assert.ok(Number.isFinite(degenerate.x) && Number.isFinite(degenerate.y), "sin NaN");
assert.deepEqual(degenerate, { x: 4, y: 4.5 });
ok(true, "la expansión del quad es perpendicular y tolera el segmento degenerado");

// Un grosor 0 se eleva a medio píxel: una línea no puede desaparecer del todo.
const hairline = cadLineVertexWorldPosition({
  startX: 0, startY: 0, endX: 10, endY: 0,
  halfWidthPx: 0, along: 0, side: 1, pixelsPerUnit: 10,
});
assert.equal(hairline.y, 0.05, "grosor 0 → medio píxel a 10 px/unidad");
ok(true, "el grosor mínimo es medio píxel, no cero");

// ---------------------------------------------------------------------------
// El constructor escribe los atributos por instancia con valores EXACTOS.
// ---------------------------------------------------------------------------
const builder = new CadLineBatchBuilder(2);
const written = builder.push({
  tessellation: tess([0, 0, 3, 4, 3, 14]),
  style: style({ color: 0xff0000, halfWidthPx: 2.5, linetypeIndex: 3 }),
  depth: 0.25,
});
assert.equal(written, 2, "tres puntos abiertos son dos segmentos");
const data = builder.build();
assert.equal(data.instanceCount, 2);
assert.deepEqual([...data.instanceStart], [0, 0, 3, 4]);
assert.deepEqual([...data.instanceEnd], [3, 4, 3, 14]);
assert.deepEqual([...data.instanceStyle], [0xff0000, 2.5, 3, 0.25, 0xff0000, 2.5, 3, 0.25]);
// Fase acumulada: el primer segmento mide 5, el segundo empieza en 5 y mide 10.
assert.deepEqual([...data.instanceArc], [0, 5, 5, 10]);
ok(true, "instanceStart/End/Style/Arc salen con los valores exactos esperados");

// El guionado NO se reinicia en cada vértice: si lo hiciera, una polilínea
// discontinua se vería como trozos sueltos en vez de como una línea.
assert.equal(data.instanceArc[2], 5, "la fase del segundo segmento arranca donde acabó el primero");
ok(true, "la fase de guionado es acumulativa a lo largo del recorrido");

// Camino cerrado: el último segmento vuelve al primer punto.
const closed = new CadLineBatchBuilder(1);
closed.push({ tessellation: tess([0, 0, 10, 0, 10, 10], true), style: style(), depth: 0 });
const closedData = closed.build();
assert.equal(closedData.instanceCount, 3, "un triángulo cerrado son tres segmentos");
assert.deepEqual([...closedData.instanceEnd.slice(4)], [0, 0], "el último segmento cierra");
assert.equal(closedData.instanceArc[4], 20, "el cierre arranca tras 10 + 10 unidades");
assert.ok(
  Math.abs(closedData.instanceArc[5] - Math.hypot(10, 10)) < 1e-5,
  "y mide la diagonal del triángulo (con la precisión de un float32)",
);
ok(true, "un camino cerrado emite el segmento de cierre con su longitud correcta");

// Crecimiento de capacidad sin perder lo ya escrito.
const growing = new CadLineBatchBuilder(1);
for (let index = 0; index < 500; index += 1)
  growing.push({ tessellation: tess([index, 0, index + 1, 0]), style: style(), depth: 0 });
const grown = growing.build();
assert.equal(grown.instanceCount, 500);
assert.equal(grown.instanceStart[0], 0);
assert.equal(grown.instanceStart[998], 499, "el primer punto del último segmento sobrevivió al realloc");
assert.equal(grown.instanceStart.length, 1_000, "build() no sube capacidad muerta a la GPU");
ok(true, "el constructor crece por duplicación sin perder datos ni subir hueco");

// ---------------------------------------------------------------------------
// Agrupación por cubo de estilo: capa + color + grosor + tipo de línea.
// ---------------------------------------------------------------------------
assert.equal(cadLineStyleKey(style()), "0|6333946|1|0");
assert.notEqual(cadLineStyleKey(style()), cadLineStyleKey(style({ layer: "MUROS" })));
assert.notEqual(cadLineStyleKey(style()), cadLineStyleKey(style({ halfWidthPx: 2 })));
assert.equal(cadLineStyleKey(style({ color: 0x60a5fa })), cadLineStyleKey(style()));
ok(true, "la clave de cubo separa por capa, color, grosor y tipo de línea");

const batches = buildCadLineBatches([
  { tessellation: tess([0, 0, 1, 0]), style: style({ layer: "B" }), depth: 0.1 },
  { tessellation: tess([0, 0, 1, 0]), style: style({ layer: "A" }), depth: 0.2 },
  { tessellation: tess([2, 0, 3, 0]), style: style({ layer: "A" }), depth: 0.3 },
  { tessellation: tess([]), style: style({ layer: "C" }), depth: 0.4 },
]);
assert.equal(batches.length, 2, "dos capas, dos lotes; la entidad vacía no crea lote");
assert.equal(batches[0].style.layer, "A", "los lotes salen ordenados por clave, de forma determinista");
assert.equal(batches[0].instanceCount, 2);
assert.equal(batches[1].style.layer, "B");
assert.equal(batches[1].instanceCount, 1);
// Cada instancia conserva SU profundidad aunque comparta lote: el orden de
// dibujo es por entidad, no por lote.
assert.ok(
  Math.abs(batches[0].instanceStyle[3] - 0.2) < 1e-6 &&
    Math.abs(batches[0].instanceStyle[7] - 0.3) < 1e-6,
  `cada instancia guarda su profundidad: ${batches[0].instanceStyle[3]}, ${batches[0].instanceStyle[7]}`,
);
ok(true, "las entidades del mismo cubo comparten lote y conservan su profundidad propia");

const stats = cadLineBatchStats(batches);
assert.deepEqual(stats, { batches: 2, instances: 3, attributeBytes: 3 * 10 * 4 });
ok(true, `cadLineBatchStats: ${stats.instances} instancias en ${stats.batches} lotes, ${stats.attributeBytes} bytes`);

// ---------------------------------------------------------------------------
// El shader existe y hace lo que este módulo promete. No se puede ejecutar GLSL
// en Node, así que se comprueba lo que sí es comprobable: que la profundidad se
// escribe, que el bucle del tipo de línea tiene tope constante (GLSL ES 1.00 no
// admite indexar uniformes con expresión variable) y que el atributo `position`
// NO se redeclara — hacerlo rompe la compilación en THREE.
// ---------------------------------------------------------------------------
assert.ok(
  CAD_LINE_BATCH_VERTEX_SHADER.includes("gl_Position.z = instanceStyle.w * gl_Position.w;"),
  "el vertex shader debe escribir el orden de dibujo en la profundidad",
);
assert.ok(
  !/attribute\s+vec[234]\s+position\s*;/.test(CAD_LINE_BATCH_VERTEX_SHADER),
  "`position` es un atributo reservado de THREE: redeclararlo rompe la compilación",
);
for (const attribute of ["instanceStart", "instanceEnd", "instanceStyle", "instanceArc"])
  assert.ok(
    CAD_LINE_BATCH_VERTEX_SHADER.includes(`attribute vec`) &&
      CAD_LINE_BATCH_VERTEX_SHADER.includes(attribute),
    `falta el atributo por instancia ${attribute}`,
  );
assert.ok(
  CAD_LINE_BATCH_FRAGMENT_SHADER.includes(`slot < ${CAD_LINETYPE_SLOTS}`),
  "el bucle del tipo de línea necesita tope constante",
);
assert.ok(
  CAD_LINE_BATCH_VERTEX_SHADER.includes("cadWorldPerPixel"),
  "el grosor en píxeles necesita el inverso del zoom",
);
ok(true, "el shader escribe la profundidad, no redeclara `position` y acota el bucle de tipos de línea");

console.log(
  `line-batch: ${checks} comprobaciones verdes — orden de dibujo resoluble a 100k (paso ${consecutiveStep.toExponential(2)} NDC), grosor invariante al zoom en 5 órdenes de magnitud, ${stats.instances} instancias agrupadas en ${stats.batches} lotes.`,
);
