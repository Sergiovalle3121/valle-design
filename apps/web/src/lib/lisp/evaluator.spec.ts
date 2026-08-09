/**
 * El evaluador: formas especiales, ámbito dinámico y errores.
 *
 * ## Por qué hay anclas absolutas y no sólo propiedades
 *
 * Una propiedad de ida y vuelta se cumple de forma VACÍA si el código nunca
 * toca el campo. «Evaluar y volver a imprimir devuelve lo mismo» es cierto para
 * un evaluador que no evalúe nada. Así que cada bloque afirma VALORES
 * CONCRETOS: `(/ 7 2)` es `3`, `(/ 7 2.0)` es `3.5`, y una variable local
 * recupera exactamente el valor que tenía antes de la llamada.
 */
import { strict as assert } from "node:assert";
import { CORE_LISP_BUILTINS } from "./core-builtins";
import { LispSession } from "./session";

let checks = 0;
function evalText(source: string): string {
  const session = new LispSession({ builtins: CORE_LISP_BUILTINS });
  return session.evaluateToText(source);
}
function eq(source: string, expected: string, message: string): void {
  assert.equal(evalText(source), expected, `${message} — ${source}`);
  checks += 1;
}
function fails(source: string, fragment: string, message: string): void {
  const session = new LispSession({ builtins: CORE_LISP_BUILTINS });
  const result = session.run(source);
  assert.ok(!result.ok, `${message}: debería fallar — ${source}`);
  assert.ok(
    !result.ok && result.failure.message.includes(fragment),
    `${message}: el mensaje debía contener "${fragment}" y fue "${!result.ok ? result.failure.message : ""}"`,
  );
  checks += 2;
}

// --- entero y real son tipos distintos, y se nota ------------------------------
{
  eq("(/ 7 2)", "3", "división entera trunca");
  eq("(/ 7 2.0)", "3.5", "un real contagia toda la operación");
  eq("(/ 7.0 2)", "3.5", "el contagio no depende del orden");
  eq("(+ 1 2)", "3", "suma entera");
  eq("(+ 1 2.0)", "3.0", "suma contagiada, e impresa con .0");
  eq("(* 3 4)", "12", "producto entero");
  eq("(- 5)", "-5", "menos unario");
  eq("(expt 2 10)", "1024", "potencia entera");
  eq("(expt 2 -1)", "0.5", "exponente negativo da real aunque la base sea entera");
  eq("(fix 3.9)", "3", "fix trunca hacia cero");
  eq("(float 3)", "3.0", "float convierte a real");
  eq("(rem 7 2)", "1", "resto entero");
  eq("(abs -4.5)", "4.5", "valor absoluto conserva el tipo");
  fails("(/ 1 0)", "divide by zero", "dividir por cero es un error, no infinito");
  fails("(sqrt -1)", "bad argument type", "la raíz de un negativo no puede colarse como NaN");
}

// --- verdad y falsedad ----------------------------------------------------------
{
  eq("(if nil 1 2)", "2", "nil es falso");
  eq("(if 0 1 2)", "1", "el cero es VERDADERO en LISP");
  eq('(if "" 1 2)', "1", "la cadena vacía también");
  eq("(if (null nil) 1 2)", "1", "null detecta la lista vacía");
  eq("(and 1 2 3)", "T", "and devuelve T");
  eq("(and 1 nil 3)", "nil", "and corta en el primer falso");
  eq("(or nil nil)", "nil", "or sin verdaderos es nil");
  eq("(or nil 5)", "T", "or devuelve T cuando encuentra uno");
}

// --- control ---------------------------------------------------------------------
{
  eq("(progn 1 2 3)", "3", "progn devuelve el último");
  eq("(cond ((= 1 2) 'a) ((= 1 1) 'b))", "B", "cond elige la primera cláusula cierta");
  eq("(cond (nil 'a))", "nil", "cond sin cláusula cierta es nil");
  eq("(cond (5))", "5", "una cláusula sin cuerpo devuelve su prueba");
  eq("(progn (setq n 0) (while (< n 5) (setq n (1+ n))) n)", "5", "while itera");
  eq("(progn (setq s 0) (repeat 4 (setq s (+ s 2))) s)", "8", "repeat repite N veces");
  eq("(repeat 0 99)", "nil", "repeat cero veces no evalúa el cuerpo");
  eq("(progn (setq s 0) (foreach x '(1 2 3) (setq s (+ s x))) s)", "6", "foreach recorre");
  // `foreach` no debe filtrar su variable de control al ámbito exterior.
  eq("(progn (setq x 99) (foreach x '(1 2) x) x)", "99",
    "foreach restaura la variable de control al salir");
}

// --- defun, locales y la barra ---------------------------------------------------
{
  eq("(progn (defun doble (n) (* 2 n)) (doble 21))", "42", "defun define y se llama");
  eq("(progn (defun f () 7) (f))", "7", "una función sin argumentos");
  // LA prueba de los locales: `tmp` vale 1 fuera, la rutina lo pisa, y al
  // volver sigue valiendo 1. Sin la barra, valdría 99.
  eq("(progn (setq tmp 1) (defun f ( / tmp) (setq tmp 99)) (f) tmp)", "1",
    "una variable declarada tras la barra se restaura al salir");
  eq("(progn (setq tmp 1) (defun f () (setq tmp 99)) (f) tmp)", "99",
    "y sin declararla, la rutina ensucia el ámbito global — como en el original");
  // Los argumentos también son locales.
  eq("(progn (setq a 1) (defun f (a) a) (f 5) a)", "1", "los argumentos se restauran");
  // Ámbito DINÁMICO: la función llamada ve la local de quien la llamó.
  eq("(progn (defun usa () (* 10 escala)) (defun ajusta ( / escala) (setq escala 2) (usa)) (ajusta))",
    "20", "el ámbito es dinámico: la llamada ve las locales de quien llama");
  // Y restaurar ocurre también cuando la rutina falla a mitad.
  eq("(progn (setq tmp 1) (defun f ( / tmp) (setq tmp 99) (/ 1 0)) (vl-catch-all-apply 'f nil) tmp)",
    "1", "un fallo a mitad no deja las locales contaminadas");
  fails("(progn (defun f (a b) a) (f 1))", "too few arguments", "faltan argumentos");
  fails("(progn (defun f (a) a) (f 1 2))", "too many arguments", "sobran argumentos");
}

