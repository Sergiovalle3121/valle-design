/**
 * EL RECORRIDO DICE LA VERDAD — comprobado contra el registro REAL.
 *
 * ─── Por qué justo aquí ────────────────────────────────────────────────────
 *
 * El recorrido guiado no describe la interfaz: le dice a alguien que acaba de
 * registrarse EXACTAMENTE qué teclear. «Teclea WA», «Teclea DIM», «Teclea
 * PLOT». Es el único sitio del producto donde una instrucción equivocada no se
 * descubre tarde: se descubre en el minuto dos, por la persona que todavía está
 * decidiendo si esto sirve.
 *
 * Y es un texto: sobrevive intacto a que alguien renombre un comando, mueva un
 * atajo o retire un bloque. El compilador no lo mira. Este gate sí.
 *
 * ─── Qué exige ─────────────────────────────────────────────────────────────
 *
 *   · Cada `command` de cada paso EXISTE en el registro real de comandos.
 *   · Cada comando que la prosa nombra entre comillas o en mayúsculas suelta
 *     también existe: un `hint` que menciona una orden inexistente es tan
 *     mentira como un `command` roto.
 *   · El paso de la puerta nombra un bloque que la biblioteca sabe fabricar.
 *   · Ningún paso promete DWG, que sigue apagado.
 *
 * No comprueba que los pasos sean BUENOS —eso lo decide quien los escribió—,
 * sino que lo que mandan hacer se pueda hacer.
 */
import assert from "node:assert/strict";
import { CAD_GUIDED_TOUR_STEPS } from "./guided-tour";
import { CAD_COMMAND_REGISTRY_V2 } from "../engine";
import { CAD_DYNAMIC_BLOCKS } from "../dynamic-blocks";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

ok(
  CAD_GUIDED_TOUR_STEPS.length === 5,
  `el recorrido son cinco pasos (hay ${CAD_GUIDED_TOUR_STEPS.length})`,
);

/* ── 1 · Lo que manda teclear, existe ─────────────────────────────────────── */

for (const step of CAD_GUIDED_TOUR_STEPS) {
  if (!step.command) continue;
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(step.command);
  ok(
    !!descriptor,
    `paso «${step.id}»: el comando «${step.command}» existe en el registro real` +
      (descriptor ? ` (${descriptor.name})` : " — NO EXISTE, y es lo primero que teclea un desconocido"),
  );
}

/* ── 2 · Y lo que nombra de pasada, también ───────────────────────────────── */

/**
 * Palabras en MAYÚSCULAS dentro de la prosa. Se filtran las que no pretenden
 * ser órdenes: unidades, siglas de formato y números.
 */
const NO_SON_COMANDOS = new Set(["PDF", "DXF", "DWG", "CAD", "MM", "M", "IA"]);

for (const step of CAD_GUIDED_TOUR_STEPS) {
  const prosa = `${step.instruction} ${step.hint}`;
  for (const palabra of prosa.match(/\b[A-Z]{1,8}\b/gu) ?? []) {
    if (NO_SON_COMANDOS.has(palabra)) continue;
    ok(
      !!CAD_COMMAND_REGISTRY_V2.get(palabra),
      `paso «${step.id}»: la prosa nombra «${palabra}» como si fuera una orden y el registro no la tiene`,
    );
  }
}

/* ── 3 · La puerta que manda colocar, la biblioteca sabe fabricarla ───────── */

{
  const puerta = CAD_GUIDED_TOUR_STEPS.find((step) => step.id === "puerta");
  ok(!!puerta, "el recorrido tiene un paso de puerta");
  const nombrada = /«([^»]+)»/u.exec(puerta!.instruction)?.[1] ?? "";
  ok(
    nombrada.length > 0,
    `el paso de la puerta nombra un bloque concreto entre comillas (dice: «${puerta!.instruction}»)`,
  );
  // El bloque se materializa con medidas en el nombre («Puerta abatible 0.90 m
  // · 90°»), así que se compara por la parte estable.
  const familia = nombrada.replace(/[\d.,]+\s*m.*$/u, "").trim().toLocaleLowerCase();
  const existe = CAD_DYNAMIC_BLOCKS.some((definition) =>
    definition.name.toLocaleLowerCase().includes(familia),
  );
  ok(
    existe,
    `la biblioteca sabe fabricar «${nombrada}» (familia «${familia}»): ` +
      `hay ${CAD_DYNAMIC_BLOCKS.length} familias dinámicas`,
  );
}

/* ── 4 · Ningún paso promete lo que está apagado ──────────────────────────── */

for (const step of CAD_GUIDED_TOUR_STEPS) {
  const completo = `${step.title} ${step.instruction} ${step.hint}`;
  ok(
    !/\bDWG\b/u.test(completo),
    `paso «${step.id}»: no promete DWG, que sigue apagado para el lanzamiento`,
  );
}

/* ── 5 · Y cada paso dice qué hacer, no qué mirar ─────────────────────────── */

for (const step of CAD_GUIDED_TOUR_STEPS) {
  ok(
    step.instruction.trim().length > 40 && step.hint.trim().length > 20,
    `paso «${step.id}»: trae instrucción y pista de verdad, no un titular suelto`,
  );
}

console.log(
  `recorrido guiado (exactitud): ${checks} comprobaciones · ${CAD_GUIDED_TOUR_STEPS.length} pasos verificados contra el registro real`,
);
