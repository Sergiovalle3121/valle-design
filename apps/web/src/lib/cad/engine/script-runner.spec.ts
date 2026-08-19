/**
 * SCRIPT (.scr) y variantes `-COMANDO`: un guión de despacho SIN INTERFAZ.
 *
 * ## Qué se afirma aquí y por qué es lo que importa
 *
 * Un despacho con veinte años de oficio no tiene «scripts»: tiene guiones que
 * normalizan la tabla de capas del archivo que acaba de llegar, que configuran
 * un dibujo recién abierto y que trazan un juego entero de láminas. Ninguno de
 * ellos tiene a nadie delante pulsando botones. Así que la afirmación que esta
 * spec cierra no es «el analizador trocea renglones» —eso lo pasa cualquier
 * troceador— sino ésta: **un `.scr` real entra por un lado y sale un DOCUMENTO
 * por el otro, sin anfitrión, sin React y sin un solo clic.**
 *
 * El motor, el registro, la tabla de capas y el ejecutor de lotes son los de
 * producción. Lo único que no hay aquí es interfaz, que es exactamente el
 * punto.
 *
 * ## Las cuatro cosas que se comprueban
 *
 * 1. **Ejecución de verdad.** Un guión de plantilla dibuja, configura y
 *    renombra; se afirman las entidades, sus coordenadas, su capa y las
 *    variables que quedaron escritas.
 * 2. **Las variantes `-COMANDO`.** Cuáles existen como comando PROPIO, cuáles
 *    resuelven al mismo comando por quitarse el guion, y cuáles abrirían un
 *    cuadro. La última lista se compara con el registro DE VERDAD para que no
 *    pueda envejecer en silencio.
 * 3. **Fallo cerrado.** Los cinco modos de fallo, cada uno con su código y con
 *    el número de renglón. Un guión que se atasca no deja el documento a
 *    medias sin decirlo.
 * 4. **Un solo formato.** El mismo guión ejecutado por el camino del editor
 *    vivo y por el camino sin interfaz produce el mismo dibujo.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import {
  CAD_DIALOG_COMMANDS,
  CAD_SCRIPT_LINE_ALTERNATIVE,
  CadScriptError,
  runCadScript,
  type CadScriptFailureCode,
} from "../script-runner";
import { CadSystemVariableStore } from "../system-variables";
import { CAD_COMMAND_REGISTRY_V2 } from "./index";
import {
  cadCommandEngineReduce,
  EMPTY_CAD_COMMAND_ENGINE,
  type CadCommandEngineState,
} from "./command-engine";
import { asCadCommand, CAD_ACCEPT_TEXT, type CadCommandContext } from "./command-types";
import { createCadCommandRegistry } from "./registry";
import { cadCommandsNeedingInterface, executeCadScript } from "./script-runner";

/** Estado del comando que se atasca: constante, para que sea el MISMO objeto. */
const STALLED_STATE = { nada: true } as const;

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
function deep(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.deepEqual(actual, expected, what);
}

const registry = CAD_COMMAND_REGISTRY_V2;

function emptyDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "muro", name: "MURO", color: "#ff0000", visible: true, locked: false },
      { id: "texto", name: "texto", color: "#00ff00", visible: true, locked: false },
    ],
  });
}

/** Contexto mínimo para PREGUNTARLE al registro, no para ejecutar. */
const probeContext: CadCommandContext = {
  entityIds: [],
  selection: [],
  activeLayer: "0",
  view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
  newEntityId: () => "probe",
};

// ---------------------------------------------------------------------------
// 1. UN GUIÓN DE ESTUDIO, EJECUTADO SIN INTERFAZ
// ---------------------------------------------------------------------------

/**
 * Es un `.scr` real, con sus comentarios y su renglón en blanco donde hace
 * falta: normaliza la capa que llegó del cliente, fija la escala de tipo de
 * línea del estudio, apaga el orto y dibuja el arranque de un muro.
 */
