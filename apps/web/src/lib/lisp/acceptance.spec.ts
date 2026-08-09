/**
 * La aceptación de extremo a extremo, y una advertencia sobre su alcance.
 *
 * ## Qué recorre
 *
 * Sube un `.lsp` a la biblioteca de una organización → lo autocarga → invoca su
 * comando `c:` como lo invocaría la línea de comandos → aplica el lote por la
 * ruta canónica (`executeCadEntityCommandBatch`, la misma que usa
 * `commitNativeCommands`) → SERIALIZA el documento con el serializador del
 * producto → lo vuelve a leer con `parseCadDocument` → y comprueba que la
 * geometría que produjo la rutina está ahí.
 *
 * Eso es lo que significa «la geometría que produjo está en el documento
 * guardado»: no que la variable de memoria la tenga, sino que sobrevive al
 * texto que viaja al servidor y a la lectura de vuelta.
 *
 * ## Qué NO recorre, y por qué
 *
 * No hay navegador. La golden de Playwright que pide la misión —cargar el
 * `.lsp` desde la interfaz e invocarlo tecleando en la línea de comandos— exige
 * montar el subsistema en `Layout3DEditor.tsx` y en
 * `components/cad/command-line/`, que están FUERA del alcance de esta sesión
 * (`lib/lisp/` y nada más). `routine.ts` deja el enganche en una sola llamada
 * para que esa sesión sea corta, y esta spec cubre todo lo que se puede cubrir
 * sin tocar el editor.
 *
 * Está declarado aquí, en el PR y en `routine.ts`. Un silencio habría dejado
 * creer que el camino entero está probado.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "../cad/cad-document";
import { executeCadEntityCommandBatch } from "../cad/entity-commands";
import {
  InMemoryLispLibraryStore,
  commandInventory,
  uploadLispFile,
} from "./library";
import { autoloadSources, runLispRoutine } from "./routine";
import { ScriptedResponder } from "./session";
import { list, real, str } from "./values";

let checks = 0;
const corpusDir = path.join(path.dirname(new URL(import.meta.url).pathname), "corpus");

function emptyDocument(): CadDocument {
  return {
    meta: { version: 7, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CAJETIN", name: "CAJETIN", color: "#ffffff", visible: true, locked: false },
      { id: "TEXTOS", name: "TEXTOS", color: "#00ff00", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
}

// --- el recorrido completo -----------------------------------------------------
{
  // 1. La organización sube su rutina.
  const store = new InMemoryLispLibraryStore();
  const upload = uploadLispFile(store, {
    tenantId: "estudio-valle",
    name: "cajetin.lsp",
    source: fs.readFileSync(path.join(corpusDir, "cajetin.lsp"), "utf8"),
    updatedBy: "sergio",
    now: "2026-08-09T10:00:00.000Z",
    autoload: true,
  });
  assert.ok(upload.ok, "el fichero se sube");
  assert.equal(upload.ok && upload.file.version, 1, "en su versión 1");
  checks += 2;

  // 2. La interfaz sabe qué comando ofrece, sin ejecutarlo.
  const inventory = commandInventory(store, "estudio-valle");
  assert.equal(inventory.commands.get("CAJETIN"), "cajetin.lsp",
    "el comando CAJETIN queda disponible para la organización");
  checks += 1;

  // 3. Se abre un dibujo y se teclea el comando. El usuario contesta a las
  //    preguntas de la rutina como contestaría de verdad.
  const before = emptyDocument();
  let serial = 0;
  const run = runLispRoutine({
    document: before,
    sources: autoloadSources(store, "estudio-valle"),
    invoke: "(c:cajetin)",
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `lisp-${serial}`;
    },
    responder: new ScriptedResponder([
      { kind: "value", value: list([real(2000), real(1000), real(0)]) },
      { kind: "value", value: real(180) },
      { kind: "value", value: str("PLANTA PRIMERA") },
    ]),
  });
  assert.ok(run.ok, `la rutina debería completarse: ${run.failure?.message ?? ""}`);
  assert.equal(run.commands.length, 5, "produjo cinco escrituras");
  checks += 2;

  // 4. El anfitrión aplica el lote por la ruta canónica: UNA transacción, UN
  //    paso de deshacer. Es literalmente lo que hace `commitNativeCommands`.
  const applied = executeCadEntityCommandBatch(before, run.commands, run.label);
  assert.equal(applied.document.meta.version, before.meta.version + 1,
    "la versión del documento sube UNA vez, no cinco");
  assert.equal(applied.document.history.length, 1, "y deja UNA entrada de historia");
  assert.equal(applied.createdEntityIds.length, 5, "con las cinco entidades creadas");
  checks += 3;

  // 5. Se guarda: el serializado determinista del producto, que es el texto que
  //    viaja al servidor.
  const saved = serializeCadDocument(applied.document);

  // 6. Y se vuelve a abrir. LA comprobación: la geometría de la rutina está en
  //    el documento GUARDADO, no sólo en la memoria de la sesión.
  const reopened = parseCadDocument(saved);
  assert.equal(reopened.entities.length, 5, "el documento reabierto trae las cinco entidades");

  const frame = reopened.entities.find((entity) => entity.type === "polyline");
  assert.ok(frame, "el recuadro del cajetín sobrevivió al guardado");
  assert.equal(
    frame?.type === "polyline" ? frame.vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(" ") : "",
    "2000,1000 2180,1000 2180,1040 2000,1040",
    "con las coordenadas exactas que produjo la rutina desde el punto que pinchó el usuario",
  );
  assert.equal(frame?.type === "polyline" && frame.closed, true, "y cerrado");
  assert.equal(frame?.layer, "CAJETIN", "en su capa");

  const label = reopened.entities.find((entity) => entity.type === "mtext");
  assert.equal(label?.type === "mtext" ? label.text : "", "PLANTA PRIMERA",
    "el rótulo que escribió el usuario está en el documento guardado");
  assert.equal(label?.layer, "TEXTOS", "en la capa de textos");

  const dividers = reopened.entities.filter((entity) => entity.type === "line");
  assert.equal(dividers.length, 3, "las tres divisiones también");
  assert.equal(
    dividers.map((entity) => (entity.type === "line" ? entity.start.y : 0)).sort((a, b) => a - b).join(","),
    "1010,1020,1030",
    "en los múltiplos exactos del paso entero, medidos desde donde pinchó el usuario",
  );
  checks += 8;

  // 7. El z-order es el orden en que la rutina creó las cosas, no el alfabético
  //    de unos identificadores que el usuario nunca ve.
  assert.equal(
    reopened.modelSpace.entityIds.join(","),
    "lisp-1,lisp-2,lisp-3,lisp-4,lisp-5",
    "el orden de dibujo conserva el orden de creación",
  );
  checks += 1;

  // 8. Guardar dos veces el mismo contenido produce el mismo texto: la rutina no
  //    introduce nada no determinista (ids inyectados, sin relojes).
  assert.equal(serializeCadDocument(parseCadDocument(saved)), saved,
    "el documento vuelve a serializarse idéntico");
  checks += 1;
}

// --- una rutina que falla a mitad: el lote se DEVUELVE y decide el anfitrión --------
{
  const document = emptyDocument();
  const run = runLispRoutine({
    document,
    invoke: `(progn
       (entmake (list (cons 0 "LINE") (list 10 0.0 0.0 0.0) (list 11 10.0 0.0 0.0)))
       (entmake (list (cons 0 "HATCH") (cons 2 "SOLID"))))`,
  });
  assert.ok(!run.ok, "la rutina falla en el HATCH");
  assert.equal(run.commands.length, 1, "pero el lote trae la línea que sí se creó");
  // Quien decide es el anfitrión: aplicarlo deja el trabajo hecho hasta el fallo
  // (lo que hace AutoCAD) y descartarlo deja el dibujo intacto. Lo que no puede
  // pasar es que se aplique a medias sin que nadie lo sepa.
  assert.ok(run.failure?.message.includes("HATCH"), "y el fallo dice qué pasó");
  checks += 3;
}

// --- una rutina hostil no llega al documento -----------------------------------------
{
  const document = emptyDocument();
  const run = runLispRoutine({
    document,
    invoke: '(progn (defun f () (f)) (f) (entmake (list (cons 0 "LINE") (list 10 0.0 0.0 0.0) (list 11 1.0 1.0 0.0))))',
    limits: { maxSteps: 200_000, maxCells: 500_000, maxDepth: 64, maxMillis: 5_000 },
  });
  assert.ok(!run.ok, "la recursión infinita se corta");
  assert.equal(run.failure?.kind, "abort", "como corte de sandbox");
  assert.equal(run.commands.length, 0, "y no escribió nada en el documento");
  assert.equal(run.document.meta.version, document.meta.version, "que sigue en su versión");
  checks += 4;
}

console.log(`acceptance: ${checks} aserciones verdes — biblioteca → autocarga → invocación → lote canónico → guardado → reapertura, con la geometría comprobada en el documento SERIALIZADO. Sin navegador: la golden de Playwright exige montar el subsistema en el editor, que queda fuera de esta sesión.`);
