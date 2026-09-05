/**
 * EL ENCHUFE. Que una rutina `.lsp` sea un comando más, y nada más.
 *
 * `lib/lisp/` llevaba una ola entera construido y sin que nadie lo importase.
 * Esta spec es la que comprueba que eso se acabó, y lo hace por el camino real:
 * mete texto en el reductor del motor de comandos con el registro COMPUESTO, y
 * mira los efectos que salen. No llama al intérprete a mano en ningún sitio.
 *
 * Las cinco propiedades que se fijan aquí:
 *
 *  1. Un `(defun c:MICOMANDO …)` cargado se teclea como LINE.
 *  2. Su geometría sale por UN efecto `execute` — UN paso de deshacer.
 *  3. Un comando nativo SIEMPRE gana; un `.lsp` no puede secuestrar LINE.
 *  4. Una expresión suelta se evalúa y devuelve su valor.
 *  5. El sandbox aguanta lo que le echen y, cuando no puede, lo DICE y deja el
 *     motor limpio para el comando siguiente.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "@/lib/cad/cad-document";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "@/lib/cad/engine/command-engine";
import type { CadCommandContext } from "@/lib/cad/engine/command-types";
import { executeCadEntityCommandBatch } from "@/lib/cad/entity-commands";
import { createCadLispAttachment } from "./use-lisp";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

function seed(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CAJETIN", name: "CAJETIN", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

/**
 * Un editor de mentira: el mínimo que hace falta para que el enchufe sea el de
 * verdad. Aplica los lotes como los aplicaría `commitNativeCommands` y APUNTA
 * cuántas veces lo hizo, que es exactamente el número de pasos de deshacer.
 */
class FakeStudio {
  document = seed();
  readonly undoSteps: string[] = [];
  private serial = 0;
  readonly lisp = createCadLispAttachment({ identity: () => ({ tenantId: "estudio", userId: "sergio" }) });
  private state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;

  constructor() {
    this.lisp.runtime.bind({
      document: () => this.document,
      activeLayer: () => "0",
      newEntityId: () => `e${(this.serial += 1)}`,
    });
  }

  context(): CadCommandContext {
    const byId = new Map(this.document.entities.map((entity) => [entity.id, entity]));
    return {
      entityIds: this.document.entities.map((entity) => entity.id),
      entity: (entityId) => byId.get(entityId),
      blocks: () => this.document.blocks,
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `e${(this.serial += 1)}`,
    };
  }

  /** Teclea, como el usuario. Devuelve los efectos de esa pulsación. */
  type(value: string): readonly CadCommandEffect[] {
    this.lisp.registry.remember(value);
    return this.dispatch({ kind: "token", value });
  }

  cancel(): readonly CadCommandEffect[] {
    return this.dispatch({ kind: "input", input: { kind: "cancel" } });
  }

  private dispatch(action: CadCommandAction): readonly CadCommandEffect[] {
    const reduction = cadCommandEngineReduce(
      this.state,
      action,
      this.context(),
      this.lisp.registry,
    );
    this.state = reduction.state;
    for (const effect of reduction.effects) {
      if (effect.kind !== "execute") continue;
      // Exactamente lo que hace el editor: UN lote, UNA transacción.
      this.document = executeCadEntityCommandBatch(
        this.document,
        effect.commands,
        effect.label,
      ).document;
      this.undoSteps.push(effect.label);
    }
    return reduction.effects;
  }

  get busy(): boolean {
    return this.state.active !== null;
  }
}

function messages(effects: readonly CadCommandEffect[]): string[] {
  return effects.filter((effect) => effect.kind === "message").map((effect) => effect.text);
}

function prompts(effects: readonly CadCommandEffect[]): string[] {
  return effects.filter((effect) => effect.kind === "prompt").map((effect) => effect.prompt.message);
}

function executes(effects: readonly CadCommandEffect[]): number {
  return effects.filter((effect) => effect.kind === "execute").length;
}

const CAJETIN = `
;; Cajetín mínimo pero de verdad: recuadro cerrado y su etiqueta.
(defun vd:rect (x1 y1 x2 y2 capa)
  (entmake (list (cons 0 "LWPOLYLINE") (cons 90 4) (cons 70 1) (cons 8 capa)
                 (list 10 x1 y1) (list 10 x2 y1) (list 10 x2 y2) (list 10 x1 y2))))

(defun c:CAJETIN ()
  (vd:rect 0.0 0.0 420.0 297.0 "CAJETIN")
  (entmake (list (cons 0 "MTEXT") (cons 8 "CAJETIN") (list 10 10.0 10.0 0.0)
                 (cons 1 "VALLE DESIGN") (cons 40 5.0)))
  (princ "cajetín colocado"))
`;

