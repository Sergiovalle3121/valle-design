/**
 * El corpus, exigido de verdad: por la puerta que usa el editor.
 *
 * `corpus.spec.ts` ya comprueba que las rutinas producen la geometría correcta.
 * Lo que faltaba —y es lo que decide si el subsistema sirve— es comprobarlas
 * por la ejecución REANUDABLE: contestando a sus preguntas como contestaría un
 * usuario, y mirando que el lote salga entero para UN paso de deshacer.
 *
 * Cuatro trabajos de verdad, uno por cada cosa que un estudio hace todos los
 * días:
 *
 *   · CAJETINB   — cajetín parametrizado insertado como BLOQUE.
 *   · TABLA      — recorrer la selección con `ssget` y volcar una tabla.
 *   · REVISACOTAS— comprobar que ninguna cota está desasociada.
 *   · RETICULA   — encadenar comandos NATIVOS con `command`.
 *
 * Y las pruebas ADVERSARIALES que deciden si se puede dejar correr el código de
 * un tercero: recursión infinita, lista de diez millones, `entmake` con basura y
 * una rutina que redefine una función del sistema.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import { InteractiveLispRun, type LispTurn } from "./interactive";
import { printLisp } from "./printer";
import { int, list, real, str, type LispResponse, type LispValue } from "./values";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const corpusDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "corpus");
const load = (name: string): string => fs.readFileSync(path.join(corpusDir, name), "utf8");

function seed(entities: CadEntity[] = [], blocks: CadDocument["blocks"] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CAJETIN", name: "CAJETIN", color: "#ffffff", visible: true, locked: false },
      { id: "EJES", name: "EJES", color: "#ffff00", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks,
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

let serial = 0;

/**
 * Conduce una rutina contestando en orden. Devuelve la ejecución entera para
 * poder afirmar sobre el documento, el lote y la salida — no sólo sobre «no
 * falló», que es lo que una propiedad de ida y vuelta cumple de forma vacía.
 */
function drive(
  sources: readonly string[],
  invoke: string,
  answers: readonly LispResponse[],
  document = seed(),
): { run: InteractiveLispRun; turn: LispTurn; asked: number } {
  serial = 0;
  const run = new InteractiveLispRun({
    document,
    sources,
    activeLayer: "0",
    newEntityId: () => `e${(serial += 1)}`,
  });
  let turn = run.start(invoke);
  let asked = 0;
  while (turn.kind === "ask") {
    const answer = answers[asked] ?? { kind: "cancel" };
    asked += 1;
    turn = run.answer(answer);
  }
  return { run, turn, asked };
}

const point = (x: number, y: number): LispResponse => ({
  kind: "value",
  value: list([real(x), real(y), real(0)]),
});
const text = (value: string): LispResponse => ({ kind: "value", value: str(value) });
const whole = (value: number): LispResponse => ({ kind: "value", value: int(value) });

// ===========================================================================
// 1. El cajetín, insertado como BLOQUE
// ===========================================================================
{
  const source = load("cajetin-bloque.lsp");
  const document = seed(
    [],
    [
      {
        id: "CAJETIN-ISO",
        name: "CAJETIN-ISO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "b1",
            type: "line",
            layer: "0",
            start: { x: 0, y: 0, z: 0 },
            end: { x: 180, y: 0, z: 0 },
          },
        ],
      },
    ],
  );

  const { run, turn, asked } = drive([source], "(c:CAJETINB)", [text("A3"), point(30, 20)], document);
  eq(turn.kind, "done", "la rutina termina");
  eq(asked, 2, "preguntó exactamente dos veces: formato y punto");

  const entities = run.document.entities;
  eq(entities.length, 4, "una inserción y sus tres campos");

  const insert = entities.find((entity) => entity.type === "insert");
  ok(insert, "insertó un bloque");
  if (insert?.type === "insert") {
    // ANCLAS ABSOLUTAS. Un bloque insertado «en algún sitio» no vale de nada.
    eq(insert.block, "CAJETIN-ISO", "el bloque que la rutina nombró");
    eq(insert.insertion, { x: 30, y: 20, z: 0 }, "en el punto contestado");
    eq(insert.scale.x, 1, "con la escala del A3 de su tabla de formatos");
    eq(insert.rotation, 0, "sin girar");
    eq(insert.layer, "CAJETIN", "en la capa del cajetín, no en la activa");
  }

  const campos = entities
    .filter((entity): entity is Extract<CadEntity, { type: "mtext" }> => entity.type === "mtext")
    .map((entity) => entity.text)
    .sort();
  eq(
    campos,
    ["AUTOR: SIN AUTOR", "FORMATO: A3", "PROYECTO: SIN NOMBRE"],
    "y escribió los tres campos del cajetín, con sus etiquetas",
  );

  // El interlineado sale de la escala del formato, no de un número mágico.
  const alturas = entities
    .filter((entity): entity is Extract<CadEntity, { type: "mtext" }> => entity.type === "mtext")
    .map((entity) => entity.insertion.y)
    .sort((a, b) => a - b);
  eq(alturas, [20, 23.5, 27], "apilados con el interlineado escalado del A3 (3,5 mm)");

  eq(run.commands.length, 4, "cuatro escrituras…");
  ok(
    run.commands.every((command) => command.type === "insert"),
    "…todas de alta, en UN lote para UN paso de deshacer",
  );

  // Cancelar el punto no debe insertar nada.
  const cancelled = drive([source], "(c:CAJETINB)", [text("A3"), { kind: "cancel" }], seed());
  eq(cancelled.run.document.entities.length, 0, "cancelar el punto no inserta nada");
  ok(cancelled.run.output.includes("cancelado"), "y la rutina lo dice");

  // Un formato que no está en la tabla se rechaza en la parametrizada.
  const bad = drive([source], `(vd:cajetin-bloque "X" "A9" '(0.0 0.0) "p" "a" "0")`, []);
  ok(bad.turn.kind === "failed", "un formato desconocido no inventa una escala");
  eq(bad.run.document.entities.length, 0, "y no deja nada escrito");
}

