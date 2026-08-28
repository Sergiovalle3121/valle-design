import assert from "node:assert/strict";
import { ROSTER_MAX, parseRoster, rosterRejectionText } from "./roster";

let comprobaciones = 0;
function check(condicion: boolean, mensaje: string): void {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
}
function equal<T>(actual: T, esperado: T, mensaje: string): void {
  assert.deepStrictEqual(actual, esperado, mensaje);
  comprobaciones += 1;
}

// ── LAS FORMAS QUE LLEGAN DE VERDAD ─────────────────────────────────────────
{
  const r = parseRoster("ana@alumnos.unam.mx, luis@alumnos.unam.mx");
  equal(r.emails, ["ana@alumnos.unam.mx", "luis@alumnos.unam.mx"], "separados por coma");
  equal(r.rejected.length, 0, "nada que descartar");
}
{
  const r = parseRoster("ana@x.mx;luis@x.mx\npau@x.mx");
  equal(r.emails, ["ana@x.mx", "luis@x.mx", "pau@x.mx"], "punto y coma y salto de línea");
}
{
  const r = parseRoster("Ana Ruiz <ana@x.mx>\nLuis Pérez <luis@x.mx>");
  equal(r.emails, ["ana@x.mx", "luis@x.mx"], "nombre y correo entre ángulos");
}
{
  // La fila de hoja de cálculo: nombre en una columna, correo en otra.
  const r = parseRoster("Ana Ruiz\tana@x.mx\nLuis Pérez\tluis@x.mx");
  equal(r.emails, ["ana@x.mx", "luis@x.mx"], "columnas separadas por tabulador");
}
{
  // Un nombre con espacios NO es un separador: si lo fuera, «Ana Ruiz» daría
  // dos entradas rotas y el profesor vería descartes que no existen.
  const r = parseRoster("Ana Ruiz <ana@x.mx>");
  equal(r.emails.length, 1, "el espacio no separa entradas");
  equal(r.rejected.length, 0, "y no inventa descartes");
}

// ── LIMPIEZA Y DUPLICADOS ───────────────────────────────────────────────────
{
  const r = parseRoster("  ANA@X.MX  \nana@x.mx\nAna@X.mx");
  equal(r.emails, ["ana@x.mx"], "normaliza a minúsculas");
  equal(r.rejected.length, 2, "los dos repetidos se declaran");
  equal(r.rejected[0].reason, "duplicado", "con su motivo");
}
{
  const r = parseRoster('"ana@x.mx".\nluis@x.mx,');
  equal(r.emails, ["ana@x.mx", "luis@x.mx"], "quita comillas y puntuación pegada");
}

// ── LO QUE SE DESCARTA, Y POR QUÉ SE DEVUELVE ───────────────────────────────
{
  const r = parseRoster("ana@x.mx\nsin arroba\n@\nluis@sinpunto\nvale@x.mx");
  equal(r.emails, ["ana@x.mx", "vale@x.mx"], "sólo pasan los correos con forma");
  equal(r.rejected.length, 3, "tres descartes");
  check(
    r.rejected.every((descarte) => descarte.reason === "sin-correo"),
    "y todos por no tener correo",
  );
  // El texto original vuelve para que se pueda encontrar en la lista pegada.
  equal(r.rejected[0].raw, "sin arroba", "el descarte conserva la línea original");
}
{
  // La acusación: `@` a secas no es un correo. Es el mismo defecto que la lista
  // de operadores tuvo en su primer corte.
  equal(parseRoster("@").emails.length, 0, "«@» a secas no entra");
  equal(parseRoster("a@b").emails.length, 0, "sin punto en el dominio no entra");
}

// ── EL TOPE, DECLARADO Y NO SILENCIOSO ──────────────────────────────────────
{
  const muchos = Array.from({ length: 105 }, (_, i) => `alumno${i}@x.mx`).join("\n");
  const r = parseRoster(muchos);
  equal(r.emails.length, ROSTER_MAX, "corta en el tope");
  equal(r.truncated, 5, "y dice cuántos quedaron fuera");
}
{
  const r = parseRoster("a@x.mx\nb@x.mx\nc@x.mx", 2);
  equal(r.emails, ["a@x.mx", "b@x.mx"], "el tope es configurable");
  equal(r.truncated, 1, "un correo válido fuera del tope");
}

// ── VACÍO ───────────────────────────────────────────────────────────────────
{
  const r = parseRoster("   \n\n , ; \n");
  equal(r.emails.length, 0, "sin correos");
  equal(r.rejected.length, 0, "y sin descartes: no había nada que descartar");
}

equal(rosterRejectionText("duplicado"), "repetido en la lista", "texto del duplicado");
equal(rosterRejectionText("sin-correo"), "no se encontró un correo", "texto del descarte");

console.log(`roster: ${comprobaciones} comprobaciones OK`);
