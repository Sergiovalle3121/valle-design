/**
 * El sandbox, probado como se prueba un sandbox: ATACÁNDOLO.
 *
 * Las pruebas felices de un límite no prueban nada — cualquier implementación
 * que no limite pasa todas. Lo que hay que demostrar es que las rutinas que un
 * cliente podría cargar sin mala intención (y las que sí la tienen) se cortan,
 * se cortan DICIENDO por qué, y no dejan el intérprete en un estado raro.
 *
 * El caso que más importa es el último bloque: `vl-catch-all-apply` NO puede
 * tragarse el corte. Si pudiera, el límite sería decorativo.
 */
import { strict as assert } from "node:assert";
import { DEFAULT_LISP_BUDGET, LispMeter } from "./budget";
import { CORE_LISP_BUILTINS } from "./core-builtins";
import { LispSession, type LispRunResult } from "./session";

let checks = 0;

/** Presupuesto apretado: los ataques se cortan en milisegundos, no en minutos. */
const TIGHT = { maxSteps: 50_000, maxCells: 200_000, maxDepth: 64, maxMillis: 2_000 };

/**
 * Para los ataques a la MEMORIA hace falta soltar el contador de pasos. Con
 * ambos apretados, quien corta primero es un accidente de cuántos pasos cuesta
 * una iteración, y la spec estaría afirmando ese accidente en vez de la
 * propiedad: que asignar sin freno se corta por asignar.
 */
const MEMORY_TIGHT = { maxSteps: 50_000_000, maxCells: 200_000, maxDepth: 64, maxMillis: 30_000 };

function attack(source: string, limits = TIGHT, now?: () => number): LispRunResult {
  return new LispSession({ builtins: CORE_LISP_BUILTINS, limits, now }).run(source);
}

function abortsWith(
  source: string,
  reason: string,
  message: string,
  options: { limits?: typeof TIGHT; now?: () => number } = {},
): void {
  const result = attack(source, options.limits ?? TIGHT, options.now);
  assert.ok(!result.ok, `${message}: la rutina debía cortarse`);
  assert.equal(!result.ok && result.failure.kind, "abort", `${message}: debía ser un corte de sandbox`);
  assert.equal(!result.ok && result.failure.reason, reason, `${message}: motivo del corte`);
  // Un corte tiene que DECIR lo que pasó, no salir en silencio.
  assert.ok(!result.ok && result.failure.message.length > 20, `${message}: el corte debe explicarse`);
  checks += 4;
}

// --- recursión infinita ---------------------------------------------------------
{
  abortsWith("(progn (defun f () (f)) (f))", "depth", "recursión sin fondo");
  // Y la mutua, que es la que se escapa de los guardias ingenuos.
  abortsWith("(progn (defun a () (b)) (defun b () (a)) (a))", "depth", "recursión mutua");
}

// --- bucle infinito que no asigna nada -------------------------------------------
{
  // Sin contador de PASOS, este bucle no toca memoria y ningún otro límite lo ve.
  abortsWith("(while T)", "steps", "bucle infinito sin asignación");
  abortsWith("(progn (defun f () (while T (setq x 1))) (f))", "steps", "bucle con asignación trivial");
}

// --- diez millones de elementos ---------------------------------------------------
{
  abortsWith("(repeat 10000000 (setq l (cons 1 l)))", "cells", "lista de diez millones",
    { limits: MEMORY_TIGHT });
  // El acumulador que dobla su tamaño: veinticinco pasos, treinta y tres
  // millones de celdas. Sólo el cargo por celda lo ve venir.
  abortsWith("(repeat 25 (setq l (append l (cons 1 l))))", "cells", "lista que se dobla",
    { limits: MEMORY_TIGHT });
}

// --- cadenas que se doblan --------------------------------------------------------
{
  // `(repeat 30 (setq s (strcat s s)))` son treinta pasos y mil millones de
  // caracteres. Cobrar las cadenas por longitud es lo único que lo detiene.
  abortsWith('(progn (setq s "0123456789") (repeat 30 (setq s (strcat s s))))',
    "cells", "cadena que dobla su longitud", { limits: MEMORY_TIGHT });
}

// --- el reloj, con un tiempo inyectado --------------------------------------------
{
  // Un trabajo que consume pocos pasos y mucho reloj: el respaldo honesto. El
  // reloj se inyecta para que la spec sea determinista y no dependa de la
  // máquina — un `Date.now` real haría que este bloque fallara en un runner
  // cargado y pasara en un portátil rápido.
  let tick = 0;
  const now = () => {
    tick += 1_000;
    return tick;
  };
  abortsWith("(progn (setq x 0) (while T (setq x (+ x 1))))", "time", "presupuesto de reloj",
    { limits: { ...TIGHT, maxSteps: 50_000_000 }, now });
}

