/**
 * El lector, con las trampas que tiene leer AutoLISP de verdad.
 *
 * Las aserciones no son «parsea una lista»: son las distinciones que, si se
 * pierden, producen geometría equivocada sin dar error. Entero frente a real.
 * El punto del par frente al punto decimal. Los dos tipos de comentario que
 * llevan las cabeceras de las rutinas comerciales.
 */
import { strict as assert } from "node:assert";
import { LispSyntaxError, readLispForm, readLispForms, tokenizeLisp } from "./reader";
import { printLisp } from "./printer";
import { properList, toArray, type LispValue } from "./values";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// --- números: la forma escrita decide el tipo --------------------------------
{
  const forms = readLispForms("1 1.0 .5 -3 2. 1e3 1.5e-3 +7");
  eq(forms.map((form) => form.t), ["int", "real", "real", "int", "real", "real", "real", "int"],
    "el tipo lo decide la escritura, no el valor");
  eq(printLisp(forms[1]), "1.0", "un real de valor entero se imprime con .0");
  eq((forms[0] as { v: number }).v, 1, "el entero conserva su valor");
  eq((forms[4] as { v: number }).v, 2, "`2.` es el real 2.0");
  eq((forms[6] as { v: number }).v, 0.0015, "el exponente negativo se lee");
}

// --- el punto es dos cosas distintas ------------------------------------------
{
  const dotted = readLispForm('(0 . "LINE")');
  eq(properList(dotted), null, "un par punteado NO es una lista propia");
  eq(printLisp(dotted), '(0 . "LINE")', "y se vuelve a imprimir como par punteado");

  const decimal = readLispForm("(.5 .25)");
  eq(toArray(decimal).map((form) => form.t), ["real", "real"],
    "`.5` dentro de una lista sigue siendo un decimal, no un punto de par");

  const symbolWithDot = readLispForm("acad.version");
  eq(printLisp(symbolWithDot), "ACAD.VERSION", "un punto interior no parte el símbolo");
}

// --- comentarios ---------------------------------------------------------------
{
  const forms = readLispForms(`
    ; cabecera de la rutina
    (setq a 1) ; al final de la línea
    ;| bloque
       de varias líneas |;
    (setq b 2)
  `);
  eq(forms.length, 2, "los comentarios no producen formas");
  eq(printLisp(forms[1]), "(SETQ B 2)", "y no se comen lo que viene después");

  const nested = readLispForms(";| a ;| b |; c |; (setq x 1)");
  eq(nested.length, 1, "los bloques de comentario anidan");
}

// --- cadenas y escapes ---------------------------------------------------------
{
  const forms = readLispForms('"a\\nb" "c\\\\d" "\\101" "con \\"comillas\\""');
  const values = forms.map((form) => (form as { v: string }).v);
  eq(values[0], "a\nb", "\\n es un salto de línea");
  eq(values[1], "c\\d", "\\\\ es una barra");
  eq(values[2], "A", "el octal \\101 es la A");
  eq(values[3], 'con "comillas"', "las comillas escapadas entran en el contenido");
  // `prin1` tiene que devolver algo que se pueda volver a leer.
  eq(printLisp(readLispForm(printLisp(forms[3]))), printLisp(forms[3]),
    "prin1 produce texto que el lector vuelve a aceptar");
}

// --- quote y backquote ---------------------------------------------------------
{
  eq(printLisp(readLispForm("'(a b)")), "(QUOTE (A B))", "la comilla es azúcar de QUOTE");
  eq(printLisp(readLispForm("`(a ,b ,@c)")),
    "(BACKQUOTE (A (UNQUOTE B) (UNQUOTE-SPLICE C)))",
    "backquote, coma y coma-arroba tienen su forma explícita");
}

// --- símbolos en mayúsculas, cadenas no ----------------------------------------
{
  const forms = readLispForms('(SetQ Nombre "Sergio")');
  const items = toArray(forms[0]);
  eq(printLisp(items[0]), "SETQ", "el símbolo se interna en mayúsculas");
  eq(printLisp(items[1]), "NOMBRE", "y también el nombre de variable");
  eq(printLisp(items[2]), '"Sergio"', "la cadena conserva sus mayúsculas");
  eq(printLisp(readLispForm("nil")), "nil", "nil se lee como el nil canónico");
}

// --- errores de sintaxis: se rechaza DICIENDO dónde -----------------------------
{
  const cases: Array<[string, string]> = [
    ["(setq a 1", "paréntesis sin cerrar"],
    ['(setq a "sin cerrar', "cadena sin cerrar"],
    ["(setq a 1))", "cierre sobrante"],
    ["(. 1)", "par punteado sin car"],
    ["(1 . 2 3)", "par punteado con dos cdr"],
    [";| sin cerrar", "comentario de bloque sin cerrar"],
  ];
  for (const [source, what] of cases) {
    let failure: unknown = null;
    try {
      readLispForms(source);
    } catch (cause) {
      failure = cause;
    }
    ok(failure instanceof LispSyntaxError, `${what} debe fallar como error de sintaxis`);
    ok(/línea \d+, columna \d+/.test((failure as Error).message),
      `${what} debe decir línea y columna`);
  }
}

// --- una expresión por renglón en la línea de comandos --------------------------
{
  assert.throws(() => readLispForm("(setq a 1) (setq b 2)"), LispSyntaxError);
  checks += 1;
  eq(printLisp(readLispForm("  (+ 1 2)  ")), "(+ 1 2)", "los espacios sobrantes no molestan");
}

// --- fichas: el léxico se puede mirar directamente -------------------------------
{
  const tokens = tokenizeLisp("(a . b)");
  eq(tokens.map((token) => token.kind), ["open", "atom", "dot", "atom", "close"],
    "el punto aislado produce su propia ficha");
  const positions = tokenizeLisp("(a\n  b)").map((token) => token.position.line);
  eq(positions, [1, 1, 2, 2], "las posiciones siguen los saltos de línea");
}

// --- una lista larga se lee sin recursión desbordada -----------------------------
{
  const source = `(${Array.from({ length: 20_000 }, (_, index) => index).join(" ")})`;
  const parsed: LispValue = readLispForm(source);
  eq(toArray(parsed).length, 20_000, "veinte mil elementos se leen sin desbordar la pila");
}

console.log(`reader: ${checks} aserciones verdes (números, par punteado, comentarios, escapes, backquote, errores con posición).`);