// ===========================================================================
// 2. `command` encadenado sobre comandos NATIVOS
// ===========================================================================
{
  const source = load("encadena-command.lsp");
  const { run, turn, asked } = drive([source], "(c:RETICULA)", [
    point(0, 0),
    point(1000, 600),
    whole(3),
  ]);
  eq(turn.kind, "done", "la retícula termina");
  eq(asked, 3, "dos esquinas y el número de marcas");

  const lines = run.document.entities.filter((entity) => entity.type === "line");
  const circles = run.document.entities.filter((entity) => entity.type === "circle");
  eq(lines.length, 4, "cuatro tramos del marco, cada uno por el LINE NATIVO");
  eq(circles.length, 3, "y tres marcas por el CIRCLE nativo");

  // El marco cierra: el último tramo vuelve al origen.
  const last = lines[3];
  if (last.type === "line") eq(last.end, { x: 0, y: 0, z: 0 }, "el marco cierra en el origen");

  // El reparto se calcula con `polar` y no acumulando: la última marca cae en
  // 750 exactos sobre una base de 1000 con tres marcas.
  const xs = circles
    .map((entity) => (entity.type === "circle" ? entity.center.x : NaN))
    .sort((a, b) => a - b);
  eq(xs, [250, 500, 750], "las marcas están repartidas sin arrastre de coma flotante");
  eq(
    circles.every((entity) => entity.type === "circle" && entity.radius === 50),
    true,
    "con el radio que pidió la rutina",
  );

  eq(
    run.commands.length,
    7,
    "siete escrituras en total, en UN lote: siete comandos nativos encadenados son UN paso de deshacer",
  );

  // Un `command` al que le faltan argumentos NO deja el comando activo: se
  // cancela diciendo qué pedía. Es el límite declarado del subsistema.
  const short = drive([source], `(command "LINE" '(0.0 0.0))`, []);
  ok(short.turn.kind === "failed", "un command incompleto falla…");
  ok(
    short.turn.kind === "failed" && /se quedó sin argumentos/.test(short.turn.failure.message),
    "…diciendo exactamente eso, en vez de tragárselo y no crear nada",
  );
}

// ===========================================================================
// 3. `ssget` + volcado de tabla, conducido de verdad
// ===========================================================================
{
  const source = load("tabla-medicion.lsp");
  const muros: CadEntity[] = [
    { id: "m1", type: "line", layer: "MUROS", start: { x: 0, y: 0, z: 0 }, end: { x: 300, y: 0, z: 0 } },
    { id: "m2", type: "line", layer: "MUROS", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 400, z: 0 } },
    { id: "e1", type: "line", layer: "EJES", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
  ];
  const document = seed(muros);
  const names = list(muros.map((entity) => ({ t: "ename", id: entity.id }) as LispValue));

  const { run, turn } = drive([source], "(c:medir)", [{ kind: "value", value: names }], document);
  eq(turn.kind, "done", "la medición termina");
  const output = run.output;
  ok(/MUROS/.test(output), "la tabla nombra la capa MUROS…");
  ok(/700/.test(output), "…con los 300 + 400 mm medidos, no un número aproximado");
  ok(/EJES/.test(output) && /100/.test(output), "y la capa EJES con sus 100 mm");
  eq(run.commands.length, 0, "medir NO escribe en el dibujo: es una consulta");
}

// ===========================================================================
// 4. Comprobación de norma: cotas desasociadas
// ===========================================================================
{
  const source = load("comprueba-cotas.lsp");
  const cota = (id: string, associative: boolean, broken: boolean): CadEntity => ({
    id,
    type: "dimension",
    dimensionKind: "linear",
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    layer: "0",
    associative,
    associationStatus: broken ? "broken" : associative ? "associated" : "detached",
  });
  const cotas: CadEntity[] = [
    cota("d1", true, false),
    cota("d2", false, false),
    cota("d3", true, true),
    { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 } },
  ];

  const { run, turn } = drive([source], "(c:cotas)", [], seed(cotas));
  ok(turn.kind === "done", "la comprobación termina");
  ok(
    /Cotas revisadas: 3/.test(run.output),
    "revisó las tres cotas del dibujo y no la línea, que no es una cota",
  );
  ok(
    /Con problema: 2/.test(run.output),
    "y encontró las DOS con problema: la desasociada y la rota. Es el defecto más caro de un " +
      "plano de obra porque no se ve en pantalla",
  );
  ok(/SIN ASOCIAR/.test(run.output), "nombrando la que nunca se asoció…");
  ok(/ROTA/.test(run.output), "…y la que perdió la asociación, que son cosas distintas");
  eq(run.commands.length, 0, "comprobar no toca el dibujo");
}

