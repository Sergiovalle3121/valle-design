/**
 * EL GRABADOR DE ACCIONES.
 *
 * Lo que aquí se mide son las cuatro decisiones que hacen que un macro sirva en
 * otro plano y no sólo en el que se grabó: que un punto señalado se guarde como
 * COORDENADA y no como clic, que una orden cancelada no se grabe, que el propio
 * grabador no se grabe a sí mismo, y que lo grabado se pueda volver a leer con
 * el MISMO analizador que ejecuta los `.scr`.
 */
import { strict as assert } from "node:assert";
import { parseCadScript } from "../script-runner";
import {
  CAD_ACTION_RECORDER_IDLE,
  cadActionPointToken,
  cadActionRecorderReduce,
  cadActionRecorderStart,
  cadActionRecorderStop,
  cadActionScript,
  cadActionScriptRoundTrip,
  type CadActionEvent,
} from "./action-recorder";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const grabar = (nombre: string, eventos: readonly CadActionEvent[]) =>
  cadActionRecorderStop(eventos.reduce(cadActionRecorderReduce, cadActionRecorderStart(nombre)));

// --- 1 · parado, no graba nada -------------------------------------------
{
  const quieto = cadActionRecorderReduce(CAD_ACTION_RECORDER_IDLE, { kind: "token", value: "LINE" });
  eq(quieto, CAD_ACTION_RECORDER_IDLE, "sin arrancar, el grabador no toca nada");
}

// --- 2 · un punto señalado se guarda como COORDENADA ----------------------
{
  eq(cadActionPointToken({ x: 1_000, y: 2_000 }), "1000,2000", "el punto se teclea");
  eq(cadActionPointToken({ x: 1_000.4567, y: 2_000 }), "1000.457,2000", "con milésimas, no más");
  eq(
    cadActionPointToken({ x: 0, y: 0, z: 3_000 }),
    "0,0,3000",
    "y con la cota cuando la trae: un macro de tubería sin z sería otro macro",
  );
  eq(cadActionPointToken({ x: 5, y: 6, z: 0 }), "5,6", "la cota cero no se escribe: es ruido");
}

// --- 3 · una orden entera, tecleada y señalada ---------------------------
{
  const macro = grabar("muro tipo", [
    { kind: "command", name: "LINE" },
    { kind: "point", x: 0, y: 0 },
    { kind: "point", x: 3_000, y: 0 },
    { kind: "enter" },
  ]);
  assert.deepEqual(
    macro.lines,
    ["LINE", "0,0", "3000,0", ""],
    "la orden, sus dos puntos y el Enter como renglón EN BLANCO",
  );
  verdes += 1;
  eq(macro.commands, 1, "una orden");
  eq(macro.name, "muro tipo", "con el nombre que le puso el usuario");
}

// --- 4 · una orden CANCELADA no se graba ---------------------------------
{
  const macro = grabar("con arrepentimiento", [
    { kind: "command", name: "CIRCLE" },
    { kind: "point", x: 100, y: 100 },
    { kind: "cancel" },
    { kind: "command", name: "LINE" },
    { kind: "point", x: 0, y: 0 },
    { kind: "point", x: 1_000, y: 0 },
    { kind: "enter" },
  ]);
  assert.deepEqual(
    macro.lines,
    ["LINE", "0,0", "1000,0", ""],
    "del intento cancelado no queda nada: repetirlo veinte veces no haría nada veinte veces",
  );
  verdes += 1;
  eq(macro.commands, 1, "y no se cuenta como orden grabada");
}

// --- 5 · el grabador no se graba a sí mismo ------------------------------
{
  const macro = grabar("limpio", [
    { kind: "command", name: "LINE" },
    { kind: "point", x: 0, y: 0 },
    { kind: "point", x: 1_000, y: 0 },
    { kind: "enter" },
    { kind: "command", name: "ACTSTOP" },
  ]);
  ok(!macro.lines.includes("ACTSTOP"), `ACTSTOP no entra: ${macro.lines.join(" | ")}`);
  eq(
    macro.lines[macro.lines.length - 1],
    "",
    "pero SÍ cierra la orden anterior: si no, se llevaría por delante el último Enter",
  );
  eq(macro.commands, 1, "y la orden anterior se cuenta");
}

// --- 6 · varias órdenes seguidas se confirman una a una -------------------
{
  const macro = grabar("dos muros", [
    { kind: "command", name: "LINE" },
    { kind: "point", x: 0, y: 0 },
    { kind: "point", x: 1_000, y: 0 },
    { kind: "enter" },
    { kind: "command", name: "LINE" },
    { kind: "point", x: 0, y: 500 },
    { kind: "point", x: 1_000, y: 500 },
    { kind: "enter" },
  ]);
  eq(macro.commands, 2, "dos órdenes");
  eq(macro.lines.length, 8, "y sus ocho renglones");
}

// --- 7 · palabras clave y texto tecleado ---------------------------------
{
  const macro = grabar("capa", [
    { kind: "command", name: "-LAYER" },
    { kind: "token", value: "N" },
    { kind: "token", value: "MUROS" },
    { kind: "enter" },
  ]);
  assert.deepEqual(macro.lines, ["-LAYER", "N", "MUROS", ""], "lo tecleado se graba tal cual");
  verdes += 1;
}

// --- 8 · lo grabado se vuelve a leer con el MISMO analizador --------------
{
  const macro = grabar("ida y vuelta", [
    { kind: "command", name: "LINE" },
    { kind: "point", x: 0, y: 0 },
    { kind: "point", x: 1_000, y: 0 },
    { kind: "enter" },
  ]);
  const texto = cadActionScript(macro, new Date("2026-09-04T00:00:00Z"));
  ok(texto.startsWith("; ida y vuelta"), `la cabecera nombra el macro: ${texto.split("\n")[0]}`);
  ok(/Grabado con ACTRECORD el 2026-09-04: 1 orden/.test(texto), "y dice cuándo y cuánto");
  ok(
    /se puede leer, editar y ejecutar con SCRIPT/.test(texto),
    "y que es un script normal, no un formato opaco",
  );

  const vuelta = cadActionScriptRoundTrip(macro);
  ok(vuelta.ok, `el ejecutor lo vuelve a leer entero: ${JSON.stringify(vuelta.tokens)}`);
  assert.deepEqual(vuelta.tokens, macro.lines, "y token a token, sin perder el Enter en blanco");
  verdes += 1;

  // Y el analizador de verdad, sobre el texto con cabecera: los comentarios se
  // van y los renglones quedan.
  const leido = parseCadScript(texto).map((linea) => linea.token);
  assert.deepEqual(leido, ["LINE", "0,0", "1000,0", ""], "los comentarios no son tokens");
  verdes += 1;
}

// --- 9 · un macro vacío se puede grabar, y se nota --------------------------
{
  const macro = grabar("nada", []);
  eq(macro.lines.length, 0, "sin eventos no hay renglones");
  eq(macro.commands, 0, "ni órdenes");
  ok(
    cadActionScript(macro).includes("0 orden(es)"),
    "y el archivo lo dice en su cabecera en vez de parecer un macro bueno",
  );
}

console.log(
  `Grabador de acciones: ${verdes} comprobaciones verdes — el punto se guarda tecleado, lo cancelado no se graba, el grabador no se graba a sí mismo y lo grabado se vuelve a leer con el analizador de los .scr`,
);