// --- LA propiedad: el corte NO se puede capturar -------------------------------------
{
  // Una rutina hostil intenta tragarse el corte y seguir. Si `vl-catch-all-apply`
  // atrapara `LispAbort`, este bucle giraría para siempre: cada aborto quedaría
  // capturado y el siguiente empezaría de cero.
  const result = attack("(progn (defun f () (f)) (while T (vl-catch-all-apply 'f nil)))");
  assert.ok(!result.ok, "la rutina hostil se corta");
  assert.equal(!result.ok && result.failure.kind, "abort",
    "el corte atraviesa vl-catch-all-apply en vez de quedarse capturado");
  checks += 2;

  // Y un error CORRIENTE sí se sigue capturando: el sandbox no rompe la
  // semántica del lenguaje, sólo se pone por encima de ella.
  const normal = attack("(vl-catch-all-error-p (vl-catch-all-apply '/ '(1 0)))");
  assert.ok(normal.ok, "un error de programa se captura como siempre");
  checks += 1;
}

// --- el manejador *error* tampoco resucita una rutina cortada --------------------------
{
  const session = new LispSession({ builtins: CORE_LISP_BUILTINS, limits: TIGHT });
  const result = session.run('(progn (defun *error* (msg) (princ "el manejador corrió")) (while T))');
  assert.ok(!result.ok && result.failure.kind === "abort", "el corte se reporta como corte");
  assert.equal(session.output, "", "y *error* NO se ejecuta tras un corte de presupuesto");
  checks += 2;
}

// --- redefinir una función del sistema no sale de la sesión -----------------------------
{
  const hostile = new LispSession({ builtins: CORE_LISP_BUILTINS });
  hostile.run("(setq car 5)");
  const broken = hostile.run("(car '(1 2))");
  assert.ok(!broken.ok, "en SU sesión, la rutina se ha roto `car` — igual que en AutoCAD");
  checks += 1;

  const fresh = new LispSession({ builtins: CORE_LISP_BUILTINS });
  assert.equal(fresh.evaluateToText("(car '(1 2))"), "1",
    "y la sesión siguiente arranca con la tabla intacta: el destrozo no se propaga");
  checks += 1;

  // La tabla compartida no se ha tocado: la comprobación directa, por si algún
  // camino futuro escribiera en ella por descuido.
  const carEntry = CORE_LISP_BUILTINS.get("CAR");
  assert.equal(carEntry?.t, "subr", "la tabla base sigue teniendo CAR como función");
  checks += 1;
}

// --- el medidor, directamente ------------------------------------------------------------
{
  const meter = new LispMeter({ maxSteps: 3, maxCells: 10, maxDepth: 2, maxMillis: 1_000 }, () => 0);
  meter.step();
  meter.step();
  meter.step();
  assert.throws(() => meter.step(), /pasos/, "el cuarto paso corta");
  checks += 1;
  // Envenenado: cualquier cargo posterior vuelve a lanzar, así que un `finally`
  // de la rutina no puede seguir computando después del corte.
  assert.throws(() => meter.charge(1), /pasos/, "el medidor queda envenenado tras el corte");
  checks += 1;

  const deep = new LispMeter({ ...DEFAULT_LISP_BUDGET, maxDepth: 2 }, () => 0);
  deep.enter();
  deep.enter();
  assert.throws(() => deep.enter(), /recursión/, "la profundidad se corta con su propio mensaje");
  checks += 1;
  // `leave` funciona incluso envenenado: el desmontaje de la pila no puede
  // lanzar un segundo error encima del primero.
  deep.leave();
  checks += 1;

  const cancelled = new LispMeter(DEFAULT_LISP_BUDGET, () => 0);
  cancelled.cancel("Esc del usuario");
  assert.throws(() => cancelled.step(), /Esc del usuario/, "el corte externo se propaga");
  checks += 1;
}

// --- lo que NO se corta: una rutina de verdad cabe de sobra ---------------------------------
{
  // Un bucle de mil iteraciones construyendo listas es trabajo normal de una
  // rutina de numeración de ejes. Si el presupuesto por defecto lo cortara, el
  // sandbox sería inútil por otra razón.
  const result = new LispSession({ builtins: CORE_LISP_BUILTINS }).run(
    "(progn (setq l nil) (repeat 1000 (setq l (cons (list 1 2 3) l))) (length l))",
  );
  assert.ok(result.ok, "mil iteraciones con listas caben en el presupuesto por defecto");
  assert.equal(result.ok && result.value.t === "int" && result.value.v, 1000, "y el resultado es correcto");
  checks += 2;
}

console.log(`budget: ${checks} aserciones verdes (recursión, bucles, diez millones de celdas, reloj inyectado, el corte NO se captura, redefinir car no sale de la sesión).`);
