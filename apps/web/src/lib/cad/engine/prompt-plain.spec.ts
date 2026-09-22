/**
 * Contrato fail-closed de la redacción llana, contra los comandos REALES.
 *
 * Lo que se cierra aquí:
 *
 *   1. Cada comando de la barra Esencial (más PLINE) arranca —`begin()` del
 *      descriptor cargado por `loadCadCommand`, como lo hace el editor— con un
 *      primer aviso que tiene redacción llana. Si un comando cambia su
 *      `message`, la tabla deja de encajar y el CI lo dice con su nombre, en
 *      vez de degradar el modo Esencial a texto técnico sin que nadie lo vea.
 *   2. Ninguna clave de la tabla nombra un comando fuera del registro
 *      (patrón de command-summaries.spec.ts): sin cadáveres.
 *   3. En "pro" `formatCadPromptFor` es `formatCadPrompt` byte a byte, para
 *      los prompts literales que fija command-engine.spec.ts y para el primer
 *      paso real de cada comando.
 *   4. En "esencial" el renglón no lleva corchetes, conserva el valor por
 *      defecto entre ángulos y cae al texto del motor cuando no hay llano.
 *
 * Correr: npx tsx src/lib/cad/engine/prompt-plain.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput, CadPrompt } from "./command-types";
import { CAD_COMMAND_REGISTRY_V2, loadCadCommand } from "./index";
import { formatCadPrompt } from "./prompt";
import { CAD_PLAIN_PROMPTS, cadPlainPromptMessage, formatCadPromptFor } from "./prompt-plain";

let checks = 0;
const ok = (condition: boolean, message: string): void => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual: unknown, expected: unknown, message: string): void => {
  assert.equal(actual, expected, message);
  checks += 1;
};

/** Los comandos que la barra Esencial invoca en el motor, más PLINE. */
const ESSENTIAL_COMMANDS = [
  "LINE",
  "PLINE",
  "RECTANG",
  "CIRCLE",
  "WALL",
  "DOOR",
  "WINDOW",
  "TEXT",
  "DIMLINEAR",
  "ERASE",
] as const;

// El contexto mínimo de los specs del motor: sin selección previa, para que
// ERASE pida objetos en vez de borrar de inmediato.
function context(): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `e${++ids}`,
  };
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "pointer",
});

// Los dos renglones que command-engine.spec.ts fija literalmente.
const LITERAL_PROMPTS: readonly CadPrompt[] = [
  {
    message: "Precise el punto siguiente",
    options: [
      { keyword: "Cerrar", shortcut: "C" },
      { keyword: "desHacer", shortcut: "H" },
    ],
  },
  { message: "Precise el radio", options: [], defaultValue: "12.5" },
];