// --- lambda y funciones de orden superior ------------------------------------------
{
  eq("((lambda (x) (* x x)) 6)", "36", "un lambda aplicado en el sitio");
  eq("(mapcar '(lambda (x) (* x 2)) '(1 2 3))", "(2 4 6)", "mapcar con lambda citado");
  eq("(mapcar '+ '(1 2) '(10 20))", "(11 22)", "mapcar con dos listas");
  eq("(mapcar '+ '(1 2 3) '(10 20))", "(11 22)", "mapcar para en la lista más corta");
  eq("(apply '+ '(1 2 3))", "6", "apply extiende la lista como argumentos");
  eq("(apply 'strcat '(\"a\" \"b\"))", '"ab"', "apply sobre cadenas");
  eq("(vl-sort '(3 1 2) '<)", "(1 2 3)", "vl-sort con comparador de sistema");
  eq("(vl-sort '(3 1 2) '(lambda (a b) (> a b)))", "(3 2 1)", "vl-sort con lambda del usuario");
  eq("(vl-every 'numberp '(1 2 3))", "T", "vl-every");
  eq("(vl-some 'numberp '(\"a\" 2))", "T", "vl-some devuelve el primer verdadero");
}

// --- quote y backquote --------------------------------------------------------------
{
  eq("'(1 2 3)", "(1 2 3)", "quote no evalúa");
  eq("(progn (setq b 2) `(1 ,b 3))", "(1 2 3)", "la coma evalúa dentro del backquote");
  eq("(progn (setq c '(3 4)) `(1 2 ,@c))", "(1 2 3 4)", "coma-arroba injerta la lista");
  eq("(progn (setq b 9) `(a (b ,b)))", "(A (B 9))", "el backquote entra en las sublistas");
  fails(",x", "fuera de un backquote", "una coma suelta es un error");
}

// --- errores del programa y su manejador ----------------------------------------------
{
  eq("(vl-catch-all-error-p (vl-catch-all-apply '/ '(1 0)))", "T", "la división por cero se captura");
  eq("(vl-catch-all-error-message (vl-catch-all-apply '/ '(1 0)))", '"divide by zero"',
    "y el mensaje es el del original");
  eq("(vl-catch-all-apply '+ '(1 2))", "3", "sin fallo, devuelve el valor");
  eq("(vl-catch-all-error-p 5)", "nil", "un valor normal no es un error capturado");

  // `*error*` recibe el mensaje y puede imprimir.
  const session = new LispSession({ builtins: CORE_LISP_BUILTINS });
  const result = session.run('(progn (defun *error* (msg) (princ (strcat "capturado: " msg))) (/ 1 0))');
  assert.ok(!result.ok, "la rutina falla igualmente");
  assert.equal(session.output, "capturado: divide by zero", "*error* recibió el mensaje");
  checks += 2;

  // Un `*error*` roto NO puede tapar el error original.
  const broken = new LispSession({ builtins: CORE_LISP_BUILTINS });
  const brokenResult = broken.run("(progn (defun *error* (msg) (/ 1 0)) (car))");
  assert.ok(!brokenResult.ok, "sigue fallando");
  assert.ok(
    !brokenResult.ok && brokenResult.failure.message.includes("too few arguments"),
    `el error reportado es el ORIGINAL, no el del manejador: ${!brokenResult.ok ? brokenResult.failure.message : ""}`,
  );
  checks += 2;
}

// --- símbolo sin ligar, y funciones que no existen ---------------------------------------
{
  eq("nunca-definido", "nil", "un símbolo sin ligar vale nil, como el original");
  fails("(nunca-definido 1)", "no function definition", "llamar a lo que no existe sí falla");
  fails("(setq 1 2)", "bad argument type", "setq exige un símbolo");
  fails("(setq a)", "número impar", "setq exige pares");
}

// --- las formas especiales están reservadas ------------------------------------------------
{
  // Una rutina puede LIGAR el símbolo `if`, pero no puede secuestrar la
  // condicional del intérprete debajo de otra rutina.
  eq("(progn (setq if 5) (if t 'si 'no))", "SI",
    "redefinir `if` como variable no cambia la forma especial");
  eq("(progn (setq if 5) if)", "5", "y el símbolo sí queda ligado");
}

// --- salida ------------------------------------------------------------------------------
{
  const session = new LispSession({ builtins: CORE_LISP_BUILTINS });
  session.run('(progn (princ "hola ") (princ 42) (terpri) (prompt "fin"))');
  assert.equal(session.output, "hola 42\nfin", "princ escribe sin comillas y prompt también");
  checks += 1;

  const quoted = new LispSession({ builtins: CORE_LISP_BUILTINS });
  quoted.run('(prin1 "hola")');
  assert.equal(quoted.output, '"hola"', "prin1 escribe legible, con comillas");
  checks += 1;
}

console.log(`evaluator: ${checks} aserciones verdes (tipos numéricos, control, ámbito dinámico, locales, backquote, *error*).`);