// --- 1. una rutina cargada se teclea como cualquier nativo ------------------------
{
  const studio = new FakeStudio();
  studio.lisp.runtime.load("cajetin.lsp", CAJETIN);

  ok(studio.lisp.registry.names().has("CAJETIN"), "el comando aparece en el registro compuesto");
  ok(studio.lisp.registry.get("CAJETIN"), "y se puede resolver por nombre");
  ok(studio.lisp.registry.get("LINE"), "sin haber perdido los nativos");

  const effects = studio.type("CAJETIN");
  eq(executes(effects), 1, "teclearlo produce UN efecto de escritura");

  // ANCLAS ABSOLUTAS: no vale con «no falló». La geometría tiene que estar.
  eq(studio.undoSteps.length, 1, "y por tanto UN solo paso de deshacer");
  eq(studio.undoSteps[0], "LISP CAJETIN", "etiquetado con el comando que lo hizo");
  eq(studio.document.entities.length, 2, "el recuadro y su etiqueta");
  const polyline = studio.document.entities.find((entity) => entity.type === "polyline");
  ok(polyline, "hay una polilínea");
  if (polyline?.type === "polyline") {
    eq(polyline.closed, true, "cerrada, como pidió la rutina con el código 70");
    eq(polyline.vertices.length, 4, "con sus cuatro vértices");
    eq(polyline.vertices[2].x, 420, "el vértice opuesto en X está donde se dijo");
    eq(polyline.vertices[2].y, 297, "y en Y también");
    eq(polyline.layer, "CAJETIN", "en la capa que la rutina nombró, no en la activa");
  }
  const mtext = studio.document.entities.find((entity) => entity.type === "mtext");
  ok(mtext?.type === "mtext" && mtext.text === "VALLE DESIGN", "y el texto es el escrito");
}

// --- 2. veinte entmake siguen siendo UN paso de deshacer --------------------------
{
  const studio = new FakeStudio();
  studio.lisp.runtime.load(
    "muchas.lsp",
    `(defun c:MUCHAS ( / i)
       (setq i 0)
       (repeat 20
         (entmake (list (cons 0 "CIRCLE") (cons 8 "0") (list 10 (float i) 0.0 0.0) (cons 40 1.0)))
         (setq i (1+ i))))`,
  );
  studio.type("MUCHAS");
  eq(studio.document.entities.length, 20, "veinte círculos");
  eq(
    studio.undoSteps.length,
    1,
    "y UN paso de deshacer: la frontera es la rutina, no la escritura",
  );
}

// --- 3. un nativo siempre gana ----------------------------------------------------
{
  const studio = new FakeStudio();
  studio.lisp.runtime.load("secuestro.lsp", `(defun c:LINE () (princ "secuestrado"))`);
  const descriptor = studio.lisp.registry.get("LINE");
  eq(descriptor?.kind, "draw", "LINE sigue siendo el comando de dibujo nativo");
  eq(
    studio.lisp.registry.shadowedCommands(),
    ["LINE"],
    "y la rutina que intentó taparlo se reporta como inalcanzable",
  );
  // Reportarlo por una API que nadie llama es lo mismo que no reportarlo. Tiene
  // que llegar al usuario, y por partida doble: en el histórico al cargar y en
  // la lista de rutinas. Con 96 comandos nativos y subiendo, que una rutina de
  // estudio se llame como uno de ellos ha dejado de ser improbable.
  eq(
    studio.lisp.runtime.getSnapshot().shadowedByNative,
    ["LINE"],
    "la consola publica qué rutinas quedan tapadas por un nativo",
  );
  ok(
    studio.lisp.runtime
      .getSnapshot()
      .transcript.some((entry) => entry.level === "error" && /LINE/.test(entry.text) && /nativo/i.test(entry.text)),
    "y al cargarla se avisa en el acto, en vez de dejar una rutina muda",
  );
  ok(
    !studio.lisp.runtime.getSnapshot().commands.includes("NOEXISTE"),
    "el inventario sólo lista lo que la biblioteca declara de verdad",
  );
}

// --- 4. una expresión suelta se evalúa y devuelve su valor ------------------------
{
  const studio = new FakeStudio();
  eq(messages(studio.type("(+ 1 2)")), ["3"], "escribir (+ 1 2) responde 3");
  eq(
    messages(studio.type('(strcat "Hola " "mundo")')),
    ['"Hola mundo"'],
    "y las mayúsculas de las CADENAS se respetan pese a que el motor normalice el nombre",
  );
  eq(studio.undoSteps.length, 0, "evaluar una expresión pura no abre ningún paso de deshacer");

  // La variable sobrevive de una pulsación a la siguiente: sin eso, no es consola.
  studio.type("(setq ancho 300)");
  eq(messages(studio.type("(* ancho 2)")), ["600"], "una variable tecleada persiste");
  ok(
    studio.lisp.runtime.getSnapshot().variables.some((variable) => variable.name === "ANCHO"),
    "y la consola la enseña",
  );
}

