/**
 * `point-modifiers.ts` — la aritmética pura de DESDE, M2P y TT (T-22). Lo que
 * NO se prueba aquí, a propósito, es la sub-captura completa: eso vive en
 * `command-engine-host.ts`, fuera del territorio de F3 (ver la petición
 * P-03 en `docs/execution/frentes/F3-peticiones.md`).
 */
import { strict as assert } from "node:assert";
import {
  CAD_POINT_MODIFIER_TOKENS,
  cadPointModifierAddPoint,
  cadPointModifierPrompt,
  cadPointModifierStart,
} from "./point-modifiers";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// --- reconocimiento de los cuatro tokens, con sus sinónimos -------------------
ok(CAD_POINT_MODIFIER_TOKENS.DESDE === "from", "DESDE reconoce `from`");
ok(CAD_POINT_MODIFIER_TOKENS.FROM === "from", "FROM también (memoria muscular en inglés)");
ok(CAD_POINT_MODIFIER_TOKENS.M2P === "m2p", "M2P reconoce `m2p`");
ok(CAD_POINT_MODIFIER_TOKENS.MTP === "m2p", "MTP (Mid Two Points) es el mismo modificador");
ok(CAD_POINT_MODIFIER_TOKENS.TT === "tt", "TT reconoce `tt`");
ok(CAD_POINT_MODIFIER_TOKENS.PAR === "par", "PAR se reconoce como token (su resolución de ángulo queda pendiente)");

// --- DESDE: un solo punto, y ES el ancla --------------------------------------
{
  const session = cadPointModifierStart("from");
  const outcome = cadPointModifierAddPoint(session, { x: 1_000, y: 2_000 });
  ok(outcome.done, "un punto basta para DESDE");
  if (outcome.done) assert.deepEqual(outcome.point, { x: 1_000, y: 2_000 });
  checks += 1;
}

// --- TT: igual que DESDE, un solo punto ---------------------------------------
{
  const session = cadPointModifierStart("tt");
  const outcome = cadPointModifierAddPoint(session, { x: 500, y: 500 });
  ok(outcome.done, "un punto basta para TT");
  if (outcome.done) assert.deepEqual(outcome.point, { x: 500, y: 500 });
  checks += 1;
}

// --- M2P: dos puntos, y el resultado es SU MEDIO, no el segundo ---------------
{
  let session = cadPointModifierStart("m2p");
  const first = cadPointModifierAddPoint(session, { x: 0, y: 0 });
  ok(!first.done, "el primer punto de M2P no resuelve nada todavía");
  if (first.done) throw new Error("no debería resolver con un solo punto");
  session = first.session;
  const second = cadPointModifierAddPoint(session, { x: 200, y: 100 });
  ok(second.done, "el segundo punto sí resuelve M2P");
  if (second.done) assert.deepEqual(second.point, { x: 100, y: 50 }, "el medio, no el segundo punto");
  checks += 1;
}

// --- el prompt sube de «primer punto» a «segundo punto» en M2P ----------------
{
  const session = cadPointModifierStart("m2p");
  ok(cadPointModifierPrompt(session).includes("primer"), "de entrada, pide el primero");
  const afterFirst = cadPointModifierAddPoint(session, { x: 0, y: 0 });
  if (afterFirst.done) throw new Error("m2p no debería resolver con un punto");
  ok(cadPointModifierPrompt(afterFirst.session).includes("segundo"), "tras el primero, pide el segundo");
  checks += 1;
}

console.log(`point-modifiers: ${checks} aserciones — DESDE/M2P/TT, la mitad pura de T-22`);
