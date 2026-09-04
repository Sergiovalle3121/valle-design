/**
 * El corpus: rutinas `.lsp` que hacen TRABAJO DE VERDAD.
 *
 * Un «hola mundo» no prueba nada de lo que importa. Lo que decide si un
 * veterano de AutoCAD puede traerse sus veinte años de rutinas es si funciona
 * un cajetín parametrizado, una numeración de ejes, un volcado de mediciones y
 * una comprobación de norma — que es lo que hay en `corpus/`, escrito como se
 * escribe el código real y no como se escribe un ejemplo de manual.
 *
 * Las aserciones son de GEOMETRÍA CONCRETA: qué entidades quedaron en el
 * documento canónico, en qué coordenadas y en qué capa. Comprobar sólo que la
 * rutina «no falló» dejaría pasar una que dibuja todo en el origen.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { printLisp } from "./printer";
import { LispSession, ScriptedResponder } from "./session";
import { list, real, str, type LispResponse, type LispValue } from "./values";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
// `fileURLToPath` y no `.pathname`: en Windows el pathname de un file URL es
// `/D:/…`, y unirlo con `path.join` fabrica rutas imposibles (`D:\D:\…`).
const corpusDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "corpus");

function load(name: string): string {
  return fs.readFileSync(path.join(corpusDir, name), "utf8");
}

function seed(entities: CadEntity[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CAJETIN", name: "CAJETIN", color: "#ffffff", visible: true, locked: false },
      { id: "TEXTOS", name: "TEXTOS", color: "#00ff00", visible: true, locked: false },
      { id: "EJES", name: "EJES", color: "#ffff00", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
}

interface Run {
  ok: boolean;
  text: string;
  output: string;
  host: CadDocumentLispHost;
}

function runRoutine(
  files: readonly string[],
  invocation: string,
  entities: CadEntity[] = [],
  answers: LispResponse[] = [],
): Run {
  let serial = 0;
  const host = new CadDocumentLispHost(seed(entities), {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `e${String(serial).padStart(3, "0")}`;
    },
  });
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  const responder = new ScriptedResponder(answers);
  for (const file of files) {
    const loaded = session.run(load(file), responder);
    assert.ok(loaded.ok, `${file} debería cargarse: ${loaded.ok ? "" : loaded.failure.message}`);
    checks += 1;
  }
  const result = session.run(invocation, responder);
  return {
    ok: result.ok,
    text: result.ok ? printLisp(result.value) : result.failure.message,
    output: session.output,
    host,
  };
}

function point(x: number, y: number): LispValue {
  return list([real(x), real(y), real(0)]);
}

// --- CAJETIN: geometría exacta, con reparto ENTERO -------------------------------
{
  const outcome = runRoutine(["cajetin.lsp"], '(vd:cajetin 0 0 180 40 4 "VALLE DESIGN")');
  assert.ok(outcome.ok, `el cajetín debería dibujarse: ${outcome.text}`);
  // 40 entre 4 filas, con división ENTERA: paso 10 exacto. Con división real
  // cada fila arrastraría decimales y la última no cerraría contra el marco.
  assert.equal(outcome.text, "((0 0) 180 40 10)", "el reparto entero da un paso de 10 exacto");

  const entities = outcome.host.document().entities;
  const polylines = entities.filter((entity) => entity.type === "polyline");
  const lines = entities.filter((entity) => entity.type === "line");
  const texts = entities.filter((entity) => entity.type === "mtext");
  assert.equal(polylines.length, 1, "un recuadro exterior");
  assert.equal(lines.length, 3, "tres divisiones interiores para cuatro filas");
  assert.equal(texts.length, 1, "y el rótulo");

  const frame = polylines[0];
  assert.equal(
    frame.type === "polyline" && frame.closed,
    true,
    "el recuadro está CERRADO: si no, el cajetín tendría un lado abierto",
  );
  assert.equal(
    frame.type === "polyline" ? frame.vertices.map((v) => `${v.x},${v.y}`).join(" ") : "",
    "0,0 180,0 180,40 0,40",
    "y sus cuatro esquinas están donde tienen que estar",
  );
  // Las divisiones caen a 10, 20 y 30: exactamente el paso entero.
  assert.equal(
    lines
      .map((entity) => (entity.type === "line" ? entity.start.y : -1))
      .sort((a, b) => a - b)
      .join(","),
    "10,20,30",
    "las divisiones caen en los múltiplos del paso",
  );
  assert.equal(texts[0].layer, "TEXTOS", "el rótulo va a su capa, no a la del marco");
  assert.equal(frame.layer, "CAJETIN", "y el marco a la suya");
  // El cajetín entero es UN paso de deshacer para el usuario, aunque sean cinco
  // entidades: el anfitrión acumula y quien conduce la sesión aplica una vez.
  assert.equal(outcome.host.pendingCommands.length, 5, "cinco escrituras en un solo lote");
  checks += 11;
}

// --- CAJETIN interactivo: la misma rutina, preguntando ------------------------------
{
  const outcome = runRoutine(
    ["cajetin.lsp"],
    "(c:cajetin)",
    [],
    [{ kind: "value", value: point(1000, 500) }, { kind: "value", value: real(180) }, { kind: "value", value: str("PLANTA BAJA") }],
  );
  assert.ok(outcome.ok, `c:cajetin debería funcionar: ${outcome.text}`);
  const frame = outcome.host.document().entities.find((entity) => entity.type === "polyline");
  assert.equal(
    frame?.type === "polyline" ? `${frame.vertices[0].x},${frame.vertices[0].y}` : "",
    "1000,500",
    "el cajetín nace donde el usuario pinchó, no en el origen",
  );
  checks += 2;

  // Y si el usuario cancela, la rutina lo dice y NO dibuja nada.
  const cancelled = runRoutine(["cajetin.lsp"], "(c:cajetin)", [], [{ kind: "cancel" }]);
  assert.equal(cancelled.text, "nil", "cancelar devuelve nil");
  assert.equal(cancelled.host.pendingCommands.length, 0, "y no deja media geometría");
  assert.ok(cancelled.output.includes("Cancelado"), "avisando por la línea de comandos");
  checks += 3;
}

// --- NUMERA-EJES: letras, números y las líneas por el motor ----------------------------
{
  const outcome = runRoutine(["numera-ejes.lsp"], "(vd:numera 0 0 5000 3 2 250.0)");
  assert.ok(outcome.ok, `la numeración debería funcionar: ${outcome.text}`);
  assert.equal(outcome.text, '(("A" "B" "C") ("1" "2"))',
    "tres ejes verticales con letra y dos horizontales con número");

  const entities = outcome.host.document().entities;
  const circles = entities.filter((entity) => entity.type === "circle");
  const lines = entities.filter((entity) => entity.type === "line");
  assert.equal(circles.length, 5, "cinco burbujas");
  assert.equal(lines.length, 5, "cinco ejes");
  // Las líneas las dibujó `command "LINE"`, es decir, el MOTOR del producto: son
  // las mismas entidades canónicas que produce teclear el comando.
  assert.ok(
    outcome.host.appliedLabels.includes("LISP LINE"),
    `alguna escritura viene del motor de comandos: ${outcome.host.appliedLabels.join(", ")}`,
  );
  const bubbles = circles
    .map((entity) => (entity.type === "circle" ? entity.center.x : Number.NaN))
    .sort((a, b) => a - b);
  assert.equal(bubbles.join(","), "-500,-500,0,5000,10000",
    "las tres burbujas de eje vertical caen sobre sus ejes y las dos horizontales a la izquierda");
  checks += 6;

  // La serie de letras pasa de la Z sin romperse: un plano de más de veintiséis
  // ejes no es raro, y `(chr (+ 65 26))` daría un corchete.
  const beyondZ = runRoutine(["numera-ejes.lsp"], "(list (vd:letra 25) (vd:letra 26) (vd:letra 27))");
  assert.equal(beyondZ.text, '("Z" "AA" "AB")', "tras la Z viene AA, no un corchete");
  checks += 1;
}

// --- TABLA-MEDICION: mide, agrupa y vuelca -----------------------------------------------
{
  const scene: CadEntity[] = [
    { id: "m1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 3000, y: 0, z: 0 }, layer: "MUROS" },
    { id: "m2", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 4000, z: 0 }, layer: "MUROS" },
    {
      id: "p1",
      type: "polyline",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 100, z: 0 },
      ],
      closed: true,
      layer: "EJES",
    },
  ];
  const outcome = runRoutine(["tabla-medicion.lsp"], '(vd:volcar (vd:medir (ssget "X")))', scene);
  assert.ok(outcome.ok, `la medición debería funcionar: ${outcome.text}`);
  // MUROS: 3000 + 4000 = 7000. EJES: la polilínea CERRADA mide 100 + 100 + el
  // cierre de 141,42… = 341,42. Total 7341,42.
  assert.equal(outcome.text, "7341.42135623731", "el total sale de sumar las dos capas");
  assert.equal(
    outcome.output,
    "CAPA;LONGITUD\nEJES;341.42\nMUROS;7000.00\nTOTAL;7341.42\n",
    "y la tabla sale ordenada por capa, con rtos escribiendo las medidas",
  );
  // La rutina LEE, no escribe: una medición no puede tocar el dibujo.
  assert.equal(outcome.host.pendingCommands.length, 0, "medir no modifica el documento");
  checks += 4;

  // El cierre de la polilínea SÓLO se cuenta si está cerrada. Es la clase de
  // detalle que hace que una medición cuadre o no.
  const closedPolyline = scene[2];
  assert.equal(closedPolyline.type, "polyline", "el tercer elemento de la escena es la polilínea");
  const openScene: CadEntity[] =
    closedPolyline.type === "polyline" ? [{ ...closedPolyline, closed: false }] : [];
  const open = runRoutine(["tabla-medicion.lsp"], '(vd:medir (ssget "X"))', openScene);
  assert.equal(open.text, '(("EJES" . 200.0))', "abierta mide 200, sin el tramo de cierre");
  checks += 2;
}

// --- COMPRUEBA-COTAS: la comprobación de norma ---------------------------------------------
{
  const dimension = (id: string, associative: boolean, broken: boolean): CadEntity => ({
    id,
    type: "dimension",
    dimensionKind: "linear",
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    layer: "0",
    associative,
    associationStatus: broken ? "broken" : associative ? "associated" : "detached",
  });
  const scene: CadEntity[] = [
    dimension("d1", true, false),
    dimension("d2", false, false),
    dimension("d3", true, true),
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
  ];
  const outcome = runRoutine(["comprueba-cotas.lsp"], "(c:cotas)", scene);
  assert.ok(outcome.ok, `la comprobación debería funcionar: ${outcome.text}`);
  assert.equal(
    outcome.text,
    '((<Entity name: d2> "SIN ASOCIAR") (<Entity name: d3> "ROTA"))',
    "encuentra la desasociada y la rota, y deja en paz la buena",
  );
  assert.ok(outcome.output.includes("Cotas revisadas: 3"), "revisó las tres cotas");
  assert.ok(outcome.output.includes("Con problema: 2"), "y contó dos problemas");
  // La línea no es una cota y no aparece en el informe: el recorrido con
  // `entnext` la ve y la descarta.
  assert.ok(!outcome.text.includes("l1"), "la línea no entra en el informe de cotas");
  checks += 5;
}

// --- las cuatro rutinas conviven en la misma sesión sin pisarse ------------------------------
{
  // Cada una declara sus locales tras la barra. Si alguna ensuciara el espacio
  // global, cargarlas juntas y ejecutarlas en cadena daría un resultado
  // distinto que ejecutarlas por separado.
  const outcome = runRoutine(
    ["cajetin.lsp", "numera-ejes.lsp", "tabla-medicion.lsp", "comprueba-cotas.lsp"],
    '(progn (vd:cajetin 0 0 180 40 4 "X") (vd:numera 0 0 5000 2 2 250.0) (list (length (vd:revisa)) (vd:medir (ssget "X" (list (cons 0 "LINE"))))))',
  );
  assert.ok(outcome.ok, `las cuatro juntas deberían funcionar: ${outcome.text}`);
  // Ninguna cota en el dibujo, y las líneas medidas son las tres divisiones del
  // cajetín (180 cada una) más los cuatro ejes.
  assert.ok(outcome.text.startsWith("(0 ("), `el informe de cotas está vacío: ${outcome.text}`);
  checks += 2;
}

console.log(`corpus: ${checks} aserciones verdes sobre 4 rutinas .lsp reales (cajetín parametrizado, numeración de ejes, tabla de medición, comprobación de cotas) con geometría concreta en el documento canónico.`);
