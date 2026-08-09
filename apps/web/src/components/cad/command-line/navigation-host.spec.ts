/**
 * El anfitrión de navegación mueve una cámara de verdad.
 *
 * La prueba que importa no es que `applyCadViewRequest` calcule bien —eso ya lo
 * cubre su spec— sino que el resultado LLEGUE al controlador: que tras teclear
 * `ZOOM Extensión` el `pixelsPerUnit` del controlador sea otro, y el número
 * concreto que toca. Un anfitrión que calcula el encuadre y no lo aplica
 * pasaría cualquier prueba que sólo mire su estado interno.
 */
import { strict as assert } from "node:assert";
import { cadViewFromViewport, type CadView } from "@/lib/cad/view/cad-view";
import { CAD_VIEW_STACK_LIMIT } from "@/lib/cad/view/view-navigation";
import { CadNavigationHost, type CadViewControllerLike } from "./navigation-host";

class FakeController implements CadViewControllerLike {
  view: CadView;
  applied = 0;
  constructor(width = 1000, height = 800) {
    this.view = cadViewFromViewport(width, height, 0, 0, 1);
  }
  setView(view: CadView): void {
    this.view = view;
    this.applied += 1;
  }
}

const EXTENTS = { minX: 100, minY: 50, maxX: 500, maxY: 250 };

// --- ZOOM Extensión llega a la cámara ---------------------------------------
{
  const controller = new FakeController();
  const regens: string[] = [];
  const host = new CadNavigationHost({
    controller: () => controller,
    extents: () => EXTENTS,
    regen: (scope) => regens.push(scope),
  });

  const message = host.apply({ kind: "zoom", zoom: { option: "extents" } });
  assert.match(message, /Extensión/);
  assert.equal(controller.applied, 1, "el encuadre se aplicó al controlador");
  // 400 × 200 con 2% de margen sobre un lienzo de 1000 × 800: manda 1000/416.
  assert.ok(Math.abs(controller.view.pixelsPerUnit - 1000 / 416) < 1e-9);
  assert.equal(controller.view.centerX, 300);
  assert.equal(controller.view.centerY, 150);
  assert.equal(host.getSnapshot().historyDepth, 1);

  // ZOOM Previo devuelve exactamente lo que había: 1 px/unidad, centro (0,0).
  host.apply({ kind: "zoom", zoom: { option: "previous" } });
  assert.equal(controller.applied, 2);
  assert.equal(controller.view.pixelsPerUnit, 1);
  assert.equal(controller.view.centerX, 0);
  assert.equal(host.getSnapshot().historyDepth, 0);

  // REGEN cuenta y avisa al puente, sin tocar la cámara.
  const applied = controller.applied;
  host.apply({ kind: "regen", scope: "all" });
  assert.deepEqual(regens, ["all"]);
  assert.equal(controller.applied, applied, "regenerar no reasigna la vista");
  assert.equal(host.getSnapshot().regenerations, 1);
  assert.equal(host.getSnapshot().regenerationsAll, 1);
}

// --- la memoria del anfitrión sobrevive a los gestos del puntero -------------
{
  const controller = new FakeController();
  const host = new CadNavigationHost({ controller: () => controller, extents: () => EXTENTS });

  // El usuario hace zoom con la rueda: el controlador cambia SIN pasar por
  // aquí. `remember()` es la puerta que hace que ZOOM Previo pueda volver.
  host.remember();
  controller.setView({ ...controller.view, pixelsPerUnit: 8, centerX: 42 });
  assert.equal(host.getSnapshot().historyDepth, 1);

  host.apply({ kind: "zoom", zoom: { option: "previous" } });
  assert.equal(controller.view.pixelsPerUnit, 1, "vuelve al encuadre anterior a la rueda");
  assert.equal(controller.view.centerX, 0);
}

// --- vistas con nombre, y el tope de la pila ---------------------------------
{
  const controller = new FakeController();
  const host = new CadNavigationHost({ controller: () => controller, extents: () => EXTENTS });

  host.apply({ kind: "zoom", zoom: { option: "extents" } });
  host.apply({ kind: "view", op: "save", name: "planta" });
  assert.deepEqual(
    host.getSnapshot().namedViews.map((view) => view.name),
    ["PLANTA"],
  );

  controller.setView({ ...controller.view, centerX: -5000, pixelsPerUnit: 40 });
  const restored = host.apply({ kind: "view", op: "restore", name: "PLANTA" });
  assert.match(restored, /restaurada/);
  assert.equal(controller.view.centerX, 300);
  assert.ok(Math.abs(controller.view.pixelsPerUnit - 1000 / 416) < 1e-9);

  for (let index = 0; index < 30; index += 1)
    host.apply({ kind: "pan", displacement: { x: 1, y: 0 } });
  assert.equal(
    host.getSnapshot().historyDepth,
    CAD_VIEW_STACK_LIMIT,
    "la pila está acotada aunque se navegue toda la tarde",
  );
}

// --- sin controlador, se dice; no se finge -----------------------------------
{
  const host = new CadNavigationHost({ controller: () => null, extents: () => null });
  const message = host.apply({ kind: "zoom", zoom: { option: "all" } });
  assert.match(message, /no hay ninguna vista activa/i);
  assert.equal(host.getSnapshot().historyDepth, 0);
}

// --- la instantánea conserva identidad mientras nada cambia -------------------
{
  const controller = new FakeController();
  const host = new CadNavigationHost({ controller: () => controller, extents: () => EXTENTS });
  const first = host.getSnapshot();
  assert.equal(host.getSnapshot(), first, "useSyncExternalStore exige identidad estable");
  let notifications = 0;
  const stop = host.subscribe(() => {
    notifications += 1;
  });
  host.apply({ kind: "zoom", zoom: { option: "extents" } });
  assert.equal(notifications, 1);
  assert.notEqual(host.getSnapshot(), first);
  stop();
  host.apply({ kind: "pan", displacement: { x: 1, y: 1 } });
  assert.equal(notifications, 1, "tras darse de baja ya no llega nada");
}

console.log("cad navigation host specs passed");