// --- 5. una rutina que PREGUNTA se conduce desde la línea de comandos -------------
{
  const studio = new FakeStudio();
  studio.lisp.runtime.load(
    "dospuntos.lsp",
    `(defun c:DOSPUNTOS ( / a b)
       (setq a (getpoint "Primer punto"))
       (setq b (getpoint "Segundo punto"))
       (entmake (list (cons 0 "LINE") (cons 8 "0") (cons 10 a) (cons 11 b))))`,
  );
  const started = studio.type("DOSPUNTOS");
  eq(prompts(started), ["Primer punto"], "el prompt del autor de la rutina llega a la línea");
  ok(studio.busy, "y el comando queda activo esperando");

  studio.type("0,0");
  const finished = studio.type("100,50");
  eq(executes(finished), 1, "el segundo punto remata la rutina");
  eq(studio.undoSteps.length, 1, "en un solo paso de deshacer");
  const line = studio.document.entities[0];
  ok(line?.type === "line", "y lo que quedó es una línea");
  if (line?.type === "line") {
    eq(line.start, { x: 0, y: 0, z: 0 }, "del primer punto tecleado…");
    eq(line.end, { x: 100, y: 50, z: 0 }, "…al segundo");
  }
}

// --- 6. Esc a mitad de una rutina no deja nada escrito ----------------------------
{
  const studio = new FakeStudio();
  studio.lisp.runtime.load(
    "amedias.lsp",
    `(defun c:AMEDIAS ( / a)
       (entmake (list (cons 0 "CIRCLE") (cons 8 "0") (list 10 0.0 0.0 0.0) (cons 40 3.0)))
       (setq a (getpoint "Un punto"))
       (entmake (list (cons 0 "CIRCLE") (cons 8 "0") (cons 10 a) (cons 40 3.0))))`,
  );
  studio.type("AMEDIAS");
  studio.cancel();
  eq(
    studio.document.entities.length,
    0,
    "cancelar descarta TAMBIÉN lo que la rutina ya había escrito: el lote nunca se emitió",
  );
  eq(studio.undoSteps.length, 0, "y no hay ningún paso de deshacer que limpiar");
  ok(!studio.busy, "el motor queda libre para el comando siguiente");

  // El motor atiende el Esc por su cuenta y NO vuelve a llamar al comando, así
  // que la rutina se queda suspendida sin enterarse. Se cierra al empezar la
  // siguiente: sin esto quedaría un generador vivo y reanudable, y la consola
  // diría «ejecutando» para siempre.
  eq(messages(studio.type("(+ 1 1)")), ["2"], "la siguiente ejecución funciona…");
  eq(studio.lisp.runtime.getSnapshot().running, null, "…y la consola ya no dice que hay nada en curso");
  ok(
    studio.lisp.runtime
      .getSnapshot()
      .transcript.some((entry) => /se abandonó sin terminar/.test(entry.text)),
    "y queda dicho que la anterior se abandonó, en vez de desaparecer sin rastro",
  );
}

// --- 7. `command` encadenado sobre comandos NATIVOS -------------------------------
{
  const studio = new FakeStudio();
  studio.lisp.runtime.load(
    "encadena.lsp",
    `(defun c:ENCADENA ()
       (command "LINE" '(0.0 0.0) '(100.0 0.0) "")
       (command "CIRCLE" '(50.0 0.0) 25.0)
       (princ "encadenado"))`,
  );
  studio.type("ENCADENA");
  eq(studio.undoSteps.length, 1, "dos comandos nativos encadenados siguen siendo UN paso");
  eq(studio.document.entities.length, 2, "y dejaron dos entidades");
  ok(
    studio.document.entities.some((entity) => entity.type === "line"),
    "la línea que pidió el primer command",
  );
  const circle = studio.document.entities.find((entity) => entity.type === "circle");
  ok(circle?.type === "circle" && circle.radius === 25, "y el círculo con su radio exacto");
}

