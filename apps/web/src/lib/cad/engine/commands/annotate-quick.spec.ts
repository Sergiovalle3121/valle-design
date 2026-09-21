import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_ANNOTATE_QUICK_COMMANDS } from "./annotate-quick";

let checks = 0;
const [qdimCommand, textAlignCommand] = CAD_ANNOTATE_QUICK_COMMANDS;

function contextFor(
  entities: CadEntity[],
  options: { dimstyle?: string; baselineSpacing?: number } = {},
): CadCommandContext {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let ids = 0;
  const ctx: CadCommandContext = {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => byId.get(id),
    blocks: () => [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
  if (options.dimstyle) {
    ctx.variables = {
      get: (name) => (name === "DIMSTYLE" ? options.dimstyle : undefined),
      set: () => ({ ok: true as const, value: "" }),
      publish: () => ({ ok: true as const, value: "" }),
    };
    ctx.document = () =>
      ({
        styles: { text: {}, dimension: { [options.dimstyle!]: { baselineSpacing: options.baselineSpacing } }, mleader: {}, table: {} },
      }) as never;
  }
  return ctx;
}

function keyword(value: string): CadCommandInput {
  return { kind: "keyword", keyword: value };
}

function insertedDimensions(result: ReturnType<typeof run>["result"]): CadDimensionEntity[] {
  assert.ok(result?.kind === "document", `debía escribir; dio ${result?.kind}`);
  if (result?.kind !== "document") throw new Error("tipo");
  return result.commands.map((command) => {
    assert.equal(command.type, "insert");
    if (command.type !== "insert") throw new Error("tipo");
    assert.equal(command.entity.type, "dimension");
    return command.entity as CadDimensionEntity;
  });
}

function run(descriptor: (typeof CAD_ANNOTATE_QUICK_COMMANDS)[number], inputs: readonly CadCommandInput[], context: CadCommandContext) {
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
  }
  return step;
}

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer: "0",
});
const circle = (id: string, cx: number, cy: number, radius: number): CadEntity => ({
  id, type: "circle", center: { x: cx, y: cy, z: 0 }, radius, layer: "0",
});

// --- QDIM: acota una cadena continua entre tres posiciones distintas ----------
{
  const entities = [line("l1", 0, 0, 100, 0), line("l2", 50, -20, 50, 60)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1", "l2"] },
    { kind: "enter" },
    { kind: "point", point: { x: 50, y: 80 }, source: "typed" },
  ], contextFor(entities)).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.equal(result.commands.length, 2);
    for (const command of result.commands) {
      assert.equal(command.type, "insert");
      if (command.type === "insert") {
        assert.equal(command.entity.type, "dimension");
        if (command.entity.type === "dimension") assert.equal(command.entity.axis, "x");
      }
    }
  }
  checks += 2;
}

// --- QDIM: se niega cuando nada tiene extremos acotables -----------------------
{
  const text: CadEntity = { id: "t1", type: "text", x: 0, y: 0, text: "hola", layer: "0" };
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["t1"] },
    { kind: "enter" },
  ], contextFor([text])).result;
  assert.ok(result && result.kind === "message" && /tiene extremos acotables/.test(result.text));
  checks += 1;
}

// --- QDIM Escalonada: cada tramo se aleja UN ESCALÓN MÁS que el anterior -------
{
  const entities = [line("l1", 0, 0, 100, 0), line("l2", 100, 0, 200, 0), line("l3", 200, 0, 300, 0)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1", "l2", "l3"] },
    keyword("Escalonada"),
    { kind: "enter" },
    { kind: "point", point: { x: 150, y: 50 }, source: "typed" }, // primer clic: offset 50
  ], contextFor(entities)).result;
  const dims = insertedDimensions(result);
  assert.equal(dims.length, 3, "tres tramos consecutivos entre las cuatro posiciones (0,100,200,300)");
  const offsets = dims.map((d) => d.offset);
  assert.equal(offsets[0], 50, "el primer tramo sale donde se clicó");
  assert.ok(offsets[1]! > offsets[0]! && offsets[2]! > offsets[1]!, `cada tramo se aleja más: ${offsets.join(", ")}`);
  // El escalón es EXACTO: 2×180 (sin DIMSTYLE con nombre, el respaldo de fábrica).
  assert.equal(offsets[1]! - offsets[0]!, 360, "el escalón por defecto es 2× el tamaño de flecha de fábrica");
  assert.equal(offsets[2]! - offsets[1]!, 360, "el escalón es CONSTANTE tramo a tramo");
  checks += 4;
}

// --- QDIM Base: TODAS desde el primer punto, cada una un escalón más lejos ----
{
  const entities = [line("l1", 0, 0, 100, 0), line("l2", 100, 0, 200, 0), line("l3", 200, 0, 300, 0)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1", "l2", "l3"] },
    keyword("Base"),
    { kind: "enter" },
    { kind: "point", point: { x: 150, y: 50 }, source: "typed" },
  ], contextFor(entities)).result;
  const dims = insertedDimensions(result);
  assert.equal(dims.length, 3, "tres cotas, una por cada punto tras el datum");
  for (const dim of dims) assert.equal(dim.a.x, 0, "TODAS parten del primer punto (x=0), no del vecino");
  assert.deepEqual(dims.map((d) => d.b.x), [100, 200, 300], "cada una llega a un punto distinto");
  const offsets = dims.map((d) => d.offset!);
  assert.ok(offsets[0]! < offsets[1]! && offsets[1]! < offsets[2]!, `cada cota se separa más: ${offsets.join(", ")}`);
  checks += 4;
}

