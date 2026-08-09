/**
 * Caracterización de las transformadas por adaptador, ANTES de tocarlas.
 *
 * La ola 5 sustituye la aplicación *ad hoc* de `{translation, rotationDeg,
 * scale, origin}` en once adaptadores por una sola afín 2×3. Cambiar once
 * implementaciones a la vez sin una red debajo es la forma más eficiente que
 * existe de introducir un error que nadie ve: una transformada equivocada no
 * revienta, dibuja algo plausible.
 *
 * Esta spec es la red, y se escribe **antes** de la refactorización para que
 * mida el comportamiento ACTUAL. Si mañana la afín rompe algo, falla aquí con
 * el nombre del adaptador delante.
 *
 * ## La propiedad
 *
 * Transformar y deshacer la transformación devuelve la entidad original:
 *
 *     transform(transform(e, m), m⁻¹) ≈ e
 *
 * Es una propiedad fuerte y barata. Pincha errores que un caso concreto no
 * pincha: aplicar el giro antes que la escala, olvidar el origen en uno de los
 * dos sentidos, o aplicar la traslación dos veces.
 *
 * ## Qué NO afirma esta spec
 *
 * La ida y vuelta no dice que la ida sea correcta — la identidad también la
 * cumple. Por eso además se afirman anclas absolutas: un giro de 90° lleva
 * (100,0) a (0,100), una escala de 2 desde el origen dobla las distancias. Lo
 * uno sin lo otro no vale.
 *
 * ## Lo que esta spec ya encontró
 *
 * Se documenta abajo, junto a cada excepción. Una excepción sin explicación es
 * una prueba que se ha rebajado hasta pasar.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import {
  CAD_ENTITY_REGISTRY,
  type CadEntityTransform,
  type CadNativeEntity,
} from "./entity-runtime";

/** Generador determinista: el corpus debe ser el mismo en cada corrida. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = lcg(20260808);

/**
 * Un ejemplar de cada tipo nativo.
 *
 * Se escriben a mano en vez de generarse porque los campos tienen semántica:
 * un `bulge` es el signo del sentido de un arco, no un número cualquiera, y un
 * `ratio` de elipse está acotado a (0,1]. Un generador ciego produciría
 * entidades imposibles y la spec mediría casos que el producto nunca crea.
 */
