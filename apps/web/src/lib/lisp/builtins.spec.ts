/**
 * Las funciones de sistema del núcleo, con anclas de VALOR.
 *
 * Cada aserción fija un resultado concreto. Es deliberado: una propiedad como
 * «`substr` devuelve una subcadena» la cumple una implementación que cuente
 * desde 0 igual que una que cuente desde 1, y la diferencia entre las dos es un
 * carácter perdido en cada etiqueta de cada plano.
 */
import { strict as assert } from "node:assert";
import { CORE_LISP_BUILTINS } from "./core-builtins";
import { LispSession } from "./session";

let checks = 0;
function evalText(source: string): string {
  return new LispSession({ builtins: CORE_LISP_BUILTINS }).evaluateToText(source);
}
function eq(source: string, expected: string, message: string): void {
  assert.equal(evalText(source), expected, `${message} — ${source}`);
  checks += 1;
}

// --- listas -------------------------------------------------------------------
{
  eq("(car '(1 2 3))", "1", "car");
  eq("(cdr '(1 2 3))", "(2 3)", "cdr");
  eq("(car nil)", "nil", "car de nil es nil, no un error");
  eq("(cadr '(1 2 3))", "2", "cadr es la Y de un punto");
  eq("(caddr '(1 2 3))", "3", "caddr es la Z");
  eq("(cons 1 2)", "(1 . 2)", "cons de dos átomos es un par PUNTEADO");
  eq("(cons 1 '(2))", "(1 2)", "cons sobre una lista la extiende");
  eq("(list 1 2 3)", "(1 2 3)", "list");
  eq("(append '(1 2) '(3))", "(1 2 3)", "append");
  eq("(append)", "nil", "append sin argumentos");
  eq("(length '(1 2 3))", "3", "length");
  eq("(length nil)", "0", "length de nil");
  eq("(nth 1 '(a b c))", "B", "nth cuenta desde CERO");
  eq("(nth 9 '(a b c))", "nil", "nth fuera de rango es nil");
  eq("(last '(1 2 3))", "3", "last");
  eq("(reverse '(1 2 3))", "(3 2 1)", "reverse");
  eq("(member 'b '(a b c))", "(B C)", "member devuelve la COLA, no T");
  eq("(member 'z '(a b c))", "nil", "member sin coincidencia");
  eq("(vl-remove 2 '(1 2 3 2))", "(1 3)", "vl-remove quita todas las apariciones");
  eq("(vl-position 'c '(a b c))", "2", "vl-position");
}

// --- assoc y subst: el corazón de las rutinas de entidad -------------------------
{
  eq('(assoc 0 \'((0 . "LINE") (8 . "MUROS")))', '(0 . "LINE")', "assoc encuentra el par");
  eq('(cdr (assoc 8 \'((0 . "LINE") (8 . "MUROS"))))', '"MUROS"', "y su cdr es el valor");
  eq("(assoc 99 '((0 . \"LINE\")))", "nil", "assoc sin coincidencia es nil");
  // Entero y real NO son la misma clave: `(assoc 10 ...)` no debe encontrar 10.0.
  eq("(assoc 10 '((10.0 . 1)))", "nil", "la clave entera no coincide con la real");
  eq("(assoc '(1 2) '(((1 2) . x)))", "((1 2) . X)", "assoc compara con equal, así que admite claves lista");
  eq('(subst (cons 8 "NUEVA") (cons 8 "VIEJA") \'((0 . "LINE") (8 . "VIEJA")))',
    '((0 . "LINE") (8 . "NUEVA"))', "subst cambia el par de capa: el gesto de entmod");
  eq("(subst 9 1 '(1 (1 2)))", "(9 (9 2))", "subst entra en las sublistas");
}

// --- cadenas -----------------------------------------------------------------------
{
  eq('(strcat "a" "b" "c")', '"abc"', "strcat");
  eq("(strcat)", '""', "strcat sin argumentos es la cadena vacía");
  eq('(strlen "hola")', "4", "strlen");
  eq('(substr "abcdef" 3)', '"cdef"', "substr cuenta desde UNO");
  eq('(substr "abcdef" 3 2)', '"cd"', "substr con longitud");
  eq('(substr "abc" 10)', '""', "substr más allá del final");
  eq('(strcase "AbC")', '"ABC"', "strcase a mayúsculas por defecto");
  eq('(strcase "AbC" T)', '"abc"', "el segundo argumento pide MINÚSCULAS");
  eq("(itoa 42)", '"42"', "itoa");
  eq('(atoi "12abc")', "12", "atoi lee el prefijo numérico");
  eq('(atoi "abc")', "0", "atoi sin número es 0, no un error");
  eq('(atof "3.5m")', "3.5", "atof lee el prefijo real");
  eq("(chr 65)", '"A"', "chr");
  eq('(ascii "A")', "65", "ascii");
  eq('(vl-string-search "cd" "abcdef")', "2", "vl-string-search");
  eq('(vl-string-trim " " "  hola  ")', '"hola"', "vl-string-trim");
  eq('(vl-string-subst "X" "b" "abc")', '"aXc"', "vl-string-subst");
}

