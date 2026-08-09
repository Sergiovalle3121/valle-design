/**
 * Las funciones de entidad contra un `CadDocument` DE VERDAD.
 *
 * El traductor DXF es el corazón de la compatibilidad: si miente, ninguna
 * rutina falla — todas producen basura plausible. Así que esta spec no se
 * conforma con «ir y volver devuelve lo mismo»: esa propiedad la cumple de
 * forma VACÍA un traductor que no traduzca nada, porque aplicar la identidad
 * dos veces también devuelve el original.
 *
 * Cada bloque fija además ANCLAS ABSOLUTAS: qué código de grupo sale, con qué
 * valor exacto, y qué queda escrito en el documento canónico después.
 */
import { strict as assert } from "node:assert";
import {
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../cad/cad-document";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { LispSession, ScriptedResponder, type LispRunResult } from "./session";
import { printLisp } from "./printer";

let checks = 0;

function seed(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
    ],
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

function line(id: string, x1: number, y1: number, x2: number, y2: number, layer = "0"): CadEntity {
  return { id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer };
}

interface Run {
  result: LispRunResult;
  host: CadDocumentLispHost;
  text: string;
}

function run(source: string, entities: CadEntity[] = [], answers: ConstructorParameters<typeof ScriptedResponder>[0] = []): Run {
  let serial = 0;
  const host = new CadDocumentLispHost(seed(entities), {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `nuevo-${serial}`;
    },
  });
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  const result = session.run(source, new ScriptedResponder(answers));
  return { result, host, text: result.ok ? printLisp(result.value) : result.failure.message };
}

function eq(source: string, entities: CadEntity[], expected: string, message: string): void {
  const outcome = run(source, entities);
  assert.equal(outcome.text, expected, `${message} — ${source}`);
  checks += 1;
}

// --- entget: los códigos EXACTOS que ve una rutina --------------------------------
{
  const outcome = run("(entget (entnext))", [line("a", 0, 0, 100, 50)]);
  assert.equal(
    outcome.text,
    '((-1 . <Entity name: a>) (0 . "LINE") (100 . "AcDbEntity") (8 . "0") (62 . 256) ' +
      '(100 . "AcDbLine") (10 0.0 0.0 0.0) (11 100.0 50.0 0.0))',
    "entget de una LINE: cada par en su sitio y con su tipo",
  );
  checks += 1;

  // El punto es una LISTA, no un par punteado. `(cdr (assoc 10 ed))` tiene que
  // dar `(0.0 0.0 0.0)` y `(cadr (assoc 10 ed))` la X.
  eq("(cdr (assoc 10 (entget (entnext))))", [line("a", 3, 4, 9, 9)], "(3.0 4.0 0.0)",
    "el cdr de un punto es la lista de coordenadas");
  eq("(cadr (assoc 10 (entget (entnext))))", [line("a", 3, 4, 9, 9)], "3.0",
    "y su cadr es la X");
  // El escalar SÍ es un par punteado.
  eq("(cdr (assoc 8 (entget (entnext))))", [line("a", 0, 0, 1, 1, "MUROS")], '"MUROS"',
    "el cdr de un escalar es el valor, no una lista");
}

