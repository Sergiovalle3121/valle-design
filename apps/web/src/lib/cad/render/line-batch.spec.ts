import assert from "node:assert/strict";
import {
  CAD_DRAW_ORDER_DEPTH_RANGE,
  CAD_LINE_BATCH_BLOCK_SEGMENTS,
  CAD_LINETYPE_MAX_ELEMENTS,
  CAD_LINETYPE_SLOTS,
  CadLineBatchBuilder,
  buildCadLineBatches,
  cadDrawOrderDepth,
  cadLineBatchBlockFor,
  cadLineBatchStats,
  cadLineStyleKey,
  cadLineVertexWorldPosition,
  cadLinetypeCoverage,
  cadTileLineBatches,
  packCadColor,
  packCadLinetypeUniforms,
  unpackCadColor,
  type CadLineBatchItem,
  type CadLineStyle,
} from "./line-batch";
import {
  CAD_LINE_BATCH_FRAGMENT_SHADER,
  CAD_LINE_BATCH_VERTEX_SHADER,
  createCadLineBatchMaterial,
  setCadLineBatchLinetypes,
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
// TIPOS DE LÍNEA: la secuencia `.lin` completa viaja al shader. Medido el
// 2026-09-02 antes de esta tabla: las ranuras guardaban sólo (primer trazo,
// primer hueco) y CENTER, DASHDOT, PHANTOM, BORDER y DIVIDE se dibujaban como
// DASHED; DOT no entraba en ninguna ranura. Aquí se comprueba el empaquetado
// exacto y la regla de cobertura, que es el espejo en TS del bucle del GLSL.
// ---------------------------------------------------------------------------
const CENTER = [1.25, -0.25, 0.25, -0.25];
const DASHDOT = [0.5, -0.25, 0, -0.25];
const packed = packCadLinetypeUniforms([[], CENTER, DASHDOT]);
assert.equal(packed.dash.length, CAD_LINETYPE_SLOTS * CAD_LINETYPE_MAX_ELEMENTS);
assert.equal(packed.meta.length, CAD_LINETYPE_SLOTS * 2);
assert.deepEqual([...packed.meta.slice(0, 6)], [0, 0, 4, 2, 4, 1], "meta = [tramos, periodo] por ranura; el punto no suma periodo");
assert.deepEqual([...packed.dash.slice(8, 12)], CENTER, "la ranura 1 guarda los cuatro tramos de CENTER con signo");
assert.deepEqual([...packed.dash.slice(16, 20)], DASHDOT, "y la 2 conserva el 0 del punto de DASHDOT");
ok(true, "packCadLinetypeUniforms empaqueta secuencias completas, no el par (trazo, hueco)");

// CENTER a escala 1: trazo largo 0–1,25, hueco 1,25–1,5, trazo corto 1,5–1,75,
// hueco 1,75–2. La fase 1,6 es EL trazo corto que el par perdía.
assert.equal(cadLinetypeCoverage(0.6, packed, 1), true, "0,6 cae en el trazo largo");
assert.equal(cadLinetypeCoverage(1.4, packed, 1), false, "1,4 cae en el primer hueco");
assert.equal(cadLinetypeCoverage(1.6, packed, 1), true, "1,6 cae en el trazo corto — el que se perdía");
assert.equal(cadLinetypeCoverage(1.9, packed, 1), false, "1,9 cae en el segundo hueco");
assert.equal(cadLinetypeCoverage(2.1, packed, 1), true, "2,1 vuelve al trazo largo: el patrón es periódico");
assert.equal(cadLinetypeCoverage(-0.6, packed, 1), false, "una fase negativa se pliega al periodo (mod positivo): −0,6 → 1,4, hueco");
// Escala ×10 (LTSCALE): el mismo punto cae en otro tramo.
assert.equal(cadLinetypeCoverage(1.6, packed, 1, 10), true, "a escala 10 la fase 1,6 sigue en el trazo largo de 12,5");
assert.equal(cadLinetypeCoverage(14, packed, 1, 10), false, "y 14 cae en el hueco 12,5–15");
// DASHDOT con punto de longitud 0,05: 0,5 trazo, 0,25 hueco, punto, 0,25 hueco.
assert.equal(cadLinetypeCoverage(0.76, packed, 2, 1, 0.05), true, "el punto pinta lo que mide dotLength");
assert.equal(cadLinetypeCoverage(0.9, packed, 2, 1, 0.05), false, "y después del punto viene el hueco");
assert.equal(cadLinetypeCoverage(0.76, packed, 2, 1, 0), false, "con dotLength 0 el punto no pinta nunca: por eso el shader le da dos píxeles");
assert.equal(cadLinetypeCoverage(123.4, packed, 0), true, "la ranura 0 es continua: siempre pinta");
ok(true, "cadLinetypeCoverage reproduce trazo largo–hueco–trazo corto–hueco de CENTER y el punto de DASHDOT");

// Los uniformes del material reciben la tabla y la escala.
const lined = createCadLineBatchMaterial({
  viewport: { scale: 1, width: 100, height: 100 },
  pixelsPerUnit: 1,
});
assert.equal(lined.uniforms.cadLinetypeMeta.value[2], 0, "recién creado, ninguna ranura tiene tramos");
setCadLineBatchLinetypes(lined.uniforms, [[], CENTER], 25);
assert.deepEqual([...lined.uniforms.cadLinetypeMeta.value.slice(2, 4)], [4, 2]);
assert.deepEqual([...lined.uniforms.cadLinetypeDash.value.slice(8, 12)], CENTER);
assert.equal(lined.uniforms.cadLinetypeScale.value, 25, "LTSCALE viaja como uniforme");
assert.equal(lined.uniforms.cadLinetypeDash.value.length, CAD_LINETYPE_SLOTS * CAD_LINETYPE_MAX_ELEMENTS, "vec4[SLOTS*2] = SLOTS*8 floats");
ok(true, "setCadLineBatchLinetypes escribe dash, meta y escala en los uniformes del material");

// ---------------------------------------------------------------------------
// El shader existe y hace lo que este módulo promete. No se puede ejecutar GLSL
// en Node, así que se comprueba lo que sí es comprobable: que la profundidad se
// escribe, que el bucle del tipo de línea recorre los TRAMOS con tope constante
// e indexa la ranura dinámicamente (legal desde `#version 300 es`, que three
// 0.185 antepone a todo ShaderMaterial) y que el atributo `position` NO se
// redeclara — hacerlo rompe la compilación en THREE.
// ---------------------------------------------------------------------------
assert.ok(
  CAD_LINE_BATCH_VERTEX_SHADER.includes(
    "gl_Position.z = (cadDepthBias + instanceStyle.w * cadDepthScale) * gl_Position.w;",
  ),
  "el vertex shader debe escribir el orden de dibujo en la profundidad",
);
// La lámina es OPCIONAL y su defecto tiene que ser transparente: bias 0 y
// escala 1 reproducen exactamente `z = instanceStyle.w`, que es lo que este
// módulo prometía antes de que existiera. Un defecto distinto cambiaría en
// silencio lo que ve cualquier consumidor que no la configure.
const defaultSlab = createCadLineBatchMaterial({
  viewport: { scale: 1, width: 100, height: 100 },
  pixelsPerUnit: 1,
});
assert.equal(defaultSlab.uniforms.cadDepthBias.value, 0);
assert.equal(defaultSlab.uniforms.cadDepthScale.value, 1);
const slab = createCadLineBatchMaterial({
  viewport: { scale: 1, width: 100, height: 100 },
  pixelsPerUnit: 1,
  depthBias: -0.94,
  depthScale: 0.055,
});
assert.equal(slab.uniforms.cadDepthBias.value, -0.94);
assert.equal(slab.uniforms.cadDepthScale.value, 0.055);
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
  CAD_LINE_BATCH_FRAGMENT_SHADER.includes(`element < ${CAD_LINETYPE_MAX_ELEMENTS}`),
  "el bucle del tipo de línea recorre los tramos con tope constante",
);
assert.ok(
  CAD_LINE_BATCH_FRAGMENT_SHADER.includes(`uniform vec4 cadLinetypeDash[${CAD_LINETYPE_SLOTS * 2}]`) &&
    CAD_LINE_BATCH_FRAGMENT_SHADER.includes(`uniform vec2 cadLinetypeMeta[${CAD_LINETYPE_SLOTS}]`),
  "la tabla viaja como vec4[SLOTS*2] + vec2[SLOTS]: 96 vectores, no 256 floats sueltos",
);
assert.ok(
  !CAD_LINE_BATCH_FRAGMENT_SHADER.includes("cadLinetypePattern["),
  "el uniforme del par (trazo, hueco) ya no existe",
);
assert.ok(
  CAD_LINE_BATCH_FRAGMENT_SHADER.includes("cadLinetypeMeta[slot]"),
  "la ranura se indexa dinámicamente (GLSL ES 3.00)",
);
assert.ok(
  CAD_LINE_BATCH_FRAGMENT_SHADER.includes("2.0 * cadWorldPerPixel"),
  "un punto mide dos píxeles en pantalla, o no se pintaría",
);
assert.ok(
  CAD_LINE_BATCH_VERTEX_SHADER.includes("cadWorldPerPixel"),
  "el grosor en píxeles necesita el inverso del zoom",
);
ok(true, "el shader escribe la profundidad, no redeclara `position` y recorre los tramos del tipo de línea con tope constante");

