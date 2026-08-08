/**
 * Anfitrión del motor de comandos (Ola 3).
 *
 * El motor ya está probado como reductor puro. Lo que se comprueba aquí es el
 * puente: que un comando terminado llegue al documento como UN lote, que los
 * mensajes acaben en el diálogo, y que la instantánea sea estable por identidad
 * —sin eso, `useSyncExternalStore` entra en un bucle infinito de renders—.
 */
import { strict as assert } from "node:assert";
import { createCadCommandRegistry } from "@/lib/cad/engine/registry";
import { CAD_DRAW_BASIC_COMMANDS } from "@/lib/cad/engine/commands/draw-basics";
import { CAD_MODIFY_BASIC_COMMANDS } from "@/lib/cad/engine/commands/modify-basics";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { SnapType } from "@/lib/cad/snap-engine";
import { CadCommandEngineHost } from "./command-engine-host";

const registry = createCadCommandRegistry([...CAD_DRAW_BASIC_COMMANDS, ...CAD_MODIFY_BASIC_COMMANDS]);

interface Applied {
  commands: readonly CadEntityCommand[];
  label: string;
}

function makeHost(selection: readonly string[] = []) {
  const applied: Applied[] = [];
  let previews: readonly CadPreviewPath[] = [];
  let override: readonly SnapType[] | null = null;
  let cursor = "none";
  let ids = 0;
  const host = new CadCommandEngineHost(registry, {
    context: () => ({
      entityIds: ["line-1"],
      entity: () => undefined,
      selection,
      activeLayer: "MUROS",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      cursor: { x: 10, y: 0 },
      newEntityId: () => `id${++ids}`,
    }),
    apply: (commands, label) => applied.push({ commands, label }),
    preview: (paths) => {
      previews = paths;
    },
    osnapOverride: (modes) => {
      override = modes;
    },
    cursor: (shape) => {
      cursor = shape;
    },
  });
  return {
    host,
    applied,
    previews: () => previews,
    override: () => override,
    cursor: () => cursor,
  };
}

// --- un comando terminado llega al documento como un lote --------------------
{
  const { host, applied } = makeHost();
  host.invoke("LINE");
  assert.ok(host.busy, "el comando queda activo");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 100, y: 0 });
  host.pickPoint({ x: 100, y: 100 });
  host.accept();
  assert.equal(applied.length, 1, "una polilínea de tres vértices se aplica UNA vez");
  assert.equal(applied[0].commands.length, 2, "con sus dos segmentos");
  assert.equal(applied[0].label, "LINE");
  assert.ok(!host.busy, "y el comando termina");
}

// --- la capa activa manda -----------------------------------------------------
{
  const { host, applied } = makeHost();
  host.invoke("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 50, y: 50 });
  host.accept();
  const command = applied[0].commands[0];
  assert.equal(
    command.type === "insert" ? command.entity.layer : null,
    "MUROS",
    "la entidad nace en la capa activa, no en la 0",
  );
}

// --- escribir por la línea de comandos equivale a designar -------------------
{
  const { host, applied } = makeHost();
  host.submit("L");
  assert.equal(host.getSnapshot().activeCommand, "LINE", "el alias resuelve al comando");
  host.submit("0,0");
  host.submit("@100,0");
  host.accept();
  assert.equal(applied.length, 1, "el dibujo por coordenadas produce el mismo lote");
  const command = applied[0].commands[0];
  if (command.type === "insert" && command.entity.type === "line")
    assert.equal(command.entity.end.x, 100, "@relativo se resuelve contra el punto anterior");
  else assert.fail("debería haberse insertado una línea");
}

// --- el diálogo recoge lo tecleado, los prompts y los errores -----------------
{
  const { host } = makeHost();
  host.submit("NOEXISTE");
  const entries = host.getSnapshot().history;
  assert.ok(
    entries.some((entry) => entry.level === "input" && entry.text === "NOEXISTE"),
    "lo tecleado queda registrado",
  );
  assert.ok(
    entries.some((entry) => entry.level === "error" && entry.text.includes("desconocido")),
    "y el error también, en vez de desaparecer",
  );
}
{
  const { host } = makeHost();
  host.invoke("LINE");
  const prompts = host.getSnapshot().history.filter((entry) => entry.level === "prompt");
  assert.ok(prompts.length > 0, "el prompt entra al diálogo");
  host.invoke("LINE");
  assert.equal(
    host.getSnapshot().history.filter((entry) => entry.level === "prompt").length,
    2,
    "invocar otra vez vuelve a mostrar el prompt: eso es lo que hace una consola",
  );
  // El deduplicado sólo cubre prompts CONSECUTIVOS e idénticos, que es lo que
  // ocurre al reanudar un comando transparente: ahí repetir el renglón sería
  // ruido, no información.
  host.pickPoint({ x: 0, y: 0 });
  const afterPick = host.getSnapshot().history.filter((entry) => entry.level === "prompt");
  const lastTwo = afterPick.slice(-2).map((entry) => entry.text);
  assert.notEqual(lastTwo[0], lastTwo[1], "prompts distintos sí se apilan");
}

// --- instantánea estable por identidad ---------------------------------------
{
  const { host } = makeHost();
  const before = host.getSnapshot();
  assert.equal(host.getSnapshot(), before, "leer dos veces sin cambios da el MISMO objeto");
  host.invoke("LINE");
  assert.notEqual(host.getSnapshot(), before, "y cambia cuando algo cambia");
}

// --- suscripción --------------------------------------------------------------
{
  const { host } = makeHost();
  let notified = 0;
  const stop = host.subscribe(() => {
    notified += 1;
  });
  host.invoke("LINE");
  assert.ok(notified > 0, "los suscriptores reciben aviso");
  const seen = notified;
  stop();
  host.pickPoint({ x: 1, y: 1 });
  assert.equal(notified, seen, "tras darse de baja ya no llega nada");
}

// --- Esc cancela sin escribir --------------------------------------------------
{
  const { host, applied, previews } = makeHost();
  host.invoke("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 10, y: 0 });
  host.cancel();
  assert.equal(applied.length, 0, "Esc no aplica nada, ni lo ya trazado");
  assert.deepEqual(previews(), [], "y limpia la previsualización");
  assert.equal(host.getSnapshot().prompt, null, "sin prompt activo");
}

// --- Espacio repite -----------------------------------------------------------
{
  const { host } = makeHost();
  host.invoke("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 10, y: 0 });
  host.accept();
  assert.equal(host.getSnapshot().lastCommand, "LINE", "queda anotado");
  host.repeat();
  assert.equal(host.getSnapshot().activeCommand, "LINE", "y Espacio lo relanza");
}

// --- el override de captura se expone al editor -------------------------------
{
  const { host, override } = makeHost();
  host.invoke("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.submit("MID");
  assert.deepEqual(host.osnapOverride, ["midpoint"], "el editor puede consultarlo al resolver el snap");
  assert.deepEqual(override(), ["midpoint"], "y se le ha notificado");
  host.pickPoint({ x: 50, y: 0 });
  assert.equal(host.osnapOverride, null, "la designación lo consume");
}

// --- ERASE sobre una selección previa ----------------------------------------
{
  const { host, applied } = makeHost(["line-1"]);
  host.submit("E");
  assert.equal(applied.length, 1, "con objetos designados, ERASE actúa al invocarse");
  assert.equal(applied[0].commands[0].type, "delete");
}

console.log("cad command engine host specs passed");
