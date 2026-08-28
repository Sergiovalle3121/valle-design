/**
 * EL PANEL DE ATAJOS DICE LA VERDAD — comprobado contra el registro real.
 *
 * ─── El defecto ────────────────────────────────────────────────────────────
 *
 * El panel «Atajos y ayuda (?)» anunciaba **«L — Conectar flujo»**. En el
 * registro real, `L` es LINE —trazar muros encadenados— y el conector es
 * `Shift+L`, que el panel no mencionaba. Alguien en su primera hora pulsaba L
 * para unir dos objetos y le salía un muro; y al no encontrar el conector por
 * ninguna parte, concluía que no existe.
 *
 * Se callaba además veinte atajos que sí existen: Ctrl+S, la paleta Ctrl+K, el
 * offset, el círculo, el rectángulo, la polilínea y las siete teclas de función
 * que un dibujante que viene de AutoCAD usa sin mirar el teclado.
 *
 * ─── Por qué se cuela ──────────────────────────────────────────────────────
 *
 * Porque es una tabla de texto. No compila, no se rompe, y sobrevive intacta a
 * que alguien reasigne una tecla. El compilador no la mira. Este gate sí.
 *
 * ─── Las dos direcciones ───────────────────────────────────────────────────
 *
 *   1. LO QUE SE ANUNCIA, EXISTE Y HACE ESO. Cada fila cuya tecla esté en el
 *      registro tiene que describir la MISMA acción.
 *   2. LO QUE EXISTE, SE ANUNCIA. Un atajo real que el panel calla es una
 *      función que el usuario no encontrará nunca. Los que se omiten a
 *      propósito se declaran con su razón.
 */
import assert from "node:assert/strict";
import { HELP_SECTIONS } from "./editor-presentation";
import { CAD_KEYBOARD_SHORTCUTS } from "@/lib/cad/keyboard-shortcuts";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** `Ctrl+Shift+K` para un atajo del registro; en minúsculas para comparar. */
function combo(shortcut: (typeof CAD_KEYBOARD_SHORTCUTS)[number]): string {
  return `${shortcut.ctrl ? "ctrl+" : ""}${shortcut.shift ? "shift+" : ""}${shortcut.key}`.toLowerCase();
}

/**
 * Normaliza lo que escribe el panel para poder compararlo: `Ctrl/⌘+K` y
 * `Ctrl+K` son la misma tecla dicha para dos teclados.
 */
function normaliza(fila: string): string {
  return fila
    .toLowerCase()
    .replace(/⌘|cmd|command/gu, "ctrl")
    .replace(/ctrl\/ctrl/gu, "ctrl")
    .replace(/⇧/gu, "shift")
    .replace(/\s+/gu, "");
}

/**
 * Palabras que identifican la ACCIÓN de cada atajo del registro. Se comparan
 * contra lo que el panel promete: no se exige la misma frase —el panel escribe
 * mejor español que el registro—, se exige que hablen de lo mismo.
 */
const ACCION: Record<string, RegExp> = {
  "ctrl+k": /paleta|comandos/u,
  v: /seleccion/u,
  m: /medir|medici/u,
  l: /l[íi]nea|trazar|muro/u,
  p: /polil[íi]nea/u,
  b: /rect[áa]ngulo/u,
  c: /c[íi]rculo/u,
  "shift+o": /desfas|offset/u,
  a: /pasillo|holgura/u,
  "shift+l": /unir|conect|polil[íi]nea/u,
  z: /[áa]rea|zona/u,
  i: /biblioteca|s[íi]mbolo|bloque/u,
  t: /nota|texto/u,
  f: /ajustar|encuadr|enfoc/u,
  "ctrl+z": /deshacer/u,
  "ctrl+shift+z": /rehacer/u,
  "ctrl+s": /guardar/u,
  "ctrl+y": /rehacer/u,
  escape: /deseleccionar|salir|cerrar|cancelar/u,
  g: /grilla|rejilla/u,
  o: /snap/u,
  f3: /snap|objeto/u,
  f7: /grilla|rejilla/u,
  f9: /rejilla|forzar/u,
  f12: /din[áa]mica|cursor/u,
  f8: /ortho|ortogonal/u,
  f10: /polar/u,
  f11: /osnap|rastre/u,
  "shift+v": /revisi[óo]n|valid/u,
  e: /dxf|exportar/u,
  r: /rotar/u,
  s: /escalar/u,
  x: /espejo/u,
};

/**
 * Atajos del registro que el panel NO anuncia, con su razón. Un duplicado
 * (`Ctrl+Y` es otro nombre de Rehacer) no necesita fila propia.
 */
const NO_SE_ANUNCIAN: Record<string, string> = {
  "ctrl+y": "es el segundo nombre de Rehacer, ya anunciado como Ctrl/⌘+Z / ⇧+Z",
  escape: "se anuncia en la sección «Selección» como «Esc», sin combinación",
};

const filas = HELP_SECTIONS.flatMap((seccion) =>
  seccion.rows.map(([tecla, texto]) => ({ seccion: seccion.title, tecla, texto })),
);
ok(filas.length > 25, `el panel anuncia ${filas.length} filas`);
ok(
  CAD_KEYBOARD_SHORTCUTS.length > 25,
  `el registro tiene ${CAD_KEYBOARD_SHORTCUTS.length} atajos`,
);

/* ── 1 · Lo que se anuncia hace lo que dice ───────────────────────────────── */

const porCombo = new Map(
  CAD_KEYBOARD_SHORTCUTS.map((shortcut) => [combo(shortcut), shortcut]),
);

for (const fila of filas) {
  const clave = normaliza(fila.tecla);
  const real = porCombo.get(clave);
  if (!real) continue; // Teclas que atiende el editor (W, ?, \\, flechas, Supr).
  const esperado = ACCION[clave];
  ok(
    !!esperado,
    `el gate sabe qué hace «${fila.tecla}» (falta su patrón en ACCION)`,
  );
  ok(
    esperado.test(fila.texto.toLowerCase()),
    `«${fila.tecla}» se anuncia como «${fila.texto}» y en el registro es «${real.label} · ${real.description}»`,
  );
}

/* ── 2 · Lo que existe se anuncia ─────────────────────────────────────────── */

const anunciados = new Set(filas.map((fila) => normaliza(fila.tecla)));
const callados: string[] = [];
for (const shortcut of CAD_KEYBOARD_SHORTCUTS) {
  const clave = combo(shortcut);
  if (anunciados.has(clave)) continue;
  if (clave in NO_SE_ANUNCIAN) continue;
  callados.push(`${clave} (${shortcut.label}: ${shortcut.description})`);
}
if (callados.length > 0)
  console.error(`Atajos reales que el panel calla:\n  - ${callados.join("\n  - ")}`);
assert.equal(
  callados.length,
  0,
  `${callados.length} atajo(s) existen y el panel no los anuncia: son funciones que el ` +
    "usuario no encontrará nunca. O se anuncian, o se declaran en NO_SE_ANUNCIAN con su razón.",
);
checks += 1;

/* ── 3 · Y las declaraciones no sobreviven a lo que declaran ──────────────── */

for (const clave of Object.keys(NO_SE_ANUNCIAN))
  ok(
    porCombo.has(clave),
    `«${clave}» está declarado como no anunciado pero ya no existe en el registro: retira la declaración`,
  );

console.log(
  `panel de atajos: ${checks} comprobaciones · ${filas.length} filas contrastadas contra ${CAD_KEYBOARD_SHORTCUTS.length} atajos reales`,
);
