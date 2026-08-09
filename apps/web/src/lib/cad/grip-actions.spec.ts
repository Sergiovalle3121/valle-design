/**
 * Grips multifuncionales.
 *
 * Lo que se afirma, y por qué cada cosa:
 *
 *   1. La PRIMERA opción de todo grip es la de siempre, y emite el mismo
 *      `{ type: "grip" }`. Es lo que garantiza que quien no pulse Espacio no
 *      note ningún cambio: el comportamiento actual no se toca, se le añade un
 *      menú detrás.
 *   2. El menú DEPENDE del grip. Un menú fijo pasaría cualquier prueba que sólo
 *      mirase «hay opciones»; aquí se comprueba que una polilínea de dos
 *      vértices NO ofrece eliminar, y que un tramo que ya es arco ofrece
 *      volverlo recto en vez de volver a curvarlo.
 *   3. `Convertir en arco` produce un arco que PASA POR EL PUNTO ARRASTRADO.
 *      Un bulge fijo daría una curva plausible y falsa.
 *   4. Todo cambio va por `replace` conservando el id, o por `grip`. Nunca
 *      borrar y crear: eso rompería las cotas y los sombreados que apuntan a la
 *      entidad.
 *   5. La clave de agrupación es ESTABLE durante un arrastre. Si cambiara entre
 *      posiciones, cada fotograma sería un paso de deshacer y Ctrl+Z devolvería
 *      el grip un píxel.
 */
import { strict as assert } from "node:assert";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "./entity-runtime";
import {
  activeCadGripAction,
  applyCadGripSession,
  beginCadGripSession,
  cadBulgeThroughPoint,
  cadGripActionCommands,
  cadGripActions,
  cadGripDragGroupKey,
  cycleCadGripSession,
} from "./grip-actions";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const polyline: CadNativeEntity = {
  id: "p",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 10, z: 0 },
  ],
  closed: false,
  layer: "0",
};
const twoVertex: CadNativeEntity = {
  id: "p2",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
  ],
  closed: false,
  layer: "0",
};
const curved: CadNativeEntity = {
  id: "pc",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0, bulge: 0.5 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 10, z: 0 },
  ],
  closed: false,
  layer: "0",
};
const spline: CadNativeEntity = {
  id: "s",
  type: "spline",
  degree: 3,
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 20, z: 0 },
    { x: 20, y: -20, z: 0 },
    { x: 30, y: 0, z: 0 },
  ],
  knots: [0, 0, 0, 0, 1, 1, 1, 1],
  layer: "0",
};
const arc: CadNativeEntity = {
  id: "a",
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius: 10,
  startAngle: 0,
  endAngle: 90,
  layer: "0",
};
const circle: CadNativeEntity = {
  id: "c",
  type: "circle",
  center: { x: 0, y: 0, z: 0 },
  radius: 10,
  layer: "0",
};
const line: CadNativeEntity = {
  id: "l",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 0, z: 0 },
  layer: "0",
};

const kinds = (entity: CadNativeEntity, gripId: string) =>
  cadGripActions(entity, gripId).map((action) => action.kind);

// --- la primera opción es SIEMPRE la de hoy ----------------------------------------
{
  for (const [entity, gripId] of [
    [polyline, "vertex:0"],
    [spline, "control:1"],
    [line, "start"],
    [arc, "start"],
  ] as const) {
    checks += 1;
    assert.equal(
      cadGripActions(entity, gripId)[0].kind,
      "stretch",
      `${entity.type}/${gripId} debe empezar por estirar`,
    );
  }
  checks += 1;
  assert.equal(cadGripActions(circle, "center")[0].kind, "move", "un centro se mueve");

  // Y emite el comando de siempre, el que va al `moveGrip` del adaptador.
  const outcome = cadGripActionCommands(polyline, "vertex:1", "stretch", { x: 15, y: 5 });
  assert.ok("commands" in outcome);
  assert.equal(outcome.commands.length, 1);
  assert.ok(outcome.commands[0].type === "grip");
  assert.equal(outcome.commands[0].gripId, "vertex:1");
  assert.equal(outcome.commands[0].entityId, "p");
}

