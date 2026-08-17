import assert from "node:assert/strict";
import {
  CAD_RENDER_FRAME_BUDGET_MAX_MS,
  CAD_RENDER_FRAME_BUDGET_MS,
  CadRenderScheduler,
} from "./render-scheduler";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Reloj falso: el presupuesto se prueba sin esperar y sin depender de la carga. */
function fakeClock() {
  let value = 0;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

assert.equal(CAD_RENDER_FRAME_BUDGET_MS, 4, "el presupuesto por cuadro es de 4 ms");

// ---------------------------------------------------------------------------
// Prioridad por cercanía al centro de la vista. El usuario mira al centro: el
// detalle tiene que aparecer de dentro hacia fuera.
// ---------------------------------------------------------------------------
const order: string[] = [];
const scheduler = new CadRenderScheduler({ now: () => 0 });
scheduler.reprioritize(0, 0);
scheduler.enqueueAll([
  { key: "lejos", x: 1_000, y: 0, run: () => order.push("lejos") },
  { key: "cerca", x: 10, y: 0, run: () => order.push("cerca") },
  { key: "medio", x: 100, y: 0, run: () => order.push("medio") },
]);
assert.equal(scheduler.pending, 3);
// Reloj congelado en 0: nunca se agota el presupuesto, así que corre todo.
const drained = scheduler.runFrame();
assert.deepEqual(order, ["cerca", "medio", "lejos"]);
assert.equal(drained.ran, 3);
assert.equal(drained.remaining, 0);
assert.equal(drained.budgetExhausted, false, "vació la cola, no se quedó sin presupuesto");
ok(true, "las tareas salen ordenadas por distancia al centro de la vista");

// Cambiar el centro reordena lo pendiente sin tirarlo.
const reordered: string[] = [];
const repriorized = new CadRenderScheduler({ now: () => 0 });
repriorized.enqueueAll([
  { key: "a", x: 0, y: 0, run: () => reordered.push("a") },
  { key: "b", x: 500, y: 0, run: () => reordered.push("b") },
  { key: "c", x: 1_000, y: 0, run: () => reordered.push("c") },
]);
repriorized.reprioritize(1_000, 0);
assert.equal(repriorized.pending, 3, "reprioritize NO descarta trabajo");
repriorized.runFrame();
assert.deepEqual(reordered, ["c", "b", "a"], "el orden se invierte con el centro nuevo");
ok(true, "reprioritize reordena la cola pendiente sin perderla");

// ---------------------------------------------------------------------------
// EL PRESUPUESTO. Con un reloj que avanza 3 ms por tarea, un presupuesto de
// 4 ms deja pasar exactamente dos por cuadro: la primera siempre (garantía de
// progreso) y la segunda porque en su inicio sólo habían pasado 3 ms.
// ---------------------------------------------------------------------------
const clock = fakeClock();
const budgeted = new CadRenderScheduler({ frameBudgetMs: 4, now: clock.now });
let executed = 0;
for (let index = 0; index < 10; index += 1)
  budgeted.enqueue({
    key: `t${index}`,
    x: index,
    y: 0,
    run: () => {
      executed += 1;
      clock.advance(3);
    },
  });
const first = budgeted.runFrame();
assert.equal(first.ran, 2, `un presupuesto de 4 ms con tareas de 3 ms deja pasar 2, pasaron ${first.ran}`);
assert.equal(first.budgetExhausted, true);
assert.equal(first.remaining, 8);
assert.equal(executed, 2);
// Y el resto se drena en cuadros sucesivos, sin perder ninguna.
let frames = 1;
while (budgeted.pending > 0) {
  budgeted.runFrame();
  frames += 1;
  assert.ok(frames < 20, "el drenaje debe terminar");
}
assert.equal(executed, 10, "las diez tareas acaban ejecutándose");
assert.equal(frames, 5, "diez tareas de 3 ms a 2 por cuadro son 5 cuadros");
ok(true, `el presupuesto reparte 10 tareas de 3 ms en ${frames} cuadros sin perder ninguna`);

// Garantía de progreso: una tarea MÁS CARA que el presupuesto entero se ejecuta
// igualmente. Sin esto la cola se atasca para siempre y la escena nunca asienta.
const slowClock = fakeClock();
const starving = new CadRenderScheduler({ frameBudgetMs: 4, now: slowClock.now });
let heavyRan = false;
starving.enqueue({
  key: "pesada",
  x: 0,
  y: 0,
  run: () => {
    heavyRan = true;
    slowClock.advance(500);
  },
});
const heavyFrame = starving.runFrame();
assert.equal(heavyRan, true, "una tarea que no cabe en el presupuesto se ejecuta igual");
assert.equal(heavyFrame.ran, 1);
assert.equal(heavyFrame.elapsedMs, 500, "y el resultado lo dice: 500 ms en un cuadro de 4");
assert.equal(starving.pending, 0);
ok(true, "una tarea más cara que el presupuesto no bloquea la cola");

// ---------------------------------------------------------------------------
// ABORTAR. Si la vista cambia, el trabajo encolado describe otro encuadre.
// ---------------------------------------------------------------------------
const aborting = new CadRenderScheduler({ now: () => 0 });
let abortedRuns = 0;
for (let index = 0; index < 50; index += 1)
  aborting.enqueue({ key: `x${index}`, x: index, y: 0, run: () => { abortedRuns += 1; } });
const generationBefore = aborting.generation;
const dropped = aborting.abort();
assert.equal(dropped, 50);
assert.equal(aborting.pending, 0);
assert.equal(aborting.generation, generationBefore + 1, "abortar sube la generación de la vista");
aborting.runFrame();
assert.equal(abortedRuns, 0, "nada de lo abortado llega a ejecutarse");
assert.equal(aborting.stats.aborted, 50);
ok(true, "abort() descarta la cola y sube la generación para que el trabajo asíncrono se descarte solo");

// Reencolar la misma clave sustituye en vez de duplicar: en un paneo el mismo
// tile se vuelve a pedir muchas veces y no puede teselarse dos veces.
const deduped = new CadRenderScheduler({ now: () => 0 });
const runs: string[] = [];
deduped.enqueue({ key: "tile:1", x: 900, y: 0, run: () => runs.push("viejo") });
deduped.enqueue({ key: "tile:1", x: 1, y: 0, run: () => runs.push("nuevo") });
assert.equal(deduped.pending, 1, "una clave, una tarea");
deduped.enqueue({ key: "tile:2", x: 5, y: 0, run: () => runs.push("otro") });
deduped.runFrame();
assert.deepEqual(runs, ["nuevo", "otro"], "corre la versión nueva, con su prioridad nueva");
ok(true, "reencolar una clave sustituye la tarea y su prioridad");

// ---------------------------------------------------------------------------
// Una tarea rota no puede tumbar el bucle de cuadros.
// ---------------------------------------------------------------------------
const resilient = new CadRenderScheduler({ now: () => 0 });
let afterFailure = false;
resilient.enqueue({ key: "rota", x: 0, y: 0, run: () => { throw new Error("teselado imposible"); } });
resilient.enqueue({ key: "sana", x: 1, y: 0, run: () => { afterFailure = true; } });
const resilientFrame = resilient.runFrame();
assert.equal(afterFailure, true, "la tarea siguiente se ejecuta pese al fallo");
assert.equal(resilientFrame.failures.length, 1);
assert.deepEqual(resilientFrame.failures[0], { key: "rota", message: "teselado imposible" });
assert.equal(resilientFrame.ran, 2, "las dos cuentan como ejecutadas; una falló");
ok(true, "un fallo se captura con su clave y el cuadro sigue");

// ---------------------------------------------------------------------------
// Escala: con 50.000 tareas el orden por prioridad sigue siendo correcto y el
// planificador no se come su propio presupuesto ordenando.
// ---------------------------------------------------------------------------
const many = new CadRenderScheduler({ now: () => 0 });
const seen: number[] = [];
let seed = 7;
const rng = () => {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 0x1_0000_0000;
};
const points: Array<{ x: number; y: number }> = [];
for (let index = 0; index < 50_000; index += 1) {
  const point = { x: rng() * 2_000 - 1_000, y: rng() * 2_000 - 1_000 };
  points.push(point);
  many.enqueue({
    key: `n${index}`,
    x: point.x,
    y: point.y,
    run: () => seen.push(point.x * point.x + point.y * point.y),
  });
}
const started = Date.now();
many.runFrame();
const elapsed = Date.now() - started;
assert.equal(seen.length, 50_000);
for (let index = 1; index < seen.length; index += 1)
  assert.ok(seen[index - 1] <= seen[index], `el orden global se rompió en la posición ${index}`);
assert.ok(elapsed < 2_000, `50.000 tareas priorizadas tardaron ${elapsed} ms`);
ok(true, `50.000 tareas salen en orden estricto de distancia en ${elapsed} ms`);

// ---------------------------------------------------------------------------
// PRESUPUESTO ADAPTATIVO
//
// Llegó con la instrumentación por etapas y NUNCA tuvo spec: la conducta se
// documentó en un comentario largo y se dio por buena. Un comentario no es una
// afirmación comprobable, y ésta gobierna cuánto trabajo hace el CAD en cada
// cuadro — es exactamente la clase de cambio que no puede viajar sin ancla.
//
// Lo que se fija aquí es el CONTRATO, no la implementación: el presupuesto sube
// con el cuadro observado, nunca baja del suelo, y tiene techo.
// ---------------------------------------------------------------------------

{
  // A 60 Hz la conducta de antes queda INTACTA, que es la promesa que permitió
  // meter el adaptativo sin discutir cada llamada: un cuarto de 16,7 son 4,2 ms.
  const clock = fakeClock();
  const sixty = new CadRenderScheduler({ now: clock.now });
  sixty.enqueue({ key: "a", x: 0, y: 0, run: () => {} });
  sixty.runFrame();
  for (let frame = 0; frame < 12; frame += 1) {
    clock.advance(16.7);
    sixty.enqueue({ key: `f${frame}`, x: 0, y: 0, run: () => {} });
    sixty.runFrame();
  }
  clock.advance(16.7);
  sixty.enqueue({ key: "final", x: 0, y: 0, run: () => {} });
  const result = sixty.runFrame();
  ok(
    result.budgetMs > CAD_RENDER_FRAME_BUDGET_MS &&
      result.budgetMs < CAD_RENDER_FRAME_BUDGET_MS * 1.2,
    `a 60 Hz el presupuesto se queda donde estaba (${result.budgetMs} ms de un cuadro de 16,7)`,
  );
}

{
  // Con cuadros CAROS —el rasterizador por software del runner, ~1.160 ms— el
  // presupuesto sube. Es la razón de existir del cambio: con 4 ms clavados,
  // asentar segundo y medio de trabajo pedía cientos de cuadros de un segundo.
  const clock = fakeClock();
  const slow = new CadRenderScheduler({ now: clock.now });
  slow.enqueue({ key: "a", x: 0, y: 0, run: () => {} });
  slow.runFrame();
  for (let frame = 0; frame < 20; frame += 1) {
    clock.advance(1_159.5);
    slow.enqueue({ key: `s${frame}`, x: 0, y: 0, run: () => {} });
    slow.runFrame();
  }
  clock.advance(1_159.5);
  slow.enqueue({ key: "final", x: 0, y: 0, run: () => {} });
  const result = slow.runFrame();
  ok(
    result.budgetMs > 100,
    `con cuadros de 1.159 ms el presupuesto sube muy por encima de 4 (${result.budgetMs} ms)`,
  );
  ok(
    result.budgetMs <= CAD_RENDER_FRAME_BUDGET_MAX_MS,
    `y NO se pasa del techo de ${CAD_RENDER_FRAME_BUDGET_MAX_MS} ms (${result.budgetMs})`,
  );
  ok(
    slow.observedFrameIntervalMs > 900,
    `el intervalo observado sigue al cuadro real (${slow.observedFrameIntervalMs} ms)`,
  );
}

{
  // El techo acota el ABSURDO: una pestaña en segundo plano, un portátil que
  // despierta o un punto de interrupción dan intervalos de decenas de segundos.
  // Sin techo, el cuadro siguiente intentaría hacer todo el trabajo del mundo.
  const clock = fakeClock();
  const stalled = new CadRenderScheduler({ now: clock.now });
  stalled.enqueue({ key: "a", x: 0, y: 0, run: () => {} });
  stalled.runFrame();
  for (let frame = 0; frame < 30; frame += 1) {
    clock.advance(60_000);
    stalled.enqueue({ key: `p${frame}`, x: 0, y: 0, run: () => {} });
    stalled.runFrame();
  }
  clock.advance(60_000);
  stalled.enqueue({ key: "final", x: 0, y: 0, run: () => {} });
  ok(
    stalled.runFrame().budgetMs === CAD_RENDER_FRAME_BUDGET_MAX_MS,
    "un intervalo de un minuto se corta en el techo, no multiplica el presupuesto",
  );
}

{
  // NUNCA baja del suelo. Una máquina rápida no puede castigarse a sí misma por
  // ser rápida: con cuadros de 1 ms, un cuarto serían 0,25 ms y el CAD avanzaría
  // dieciséis veces más despacio en el hardware mejor.
  const clock = fakeClock();
  const fast = new CadRenderScheduler({ now: clock.now });
  fast.enqueue({ key: "a", x: 0, y: 0, run: () => {} });
  fast.runFrame();
  for (let frame = 0; frame < 10; frame += 1) {
    clock.advance(1);
    fast.enqueue({ key: `q${frame}`, x: 0, y: 0, run: () => {} });
    fast.runFrame();
  }
  clock.advance(1);
  fast.enqueue({ key: "final", x: 0, y: 0, run: () => {} });
  ok(
    fast.runFrame().budgetMs === CAD_RENDER_FRAME_BUDGET_MS,
    "con cuadros baratísimos el presupuesto se queda en el suelo de 4 ms, no por debajo",
  );
}

{
  // `fixedBudget` devuelve la política de ANTES, intacta. Existe para que un
  // spec pueda fijar el reparto sin que el adaptativo se lo mueva, y para poder
  // comparar las dos políticas en la misma corrida del arnés de etapas.
  const clock = fakeClock();
  const fixed = new CadRenderScheduler({ now: clock.now, fixedBudget: true });
  fixed.enqueue({ key: "a", x: 0, y: 0, run: () => {} });
  fixed.runFrame();
  for (let frame = 0; frame < 10; frame += 1) {
    clock.advance(1_159.5);
    fixed.enqueue({ key: `c${frame}`, x: 0, y: 0, run: () => {} });
    fixed.runFrame();
  }
  clock.advance(1_159.5);
  fixed.enqueue({ key: "final", x: 0, y: 0, run: () => {} });
  ok(
    fixed.runFrame().budgetMs === CAD_RENDER_FRAME_BUDGET_MS,
    "con fixedBudget el presupuesto NO se adapta por caros que sean los cuadros",
  );
  ok(
    fixed.observedFrameIntervalMs === 0,
    "y ni siquiera observa el intervalo: con presupuesto clavado no hay nada que estimar",
  );
}

{
  // Un presupuesto EXPLÍCITO manda sobre el adaptativo —quien lo pasa sabe algo
  // que el planificador no—, pero el intervalo se sigue observando: si no,
  // alternar cuadros con y sin argumento dejaría la media móvil leyendo
  // intervalos DOBLES y el presupuesto saldría inflado al volver.
  const clock = fakeClock();
  const mixed = new CadRenderScheduler({ now: clock.now });
  mixed.enqueue({ key: "a", x: 0, y: 0, run: () => {} });
  mixed.runFrame();
  for (let frame = 0; frame < 8; frame += 1) {
    clock.advance(100);
    mixed.enqueue({ key: `m${frame}`, x: 0, y: 0, run: () => {} });
    mixed.runFrame(7);
  }
  ok(
    Math.abs(mixed.observedFrameIntervalMs - 100) < 1,
    `el intervalo se observa aunque el presupuesto venga dado (${mixed.observedFrameIntervalMs} ms, no ~200)`,
  );
}

console.log(
  `render-scheduler: ${checks} comprobaciones verdes — presupuesto de 4 ms respetado con reloj determinista, garantía de progreso ante una tarea de 500 ms, orden por cercanía verificado sobre 50.000 tareas, y el presupuesto ADAPTATIVO fijado en sus cuatro extremos: suelo, techo, 60 Hz intacto y presupuesto explícito.`,
);
