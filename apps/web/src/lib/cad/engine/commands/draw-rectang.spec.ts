/**
 * RECTANG con opciones.
 *
 * Las comprobaciones se centran en lo que sale plausible y equivocado:
 *
 *   1. El bulge de un empalme es `tan(22,5°)` y su SIGNO depende de cómo se
 *      designaron las esquinas. Con el signo cambiado las esquinas salen
 *      abombadas hacia FUERA — lo contrario de un empalme, y perfectamente
 *      dibujable.
 *   2. Un chaflán asimétrico no es simétrico: `2 × 8` recorta 2 por un lado y
 *      8 por el otro, y hay que ver cuál es cuál.
 *   3. `Área` con esquinas recortadas tiene que compensar lo que esas esquinas
 *      quitan; si no, el rectángulo sale MÁS PEQUEÑO de lo pedido.
 *   4. Un chaflán que no cabe cruza los lados: se rechaza con un aviso, no se
 *      dibuja un polígono imposible.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_DRAW_RECTANG_COMMANDS, __testables } from "./draw-rectang";

const descriptor = CAD_DRAW_RECTANG_COMMANDS[0];

function makeContext(): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[]) {
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });

function polyline(result: ReturnType<typeof run>) {
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}`);
  const command = result.commands[0];
  assert.ok(command && command.type === "insert");
  if (command.type !== "insert" || command.entity.type !== "polyline") throw new Error("tipo");
  return command.entity;
}

const near = (actual: number, expected: number, what: string, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

// --- sin opciones: exactamente lo de siempre ---------------------------------
{
  const entity = polyline(run([point(0, 0), point(400, 200)]));
  assert.equal(entity.vertices.length, 4);
  assert.equal(entity.closed, true);
  assert.deepEqual(
    entity.vertices.map((vertex) => [vertex.x, vertex.y]),
    [[0, 0], [400, 0], [400, 200], [0, 200]],
  );
  for (const vertex of entity.vertices) assert.equal(vertex.bulge, undefined);
  assert.equal(entity.layer, "MUROS");
}

// --- Empalme: cuatro arcos de 90°, con el signo que toca ---------------------
{
  const entity = polyline(run([keyword("Empalme"), distance(50), point(0, 0), point(400, 200)]));
  assert.equal(entity.vertices.length, 8, "cada esquina redondeada aporta dos vértices");
  const bulges = entity.vertices.map((vertex) => vertex.bulge ?? 0);
  const arcs = bulges.filter((bulge) => bulge !== 0);
  assert.equal(arcs.length, 4, "cuatro esquinas, cuatro arcos");
  for (const bulge of arcs)
    near(bulge, __testables.QUARTER_TURN_BULGE, "arco de 90° antihorario", 1e-12);
  // El rectángulo se designó de (0,0) a (400,200): recorrido ANTIHORARIO, así
  // que los arcos barren +90°. Designado al revés el recorrido es horario y los
  // arcos tienen que ser negativos, o las esquinas salen abombadas hacia fuera.
  const reversed = polyline(run([keyword("Empalme"), distance(50), point(400, 200), point(0, 0)]));
  for (const bulge of reversed.vertices.map((vertex) => vertex.bulge ?? 0).filter((value) => value !== 0))
    near(bulge, __testables.QUARTER_TURN_BULGE, "designado al revés, sigue siendo un empalme", 1e-12);
  // Y los puntos de tangencia están a `radio` de cada esquina.
  near(entity.vertices[0].x, 50, "tangencia a 50 de la esquina (0,0)");
  near(entity.vertices[0].y, 0, "sobre el lado inferior");
  near(entity.vertices[1].x, 350, "tangencia a 50 de la esquina (400,0)");
}

// --- Chaflán asimétrico: el primer valor recorta el lado de LLEGADA ----------
{
  const entity = polyline(run([keyword("Chaflán"), distance(20), distance(80), point(0, 0), point(400, 200)]));
  assert.equal(entity.vertices.length, 8);
  for (const vertex of entity.vertices) assert.equal(vertex.bulge, undefined, "un chaflán es recto");
  // Recorriendo desde (0,0) hacia +X, la esquina (400,0) se alcanza por el lado
  // inferior: ése lo recorta el PRIMER valor (20) y el lado vertical de salida
  // el SEGUNDO (80).
  near(entity.vertices[1].x, 380, "el lado de llegada se recorta 20");
  near(entity.vertices[2].y, 80, "y el de salida, 80");
  // Y el primer vértice está a 80 del origen sobre el lado inferior, porque de
  // la esquina (0,0) se SALE por ahí.
  near(entity.vertices[0].x, 80, "de la esquina inicial se sale a 80");
}

// --- Chaflán que no cabe: aviso, no polígono imposible -----------------------
{
  const result = run([keyword("Chaflán"), distance(300), distance(300), point(0, 0), point(400, 200)]);
  assert.equal(result?.kind, "message", "un chaflán mayor que el lado cruza los lados");
  assert.ok(result.kind === "message" && result.text.includes("200"), "y el aviso dice qué medía el rectángulo");
}

// --- Elevación y Grosor -------------------------------------------------------
{
  const entity = polyline(run([keyword("Elevación"), distance(250), point(0, 0), point(100, 100)]));
  for (const vertex of entity.vertices) near(vertex.z, 250, "todos los vértices en la cota pedida");

  const thick = polyline(run([keyword("Grosor"), distance(3_000), point(0, 0), point(100, 100)]));
  // El modelo canónico es 2D y no tiene campo de extrusión. Se guarda como
  // metadato para que sobreviva al guardado en vez de perderse en silencio.
  assert.equal(thick.context?.metadata?.thickness, 3_000);
}

// --- Ancho de línea → grosor por tramo ---------------------------------------
{
  const entity = polyline(run([keyword("Ancho"), distance(15), point(0, 0), point(100, 100)]));
  for (const vertex of entity.vertices) {
    near(vertex.startWidth ?? 0, 15, "ancho constante");
    near(vertex.endWidth ?? 0, 15, "en las dos puntas del tramo");
  }
}

// --- Rotación: sigue siendo un rectángulo, girado -----------------------------
{
  const entity = polyline(run([point(0, 0), keyword("Rotación"), distance(90), point(-200, 400)]));
  assert.equal(entity.vertices.length, 4);
  // Con 90° el eje local X apunta a +Y y el local Y a −X, así que la esquina
  // opuesta en (−200, 400) da un rectángulo de 400 de longitud y 200 de ancho.
  const lengths = entity.vertices.map((vertex, index) => {
    const next = entity.vertices[(index + 1) % 4];
    return Math.hypot(next.x - vertex.x, next.y - vertex.y);
  });
  near(lengths[0], 400, "el lado largo va por el eje local X, ya girado", 1e-6);
  near(lengths[1], 200, "y el corto por el local Y", 1e-6);
  // El segundo vértice está en (0, 400): el eje local X apunta a +Y.
  near(entity.vertices[1].x, 0, "eje local X girado 90°", 1e-6);
  near(entity.vertices[1].y, 400, "sobre +Y", 1e-6);
  // Los cuatro ángulos siguen siendo rectos: es la propiedad que define un
  // rectángulo y la que se rompería si la rotación se aplicara a destiempo.
  for (let index = 0; index < 4; index += 1) {
    const a = entity.vertices[index];
    const b = entity.vertices[(index + 1) % 4];
    const c = entity.vertices[(index + 2) % 4];
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    near(dot, 0, `esquina ${index} recta`, 1e-6);
  }
}

// --- Dimensiones: el punto sólo elige el cuadrante ---------------------------
{
  const entity = polyline(
    run([point(1_000, 1_000), keyword("Dimensiones"), distance(300), distance(200), point(0, 0)]),
  );
  // Designando hacia abajo-izquierda, el rectángulo crece en −X y −Y con las
  // medidas dadas: la posición exacta del punto NO cambia el tamaño.
  const xs = entity.vertices.map((vertex) => vertex.x);
  const ys = entity.vertices.map((vertex) => vertex.y);
  near(Math.max(...xs) - Math.min(...xs), 300, "longitud pedida");
  near(Math.max(...ys) - Math.min(...ys), 200, "anchura pedida");
  near(Math.max(...xs), 1_000, "la primera esquina sigue donde se designó");
  near(Math.min(...xs), 700, "y crece hacia −X");
}

// --- Área: compensa lo que las esquinas recortadas quitan --------------------
{
  const plain = polyline(run([point(0, 0), keyword("Área"), distance(20_000), keyword("Longitud"), distance(200)]));
  const xs = plain.vertices.map((vertex) => vertex.x);
  const ys = plain.vertices.map((vertex) => vertex.y);
  near(Math.max(...xs) - Math.min(...xs), 200, "longitud dada");
  near(Math.max(...ys) - Math.min(...ys), 100, "anchura = área / longitud");

  // Con empalme de radio 50, las cuatro esquinas quitan r²·(4 − π) ≈ 2146. Para
  // que el resultado tenga los 20.000 pedidos, el rectángulo bruto debe medir
  // 20.000 + 2.146. Ignorarlo daría 100 de anchura y un área REAL de 17.854.
  const filleted = polyline(
    run([keyword("Empalme"), distance(50), point(0, 0), keyword("Área"), distance(20_000), keyword("Longitud"), distance(200)]),
  );
  const loss = 50 * 50 * (4 - Math.PI);
  near(__testables.cornerAreaLoss({ fillet: 50, chamfer: null } as never), loss, "pérdida por empalme");
  const fy = filleted.vertices.map((vertex) => vertex.y);
  near(Math.max(...fy) - Math.min(...fy), (20_000 + loss) / 200, "la anchura compensa las esquinas");
}

// --- degenerado: no se escribe -----------------------------------------------
{
  assert.equal(run([point(0, 0), point(0, 200)])?.kind, "none", "un rectángulo de área cero no es un rectángulo");
}

console.log(
  "RECTANG: chaflán asimétrico, empalme con el bulge y el signo correctos, elevación, grosor, ancho, " +
    "rotación, dimensiones y área compensada — más el rechazo de lo que no cabe",
);