// --- el menú DEPENDE del grip ---------------------------------------------------------
{
  assert.deepEqual(
    kinds(polyline, "vertex:0"),
    ["stretch", "add-vertex", "remove-vertex", "to-arc"],
    "un vértice con tramo por delante ofrece curvarlo",
  );
  assert.deepEqual(
    kinds(polyline, "vertex:2"),
    ["stretch", "add-vertex", "remove-vertex"],
    "el ÚLTIMO vértice de una polilínea abierta no arranca ningún tramo",
  );
  assert.deepEqual(
    kinds(twoVertex, "vertex:0"),
    ["stretch", "add-vertex", "to-arc"],
    "con dos vértices, eliminar no se ofrece: dejaría la polilínea sin geometría",
  );
  assert.deepEqual(
    kinds(curved, "vertex:0"),
    ["stretch", "add-vertex", "remove-vertex", "to-line"],
    "un tramo que YA es arco ofrece volverlo recto, no curvarlo otra vez",
  );
  assert.deepEqual(
    kinds(spline, "control:0"),
    ["stretch", "add-vertex"],
    "una spline de grado 3 con cuatro puntos no puede perder ninguno",
  );
  assert.deepEqual(kinds(circle, "quadrant:0"), ["radius"]);
  assert.deepEqual(kinds(arc, "start"), ["stretch", "radius", "to-line"]);
  assert.deepEqual(kinds(polyline, "vertex:99"), [], "un grip inexistente no ofrece nada");
}

// --- `Convertir en arco` pasa POR EL PUNTO ARRASTRADO -----------------------------------
{
  // Semicircunferencia: de (0,0) a (10,0) pasando por (5,−5). El barrido es
  // 180°, así que el bulge vale tan(45°) = 1, y positivo porque un bulge
  // positivo es antihorario y viajando hacia +x eso pasa POR DEBAJO.
  near(
    cadBulgeThroughPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }),
    1,
    1e-12,
    "semicircunferencia por debajo",
  );
  near(
    cadBulgeThroughPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }),
    -1,
    1e-12,
    "y por encima, el mismo con signo contrario",
  );
  // Un cuarto de vuelta: por (5, −5·tan(22,5°))… mejor un ancla directa: el
  // punto que da un barrido de 90° está a distancia r·(1−cos45°) de la cuerda,
  // con r = 5/sin45°. bulge = tan(22,5°).
  const radius = 5 / Math.sin(Math.PI / 4);
  const sagitta = radius - radius * Math.cos(Math.PI / 4);
  near(
    cadBulgeThroughPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -sagitta }),
    Math.tan(Math.PI / 8),
    1e-12,
    "cuarto de vuelta",
  );

  const outcome = cadGripActionCommands(polyline, "vertex:0", "to-arc", { x: 5, y: -5 });
  assert.ok("commands" in outcome);
  const command = outcome.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "polyline");
  assert.equal(command.entityId, "p", "conserva el id");
  near(command.entity.vertices[0].bulge ?? 0, 1, 1e-12, "y el bulge es el del arco pedido");
  assert.equal(command.entity.vertices[1].bulge ?? 0, 0, "sin tocar los demás tramos");

  // Un punto SOBRE la cuerda no define arco, y se dice.
  const flat = cadGripActionCommands(polyline, "vertex:0", "to-arc", { x: 5, y: 0 });
  assert.ok("error" in flat && flat.error.includes("cuerda"));
}

