/**
 * HATCH, GRADIENT y BOUNDARY.
 *
 * Lo difícil del sombreado no es rayar un cuadrado: es **el contorno con
 * curvas**, y que la asociatividad sobreviva a que la curva cambie de radio. Eso
 * se prueba aquí con anclas absolutas de ÁREA: una habitación con un extremo
 * semicircular mide 1.000 × 600 + π·300²/2 = 741.372, y un sombreado circular de
 * radio 500 pasa de 785.398 a 2.010.619 al llevar el círculo a radio 800.
 *
 * Y se afirma también el caso incómodo: cambiarle el radio SÓLO al arco de la
 * habitación separa sus extremos de las rectas, el contorno deja de cerrar y el
 * sombreado se marca ROTO. Es la respuesta correcta, y conviene que esté escrita
 * para que nadie la «arregle» rellenando una región que ya no existe.
 *
 * También se fija lo que la orden EMITE: ángulo 45 y espaciado derivado del
 * tamaño real del contorno, no 0 y 1. El renderizador dibuja con `angle ?? 45` y
 * `scale ?? diagonal/40`, y la lectura de propiedades informa `angle ?? 0` y
 * `scale ?? 1`: un HATCH que no fije los campos se dibuja de una manera y se
 * describe de otra, y a la primera edición se convierte en una mancha.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { cadHatchRegionArea, cadLoopInteriorPoint } from "./hatch-support";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} ≠ ${expected} (±${tolerance})`,
  );
  checks += 1;
};

const layer = "RELLENOS";

function document(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Rellenos", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `relleno${++ids}`,
  };
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function commandsOf(result: CadCommandResult | undefined): readonly CadEntityCommand[] {
  assert.ok(result?.kind === "document", `debía escribir; dio ${result?.kind}`);
  if (result?.kind !== "document") throw new Error("tipo");
  checks += 1;
  return result.commands;
}

type Hatch = Extract<CadEntity, { type: "hatch" }>;

function hatchOf(result: CadCommandResult | undefined): { entity: Hatch; drawOrder?: string } {
  const command = commandsOf(result).find(
    (item) => item.type === "insert" && item.entity.type === "hatch",
  );
  assert.ok(command?.type === "insert", "debía insertar un sombreado");
  if (command?.type !== "insert" || command.entity.type !== "hatch") throw new Error("tipo");
  checks += 1;
  return { entity: command.entity, drawOrder: command.drawOrder };
}

const area = (entity: Hatch) => cadHatchRegionArea(entity.boundaries);

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const select = (...entityIds: string[]): CadCommandInput => ({ kind: "selection", entityIds });

/** Cuadrado de 1.000 con un cuadrado de 200 dentro, centrado. */
function withIsland(): CadDocument {
  const square = (id: string, size: number, offset: number): CadEntity => ({
    id,
    type: "polyline",
    vertices: [
      { x: offset, y: offset, z: 0 },
      { x: offset + size, y: offset, z: 0 },
      { x: offset + size, y: offset + size, z: 0 },
      { x: offset, y: offset + size, z: 0 },
    ],
    closed: true,
    layer,
  });
  return document([square("fuera", 1_000, 0), square("isla", 200, 400)]);
}

// --- alias ------------------------------------------------------------------------------
{
  for (const [alias, canonical] of [
    ["H", "HATCH"],
    ["BH", "HATCH"],
    ["GD", "GRADIENT"],
    ["BO", "BOUNDARY"],
  ] as const)
    eq(CAD_COMMAND_REGISTRY_V2.get(alias)?.name, canonical, `${alias} → ${canonical}`);
}