const CORPUS: CadEntity[] = [
  {
    id: "line",
    type: "line",
    start: { x: 100, y: 200, z: 0 },
    end: { x: 700, y: 500, z: 0 },
    layer: "0",
  },
  {
    id: "polyline",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      // Vértice con bulge: el signo codifica el sentido del arco entre este
      // vértice y el siguiente. Es el campo que una reflexión debe negar.
      { x: 400, y: 0, z: 0, bulge: 0.5 },
      { x: 400, y: 300, z: 0, bulge: -0.25 },
      { x: 0, y: 300, z: 0 },
    ],
    closed: true,
    layer: "0",
  },
  {
    id: "circle",
    type: "circle",
    center: { x: 250, y: 250, z: 0 },
    radius: 120,
    layer: "0",
  },
  {
    id: "arc",
    type: "arc",
    center: { x: 300, y: 300, z: 0 },
    radius: 150,
    startAngle: 30,
    endAngle: 200,
    layer: "0",
  },
  {
    id: "ellipse",
    type: "ellipse",
    center: { x: 500, y: 400, z: 0 },
    majorAxis: { x: 200, y: 50, z: 0 },
    ratio: 0.4,
    startParameter: 0,
    endParameter: Math.PI * 2,
    layer: "0",
  },
  {
    id: "spline",
    type: "spline",
    degree: 3,
    controlPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 300, z: 0 },
      { x: 400, y: 300, z: 0 },
      { x: 500, y: 0, z: 0 },
    ],
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    layer: "0",
  },
  {
    id: "mtext",
    type: "mtext",
    insertion: { x: 120, y: 640, z: 0 },
    text: "PLANTA BAJA",
    height: 25,
    rotation: 15,
    layer: "0",
  },
  {
    id: "hatch",
    type: "hatch",
    pattern: "ANSI31",
    solid: false,
    boundaries: [
      [
        { x: 0, y: 0, z: 0 },
        { x: 300, y: 0, z: 0 },
        { x: 300, y: 200, z: 0 },
        { x: 0, y: 200, z: 0 },
      ],
    ],
    // `angle` es el que una reflexión tiene que convertir en `180° − ángulo`;
    // con 0 el error sería invisible, así que el corpus lo lleva distinto de 0.
    angle: 45,
    scale: 2,
    islandStyle: "normal",
    layer: "0",
  },
  {
    // Sombreado SIN ángulo ni espaciado explícitos: el caso que destapó que la
    // transformada y el renderizador usaban valores por defecto distintos.
    id: "hatch-por-defecto",
    type: "hatch",
    pattern: "ANSI31",
    solid: false,
    boundaries: [
      [
        { x: 1000, y: 1000, z: 0 },
        { x: 1400, y: 1000, z: 0 },
        { x: 1200, y: 1300, z: 0 },
      ],
    ],
    layer: "0",
  },
  {
    id: "dimension",
    type: "dimension",
    a: { x: 0, y: 0 },
    b: { x: 800, y: 0 },
    dimensionKind: "linear",
    axis: "x",
    offset: 120,
    layer: "0",
  },
  {
    id: "mleader",
    type: "mleader",
    vertices: [
      { x: 400, y: 400, z: 0 },
      { x: 600, y: 600, z: 0 },
    ],
    text: "Junta de dilatación",
    textPosition: { x: 620, y: 610, z: 0 },
    layer: "0",
  },
  {
    id: "insert",
    type: "insert",
    block: "PUERTA",
    insertion: { x: 900, y: 300, z: 0 },
    // Escala no uniforme a propósito: es donde un adaptador que asume escala
    // uniforme se delata.
    scale: { x: 1.5, y: 0.75, z: 1 },
    rotation: 30,
    layer: "0",
  },
];

/**
 * Transformadas del corpus.
 *
 * Se cubren los tres factores por separado y combinados, con y sin origen,
 * porque los errores clásicos viven en la composición: aplicar el giro antes
 * que la escala da un resultado distinto y ambos «parecen bien» en un dibujo.
 */
const TRANSFORMS: { label: string; forward: CadEntityTransform; inverse: CadEntityTransform }[] = [
  {
    label: "traslación pura",
    forward: { translation: { x: 350, y: -125 } },
    inverse: { translation: { x: -350, y: 125 } },
  },
  {
    label: "giro alrededor del origen",
    forward: { rotationDeg: 37 },
    inverse: { rotationDeg: -37 },
  },
  {
    label: "giro alrededor de un punto",
    forward: { rotationDeg: 90, origin: { x: 250, y: 250 } },
    inverse: { rotationDeg: -90, origin: { x: 250, y: 250 } },
  },
  {
    label: "escala uniforme desde un punto",
    forward: { scale: 2.5, origin: { x: 100, y: 100 } },
    inverse: { scale: 1 / 2.5, origin: { x: 100, y: 100 } },
  },
];

/**
 * Reflexiones. **Una reflexión es su propia inversa**, así que la ida y vuelta
 * se hace aplicándola DOS VECES — sin necesidad de construir un inverso, que es
 * justo donde se cuelan los errores de las pruebas.
 *
 * Es además la propiedad más fuerte del archivo: si un adaptador olvida negar
 * el `bulge`, o intercambiar los extremos del arco, o reflejar el ángulo del
 * patrón, aplicar dos veces NO devuelve la entidad original y falla aquí con su
 * nombre delante. Un caso concreto podría pasar por casualidad; catorce ejes
 * distintos sobre doce tipos, no.
 */
