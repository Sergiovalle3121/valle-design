/**
 * Navegación: ZOOM, PAN, VIEW y REGEN.
 *
 * Las propiedades de ida y vuelta —guardar una vista y restaurarla, alejar y
 * volver con Previo— se cumplirían de forma VACÍA si el código no tocara nunca
 * la vista. Por eso cada una viene acompañada de un ancla ABSOLUTA: un encuadre
 * concreto sobre un dibujo concreto, con el número que tiene que salir.
 */
import { strict as assert } from "node:assert";
import { cadViewFromViewport, type CadView } from "./cad-view";
import {
  CAD_VIEW_STACK_LIMIT,
  CAD_ZOOM_MARGIN_RATIO,
  applyCadViewRequest,
  cadViewHeight,
  cadZoomAllBounds,
  createCadNavigationState,
  parseCadZoomScale,
  pushCadViewHistory,
  type CadNavigationContext,
  type CadNavigationState,
} from "./view-navigation";

const WIDTH_PX = 1000;
const HEIGHT_PX = 800;

function view(): CadView {
  return cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 0, 0, 1);
}

/** Dibujo conocido: una envolvente de 400 × 200 centrada en (300, 150). */
const EXTENTS = { minX: 100, minY: 50, maxX: 500, maxY: 250 };
const LIMITS = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };

const context: CadNavigationContext = {
  extents: EXTENTS,
  limits: null,
  entityBounds: (id) =>
    id === "wall"
      ? { minX: 100, minY: 50, maxX: 300, maxY: 50 }
      : id === "slab"
        ? { minX: 200, minY: 100, maxX: 400, maxY: 300 }
        : null,
  mmPerDrawingUnit: 1,
  screenPxPerMm: 4,
};

function near(a: number, b: number, tol = 1e-9): void {
  assert.ok(Math.abs(a - b) <= tol, `esperaba ${b}, salió ${a}`);
}

// ---------------------------------------------------------------------------
// ANCLA ABSOLUTA: ZOOM Extensión sobre un dibujo conocido
// ---------------------------------------------------------------------------
{
  const state = createCadNavigationState(view());
  const out = applyCadViewRequest(state, { kind: "zoom", zoom: { option: "extents" } }, context);
  assert.equal(out.changed, true);

  // El encuadre se calcula a mano, no se lee del código: la envolvente mide
  // 400 × 200 y el margen deja 2% a cada lado, así que hacen falta
  // 400·1,04 = 416 unidades de ancho y 200·1,04 = 208 de alto. Con un lienzo
  // de 1000 × 800 px, los factores de ajuste son 1000/416 = 2,4038… y
  // 800/208 = 3,8461…; manda el menor.
  const expected = Math.min(
    WIDTH_PX / (400 * (1 + 2 * CAD_ZOOM_MARGIN_RATIO)),
    HEIGHT_PX / (200 * (1 + 2 * CAD_ZOOM_MARGIN_RATIO)),
  );
  near(expected, 1000 / 416);
  near(out.state.view.pixelsPerUnit, 1000 / 416);
  near(out.state.view.centerX, 300);
  near(out.state.view.centerY, 150);

  // Y en unidades de dibujo: 800 px de alto a 2,4038 px/unidad son 332,8
  // unidades visibles, de las cuales 200 son el dibujo.
  near(cadViewHeight(out.state.view), 800 / (1000 / 416));
  near(cadViewHeight(out.state.view), 332.8);
  console.log(
    `ZOOM Extensión: ${out.state.view.pixelsPerUnit.toFixed(6)} px/u, centro (${out.state.view.centerX}, ${out.state.view.centerY})`,
  );
}

// ---------------------------------------------------------------------------
// ZOOM Todo: los límites mandan, salvo que haya dibujo fuera
// ---------------------------------------------------------------------------
{
  const inside: CadNavigationContext = { ...context, limits: LIMITS };
  assert.deepEqual(cadZoomAllBounds(inside), LIMITS, "con el dibujo dentro, manda LIMITS");

  const outside: CadNavigationContext = {
    ...context,
    limits: LIMITS,
    extents: { minX: -200, minY: 50, maxX: 500, maxY: 250 },
  };
  assert.deepEqual(
    cadZoomAllBounds(outside),
    { minX: -200, minY: 0, maxX: 1000, maxY: 1000 },
    "con dibujo fuera de los límites, ZOOM Todo encuadra la unión",
  );

  const empty = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "all" } },
    { extents: null, limits: null },
  );
  assert.equal(empty.changed, false, "un dibujo vacío no se encuadra");
  assert.match(empty.message, /vacío/);
}