// --- HATCH por punto interior, y los valores por defecto QUE SE DIBUJAN --------------------
{
  const doc = withIsland();
  const { entity, drawOrder } = hatchOf(run("HATCH", [point(100, 100)], doc));
  eq(entity.pattern, "ANSI31", "patrón por defecto");
  eq(entity.solid, false, "no macizo");
  eq(entity.angle, 45, "ángulo 45, el del renderizador — NO 0");
  // Espaciado = diagonal del contorno / 40 = hypot(1000, 1000) / 40 = 35,355…
  near(entity.scale ?? 0, Math.hypot(1_000, 1_000) / 40, 1e-9, "espaciado derivado del contorno — NO 1");
  eq(drawOrder, "back", "el relleno nace DETRÁS de la geometría que lo delimita");
  eq(entity.associative, true, "asociativo");
  eq([...(entity.boundaryRefs ?? [])].sort(), ["fuera", "isla"], "colgado de los dos contornos");
  // Regla Normal: la isla se resta.
  near(area(entity), 1_000 * 1_000 - 200 * 200, 1e-6, "1.000² − 200²");
}

// --- las cuatro reglas de islas -----------------------------------------------------------------
{
  const doc = withIsland();
  const normal = hatchOf(run("HATCH", [keyword("Islas"), keyword("Normal"), point(100, 100)], doc)).entity;
  near(area(normal), 960_000, 1e-6, "Normal: se resta la isla");
  eq(normal.islandStyle, "normal", "y queda escrito en la entidad");

  const outer = hatchOf(run("HATCH", [keyword("Islas"), keyword("Exterior"), point(100, 100)], doc)).entity;
  near(area(outer), 960_000, 1e-6, "Exterior: con una sola isla, la misma región");
  eq(outer.islandStyle, "outer", "pero el estilo es otro y se guarda");

  const ignore = hatchOf(run("HATCH", [keyword("Islas"), keyword("Ignorar"), point(100, 100)], doc)).entity;
  near(area(ignore), 1_000_000, 1e-6, "Ignorar: se rellena a través de la isla");
  eq(ignore.boundaries.length, 1, "y sólo se guarda el contorno exterior");

  // `Ninguna` materializa `ignore`: la región es la misma. Ver la cabecera de
  // `annotate-hatch.ts` — el esquema guarda tres estilos, no cuatro.
  const none = hatchOf(run("HATCH", [keyword("Islas"), keyword("Ninguna"), point(100, 100)], doc)).entity;
  eq(none.islandStyle, "ignore", "Ninguna se materializa como Ignorar, y se dice");
  near(area(none), 1_000_000, 1e-6, "misma región rellenada");
}

// --- HATCH por SELECCIÓN de objetos -----------------------------------------------------------------
{
  const doc = withIsland();
  const { entity } = hatchOf(run("HATCH", [keyword("Objetos"), select("fuera", "isla")], doc));
  near(area(entity), 960_000, 1e-6, "designar los dos contornos da la misma corona que pinchar dentro");
  eq([...(entity.boundaryRefs ?? [])].sort(), ["fuera", "isla"], "y se cuelga de ambos");

  // Y arranca sobre la selección previa, sin pedir nada.
  const preselected = hatchOf(run("HATCH", [], doc, ["fuera"]));
  near(area(preselected.entity), 1_000_000, 1e-6, "con sólo el contorno exterior designado, el cuadrado entero");
}

