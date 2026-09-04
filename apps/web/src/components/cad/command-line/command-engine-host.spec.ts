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
import type { CadEntity } from "@/lib/cad/cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { SnapType } from "@/lib/cad/snap-engine";
import { CadCommandEngineHost } from "./command-engine-host";
import { createCadClipboard } from "@/lib/cad/clipboard";
import { createCadVariableAccess } from "@/lib/cad/system-variables";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

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

// --- el anfitrión recuerda la última COTA de la sesión --------------------------
{
  // Es la mitad que falta de `CadCommandContext.session`: el motor es un
  // reductor puro y no ve el resultado de aplicar un lote, así que quien anota
  // «ésta fue la última cota» sólo puede ser el anfitrión. Sin esto,
  // DIMCONTINUE preguntaría por la base después de cada cota y la cadena, que es
  // el gesto entero de la orden, no existiría.
  const entities = new Map<string, CadEntity>([
    ["l1", { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer: "0" }],
  ]);
  let ids = 0;
  const host = new CadCommandEngineHost(CAD_COMMAND_REGISTRY_V2, {
    context: () => ({
      entityIds: [...entities.keys()],
      entity: (entityId) => entities.get(entityId),
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `cota${++ids}`,
    }),
    apply: (commands) => {
      for (const command of commands)
        if (command.type === "insert") entities.set(command.entity.id, command.entity);
    },
    preview: () => {},
    osnapOverride: () => {},
    cursor: () => {},
  });

  host.invoke("DIMLINEAR");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 1_000, y: 0 });
  host.pickPoint({ x: 500, y: 400 });
  assert.equal(entities.size, 2, "la cota se aplicó");

  host.invoke("DIMCONTINUE");
  assert.match(
    host.getSnapshot().prompt?.message ?? "",
    /línea de referencia siguiente/,
    "DIMCONTINUE encadena sin preguntar: el anfitrión le pasó la cota anterior",
  );
  host.cancel();
}

// --- la máscara del paso se expone para el enrutador del puntero -------------
{
  const { host } = makeHost();
  assert.equal(host.accepts, 0, "en reposo no se acepta nada");
  host.invoke("MOVE");
  assert.ok(host.accepts & 64, "«Designe objetos» acepta ENTITY_PICK (bit 64)");
  assert.ok(!(host.accepts & 1), "y NO acepta POINT: el clic al vacío no es un punto");
  host.cancel();
}

// --- el portapapeles de geometría: copiar en un editor, pegar en OTRO -----------
// Ola D (2026-09-02). Medido antes: Ctrl+C sobre lo nativo duplicaba en el
// sitio y nada viajaba entre dibujos. El almacén se comparte entre anfitriones
// a propósito —es la razón de ser de un portapapeles— y aquí se monta uno
// aparte para no pisar el de la pestaña.
{
  const clipboard = createCadClipboard();
  const origin = new Map<string, CadEntity>([
    ["l1", { id: "l1", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 2_000, y: 1_500, z: 0 }, layer: "MUROS" }],
  ]);
  const originApplied: Applied[] = [];
  const editorA = new CadCommandEngineHost(
    CAD_COMMAND_REGISTRY_V2,
    {
      context: () => ({
        entityIds: [...origin.keys()],
        entity: (id) => origin.get(id),
        blocks: () => [],
        selection: ["l1"],
        activeLayer: "MUROS",
        view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
        newEntityId: () => "nunca",
      }),
      apply: (commands, label) => originApplied.push({ commands, label }),
      preview: () => {},
      osnapOverride: () => {},
      cursor: () => {},
    },
    clipboard,
  );
  const targetApplied: Applied[] = [];
  let ids = 0;
  const editorB = new CadCommandEngineHost(
    CAD_COMMAND_REGISTRY_V2,
    {
      context: () => ({
        entityIds: [],
        entity: () => undefined,
        blocks: () => [],
        selection: [],
        activeLayer: "0",
        view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
        newEntityId: () => `b${++ids}`,
      }),
      apply: (commands, label) => targetApplied.push({ commands, label }),
      preview: () => {},
      osnapOverride: () => {},
      cursor: () => {},
    },
    clipboard,
  );

  // Vacío: PASTECLIP lo dice y no deja comando colgado.
  editorB.invoke("PASTECLIP");
  assert.ok(!editorB.busy, "con el portapapeles vacío PASTECLIP termina");
  const empty = editorB.getSnapshot().history.at(-1);
  assert.ok(empty?.text.includes("vacío") && empty.text.includes("Ctrl+C"), `dice que está vacío y qué tecla lo llena: «${empty?.text}»`);

  // COPYCLIP con selección previa: ni pregunta ni escribe en el dibujo.
  editorA.invoke("COPYCLIP");
  assert.ok(!editorA.busy, "COPYCLIP con selección termina de inmediato");
  assert.equal(originApplied.length, 0, "copiar no toca el dibujo de origen");
  const copied = editorA.getSnapshot().history.at(-1);
  assert.ok(copied?.level === "info" && copied.text.includes("1 objeto(s) copiado(s)") && copied.text.includes("1000, 1000"), `el diálogo cuenta y da el punto base: «${copied?.text}»`);
  assert.equal(clipboard.read()?.entities.length, 1, "el almacén compartido tiene la línea");

  // PASTECLIP en el OTRO editor: pide el punto y aplica UN lote con la copia trasladada.
  editorB.invoke("PASTECLIP");
  assert.match(editorB.getSnapshot().prompt?.message ?? "", /punto de inserción \(1 objeto\(s\)\)/, "pide el punto de inserción y cuenta");
  editorB.pickPoint({ x: 5_000, y: 5_000 });
  assert.equal(targetApplied.length, 1, "un lote");
  assert.equal(targetApplied[0].label, "PASTECLIP", "con su etiqueta");
  const pasted = targetApplied[0].commands[0];
  assert.ok(pasted.type === "insert" && pasted.entity.type === "line" && pasted.entity.id === "b1", "una LINE nueva con id del destino");
  assert.deepEqual(pasted.type === "insert" && pasted.entity.type === "line" ? pasted.entity.end : null, { x: 6_000, y: 5_500, z: 0 }, "trasladada por (destino − base)");

  // CUTCLIP: guarda Y borra el original como un lote del editor de origen.
  editorA.invoke("CUTCLIP");
  assert.equal(originApplied.length, 1, "cortar borra en el origen");
  assert.deepEqual(originApplied[0], { commands: [{ type: "delete", entityId: "l1" }], label: "CUTCLIP" }, "un delete por objeto, etiqueta CUTCLIP");
  assert.equal(clipboard.read()?.origin, "cut", "y el almacén sabe que fue un corte");
  const cut = editorA.getSnapshot().history.at(-1);
  assert.ok(cut?.text.includes("cortado(s)"), `el diálogo lo dice: «${cut?.text}»`);
}

