/**
 * La propiedad que se defiende: un evento a medias (campo faltante, JSON
 * roto, tipo que no casa con `event:`) se RECHAZA con null, nunca se
 * "aproxima" a una forma parecida. Un roster incompleto es peor que ninguno.
 */
import assert from "node:assert/strict";
import { parseCallWireEvent } from "./call-signaling-wire";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ── roster válido ────────────────────────────────────────────────────────
const roster = parseCallWireEvent(
  "roster",
  JSON.stringify({
    participants: [
      { id: "p1", userId: "u1", name: "Ana", joinedAt: "2026-08-31T00:00:00.000Z" },
    ],
  }),
);
ok(roster?.type === "roster", "un roster bien formado se acepta");

// ── signal válido ────────────────────────────────────────────────────────
const signal = parseCallWireEvent(
  "signal",
  JSON.stringify({
    signal: {
      id: "s1",
      fromParticipantId: "p1",
      kind: "offer",
      payload: { sdp: "v=0..." },
      queuedAt: "2026-08-31T00:00:00.000Z",
    },
  }),
);
ok(signal?.type === "signal", "una señal bien formada se acepta");

// ── ping válido ──────────────────────────────────────────────────────────
const ping = parseCallWireEvent("ping", JSON.stringify({ at: "2026-08-31T00:00:00.000Z" }));
ok(ping?.type === "ping", "un ping bien formado se acepta");

// ── rechazos ─────────────────────────────────────────────────────────────
ok(parseCallWireEvent("roster", "no es json") === null, "JSON roto se rechaza");
ok(
  parseCallWireEvent("roster", JSON.stringify({ participants: [{ id: "p1" }] })) === null,
  "un participante sin userId/name/joinedAt se rechaza — TODO el roster, no sólo la entrada mala",
);
ok(
  parseCallWireEvent(
    "signal",
    JSON.stringify({
      signal: { id: "s1", fromParticipantId: "p1", kind: "no-existe", payload: {}, queuedAt: "x" },
    }),
  ) === null,
  "un kind fuera del catálogo se rechaza",
);
ok(
  parseCallWireEvent("signal", JSON.stringify({ signal: { id: "s1" } })) === null,
  "una señal a medias se rechaza",
);
ok(
  parseCallWireEvent("ping", JSON.stringify({})) === null,
  "un ping sin 'at' se rechaza",
);
ok(
  parseCallWireEvent("desconocido", JSON.stringify({ foo: "bar" })) === null,
  "un event: que no es roster/signal/ping se rechaza",
);
ok(
  parseCallWireEvent("roster", JSON.stringify({ signal: {} })) === null,
  "el cuerpo de un tipo NO se cuela como si fuera de otro — roster sin 'participants' se rechaza",
);

console.log(`ok call-signaling-wire: ${checks} comprobaciones`);