// ---------------------------------------------------------------------------
// ZOOM Ventana, Centro y Objeto — con números concretos
// ---------------------------------------------------------------------------
{
  const out = applyCadViewRequest(
    createCadNavigationState(view()),
    {
      kind: "zoom",
      zoom: { option: "window", corner1: { x: 200, y: 100 }, corner2: { x: 400, y: 200 } },
    },
    context,
  );
  near(out.state.view.centerX, 300);
  near(out.state.view.centerY, 150);
  // 200 × 100 con 2% de margen: 1000/208 frente a 800/104. Manda 1000/208.
  near(out.state.view.pixelsPerUnit, 1000 / 208);
}
{
  const out = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "center", center: { x: 10, y: 20 }, height: 400 } },
    context,
  );
  near(out.state.view.centerX, 10);
  near(out.state.view.centerY, 20);
  near(out.state.view.pixelsPerUnit, 2, 1e-12); // 800 px / 400 unidades
  near(cadViewHeight(out.state.view), 400);
}
{
  // ZOOM Objeto sobre una línea HORIZONTAL: envolvente de altura cero. Sin
  // engordarla el ajuste sería infinito y la pantalla quedaría en blanco.
  const out = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "object", entityIds: ["wall"] } },
    context,
  );
  assert.equal(out.changed, true);
  assert.ok(Number.isFinite(out.state.view.pixelsPerUnit));
  near(out.state.view.centerX, 200);
  near(out.state.view.centerY, 50);
  // Se engorda a la mitad del vano mayor (200/2 = 100) arriba y abajo: 200
  // unidades de alto. 1000/208 frente a 800/208 — manda el vertical.
  near(out.state.view.pixelsPerUnit, 800 / 208);

  const union = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "object", entityIds: ["wall", "slab"] } },
    context,
  );
  near(union.state.view.centerX, 250); // (100+400)/2
  near(union.state.view.centerY, 175); // (50+300)/2

  const missing = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "object", entityIds: ["nope"] } },
    context,
  );
  assert.equal(missing.changed, false);
}

// ---------------------------------------------------------------------------
// ZOOM Escala: absoluto, nX y nXP
// ---------------------------------------------------------------------------
{
  assert.deepEqual(parseCadZoomScale("2"), { factor: 2, basis: "absolute" });
  assert.deepEqual(parseCadZoomScale("0.5x"), { factor: 0.5, basis: "relative" });
  assert.deepEqual(parseCadZoomScale("2XP"), { factor: 2, basis: "paper" });
  assert.equal(parseCadZoomScale("xp"), null);
  assert.equal(parseCadZoomScale("-2"), null, "un factor negativo no es una escala");
  assert.equal(parseCadZoomScale("2xq"), null);

  const relative = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "scale", factor: 4, basis: "relative" } },
    context,
  );
  near(relative.state.view.pixelsPerUnit, 4, 1e-12); // partía de 1

  // nXP: 1 mm por unidad, 4 px por mm, factor 1/50 → 0,08 px por unidad.
  const paper = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "scale", factor: 1 / 50, basis: "paper" } },
    context,
  );
  near(paper.state.view.pixelsPerUnit, 0.08, 1e-12);

  const noPaper = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "scale", factor: 1, basis: "paper" } },
    { extents: EXTENTS, limits: null },
  );
  assert.equal(noPaper.changed, false, "sin escala de papel, nXP se niega");

  // Absoluto: `1` reproduce el encuadre de ZOOM Todo; `2`, el doble.
  const one = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "scale", factor: 1, basis: "absolute" } },
    context,
  );
  near(one.state.view.pixelsPerUnit, 1000 / 416);
  const two = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "zoom", zoom: { option: "scale", factor: 2, basis: "absolute" } },
    context,
  );
  near(two.state.view.pixelsPerUnit, 2000 / 416);
}

// ---------------------------------------------------------------------------
// PAN
// ---------------------------------------------------------------------------
{
  const out = applyCadViewRequest(
    createCadNavigationState(view()),
    { kind: "pan", displacement: { x: 25, y: -10 } },
    context,
  );
  near(out.state.view.centerX, 25);
  near(out.state.view.centerY, -10);
  near(out.state.view.pixelsPerUnit, 1, 1e-12);
  assert.equal(
    applyCadViewRequest(out.state, { kind: "pan", displacement: { x: 0, y: 0 } }, context).changed,
    false,
  );
}