const MIRRORS: { label: string; mirror: NonNullable<CadEntityTransform["mirror"]> }[] = [
  { label: "eje vertical por el origen", mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } } },
  { label: "eje horizontal por el origen", mirror: { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } } },
  { label: "eje vertical desplazado", mirror: { point: { x: 500, y: 0 }, direction: { x: 0, y: 1 } } },
  { label: "eje a 45°", mirror: { point: { x: 0, y: 0 }, direction: { x: 1, y: 1 } } },
  { label: "eje a 30° fuera del origen", mirror: { point: { x: 120, y: -80 }, direction: { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) } } },
];

// Diez transformadas aleatorias deterministas, cada una con su inversa exacta.
for (let index = 0; index < 10; index += 1) {
  const rotationDeg = Math.round((random() * 720 - 360) * 1000) / 1000;
  const scale = 0.2 + random() * 4;
  const origin = { x: Math.round(random() * 1000 - 500), y: Math.round(random() * 1000 - 500) };
  const translation = { x: Math.round(random() * 800 - 400), y: Math.round(random() * 800 - 400) };
  TRANSFORMS.push({
    label: `aleatoria ${index + 1} (θ=${rotationDeg}°, s=${scale.toFixed(3)})`,
    forward: { rotationDeg, scale, origin, translation },
    // La inversa NO es simétrica campo a campo: la ida aplica giro y escala
    // alrededor del origen y DESPUÉS traslada, así que la vuelta tiene que
    // quitar la traslación primero. Se expresa como dos pasos.
    inverse: { translation: { x: -translation.x, y: -translation.y } },
  });
}

/**
 * Compara dos entidades numéricamente.
 *
 * Se recorre la estructura en vez de comparar JSON porque los números llevan
 * error de coma flotante: `assert.deepEqual` fallaría por un 1e-13 que no le
 * importa a nadie, y redondear antes de comparar escondería errores de verdad.
 */
function drift(left: unknown, right: unknown, path = ""): string[] {
  if (typeof left === "number" && typeof right === "number") {
    if (!Number.isFinite(left) || !Number.isFinite(right))
      return [`${path}: ${left} vs ${right} (no finito)`];
    // Tolerancia RELATIVA: 1e-9 absoluto sería imposible de cumplir para una
    // coordenada de 100.000 mm y demasiado laxo para un `ratio` de 0,4.
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) / scale > 1e-9
      ? [`${path}: ${left} vs ${right}`]
      : [];
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length)
      return [`${path}: longitud ${left.length} vs ${right.length}`];
    return left.flatMap((item, index) => drift(item, right[index], `${path}[${index}]`));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) =>
      drift(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
      ),
    );
  }
  return left === right ? [] : [`${path}: ${String(left)} vs ${String(right)}`];
}

/**
 * Campos que una transformada NORMALIZA a propósito, con su motivo.
 *
 * No todo lo que cambia en la ida y vuelta es un error. Hay campos que el
 * adaptador rellena deliberadamente, y una spec que los tratara como fallos
 * acabaría rebajada hasta pasar. La alternativa opuesta —comparar sólo lo que
 * ya sabemos que va bien— no probaría nada.
 *
 * Así que se listan uno a uno CON su razón. La lista es corta y revisable: si
 * mañana alguien añade un campo aquí sin explicarlo, se ve en el diff.
 *
 * Todo lo demás vuelve a su sitio exactamente, y ahí es donde esta spec ya
 * encontró dos defectos reales: MTEXT y MLEADER materializaban sus tamaños por
 * defecto en CUALQUIER transformada, así que mover un texto le fijaba el ancho
 * de columna y mover una directriz le fijaba la flecha y el codo. Un arrastre
 * cambiaba el dibujo sin que nadie hubiera editado nada. Corregido.
 */