// --- ADDSELECTED encadena la orden del tipo y DEVUELVE las variables ------------
// Ola D (2026-09-02). El reductor no puede arrancar otra orden ni ver su final:
// el anfitrión pone CLAYER/CECOLOR/CELTYPE, arranca LINE y, cuando LINE
// termina (o se cancela), deja las variables como estaban.
{
  const variables = createCadVariableAccess({ CLAYER: "0", CECOLOR: "BYLAYER", CELTYPE: "ByLayer" });
  const entities = new Map<string, CadEntity>([
    ["eje", { id: "eje", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "MUROS", context: { presentation: { color: { source: "explicit", value: "#ff0000" } } } }],
  ]);
  const applied: Applied[] = [];
  let ids = 0;
  const host = new CadCommandEngineHost(CAD_COMMAND_REGISTRY_V2, {
    context: () => ({
      entityIds: [...entities.keys()],
      entity: (id) => entities.get(id),
      selection: ["eje"],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `a${++ids}`,
      variables,
    }),
    apply: (commands, label) => applied.push({ commands, label }),
    preview: () => {},
    osnapOverride: () => {},
    cursor: () => {},
    variables: (patch) => {
      const lines: string[] = [];
      for (const [name, value] of Object.entries(patch)) {
        const outcome = variables.set(name, value);
        if (!outcome.ok) lines.push(outcome.reason);
      }
      return lines;
    },
  });

  host.invoke("ADDSELECTED");
  assert.ok(host.busy, "LINE quedó activa: ADDSELECTED encadenó");
  assert.equal(host.getSnapshot().activeCommand, "LINE", "la orden encadenada es LINE");
  assert.equal(variables.get("CLAYER"), "MUROS", "CLAYER es la capa del original mientras se dibuja");
  assert.equal(variables.get("CECOLOR"), "#ff0000", "y CECOLOR su color");
  assert.ok(host.getSnapshot().history.some((entry) => entry.text.includes("ADDSELECTED: LINE con capa MUROS")), "el diálogo dice qué orden y con qué");

  host.pickPoint({ x: 0, y: 500 });
  host.pickPoint({ x: 100, y: 500 });
  host.accept();
  assert.ok(!host.busy, "LINE terminó");
  assert.equal(applied.length, 1, "y escribió su lote");
  const drawn = applied[0].commands.find((command) => command.type === "insert");
  assert.ok(drawn?.type === "insert" && drawn.entity.context?.presentation?.color?.value === "#ff0000", "la línea nueva lleva el color del original (CECOLOR llegó al dibujo)");
  assert.equal(variables.get("CLAYER"), "0", "al terminar, CLAYER vuelve a lo que era");
  assert.equal(variables.get("CECOLOR"), "BYLAYER", "y CECOLOR también");

  // Cancelar también devuelve.
  host.invoke("ADDSELECTED");
  assert.equal(variables.get("CLAYER"), "MUROS", "de nuevo con la capa del original");
  host.cancel();
  assert.ok(!host.busy, "cancelada");
  assert.equal(variables.get("CLAYER"), "0", "y las variables vuelven aunque no se dibujara nada");
}

console.log("cad command engine host specs passed");