// --- añadir y eliminar vértices ---------------------------------------------------------
{
  const added = cadGripActionCommands(polyline, "vertex:0", "add-vertex", { x: 5, y: 3 });
  assert.ok("commands" in added);
  const addedCommand = added.commands[0];
  assert.ok(addedCommand.type === "replace" && addedCommand.entity.type === "polyline");
  assert.equal(addedCommand.entity.vertices.length, 4);
  near(addedCommand.entity.vertices[1].x, 5, 1e-12, "el nuevo entra DETRÁS del pinchado");
  near(addedCommand.entity.vertices[1].y, 3, 1e-12, "");

  // Partir un tramo que era ARCO descarta su bulge: mantenerlo daría dos arcos
  // del mismo radio que ya no pasan por donde pasaba el original.
  const split = cadGripActionCommands(curved, "vertex:0", "add-vertex", { x: 5, y: 3 });
  assert.ok("commands" in split);
  const splitCommand = split.commands[0];
  assert.ok(splitCommand.type === "replace" && splitCommand.entity.type === "polyline");
  assert.equal(splitCommand.entity.vertices[0].bulge ?? 0, 0, "el arco partido se endereza");

  const removed = cadGripActionCommands(polyline, "vertex:1", "remove-vertex");
  assert.ok("commands" in removed);
  const removedCommand = removed.commands[0];
  assert.ok(removedCommand.type === "replace" && removedCommand.entity.type === "polyline");
  assert.equal(removedCommand.entity.vertices.length, 2);
  near(removedCommand.entity.vertices[1].x, 10, 1e-12, "queda el que no se quitó");
  near(removedCommand.entity.vertices[1].y, 10, 1e-12, "");

  const refused = cadGripActionCommands(twoVertex, "vertex:0", "remove-vertex");
  assert.ok("error" in refused, "lo que el menú no ofrece, tampoco se ejecuta a la fuerza");
}

// --- la spline resintetiza sus NUDOS al cambiar de puntos ---------------------------------
{
  const outcome = cadGripActionCommands(spline, "control:1", "add-vertex", { x: 15, y: 5 });
  assert.ok("commands" in outcome);
  const command = outcome.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "spline");
  assert.equal(command.entity.controlPoints.length, 5);
  assert.equal(
    command.entity.knots.length,
    command.entity.controlPoints.length + command.entity.degree + 1,
    "un vector de nudos del tamaño viejo describiría otra curva y De Boor la evaluaría fuera de rango",
  );
}

// --- el arco vuelve a ser su cuerda ----------------------------------------------------------
{
  const outcome = cadGripActionCommands(arc, "start", "to-line");
  assert.ok("commands" in outcome);
  const command = outcome.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "line");
  assert.equal(command.entityId, "a", "conserva el id al cambiar de tipo");
  near(command.entity.start.x, 10, 1e-9, "de un extremo…");
  near(command.entity.end.y, 10, 1e-9, "…al otro");

  const radius = cadGripActionCommands(circle, "quadrant:0", "radius", { x: 0, y: 25 });
  assert.ok("commands" in radius);
  assert.ok(radius.commands[0].type === "properties");
  near(radius.commands[0].patch.radius as number, 25, 1e-12, "el radio es la distancia al centro");

  const collapsed = cadGripActionCommands(circle, "quadrant:0", "radius", { x: 0, y: 0 });
  assert.ok("error" in collapsed && collapsed.error.includes("nulo"));
}

// --- Espacio CICLA, y la última vuelve a la primera --------------------------------------------
{
  const session = beginCadGripSession(polyline, "vertex:0");
  assert.ok(session);
  assert.equal(activeCadGripAction(session).kind, "stretch");
  let cycled = cycleCadGripSession(session);
  assert.equal(activeCadGripAction(cycled).kind, "add-vertex");
  cycled = cycleCadGripSession(cycled);
  assert.equal(activeCadGripAction(cycled).kind, "remove-vertex");
  cycled = cycleCadGripSession(cycled);
  assert.equal(activeCadGripAction(cycled).kind, "to-arc");
  cycled = cycleCadGripSession(cycled);
  assert.equal(
    activeCadGripAction(cycled).kind,
    "stretch",
    "vuelve a la primera: pasarse de largo no debe obligar a soltar y empezar",
  );

  assert.equal(beginCadGripSession(polyline, "vertex:99"), null, "un grip inexistente no abre sesión");
}