// --- CONTORNO CON CURVAS: lo difícil ---------------------------------------------------------------------
{
  // Habitación de 1.000 × 600 rematada por un semicírculo de radio 300 a la
  // derecha. Tres rectas y un arco: el contorno hay que teselarlo para poder
  // rellenarlo, y la teselación es la MISMA que usa el regenerador.
  const room = (radius: number): CadDocument =>
    document([
      { id: "s", type: "line", start: { x: 0, y: -radius, z: 0 }, end: { x: 1_000, y: -radius, z: 0 }, layer },
      { id: "n", type: "line", start: { x: 1_000, y: radius, z: 0 }, end: { x: 0, y: radius, z: 0 }, layer },
      { id: "w", type: "line", start: { x: 0, y: radius, z: 0 }, end: { x: 0, y: -radius, z: 0 }, layer },
      {
        id: "e",
        type: "arc",
        center: { x: 1_000, y: 0, z: 0 },
        radius,
        startAngle: -90,
        endAngle: 90,
        layer,
      },
    ]);

  const doc = room(300);
  const commands = commandsOf(run("HATCH", [point(500, 0)], doc));
  const { entity } = hatchOf(run("HATCH", [point(500, 0)], doc));
  const expected = 1_000 * 600 + (Math.PI * 300 * 300) / 2;
  // La tolerancia es la del polígono inscrito en el semicírculo: con la
  // resolución del teselador el error queda muy por debajo del 0,05 %.
  near(area(entity), expected, expected * 5e-4, "1.000 × 600 + π·300²/2 = 741.372");
  eq([...(entity.boundaryRefs ?? [])].sort(), ["e", "n", "s", "w"], "colgado de las tres rectas y el arco");

  // Cambiar SÓLO el radio del arco separa sus extremos de las rectas: el
  // contorno deja de cerrar y el sombreado se marca ROTO. Es la respuesta
  // correcta —el perímetro ya no encierra nada— y se afirma para que nadie la
  // «arregle» rellenando una región que no existe.
  const created = executeCadEntityCommandBatch(doc, commands, "HATCH");
  const detached = executeCadEntityCommandBatch(
    created.document,
    [{ type: "properties", entityId: "e", patch: { radius: 600 } }],
    "PROPERTIES",
  );
  const brokenHatch = detached.document.entities.find((item) => item.type === "hatch") as Hatch;
  eq(brokenHatch.associationStatus, "broken", "el arco se separó de las rectas: contorno abierto");
}

// --- y la asociatividad SÍ sobrevive cuando la curva sigue cerrando -------------------------------------
{
  // Un círculo es un contorno cerrado él solo, así que cambiarle el radio deja
  // el perímetro cerrado y el sombreado se vuelve a teselar con el nuevo.
  const doc = document([
    { id: "c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 500, layer },
  ]);
  const commands = commandsOf(run("HATCH", [point(0, 0)], doc));
  const { entity } = hatchOf(run("HATCH", [point(0, 0)], doc));
  near(area(entity), Math.PI * 500 * 500, Math.PI * 500 * 500 * 5e-4, "π·500² = 785.398");
  eq(entity.boundaryRefs, ["c"], "colgado del círculo");

  const created = executeCadEntityCommandBatch(doc, commands, "HATCH");
  const grown = executeCadEntityCommandBatch(
    created.document,
    [{ type: "properties", entityId: "c", patch: { radius: 800 } }],
    "PROPERTIES",
  );
  const after = grown.document.entities.find((item) => item.type === "hatch") as Hatch;
  eq(after.associationStatus, "associated", "sigue asociado");
  near(
    area(after),
    Math.PI * 800 * 800,
    Math.PI * 800 * 800 * 5e-4,
    "π·800² = 2.010.619: el contorno curvo se volvió a teselar con el radio nuevo",
  );
  ok(
    grown.affectedEntityIds.includes(after.id),
    "y el lote declara que el sombreado cambió, para que el editor lo repinte",
  );
}

// --- rechazos con motivo ---------------------------------------------------------------------------------
{
  const doc = withIsland();
  const outside = run("HATCH", [point(5_000, 5_000)], doc);
  eq(outside?.kind, "message", "un punto fuera de todo no define región");
  ok(
    outside?.kind === "message" && outside.text.includes("contorno cerrado"),
    "y se explica qué falta",
  );

  const open = document([
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer },
    { id: "b", type: "line", start: { x: 1_000, y: 0, z: 0 }, end: { x: 1_000, y: 1_000, z: 0 }, layer },
  ]);
  const notClosed = run("HATCH", [keyword("Objetos"), select("a", "b")], open);
  eq(notClosed?.kind, "message", "una escuadra abierta no encierra nada");
  ok(
    notClosed?.kind === "message" && notClosed.text.includes("extremos sueltos"),
    "y se dice qué mirar",
  );

  const zeroSpacing = run("HATCH", [keyword("Escala"), distance(0)], doc);
  eq(zeroSpacing?.kind, "message", "un espaciado de cero se rechaza");
}

