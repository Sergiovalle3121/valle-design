/**
 * `command` y la familia `get*`.
 *
 * Lo que se demuestra aquí, en orden de importancia:
 *
 *  1. `command` conduce el MOTOR DEL PRODUCTO, no un intérprete paralelo. La
 *     prueba es que lo que produce es indistinguible de lo que produce teclear
 *     el comando: las mismas entidades canónicas, por la misma ruta de
 *     mutación.
 *  2. Un `command` con argumentos que el comando no acepta FALLA diciendo qué
 *     pedía, y no escribe nada. Un rechazo explícito vale más que un silencio
 *     que parece que funcionó.
 *  3. `getpoint` y compañía SUSPENDEN la rutina y la reanudan con lo que
 *     conteste el anfitrión — que es la razón por la que el evaluador es un
 *     generador.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { printLisp } from "./printer";
import { LispSession, ScriptedResponder } from "./session";
import {
  list,
  real,
  str,
  type LispRequest,
  type LispResponse,
  type LispValue,
} from "./values";

let checks = 0;

function seed(entities: CadEntity[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
}

function point(x: number, y: number): LispValue {
  return list([real(x), real(y), real(0)]);
}

function answer(value: LispValue): LispResponse {
  return { kind: "value", value };
}

interface Run {
  ok: boolean;
  text: string;
  host: CadDocumentLispHost;
  seen: LispRequest[];
}

function run(source: string, entities: CadEntity[] = [], answers: LispResponse[] = []): Run {
  let serial = 0;
  const host = new CadDocumentLispHost(seed(entities), {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `nuevo-${serial}`;
    },
  });
  const responder = new ScriptedResponder(answers);
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  const result = session.run(source, responder);
  return {
    ok: result.ok,
    text: result.ok ? printLisp(result.value) : result.failure.message,
    host,
    seen: responder.seen,
  };
}

// --- command dibuja de verdad, con las entidades del motor -------------------------
{
  const outcome = run('(command "LINE" (list 0 0) (list 2000 0) (list 2000 1500) "C")');
  assert.ok(outcome.ok, `LINE por command debería funcionar: ${outcome.text}`);
  const entities = outcome.host.document().entities;
  // Tres puntos encadenados y CERRADOS son tres segmentos, igual que teclear
  // `L 0,0 @2000,0 @0,1500 C` en la línea de comandos.
  assert.equal(entities.length, 3, "el contorno cerrado son tres segmentos");
  assert.ok(entities.every((entity) => entity.type === "line"), "y todos son LINE canónicas");
  const last = entities.find((entity) => entity.type === "line" && entity.end.x === 0 && entity.end.y === 0);
  assert.ok(last, "el último segmento vuelve al origen: «Cerrar» cerró de verdad");
  // UN lote: la frontera de deshacer es el comando, no la entidad.
  assert.equal(outcome.host.appliedLabels.length, 1, "una sola aplicación, un solo paso de deshacer");
  assert.equal(outcome.host.appliedLabels[0], "LISP LINE", "etiquetada con el comando que la produjo");
  checks += 6;
}

// --- el alias de acad.pgp funciona igual que en la línea de comandos ------------------
{
  const outcome = run('(command "L" (list 0 0) (list 10 0) "")');
  assert.ok(outcome.ok, `el alias L debería resolver: ${outcome.text}`);
  assert.equal(outcome.host.document().entities.length, 1, "y dibujar el segmento");
  checks += 2;
}

// --- CIRCLE: el número tras el centro es el RADIO ----------------------------------------
{
  const outcome = run('(command "CIRCLE" (list 100 100) 50)');
  assert.ok(outcome.ok, `CIRCLE debería funcionar: ${outcome.text}`);
  const circle = outcome.host.document().entities[0];
  assert.equal(circle?.type === "circle" && circle.radius, 50, "el 50 se interpretó como radio");
  assert.equal(circle?.type === "circle" && circle.center.x, 100, "y el centro es el punto dado");
  checks += 3;
}

// --- ERASE con un conjunto de selección ---------------------------------------------------
{
  const scene: CadEntity[] = [
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
    { id: "b", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 6, y: 6, z: 0 }, layer: "0" },
  ];
  const outcome = run('(command "ERASE" (ssget "X") "")', scene);
  assert.ok(outcome.ok, `ERASE con pickset debería funcionar: ${outcome.text}`);
  assert.equal(outcome.host.document().entities.length, 0, "borró las dos entidades");
  checks += 2;
}

// --- argumentos que el comando NO acepta: falla DICIENDO qué pedía --------------------------
{
  const outcome = run('(command "CIRCLE" (list 0 0) "PAPAGAYO")');
  assert.ok(!outcome.ok, "una palabra que no es opción del paso debe fallar");
  assert.ok(
    outcome.text.includes("PAPAGAYO"),
    `el error debe nombrar lo que se pasó: ${outcome.text}`,
  );
  assert.equal(outcome.host.pendingCommands.length, 0, "y no debe escribir nada");
  checks += 3;
}

// --- un command incompleto se cancela, y lo dice ---------------------------------------------
{
  const outcome = run('(command "LINE" (list 0 0))');
  assert.ok(!outcome.ok, "un LINE sin segundo punto no puede completarse");
  assert.ok(
    outcome.text.includes("se quedó sin argumentos") && outcome.text.includes("punto"),
    `el error debe decir qué pedía: ${outcome.text}`,
  );
  assert.equal(outcome.host.pendingCommands.length, 0, "y no deja media línea en el dibujo");
  checks += 3;
}

// --- un comando que no existe ------------------------------------------------------------------
{
  const outcome = run('(command "SUPERTRIM" (list 0 0))');
  assert.ok(!outcome.ok, "un comando inexistente falla");
  assert.ok(outcome.text.includes("SUPERTRIM"), `nombrándolo: ${outcome.text}`);
  checks += 2;
}

// --- sobran argumentos ---------------------------------------------------------------------------
{
  const outcome = run('(command "CIRCLE" (list 0 0) 10 (list 5 5) (list 6 6))');
  assert.ok(!outcome.ok, "argumentos de más se rechazan");
  assert.ok(outcome.text.includes("sobran"), `diciéndolo: ${outcome.text}`);
  checks += 2;
}

// --- getpoint suspende y se reanuda con lo que conteste el anfitrión ------------------------------
{
  const outcome = run(
    '(progn (setq p1 (getpoint "Primer punto")) (setq p2 (getpoint p1 "Segundo punto")) (distance p1 p2))',
    [],
    [answer(point(0, 0)), answer(point(3, 4))],
  );
  assert.equal(outcome.text, "5.0", "los dos puntos llegaron y la rutina siguió");
  assert.equal(outcome.seen.length, 2, "hubo dos peticiones");
  assert.equal(outcome.seen[0].kind, "prompt-point", "y son peticiones de punto");
  assert.equal(
    outcome.seen[0].kind === "prompt-point" && outcome.seen[0].message,
    "Primer punto",
    "con el mensaje que escribió el autor de la rutina",
  );
  // El segundo `getpoint` lleva punto base: es lo que dibuja la banda elástica.
  assert.equal(
    outcome.seen[1].kind === "prompt-point" && printLisp(outcome.seen[1].base),
    "(0.0 0.0 0.0)",
    "el segundo getpoint transporta el punto base",
  );
  checks += 5;
}

// --- Esc devuelve nil, que es como la rutina lo comprueba --------------------------------------------
{
  const outcome = run('(if (getpoint "Punto") "hubo punto" "el usuario canceló")', [], [{ kind: "cancel" }]);
  assert.equal(outcome.text, '"el usuario canceló"', "cancelar devuelve nil");
  checks += 1;
}

// --- pero initget 1 lo prohíbe -----------------------------------------------------------------------
{
  const outcome = run('(progn (initget 1) (getpoint "Punto obligatorio"))', [], [{ kind: "cancel" }]);
  assert.ok(!outcome.ok, "con (initget 1) cancelar es un error");
  assert.ok(outcome.text.includes("obligatoria"), `y lo dice: ${outcome.text}`);
  checks += 2;

  // Y el armado se CONSUME: la siguiente pregunta vuelve a admitir el vacío.
  const consumed = run(
    '(progn (initget 1) (getpoint "Uno") (getpoint "Dos"))',
    [],
    [answer(point(1, 1)), { kind: "cancel" }],
  );
  assert.ok(consumed.ok, "la segunda pregunta ya no está armada");
  assert.equal(consumed.text, "nil", "y cancelarla devuelve nil");
  checks += 2;
}

// --- getreal, getint, getstring, getkword, getangle, getdist -------------------------------------------
{
  assert.equal(run('(getreal "Escala")', [], [answer(real(2.5))]).text, "2.5", "getreal");
  assert.equal(run('(getint "Cuántos")', [], [answer(real(7.9))]).text, "7",
    "getint trunca un real, como el original");
  assert.equal(run('(getstring "Nombre")', [], [answer(str("EJE-01"))]).text, '"EJE-01"', "getstring");
  assert.equal(
    run('(progn (initget 1 "Si No") (getkword "¿Sigo?"))', [], [answer(str("S"))]).text,
    '"Si"',
    "getkword acepta el atajo en mayúsculas y devuelve la palabra entera",
  );
  checks += 4;

  // getangle admite que el anfitrión conteste con un PUNTO: el ángulo es el del
  // vector desde la base. Las rutinas usan las dos formas.
  assert.equal(
    run('(getangle (list 0 0) "Dirección")', [], [answer(point(0, 5))]).text,
    printLisp(real(Math.PI / 2)),
    "getangle con punto base y respuesta de punto",
  );
  assert.equal(
    run('(getdist (list 0 0) "Distancia")', [], [answer(point(3, 4))]).text,
    "5.0",
    "getdist con punto base mide la distancia",
  );
  checks += 2;

  // Una palabra que no está entre las ofrecidas se rechaza.
  const wrong = run('(progn (initget 1 "Si No") (getkword "¿Sigo?"))', [], [answer(str("Quizá"))]);
  assert.ok(!wrong.ok, "una respuesta fuera de las opciones falla");
  checks += 1;

  // Y `getkword` sin armar es un error de la RUTINA, no del usuario.
  const unarmed = run('(getkword "¿Sigo?")', [], [answer(str("Si"))]);
  assert.ok(!unarmed.ok, "getkword sin initget falla");
  assert.ok(unarmed.text.includes("initget"), `diciendo qué falta: ${unarmed.text}`);
  checks += 2;
}

// --- ssget interactivo también suspende --------------------------------------------------------------
{
  const scene: CadEntity[] = [
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
  ];
  const outcome = run("(sslength (ssget))", scene, [answer(list([{ t: "ename", id: "a" }]))]);
  assert.equal(outcome.text, "1", "ssget sin modo pide la designación al anfitrión");
  assert.equal(outcome.seen[0]?.kind, "prompt-selection", "y la petición es de selección");
  checks += 2;
}

// --- getvar y setvar: sólo lo que se puede responder con certeza ----------------------------------------
{
  assert.equal(run('(getvar "CLAYER")').text, '"0"', "CLAYER responde la capa activa");
  assert.equal(run('(getvar "INSUNITS")').text, "4", "INSUNITS responde 4 (milímetros)");
  const invented = run('(getvar "OSMODE")');
  assert.ok(!invented.ok, "una variable que no existe no se inventa");
  const written = run('(setvar "CMDECHO" 0)');
  assert.ok(!written.ok, "setvar se rechaza en vez de aceptar y no aplicar");
  checks += 4;
}

// --- tblsearch sobre la tabla de capas -------------------------------------------------------------------
{
  assert.equal(run('(cdr (assoc 2 (tblsearch "LAYER" "0")))').text, '"0"', "tblsearch encuentra la capa");
  assert.equal(run('(tblsearch "LAYER" "NO-EXISTE")').text, "nil", "y devuelve nil si no está");
  const other = run('(tblsearch "BLOCK" "X")');
  assert.ok(!other.ok, "las tablas no implementadas se rechazan diciéndolo");
  checks += 3;
}

console.log(`interaction: ${checks} aserciones verdes (command conduce el motor del producto, rechazos explícitos, get* suspende y reanuda, initget se consume).`);