// --- un ARRASTRE es UN paso de deshacer -----------------------------------------------------
{
  const session = beginCadGripSession(polyline, "vertex:1");
  assert.ok(session);
  const key = cadGripDragGroupKey(session);
  // Cien posiciones intermedias, la MISMA clave. `CanonicalHistory` funde por
  // clave dentro de su ventana de 400 ms; si la clave cambiara, cada fotograma
  // sería una entrada y Ctrl+Z devolvería el grip un píxel.
  for (let step = 0; step < 100; step += 1) {
    const outcome = applyCadGripSession(session, polyline, { x: 10 + step, y: step });
    assert.ok("commands" in outcome);
    checks += 1;
    assert.equal(cadGripDragGroupKey(session), key, "la clave del arrastre no cambia");
  }
  // Cambiar de opción SÍ cambia la clave: estirar y luego curvar son dos cosas
  // distintas y no deben fundirse en un solo paso.
  assert.notEqual(
    cadGripDragGroupKey(cycleCadGripSession(session)),
    key,
    "cambiar de modo abre un paso de deshacer nuevo",
  );
  // Y otro objeto, otra clave.
  const other = beginCadGripSession(curved, "vertex:1");
  assert.ok(other);
  assert.notEqual(cadGripDragGroupKey(other), key);
}

// --- los comandos emitidos son aplicables por el ejecutor real ---------------------------------
{
  // El registro es quien decide si una entidad es nativa. Si `replace` emitiera
  // algo que el registro no soporta, el ejecutor lo rechazaría en tiempo de
  // ejecución y este módulo no se enteraría.
  for (const [entity, gripId, action, point] of [
    [polyline, "vertex:0", "to-arc", { x: 5, y: -5 }],
    [polyline, "vertex:1", "remove-vertex", undefined],
    [spline, "control:1", "add-vertex", { x: 15, y: 5 }],
    [arc, "start", "to-line", undefined],
  ] as const) {
    const outcome = cadGripActionCommands(entity, gripId, action, point);
    assert.ok("commands" in outcome, `${entity.type}/${action}`);
    for (const command of outcome.commands) {
      checks += 1;
      if (command.type !== "replace") continue;
      assert.ok(
        CAD_ENTITY_REGISTRY.supports(command.entity),
        `${entity.type}/${action} emitió una entidad que el registro no reconoce`,
      );
      assert.equal(command.entity.id, command.entityId, "y `replace` conserva el id");
    }
  }
}

// --- NINGÚN grip real se queda sin menú -----------------------------------------------------
{
  // El peligro silencioso: un adaptador nombra sus grips de otra forma
  // (`major:positive` en la elipse) y el menú devuelve lista vacía, con lo que
  // ese grip deja de responder sin que nada falle. Se recorre lo que los
  // adaptadores exponen DE VERDAD.
  const samples: CadNativeEntity[] = [
    line,
    polyline,
    curved,
    circle,
    arc,
    spline,
    {
      id: "e",
      type: "ellipse",
      center: { x: 0, y: 0, z: 0 },
      majorAxis: { x: 20, y: 0, z: 0 },
      ratio: 0.5,
      startParameter: 0,
      endParameter: 360,
      layer: "0",
    },
    { id: "t", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "x", layer: "0" },
    {
      id: "i",
      type: "insert",
      block: "B",
      insertion: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: "0",
    },
  ];
  for (const entity of samples)
    for (const grip of CAD_ENTITY_REGISTRY.adapter(entity).grips.grips(entity)) {
      checks += 1;
      assert.ok(
        cadGripActions(entity, grip.id).length > 0,
        `${entity.type}/${grip.id} se queda sin menú: ese grip dejaría de responder en silencio`,
      );
    }
}

console.log(
  `grips multifuncionales: ${checks} comprobaciones — menú por grip, arco que pasa por el punto ` +
    `arrastrado, ciclo con Espacio y una sola clave de agrupación por arrastre`,
);
