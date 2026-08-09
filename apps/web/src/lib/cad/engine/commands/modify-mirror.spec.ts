/**
 * MIRROR.
 *
 * Tres afirmaciones, y las tres se pueden equivocar produciendo un dibujo que
 * parece bien:
 *
 *   1. Conservando el original se copia y LUEGO se refleja el duplicado. Al
 *      revés quedarían los dos ejemplares reflejados y ninguno en su sitio.
 *   2. El eje va del primer punto al segundo, y dos puntos iguales no definen
 *      ninguna simetría: se rechaza en vez de emitir una matriz degenerada que
 *      colapsaría la geometría sobre una recta.
 *   3. Borrando el original NO se duplica: se refleja en el sitio.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MIRROR_COMMANDS } from "./modify-mirror";

const [mirror] = CAD_MIRROR_COMMANDS;

function makeContext(selection: readonly string[]): CadCommandContext {
  let ids = 0;
  return {
    entityIds: ["muro", "puerta"],
    entity: () => undefined,
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[], selection: readonly string[] = ["muro"]) {
  const context = makeContext(selection);
  let step = mirror.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = mirror.step(step.state, input, context);
  }
  return step.result;
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const enter: CadCommandInput = { kind: "enter" };

// --- conservando el original: copiar y reflejar el DUPLICADO ------------------
{
  const result = run([point(0, 0), point(0, 1000), enter]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 2, "una copia y una reflexión");
  const [copy, transform] = result.commands;
  assert.ok(copy.type === "copy" && transform.type === "transform");
  assert.equal(copy.entityId, "muro", "se copia el original");
  assert.equal(
    transform.entityId,
    copy.newEntityId,
    "y se refleja el DUPLICADO: al revés quedarían los dos reflejados",
  );
  assert.notEqual(transform.entityId, "muro");
  // El eje es el vector del primer punto al segundo, con su origen.
  const spec = transform.transform.mirror;
  assert.ok(spec, "la transformada lleva un espejo, no un giro");
  assert.deepEqual(spec.point, { x: 0, y: 0 });
  assert.deepEqual(spec.direction, { x: 0, y: 1000 }, "dirección sin normalizar, como acepta la afín");
  assert.equal(transform.transform.rotationDeg, undefined, "y NO se disfraza de giro");
}

// --- borrando el original: se refleja en el sitio ------------------------------
{
  const result = run([point(0, 0), point(0, 1000), { kind: "keyword", keyword: "Sí" }]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 1, "sin copia");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  assert.equal(command.entityId, "muro", "se refleja el original mismo");
}

// --- el defecto conserva ------------------------------------------------------
{
  const byKeyword = run([point(0, 0), point(0, 1000), { kind: "keyword", keyword: "No" }]);
  assert.ok(byKeyword && byKeyword.kind === "document");
  assert.equal(byKeyword.commands.length, 2, "«No» conserva, igual que Enter");
}

// --- varios objetos, un solo lote ---------------------------------------------
{
  const result = run([point(0, 0), point(0, 1000), enter], ["muro", "puerta"]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 4, "dos copias y dos reflexiones, en UN paso de deshacer");
  const news = result.commands.filter((command) => command.type === "copy");
  assert.equal(new Set(news.map((c) => (c.type === "copy" ? c.newEntityId : ""))).size, 2,
    "cada duplicado con su propio identificador");
}

// --- un eje degenerado se rechaza ---------------------------------------------
{
  const result = run([point(500, 500), point(500, 500)]);
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.includes("mismo"),
    "dos puntos iguales no definen una simetría, y se dice",
  );
}

// --- sin objetos designados ----------------------------------------------------
{
  const result = run([enter], []);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("designado"));
}

console.log("MIRROR verificado");