// ---------------------------------------------------------------------------
// PARIDAD BIT A BIT DEL EMPAQUETADO, que es la condición sin la cual la
// reescritura del bucle de `push` no es una optimización sino un defecto.
//
// El bucle ANTERIOR vive aquí escrito a mano —no importado, para que reescribir
// el de producción no reescriba también la referencia— y las cuatro salidas se
// comparan elemento a elemento con `Object.is`, que distingue 0 de −0 y no deja
// pasar dos NaN como «iguales». Encima va una huella FNV-1a de la secuencia
// entera: dos empaquetados pueden coincidir posición a posición en una muestra
// y repartir distinto en otra, y la huella cierra esa puerta.
// ---------------------------------------------------------------------------
function empaquetarComoAntes(items: readonly CadLineBatchItem[]): {
  start: number[];
  end: number[];
  style: number[];
  arc: number[];
  count: number;
} {
  const start: number[] = [];
  const end: number[] = [];
  const styleOut: number[] = [];
  const arc: number[] = [];
  let count = 0;
  for (const item of items) {
    const packedColor = packCadColor(item.style.color);
    const halfWidthPx = Math.max(0, item.style.halfWidthPx);
    const linetypeIndex = Math.max(
      0,
      Math.min(CAD_LINETYPE_SLOTS - 1, Math.floor(item.style.linetypeIndex)),
    );
    for (const path of item.tessellation.paths) {
      const points = path.xy.length / 2;
      if (points < 2) continue;
      const segments = points - 1 + (path.closed ? 1 : 0);
      let phase = 0;
      for (let index = 0; index < segments; index += 1) {
        const from = index * 2;
        const to = ((index + 1) % points) * 2;
        const x0 = path.xy[from];
        const y0 = path.xy[from + 1];
        const x1 = path.xy[to];
        const y1 = path.xy[to + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        // El original escribía en un Float32Array; para comparar bit a bit hay
        // que redondear igual, o la referencia sería más precisa que lo medido.
        start.push(Math.fround(x0), Math.fround(y0));
        end.push(Math.fround(x1), Math.fround(y1));
        styleOut.push(
          Math.fround(packedColor),
          Math.fround(halfWidthPx),
          Math.fround(linetypeIndex),
          Math.fround(item.depth),
        );
        arc.push(Math.fround(phase), Math.fround(length));
        phase += length;
        count += 1;
      }
    }
  }
  return { start, end, style: styleOut, arc, count };
}

/** Huella FNV-1a de 32 bits sobre los BYTES de un array tipado. */
function huella(...arrays: readonly Float32Array[]): string {
  let hash = 0x811c9dc5;
  for (const array of arrays) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Corpus determinista con las FORMAS que el perfilado encontró en
 * architecture@100k, más las que no aparecen ahí pero el formato admite:
 * caminos abiertos de dos puntos (el 97,2 % de lo medido), polilíneas largas,
 * caminos cerrados, entidades con muchos caminos, un camino de un solo punto y
 * uno vacío —que se omiten—, coordenadas grandes con incrementos diminutos y
 * segmentos degenerados de longitud cero.
 */
function corpusDeFormas(): CadLineBatchItem[] {
  let semilla = 20260904;
  const azar = (): number => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    return semilla / 0x7fffffff;
  };
  const items: CadLineBatchItem[] = [];
  const capas = ["0", "MUROS", "COTAS", "SOMBREADO"];
  for (let entidad = 0; entidad < 240; entidad += 1) {
    const paths: { xy: Float32Array; closed: boolean }[] = [];
    // Un «sombreado»: muchos caminos abiertos de dos puntos, que es la forma
    // que domina la etapa y la que estrena el atajo.
    const lineas = 1 + Math.floor(azar() * 40);
    for (let linea = 0; linea < lineas; linea += 1) {
      const x = azar() * 280_000;
      const y = azar() * 280_000;
      paths.push({
        xy: new Float32Array([x, y, x + azar() * 120 - 60, y + azar() * 120 - 60]),
        closed: false,
      });
    }
    // Una polilínea larga, abierta o cerrada según la entidad.
    const puntos = 2 + Math.floor(azar() * 30);
    const xy = new Float32Array(puntos * 2);
    let cursorX = azar() * 280_000;
    let cursorY = azar() * 280_000;
    for (let punto = 0; punto < puntos; punto += 1) {
      xy[punto * 2] = cursorX;
      xy[punto * 2 + 1] = cursorY;
      // Incrementos diminutos sobre coordenadas grandes: es donde el float32
      // pierde bits y donde una fase acumulada mal sumada se nota.
      cursorX += azar() * 0.05;
      cursorY += azar() * 0.05;
    }
    paths.push({ xy, closed: entidad % 3 === 0 });
    // Un triángulo cerrado exacto y un segmento degenerado de longitud cero.
    paths.push({ xy: new Float32Array([0, 0, 10, 0, 10, 10]), closed: true });
    paths.push({ xy: new Float32Array([7, 7, 7, 7]), closed: false });
    // Lo que se OMITE: un punto suelto y un camino vacío.
    paths.push({ xy: new Float32Array([1, 2]), closed: true });
    paths.push({ xy: new Float32Array([]), closed: false });
    let segmentCount = 0;
    let pointCount = 0;
    for (const path of paths) {
      const puntosDelCamino = path.xy.length / 2;
      pointCount += puntosDelCamino;
      if (puntosDelCamino < 2) continue;
      segmentCount += puntosDelCamino - 1 + (path.closed ? 1 : 0);
    }
    items.push({
      tessellation: { paths, pointCount, segmentCount },
      style: style({
        layer: capas[entidad % capas.length],
        color: [0x60a5fa, 0xff0000, 0x00ff00][entidad % 3],
        halfWidthPx: [0.5, 1, 2.5][entidad % 3],
        linetypeIndex: entidad % 4,
      }),
      depth: cadDrawOrderDepth(entidad, 240),
    });
  }
  return items;
}

const formas = corpusDeFormas();
const referencia = empaquetarComoAntes(formas);
const medido = new CadLineBatchBuilder(64);
let escritos = 0;
for (const item of formas) escritos += medido.push(item);
const empaquetado = medido.build();
assert.equal(escritos, referencia.count, "el número de segmentos escritos no cambió");
assert.equal(empaquetado.instanceCount, referencia.count);
let descuadres = 0;
const comparar = (nombre: string, actual: Float32Array, esperado: readonly number[]): void => {
  assert.equal(actual.length, esperado.length, `${nombre}: longitud distinta`);
  for (let index = 0; index < esperado.length; index += 1) {
    if (!Object.is(actual[index], esperado[index])) {
      descuadres += 1;
      if (descuadres <= 3)
        console.error(`${nombre}[${index}]: ${actual[index]} !== ${esperado[index]}`);
    }
  }
};
comparar("instanceStart", empaquetado.instanceStart, referencia.start);
comparar("instanceEnd", empaquetado.instanceEnd, referencia.end);
comparar("instanceStyle", empaquetado.instanceStyle, referencia.style);
comparar("instanceArc", empaquetado.instanceArc, referencia.arc);
assert.equal(descuadres, 0, `${descuadres} valores difieren del empaquetado anterior`);
ok(
  true,
  `${referencia.count} segmentos empaquetados BIT A BIT como el bucle anterior sobre ${formas.length} entidades y ${formas.reduce((total, item) => total + item.tessellation.paths.length, 0)} caminos`,
);

// La huella cierra la puerta que la comparación posición a posición deja
// abierta: se calcula sobre los BYTES de las cuatro salidas juntas.
const huellaMedida = huella(
  empaquetado.instanceStart,
  empaquetado.instanceEnd,
  empaquetado.instanceStyle,
  empaquetado.instanceArc,
);
const huellaReferencia = huella(
  new Float32Array(referencia.start),
  new Float32Array(referencia.end),
  new Float32Array(referencia.style),
  new Float32Array(referencia.arc),
);
assert.equal(huellaMedida, huellaReferencia, "la huella de la secuencia entera debe coincidir");
ok(true, `huella FNV-1a de las cuatro salidas: ${huellaMedida}, la misma que la del bucle anterior`);

// RESERVAR NO CAMBIA LO ESCRITO. Es la otra mitad de la entrega: si reservar de
// una vez moviera un flotante, la reserva sería un defecto y no un ahorro.
const reservado = new CadLineBatchBuilder(64);
reservado.reserve(referencia.count);
assert.ok(
  reservado.capacity >= referencia.count,
  `reserve(${referencia.count}) debe dejar capacidad para todo el lote, dejó ${reservado.capacity}`,
);
const capacidadReservada = reservado.capacity;
for (const item of formas) reservado.push(item);
const conReserva = reservado.build();
assert.equal(
  reservado.capacity,
  capacidadReservada,
  "con el lote reservado de una vez no debe quedar ni una duplicación",
);
assert.equal(
  huella(
    conReserva.instanceStart,
    conReserva.instanceEnd,
    conReserva.instanceStyle,
    conReserva.instanceArc,
  ),
  huellaMedida,
  "reservar de una vez tiene que producir exactamente los mismos bytes que crecer",
);
assert.equal(reservado.capacity, capacidadReservada);
assert.equal(reservado.instanceCount, medido.instanceCount);
ok(true, `reservar el lote entero (${capacidadReservada} segmentos) escribe los mismos bytes y no crece ni una vez`);

// `reserve` no encoge nunca y aguanta la basura sin romper el lote.
const noEncoge = new CadLineBatchBuilder(512);
noEncoge.reserve(4);
assert.equal(noEncoge.capacity, 512, "reservar menos de lo que hay no encoge");
noEncoge.reserve(Number.NaN);
noEncoge.reserve(-7);
noEncoge.reserve(0);
assert.equal(noEncoge.capacity, 512, "NaN, negativo y cero no tocan la capacidad");
noEncoge.reserve(700);
assert.ok(noEncoge.capacity >= 700, "y reservar más sí crece");
ok(true, "reserve() sólo crece, y NaN, negativo o cero no la mueven");

// `buildCadLineBatches` reserva UNA VEZ POR LOTE con el total exacto: el búfer
// que queda debajo mide lo que el cubo pedía, no el doble de la duplicación.
const porLote = buildCadLineBatches(formas);
for (const lote of porLote) {
  const capacidad = lote.instanceStart.buffer.byteLength / (2 * 4);
  assert.ok(
    capacidad >= lote.instanceCount,
    `el cubo ${lote.bucketKey} no cabe en su propio búfer`,
  );
  assert.ok(
    capacidad === Math.max(64, lote.instanceCount),
    `el cubo ${lote.bucketKey} reservó ${capacidad} para ${lote.instanceCount} segmentos: eso es una duplicación que la primera pasada tenía que haber evitado`,
  );
}
const totalPorLote = porLote.reduce((total, lote) => total + lote.instanceCount, 0);
assert.equal(totalPorLote, referencia.count, "agrupar por cubo no puede perder segmentos");
ok(
  true,
  `buildCadLineBatches reserva el total exacto de cada uno de sus ${porLote.length} cubos (${totalPorLote} segmentos) sin una sola duplicación`,
);

// ---------------------------------------------------------------------------
// BLOQUES. Un cubo que se llena a trozos —el caso del pipeline, que no sabe el
// total de un tile hasta haberlo teselado entero— encadena bloques en vez de
// duplicar. La condición es la misma de siempre: los bloques CONCATENADOS
// tienen que dar exactamente los mismos bytes que un solo cubo reservado.
// ---------------------------------------------------------------------------
const muchas: CadLineBatchItem[] = [];
for (let vuelta = 0; vuelta < 9; vuelta += 1) muchas.push(...formas);
const totalMuchas = muchas.reduce(
  (total, item) => total + item.tessellation.segmentCount,
  0,
);
assert.ok(
  totalMuchas > CAD_LINE_BATCH_BLOCK_SEGMENTS,
  `el corpus del spec (${totalMuchas} segmentos) tiene que pasar del bloque o no probaría el encadenado`,
);
const deUnaPieza = new CadLineBatchBuilder(totalMuchas);
for (const item of muchas) deUnaPieza.push(item);
const bloques = [new CadLineBatchBuilder(64)];
for (const item of muchas)
  cadLineBatchBlockFor(bloques, item.tessellation.segmentCount).push(item);
assert.ok(bloques.length > 1, `un corpus de ${totalMuchas} segmentos tiene que abrir más de un bloque`);
const concatenado = bloques.map((bloque) => bloque.build());
assert.equal(
  concatenado.reduce((total, parte) => total + parte.instanceCount, 0),
  deUnaPieza.instanceCount,
  "encadenar bloques no puede perder ni inventar instancias",
);
const juntar = (campo: "instanceStart" | "instanceEnd" | "instanceStyle" | "instanceArc"): Float32Array => {
  const total = concatenado.reduce((suma, parte) => suma + parte[campo].length, 0);
  const salida = new Float32Array(total);
  let cursor = 0;
  for (const parte of concatenado) {
    salida.set(parte[campo], cursor);
    cursor += parte[campo].length;
  }
  return salida;
};
const enteroDeUnaPieza = deUnaPieza.build();
assert.equal(
  huella(juntar("instanceStart"), juntar("instanceEnd"), juntar("instanceStyle"), juntar("instanceArc")),
  huella(
    enteroDeUnaPieza.instanceStart,
    enteroDeUnaPieza.instanceEnd,
    enteroDeUnaPieza.instanceStyle,
    enteroDeUnaPieza.instanceArc,
  ),
  "los bloques concatenados tienen que dar los mismos bytes que el cubo de una pieza",
);
// Ningún bloque salvo el último puede quedar a medias sin razón, y ninguno
// puede pasarse de tamaño de bloque salvo por una entidad más grande que él.
for (let indice = 0; indice + 1 < bloques.length; indice += 1)
  assert.ok(
    bloques[indice].capacity >= CAD_LINE_BATCH_BLOCK_SEGMENTS,
    `el bloque ${indice} se cerró con capacidad ${bloques[indice].capacity}: sólo se cierra al llegar al tamaño de bloque`,
  );
ok(
  true,
  `${totalMuchas} segmentos en ${bloques.length} bloques dan los mismos bytes que un cubo de una pieza`,
);

// La clave de un lote lleva el tile delante, y el segundo bloque su número.
const lotesDeTile = cadTileLineBatches(
  "t:3:4:5",
  new Map([
    ["0|6333946|1|0", { style: style(), builders: bloques }],
  ]),
);
assert.equal(lotesDeTile.length, bloques.length, "un lote por bloque");
assert.equal(lotesDeTile[0].bucketKey, "t:3:4:5#0|6333946|1|0", "el primer bloque conserva la clave de siempre");
assert.equal(lotesDeTile[1].bucketKey, "t:3:4:5#0|6333946|1|0@1", "el segundo lleva su número detrás");
assert.equal(
  new Set(lotesDeTile.map((lote) => lote.bucketKey)).size,
  lotesDeTile.length,
  "dos lotes con la misma clave se pisan en el mapa de mallas del consumidor",
);
ok(true, `cadTileLineBatches emite ${lotesDeTile.length} lotes con claves propias, la primera sin sufijo`);

console.log(
  `line-batch: ${checks} comprobaciones verdes — orden de dibujo resoluble a 100k (paso ${consecutiveStep.toExponential(2)} NDC), grosor invariante al zoom en 5 órdenes de magnitud, ${stats.instances} instancias agrupadas en ${stats.batches} lotes, CENTER con sus cuatro tramos (${CAD_LINETYPE_SLOTS} ranuras × ${CAD_LINETYPE_MAX_ELEMENTS}), y ${referencia.count} segmentos empaquetados BIT A BIT como antes (huella ${huellaMedida}), ${totalMuchas} en ${bloques.length} bloques con los mismos bytes.`,
);
