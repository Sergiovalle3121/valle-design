/**
 * La ejecución reanudable: la pieza que convierte el intérprete en algo que se
 * puede enchufar a una interfaz.
 *
 * Lo que se prueba aquí es exactamente lo que la línea de comandos necesita y
 * `LispSession.drive` no puede dar:
 *
 *  - que una rutina que llama a `getpoint` PARE y devuelva la pregunta;
 *  - que al contestarla siga por donde iba, con el punto en la mano;
 *  - que lo que escribió por el camino NO pare nada;
 *  - que el lote de escrituras salga entero y de una vez, para un solo paso de
 *    deshacer;
 *  - que un corte de presupuesto no pase por `*error*` y un error corriente sí;
 *  - y que `load` alcance la biblioteca del anfitrión y sólo la biblioteca.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import { LIBRARY_READER, normalizeLispFileName } from "./builtins/loader";
import { InteractiveLispRun, isLispAsk } from "./interactive";
import { printLisp } from "./printer";
import { list, real, str, type LispValue } from "./values";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

function seed(entities: CadEntity[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

let serial = 0;
const ids = () => `e${(serial += 1)}`;

function run(invoke: string, options: { sources?: string[]; library?: Record<string, string> } = {}) {
  serial = 0;
  const library = options.library ?? {};
  return new InteractiveLispRun({
    document: seed(),
    ...(options.sources ? { sources: options.sources } : {}),
    newEntityId: ids,
    state: [[LIBRARY_READER, (name: string) => library[normalizeLispFileName(name)]]],
  });
}

// --- una expresión pura termina en el primer turno --------------------------------
{
  const session = run("(+ 1 2)");
  const turn = session.start("(+ 1 2)");
  eq(turn.kind, "done", "una expresión sin interacción termina de una");
  eq(turn.kind === "done" ? printLisp(turn.value) : "", "3", "y devuelve su valor");
  eq(session.commands.length, 0, "sin tocar el dibujo");
}

// --- la rutina PARA en getpoint y sigue con la respuesta --------------------------
{
  const source = `
    (defun c:DOSPUNTOS ( / a b)
      (setq a (getpoint "Primer punto"))
      (setq b (getpoint "Segundo punto"))
      (entmake (list (cons 0 "LINE") (cons 8 "0") (cons 10 a) (cons 11 b)))
      (princ "hecho"))
  `;
  const session = run("(c:DOSPUNTOS)", { sources: [source] });
  const first = session.start("(c:DOSPUNTOS)");
  ok(first.kind === "ask", "la rutina se suspende esperando el primer punto");
  ok(first.kind === "ask" && isLispAsk(first.ask), "y lo que devuelve es una pregunta");
  eq(
    first.kind === "ask" ? first.ask.kind : "",
    "prompt-point",
    "un getpoint pide un punto, con su mensaje",
  );
  eq(
    first.kind === "ask" && first.ask.kind === "prompt-point" ? first.ask.message : "",
    "Primer punto",
    "el mensaje es el que escribió el autor de la rutina",
  );

  const second = session.answer({ kind: "value", value: list([real(0), real(0), real(0)]) });
  eq(second.kind, "ask", "contestada la primera, para en la segunda");

  const done = session.answer({ kind: "value", value: list([real(100), real(50), real(0)]) });
  eq(done.kind, "done", "con las dos respuestas, termina");

  // ANCLA ABSOLUTA: no basta con que «no falle». La línea tiene que estar donde
  // se dijo, en la capa que se dijo, y ser exactamente una.
  const entities = session.document.entities;
  eq(entities.length, 1, "dibujó exactamente una entidad");
  const line = entities[0];
  ok(line.type === "line", "y es una línea");
  if (line.type === "line") {
    eq(line.start, { x: 0, y: 0, z: 0 }, "que empieza en el primer punto contestado");
    eq(line.end, { x: 100, y: 50, z: 0 }, "y acaba en el segundo");
    eq(line.layer, "0", "en la capa activa");
  }
  eq(session.commands.length, 1, "el lote lleva UNA orden: un solo paso de deshacer");
  ok(session.output.includes("hecho"), "y lo que imprimió quedó recogido");
}

// --- escribir NO suspende ---------------------------------------------------------
{
  const session = run("(progn (princ \"uno\") (princ \"dos\") 7)");
  const turn = session.start("(progn (princ \"uno\") (princ \"dos\") 7)");
  eq(turn.kind, "done", "dos princ seguidos no paran la rutina");
  eq(session.output, "unodos", "y su salida se acumula en orden");
}

// --- cancelar una pregunta devuelve nil, como en AutoLISP -------------------------
{
  const session = run("(if (getpoint) 1 2)");
  const asked = session.start("(if (getpoint) 1 2)");
  eq(asked.kind, "ask", "pregunta");
  const turn = session.answer({ kind: "cancel" });
  eq(turn.kind === "done" ? printLisp(turn.value) : "", "2", "un Esc vale nil y la rutina lo ve");
}

// --- un lote de VARIAS escrituras sigue siendo UN lote ----------------------------
{
  const source = `
    (defun c:TRES ()
      (repeat 3
        (entmake (list (cons 0 "CIRCLE") (cons 8 "0") (list 10 0.0 0.0 0.0) (cons 40 5.0)))))
  `;
  const session = run("(c:TRES)", { sources: [source] });
  const turn = session.start("(c:TRES)");
  eq(turn.kind, "done", "la rutina termina");
  eq(session.commands.length, 3, "tres entmake son tres órdenes…");
  eq(session.document.entities.length, 3, "…y tres entidades");
  ok(
    session.commands.every((command) => command.type === "insert"),
    "todas de alta (insert), listas para UN solo commitNativeCommands",
  );
}

// --- el presupuesto corta y NO pasa por *error* -----------------------------------
{
  const source = `
    (defun *error* (msg) (princ "MANEJADOR"))
    (defun bucle () (bucle))
  `;
  const session = run("(bucle)", { sources: [source] });
  const turn = session.start("(bucle)");
  eq(turn.kind, "failed", "la recursión infinita se corta");
  ok(
    turn.kind === "failed" && turn.failure.kind === "abort" && turn.failure.reason === "depth",
    "y el corte se reporta como aborto por profundidad, con su razón",
  );
  ok(
    !session.output.includes("MANEJADOR"),
    "el manejador del usuario NO corre tras un corte de presupuesto: un límite que deja " +
      "ejecutar código después no es un límite",
  );
}

// --- un error corriente SÍ pasa por *error* ---------------------------------------
{
  const source = `(defun *error* (msg) (princ (strcat "capturado:" msg)))`;
  const session = run("(car 5)", { sources: [source] });
  const turn = session.start("(car 5)");
  eq(turn.kind, "failed", "un error de tipo falla");
  ok(turn.kind === "failed" && turn.failure.kind === "error", "como error del programa");
  ok(session.output.includes("capturado:"), "y el manejador del usuario sí corrió");
}

// --- las globales se pueden sembrar y recoger -------------------------------------
{
  const first = run("(setq ancho 300)");
  first.start("(setq ancho 300)");
  const carried = first.globals();
  ok(carried.has("ANCHO"), "lo que la rutina ligó queda disponible para arrastrarlo");

  const second = new InteractiveLispRun({
    document: seed(),
    newEntityId: ids,
    seedGlobals: carried,
  });
  const turn = second.start("(* ancho 2)");
  eq(turn.kind === "done" ? printLisp(turn.value) : "", "600", "y sembrado, la siguiente lo ve");
}

// --- load lee de la biblioteca del anfitrión y de ningún otro sitio ---------------
{
  const library = {
    "utiles.lsp": `(defun vd:doble (x) (* 2 x)) (princ "utiles")`,
  };
  const session = run(`(progn (load "utiles") (vd:doble 21))`, { library });
  const turn = session.start(`(progn (load "utiles") (vd:doble 21))`);
  eq(turn.kind === "done" ? printLisp(turn.value) : "", "42", "load trae las funciones del fichero");
  ok(session.output.includes("utiles"), "y ejecuta su cuerpo de nivel superior");

  const missing = run(`(load "no-existe")`, { library });
  eq(missing.start(`(load "no-existe")`).kind, "failed", "un fichero que no está es un error…");
  const fallback = run(`(load "no-existe" "sin fichero")`, { library });
  const turn2 = fallback.start(`(load "no-existe" "sin fichero")`);
  eq(
    turn2.kind === "done" ? printLisp(turn2.value) : "",
    '"sin fichero"',
    "…salvo que la rutina diera un valor de respaldo, como en el original",
  );

  const cyclic = run(`(load "a")`, { library: { "a.lsp": `(load "b")`, "b.lsp": `(load "a")` } });
  const turn3 = cyclic.start(`(load "a")`);
  ok(
    turn3.kind === "failed" && /ciclo de carga/.test(turn3.failure.message),
    "un ciclo se nombra entero en vez de agotar el presupuesto en silencio",
  );

  const noLibrary = new InteractiveLispRun({ document: seed(), newEntityId: ids });
  const turn4 = noLibrary.start(`(load "utiles")`);
  ok(
    turn4.kind === "failed" && /biblioteca montada/.test(turn4.failure.message),
    "sin biblioteca montada se dice eso, y no «el fichero no existe»",
  );
}

// --- cancelar desde fuera envenena la ejecución -----------------------------------
{
  const session = run("(getpoint)");
  session.start("(getpoint)");
  const cancelled = session.cancel();
  ok(
    cancelled.kind === "failed" && cancelled.failure.kind === "abort",
    "el corte externo es un aborto",
  );
  const after = session.answer({ kind: "value", value: str("tarde") });
  eq(after.kind, "failed", "y ya no se puede reanudar por mucho que se conteste");
}

// --- normalización de nombres de fichero -------------------------------------------
{
  const expected = "cajetin.lsp";
  for (const written of ["cajetin", "CAJETIN.LSP", "Cajetin.lsp", "C:\\rutinas\\cajetin.lsp"])
    eq(normalizeLispFileName(written), expected, `"${written}" nombra el mismo fichero`);
}

// --- lo que NO se prueba, dicho en voz alta ----------------------------------------
{
  const session = run("(getpoint)");
  const asked = session.start("(getpoint)");
  const value: LispValue = list([real(1), real(2), real(0)]);
  eq(asked.kind, "ask", "queda una pregunta viva");
  eq(session.answer({ kind: "value", value }).kind, "done", "y se contesta una sola vez");
}

console.log(
  `interactive: ${checks} aserciones verdes (suspende en getpoint y reanuda con el punto, ` +
    `princ no suspende, el lote sale entero para UN paso de deshacer, el corte de presupuesto ` +
    `no pasa por *error* y el error corriente sí, globales sembradas y recogidas, load contra ` +
    `la biblioteca del anfitrión con ciclos nombrados). El diálogo DCL no se pinta: lo declara ` +
    `y lo cancela el descriptor de comando, no este módulo.`,
);
