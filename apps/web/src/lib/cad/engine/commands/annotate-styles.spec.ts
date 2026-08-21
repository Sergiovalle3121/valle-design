/**
 * STYLE, DIMSTYLE, MLEADERSTYLE y TABLESTYLE.
 *
 * Lo que se comprueba, además del camino feliz, es lo que hace que estas cuatro
 * órdenes sean útiles y no un formulario:
 *
 *  - Escriben la sección `styles` POR LA RUTA CANÓNICA. Antes sólo el gestor
 *    gráfico podía tocarla, y lo hacía llamando a `commitChange` por su cuenta.
 *  - `upsert` FUSIONA: cambiar la altura de un estilo no le borra la fuente.
 *  - Borrar un estilo EN USO se rechaza contando cuántos objetos lo usan. Un
 *    estilo borrado bajo los pies de una cota le cambia el aspecto sin que nadie
 *    lo haya pedido.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const layer = "0";

function document(entities: CadEntity[] = []): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
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
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "nuevo",
    document: () => doc,
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

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const enter: CadCommandInput = { kind: "enter" };

// --- los alias del vocabulario resuelven ---------------------------------------------
{
  for (const [alias, canonical] of [
    ["ST", "STYLE"],
    ["D", "DIMSTYLE"],
    ["MLS", "MLEADERSTYLE"],
    ["TS", "TABLESTYLE"],
  ] as const)
    eq(CAD_COMMAND_REGISTRY_V2.get(alias)?.name, canonical, `${alias} debe llevar a ${canonical}`);
}

// --- STYLE: crear un estilo de texto ---------------------------------------------------
{
  const commands = commandsOf(run("STYLE", [text("TITULOS"), text("Helvetica"), distance(300)]));
  eq(
    commands,
    [
      {
        type: "style",
        op: "upsert",
        family: "text",
        name: "TITULOS",
        values: { fontFamily: "Helvetica", height: 300 },
      },
    ],
    "un solo comando de estilo, con los dos campos",
  );

  // Y de verdad llega a la tabla del documento.
  const applied = executeCadEntityCommandBatch(document(), commands, "STYLE");
  eq(applied.document.styles.text.TITULOS, { fontFamily: "Helvetica", height: 300 }, "en `styles.text`");
  eq(applied.document.meta.version, 2, "un solo paso de deshacer");
}

// --- Enter acepta los valores propuestos -------------------------------------------------
{
  const commands = commandsOf(run("STYLE", [text("BASE"), enter, enter]));
  eq(
    commands[0],
    { type: "style", op: "upsert", family: "text", name: "BASE", values: { fontFamily: "Arial", height: 120 } },
    "los campos no tocados viajan con su valor por defecto, no ausentes",
  );
}

// --- upsert FUSIONA: escribir la altura no borra la fuente ---------------------------------
{
  const base = executeCadEntityCommandBatch(
    document(),
    commandsOf(run("STYLE", [text("COTAS"), text("Courier"), distance(200)])),
    "STYLE",
  ).document;
  const merged = executeCadEntityCommandBatch(
    base,
    [{ type: "style", op: "upsert", family: "text", name: "COTAS", values: { height: 90 } }],
    "STYLE",
  ).document;
  eq(merged.styles.text.COTAS, { fontFamily: "Courier", height: 90 }, "la fuente sobrevive");
}

// --- DIMSTYLE: el diálogo curado del núcleo DIMVAR --------------------------------------------
{
  const commands = commandsOf(
    run("DIMSTYLE", [
      text("ARQ"),
      text("TITULOS"), // DIMTXSTY
      distance(300), // DIMTXT
      distance(240), // DIMASZ
      text("dot"), // DIMBLK
      distance(3.4), // DIMDEC → 3
      text("m"), // unidad
      distance(2), // DIMSCALE
    ]),
  );
  eq(
    commands[0],
    {
      type: "style",
      op: "upsert",
      family: "dimension",
      name: "ARQ",
      values: {
        textStyle: "TITULOS",
        textHeight: 300,
        arrowSize: 240,
        arrowhead: "dot",
        precision: 3,
        units: "m",
        overallScale: 2,
      },
    },
    "la precisión son dígitos: se redondea; el núcleo curado viaja entero",
  );
}

// --- DIMSTYLE: el vocabulario cerrado se niega en el momento de teclear -----------------------
{
  const result = run("DIMSTYLE", [
    text("ARQ"),
    text("TITULOS"),
    distance(300),
    distance(240),
    text("flecha-inventada"),
  ]);
  ok(result?.kind === "message", "un terminador inventado no se guarda");
  ok(
    result?.kind === "message" && result.text.includes("closed-filled"),
    "la negativa enumera el vocabulario",
  );
}

// --- DIMSTYLE → Aplicar: la norma alcanza a las cotas ya dibujadas ----------------------------
{
  const doc = document([
    {
      id: "d1",
      type: "dimension",
      a: { x: 0, y: 0 },
      b: { x: 1000, y: 0 },
      layer,
      style: "ARQ",
      arrowSize: 999,
    } as unknown as CadEntity,
    {
      id: "d2",
      type: "dimension",
      a: { x: 0, y: 0 },
      b: { x: 500, y: 0 },
      layer,
      style: "Otro",
    } as unknown as CadEntity,
  ]);
  doc.styles.dimension.ARQ = { arrowSize: 240, precision: 1, overallScale: 2 };

  const commands = commandsOf(run("DIMSTYLE", [keyword("Aplicar"), text("ARQ")], doc));
  eq(commands.length, 1, "sólo la cota del estilo se re-hornea");
  const replace = commands[0] as Extract<CadEntityCommand, { type: "replace" }>;
  eq(replace.type, "replace", "re-horneado por reemplazo");
  eq(replace.entityId, "d1", "la cota correcta");
  eq(
    (replace.entity as { arrowSize?: number }).arrowSize,
    480,
    "arrowSize del estilo × DIMSCALE pisa el valor viejo",
  );
  eq((replace.entity as { precision?: number }).precision, 1, "la precisión de la norma llega");

  const vacio = run("DIMSTYLE", [keyword("Aplicar"), text("SinCotas")], doc);
  ok(
    vacio?.kind === "message" && vacio.text.includes("Ninguna cota"),
    "aplicar sin cotas del estilo se niega con motivo",
  );
}

// --- DIMSTYLE → Comparar: diferencias efectivas, con su DIMVAR --------------------------------
{
  const doc = document();
  doc.styles.dimension.A = { arrowSize: 100 };
  doc.styles.dimension.B = { arrowSize: 250, precision: 0 };
  const result = run("DIMSTYLE", [keyword("Comparar"), text("A"), text("B")], doc);
  ok(result?.kind === "message", "comparar responde por el canal de mensajes");
  ok(
    result?.kind === "message" &&
      result.text.includes("DIMASZ") &&
      result.text.includes("100") &&
      result.text.includes("250"),
    "el mensaje nombra el DIMVAR y ambos valores",
  );
  const identicos = run("DIMSTYLE", [keyword("Comparar"), text("A"), text("A")], doc);
  ok(
    identicos?.kind === "message" && identicos.text.includes("idénticos"),
    "compararse consigo mismo lo dice claro",
  );
}

// --- MLEADERSTYLE: el campo booleano se contesta con palabra clave -----------------------------
{
  const commands = commandsOf(
    run("MLEADERSTYLE", [text("NOTAS"), enter, distance(150), distance(500), keyword("No")]),
  );
  eq(
    commands[0],
    {
      type: "style",
      op: "upsert",
      family: "mleader",
      name: "NOTAS",
      values: { textStyle: "Standard", arrowSize: 150, doglegLength: 500, landing: false },
    },
    "«No» apaga el codo de aterrizaje",
  );
}

// --- TABLESTYLE ---------------------------------------------------------------------------------
{
  const commands = commandsOf(run("TABLESTYLE", [text("CAJETIN"), text("BASE"), distance(180)]));
  eq(
    commands[0],
    {
      type: "style",
      op: "upsert",
      family: "table",
      name: "CAJETIN",
      values: { textStyle: "BASE", rowHeight: 180 },
    },
    "estilo de tabla",
  );
}

// --- rechazos, que es donde se nota si la orden es seria -------------------------------------------
{
  const nameless = run("STYLE", [text("   ")]);
  eq(nameless?.kind, "message", "un estilo sin nombre se rechaza");

  const negative = run("STYLE", [text("X"), text("Arial"), distance(0)]);
  eq(negative?.kind, "message", "una altura de cero no dibuja nada");
  ok(
    negative?.kind === "message" && negative.text.includes("mínimo"),
    "y el mensaje dice cuál era el mínimo",
  );
}

// --- borrar: se puede si no lo usa nadie ------------------------------------------------------------
{
  const commands = commandsOf(run("STYLE", [keyword("Suprimir"), text("HUÉRFANO")]));
  eq(
    commands[0],
    { type: "style", op: "delete", family: "text", name: "HUÉRFANO" },
    "borra el estilo sin usar",
  );
}

// --- borrar: se NIEGA si está en uso, y dice cuántos objetos lo usan ---------------------------------
{
  const doc = document([
    { id: "t1", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "A", style: "TITULOS", layer },
    { id: "t2", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "B", style: "TITULOS", layer },
    { id: "t3", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "C", style: "OTRO", layer },
  ]);
  const result = run("STYLE", [keyword("Suprimir"), text("TITULOS")], doc);
  eq(result?.kind, "message", "no se borra un estilo en uso");
  ok(
    result?.kind === "message" && result.text.includes("2 objeto"),
    "y CUENTA los que lo usan, sin contar los de otro estilo",
  );

  // El de otro estilo sí se borra: el bloqueo cuenta referencias reales, no
  // «hay textos en el dibujo».
  const other = run("STYLE", [keyword("Suprimir"), text("SIN-USO")], doc);
  eq(other?.kind, "document", "un estilo que nadie usa sí se borra");
}

// --- borrar de verdad quita la entrada de la tabla ------------------------------------------------------
{
  const base = executeCadEntityCommandBatch(
    document(),
    [{ type: "style", op: "upsert", family: "dimension", name: "TEMP", values: { arrowSize: 100 } }],
    "DIMSTYLE",
  ).document;
  ok(!!base.styles.dimension.TEMP, "primero existe");
  const removed = executeCadEntityCommandBatch(
    base,
    commandsOf(run("DIMSTYLE", [keyword("Suprimir"), text("TEMP")], base)),
    "DIMSTYLE",
  ).document;
  eq(removed.styles.dimension.TEMP, undefined, "y luego no");
}

console.log(
  `annotate-styles: ${checks} comprobaciones · las cuatro órdenes de estilo escriben ` +
    "`styles` por la ruta canónica, fusionan en lugar de pisar, y se niegan a borrar lo que está en uso",
);
