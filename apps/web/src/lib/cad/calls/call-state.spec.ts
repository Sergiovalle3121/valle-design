/**
 * La propiedad que se defiende aquí: la FASE siempre es una lectura fiel del
 * mapa de enlaces, nunca un booleano que alguien olvidó actualizar. Y que un
 * evento contra un participante que ya no está en la sala es un no-op, no un
 * fantasma que reaparece en el roster.
 */
import assert from "node:assert/strict";
import {
  INACTIVE_CALL_STATE,
  reduceCallState,
  type CallEvent,
  type CallState,
} from "./call-state";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const SELF = { participantId: "self-1", userId: "u1", name: "Arq. Uno" };
const OTHER = { participantId: "peer-1", userId: "u2", name: "Arq. Dos" };
const THIRD = { participantId: "peer-2", userId: "u3", name: "Arq. Tres" };
const ICE = [{ urls: ["stun:stun.l.google.com:19302"] }];

function joinedEvent(roster = [SELF]): CallEvent {
  return {
    type: "joined",
    roomId: "room-1",
    participantId: SELF.participantId,
    self: SELF,
    roster,
    iceServers: ICE,
    turnConfigured: false,
  };
}

// ── inactiva → llamando ─────────────────────────────────────────────────────
const alone = reduceCallState(INACTIVE_CALL_STATE, joinedEvent());
ok(alone.phase === "llamando", "joined a solas → llamando, sin enlaces");
ok(
  "peers" in alone && Object.keys(alone.peers).length === 0,
  "sin nadie más en el roster no hay enlaces que negociar",
);

// ── inactiva → conectando con alguien ya en la sala ─────────────────────────
const withOther = reduceCallState(INACTIVE_CALL_STATE, joinedEvent([SELF, OTHER]));
ok(withOther.phase === "conectando", "joined con otro ya en el roster → conectando");
ok(
  "peers" in withOther &&
    withOther.peers[OTHER.participantId]?.status === "negotiating",
  "el enlace nuevo arranca en negotiating",
);

// joined es un no-op si ya hay una llamada activa
const reJoined = reduceCallState(withOther, joinedEvent([SELF, THIRD]));
ok(reJoined === withOther, "joined no reemplaza una llamada ya activa");

// ── conectando → en-curso ────────────────────────────────────────────────────
const connected = reduceCallState(withOther, {
  type: "peer-connected",
  participantId: OTHER.participantId,
});
ok(connected.phase === "en-curso", "un enlace connected sube la fase a en-curso");

// un tercero que sigue negociando no baja la fase mientras OTHER siga conectado
const withThird = reduceCallState(
  reduceCallState(INACTIVE_CALL_STATE, joinedEvent([SELF, OTHER, THIRD])),
  { type: "peer-connected", participantId: OTHER.participantId },
);
ok(
  withThird.phase === "en-curso" &&
    "peers" in withThird &&
    withThird.peers[THIRD.participantId]?.status === "negotiating",
  "un enlace en-curso sostiene la fase aunque otro siga negociando",
);

// ── en-curso → conectando cuando el único enlace falla ──────────────────────
const failed = reduceCallState(connected, {
  type: "peer-failed",
  participantId: OTHER.participantId,
});
ok(failed.phase === "conectando", "si el único enlace falla, la fase baja");
ok(
  "peers" in failed && failed.peers[OTHER.participantId]?.status === "failed",
  "el enlace queda marcado failed, no desaparece",
);

// ── roster-updated reconcilia altas y bajas ─────────────────────────────────
const afterRosterChange = reduceCallState(withOther, {
  type: "roster-updated",
  roster: [SELF, THIRD],
});
ok(
  "peers" in afterRosterChange &&
    Object.keys(afterRosterChange.peers).join(",") === THIRD.participantId,
  "roster-updated agrega al que llega y quita al que se fue",
);

// roster-updated CONSERVA el estado de un enlace que ya estaba connected
const preserved = reduceCallState(connected, {
  type: "roster-updated",
  roster: [SELF, OTHER, THIRD],
});
ok(
  "peers" in preserved &&
    preserved.peers[OTHER.participantId]?.status === "connected" &&
    preserved.peers[THIRD.participantId]?.status === "negotiating",
  "roster-updated no reinicia un enlace que ya estaba connected",
);

// ── colgar ───────────────────────────────────────────────────────────────────
const hungUp = reduceCallState(connected, { type: "hangup", reason: "local" });
ok(
  hungUp.phase === "colgada" && "reason" in hungUp && hungUp.reason === "local",
  "hangup cuelga con el motivo dado, desde cualquier estado activo",
);
const hungAgain = reduceCallState(hungUp, {
  type: "hangup",
  reason: "ice-failed",
});
ok(hungAgain === hungUp, "colgar una llamada ya colgada es idempotente");

// ── reset sólo desde colgada ─────────────────────────────────────────────────
ok(
  reduceCallState(connected, { type: "reset" }) === connected,
  "reset no hace nada mientras la llamada sigue activa",
);
ok(
  reduceCallState(hungUp, { type: "reset" }) === INACTIVE_CALL_STATE,
  "reset vuelve a inactiva sólo desde colgada",
);

// ── eventos contra un participante fantasma o en estados terminales ────────
const ghostEvent: CallEvent = {
  type: "peer-connected",
  participantId: "fantasma",
};
ok(
  reduceCallState(withOther, ghostEvent) === withOther,
  "un evento contra un participante que no está en la sala es un no-op",
);
ok(
  reduceCallState(INACTIVE_CALL_STATE, ghostEvent) === INACTIVE_CALL_STATE,
  "eventos de par se ignoran en inactiva",
);
const colgada: CallState = { phase: "colgada", reason: "local" };
ok(
  reduceCallState(colgada, ghostEvent) === colgada,
  "eventos de par se ignoran en colgada",
);

console.log(`ok call-state: ${checks} comprobaciones`);