const PLANTILLA = `; Plantilla del estudio — normaliza y arranca.
RENAME
Capa
MURO
A-MURO

-LAYER
definir
A-MURO

LTSCALE
50

-DSETTINGS
Orto
DEsactivar

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
  const run = executeCadScript(PLANTILLA, { registry, document: emptyDocument() });

  // --- lo que el guión DIBUJÓ ---------------------------------------------
  equal(run.document.entities.length, 3, "el guión ha dibujado TRES objetos");

  const line = run.document.entities.find((entity) => entity.type === "line");
  ok(line !== undefined, "hay una LÍNEA");
  if (line?.type === "line") {
    near(line.start.x, 0, 1e-9, "arranca en el origen");
    near(line.end.x, 1000, 1e-9, "y llega a 1000");
    // La capa se llama así porque el PROPIO guión la renombró y luego la puso
    // actual. Es la prueba de que las variantes sin cuadro no son decorativas.
    equal(line.layer, "A-MURO", "y está en la capa que el guión renombró y puso actual");
  }

  const circle = run.document.entities.find((entity) => entity.type === "circle");
  ok(circle !== undefined, "hay un CÍRCULO");
  if (circle?.type === "circle") {
    near(circle.center.x, 500, 1e-9, "centrado donde dice el guión");
    near(circle.center.y, 300, 1e-9, "en las dos coordenadas");
    near(circle.radius, 120, 1e-9, "con el radio pedido");
    equal(circle.layer, "A-MURO", "también en A-MURO");
  }

  const rectangle = run.document.entities.find((entity) => entity.type === "polyline");
  ok(rectangle !== undefined, "hay un RECTÁNGULO");
  if (rectangle?.type === "polyline") {
    equal(rectangle.closed, true, "cerrado, como debe ser un rectángulo");
    equal(rectangle.vertices.length, 4, "con cuatro vértices");
  }

  // --- lo que el guión CONFIGURÓ ------------------------------------------
  equal(run.variables.get("LTSCALE"), 50, "LTSCALE quedó en 50, puesta por el guión");
  equal(run.variables.get("CLAYER"), "A-MURO", "y la capa actual, en la renombrada");
  equal(run.variables.get("ORTHOMODE"), 0, "-DSETTINGS apagó el orto sin abrir el cuadro");

  // --- lo que el guión RENOMBRÓ -------------------------------------------
  const names = run.document.layers.map((layer) => layer.name).sort();
  ok(names.includes("A-MURO"), "la capa nueva existe");
  ok(!names.includes("MURO"), "y la vieja ya no");
  const renamed = run.document.layers.find((layer) => layer.name === "A-MURO");
  equal(renamed?.color, "#ff0000", "renombrar CONSERVA el color: no es crear otra capa");

  // --- una frontera de deshacer por COMANDO, no por entidad ---------------
  equal(
    run.changes.filter((label) => label.startsWith("LINE")).length,
    1,
    "un LINE de un tramo deja UNA entrada de historia",
  );
  ok(
    run.changes.some((label) => label.includes('RENAME: capa "MURO" → "A-MURO"')),
    `el renombrado es UN lote etiquetado: ${run.changes.join(" | ")}`,
  );
  ok(run.commands.includes("RENAME"), "el informe nombra los comandos que corrieron");
  ok(run.commands.includes("-LAYER"), "incluidas las variantes con guion");
  ok(run.executed > 20, `se entregaron ${run.executed} renglones`);
}

// ---------------------------------------------------------------------------
// 2. LOS DOS CAMINOS DAN EL MISMO DIBUJO
// ---------------------------------------------------------------------------

/**
 * Anfitrión mínimo montado sobre el motor de verdad: es el camino del editor
 * vivo, sin React ni escena. Existe para poder comparar los dos ejecutores.
 */
class ScriptHost {
  document: CadDocument;
  private state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  private ids = 0;
  readonly variables = new CadSystemVariableStore();

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
      document: () => this.document,
      selection: [],
      activeLayer: this.document.layers.some((layer) => layer.name === clayer) ? clayer : "0",
      variables: this.variables,
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `e${(this.ids += 1)}`,
    };
  }

  private dispatch(action: Parameters<typeof cadCommandEngineReduce>[1]): void {
    const reduction = cadCommandEngineReduce(this.state, action, this.context(), registry);
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
    }
  }

  submit(token: string): void {
    this.dispatch({ kind: "token", value: token });
  }

  accept(): void {
    this.dispatch({ kind: "input", input: { kind: "enter" } });
  }
}

{
  const host = new ScriptHost(emptyDocument());
  const report = runCadScript(PLANTILLA, host);
  const headless = executeCadScript(PLANTILLA, { registry, document: emptyDocument() });

  equal(report.failures.length, 0, `el camino del editor no da fallos: ${report.warnings.join(" | ")}`);
  equal(report.unfinished, false, "y no deja ningún comando a medias");
  // El contenido, no los identificadores: los dos ejecutores los generan por su
  // cuenta y compararlos sólo mediría que ambos cuentan desde uno.
  const shape = (document: CadDocument) =>
    document.entities
      .map((entity) => `${entity.type}@${entity.layer}`)
      .sort()
      .join(" ");
  equal(
    shape(host.document),
    shape(headless.document),
    "el mismo .scr da el mismo dibujo por los dos caminos",
  );
  equal(
    host.document.layers.map((layer) => layer.name).sort().join(","),
    headless.document.layers.map((layer) => layer.name).sort().join(","),
    "y la misma tabla de capas",
  );
  equal(host.variables.get("CLAYER"), headless.variables.get("CLAYER"), "y la misma capa actual");
}

// ---------------------------------------------------------------------------
// 3. EL INVENTARIO DE VARIANTES -COMANDO
// ---------------------------------------------------------------------------

/**
 * Las que son COMANDO PROPIO: el registro las encuentra por su nombre literal,
 * guion incluido, y hacen otra cosa que la orden sin guion (que abre un cuadro).
 */
{
  const own = ["-LAYER", "-LINETYPE", "-OSNAP", "-UCSMAN", "-TOOLPALETTES", "-DSETTINGS"];
  for (const name of own) {
    equal(registry.get(name)?.name, name, `${name} es un comando propio, no un alias del sin guion`);
    const bare = name.slice(1);
    ok(
      registry.get(bare)?.name === bare,
      `${bare} sigue existiendo por separado: es el que abre el cuadro`,
    );
    ok(
      registry.get(name)?.name !== registry.get(bare)?.name,
      `${name} y ${bare} son comandos DISTINTOS, como en AutoCAD`,
    );
  }
  // `-DSETTINGS` es el que faltaba, y su ausencia era una TRAMPA: sin él,
  // escribir la forma con guion resolvía al cuadro por quitarse el prefijo, así
  // que el guión se colgaba justo cuando su autor había hecho lo correcto.
  equal(registry.get("-DSETTINGS")?.name, "-DSETTINGS", "-DSETTINGS ya no cae en el cuadro");
  equal(registry.get("-DS")?.name, "-DSETTINGS", "y su alias corto también");
}

/**
 * Las que NO necesitan comando propio: la orden sin guion ya pregunta por la
 * línea, así que `-X` resuelve a `X` y hace lo mismo. Escribirlas con guion es
 * memoria muscular y tiene que funcionar igual.
 */
{
  const resolves: Readonly<Record<string, string>> = {
    "-PLOT": "PLOT",
    "-INSERT": "INSERT",
    "-STYLE": "STYLE",
    "-DIMSTYLE": "DIMSTYLE",
    "-PURGE": "PURGE",
    "-VIEW": "VIEW",
    "-LAYOUT": "LAYOUT",
    "-GROUP": "GROUP",
    "-XREF": "XREF",
    "-ARRAY": "ARRAY",
    "-TEXT": "TEXT",
    "-MTEXT": "MTEXT",
    "-UNITS": "UNITS",
    "-COLOR": "COLOR",
    "-OVERKILL": "OVERKILL",
    "-BLOCK": "BLOCK",
    "-WBLOCK": "WBLOCK",
    "-HATCH": "HATCH",
    "-BOUNDARY": "BOUNDARY",
    "-EXPORT": "EXPORT",
    "-ATTEDIT": "ATTEDIT",
    "-IMAGE": "IMAGE",
    "-TABLE": "TABLE",
    "-RENAME": "RENAME",
  };
  for (const [dashed, canonical] of Object.entries(resolves))
    equal(registry.get(dashed)?.name, canonical, `${dashed} resuelve a ${canonical}`);
}

/**
 * Las que ABREN UN CUADRO en su primer paso. La tabla escrita a mano de
 * `lib/cad/script-runner.ts` se compara con el registro de VERDAD: si mañana
 * alguien añade una paleta y no la apunta, esta comparación lo dice.
 */
{
  const real = cadCommandsNeedingInterface(registry, probeContext);
  deep(
    [...real].sort(),
    [...CAD_DIALOG_COMMANDS].sort(),
    `la tabla de comandos con cuadro está desfasada: el registro dice ${real.join(", ")}`,
  );
  // Y el consejo que se da tiene que existir: mandar a alguien a teclear un
  // comando inventado es peor que no decir nada.
  for (const [dialog, alternatives] of Object.entries(CAD_SCRIPT_LINE_ALTERNATIVE))
    for (const alternative of alternatives)
      equal(
        registry.get(alternative)?.name,
        alternative,
        `el consejo para ${dialog} nombra ${alternative}, que tiene que existir`,
      );
  // Los dos que NO tienen alternativa por la línea lo declaran vacío, en vez de
  // inventar un `-OPTIONS` o un `-PROPERTIES` que AutoCAD tampoco tiene.
  deep(CAD_SCRIPT_LINE_ALTERNATIVE.SCRIPT, [], "un guión no puede llamar a otro guión");
  deep(CAD_SCRIPT_LINE_ALTERNATIVE.OPTIONS, ["SETVAR"], "las opciones son variables: SETVAR");
  deep(CAD_SCRIPT_LINE_ALTERNATIVE.PROPERTIES, ["LIST"], "las propiedades se leen con LIST");
}

// ---------------------------------------------------------------------------
// 4. FALLO CERRADO: LOS CINCO MODOS, CON SU RENGLÓN
// ---------------------------------------------------------------------------

/** Ejecuta esperando que reviente, y devuelve el error tipado. */
function failing(source: string): CadScriptError {
  try {
    executeCadScript(source, { registry, document: emptyDocument() });
  } catch (cause) {
    if (cause instanceof CadScriptError) return cause;
    throw cause;
  }
  throw new Error(`el guión debía fallar y no falló:\n${source}`);
}

function failsWith(source: string, code: CadScriptFailureCode, line: number, what: string) {
  const error = failing(source);
  equal(error.code, code, `${what}: código`);
  equal(error.line, line, `${what}: renglón`);
  ok(error.message.startsWith(`Línea ${line}`), `${what}: el mensaje empieza por el renglón`);
  ok(error instanceof Error, `${what}: sigue siendo un Error, capturable como tal`);
  return error;
}

// Un comando que no existe para el guión en el renglón tres.
failsWith(
  "LINE\n0,0\n10,0\n\nNOEXISTE\n",
  "unknown-command",
  5,
  "un comando inventado",
);

// El comando en curso rechaza lo que trae el renglón: LINE pide un punto y
// recibe una palabra que no es ninguna de sus opciones.
failsWith("LINE\n0,0\nesto-no-es-un-punto\n", "rejected", 3, "una coordenada ilegible");

// Un cuadro: LAYER a secas abriría el gestor y el guión esperaría un clic.
{
  const error = failsWith("LAYER\nMURO\n", "needs-interface", 1, "un comando con cuadro");
  ok(error.message.includes("-LAYER"), "y el mensaje nombra la variante que sí funciona");
  equal(error.command, "LAYER", "el error dice qué comando era");
}

// El archivo termina con un comando a medias: el renglón que se señala es donde
// EMPEZÓ el comando, que es el que hay que arreglar.
{
  const error = failsWith("CIRCLE\n0,0\n50\n\nLINE\n0,0\n10,0", "unfinished", 5, "un LINE sin cerrar");
  ok(
    error.message.includes("se queda sin lo que ese comando iba a dibujar"),
    "y explica qué le pasa al documento, que es lo que nadie ve",
  );
  equal(error.command, "LINE", "nombrando el comando que quedó abierto");
}

// El guión no avanza. La mayoría de los rechazos salen como mensaje de error
// —y se ven—, pero un comando puede repreguntar SIN quejarse: devuelve el mismo
// paso y el guión se queda dando vueltas hasta que se acaba el archivo. Se
// monta un comando que hace exactamente eso, porque es la única forma de
// afirmar el guardián sin depender de que un comando de producción tenga hoy
// ese defecto.
{
  const stalling = asCadCommand<{ nada: true }>({
    name: "ATASCO",
    aliases: [],
    kind: "manage",
    transparent: false,
    selection: "none",
    repeatable: false,
    mutates: false,
    cursor: "none",
    begin: () => ({
      state: STALLED_STATE,
      prompt: { message: "Precise algo que nunca acepto", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    }),
    // Mismo objeto de estado y ningún resultado: no avanza y no protesta.
    step: (state) => ({
      state,
      prompt: { message: "Precise algo que nunca acepto", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    }),
  });
  const withStall = createCadCommandRegistry([...registry.all(), stalling]);
  let caught: CadScriptError | null = null;
  try {
    executeCadScript("ATASCO\nuno\ndos\n", { registry: withStall, document: emptyDocument() });
  } catch (cause) {
    caught = cause instanceof CadScriptError ? cause : null;
  }
  ok(caught !== null, "un comando que no avanza para el guión");
  equal(caught?.code, "stalled", "con su propio código");
  equal(caught?.line, 2, "y en el PRIMER renglón que no hizo nada, no en el último");
  ok(
    (caught?.message ?? "").includes("no ha avanzado"),
    "diciendo que el comando sigue esperando lo mismo",
  );
}

// Y lo que NO es fallo: un guión correcto no lanza aunque toque el documento.
{
  const clean = executeCadScript("CIRCLE\n0,0\n50\n", { registry, document: emptyDocument() });
  equal(clean.document.entities.length, 1, "un guión bien escrito no lanza nada");
}

// ---------------------------------------------------------------------------
// 5. EL DOCUMENTO DE ENTRADA NO SE TOCA
// ---------------------------------------------------------------------------

{
  const original = emptyDocument();
  const before = original.entities.length;
  const run = executeCadScript("CIRCLE\n0,0\n50\n", { registry, document: original });
  equal(original.entities.length, before, "el documento de entrada queda intacto");
  equal(run.document.entities.length, 1, "y el resultado viaja aparte");

  // Un guión que revienta a mitad tampoco lo toca: quien lo ejecuta compara con
  // el punto de partida y decide, y no podría si el original ya no existiera.
  const partial = emptyDocument();
  try {
    executeCadScript("CIRCLE\n0,0\n50\n\nNOEXISTE\n", { registry, document: partial });
    throw new Error("debía fallar");
  } catch (cause) {
    ok(cause instanceof CadScriptError, "falla con el error tipado");
  }
  equal(partial.entities.length, 0, "y el documento de partida sigue vacío");
}

// ---------------------------------------------------------------------------
// 6. LO QUE UN GUIÓN NO PUEDE HACER SOLO: SE PIDE, NO SE FINGE
// ---------------------------------------------------------------------------

{
  // Un juego de láminas se traza desde un guión, pero escribir el PDF es del
  // anfitrión. La petición viaja en el informe: ni se ejecuta a ciegas ni se
  // cuenta como hecha.
  const run = executeCadScript("CIRCLE\n0,0\n50\nDXFOUT\nTodo\nplanta\n", {
    registry,
    document: emptyDocument(),
  });
  equal(run.hostRequests.length, 1, "el guión deja UNA petición al anfitrión");
  equal(run.hostRequests[0].kind, "dxf-export", "y es la exportación que pidió");
  ok(
    run.hostRequests[0].kind === "dxf-export" && run.hostRequests[0].content.includes("SECTION"),
    "con el contenido ya calculado: lo que falta es la descarga, no el archivo",
  );
}

// ---------------------------------------------------------------------------
// 7. LAS REGLAS DEL FORMATO SIGUEN SIENDO LAS MISMAS
// ---------------------------------------------------------------------------

{
  // Un renglón EN BLANCO es un Enter y por eso el LINE se cierra; el `;` es un
  // comentario y no llega al motor. Las dos reglas juntas en un guión corto.
  const run = executeCadScript(
    "; dos tramos y cierre\nLINE\n0,0\n100,0\n200,100\n\n; fin\n",
    { registry, document: emptyDocument() },
  );
  equal(run.document.entities.length, 2, "un LINE de dos tramos deja DOS segmentos");
  equal(run.changes.length, 1, "pero UN solo lote: deshacerlo es un Ctrl+Z, no dos");
  ok(run.commands.includes("LINE"), "y el comando figura como terminado");
}

console.log(
  `script-runner.spec (motor): ${checks} comprobaciones verdes; ` +
    `${CAD_DIALOG_COMMANDS.length} comandos con cuadro declarados, ` +
    `${registry.all().length} comandos en el registro.`,
);