async function main(): Promise<void> {
  // --- 1: cada comando de la barra arranca con redacción llana -------------------
  const firstPrompts = new Map<string, CadPrompt>();
  for (const name of ESSENTIAL_COMMANDS) {
    const command = await loadCadCommand(name);
    const step = command.begin(context());
    firstPrompts.set(name, step.prompt);
    const plain = cadPlainPromptMessage(name, step.prompt) ?? "";
    ok(
      plain !== "",
      `${name}: el primer aviso «${step.prompt.message}» no tiene redacción llana`,
    );
    ok(
      !/^(Precise|Designe|Escriba)\b/.test(plain),
      `${name}: la redacción llana repite el registro técnico («${plain}»)`,
    );
    eq(
      formatCadPromptFor(step.prompt, "pro", name),
      formatCadPrompt(step.prompt),
      `${name}: en "pro" el renglón es el de formatCadPrompt`,
    );
    const esencial = formatCadPromptFor(step.prompt, "esencial", name);
    ok(!esencial.includes("["), `${name}: en "esencial" no hay corchetes («${esencial}»)`);
    ok(esencial.endsWith(": "), `${name}: el renglón llano termina en dos puntos y espacio`);
  }

  // Toda entrada de la tabla, no sólo la primera, es llana y cabe en un renglón.
  for (const [name, entries] of Object.entries(CAD_PLAIN_PROMPTS)) {
    for (const entry of entries) {
      ok(!entry.plain.includes("["), `${name}: «${entry.plain}» lleva corchetes`);
      ok(!/^(Precise|Designe|Escriba)\b/.test(entry.plain), `${name}: «${entry.plain}» no es llano`);
      ok(entry.plain.length <= 90, `${name}: «${entry.plain}» no cabe en la fila del prompt`);
    }
  }

  // --- 2: claves ⊆ registro ----------------------------------------------------------
  const registered = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  const orphans = Object.keys(CAD_PLAIN_PROMPTS).filter((name) => !registered.has(name));
  assert.deepEqual(orphans, [], `redacciones de comandos que no existen: ${orphans.join(", ")}`);
  checks += 1;
  for (const name of ESSENTIAL_COMMANDS)
    ok(name in CAD_PLAIN_PROMPTS, `${name}: la barra Esencial lo invoca y la tabla no lo cubre`);

  // --- 3: "pro" byte a byte -----------------------------------------------------------
  eq(
    formatCadPromptFor(LITERAL_PROMPTS[0], "pro", "LINE"),
    "Precise el punto siguiente o [Cerrar/desHacer]: ",
    "el literal de command-engine.spec.ts no cambia",
  );
  eq(
    formatCadPromptFor(LITERAL_PROMPTS[1], "pro", "CIRCLE"),
    "Precise el radio <12.5>: ",
    "el valor por defecto sigue entre ángulos",
  );
  for (const prompt of LITERAL_PROMPTS)
    eq(formatCadPromptFor(prompt, "pro", null), formatCadPrompt(prompt), "sin comando también es idéntico");

  // El segundo paso real de LINE (con [desHacer]) también es idéntico en "pro".
  {
    const line = await loadCadCommand("LINE");
    const first = line.begin(context());
    const second = line.step(first.state, point(0, 0), context());
    ok(formatCadPrompt(second.prompt).includes("[desHacer]"), "LINE con un vértice ofrece desHacer");
    eq(formatCadPromptFor(second.prompt, "pro", "LINE"), formatCadPrompt(second.prompt), "byte a byte");
    const esencial = formatCadPromptFor(second.prompt, "esencial", "LINE");
    eq(esencial, "Haz clic en el siguiente punto · Enter termina: ", "y en llano dice cómo terminar");
    ok(!esencial.includes("centro"), "el llano de LINE no dice «centro» (golden 120)");
  }

  // --- 4: "esencial" sin corchetes y con el valor por defecto ------------------------
  const rectang = firstPrompts.get("RECTANG");
  assert.ok(rectang, "RECTANG arrancó");
  eq(rectang.options.length, 5, "RECTANG arranca con cinco opciones (Chaflán/Elevación/Empalme/Grosor/ANcho)");
  eq(
    formatCadPromptFor(rectang, "esencial", "RECTANG"),
    "Haz clic en la primera esquina del rectángulo: ",
    "el paso del encargo, sin corchetes",
  );
  eq(
    formatCadPromptFor(LITERAL_PROMPTS[1], "esencial", "CIRCLE"),
    "Escribe el radio o haz clic para fijarlo <12.5>: ",
    "el valor por defecto sobrevive al llano",
  );
  eq(
    formatCadPromptFor(
      { message: "Calcule las dimensiones a partir de", options: [], defaultOption: "Longitud" },
      "esencial",
      "RECTANG",
    ),
    "Calcule las dimensiones a partir de <Longitud>: ",
    "sin llano cae al texto del motor, con su opción por defecto y sin corchetes",
  );
  eq(
    formatCadPromptFor(LITERAL_PROMPTS[0], "esencial", "TRIM"),
    "Precise el punto siguiente: ",
    "un comando sin tabla muestra el mensaje del motor sin corchetes",
  );
  eq(formatCadPromptFor(LITERAL_PROMPTS[0], "esencial", null), "Precise el punto siguiente: ", "sin comando, igual");
  eq(cadPlainPromptMessage("line", LITERAL_PROMPTS[0]), CAD_PLAIN_PROMPTS.LINE[1].plain, "el nombre no distingue mayúsculas");
  eq(cadPlainPromptMessage(null, LITERAL_PROMPTS[0]), null, "sin comando no hay llano");

  // El mismo «Precise el punto siguiente» se redacta según el comando.
  eq(cadPlainPromptMessage("WALL", LITERAL_PROMPTS[0]), "Haz clic donde sigue el muro · Enter termina", "WALL habla de muro");

  // DOOR: el mensaje dinámico encaja con su tipo por defecto detrás…
  const door = firstPrompts.get("DOOR");
  assert.ok(door, "DOOR arrancó");
  ok(/^Designe el muro donde alojar la puerta/.test(door.message), `DOOR arranca pidiendo el muro («${door.message}»)`);
  ok(
    (cadPlainPromptMessage("DOOR", door) ?? "").startsWith("Primero dibuja un muro"),
    "y en llano dice que primero hay que dibujar un muro (golden 229)",
  );
  // …pero un AVISO delante («Eso no es un muro…») cae al texto del motor, que es
  // el que explica qué pasó; el llano no debe tragárselo.
  eq(
    cadPlainPromptMessage("DOOR", { ...door, message: `Eso no es un muro y un hueco sólo se aloja en un muro. ${door.message}` }),
    null,
    "con aviso delante no se sustituye",
  );
  const window = firstPrompts.get("WINDOW");
  assert.ok(window, "WINDOW arrancó");
  ok((cadPlainPromptMessage("WINDOW", window) ?? "").endsWith("la ventana"), "WINDOW nombra la ventana, no la puerta");
}

main().then(() => console.log(`prompt-plain: ${checks}/${checks} comprobaciones verdes`));