// ===========================================================================
// 5. ADVERSARIAL — el sandbox aguanta o dice por qué no
// ===========================================================================
{
  // Recursión infinita.
  const recursive = drive([`(defun f () (f))`], "(f)", []);
  ok(recursive.turn.kind === "failed", "la recursión infinita se corta");
  ok(
    recursive.turn.kind === "failed" &&
      recursive.turn.failure.kind === "abort" &&
      recursive.turn.failure.reason === "depth",
    "por profundidad, con la razón dicha",
  );

  // Diez millones de elementos: se corta ANTES de que la lista exista.
  const started = Date.now();
  const fat = drive([], "(repeat 10000000 (setq l (cons 1 l)))", []);
  ok(fat.turn.kind === "failed", "la lista de diez millones no se construye");
  ok(
    fat.turn.kind === "failed" && fat.turn.failure.kind === "abort",
    "y el corte es del sandbox, no un error del programa",
  );
  ok(
    Date.now() - started < 30_000,
    "el corte llega en un tiempo razonable: un límite que tarda un minuto no protege nada",
  );

  // Un `while` que no asigna nada tampoco gira para siempre.
  const spin = drive([], "(while T (setq x 1))", []);
  ok(spin.turn.kind === "failed", "un bucle infinito que no reserva memoria también se corta");

  // `entmake` con datos inválidos: se niega nombrando el problema.
  for (const [invoke, why] of [
    [`(entmake (list (cons 0 "LINE") (cons 10 "no soy un punto")))`, "un punto que es una cadena"],
    [`(entmake (list (cons 8 "0")))`, "una lista sin código 0"],
    [`(entmake (list (cons 0 "NOEXISTE") (cons 8 "0")))`, "un tipo que el traductor no conoce"],
    [`(entmake 42)`, "algo que ni siquiera es una lista"],
  ] as const) {
    const bad = drive([], invoke, []);
    ok(bad.turn.kind === "failed", `entmake se niega con ${why}`);
    eq(bad.run.document.entities.length, 0, `y no deja media entidad con ${why}`);
    eq(bad.run.commands.length, 0, `ni una orden en el lote con ${why}`);
  }

  // Redefinir una función del sistema afecta a la rutina y a nadie más.
  const rogue = drive([], `(progn (defun car (x) 99) (car '(1 2)))`, []);
  eq(
    rogue.turn.kind === "done" ? printLisp(rogue.turn.value) : "",
    "99",
    "una rutina puede romper `car`, como en AutoLISP…",
  );
  const clean = drive([], `(car '(1 2))`, []);
  eq(
    clean.turn.kind === "done" ? printLisp(clean.turn.value) : "",
    "1",
    "…y la ejecución siguiente arranca con la tabla del sistema intacta",
  );

  // Redefinir una FORMA ESPECIAL no se puede: el flujo de control no se toca.
  const control = drive([], `(progn (setq if 5) (if T 1 2))`, []);
  eq(
    control.turn.kind === "done" ? printLisp(control.turn.value) : "",
    "1",
    "ligar `if` no cambia la condicional: las formas especiales están reservadas",
  );

  // Y `vl-catch-all-apply` NO puede tragarse un corte de presupuesto.
  const swallow = drive(
    [`(defun bucle () (bucle))`],
    `(vl-catch-all-apply 'bucle nil)`,
    [],
  );
  ok(
    swallow.turn.kind === "failed" && swallow.turn.failure.kind === "abort",
    "el corte del sandbox atraviesa vl-catch-all-apply: un límite que el código medido puede " +
      "ignorar no es un límite",
  );
}

console.log(
  `corpus-enchufado: ${checks} aserciones verdes. Cuatro trabajos reales conducidos como los ` +
    `conduciría un usuario —cajetín insertado como BLOQUE con anclas absolutas, ssget + tabla, ` +
    `revisión de cotas desasociadas y cuatro comandos NATIVOS encadenados con command—, cada uno ` +
    `en UN solo lote. Adversariales: recursión infinita, diez millones de celdas, bucle sin ` +
    `memoria, cuatro entmake inválidos, redefinición de car, forma especial reservada y un ` +
    `vl-catch-all-apply que no se traga el corte. LÍMITES: una rutina inserta bloques pero no ` +
    `puede DEFINIRLOS (el vocabulario canónico no tiene esa orden), y command no deja el comando ` +
    `activo esperando al usuario.`,
);
