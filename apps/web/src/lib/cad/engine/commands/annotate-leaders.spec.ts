/**
 * LEADER, MLEADER y TOLERANCE.
 *
 * Las dos primeras estrenan `mleader.ts`, que llevaba desde la ola 1 escrito,
 * probado y sin que NADIE lo importara: la geometría del codo que aleja el texto
 * de la punta sale de ahí, y esta spec lo fija con el número exacto.
 *
 * La tercera es la que queda a medias, y la spec lo dice tan claro como el
 * código: el esquema 4 no tiene entidad TOLERANCE, así que el marco se
 * materializa con polilínea, líneas y MTEXT marcados con el mismo identificador.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { cadToleranceCells, cadToleranceLayout } from "./annotate-tolerance";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const layer = "NOTAS";

function document(entities: CadEntity[] = []): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Notas", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc = document(),
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nota${++ids}`,
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

type Mleader = Extract<CadEntity, { type: "mleader" }>;

function mleaderOf(result: CadCommandResult | undefined): Mleader {
  const command = commandsOf(result).find(
    (item) => item.type === "insert" && item.entity.type === "mleader",
  );
  assert.ok(command?.type === "insert", "debía insertar una directriz");
  if (command?.type !== "insert" || command.entity.type !== "mleader") throw new Error("tipo");
  checks += 1;
  return command.entity;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

const wall = (): CadDocument =>
  document([
    { id: "muro", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 2_000, y: 0, z: 0 }, layer },
  ]);

// --- alias ---------------------------------------------------------------------------
{
  eq(CAD_COMMAND_REGISTRY_V2.get("MLD")?.name, "MLEADER", "MLD → MLEADER");
  eq(CAD_COMMAND_REGISTRY_V2.get("LE")?.name, "LEADER", "LE → LEADER");
  eq(CAD_COMMAND_REGISTRY_V2.get("TOL")?.name, "TOLERANCE", "TOL → TOLERANCE");
}

// --- MLEADER: punta enganchada y codo donde lo puso el dibujante ------------------------
{
  const doc = wall();
  const entity = mleaderOf(
    run("MLEADER", [point(0, 0), point(1_000, 1_000), text("MURO CORTAFUEGO 2 h")], doc),
  );
  eq(entity.vertices, [{ x: 0, y: 0, z: 0 }, { x: 1_000, y: 1_000, z: 0 }], "punta y codo");
  eq(entity.text, "MURO CORTAFUEGO 2 h", "la nota");
  // Ancla absoluta del anclaje del texto: `mleader.ts` extiende el codo
  // ALEJÁNDOSE de la punta, 600 por defecto. Si el texto se anclara en el codo,
  // pisaría la línea directriz.
  eq(entity.textPosition, { x: 1_600, y: 1_000, z: 0 }, "codo + 600 hacia el lado contrario a la punta");
  eq(entity.landing, true, "con codo de aterrizaje");
  eq(entity.arrowhead, "closed-filled", "punta llena por defecto");
  eq(entity.associative, true, "la punta cayó sobre el extremo del muro");
  eq(entity.references, [{ entityId: "muro", anchor: "start" }], "y se colgó de él");
}

// --- el texto se va al otro lado si la punta está a la derecha ----------------------------
{
  const entity = mleaderOf(run("MLEADER", [point(2_000, 0), point(1_000, 1_000), text("N")], wall()));
  eq(entity.textPosition, { x: 400, y: 1_000, z: 0 }, "codo − 600: la nota nunca pisa la directriz");
}

// --- MLEADER: varias directrices para UNA nota ---------------------------------------------
{
  const doc = wall();
  const entity = mleaderOf(
    run(
      "MLEADER",
      [
        point(0, 0),
        point(1_000, 1_000),
        keyword("Directriz"),
        point(2_000, 0),
        point(1_200, 1_000),
        text("TRES IGUALES"),
      ],
      doc,
    ),
  );
  eq(entity.leaderLines?.length, 2, "dos directrices, un solo rótulo");
  eq(entity.references?.length, 2, "una referencia por directriz, que es lo que pide la regeneración");
  eq(
    entity.references,
    [
      { entityId: "muro", anchor: "start" },
      { entityId: "muro", anchor: "end" },
    ],
    "cada punta a su extremo",
  );
}

// --- la punta SIGUE a la pieza; el codo se queda donde estaba ---------------------------------
{
  const doc = wall();
  const commands = commandsOf(run("MLEADER", [point(0, 0), point(1_000, 1_000), text("NOTA")], doc));
  const created = executeCadEntityCommandBatch(doc, commands, "MLEADER").document;
  const moved = executeCadEntityCommandBatch(
    created,
    [{ type: "grip", entityId: "muro", gripId: "start", point: { x: -500, y: -300 } }],
    "STRETCH",
  );
  const after = moved.document.entities.find((entity) => entity.type === "mleader") as Mleader;
  eq(after.associationStatus, "associated", "sigue asociada");
  eq(after.vertices[0], { x: -500, y: -300, z: 0 }, "la punta siguió al extremo del muro");
  eq(
    after.vertices[1],
    { x: 1_000, y: 1_000, z: 0 },
    "y el codo NO se movió: si siguiera, mover un tornillo arrastraría el rótulo por el plano",
  );
}

// --- opciones de MLEADER ------------------------------------------------------------------------
{
  const entity = mleaderOf(
    run(
      "MLEADER",
      [keyword("Flecha"), text("punto"), keyword("sinCodo"), point(0, 0), point(900, 900), text("X")],
      wall(),
    ),
  );
  eq(entity.arrowhead, "dot", "punta de punto");
  eq(entity.landing, false, "sin codo de aterrizaje");
  eq(entity.textPosition, { x: 900, y: 900, z: 0 }, "y entonces el texto se ancla en el propio codo");
}

// --- LEADER: la directriz clásica admite vértices intermedios --------------------------------------
{
  const entity = mleaderOf(
    run("LEADER", [point(0, 0), point(500, 500), point(1_200, 500), enter, text("VER DETALLE 3")], wall()),
  );
  eq(
    entity.vertices,
    [
      { x: 0, y: 0, z: 0 },
      { x: 500, y: 500, z: 0 },
      { x: 1_200, y: 500, z: 0 },
    ],
    "tres vértices: se puede rodear geometría antes de llegar al texto",
  );
  eq(entity.associative, true, "y la punta sigue enganchada");
}

// --- una nota vacía no es una nota ---------------------------------------------------------------------
{
  const empty = run("MLEADER", [point(0, 0), point(900, 900), text("   ")], wall());
  eq(empty?.kind, "none", "sin texto no se escribe nada");
  const cancelled = run("MLEADER", [point(0, 0), { kind: "cancel" }], wall());
  eq(cancelled?.kind, "none", "Esc no deja rastro");
}

// --- TOLERANCE: el marco de control geométrico ------------------------------------------------------------
{
  const commands = commandsOf(
    run("TOLERANCE", [
      text("posicion"),
      text("0.05"),
      keyword("Máximo"),
      text("A, B, C"),
      distance(100),
      point(0, 0),
    ]),
  );
  // Recuadro + 4 separadores + 5 textos: símbolo, tolerancia y tres datums.
  const polylines = commands.filter((c) => c.type === "insert" && c.entity.type === "polyline");
  const lines = commands.filter((c) => c.type === "insert" && c.entity.type === "line");
  const texts = commands.filter((c) => c.type === "insert" && c.entity.type === "mtext");
  eq(polylines.length, 1, "un recuadro");
  eq(lines.length, 4, "cuatro separadores para cinco casillas");
  eq(texts.length, 5, "y un texto por casilla");

  const cellTexts = texts.map((c) => (c.type === "insert" && c.entity.type === "mtext" ? c.entity.text : ""));
  eq(cellTexts, ["⌖", "0.05Ⓜ", "A", "B", "C"], "símbolo de posición, valor con Ⓜ, y los datums");

  // Todas las piezas llevan la MISMA marca: es lo que permitirá recomponer el
  // marco el día que el esquema tenga su entidad o existan grupos.
  const frames = new Set(
    commands.flatMap((c) =>
      c.type === "insert" ? [(c.entity.context?.metadata?.toleranceFrame as string) ?? ""] : [],
    ),
  );
  eq(frames.size, 1, "un solo identificador de marco");
  ok([...frames][0].length > 0, "y no vacío");

  // Y es UN lote: un solo paso de deshacer para las diez entidades.
  const applied = executeCadEntityCommandBatch(document(), commands, "TOLERANCE");
  eq(applied.document.meta.version, 2, "una entrada de historia");
  eq(applied.createdEntityIds.length, 10, "diez entidades nacidas juntas");
}

// --- TOLERANCE: sin datums y con Enter en los pasos opcionales --------------------------------------------------
{
  const commands = commandsOf(
    run("TOLERANCE", [text("planitud"), text("0.1"), enter, enter, enter, point(0, 0)]),
  );
  const texts = commands.flatMap((c) =>
    c.type === "insert" && c.entity.type === "mtext" ? [c.entity.text] : [],
  );
  eq(texts, ["⏥", "0.1"], "dos casillas: símbolo y valor, sin modificador ni datums");
}

// --- TOLERANCE: una característica inventada se RECHAZA ------------------------------------------------------------
{
  // Un marco de control con la palabra «paralelisno» dentro no es un marco de
  // control: es una nota que parece uno.
  const result = run("TOLERANCE", [text("paralelisno")]);
  eq(result?.kind, "message", "se rechaza");
  ok(
    result?.kind === "message" && result.text.includes("paralelismo"),
    "y se enumeran las válidas, en vez de decir «no válido»",
  );

  const noValue = run("TOLERANCE", [text("posicion"), text("  ")]);
  eq(noValue?.kind, "message", "y un marco sin valor de tolerancia tampoco vale");
}

// --- el reparto de casillas se mide con la MISMA regla que maqueta el MTEXT ------------------------------------------
{
  const layout = cadToleranceLayout(cadToleranceCells({ symbol: "⌖", value: "0.05", material: "Ⓜ", datums: ["A"] }), 100);
  eq(layout.cells.length, 3, "tres casillas");
  eq(layout.boxHeight, 100 + 90, "alto = altura de texto + dos márgenes");
  ok(layout.cells[1].width > layout.cells[2].width, "«0.05Ⓜ» ocupa más que «A»");
  ok(
    layout.cells[2].width >= layout.boxHeight - 1e-9,
    "y aun así la casilla de un datum no baja de un cuadrado: un palillo no se lee como casilla",
  );
  eq(layout.cells[0].x, 0, "la primera casilla arranca en el origen");
  eq(layout.cells[1].x, layout.cells[0].width, "y cada una donde acaba la anterior");
}

console.log(
  `annotate-leaders: ${checks} comprobaciones · MLEADER con varias directrices y punta asociativa ` +
    "(el codo NO se mueve), LEADER con vértices intermedios, y TOLERANCE materializado como marco + " +
    "textos marcados con un identificador común porque el esquema 4 no tiene entidad TOLERANCE",
);