// --- el radio de un círculo sale como REAL aunque valga un entero -------------------
{
  eq("(cdr (assoc 40 (entget (entnext))))",
    [{ id: "c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 2, layer: "0" }],
    "2.0",
    "el código 40 es real por CÓDIGO, no por el valor que traiga");
  // Y por tanto NO es `eq` al entero 2: una rutina que compare tipos lo nota.
  eq("(eq 2 (cdr (assoc 40 (entget (entnext)))))",
    [{ id: "c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 2, layer: "0" }],
    "nil", "un real no es eq a un entero");
}

// --- los ángulos de ARC van en GRADOS ------------------------------------------------
{
  eq("(cdr (assoc 50 (entget (entnext))))",
    [{ id: "arc", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 10, startAngle: 30, endAngle: 120, layer: "0" }],
    "30.0", "el código 50 de un ARC son grados");
}

// --- los bulges se asocian POSICIONALMENTE ---------------------------------------------
{
  const polyline: CadEntity = {
    id: "p",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0, bulge: 0.5 },
      { x: 20, y: 0, z: 0 },
    ],
    closed: false,
    layer: "0",
  };
  // Sólo un 42, y detrás del SEGUNDO vértice. Emitir uno por vértice —aunque
  // valiera cero— rompería el recorrido posicional de las rutinas.
  eq("(length (entget (entnext)))", [polyline], "12",
    "la lista lleva un único 42, el del vértice curvo");
  // Y al ir y volver, el bulge sigue en el vértice correcto y no en otro.
  const roundtrip = run(
    '(progn (setq ed (entget (entnext))) (entmod ed) (cdr (assoc 42 (entget (entnext)))))',
    [polyline],
  );
  assert.equal(roundtrip.text, "0.5", "el bulge sobrevive a entget + entmod");
  const after = roundtrip.host.document().entities.find((entity) => entity.id === "p");
  assert.equal(
    after?.type === "polyline" ? after.vertices.map((vertex) => vertex.bulge ?? 0).join(",") : "",
    "0,0.5,0",
    "y sigue en el SEGUNDO vértice, no en el primero",
  );
  checks += 3;
}

// --- entmod: el gesto real de cambiar de capa -------------------------------------------
{
  const outcome = run(
    '(progn (setq e (entnext)) (setq ed (entget e)) (entmod (subst (cons 8 "MUROS") (assoc 8 ed) ed)) (cdr (assoc 8 (entget e))))',
    [line("a", 0, 0, 10, 10)],
  );
  assert.equal(outcome.text, '"MUROS"', "entmod cambió la capa");
  const moved = outcome.host.document().entities.find((entity) => entity.id === "a");
  assert.equal(moved?.layer, "MUROS", "y el documento canónico lo refleja");
  // UNA escritura, no dos: la frontera de deshacer es el comando.
  assert.equal(outcome.host.pendingCommands.length, 1, "una sola escritura acumulada");
  assert.equal(outcome.host.pendingCommands[0].type, "replace", "y va por el comando canónico replace");
  checks += 4;
}

// --- entmod NO puede cambiar el tipo -------------------------------------------------------
{
  const outcome = run(
    '(progn (setq ed (entget (entnext))) (entmod (subst (cons 0 "CIRCLE") (assoc 0 ed) ed)))',
    [line("a", 0, 0, 10, 10)],
  );
  assert.ok(!outcome.result.ok, "cambiar el tipo con entmod falla");
  assert.ok(outcome.text.includes("no puede cambiar el tipo"), `y lo dice: ${outcome.text}`);
  checks += 2;
}

// --- entmake: crea de verdad, por la ruta canónica ------------------------------------------
{
  const outcome = run(
    '(progn (entmake (list (cons 0 "LINE") (list 10 0.0 0.0 0.0) (list 11 500.0 0.0 0.0) (cons 8 "MUROS"))) (cdr (assoc 8 (entget (entlast)))))',
    [],
  );
  assert.equal(outcome.text, '"MUROS"', "entmake creó la línea en su capa");
  const created = outcome.host.document().entities;
  assert.equal(created.length, 1, "hay exactamente una entidad");
  assert.equal(created[0].type, "line", "y es una LINE canónica");
  assert.equal(
    created[0].type === "line" ? created[0].end.x : 0,
    500,
    "con las coordenadas que pidió la rutina",
  );
  assert.equal(outcome.host.pendingCommands[0]?.type, "insert", "por el comando canónico insert");
  checks += 5;
}

// --- entmake sin capa usa la ACTIVA -----------------------------------------------------------
{
  eq('(progn (entmake (list (cons 0 "CIRCLE") (list 10 1.0 2.0 0.0) (cons 40 5.0))) (cdr (assoc 8 (entget (entlast)))))',
    [], '"0"', "sin código 8, la entidad nace en la capa activa");
}

// --- entmake RECHAZA lo que no sabe construir entero -------------------------------------------
{
  const outcome = run('(entmake (list (cons 0 "HATCH") (cons 2 "SOLID")))', []);
  assert.ok(!outcome.result.ok, "entmake de un HATCH falla");
  assert.ok(
    outcome.text.includes("HATCH") && outcome.text.includes("asociatividad"),
    `y explica por qué, nombrando el tipo: ${outcome.text}`,
  );
  // Y no ha escrito NADA: un rechazo no puede dejar media entidad.
  assert.equal(outcome.host.pendingCommands.length, 0, "un rechazo no escribe nada");
  checks += 3;
}

// --- entmake con datos inválidos ---------------------------------------------------------------
{
  for (const [source, what] of [
    ['(entmake (list (cons 0 "CIRCLE") (list 10 0.0 0.0 0.0)))', "CIRCLE sin radio"],
    ['(entmake (list (cons 0 "CIRCLE") (list 10 0.0 0.0 0.0) (cons 40 -5.0)))', "radio negativo"],
    ['(entmake (list (cons 0 "LINE") (list 10 0.0 0.0 0.0)))', "LINE sin punto final"],
    ['(entmake (list (cons 8 "0")))', "sin código 0"],
    ['(entmake (list (cons 0 "LWPOLYLINE") (list 10 0.0 0.0 0.0)))', "polilínea de un vértice"],
  ] as const) {
    const outcome = run(source, []);
    assert.ok(!outcome.result.ok, `${what} debe fallar`);
    assert.equal(outcome.host.pendingCommands.length, 0, `${what} no debe escribir nada`);
    checks += 2;
  }
}

// --- entnext recorre el ORDEN DE DIBUJO, no el alfabético ----------------------------------------
{
  // Ids deliberadamente al revés del orden de dibujo: si `entnext` recorriera el
  // array `entities` —que va ordenado por id para el serializado determinista—
  // devolvería `alfa` primero.
  const document = seed([line("zeta", 0, 0, 1, 1), line("alfa", 2, 2, 3, 3)]);
  document.modelSpace.entityIds = ["zeta", "alfa"];
  const host = new CadDocumentLispHost(document);
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  const result = session.run("(list (entnext) (entnext (entnext)))");
  assert.equal(
    result.ok ? printLisp(result.value) : "",
    "(<Entity name: zeta> <Entity name: alfa>)",
    "entnext sigue el z-order del plano, no el orden de los identificadores",
  );
  checks += 1;
}

// --- entdel borra por el historial y NO resucita ---------------------------------------------------
{
  const outcome = run("(progn (setq e (entnext)) (entdel e) (entnext))", [line("a", 0, 0, 1, 1)]);
  assert.equal(outcome.text, "nil", "tras borrar, el dibujo está vacío");
  assert.equal(outcome.host.pendingCommands[0]?.type, "delete", "por el comando canónico delete");
  checks += 2;

  const twice = run("(progn (setq e (entnext)) (entdel e) (entdel e))", [line("a", 0, 0, 1, 1)]);
  assert.ok(!twice.result.ok, "el segundo entdel falla");
  assert.ok(twice.text.includes("no resucita"), `diciendo que aquí no resucita: ${twice.text}`);
  checks += 2;
}

// --- ssget: tipo, capa y ventana ---------------------------------------------------------------------
{
  const scene: CadEntity[] = [
    line("l1", 0, 0, 10, 0, "MUROS"),
    line("l2", 100, 100, 110, 100, "0"),
    { id: "c1", type: "circle", center: { x: 5, y: 5, z: 0 }, radius: 2, layer: "MUROS" },
  ];
  eq("(sslength (ssget \"X\"))", scene, "3", "ssget X coge todo");
  eq('(sslength (ssget "X" (list (cons 0 "LINE"))))', scene, "2", "filtro por tipo");
  eq('(sslength (ssget "X" (list (cons 8 "MUROS"))))', scene, "2", "filtro por capa");
  eq('(sslength (ssget "X" (list (cons 0 "LINE") (cons 8 "MUROS"))))', scene, "1",
    "dos pares del filtro son una CONJUNCIÓN");
  eq('(sslength (ssget "X" (list (cons 8 "MUR*"))))', scene, "2", "el filtro admite comodines");
  eq('(ssget "X" (list (cons 0 "SPLINE")))', scene, "nil",
    "un conjunto vacío es nil, no un pickset de cero elementos");

  // Ventana frente a captura: la línea `l1` va de (0,0) a (10,0); una ventana
  // de (0,-1) a (5,1) la CRUZA pero no la contiene.
  eq('(sslength (ssget "C" (list 0 -1) (list 5 1)))', scene, "1", "captura: basta con cruzar");
  eq('(ssget "W" (list 0 -1) (list 5 1))', scene, "nil", "ventana: hay que contener entera");
  eq('(sslength (ssget "W" (list -1 -1) (list 11 1)))', scene, "1", "y contenida sí entra");

  // El operador lógico se RECHAZA en vez de aplicarse a medias.
  const logical = run('(ssget "X" (list (cons -4 "<OR") (cons 0 "LINE") (cons -4 "OR>")))', scene);
  assert.ok(!logical.result.ok, "un filtro con -4 se rechaza");
  assert.ok(logical.text.includes("operadores lógicos"), `diciendo por qué: ${logical.text}`);
  checks += 2;

  // Un código de filtro no implementado tampoco se ignora en silencio.
  const unknown = run('(ssget "X" (list (cons 62 1)))', scene);
  assert.ok(!unknown.result.ok, "un código de filtro sin implementar se rechaza");
  checks += 1;
}

// --- ssadd y ssdel mutan EN EL SITIO ---------------------------------------------------------------
{
  eq('(progn (setq ss (ssadd)) (ssadd (entnext) ss) (sslength ss))',
    [line("a", 0, 0, 1, 1)], "1", "ssadd añade al conjunto que ya tenía la rutina");
  eq('(progn (setq ss (ssget "X")) (ssdel (entnext) ss) (sslength ss))',
    [line("a", 0, 0, 1, 1), line("b", 2, 2, 3, 3)], "1", "ssdel quita del mismo conjunto");
  eq('(progn (setq ss (ssadd)) (ssadd (entnext) ss) (ssadd (entnext) ss) (sslength ss))',
    [line("a", 0, 0, 1, 1)], "1", "añadir dos veces la misma entidad no la duplica");
}

// --- el recorrido clásico de una rutina de verdad -----------------------------------------------------
{
  // Contar la longitud total de las líneas de una capa. Es el esqueleto de
  // cualquier exportador de mediciones.
  const outcome = run(
    `(progn
       (setq ss (ssget "X" (list (cons 0 "LINE") (cons 8 "MUROS"))) i 0 total 0.0)
       (while (< i (sslength ss))
         (setq ed (entget (ssname ss i)))
         (setq total (+ total (distance (cdr (assoc 10 ed)) (cdr (assoc 11 ed)))))
         (setq i (1+ i)))
       total)`,
    [line("l1", 0, 0, 300, 0, "MUROS"), line("l2", 0, 0, 0, 400, "MUROS"), line("l3", 0, 0, 5, 0, "0")],
  );
  assert.equal(outcome.text, "700.0", "el recorrido con ssget/ssname/entget/assoc mide 700");
  checks += 1;
}

// --- el documento que sale es un CadDocument válido y serializable ---------------------------------------
{
  const outcome = run(
    '(repeat 3 (entmake (list (cons 0 "LINE") (list 10 0.0 0.0 0.0) (list 11 10.0 0.0 0.0))))',
    [],
  );
  assert.ok(outcome.result.ok, "tres entmake seguidos funcionan");
  const document = outcome.host.document();
  assert.equal(document.entities.length, 3, "tres entidades");
  // El serializado determinista del producto lo acepta: es lo que se guarda.
  assert.ok(serializeCadDocument(document).includes('"type":"line"'), "y el documento se serializa");
  assert.equal(outcome.host.pendingCommands.length, 3, "tres comandos acumulados para UN paso de deshacer");
  checks += 4;
}

console.log(`entity-functions: ${checks} aserciones verdes (códigos DXF exactos, bulges posicionales, entmod/entmake/entdel por la ruta canónica, ssget con tipo/capa/ventana, rechazos explícitos).`);
