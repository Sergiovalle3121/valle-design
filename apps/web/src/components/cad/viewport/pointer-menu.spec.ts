/**
 * Lo que ofrece el botón derecho a mitad de un comando.
 *
 * El defecto que cierra, medido el 2026-09-22: con LINE abierto y dos puntos
 * puestos, el derecho abría un menú de UN renglón que decía «desHacer». Ni
 * aceptar ni cancelar. Quien viene de AutoCAD pulsa el derecho para CERRAR lo
 * que está dibujando, y ese gesto no existía en cuanto el paso ofrecía una
 * opción: había que soltar el ratón e ir al teclado.
 *
 * Correr: npx tsx src/components/cad/viewport/pointer-menu.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadKeyword } from "@/lib/cad/engine/command-types";
import { cadPointerMenuEntries } from "./pointer-menu";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

/** Las palabras clave que ofrece LINE con dos puntos puestos. */
const lineaConDosPuntos: readonly CadKeyword[] = [
  { keyword: "Cerrar", shortcut: "c", label: "Cerrar" },
  { keyword: "desHacer", shortcut: "h", label: "desHacer" },
];

// ── Sin opciones no hay menú: el derecho vale por Intro ─────────────────────
eq(
  cadPointerMenuEntries([]).length,
  0,
  "sin palabras clave no se abre menú: el botón derecho vale por Intro y un menú de un renglón sería peor",
);

// ── Con opciones: aceptar primero, cancelar al final ────────────────────────
{
  const entradas = cadPointerMenuEntries(lineaConDosPuntos);
  eq(entradas.length, 4, "aceptar + las dos palabras clave + cancelar");
  eq(entradas[0].label, "Aceptar", "ACEPTAR va primero: es lo que se viene a hacer con el derecho, y queda bajo el cursor");
  eq(entradas[0].hint, "Intro", "y dice qué tecla hace lo mismo");
  eq(entradas[0].action.kind, "accept", "y acepta de verdad");
  eq(
    entradas.at(-1)?.label,
    "Cancelar",
    "CANCELAR va al final, lejos de aceptar: tirar el trabajo en curso no puede quedar a un píxel de cerrarlo",
  );
  eq(entradas.at(-1)?.action.kind, "cancel", "y cancela de verdad");
}

// ── Las palabras clave conservan su orden, su rótulo y su atajo ─────────────
{
  const entradas = cadPointerMenuEntries(lineaConDosPuntos);
  const claves = entradas.filter((e) => e.action.kind === "keyword");
  eq(claves.length, 2, "las dos palabras clave siguen ahí");
  eq(claves[0].label, "Cerrar", "en el mismo orden en que las publica el motor, que es el del aviso");
  eq(claves[1].label, "desHacer", "y la segunda después");
  eq(
    claves[0].action.kind === "keyword" ? claves[0].action.shortcut : "",
    "c",
    "cada una lleva su atajo, que es lo que se despacha al pulsarla",
  );
  eq(claves[0].hint, "C", "y lo enseña en mayúscula, como el aviso");
  eq(
    claves[0].id,
    "keyword-Cerrar",
    "el id lleva la PALABRA CLAVE, no el atajo: de él sale `cad-pointer-keyword-Cerrar`, que ya usan los goldens 46 y 56",
  );
}

// ── Una palabra clave sin rótulo se dice por su nombre ──────────────────────
{
  const [, sinRotulo] = cadPointerMenuEntries([{ keyword: "Ancho", shortcut: "a" }]);
  eq(sinRotulo.label, "Ancho", "sin `label`, el rótulo es la palabra clave");
}

// ── Ningún id se repite: dos botones con el mismo testid no se pueden pulsar ─
{
  const ids = cadPointerMenuEntries(lineaConDosPuntos).map((e) => e.id);
  ok(new Set(ids).size === ids.length, `todos los ids son distintos (${ids.join(", ")})`);
}

console.log(`✔ menú del botón derecho: ${verdes} aserciones verdes`);
