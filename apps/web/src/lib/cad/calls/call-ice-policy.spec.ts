/**
 * La propiedad que se defiende: un blip de red (disconnected) no dispara
 * ningún reintento hasta pasar el margen de gracia, y un failed SIN TURN se
 * rinde de inmediato — sin gastar un solo reinicio ICE en algo que un
 * reinicio no puede arreglar.
 */
import assert from "node:assert/strict";
import {
  ICE_DISCONNECT_GRACE_MS,
  ICE_MAX_RESTARTS,
  applyIceStateChange,
  decideIceAction,
  iceGiveUpReason,
  initialPeerIceState,
} from "./call-ice-policy";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ── connected/completed siempre esperan ─────────────────────────────────────
const connected = applyIceStateChange(initialPeerIceState(0), "connected", 100);
ok(decideIceAction(connected, true, 100) === "wait", "connected → wait");
ok(decideIceAction(connected, false, 100) === "wait", "connected → wait sin TURN también");

// ── disconnected: espera el margen de gracia antes de reintentar ───────────
const disconnected = applyIceStateChange(initialPeerIceState(0), "disconnected", 1_000);
ok(
  decideIceAction(disconnected, true, 1_000 + ICE_DISCONNECT_GRACE_MS - 1) === "wait",
  "disconnected reciente no dispara nada — puede autorepararse",
);
ok(
  decideIceAction(disconnected, true, 1_000 + ICE_DISCONNECT_GRACE_MS) ===
    "restart-ice",
  "disconnected que supera el margen de gracia sí reintenta",
);

// ── failed sin TURN: rendirse YA, sin gastar un reinicio ────────────────────
const failedNoTurn = applyIceStateChange(initialPeerIceState(0), "failed", 1_000);
ok(
  decideIceAction(failedNoTurn, false, 1_000) === "give-up",
  "failed sin TURN se rinde de inmediato, sin esperar ni reintentar",
);
ok(
  iceGiveUpReason(false) === "ice-failed-no-turn",
  "el motivo declarado es explícitamente la falta de TURN",
);

// ── failed con TURN: reintenta hasta el tope, luego se rinde ────────────────
let withTurn = applyIceStateChange(initialPeerIceState(0), "failed", 1_000);
for (let attempt = 0; attempt < ICE_MAX_RESTARTS; attempt += 1) {
  ok(
    decideIceAction(withTurn, true, 1_000) === "restart-ice",
    `intento ${attempt + 1}: con TURN y cupo, reinicia`,
  );
  withTurn = applyIceStateChange(withTurn, "failed", 1_000, true);
}
ok(
  decideIceAction(withTurn, true, 1_000) === "give-up",
  "agotados los reinicios, se rinde aunque haya TURN",
);
ok(
  iceGiveUpReason(true) === "ice-failed",
  "con TURN el motivo NO acusa la falta de TURN — el problema es otro",
);

// ── un reinicio exitoso pone el contador en cero ────────────────────────────
const recovered = applyIceStateChange(withTurn, "connected", 2_000, true);
ok(recovered.restartAttempts === 0, "connected reinicia el contador de reintentos");

console.log(`ok call-ice-policy: ${checks} comprobaciones`);