// ---------------------------------------------------------------------------
// ZOOM Previo: la pila está ACOTADA y se vacía
// ---------------------------------------------------------------------------
{
  let state: CadNavigationState = createCadNavigationState(view());
  const start = { ...state.view };

  state = applyCadViewRequest(state, { kind: "zoom", zoom: { option: "extents" } }, context).state;
  assert.equal(state.history.length, 1);
  near(state.view.pixelsPerUnit, 1000 / 416);

  const back = applyCadViewRequest(state, { kind: "zoom", zoom: { option: "previous" } }, context);
  assert.equal(back.changed, true);
  // Ancla absoluta de la ida y vuelta: no basta con «vuelve a lo que había»,
  // porque eso se cumple si nada se movió. La ida SÍ movió: 2,4038 ≠ 1.
  near(back.state.view.pixelsPerUnit, 1, 1e-12);
  near(back.state.view.centerX, start.centerX);
  near(back.state.view.centerY, start.centerY);
  assert.equal(back.state.history.length, 0);

  const exhausted = applyCadViewRequest(
    back.state,
    { kind: "zoom", zoom: { option: "previous" } },
    context,
  );
  assert.equal(exhausted.changed, false, "sin historia, ZOOM Previo se niega");

  // El tope: veinte zooms dejan diez instantáneas, y la más antigua es la
  // décimo primera, no la primera.
  let deep: CadNavigationState = createCadNavigationState(view());
  for (let index = 1; index <= 20; index += 1)
    deep = applyCadViewRequest(
      deep,
      { kind: "zoom", zoom: { option: "center", center: { x: index, y: 0 }, height: 100 } },
      context,
    ).state;
  assert.equal(deep.history.length, CAD_VIEW_STACK_LIMIT);
  near(deep.history[0].centerX, 10, 1e-12);
  near(deep.history[CAD_VIEW_STACK_LIMIT - 1].centerX, 19, 1e-12);
  near(deep.view.centerX, 20, 1e-12);

  // `pushCadViewHistory` es la misma puerta que usa el anfitrión para el
  // arrastre del ratón, y respeta el mismo tope.
  const overflow = pushCadViewHistory(deep.history, { centerX: 99, centerY: 0, height: 1, twistDeg: 0 });
  assert.equal(overflow.length, CAD_VIEW_STACK_LIMIT);
  near(overflow[overflow.length - 1].centerX, 99, 1e-12);
}

// ---------------------------------------------------------------------------
// VIEW: guardar, restaurar y borrar — y sobrevivir a un lienzo distinto
// ---------------------------------------------------------------------------
{
  let state: CadNavigationState = createCadNavigationState(view());
  state = applyCadViewRequest(state, { kind: "zoom", zoom: { option: "extents" } }, context).state;

  const saved = applyCadViewRequest(state, { kind: "view", op: "save", name: " planta " }, context);
  assert.equal(saved.changed, true);
  assert.equal(saved.state.namedViews.length, 1);
  assert.equal(saved.state.namedViews[0].name, "PLANTA", "el nombre se canoniza");
  near(saved.state.namedViews[0].centerX, 300);
  near(saved.state.namedViews[0].height, 332.8);

  // Se aleja mucho, se cambia el TAMAÑO del lienzo y se restaura.
  let moved = applyCadViewRequest(
    saved.state,
    { kind: "zoom", zoom: { option: "center", center: { x: -9999, y: 9999 }, height: 10 } },
    context,
  ).state;
  moved = { ...moved, view: { ...moved.view, widthPx: 1600, heightPx: 400 } };

  const restored = applyCadViewRequest(moved, { kind: "view", op: "restore", name: "PLANTA" }, context);
  assert.equal(restored.changed, true);
  near(restored.state.view.centerX, 300);
  near(restored.state.view.centerY, 150);
  // Lo que se conserva es la ALTURA VISIBLE, no `pixelsPerUnit`: con un lienzo
  // de 400 px de alto, 332,8 unidades salen a 400/332,8 px por unidad.
  near(cadViewHeight(restored.state.view), 332.8, 1e-9);
  near(restored.state.view.pixelsPerUnit, 400 / 332.8, 1e-12);

  const missing = applyCadViewRequest(restored.state, { kind: "view", op: "restore", name: "ALZADO" }, context);
  assert.equal(missing.changed, false);

  const redefined = applyCadViewRequest(restored.state, { kind: "view", op: "save", name: "planta" }, context);
  assert.equal(redefined.state.namedViews.length, 1, "guardar dos veces no duplica");
  assert.match(redefined.message, /redefinida/);

  const deleted = applyCadViewRequest(redefined.state, { kind: "view", op: "delete", name: "PLANTA" }, context);
  assert.equal(deleted.state.namedViews.length, 0);
  assert.equal(
    applyCadViewRequest(deleted.state, { kind: "view", op: "delete", name: "PLANTA" }, context).changed,
    false,
  );
  assert.equal(
    applyCadViewRequest(deleted.state, { kind: "view", op: "save", name: "   " }, context).changed,
    false,
  );
}

// ---------------------------------------------------------------------------
// REGEN / REGENALL
// ---------------------------------------------------------------------------
{
  let state = createCadNavigationState(view());
  const before = { ...state.view };
  state = applyCadViewRequest(state, { kind: "regen", scope: "view" }, context).state;
  assert.equal(state.regenerations, 1);
  assert.equal(state.regenerationsAll, 0);
  state = applyCadViewRequest(state, { kind: "regen", scope: "all" }, context).state;
  assert.equal(state.regenerations, 2);
  assert.equal(state.regenerationsAll, 1);
  assert.deepEqual(state.view, before, "regenerar no mueve la vista");
  assert.equal(state.history.length, 0, "regenerar no ensucia la pila de ZOOM Previo");
}

console.log("cad view navigation specs passed");
