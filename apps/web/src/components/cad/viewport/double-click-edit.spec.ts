import { strict as assert } from "node:assert";
import { attachCadDoubleClickEdit, type CadDoubleClickEditPort } from "./double-click-edit";

/**
 * El doble clic abre el editor del objeto EN REPOSO; con un comando abierto los
 * dos clics son del comando. Se prueba con un `EventTarget` de Node: el gesto
 * no necesita DOM, sólo alguien que emita `dblclick`.
 */
let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function harness(entityType: string, busy: boolean) {
  const calls: string[] = [];
  const engine = {
    busy,
    invoke: (command: string) => calls.push(`invoke:${command}`),
    pickEntity: (entityId: string) => calls.push(`pick:${entityId}`),
  };
  const port: CadDoubleClickEditPort = {
    drawingPoint: () => ({ x: 100, y: 200 }),
    entityId: () => "e1",
    document: () => ({ entities: [{ id: "e1", type: entityType }] }),
    openMTextEditor: (id) => calls.push(`mtext:${id}`),
    engine: () => engine,
  };
  const element = new EventTarget();
  const detach = attachCadDoubleClickEdit(element as unknown as HTMLElement, port);
  const dblclick = () => {
    const event = new Event("dblclick", { cancelable: true });
    element.dispatchEvent(event);
    return event;
  };
  return { calls, engine, dblclick, detach };
}

// En reposo el doble clic ES la designación: arranca el verbo y le entrega el objeto.
{
  const h = harness("polyline", false);
  const event = h.dblclick();
  ok(h.calls.join(",") === "invoke:PEDIT,pick:e1", "en reposo, doble clic sobre una polilínea abre PEDIT con ella designada");
  ok(event.defaultPrevented, "y el gesto es nuestro entero (preventDefault)");
  h.detach();
}
{
  const h = harness("mtext", false);
  h.dblclick();
  ok(h.calls.join(",") === "mtext:e1", "en reposo, doble clic sobre un MTEXT abre el editor de párrafo");
  h.detach();
}

// CON UN COMANDO ABIERTO LOS DOS CLICS SON DEL COMANDO. Antes, rematar un LINE
// con doble clic sobre una polilínea sustituía el LINE por PEDIT (`invoke` en
// mitad del comando), y sobre un MTEXT abría el editor encima del comando.
for (const type of ["polyline", "dimension", "text", "insert", "mtext"]) {
  const h = harness(type, true);
  const event = h.dblclick();
  ok(h.calls.length === 0, `con un comando abierto, doble clic sobre ${type} no arranca nada: ${h.calls.join(",")}`);
  ok(!event.defaultPrevented, `ni se apropia del gesto (${type})`);
  h.detach();
}

// La guarda mira el motor en el MOMENTO del doble clic: al acabar el comando vuelve el verbo.
{
  const h = harness("polyline", true);
  h.dblclick();
  h.engine.busy = false;
  h.dblclick();
  ok(h.calls.join(",") === "invoke:PEDIT,pick:e1", "terminado el comando, el doble clic vuelve a abrir PEDIT");
  h.detach();
}

console.log(`double-click-edit: ${checks} comprobaciones verdes`);