// --- QDIM Escalonada: el escalón es el DIMDLI del estilo vigente, no fijo -----
{
  const entities = [line("l1", 0, 0, 100, 0), line("l2", 100, 0, 200, 0), line("l3", 200, 0, 300, 0)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1", "l2", "l3"] },
    keyword("Escalonada"),
    { kind: "enter" },
    { kind: "point", point: { x: 150, y: 50 }, source: "typed" },
  ], contextFor(entities, { dimstyle: "NORMA", baselineSpacing: 1000 })).result;
  const dims = insertedDimensions(result);
  assert.equal(dims[1]!.offset! - dims[0]!.offset!, 1000, "el escalón viene de DIMDLI (baselineSpacing) del estilo vigente, no de una cifra fija");
  checks += 1;
}

// --- QDIM Ordenada: rotula el eje PERPENDICULAR al que domina la selección ----
{
  // Puntos que marchan en X (0,150,300): Ordenada rotula sus Y, no sus X.
  const entities = [line("l1", 0, 10, 0, 20), line("l2", 150, 40, 150, 50), line("l3", 300, 70, 300, 90)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1", "l2", "l3"] },
    keyword("Ordenada"),
    { kind: "enter" },
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
  ], contextFor(entities)).result;
  const dims = insertedDimensions(result);
  assert.equal(dims.length, 2, "una cota de coordenada por punto, salvo el datum");
  for (const dim of dims) assert.equal(dim.axis, "y", "rotula el eje PERPENDICULAR al dominante (X domina, se rotula Y)");
  // La medida CONSTRUIDA (no el campo crudo) es la diferencia de Y real.
  const measurements = dims.map((dim) => buildCadDimensionGeometry(dim)?.measurement);
  assert.ok(measurements.every((m) => m !== undefined), "las dos cotas construyen geometría");
  checks += 2 + dims.length;
}

// --- QDIM Radio y Diámetro: una cota por CÍRCULO/ARCO, el resto se ignora ------
{
  const entities = [circle("c1", 0, 0, 50), circle("c2", 500, 0, 80), line("l1", 0, -200, 500, -200)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["c1", "c2", "l1"] },
    keyword("Radio"),
    { kind: "enter" },
    { kind: "point", point: { x: 1000, y: 1000 }, source: "typed" },
  ], contextFor(entities)).result;
  const dims = insertedDimensions(result);
  assert.equal(dims.length, 2, "una cota por círculo — la línea designada se ignora, no revienta");
  assert.equal(dims.find((d) => d.references?.[0]?.entityId === "c1")?.radius, 50, "radio real de c1");
  assert.equal(dims.find((d) => d.references?.[0]?.entityId === "c2")?.radius, 80, "radio real de c2");
  for (const dim of dims) {
    const geometry = buildCadDimensionGeometry(dim);
    assert.ok(Math.abs((geometry?.measurement ?? 0) - dim.radius!) < 1e-6, `la geometría mide el radio real (dio ${geometry?.measurement})`);
  }
  checks += 3 + dims.length;

  const diamResult = run(qdimCommand, [
    { kind: "selection", entityIds: ["c1"] },
    keyword("Diametro"),
    { kind: "enter" },
    { kind: "point", point: { x: 1000, y: 1000 }, source: "typed" },
  ], contextFor(entities)).result;
  const [diamDim] = insertedDimensions(diamResult);
  const diamGeometry = buildCadDimensionGeometry(diamDim);
  assert.ok(Math.abs((diamGeometry?.measurement ?? 0) - 100) < 1e-6, `el diámetro mide 2×radio = 100 (dio ${diamGeometry?.measurement})`);
  checks += 1;
}

// --- QDIM Radio: se niega, con motivo, si nadie tiene radio --------------------
{
  const entities = [line("l1", 0, 0, 100, 0)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1"] },
    keyword("Radio"),
    { kind: "enter" },
  ], contextFor(entities)).result;
  assert.ok(result && result.kind === "message" && /círculo o arco/.test(result.text), `negativa honesta (dio: ${JSON.stringify(result)})`);
  checks += 1;
}

// --- QDIM: no se hizo nada sin designar ningún objeto --------------------------
{
  const result = run(qdimCommand, [{ kind: "enter" }], contextFor([])).result;
  assert.ok(result && result.kind === "message" && /no se hizo nada/.test(result.text));
  checks += 1;
}

// --- TEXTALIGN: proyecta el texto sobre la recta y le da su ángulo ------------
{
  const text: CadEntity = { id: "t1", type: "text", x: 5, y: 5, text: "NOTA", layer: "0" };
  const result = run(textAlignCommand, [
    { kind: "selection", entityIds: ["t1"] },
    { kind: "enter" },
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
    { kind: "point", point: { x: 10, y: 0 }, source: "typed" },
  ], contextFor([text])).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.equal(result.commands.length, 1);
    const [command] = result.commands;
    assert.equal(command.type, "replace");
    if (command.type === "replace") {
      assert.equal(command.entityId, "t1");
      assert.equal((command.entity as { x: number }).x, 5);
      assert.equal((command.entity as { y: number }).y, 0);
      assert.equal((command.entity as { rotation: number }).rotation, 0);
    }
  }
  checks += 4;
}

// --- TEXTALIGN: se niega cuando la selección no tiene ningún texto ------------
{
  const result = run(textAlignCommand, [
    { kind: "selection", entityIds: ["l1"] },
    { kind: "enter" },
  ], contextFor([line("l1", 0, 0, 10, 0)])).result;
  assert.ok(result && result.kind === "message" && /no tiene ningún texto/.test(result.text));
  checks += 1;
}

console.log(`engine/commands/annotate-quick.spec: ${checks} comprobaciones OK`);
