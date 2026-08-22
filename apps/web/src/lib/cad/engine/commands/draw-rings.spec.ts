/**
 * DONUT y REVCLOUD.
 *
 * Las dos son polilíneas con `bulge`, y las dos tienen un detalle que si se
 * equivoca produce un dibujo cerrado, válido y falso:
 *
 *   1. Un DONUT es una polilínea de DOS vértices sobre la circunferencia MEDIA,
 *      con `bulge = 1` y grosor `(exterior − interior)/2`. Si el eje se pone en
 *      el radio exterior o el grosor se toma como el diámetro completo, el
 *      dibujo sigue pareciendo un donut y mide otra cosa.
 *   2. Los arcos de una REVCLOUD comban hacia FUERA. Hacia dentro se dibuja
 *      igual de bien y significa otra cosa: no es una nube de revisión.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_DRAW_RING_COMMANDS, donutEntity, REVCLOUD_BULGE, revcloudVertices } from "./draw-rings";

const commands = new Map(CAD_DRAW_RING_COMMANDS.map((command) => [command.name, command]));

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

function run(name: string, inputs: readonly CadCommandInput[]) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe estar registrado`);
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
const ENTER: CadCommandInput = { kind: "enter" };

const near = (actual: number, expected: number, what: string, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

// --- DONUT: la representación canónica, con anclas absolutas ------------------
{
  // Interior 100, exterior 300 → radio medio 100, grosor 100.
  const entity = donutEntity("d1", { x: 500, y: 500 }, 100, 300, "MUROS");
  if (entity.type !== "polyline") throw new Error("tipo");
  assert.equal(entity.vertices.length, 2, "dos vértices, como la LWPOLYLINE de AutoCAD");
  assert.equal(entity.closed, true);
  near(entity.vertices[0].x, 400, "el eje está en la circunferencia MEDIA, no en la exterior");
  near(entity.vertices[1].x, 600, "y el otro vértice, diametralmente opuesto");
  near(entity.vertices[0].y, 500, "sobre la horizontal del centro");
  assert.equal(entity.vertices[0].bulge, 1, "media vuelta por vértice");
  assert.equal(entity.vertices[1].bulge, 1);
  // Grosor = radio exterior − radio interior = 150 − 50 = 100. Tomar el
  // diámetro daría 200 y el donut saldría del doble de grueso.
  near(entity.vertices[0].startWidth ?? 0, 100, "grosor = (exterior − interior)/2");
  near(entity.vertices[0].endWidth ?? 0, 100, "en las dos puntas del tramo");

  // Los diámetros al revés dan el mismo donut: cuál es el interior lo decide el
  // valor, no el orden en que se teclea.
  const swapped = donutEntity("d2", { x: 0, y: 0 }, 300, 100, "MUROS");
  if (swapped.type !== "polyline") throw new Error("tipo");
  near(swapped.vertices[0].startWidth ?? 0, 100, "el orden de los diámetros no cambia el grosor");
  near(swapped.vertices[1].x, 100, "ni el radio medio");
}

// --- DONUT: la orden coloca varios y termina en UN lote -----------------------
{
  const result = run("DONUT", [distance(100), distance(300), point(0, 0), point(1_000, 0), ENTER]);
  assert.ok(result && result.kind === "document");
  if (result.kind !== "document") throw new Error("tipo");
  assert.equal(result.commands.length, 2, "dos donuts colocados");
  // Un solo lote: la frontera de deshacer es el COMANDO, así que Ctrl+Z retira
  // los dos de una vez y no uno por clic.
  assert.equal(result.label, "DONUT");
  for (const command of result.commands) {
    assert.equal(command.type, "insert");
    if (command.type !== "insert" || command.entity.type !== "polyline") throw new Error("tipo");
    assert.equal(command.entity.layer, "MUROS");
  }
}

// --- DONUT: un donut sin tamaño no se escribe --------------------------------
{
  assert.equal(run("DONUT", [distance(0), distance(0), point(0, 0)])?.kind, "none");
}

// --- REVCLOUD: la cuerda subdivide, y la curvatura es la del festón clásico --
{
  // Ancla absoluta: `flecha = (cuerda/2) · bulge`, así que con bulge 0,5 cada
  // festón sobresale un CUARTO de su cuerda. Es lo que hace que se vea como una
  // nube y no como un borde ligeramente ondulado.
  assert.equal(REVCLOUD_BULGE, 0.5, "el festón clásico sobresale un cuarto de su cuerda");

  const vertices = revcloudVertices(
    [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ],
    100,
  );
  assert.equal(vertices.length, 16, "cuatro lados de 400 con cuerdas de 100 → 16 festones");
  // Ninguno sale RECTO: confundir la cuerda con la longitud recorrida deja
  // bulge 0 y dibuja el rectángulo de partida con más vértices — una nube de
  // revisión que no ondula, y sin un solo error por ningún sitio.
  for (const vertex of vertices) assert.equal(vertex.bulge, 0.5, "todos comban igual y hacia el mismo lado");

  // Un lado más corto que la cuerda pedida sigue ondulándose una vez.
  const tiny = revcloudVertices(
    [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
    ],
    100,
  );
  assert.equal(tiny.length, 3, "un festón por lado como mínimo");
}

// --- REVCLOUD: rectangular, y los arcos hacia FUERA --------------------------
{
  const result = run("REVCLOUD", [keyword("Arco"), distance(100), point(0, 0), point(400, 400)]);
  assert.ok(result && result.kind === "document");
  if (result.kind !== "document") throw new Error("tipo");
  const command = result.commands[0];
  if (command.type !== "insert" || command.entity.type !== "polyline") throw new Error("tipo");
  const entity = command.entity;
  assert.equal(entity.closed, true);
  assert.equal(entity.vertices.length, 16);

  // El contorno (0,0)→(400,0)→(400,400)→(0,400) es ANTIHORARIO. En esa
  // orientación un bulge positivo comba hacia DENTRO, así que la nube tiene que
  // llevarlos negativos. El signo es lo único que separa una nube de revisión
  // de una cadena de mordiscos, y las dos se dibujan igual de bien.
  for (const vertex of entity.vertices)
    assert.ok((vertex.bulge ?? 0) < 0, `bulge ${vertex.bulge} debería combar hacia fuera`);

  // Y se comprueba geométricamente, no sólo por el signo: el punto medio del
  // primer arco queda FUERA del rectángulo (y < 0 en el lado inferior).
  const [start, next] = entity.vertices;
  const chord = Math.hypot(next.x - start.x, next.y - start.y);
  const sagitta = (chord / 2) * start.bulge!;
  near(chord, 100, "cada festón mide la cuerda pedida", 1e-6);
  near(sagitta, -25, "y sobresale 25 hacia FUERA: un cuarto de su cuerda, con signo negativo", 1e-6);
}

// --- REVCLOUD: estilo caligráfico usa el grosor por tramo --------------------
{
  const result = run("REVCLOUD", [
    keyword("Estilo"),
    keyword("Caligrafía"),
    keyword("Arco"),
    distance(100),
    point(0, 0),
    point(200, 200),
  ]);
  assert.ok(result && result.kind === "document");
  if (result.kind !== "document") throw new Error("tipo");
  const command = result.commands[0];
  if (command.type !== "insert" || command.entity.type !== "polyline") throw new Error("tipo");
  const vertex = command.entity.vertices[0];
  assert.equal(vertex.startWidth, 0, "el trazo caligráfico nace fino");
  assert.ok((vertex.endWidth ?? 0) > 0, "y engorda hacia el final del arco");
}

// --- REVCLOUD: un rectángulo degenerado no es una nube, Y LO DICE -----------
{
  // Antes terminaba con `none`: la nube desaparecía sin explicación. El gate
  // de integridad lo clasifica como no-op mudo; ahora el comando lo cuenta.
  const degenerate = run("REVCLOUD", [point(0, 0), point(0, 400)]);
  assert.equal(degenerate?.kind, "message", "no se escribe nube degenerada");
  assert.match(
    (degenerate as { text: string }).text,
    /alineadas/,
    "y se explica en vez de callar",
  );
}

console.log(
  "DONUT: polilínea de dos vértices sobre el radio medio, bulge 1 y grosor (ext−int)/2, en un solo lote. " +
    "REVCLOUD: festones de la cuerda pedida combando hacia FUERA, comprobado por la flecha absoluta",
);