// --- opciones: patrón, ángulo, espaciado y macizo -------------------------------------------------------------
{
  const doc = withIsland();
  const { entity } = hatchOf(
    run(
      "HATCH",
      [keyword("Patrón"), text("cross"), keyword("ánGulo"), distance(30), keyword("Escala"), distance(50), point(100, 100)],
      doc,
    ),
  );
  eq(entity.pattern, "CROSS", "el nombre del patrón se normaliza a mayúsculas");
  eq(entity.angle, 30, "ángulo tecleado");
  eq(entity.scale, 50, "espaciado tecleado, que gana al derivado");
  eq(entity.solid, false, "CROSS no es macizo");

  const solid = hatchOf(run("HATCH", [keyword("Patrón"), text("SOLID"), point(100, 100)], doc)).entity;
  eq(solid.solid, true, "teclear SOLID como patrón da relleno macizo, no rayas");
}

// --- GRADIENT: a medias, y sin perder los colores ---------------------------------------------------------------
{
  const doc = withIsland();
  const { entity } = hatchOf(run("GRADIENT", [keyword("Color"), text("#ff0000, #0000ff"), point(100, 100)], doc));
  eq(entity.pattern, "GRADIENT", "queda marcado como degradado");
  eq(entity.solid, true, "y se materializa MACIZO: el esquema no modela el degradado");
  eq(
    entity.context?.presentation?.color,
    { source: "explicit", value: "#ff0000" },
    "con el color inicial como color del objeto",
  );
  eq(
    entity.context?.metadata,
    { gradientFrom: "#ff0000", gradientTo: "#0000ff" },
    "y los DOS colores guardados, para que un degradado de verdad los encuentre",
  );
}

// --- BOUNDARY dibuja el contorno, no lo rellena ---------------------------------------------------------------------
{
  const doc = withIsland();
  const commands = commandsOf(run("BOUNDARY", [point(100, 100)], doc));
  eq(commands.length, 2, "exterior e isla: dos contornos");
  ok(
    commands.every((command) => command.type === "insert" && command.entity.type === "polyline"),
    "polilíneas, no sombreados",
  );
  const first = commands[0];
  ok(
    first.type === "insert" && first.entity.type === "polyline" && first.entity.closed,
    "y cerradas: un contorno abierto no encierra área",
  );
}

// --- el punto interior de un anillo en U: donde el centroide falla -------------------------------------------------
{
  // Una U: el centroide cae en el hueco. Sin el barrido de respaldo, designar
  // los objetos de una habitación en L no encontraría región.
  const u: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 800 },
    { x: 700, y: 800 },
    { x: 700, y: 0 },
    { x: 1_000, y: 0 },
    { x: 1_000, y: 1_000 },
    { x: 0, y: 1_000 },
  ];
  const interior = cadLoopInteriorPoint(u);
  ok(!!interior, "se encuentra un punto interior");
  const centroid = u.reduce(
    (sum, p) => ({ x: sum.x + p.x / u.length, y: sum.y + p.y / u.length }),
    { x: 0, y: 0 },
  );
  ok(
    Math.abs((interior?.y ?? 0) - centroid.y) > 1 || Math.abs((interior?.x ?? 0) - centroid.x) > 1,
    "y NO es el centroide, que en esta U queda fuera del anillo",
  );
}

console.log(
  `annotate-hatch: ${checks} comprobaciones · HATCH por punto y por objetos, las cuatro reglas de ` +
    "islas sobre los tres valores del esquema, contorno CON ARCO (741.372) que se marca " +
    "roto al abrirse, contorno circular que sobrevive a un cambio de radio (785.398 → 2.010.619), ángulo 45 y espaciado del renderizador emitidos explícitos, GRADIENT a " +
    "medias con los colores guardados y BOUNDARY que dibuja polilíneas cerradas",
);
