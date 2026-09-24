/**
 * EL RECORRIDO DICE LA VERDAD — comprobado contra el registro REAL.
 *
 * ─── Por qué justo aquí ────────────────────────────────────────────────────
 *
 * El recorrido guiado no describe la interfaz: le dice a alguien que acaba de
 * registrarse EXACTAMENTE qué hacer. «Teclea WA», «pulsa Puerta», «Teclea
 * DIM». Es el único sitio del producto donde una instrucción equivocada no se
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
 *   · El paso de la puerta nombra el botón visible de Esencial y su orden.
 *   · Ningún paso promete DWG, que sigue apagado.
 *
 * No comprueba que los pasos sean BUENOS —eso lo decide quien los escribió—,
 * sino que lo que mandan hacer se pueda hacer.
 */
import assert from "node:assert/strict";
import { CAD_ESSENTIAL_TOOLS } from "@/components/cad/essential/essential-tools";
import { CAD_GUIDED_TOUR_STEPS } from "./guided-tour";
import { CAD_COMMAND_REGISTRY_V2 } from "../engine";

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

/* ── 3 · La puerta que manda colocar usa el botón visible ────────────────── */

{
  const puerta = CAD_GUIDED_TOUR_STEPS.find((step) => step.id === "puerta");
  const boton = CAD_ESSENTIAL_TOOLS.find((tool) => tool.id === "door");
  ok(!!puerta, "el recorrido tiene un paso de puerta");
  ok(
    boton?.label === "Puerta" &&
      "command" in boton.run &&
      boton.run.command === puerta?.command,
    "el paso usa la orden que despacha el botón visible Puerta de Esencial",
  );
  ok(
    puerta!.instruction.includes("botón «Puerta»") &&
      /haz clic sobre un muro/u.test(puerta!.instruction),
    "la instrucción señala el botón visible y el muro, sin buscar una paleta",
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
