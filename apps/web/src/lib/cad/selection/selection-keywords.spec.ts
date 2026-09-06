/**
 * `cadDesignateStep` — las diez palabras clave de «Designe objetos» (T-21):
 * Todo, Previo, Último, Ventana, Captura, Valla, Vpolígono, Cpolígono, Borrar
 * y Añadir. Antes de T-21 el prompt compartido de `modify-basics.ts` sólo
 * aceptaba el ratón; aquí se prueba el motor puro, sin montar un comando
 * entero encima.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../cad-document";
import type { CadCommandContext, CadCommandInput } from "../engine/command-types";
import {
  CAD_DESIGNATE_IDLE,
  cadDesignateStep,
  type CadDesignatePickState,
} from "./selection-keywords";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// Un cuadrado en cada esquina de un tablero, para que ventana/captura/valla/
// polígono tengan que elegir de verdad y no coincidir todos por accidente.
const square = (id: string, x: number, y: number): CadEntity => ({
  id,
  type: "polyline",
  vertices: [
    { x, y, z: 0 },
    { x: x + 10, y, z: 0 },
    { x: x + 10, y: y + 10, z: 0 },
    { x, y: y + 10, z: 0 },
  ],
  closed: true,
  layer: "0",
});

const entities = new Map<string, CadEntity>(
  [square("sw", 0, 0), square("se", 100, 0), square("ne", 100, 100), square("nw", 0, 100)].map((entity) => [
    entity.id,
    entity,
  ]),
);

function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "n1",
    ...overrides,
  };
}

const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const enter: CadCommandInput = { kind: "enter" };

/** Corre una lista de entradas encadenadas sobre `cadDesignateStep`, acumulando estado. */
function run(inputs: readonly CadCommandInput[], startContext: CadCommandContext = context()) {
  let targets: readonly string[] = [];
  let pick: CadDesignatePickState = CAD_DESIGNATE_IDLE;
  let removing = false;
  for (const input of inputs) {
    const outcome = cadDesignateStep(targets, pick, removing, input, startContext, "Designe objetos");
    if (!outcome) throw new Error(`entrada no manejada: ${JSON.stringify(input)}`);
    targets = outcome.targets;
    pick = outcome.pick;
    removing = outcome.removing;
  }
  return { targets, pick, removing };
}

// --- Todo -------------------------------------------------------------------
{
  const { targets } = run([keyword("Todo")]);
  assert.deepEqual([...targets].sort(), ["ne", "nw", "se", "sw"]);
  checks += 1;
}

// --- Último: el último id de entityIds, no el primero -----------------------
{
  const { targets } = run([keyword("Último")]);
  assert.deepEqual(targets, ["nw"], "el último de entityIds, que aquí es 'nw'");
  checks += 1;
}

// --- Previo: sin sesión que lo recuerde, resuelve a nada, no a un error ------
{
  const { targets } = run([keyword("Previo")]);
  assert.deepEqual(targets, [], "sin `session.lastSelectionIds`, Previo no rompe: da vacío");
  checks += 1;
}
{
  const { targets } = run(
    [keyword("Previo")],
    context({ session: { lastSelectionIds: ["se", "ne"] } }),
  );
  assert.deepEqual([...targets].sort(), ["ne", "se"], "con sesión, Previo SÍ recuerda la última selección");
  checks += 1;
}

// --- Ventana: sólo lo que queda ENTERO dentro ---------------------------------
{
  const { targets } = run([keyword("Ventana"), point(-5, -5), point(15, 15)]);
  assert.deepEqual(targets, ["sw"], "la ventana sólo encierra el cuadrado suroeste");
  checks += 1;
}

// --- Captura: lo que toca, no sólo lo que queda entero ------------------------
{
  const { targets } = run([keyword("Captura"), point(5, 5), point(105, 5)]);
  assert.deepEqual(
    [...targets].sort(),
    ["se", "sw"],
    "una franja que sólo TOCA los dos cuadrados del sur los captura igual",
  );
  checks += 1;
}

// --- Valla: cruza una diagonal completa ---------------------------------------
{
  const { targets } = run([
    keyword("Valla"),
    point(-5, -5),
    point(115, 115),
    enter,
  ]);
  assert.deepEqual(
    [...targets].sort(),
    ["ne", "sw"],
    "la diagonal cruza los dos cuadrados que atraviesa, no los otros dos",
  );
  checks += 1;
}

// --- Vpolígono: sólo lo ENTERO dentro del polígono ----------------------------
{
  const { targets } = run([
    keyword("Vpolígono"),
    point(-5, -5),
    point(115, -5),
    point(115, 15),
    point(-5, 15),
    enter,
  ]);
  assert.deepEqual(
    [...targets].sort(),
    ["se", "sw"],
    "el polígono envuelve del todo a los dos cuadrados del sur",
  );
  checks += 1;
}

// --- Cpolígono: lo que el polígono toca, aunque no quede envuelto -------------
{
  const { targets } = run([
    keyword("Cpolígono"),
    point(5, -50),
    point(15, -50),
    point(15, 150),
    point(5, 150),
    enter,
  ]);
  assert.deepEqual(
    [...targets].sort(),
    ["nw", "sw"],
    "una franja vertical angosta CRUZA los dos cuadrados del oeste",
  );
  checks += 1;
}

// --- Borrar / Añadir: quitar y volver a sumar --------------------------------
{
  // Cada palabra clave se teclea explícitamente, como en el golden de la
  // ficha (BORRAR → V → dos puntos → Intro): «Borrar» cambia el MODO, no
  // sustituye a decir CÓMO se designa la siguiente tanda.
  const { targets } = run([
    keyword("Todo"),
    keyword("Borrar"),
    keyword("Ventana"),
    point(-5, -5),
    point(15, 15),
    keyword("Añadir"),
    keyword("Ventana"),
    point(95, -5),
    point(115, 15),
  ]);
  assert.deepEqual(
    [...targets].sort(),
    ["ne", "nw", "se"],
    "Todo suma los cuatro, Borrar+ventana quita 'sw', Añadir+ventana no lo vuelve a meter dos veces",
  );
  checks += 1;
}
{
  // Borrar también respeta un pick directo del ratón, no sólo ventana/valla.
  const { targets } = run([
    keyword("Todo"),
    keyword("Borrar"),
    { kind: "entityPick", entityId: "ne", point: { x: 105, y: 105 } },
  ]);
  assert.deepEqual([...targets].sort(), ["nw", "se", "sw"], "Borrar quita también con un pick directo");
  checks += 1;
}

// --- Lo que NO es una de las diez palabras clave: `null`, decide el llamador -
{
  const outcome = cadDesignateStep([], CAD_DESIGNATE_IDLE, false, keyword("Objeto"), context(), "Designe objetos");
  ok(outcome === null, "una palabra clave ajena (p. ej. de ZOOM) no es de este módulo");
}

// --- Un `selection`/`entityPick` crudo, sin Borrar activo, tampoco es de aquí:
//     el comando llamador decide (hoy: termina de inmediato, sin tocar T-21) --
{
  const outcome = cadDesignateStep(
    [],
    CAD_DESIGNATE_IDLE,
    false,
    { kind: "selection", entityIds: ["sw"] },
    context(),
    "Designe objetos",
  );
  ok(outcome === null, "sin Borrar activo, una selección cruda la resuelve el llamador, no este módulo");
}

console.log(`selection-keywords: ${checks} aserciones — las diez palabras clave de «Designe objetos» resuelven`);
