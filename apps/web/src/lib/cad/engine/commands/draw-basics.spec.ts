/**
 * LINE enseña lo que ya está fijado, no sólo la banda elástica.
 *
 * LINE no escribe en el documento hasta Intro: el lote entero es un solo
 * Ctrl+Z. Mientras tanto, lo ÚNICO que el usuario ve de su dibujo es la
 * previsualización del paso. Cuando esa previsualización era sólo la banda
 * elástica (último punto → cursor), tres clics dejaban en el lienzo, como
 * mucho, un segmento colgando del último punto; y sin cursor —un clic sin
 * mover antes, un toque con el dedo— nada en absoluto. El dueño lo describió
 * así: «el clic no se toma». El punto sí se tomaba; lo que faltaba era verlo.
 *
 * Lo que se fija aquí, contra el descriptor puro (sin anfitrión ni puntero):
 *
 *   1. Con dos o más puntos, la preview trae los tramos fijados ENTEROS, haya
 *      cursor o no.
 *   2. Con cursor, la banda va en `paths[0]` y arranca en el último punto.
 *   3. `desHacer` retira el tramo también de la vista, y deshacer el primer
 *      punto deja la preview VACÍA (no ausente: ausente deja la banda vieja).
 *   4. Nada de esto cambia el lote: Intro sigue emitiendo un insert por tramo.
 */
import { strict as assert } from "node:assert";
import type { CadPoint2 } from "../../cad-document";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandStep,
  CadPreviewPath,
} from "../command-types";
import { CAD_DRAW_BASIC_COMMANDS } from "./draw-basics";

const line = CAD_DRAW_BASIC_COMMANDS.find((command) => command.name === "LINE");
assert.ok(line, "LINE está en draw-basics");

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function makeContext(cursor: { current: CadPoint2 | undefined }): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `l${++ids}`,
    // Getter: el cursor lo mueve el test entre pasos, como el ratón.
    get cursor() {
      return cursor.current;
    },
  } as CadCommandContext;
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "pointer",
});
const UNDO: CadCommandInput = { kind: "keyword", keyword: "desHacer" };
const ENTER: CadCommandInput = { kind: "enter" };

/** Ejecuta LINE con las entradas dadas y devuelve el último paso. */
function run(
  inputs: readonly CadCommandInput[],
  cursor: { current: CadPoint2 | undefined } = { current: undefined },
): CadCommandStep<unknown> {
  const context = makeContext(cursor);
  let step = line!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = line!.step(step.state, input, context);
  }
  return step;
}

const key = (path: CadPreviewPath) =>
  path.points.map((p) => `${p.x},${p.y}`).join(" → ");
const keys = (step: CadCommandStep<unknown>) => (step.preview ?? []).map(key);

// ---------------------------------------------------------------------------
// 1. Sin cursor, lo fijado SE VE. Es el caso del clic sin mover y del dedo.
// ---------------------------------------------------------------------------
{
  const three = run([point(0, 0), point(1_000, 0), point(1_000, 1_000)]);
  ok(
    keys(three).includes("0,0 → 1000,0 → 1000,1000"),
    `tres clics sin cursor enseñan los DOS tramos fijados (preview: ${JSON.stringify(keys(three))})`,
  );
  assert.equal(three.preview?.length, 1, "sin cursor no hay banda: sólo lo fijado");

  const two = run([point(0, 0), point(1_000, 0)]);
  assert.deepEqual(keys(two), ["0,0 → 1000,0"], "con dos puntos, el primer tramo ya se ve");

  const one = run([point(0, 0)]);
  assert.deepEqual(one.preview, [], "con un punto y sin cursor no hay nada que dibujar (ni un trazo degenerado)");
  ok(true, "sin cursor, la preview de LINE es exactamente lo fijado");
}

// ---------------------------------------------------------------------------
// 2. Con cursor: banda primero, desde el ÚLTIMO punto, y lo fijado detrás.
// ---------------------------------------------------------------------------
{
  const cursor = { current: { x: 1_500, y: 1_000 } as CadPoint2 | undefined };
  const step = run([point(0, 0), point(1_000, 0), point(1_000, 1_000)], cursor);
  assert.deepEqual(
    keys(step),
    ["1000,1000 → 1500,1000", "0,0 → 1000,0 → 1000,1000"],
    "paths[0] es la banda (último punto → cursor) y paths[1] los tramos fijados",
  );
  // La banda con un solo punto fijado sigue como estaba.
  const first = run([point(0, 0)], cursor);
  assert.deepEqual(keys(first), ["0,0 → 1500,1000"], "con un punto, sólo la banda");
  ok(true, "con cursor, banda desde el último punto + tramos fijados");
}

// ---------------------------------------------------------------------------
// 3. desHacer retira el tramo también de la VISTA; y deshacerlo todo la vacía.
// ---------------------------------------------------------------------------
{
  const undone = run([point(0, 0), point(1_000, 0), point(1_000, 1_000), UNDO]);
  assert.deepEqual(keys(undone), ["0,0 → 1000,0"], "deshacer el tercer punto quita su tramo de la preview");

  const cursor = { current: { x: 400, y: 300 } as CadPoint2 | undefined };
  const toZero = run([point(0, 0), point(1_000, 0), UNDO, UNDO], cursor);
  ok(
    Array.isArray(toZero.preview) && toZero.preview.length === 0,
    "deshacer el primer punto trae preview VACÍA, no ausente: ausente dejaría la banda del punto deshecho en pantalla",
  );
  ok(Array.isArray(line!.begin(makeContext({ current: undefined })).preview), "y el paso inicial también declara su preview");
}

// ---------------------------------------------------------------------------
// 4. Un clic repetido en el mismo sitio no cambia lo que se ve.
// ---------------------------------------------------------------------------
{
  const repeated = run([point(0, 0), point(1_000, 0), point(1_000, 0)]);
  assert.deepEqual(keys(repeated), ["0,0 → 1000,0"], "el vértice de longitud cero se ignora también en la vista");
  ok(true, "un clic repetido no ensucia la preview");
}

// ---------------------------------------------------------------------------
// 5. La preview no toca el lote: Intro emite un insert por tramo, como antes.
// ---------------------------------------------------------------------------
{
  const done = run([point(0, 0), point(1_000, 0), point(1_000, 1_000), ENTER]);
  assert.ok(done.result && done.result.kind === "document", "Intro escribe el lote");
  if (done.result?.kind !== "document") throw new Error("tipo");
  const inserts = done.result.commands.filter((command) => command.type === "insert");
  assert.equal(inserts.length, 2, "dos tramos, dos inserts");
  ok(true, "el lote de LINE es el mismo: la preview es sólo vista");
}

console.log(
  `draw-basics: ${checks} comprobaciones — LINE enseña los tramos fijados además de la banda (con y sin cursor), desHacer los retira de la vista y la preview no altera el lote.`,
);