// --- rtos y angtos: cómo se escribe un número en el plano ---------------------------
{
  eq("(rtos 123.456)", '"123.46"', "rtos decimal con dos decimales por defecto");
  eq("(rtos 123.456 2 1)", '"123.5"', "rtos decimal con precisión");
  // Modo 4 (arquitectónico) interpreta el valor en PULGADAS, como AutoCAD.
  eq("(rtos 18.5 4 4)", "\"1'-6 1/2\\\"\"", "rtos arquitectónico con dieciseisavos");
  eq("(rtos 18.5 3 2)", "\"1'-6.50\\\"\"", "rtos de ingeniería");
  eq("(angtos 0)", '"0.0000"', "angtos en grados decimales");
  eq("(angtos (/ pi 4) 0 2)", '"45.00"', "un octavo de vuelta son 45 grados");
  eq("(angtos (/ pi 4) 1 0)", "\"45d0'0\\\"\"", "angtos en grados, minutos y segundos");
  eq("(angtos (/ pi 4) 3 4)", '"0.7854r"', "angtos en radianes");
  eq("(angtos 0 4 0)", '"E"', "angtos como rumbo: el cero es Este");
  eq("(angtos (/ pi 4) 4 0)", "\"N 45d0'0\\\" E\"", "y 45 grados es N45E");
}

// --- predicados y geometría -----------------------------------------------------------
{
  eq("(numberp 1)", "T", "numberp");
  eq('(numberp "1")', "nil", "una cadena no es un número");
  eq("(listp nil)", "T", "nil es una lista");
  eq("(atom 'a)", "T", "un símbolo es átomo");
  eq("(atom '(1))", "nil", "una lista no lo es");
  eq("(eq 1 1)", "T", "eq sobre enteros iguales");
  eq("(eq 1 1.0)", "nil", "pero un entero NO es eq a un real");
  eq("(equal '(1 2) '(1 2))", "T", "equal compara estructura");
  eq("(eq '(1 2) '(1 2))", "nil", "eq sobre dos listas distintas es nil");
  eq("(equal 1.0 1.001 0.01)", "T", "equal con tolerancia");
  eq("(distance '(0 0) '(3 4))", "5.0", "distancia pitagórica");
  eq("(angle '(0 0) '(1 0))", "0.0", "el ángulo del eje X es cero");
  eq("(angle '(0 0) '(0 -1))", evalText("(* 1.5 pi)"), "el ángulo se normaliza a [0, 2pi)");
  eq("(polar '(0 0) 0 10)", "(10.0 0.0 0.0)", "polar sobre el eje X");
  eq("(inters '(0 0) '(10 0) '(5 -5) '(5 5))", "(5.0 0.0 0.0)", "intersección dentro de los segmentos");
  eq("(inters '(0 0) '(1 0) '(5 -5) '(5 5))", "nil", "fuera de los segmentos es nil");
  eq("(inters '(0 0) '(1 0) '(5 -5) '(5 5) nil)", "(5.0 0.0 0.0)", "con rectas infinitas sí corta");
  eq("(inters '(0 0) '(1 0) '(0 1) '(1 1) nil)", "nil", "paralelas no cortan, y no dan infinito");
}

// --- `type`, y por qué distingue lo que distingue --------------------------------------
{
  eq("(type 1)", "INT", "type de un entero");
  eq("(type 1.0)", "REAL", "type de un real");
  eq('(type "a")', "STR", "type de una cadena");
  eq("(type 'a)", "SYM", "type de un símbolo");
  eq("(type '(1))", "LIST", "type de una lista");
  eq("(type nil)", "nil", "type de nil es nil");
  eq("(type car)", "SUBR", "type de una función de sistema");
}

// --- `read` produce datos inertes, no ejecuta nada ---------------------------------------
{
  eq('(read "(+ 1 2)")', "(+ 1 2)", "read devuelve la EXPRESIÓN, sin evaluarla");
  eq('(eval (read "(+ 1 2)"))', "3", "y eval la evalúa con este mismo intérprete");
}

console.log(`builtins: ${checks} aserciones verdes (listas, assoc/subst, cadenas, rtos/angtos, geometría de puntos).`);