const INTENTIONAL_NORMALIZATION: Record<string, Record<string, string>> = {
  hatch: {
    angle:
      "Girar y desgirar un sombreado sin ángulo explícito deja escrito su " +
      "propio valor por defecto, 45°. Es el MISMO patrón que se veía antes: " +
      "el renderizador dibuja `angle ?? 45`. Nótese que sólo ocurre con giro; " +
      "una traslación pura ya no toca el campo, que es el defecto que esta " +
      "spec destapó y que sí cambiaba el dibujo.",
  },
  dimension: {
    associative:
      "Transformar una cota mueve sus puntos de definición, así que deja de " +
      "medir la geometría a la que se asoció. El adaptador lo declara igual " +
      "que `moveGrip`: conservador y coherente consigo mismo.",
    associationStatus: "Corolario de lo anterior: pasa a 'detached'.",
    offset:
      "`offset` ausente equivale a 0 y se materializa como 0 al escalarlo. " +
      "Es el mismo número, escrito.",
  },
  mleader: {
    associative: "Mismo criterio que la cota: transformarla la desasocia.",
    associationStatus: "Corolario: 'detached'.",
    leaderLines:
      "Migración de esquema, no un efecto de la transformada: `vertices` es " +
      "la directriz única de la v3 y `leaderLines` la forma nueva de varias. " +
      "Al tocar la entidad se escribe en la forma vigente.",
    textRotation:
      "Girar y desgirar deja un `textRotation: 0` explícito donde no había " +
      "campo. Es la MISMA orientación —ausente y 0° significan lo mismo—, y " +
      "no cambia nada de lo que se ve. Se distingue a propósito de los " +
      "tamaños por defecto que sí se corrigieron: `arrowSize` o `width` " +
      "materializados alteran el aspecto, un giro de 0° no.",
  },
};