// --- 8. ADVERSARIAL: el sandbox aguanta y lo dice ---------------------------------
{
  const studio = new FakeStudio();

  // Recursión infinita.
  studio.lisp.runtime.load("hostil.lsp", `(defun bucle () (bucle)) (defun c:RECURSE () (bucle))`);
  const recursed = messages(studio.type("RECURSE"));
  ok(recursed.length === 1 && /^; error: /.test(recursed[0]), "la recursión infinita se corta…");
  ok(/recursión|marcos de llamada/i.test(recursed[0]), "…diciendo que fue la recursión");
  eq(studio.undoSteps.length, 0, "sin escribir nada en el dibujo");
  ok(!studio.busy, "y sin dejar el motor colgado con un prompt vivo");

  // El motor sigue vivo después: es la mitad que importa de «aguantar».
  eq(messages(studio.type("(+ 2 2)")), ["4"], "el comando siguiente funciona con normalidad");

  // Lista de diez millones de elementos.
  studio.lisp.runtime.load(
    "gorda.lsp",
    `(defun c:GORDA ( / l i) (setq l nil i 0) (while (< i 10000000) (setq l (cons i l) i (1+ i))) l)`,
  );
  const fat = messages(studio.type("GORDA"));
  ok(fat.length === 1 && /^; error: /.test(fat[0]), "la lista de diez millones no se construye");
  ok(/presupuesto/.test(fat[0]), "y el corte se explica como presupuesto agotado");
  const trace = studio.lisp.runtime.getSnapshot().lastTrace;
  ok(trace?.kind === "abort", "la traza dice que fue un aborto");
  ok(
    trace?.reason === "cells" || trace?.reason === "steps" || trace?.reason === "time",
    "y qué límite se agotó, en vez de un «falló algo»",
  );

  // entmake con datos inválidos.
  studio.lisp.runtime.load(
    "invalida.lsp",
    `(defun c:INVALIDA () (entmake (list (cons 0 "LINE") (cons 8 "0") (cons 10 "no soy un punto"))))`,
  );
  const invalid = messages(studio.type("INVALIDA"));
  ok(invalid.length === 1 && /^; error: /.test(invalid[0]), "un entmake con basura falla…");
  eq(studio.document.entities.length, 0, "…y no deja media entidad en el documento");

  // Una rutina que redefine una función del sistema.
  studio.lisp.runtime.load("redefine.lsp", `(defun c:ROMPE () (defun car (x) 99) (car '(1 2)))`);
  eq(messages(studio.type("ROMPE")), ["99"], "redefinir car funciona DENTRO de la rutina…");
  ok(
    studio.lisp.runtime.getSnapshot().variables.some((v) => v.name === "CAR" && v.shadowsBuiltin),
    "…la consola marca que tapa un builtin…",
  );
  studio.lisp.runtime.resetVariables();
  eq(
    messages(studio.type("(car '(7 8))")),
    ["7"],
    "…y olvidar las variables devuelve el `car` de siempre: el editor nunca estuvo en juego",
  );
}

// --- 9. APPLOAD y la consola abren la paleta --------------------------------------
{
  const studio = new FakeStudio();
  eq(studio.lisp.runtime.getSnapshot().open, false, "la consola arranca cerrada");
  studio.type("APPLOAD");
  eq(studio.lisp.runtime.getSnapshot().open, true, "APPLOAD la abre");
  eq(
    studio.lisp.runtime.getSnapshot().filePickerRequest,
    1,
    "y pide el selector de fichero, que es a lo que se viene",
  );
  studio.lisp.runtime.close();
  studio.type("AP");
  eq(studio.lisp.runtime.getSnapshot().open, true, "su alias de acad.pgp también");
  studio.lisp.runtime.close();
  studio.type("LISPCON");
  eq(studio.lisp.runtime.getSnapshot().open, true, "y LISPCON abre la consola sin pedir fichero");
  eq(studio.lisp.runtime.getSnapshot().filePickerRequest, 2, "sin sumar otra petición de fichero");
}

// --- 10. sin dibujo abierto se dice que no, en vez de reventar --------------------
{
  const orphan = createCadLispAttachment({ identity: () => ({ tenantId: "estudio" }) });
  const created = orphan.runtime.createRun("(+ 1 2)", "consola");
  ok("problem" in created, "sin editor atado, ejecutar se niega…");
  ok(
    "problem" in created && /no está atado/.test(created.problem),
    "…nombrando exactamente lo que falta",
  );
}

console.log(
  `lisp-enchufe: ${checks} aserciones verdes. Una rutina .lsp cargada se teclea como un nativo, ` +
    `su geometría sale por UN efecto execute (UN paso de deshacer, contado), los nativos ganan ` +
    `siempre, las expresiones sueltas se evalúan con las cadenas intactas, getpoint se conduce ` +
    `desde la línea de comandos, Esc no deja nada escrito, y el sandbox aguanta recursión ` +
    `infinita, diez millones de celdas, entmake inválido y la redefinición de car — fallando ` +
    `con un mensaje y dejando el motor listo para el comando siguiente.`,
);
