/**
 * SCRIPT: un `.scr` que dibuja de verdad.
 *
 * ## Por qué esta spec vale por todas las demás de esta fase
 *
 * Un analizador de scripts que trocea renglones y no los ejecuta pasa cualquier
 * prueba de troceo. La prueba de que la automatización SIRVE es otra: coger un
 * `.scr` que dibuja tres cosas, pasarlo por el motor real y afirmar el
 * DOCUMENTO que sale — tres entidades, con sus coordenadas, en su capa.
 *
 * El anfitrión que se monta aquí es de mentira sólo en lo accesorio (no hay
 * React ni escena). El motor, el registro de comandos, el ejecutor de lotes y
 * el documento son los de producción: si el script no dibujara, esta spec
 * fallaría.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "./cad-document";
import {
  cadCommandEngineReduce,
  EMPTY_CAD_COMMAND_ENGINE,
  type CadCommandEngineState,
} from "./engine/command-engine";
import type { CadCommandContext } from "./engine/command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import { executeCadEntityCommandBatch } from "./entity-commands";
import {
  CAD_DIALOG_COMMANDS,
  CadScriptError,
  cadScriptLineAdvice,
  parseCadScript,
  runCadScript,
} from "./script-runner";
import { CadSystemVariableStore } from "./system-variables";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

// ---------------------------------------------------------------------------
// El analizador
// ---------------------------------------------------------------------------

{
  const lines = parseCadScript("LINE\n0,0\n10,0\n\n; un comentario suelto\nCIRCLE ; y uno al final\n");
  assert.deepEqual(
    lines.map((line) => line.token),
    ["LINE", "0,0", "10,0", "", "CIRCLE"],
    "una línea EN BLANCO sobrevive: en un script es un Enter, no un renglón que sobra",
  );
  checks += 1;
  equal(lines[4].line, 6, "cada renglón recuerda su número, para poder señalar el que falla");
}
// El último salto del archivo es un artefacto del editor y se descarta; los
// demás renglones vacíos SON Enter, y descartarlos dejaba el comando a medias.
equal(parseCadScript("LINE\n").length, 1, "el salto final del archivo no es un Enter");
assert.deepEqual(
  parseCadScript("LINE\n\n\n").map((line) => line.token),
  ["LINE", "", ""],
  "pero dos renglones en blanco de verdad sí lo son",
);
checks += 1;
equal(parseCadScript("").length, 0, "un archivo vacío no ejecuta nada");
ok(CAD_DIALOG_COMMANDS.includes("LAYER"), "LAYER está fichado como comando con diálogo");

// ---------------------------------------------------------------------------
// Un anfitrión mínimo montado sobre el motor DE VERDAD
// ---------------------------------------------------------------------------

class ScriptHost {
  document: CadDocument;
  private state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  private ids = 0;
  readonly variables = new CadSystemVariableStore();
  readonly messages: string[] = [];

  constructor(document: CadDocument) {
    this.document = document;
  }

  get busy(): boolean {
    return this.state.active !== null;
  }

  private context(): CadCommandContext {
    const byId = new Map(this.document.entities.map((entity) => [entity.id, entity]));
    const clayer = String(this.variables.get("CLAYER") ?? "0");
    return {
      entityIds: this.document.entities.map((entity) => entity.id),
      entity: (entityId) => byId.get(entityId),
      layers: () => this.document.layers,
      selection: [],
      activeLayer: this.document.layers.some((layer) => layer.name === clayer) ? clayer : "0",
      variables: this.variables,
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `s${(this.ids += 1)}`,
    };
  }

  submit(token: string): void {
    const reduction = cadCommandEngineReduce(
      this.state,
      { kind: "token", value: token },
      this.context(),
      CAD_COMMAND_REGISTRY_V2,
    );
    this.state = reduction.state;
    for (const effect of reduction.effects) {
      if (effect.kind === "execute")
        this.document = executeCadEntityCommandBatch(
          this.document,
          effect.commands,
          effect.label,
        ).document;
      if (effect.kind === "variables")
        for (const [name, value] of Object.entries(effect.patch))
          if (effect.system) this.variables.publish(name, value);
          else this.variables.set(name, value);
      if (effect.kind === "message") this.messages.push(effect.text);
    }
  }

  accept(): void {
    const reduction = cadCommandEngineReduce(
      this.state,
      { kind: "input", input: { kind: "enter" } },
      this.context(),
      CAD_COMMAND_REGISTRY_V2,
    );
    this.state = reduction.state;
    for (const effect of reduction.effects)
      if (effect.kind === "execute")
        this.document = executeCadEntityCommandBatch(
          this.document,
          effect.commands,
          effect.label,
        ).document;
  }
}

function emptyDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "muros", name: "MUROS", color: "#ff0000", visible: true, locked: false },
    ],
  });
}

// ---------------------------------------------------------------------------
// LA PRUEBA: un .scr dibuja tres cosas y el documento lo demuestra
// ---------------------------------------------------------------------------

const SCRIPT = `; Plantilla del estudio: configura y dibuja el arranque de un muro.
-LAYER
definir
MUROS

LTSCALE
2

LINE
0,0
1000,0

CIRCLE
500,300
120

RECTANG
0,500
1000,800
`;

{
  const host = new ScriptHost(emptyDocument());
  const report = runCadScript(SCRIPT, host);

  equal(report.warnings.length, 0, "un script escrito con las variantes con guion no da avisos");
  equal(report.unfinished, false, "y termina sin dejar ningún comando a medias");
  ok(report.executed > 10, `se ejecutaron ${report.executed} renglones`);

  const entities = host.document.entities;
  equal(entities.length, 3, "el script ha dibujado TRES objetos");

  const line = entities.find((entity) => entity.type === "line");
  ok(line !== undefined, "hay una LÍNEA");
  if (line?.type === "line") {
    near(line.start.x, 0, 1e-9, "arranca en el origen");
    near(line.end.x, 1000, 1e-9, "y llega a 1000");
    // La capa la fijó `-LAYER definir MUROS` DENTRO del script. Es la prueba de
    // que las variantes con guion no son decorativas: sin ellas el script
    // habría abierto un cuadro y se habría quedado ahí.
    equal(line.layer, "MUROS", "y está en la capa que el propio script puso actual");
  }

  const circle = entities.find((entity) => entity.type === "circle");
  ok(circle !== undefined, "hay un CÍRCULO");
  if (circle?.type === "circle") {
    near(circle.center.x, 500, 1e-9, "centrado donde dice el script");
    near(circle.center.y, 300, 1e-9, "en las dos coordenadas");
    near(circle.radius, 120, 1e-9, "con el radio pedido");
    equal(circle.layer, "MUROS", "también en MUROS");
  }

  const rectangle = entities.find((entity) => entity.type === "polyline");
  ok(rectangle !== undefined, "hay un RECTÁNGULO");
  if (rectangle?.type === "polyline") {
    equal(rectangle.closed, true, "cerrado, como debe ser un rectángulo");
    equal(rectangle.vertices.length, 4, "con cuatro vértices");
  }

  // El script también configuró el dibujo, no sólo lo dibujó.
  equal(host.variables.get("LTSCALE"), 2, "LTSCALE quedó en 2, puesto por el script");
  equal(host.variables.get("CLAYER"), "MUROS", "y la capa actual, en MUROS");

  // Y todo ello con UNA transacción por comando, no una por entidad.
  const labels = host.document.history.map((change) => change.label);
  equal(
    labels.filter((label) => label.startsWith("LINE")).length,
    1,
    "un LINE de un tramo deja UNA entrada de historia",
  );
}

// ---------------------------------------------------------------------------
// Rechazos: lo que un script hace mal, y cómo se cuenta
// ---------------------------------------------------------------------------

// Un comando con diálogo se AVISA antes de colgar el script.
{
  const host = new ScriptHost(emptyDocument());
  const report = runCadScript("LAYER\nMUROS\n", host);
  ok(
    report.warnings.some((warning) => warning.includes("-LAYER")),
    `se avisa de que LAYER abre un cuadro y se nombra la variante: ${report.warnings.join(" | ")}`,
  );
  ok(
    report.warnings.some((warning) => warning.includes("Línea 1")),
    "y se dice en qué renglón, que es lo que hace útil el aviso",
  );
}

// Un comando inventado no detiene el script: se cuenta y se sigue.
{
  const host = new ScriptHost(emptyDocument());
  const report = runCadScript("NOEXISTE\nLINE\n0,0\n10,0\n\n", host);
  equal(host.document.entities.length, 1, "la línea de después SÍ se dibuja");
  ok(
    host.messages.some((message) => message.includes("desconocido")),
    "y el comando inventado deja su queja en el diálogo",
  );
  equal(report.unfinished, false, "el script termina limpio");
}

// Un script que se deja un comando a medias lo DICE.
{
  const host = new ScriptHost(emptyDocument());
  const report = runCadScript("LINE\n0,0\n10,0", host);
  equal(report.unfinished, true, "queda un LINE esperando");
  ok(
    report.warnings.some((warning) => warning.includes("Enter")),
    "y se explica que le falta un renglón en blanco al final",
  );
}

// Un sink que revienta PARA el guión, con un fallo tipado y su renglón. Fallo
// cerrado: seguir empujando renglones tras un tropiezo mete la entrada del
// comando siguiente en el anterior, y lo que sale no es «el guión menos una
// línea» sino un dibujo que nadie escribió.
{
  const boom = {
    submit(token: string) {
      if (token === "B") throw new Error("explota");
    },
  };
  const report = runCadScript("A\nB\nC\n", boom);
  equal(report.executed, 1, "sólo se ejecutó el renglón anterior al que falló");
  equal(report.stoppedAtLine, 2, "y el informe dice dónde se paró");
  ok(report.warnings[0].includes("Línea 2"), "el aviso señala el renglón exacto");
  equal(report.failures[0].code, "threw", "el fallo va TIPADO, no sólo redactado");
  equal(report.failures[0].line, 2, "con el número de renglón en un campo, no en el texto");
  ok(report.failures[0] instanceof CadScriptError, "y es un Error de verdad, capturable");

  // Quien de verdad quiere un lote tolerante lo pide, y entonces sabe lo que
  // acepta: los renglones siguientes se ejecutan sobre un estado incierto.
  const tolerant = runCadScript("A\nB\nC\n", boom, { continueOnError: true });
  equal(tolerant.executed, 2, "con `continueOnError` sí siguen los otros dos");
  equal(tolerant.stoppedAtLine, null, "y no hay renglón de parada");
}

// El consejo que se da nombra comandos, no adivinanzas.
{
  ok(
    cadScriptLineAdvice("LAYER").includes("-LAYER"),
    "para LAYER, la variante con guion",
  );
  ok(
    cadScriptLineAdvice("OPTIONS").includes("SETVAR"),
    "para OPTIONS, SETVAR: no existe `-OPTIONS` ni aquí ni en AutoCAD",
  );
  ok(
    cadScriptLineAdvice("SCRIPT").includes("No hay forma"),
    "y cuando no hay alternativa se dice, en vez de inventar una",
  );
}

console.log(`script-runner.spec: ${checks} comprobaciones verdes.`);