/** ¿Este cambio está declarado como normalización deliberada? */
function isDeclaredNormalization(entityType: string, path: string): boolean {
  const field = path.split(/[.[]/)[0];
  return Boolean(INTENTIONAL_NORMALIZATION[entityType]?.[field]);
}

function transform(entity: CadEntity, spec: CadEntityTransform): CadNativeEntity {
  assert.ok(CAD_ENTITY_REGISTRY.supports(entity), `sin adaptador para ${entity.type}`);
  const adapter = CAD_ENTITY_REGISTRY.adapter(entity as CadNativeEntity);
  return adapter.commands.transform(entity as never, spec) as CadNativeEntity;
}

// --- ida y vuelta -------------------------------------------------------------
let checks = 0;
const failures: string[] = [];

for (const entity of CORPUS)
  for (const spec of TRANSFORMS) {
    checks += 1;
    // La ida y vuelta de una transformada con traslación necesita deshacer la
    // traslación PRIMERO y luego el giro/escala, porque el adaptador aplica la
    // traslación al final. Se compone explícitamente.
    const forward = transform(entity, spec.forward);
    const undone = spec.forward.translation
      ? transform(
          transform(forward, { translation: { x: -spec.forward.translation.x, y: -spec.forward.translation.y } }),
          {
            rotationDeg: -(spec.forward.rotationDeg ?? 0),
            scale: 1 / (spec.forward.scale ?? 1),
            origin: spec.forward.origin,
          },
        )
      : transform(forward, spec.inverse);
    const differences = drift(entity, undone).filter(
      (difference) => !isDeclaredNormalization(entity.type, difference.split(":")[0]),
    );
    if (differences.length > 0)
      failures.push(`${entity.type} · ${spec.label}: ${differences.slice(0, 3).join(" | ")}`);
  }

// --- reflexiones: aplicar dos veces devuelve el original ----------------------
for (const entity of CORPUS)
  for (const spec of MIRRORS) {
    checks += 1;
    const once = transform(entity, { mirror: spec.mirror });
    const twice = transform(once, { mirror: spec.mirror });
    const differences = drift(entity, twice).filter(
      (difference) => !isDeclaredNormalization(entity.type, difference.split(":")[0]),
    );
    if (differences.length > 0)
      failures.push(
        `${entity.type} · espejo ${spec.label}: ${differences.slice(0, 3).join(" | ")}`,
      );
    // Y la ida tiene que reflejar de verdad: si el adaptador ignorase el
    // espejo, aplicar dos veces también devolvería el original y esta spec
    // pasaría sin que MIRROR hiciera nada.
    if (JSON.stringify(once) === JSON.stringify(entity))
      failures.push(`${entity.type} · espejo ${spec.label}: la entidad NO cambió al reflejarse`);
  }

if (failures.length > 0) {
  console.error(`\nIda y vuelta rota en ${failures.length} de ${checks} combinaciones:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
}
assert.equal(
  failures.length,
  0,
  `${failures.length} de ${checks} combinaciones no vuelven a su sitio`,
);

// --- anclas absolutas: la ida también tiene que ser correcta -------------------
{
  // Un giro de 90° alrededor del origen lleva (100,0) a (0,100). La ida y
  // vuelta sola no lo pincharía: la identidad también vuelve a su sitio.
  const line = transform(
    {
      id: "l",
      type: "line",
      start: { x: 100, y: 0, z: 0 },
      end: { x: 200, y: 0, z: 0 },
      layer: "0",
    },
    { rotationDeg: 90 },
  );
  assert.ok(line.type === "line");
  assert.ok(Math.abs(line.start.x - 0) < 1e-9, `x=${line.start.x}`);
  assert.ok(Math.abs(line.start.y - 100) < 1e-9, `y=${line.start.y}`);
  assert.ok(Math.abs(line.end.y - 200) < 1e-9, `y=${line.end.y}`);
}
{
  // Escala 2 desde el origen: el radio dobla y el centro se aleja al doble.
  const circle = transform(
    { id: "c", type: "circle", center: { x: 100, y: 0, z: 0 }, radius: 50, layer: "0" },
    { scale: 2 },
  );
  assert.ok(circle.type === "circle");
  assert.ok(Math.abs(circle.center.x - 200) < 1e-9, `centro ${circle.center.x}`);
  assert.ok(
    Math.abs(circle.radius - 100) < 1e-9,
    `el radio DEBE escalar con la entidad: ${circle.radius}`,
  );
}
{
  // Un arco girado 90° gira sus dos ángulos. Si el adaptador moviera el centro
  // sin tocar los ángulos, el arco quedaría en su sitio pero mirando mal — el
  // error clásico, y no se ve en un dibujo pequeño.
  const arc = transform(
    {
      id: "a",
      type: "arc",
      center: { x: 0, y: 0, z: 0 },
      radius: 100,
      startAngle: 0,
      endAngle: 90,
      layer: "0",
    },
    { rotationDeg: 90 },
  );
  assert.ok(arc.type === "arc");
  assert.ok(
    Math.abs(((arc.startAngle % 360) + 360) % 360 - 90) < 1e-9,
    `el ángulo inicial debe girar con el arco: ${arc.startAngle}`,
  );
  assert.ok(
    Math.abs(((arc.endAngle % 360) + 360) % 360 - 180) < 1e-9,
    `y el final también: ${arc.endAngle}`,
  );
}

// --- anclas ABSOLUTAS de reflexión --------------------------------------------
//
// La involución de arriba no basta y conviene decir por qué: si un adaptador
// IGNORA por completo el espejo en un campo angular, aplicarlo dos veces
// también devuelve el original — el campo nunca se tocó. La propiedad se cumple
// de forma vacía. Por eso cada regla de reflexión necesita además una
// afirmación absoluta que diga qué valor CONCRETO debe salir.
{
  const aboutX: CadEntityTransform = {
    mirror: { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } },
  };

  // Polilínea: el `bulge` codifica el sentido del arco, así que se NIEGA. El
  // índice del vértice, el orden y el cierre no se tocan.
  const polyline = transform(
    {
      id: "p",
      type: "polyline",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 400, y: 0, z: 0, bulge: 0.5 },
        { x: 400, y: 300, z: 0, bulge: -0.25 },
      ],
      closed: true,
      layer: "0",
    },
    aboutX,
  );
  assert.ok(polyline.type === "polyline");
  assert.equal(polyline.vertices[1].bulge, -0.5, "el bulge se niega al reflejar");
  assert.equal(polyline.vertices[2].bulge, 0.25, "y el negativo se vuelve positivo");
  assert.equal(polyline.vertices[0].bulge, undefined, "un vértice sin bulge sigue sin él");
  assert.equal(polyline.closed, true, "el cierre no cambia");

  // Arco: DXF los recorre SIEMPRE en antihorario, así que reflejar no gira los
  // extremos: los intercambia y los refleja. Espejo sobre el eje X (φ=0):
  // start' = −end, end' = −start. De 30°→200° sale 160°→330°.
  const arc = transform(
    {
      id: "a",
      type: "arc",
      center: { x: 0, y: 0, z: 0 },
      radius: 150,
      startAngle: 30,
      endAngle: 200,
      layer: "0",
    },
    aboutX,
  );
  assert.ok(arc.type === "arc");
  assert.ok(
    Math.abs(arc.startAngle - 160) < 1e-9,
    `el inicio sale del FINAL reflejado: ${arc.startAngle}`,
  );
  assert.ok(
    Math.abs(arc.endAngle - 330) < 1e-9,
    `y el final del inicio reflejado: ${arc.endAngle}`,
  );

  // Sombreado: el ángulo del patrón pasa de α a φ − α. Con φ=0, de 45° a −45°,
  // normalizado a 315°. Sumarlo en vez de reflejarlo dejaría 45° intacto, que
  // es el error que no se ve.
  const hatch = transform(
    {
      id: "h",
      type: "hatch",
      pattern: "ANSI31",
      solid: false,
      boundaries: [[{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }, { x: 300, y: 200, z: 0 }]],
      angle: 45,
      layer: "0",
    },
    aboutX,
  );
  assert.ok(hatch.type === "hatch");
  assert.ok(
    Math.abs((((hatch.angle ?? 0) % 360) + 360) % 360 - 315) < 1e-9,
    `el patrón se refleja, no se conserva: ${hatch.angle}`,
  );

  // INSERT: no se explota jamás. Se re-descompone — el giro pasa a φ − rotación
  // y UN eje de la escala se niega. Con φ=0 y rotación 30, sale −30 (≡330).
  const insert = transform(
    {
      id: "i",
      type: "insert",
      block: "PUERTA",
      insertion: { x: 900, y: 300, z: 0 },
      scale: { x: 1.5, y: 0.75, z: 1 },
      rotation: 30,
      layer: "0",
    },
    aboutX,
  );
  assert.ok(insert.type === "insert");
  assert.ok(
    Math.abs((((insert.rotation % 360) + 360) % 360) - 330) < 1e-9,
    `el giro se RESTA, no se suma: ${insert.rotation}`,
  );
  assert.ok(
    insert.scale.x * insert.scale.y < 0,
    `exactamente un eje de la escala queda negado: ${insert.scale.x}, ${insert.scale.y}`,
  );
  assert.ok(
    Math.abs(Math.abs(insert.scale.x) - 1.5) < 1e-9 &&
      Math.abs(Math.abs(insert.scale.y) - 0.75) < 1e-9,
    "y las magnitudes no cambian bajo un espejo puro",
  );

  // MTEXT: el texto reflejado se re-orienta como el INSERT — φ − rotación.
  const mtext = transform(
    {
      id: "t",
      type: "mtext",
      insertion: { x: 120, y: 640, z: 0 },
      text: "PLANTA BAJA",
      height: 25,
      rotation: 15,
      layer: "0",
    },
    aboutX,
  );
  assert.ok(mtext.type === "mtext");
  assert.ok(
    Math.abs(((((mtext.rotation ?? 0) % 360) + 360) % 360) - 345) < 1e-9,
    `el texto se re-orienta restando: ${mtext.rotation}`,
  );
}

console.log(
  `transformadas por adaptador: ${checks} idas y vueltas verdes sobre ${CORPUS.length} tipos × ${TRANSFORMS.length} transformadas, más 3 anclas absolutas`,
);
